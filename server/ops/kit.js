// © 2026 Gen Labs — All rights reserved.
// Gói 0.3.0-A (DB-GK-0.1 §4.7/§4.8/§6/§13, STANDARD-KIT-v1 §5–§6): hợp đồng dữ liệu kho Gen Kit — phần ghi.
// Phạm vi gói A (xem ghi chú đầu migrations/0006_kit_library.sql): nạp danh mục 457 ô, gắn ô vào tài sản, ghi kết quả
// kiểm máy + đếm lần trả về tự động (≤2, lần 3 chờ Ryan), đề xuất quyết định, miễn tiêu chí, chứng nhận ô, dọn nhật ký
// lượt tải. KHÔNG có ở gói A: submission.approve/reject/reopen (chờ pipeline Muse đầy đủ), tool MCP, nhập catalog.
// Gói 0.3.0-B (SPEC-GK-0.1 Muse: list/claim/get_input/submit/upload_chunk/report_blocked; migrations/0008_kit_mcp.sql):
// thêm `kit.claim`/`kit.report_blocked` (khoá/nhả ô theo agent, hết hạn 2 h — cột trên `kit_slots`), `upload.start`/
// `upload.chunk`/`upload.finish` (phiên tải chunk 1 MB tới 50 MB, tệp tạm ngoài media/), `submission.submit` (tạo
// asset + asset_submission từ nội dung Muse nộp — thay cho `asset.put` lõi vì cần magic bytes mở rộng của Bộ Neo
// và không cần quyền 'compose'). Tool MCP tiêu thụ các op này ở server/mcp-tools/kit.js.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const magic = require('../checks/magic.js');

const KIT_SLOTS_FILE = path.join(__dirname, '..', '..', 'seed', 'kit-slots.json');
const SLOT_RE = /^[a-z]+(\.[a-z0-9-]+){1,3}$/;
const CLAIM_MS = 2 * 3600e3;
const MAX_CHUNK_BYTES = 1024 * 1024;
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
// Mở rộng từ EXT của write.js (ASSET_KINDS không có 'font' riêng — font/lottie dùng kind 'manifest', quyết định tự chọn gói B).
const KIT_EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/svg+xml': 'svg',
  'audio/wav': 'wav', 'audio/mpeg': 'mp3', 'audio/ogg': 'ogg', 'video/mp4': 'mp4', 'video/webm': 'webm',
  'font/woff2': 'woff2', 'font/woff': 'woff', 'font/ttf': 'ttf', 'font/otf': 'otf', 'application/json': 'json' };
const KIT_KIND = { 'image/png': 'image', 'image/jpeg': 'image', 'image/webp': 'image', 'image/svg+xml': 'svg',
  'audio/wav': 'audio', 'audio/mpeg': 'audio', 'audio/ogg': 'audio', 'video/mp4': 'video', 'video/webm': 'video',
  'font/woff2': 'manifest', 'font/woff': 'manifest', 'font/ttf': 'manifest', 'font/otf': 'manifest', 'application/json': 'manifest' };
const KIT_SCOPES = ['assets.submit', 'assets.review'];

// assets.subject suy ra từ tiền tố kit_slot (DB-GK-0.1 §4.1): nhi./vy./ryan.* và audio.voice.<x>
function deriveSubject(code) {
  const m = /^(nhi|vy|ryan)\./.exec(code);
  if (m) return m[1];
  if (code === 'audio.voice.nhi') return 'nhi';
  if (code === 'audio.voice.vy') return 'vy';
  if (code === 'audio.voice.ryan') return 'ryan';
  return null;
}

function register(op, ctx) {
  const { db, ws, err, byRef, need, allow, isOwner, agentHas, around } = ctx;
  if (!db || !around) return; // test dựng ctx rỗng để kiểm nạp module

  // ---- Quyền mới: assets.submit (Muse nộp) · assets.review (Gen kiểm) — DB-GK-0.1 §6 ----
  allow.assetsSubmit = (a) => agentHas(a, 'assets.submit');
  allow.review = (a) => a.type === 'system' || agentHas(a, 'assets.review');

  // agent.create (lõi) chỉ nhận scope read/compose/run (write.js); bọc để nhận thêm hai scope Gen Kit mà không sửa lõi.
  around('agent.create', (prev) => (c) => {
    const given = Array.isArray(c.p.scopes) ? c.p.scopes : [];
    const kitScopes = given.filter((s) => KIT_SCOPES.includes(s));
    if (!kitScopes.length) return prev(c);
    const coreScopes = given.filter((s) => !KIT_SCOPES.includes(s));
    const r = prev({ ...c, p: { ...c.p, scopes: coreScopes.length ? coreScopes : ['read'] } });
    const finalScopes = [...(coreScopes.length ? coreScopes : ['read']), ...kitScopes];
    db.update('agents', r.result.agent.id, { scopes: finalScopes });
    const agent = byRef('agents', r.result.agent.id);
    return { ...r, result: { ...r.result, agent }, after: { ...r.after, scopes: finalScopes } };
  });

  // ---- kit.sync — nạp/đồng bộ danh mục 457 ô từ seed/kit-slots.json (STANDARD-KIT-v1 §2.1/§13) ----
  op('kit.sync', 'ownerOrCli', (c) => {
    let data;
    try { data = JSON.parse(fs.readFileSync(KIT_SLOTS_FILE, 'utf8')); }
    catch (e) { throw err('invalid', 'Không đọc được seed/kit-slots.json (chạy `node seed/kit-slots.js` để sinh lại).', { error: String((e && e.message) || e) }); }
    const slots = Array.isArray(data.slots) ? data.slots : [];
    if (slots.length !== 457) throw err('invalid', `Tổng ô trong seed = ${slots.length}, STANDARD-KIT-v1 §1 đòi 457.`, { count: slots.length });
    const seen = new Set();
    for (const s of slots) {
      if (!s || typeof s.code !== 'string') throw err('invalid', 'Một ô trong seed thiếu code.', null);
      if (seen.has(s.code)) throw err('invalid', `Mã ô trùng trong seed: ${s.code}`, { code: s.code });
      seen.add(s.code);
      if (!SLOT_RE.test(s.code)) throw err('invalid', `Mã ô sai ngữ pháp §2.1: ${s.code}`, { code: s.code });
      if (!s.title_vi || !s.title_en) throw err('invalid', `Ô ${s.code} thiếu title_vi hoặc title_en.`, { code: s.code });
    }
    const existing = db.all('SELECT code FROM kit_slots WHERE workspace_id=?', ws());
    const missing = existing.filter((r) => !seen.has(r.code));
    if (missing.length) {
      throw err('invalid', `${missing.length} ô có trong DB nhưng vắng trong seed (mã ô không tự retire — STANDARD-KIT-v1 §6): ${missing.slice(0, 5).map((m) => m.code).join(', ')}${missing.length > 5 ? '…' : ''}`,
        { missing: missing.map((m) => m.code) });
    }
    let created = 0, updated = 0;
    for (const s of slots) {
      const row = db.get('SELECT * FROM kit_slots WHERE workspace_id=? AND code=?', ws(), s.code);
      if (!row) {
        db.run('INSERT INTO kit_slots(code, workspace_id, group_code, title_vi, title_en, spec, added_in) VALUES(?,?,?,?,?,?,?)',
          s.code, ws(), s.group_code, s.title_vi, s.title_en, s.spec ? JSON.stringify(s.spec) : null, s.added_in || 'v1');
        created++;
      } else if (row.title_vi !== s.title_vi || row.title_en !== s.title_en) {
        db.run('UPDATE kit_slots SET title_vi=?, title_en=? WHERE code=? AND workspace_id=?', s.title_vi, s.title_en, s.code, ws());
        updated++;
      }
    }
    const total = db.get('SELECT COUNT(*) AS n FROM kit_slots WHERE workspace_id=? AND retired_in IS NULL', ws()).n;
    return { result: { created, updated, total }, entity: ['kit_slots', 'ALL'], before: null, after: { created, updated, total } };
  });

  // ---- slot.assign — gắn/gỡ ô Bộ Neo cho một tài sản (owner; agent compose chỉ gắn ô vào PHIẾU MR — ngoài gói A) ----
  op('slot.assign', 'owner', (c) => {
    const p = c.p;
    const asset = need('assets', p.asset, 'tài sản');
    if (p.kit_slot === null || p.kit_slot === undefined) {
      db.update('assets', asset.id, { kit_slot: null });
      return { result: byRef('assets', asset.id), entity: ['asset', asset.display_id], before: { kit_slot: asset.kit_slot }, after: { kit_slot: null } };
    }
    const slot = db.get('SELECT * FROM kit_slots WHERE workspace_id=? AND code=?', ws(), p.kit_slot);
    if (!slot) throw err('not_found', `Không tìm thấy ô "${p.kit_slot}".`, { kit_slot: p.kit_slot });
    if (slot.retired_in) throw err('invalid', `Ô "${p.kit_slot}" đã retired (${slot.retired_in}).`, { kit_slot: p.kit_slot });
    const subject = deriveSubject(slot.code);
    db.update('assets', asset.id, { kit_slot: slot.code, subject: subject !== null ? subject : asset.subject });
    return { result: byRef('assets', asset.id), entity: ['asset', asset.display_id], before: { kit_slot: asset.kit_slot, subject: asset.subject }, after: { kit_slot: slot.code, subject } };
  });

  // ---- submission.record_checks — ghi một lần kiểm (run_id) vào asset_checks; idempotent theo (run_id, tệp, tiêu chí) ----
  const target = (p) => {
    if (p.submission && p.asset) throw err('invalid', 'Chỉ gửi một trong hai: submission hoặc asset.', null);
    if (p.submission) return { kind: 'submission', row: need('asset_submissions', p.submission, 'lần nộp') };
    if (p.asset) return { kind: 'asset', row: need('assets', p.asset, 'tài sản') };
    throw err('invalid', 'Cần submission hoặc asset.', null);
  };
  const recomputeChecksLevel = (subId) => {
    const rows = db.all('SELECT criterion, level FROM asset_checks WHERE submission_id=? ORDER BY created_at', subId);
    const latest = new Map();
    for (const r of rows) latest.set(r.criterion, r.level); // chỉ thêm theo thời gian ⇒ cuối cùng = hiện hành
    const levels = [...latest.values()];
    const checksLevel = levels.some((l) => l === 'fail') ? 'fail' : levels.some((l) => l === 'warn') ? 'warn' : levels.length ? 'ok' : null;
    db.update('asset_submissions', subId, { checks_level: checksLevel });
    return checksLevel;
  };
  op('submission.record_checks', 'review', (c) => {
    const p = c.p;
    if (!nonEmptyStr(p.run_id)) throw err('invalid', 'Cần run_id.', null);
    if (!Array.isArray(p.results) || !p.results.length) throw err('invalid', 'Cần results (mảng).', null);
    const t = target(p);
    if (t.kind === 'submission' && t.row.state !== 'submitted') throw err('conflict', `Lần nộp ${t.row.display_id} đang ở "${t.row.state}", không ghi kiểm được.`, { state: t.row.state });
    const checker = c.a.type === 'agent' ? 'gen' : 'system';
    const written = [];
    for (const r of p.results || []) {
      if (!r || !nonEmptyStr(r.criterion)) throw err('invalid', 'Mỗi kết quả cần criterion.', null);
      if (!['ok', 'warn', 'fail'].includes(r.level)) throw err('invalid', `level phải là ok/warn/fail (không ghi "waived" qua op này — dùng check.waive).`, { criterion: r.criterion, level: r.level });
      const dup = db.get(`SELECT id FROM asset_checks WHERE run_id=? AND criterion=? AND ${t.kind === 'submission' ? 'submission_id=?' : 'asset_id=?'} AND level=?`,
        p.run_id, r.criterion, t.row.id, r.level);
      if (dup) { written.push(dup.id); continue; } // idempotent
      const row = db.insertRow('asset_checks', {
        run_id: p.run_id, submission_id: t.kind === 'submission' ? t.row.id : null, asset_id: t.kind === 'asset' ? t.row.id : null,
        criterion: r.criterion, kit_ver: r.kit_ver || 'KIT-v1', level: r.level, measured: r.measured || null, detail: r.detail || null,
        checker, checker_ref: c.a.type === 'agent' ? c.a.id : (r.checker_ref || 'system'), created_by: c.by,
      });
      written.push(row.id);
    }
    const checksLevel = t.kind === 'submission' ? recomputeChecksLevel(t.row.id) : null;
    return { result: { written: written.length, checks_level: checksLevel }, entity: [t.kind === 'submission' ? 'asset_submission' : 'asset', t.row.display_id],
      before: null, after: { run_id: p.run_id, results: p.results.length, checks_level: checksLevel } };
  });

  // ---- submission.auto_rework — Gen tự trả về làm lại khi còn tiêu chí M fail chưa miễn; lần 3 liên tiếp ⇒ chờ Ryan ----
  op('submission.auto_rework', 'review', (c) => {
    const p = c.p;
    const sub = need('asset_submissions', p.submission, 'lần nộp');
    if (sub.state !== 'submitted') throw err('conflict', `Lần nộp ${sub.display_id} đang ở "${sub.state}", không trả về làm lại được.`, { state: sub.state });
    const rows = db.all('SELECT criterion, level, detail FROM asset_checks WHERE submission_id=? ORDER BY created_at', sub.id);
    const latest = new Map();
    for (const r of rows) latest.set(r.criterion, r);
    const failed = [...latest.values()].filter((r) => r.level === 'fail');
    if (!failed.length) throw err('invalid', 'Không có tiêu chí M nào đang "fail" trên lần nộp này — không trả về làm lại được.', null);
    // đếm chuỗi auto liên tiếp (previous_id) — lần thứ 3 bị chặn (STANDARD-KIT-v1 §7, DB-GK-0.1 §5)
    let n = 0, cur = sub;
    while (cur && cur.previous_id) {
      const prevSub = byRef('asset_submissions', cur.previous_id);
      if (!prevSub || prevSub.decision_kind !== 'auto') break;
      n++; cur = prevSub;
      if (n >= 10) break; // chặn vòng lặp vô hạn nếu dữ liệu hỏng
    }
    const reason = p.note || `Kiểm máy trượt: ${failed.map((f) => `${f.criterion}${f.detail ? ' ' + f.detail : ''}`).join('; ')}`;
    // Lần thứ 3 liên tiếp: KHÔNG throw (throw sẽ rollback cả transaction, mất luôn đề xuất) — trả kết quả "blocked" kèm
    // đề xuất SG- cho owner, giữ submission ở "submitted" (Gen không có quyền rework/approve/reject ở lần này — INT-GK-04).
    if (n >= 2) {
      const sg = db.insertRow('suggestions', { target_kind: 'submission_verdict', target_id: sub.display_id,
        diff: { verdict: 'rework_blocked', reason, failed: failed.map((f) => f.criterion) }, state: 'proposed', created_by: c.by }, { prefix: 'SG' });
      return { result: { blocked: true, submission: sub.display_id, suggestion: sg.display_id,
        text_human: `Lần nộp ${sub.display_id} đã trả về tự động 2 lần liên tiếp; lần thứ 3 chờ Ryan quyết (đề xuất ${sg.display_id}).` },
        entity: ['suggestion', sg.display_id], before: null, after: { target: sub.display_id, verdict: 'rework_blocked' } };
    }
    db.update('asset_submissions', sub.id, { state: 'rework', decision_kind: 'auto', decided_actor: c.by, decision_reason: reason });
    return { result: byRef('asset_submissions', sub.id), entity: ['asset_submission', sub.display_id],
      before: { state: sub.state }, after: { state: 'rework', decision_kind: 'auto', decision_reason: reason } };
  });

  // ---- submission.propose — đề xuất quyết định (SG-) cho owner xem ở hàng chờ duyệt; không tự đổi trạng thái ----
  op('submission.propose', 'review', (c) => {
    const p = c.p;
    const sub = need('asset_submissions', p.submission, 'lần nộp');
    if (!['approve', 'rework', 'reject'].includes(p.verdict)) throw err('invalid', 'verdict phải là approve/rework/reject.', { verdict: p.verdict });
    if (!nonEmptyStr(p.reason)) throw err('invalid', 'Cần lý do đề xuất.', null);
    const sg = db.insertRow('suggestions', { target_kind: 'submission_verdict', target_id: sub.display_id,
      diff: { verdict: p.verdict, reason: p.reason }, state: 'proposed', created_by: c.by }, { prefix: 'SG' });
    return { result: sg, entity: ['suggestion', sg.display_id], before: null, after: { target: sub.display_id, verdict: p.verdict } };
  });

  // ---- check.waive — Ryan miễn một tiêu chí (lý do ≥ 10 ký tự); chỉ thêm hàng "waived", không sửa hàng cũ ----
  op('check.waive', 'ownerUi', (c) => {
    const p = c.p;
    if (!nonEmptyStr(p.reason) || p.reason.trim().length < 10) throw err('invalid', 'Lý do miễn cần tối thiểu 10 ký tự.', null);
    if (!nonEmptyStr(p.criterion)) throw err('invalid', 'Cần criterion.', null);
    const t = target(p);
    const row = db.insertRow('asset_checks', {
      run_id: p.run_id || `waive-${Date.now()}`, submission_id: t.kind === 'submission' ? t.row.id : null, asset_id: t.kind === 'asset' ? t.row.id : null,
      criterion: p.criterion, kit_ver: p.kit_ver || 'KIT-v1', level: 'waived', measured: null, detail: null,
      checker: 'owner', checker_ref: c.by, reason: p.reason, created_by: c.by,
    });
    const checksLevel = t.kind === 'submission' ? recomputeChecksLevel(t.row.id) : null;
    return { result: row, entity: [t.kind === 'submission' ? 'asset_submission' : 'asset', t.row.display_id], before: null, after: { criterion: p.criterion, level: 'waived', checks_level: checksLevel } };
  });

  // ---- kit.certify — Ryan chứng nhận ô ngoài hàng chờ (STANDARD-KIT-v1 §5 điều 3–4; đường Muse đi qua submission.approve, gói khác) ----
  op('kit.certify', 'ownerUi', (c) => {
    const p = c.p;
    const asset = need('assets', p.asset, 'tài sản');
    const code = p.kit_slot || asset.kit_slot;
    if (!code) throw err('invalid', 'Tài sản chưa gắn ô (kit_slot) — dùng slot.assign trước.', null);
    const slot = db.get('SELECT * FROM kit_slots WHERE workspace_id=? AND code=?', ws(), code);
    if (!slot) throw err('not_found', `Không tìm thấy ô "${code}".`, { kit_slot: code });
    const rows = db.all('SELECT criterion, level FROM asset_checks WHERE asset_id=? ORDER BY created_at', asset.id);
    const latest = new Map();
    for (const r of rows) latest.set(r.criterion, r.level);
    const stillFailing = [...latest.entries()].filter(([, l]) => l === 'fail');
    if (stillFailing.length) throw err('forbidden', `Còn ${stillFailing.length} tiêu chí "fail" chưa miễn: ${stillFailing.map(([k]) => k).join(', ')}.`, { failed: stillFailing.map(([k]) => k) });
    const kitMajor = p.kit_major || 1;
    const subjectRev = p.subject_rev !== undefined ? p.subject_rev : slot.subject_rev;
    const dup = db.get("SELECT id FROM kit_certs WHERE asset_id=? AND kit_slot=? AND kit_major=? AND coalesce(subject_rev,'')=coalesce(?,'')", asset.id, code, kitMajor, subjectRev);
    if (dup) throw err('conflict', `Ô "${code}" đã có chứng nhận cho tài sản này (major ${kitMajor}${subjectRev ? ', ' + subjectRev : ''}).`, { kit_certs: dup.id });
    const row = db.insertRow('kit_certs', {
      asset_id: asset.id, kit_slot: code, kit_major: kitMajor, subject_rev: subjectRev,
      h_ticks: p.h_ticks || null, m_snapshot: [...latest.entries()].map(([criterion, level]) => ({ criterion, level })),
      via: 'certify', submission_id: p.submission ? need('asset_submissions', p.submission, 'lần nộp').id : null, by: c.a.id, at: db.now(),
    });
    return { result: row, entity: ['asset', asset.display_id], before: null, after: { kit_slot: code, kit_major: kitMajor, subject_rev: subjectRev } };
  });

  // ---- fetch_log.prune — dọn nhật ký lượt tải quá hạn giữ 180 ngày (DB-GK-0.1 §12; scheduler system) ----
  op('fetch_log.prune', 'system', (c) => {
    const r = db.run("DELETE FROM asset_fetch_log WHERE at < datetime('now','-180 days')");
    return { result: { deleted: r.changes }, entity: ['asset_fetch_log', 'ALL'], before: null, after: { deleted: r.changes } };
  });

  // ============ 0.3.0-B — Muse nộp hàng qua MCP (SPEC-GK-0.1) ============
  const liveSlot = (code) => {
    const slot = db.get('SELECT * FROM kit_slots WHERE workspace_id=? AND code=?', ws(), code);
    if (!slot) throw err('not_found', `Không tìm thấy ô "${code}".`, { kit_slot: code });
    if (slot.retired_in) throw err('invalid', `Ô "${code}" đã retired (${slot.retired_in}).`, { kit_slot: code });
    return slot;
  };
  const claimLive = (slot, now) => !!(slot.claimed_by && slot.claim_expires_at && slot.claim_expires_at > now);

  // ---- kit.claim — nhận ô ⇒ "Đang làm", khoá theo agent, hết hạn 2 h (SPEC-GK-0.1 Muse.claim) ----
  op('kit.claim', 'assetsSubmit', (c) => {
    const slot = liveSlot(c.p.kit_slot);
    const now = db.now();
    if (claimLive(slot, now) && slot.claimed_by !== c.a.id) {
      throw err('conflict', `Ô "${slot.code}" đang được agent khác giữ tới ${slot.claim_expires_at}.`, { kit_slot: slot.code, claimed_by: slot.claimed_by, claim_expires_at: slot.claim_expires_at });
    }
    const expires = new Date(Date.now() + CLAIM_MS).toISOString();
    db.run('UPDATE kit_slots SET claimed_by=?, claimed_at=?, claim_expires_at=? WHERE workspace_id=? AND code=?', c.a.id, now, expires, ws(), slot.code);
    return { result: { kit_slot: slot.code, claimed_by: c.a.id, claim_expires_at: expires }, entity: ['kit_slots', slot.code],
      before: { claimed_by: slot.claimed_by }, after: { claimed_by: c.a.id, claim_expires_at: expires } };
  });

  // ---- kit.report_blocked — Muse trả ô lại (lý do, không nộp được), bỏ claim ----
  op('kit.report_blocked', 'assetsSubmit', (c) => {
    const p = c.p;
    if (!nonEmptyStr(p.reason)) throw err('invalid', 'Cần lý do (reason).', null);
    const slot = liveSlot(p.kit_slot);
    if (slot.claimed_by !== c.a.id) throw err('forbidden', `Ô "${slot.code}" không phải bạn đang giữ.`, { kit_slot: slot.code, claimed_by: slot.claimed_by });
    db.run('UPDATE kit_slots SET claimed_by=NULL, claimed_at=NULL, claim_expires_at=NULL WHERE workspace_id=? AND code=?', ws(), slot.code);
    return { result: { kit_slot: slot.code, released: true, reason: p.reason }, entity: ['kit_slots', slot.code],
      before: { claimed_by: c.a.id }, after: { claimed_by: null, blocked_reason: p.reason } };
  });

  // ---- upload.start/chunk/finish — phiên tải chunk (kit_upload_chunk), tới 50 MB, chunk ≤1 MB, tệp tạm ngoài media/ ----
  const sessionRow = (id) => db.get('SELECT * FROM upload_sessions WHERE workspace_id=? AND id=?', ws(), String(id || ''));
  const needSession = (id, agentId) => {
    const row = sessionRow(id);
    if (!row) throw err('not_found', 'Không tìm thấy phiên tải.', { session: id });
    if (row.agent_id !== agentId) throw err('forbidden', 'Phiên tải thuộc agent khác.', { session: id });
    return row;
  };
  op('upload.start', 'assetsSubmit', (c) => {
    const slot = liveSlot(c.p.kit_slot);
    const dir = path.join(db.dataDir, 'tmp', 'uploads');
    fs.mkdirSync(dir, { recursive: true });
    const row = db.insertRow('upload_sessions', { agent_id: c.a.id, kit_slot: slot.code, declared_mime: c.p.declared_mime || null, tmp_path: 'pending', received_bytes: 0, next_chunk: 0, state: 'open' });
    const tmpPath = path.join(dir, `${row.id}.bin`);
    fs.writeFileSync(tmpPath, Buffer.alloc(0));
    db.update('upload_sessions', row.id, { tmp_path: tmpPath });
    return { result: { session: row.id, kit_slot: slot.code }, entity: ['upload_session', row.id], before: null, after: { kit_slot: slot.code } };
  });
  op('upload.chunk', 'assetsSubmit', (c) => {
    const p = c.p;
    const row = needSession(p.session, c.a.id);
    if (row.state !== 'open') throw err('conflict', `Phiên tải đã "${row.state}".`, { session: row.id });
    if (typeof p.index !== 'number' || p.index !== row.next_chunk) throw err('invalid', `Cần chunk #${row.next_chunk} (nhận #${p.index}).`, { expected: row.next_chunk, got: p.index });
    const buf = Buffer.from(nonEmptyStr(p.data_base64) ? p.data_base64 : '', 'base64');
    if (!buf.length) throw err('invalid', 'Chunk rỗng.', null);
    if (buf.length > MAX_CHUNK_BYTES) throw err('invalid', `Mỗi chunk tối đa ${MAX_CHUNK_BYTES} byte.`, { bytes: buf.length });
    if (row.received_bytes + buf.length > MAX_UPLOAD_BYTES) throw err('invalid', `Tổng dung lượng vượt ${MAX_UPLOAD_BYTES} byte.`, { would_be: row.received_bytes + buf.length });
    fs.appendFileSync(row.tmp_path, buf);
    const received = row.received_bytes + buf.length, nextChunk = row.next_chunk + 1;
    db.run('UPDATE upload_sessions SET received_bytes=?, next_chunk=?, updated_at=? WHERE id=?', received, nextChunk, db.now(), row.id);
    return { result: { session: row.id, received_bytes: received, next_chunk: nextChunk }, entity: ['upload_session', row.id], before: { received_bytes: row.received_bytes }, after: { received_bytes: received } };
  });
  op('upload.finish', 'assetsSubmit', (c) => {
    const row = needSession(c.p.session, c.a.id);
    if (row.state !== 'open') throw err('conflict', `Phiên tải đã "${row.state}".`, { session: row.id });
    if (!row.received_bytes) throw err('invalid', 'Phiên chưa nhận chunk nào.', { session: row.id });
    db.run("UPDATE upload_sessions SET state='done', updated_at=? WHERE id=?", db.now(), row.id);
    return { result: { session: row.id, kit_slot: row.kit_slot, bytes: row.received_bytes, tmp_path: row.tmp_path, declared_mime: row.declared_mime },
      entity: ['upload_session', row.id], before: { state: 'open' }, after: { state: 'done' } };
  });

  // ---- submission.submit — Muse nộp nội dung (kit_submit): magic bytes mở rộng Bộ Neo, lưu media, tạo asset + asset_submission ----
  // Khác `asset.put` lõi (composeOrSystem, MIME hẹp png/jpeg/webp/svg): Muse chỉ có scope assets.submit (không có 'compose'),
  // và Bộ Neo cần thêm wav/mp3/ogg/mp4/webm/ttf/otf/woff2/json-lottie (server/checks/magic.js, gói E) — quyết định tự chọn gói B.
  op('submission.submit', 'assetsSubmit', (c) => {
    const p = c.p;
    const slot = liveSlot(p.kit_slot);
    if (!Buffer.isBuffer(p.bytes) || !p.bytes.length) throw err('invalid', 'Thiếu nội dung.', null);
    if (p.bytes.length > MAX_UPLOAD_BYTES) throw err('invalid', `Tệp vượt ${MAX_UPLOAD_BYTES} byte.`, { bytes: p.bytes.length });
    const sn = magic.sniff(p.bytes, p.declared_mime || null);
    if (!sn.ok) throw err('invalid', `Magic bytes không khớp (phát hiện ${sn.detected || 'không rõ'}${sn.declared ? ', khai ' + sn.declared : ''}).`, sn);
    const mime = sn.detected, kind = KIT_KIND[mime];
    if (!kind) throw err('invalid', `Định dạng "${mime}" chưa có ánh xạ kind cho Bộ Neo.`, { mime });
    const sha = crypto.createHash('sha256').update(p.bytes).digest('hex');
    let asset = db.json(db.get('SELECT * FROM assets WHERE workspace_id=? AND sha256=?', ws(), sha));
    const subject = deriveSubject(slot.code);
    if (!asset) {
      const ext = KIT_EXT[mime] || 'bin';
      const rel = path.join('media', sha.slice(0, 2), `${sha}.${ext}`);
      const abs = path.join(db.dataDir, rel);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      const tmp = `${abs}.tmp${process.pid}`;
      fs.writeFileSync(tmp, p.bytes);
      fs.renameSync(tmp, abs);
      asset = db.insertRow('assets', { kind, sha256: sha, path: rel, bytes: p.bytes.length, mime, meta: null, media_present: 1,
        source: 'upload', source_kind: 'muse', subject, kit_slot: slot.code, created_by: c.by }, { prefix: 'AS' });
    }
    const prev = p.previous ? need('asset_submissions', p.previous, 'lần nộp trước') : null;
    if (prev && prev.kit_slot !== slot.code) throw err('invalid', 'Lần nộp trước không cùng ô với lần nộp này.', { previous: prev.display_id, kit_slot: slot.code });
    const attempt = prev ? prev.attempt + 1 : 1;
    const sub = db.insertRow('asset_submissions', { agent_id: c.a.id, kit_slot: slot.code, asset_id: asset.id, previous_id: prev ? prev.id : null, attempt, state: 'submitted', created_by: c.by }, { prefix: 'SB' });
    db.run('UPDATE kit_slots SET claimed_by=NULL, claimed_at=NULL, claim_expires_at=NULL WHERE workspace_id=? AND code=?', ws(), slot.code);
    return { result: { submission: byRef('asset_submissions', sub.id), asset }, entity: ['asset_submission', sub.display_id], before: null, after: { kit_slot: slot.code, asset: asset.display_id, attempt } };
  });
}

function nonEmptyStr(s) { return typeof s === 'string' && s.trim().length > 0; }

module.exports = { register, OWNER: '0.3.0-A', deriveSubject };
