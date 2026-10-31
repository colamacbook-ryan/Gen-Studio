// © 2026 Gen Labs — All rights reserved.
// Gói 0.3.0-A (DB-GK-0.1 §4.7/§4.8/§6/§13, STANDARD-KIT-v1 §5–§6): hợp đồng dữ liệu kho Gen Kit — phần ghi.
// Phạm vi (thu hẹp theo brief gói A — xem ghi chú đầu migrations/0006_kit_library.sql): nạp danh mục 457 ô, gắn ô vào
// tài sản, ghi kết quả kiểm máy + đếm lần trả về tự động (≤2, lần 3 chờ Ryan), đề xuất quyết định, miễn tiêu chí, chứng
// nhận ô, dọn nhật ký lượt tải. KHÔNG có ở gói này: submission.approve/reject/reopen (chờ pipeline Muse đầy đủ — gói khác),
// tool MCP muse.js/review.js, nhập catalog.
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const KIT_SLOTS_FILE = path.join(__dirname, '..', '..', 'seed', 'kit-slots.json');
const SLOT_RE = /^[a-z]+(\.[a-z0-9-]+){1,3}$/;
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
}

function nonEmptyStr(s) { return typeof s === 'string' && s.trim().length > 0; }

module.exports = { register, OWNER: '0.3.0-A', deriveSubject };
