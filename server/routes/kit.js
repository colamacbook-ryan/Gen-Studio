// © 2026 Gen Labs — All rights reserved.
// Gói D (0.3.0) — UI KHO song ngữ VI/EN (A1 Tổng quan · A2 Hàng chờ duyệt · A3 Chi tiết ô · A4 Phiếu/Muse · A5 Nhật ký · A6 Cài đặt).
// Route MỎNG: chỉ nối HTTP ↔ các op đã có ở server/ops/kit.js (gói A/B/C) — không thêm logic nghiệp vụ mới.
//   GET  /api/kit/overview              457 ô theo nhóm NB-01..10, trạng thái từng ô, % chứng nhận, claim đang sống
//   GET  /api/kit/slot/:code            chi tiết một ô: lịch sử nộp, chứng nhận, tiêu chí bắt buộc
//   GET  /api/kit/submission/:id        chi tiết một lần nộp: tệp, kiểm máy (mới nhất/tiêu chí), lịch sử chuỗi làm lại
//   POST /api/kit/submission/:id/decide {verdict: approve|rework|reject|reopen, reason?} ⇒ submission.set_state (ownerUi)
//   POST /api/kit/certify                kit.certify (ownerUi) — Xác nhận ô (tick M*/H đủ)
//   POST /api/kit/waive                  check.waive (ownerUi) — Miễn tiêu chí (lý do ≥ 10 ký tự)
//   POST /api/kit/sync                   kit.sync (ownerUi qua isOwner) — nạp lại danh mục 457 ô từ seed
// Mọi ghi đi qua write(); op tự kiểm quyền. Lỗi luôn {code, text_human, detail} (errBody chung của server/api.js).
'use strict';
const { requiredCriteria } = require('../kit-criteria.js');

const UI = { sess: true, ui: true, strictOrigin: true };

function statusOf(row) {
  if (row.certified) return 'certified';
  if (row.last_state === 'approved') return 'approved';
  if (row.last_state === 'blocked') return 'blocked';
  if (row.last_state === 'rework') return 'rework';
  if (row.last_state === 'submitted') return 'submitted';
  return 'empty';
}

function assetView(db, a) {
  if (!a) return null;
  return { display_id: a.display_id, mime: a.mime, bytes: a.bytes, kit_slot: a.kit_slot, url: '/media/' + a.display_id };
}

// dedupe checks theo (submission|asset, criterion): hàng CUỐI theo (created_at,id) = hiện hành — cùng luật server/ops/kit.js latestByCriterion.
function latestChecks(rows) {
  const m = new Map();
  for (const r of rows) m.set(r.criterion, r);
  return [...m.values()];
}

function register(add, rctx) {
  const { db, write, actorOf, fail, need } = rctx;
  const ws = () => db.ws;

  // ---- A1 Tổng quan: 457 ô theo nhóm, trạng thái, % chứng nhận, claim đang sống ----
  add('GET', '/api/kit/overview', { sess: true }, async () => {
    const rows = db.all(`
      SELECT ks.code, ks.group_code, ks.title_vi, ks.title_en, ks.subject_rev, ks.claimed_by, ks.claim_expires_at,
        (SELECT 1 FROM kit_certs c WHERE c.workspace_id=ks.workspace_id AND c.kit_slot=ks.code LIMIT 1) AS certified,
        (SELECT s.state FROM asset_submissions s WHERE s.workspace_id=ks.workspace_id AND s.kit_slot=ks.code ORDER BY s.created_at DESC, s.id DESC LIMIT 1) AS last_state
      FROM kit_slots ks WHERE ks.workspace_id=? AND ks.retired_in IS NULL ORDER BY ks.group_code, ks.code`, ws());
    const now = new Date().toISOString();
    const slots = rows.map((r) => ({
      code: r.code, group_code: r.group_code, title_vi: r.title_vi, title_en: r.title_en, subject_rev: r.subject_rev,
      status: statusOf(r), claimed_by: r.claim_expires_at > now ? r.claimed_by : null, claim_expires_at: r.claim_expires_at > now ? r.claim_expires_at : null,
    }));
    const groups = {};
    for (const s of slots) {
      const g = groups[s.group_code] || (groups[s.group_code] = { group_code: s.group_code, total: 0, certified: 0 });
      g.total++; if (s.status === 'certified') g.certified++;
    }
    const groupList = Object.values(groups).sort((a, b) => a.group_code < b.group_code ? -1 : 1).map((g) => ({ ...g, pct: g.total ? Math.round((g.certified / g.total) * 100) : 0 }));
    const totalCertified = slots.filter((s) => s.status === 'certified').length;
    const claims = slots.filter((s) => s.claimed_by).map((s) => ({ kit_slot: s.code, claimed_by: s.claimed_by, claim_expires_at: s.claim_expires_at }));
    return { slots, groups: groupList, totals: { total: slots.length, certified: totalCertified, pct: slots.length ? Math.round((totalCertified / slots.length) * 100) : 0 }, claims };
  });

  // ---- A3 Chi tiết ô: lịch sử nộp, chứng nhận, tiêu chí bắt buộc của nhóm ô ----
  add('GET', '/api/kit/slot/:code', { sess: true }, async (c) => {
    const slot = db.get('SELECT * FROM kit_slots WHERE workspace_id=? AND code=?', ws(), c.params.code);
    if (!slot) throw fail('not_found', `Không tìm thấy ô "${c.params.code}".`);
    const subs = db.all(`SELECT s.*, a.display_id AS asset_display, a.mime, a.bytes FROM asset_submissions s LEFT JOIN assets a ON a.id=s.asset_id
      WHERE s.workspace_id=? AND s.kit_slot=? ORDER BY s.created_at DESC, s.id DESC`, ws(), slot.code);
    const certs = db.all('SELECT * FROM kit_certs WHERE workspace_id=? AND kit_slot=? ORDER BY at DESC', ws(), slot.code);
    return {
      slot: { code: slot.code, group_code: slot.group_code, title_vi: slot.title_vi, title_en: slot.title_en, subject_rev: slot.subject_rev, added_in: slot.added_in, retired_in: slot.retired_in },
      required: requiredCriteria(slot.code),
      submissions: subs.map((s) => ({ display_id: s.display_id, state: s.state, attempt: s.attempt, checks_level: s.checks_level, decision_kind: s.decision_kind,
        decision_reason: s.decision_reason, decided_actor: s.decided_actor, created_at: s.created_at, asset: s.asset_display ? { display_id: s.asset_display, mime: s.mime, bytes: s.bytes, url: '/media/' + s.asset_display } : null })),
      certs: certs.map((k) => ({ id: k.id, asset_id: k.asset_id, kit_major: k.kit_major, subject_rev: k.subject_rev, via: k.via, by: k.by, at: k.at })),
    };
  });

  // ---- A2 chi tiết một lần nộp: kiểm máy mới nhất theo tiêu chí + chuỗi lịch sử làm lại ----
  add('GET', '/api/kit/submission/:id', { sess: true }, async (c) => {
    const sub = need('asset_submissions', c.params.id, 'lần nộp');
    const asset = sub.asset_id ? db.get('SELECT * FROM assets WHERE id=?', sub.asset_id) : null;
    const checksRaw = db.all('SELECT * FROM asset_checks WHERE workspace_id=? AND submission_id=? ORDER BY created_at, id', ws(), sub.id);
    const checks = latestChecks(checksRaw).map((r) => ({ criterion: r.criterion, severity: r.severity, level: r.level, measured: r.measured, detail: r.detail, checker: r.checker, reason: r.reason }));
    const history = [];
    let cur = sub, guard = 0;
    while (cur && guard++ < 20) {
      history.unshift({ display_id: cur.display_id, state: cur.state, attempt: cur.attempt, decision_kind: cur.decision_kind, decision_reason: cur.decision_reason, created_at: cur.created_at });
      cur = cur.previous_id ? db.get('SELECT * FROM asset_submissions WHERE id=?', cur.previous_id) : null;
    }
    const slot = sub.kit_slot ? db.get('SELECT * FROM kit_slots WHERE workspace_id=? AND code=?', ws(), sub.kit_slot) : null;
    const agent = sub.agent_id ? db.get('SELECT display_id, name FROM agents WHERE id=?', sub.agent_id) : null;
    return {
      submission: { display_id: sub.display_id, state: sub.state, attempt: sub.attempt, checks_level: sub.checks_level, kit_slot: sub.kit_slot,
        decision_kind: sub.decision_kind, decision_reason: sub.decision_reason, decided_actor: sub.decided_actor, created_at: sub.created_at, agent: agent && agent.display_id },
      asset: assetView(db, asset), slot: slot ? { code: slot.code, title_vi: slot.title_vi, title_en: slot.title_en, group_code: slot.group_code, subject_rev: slot.subject_rev } : null,
      required: sub.kit_slot ? requiredCriteria(sub.kit_slot) : { m: [], mh: [] }, checks, history,
    };
  });

  // ---- A2 hành động: Duyệt / Trả làm lại / Bỏ (từ chối) / Mở lại để tự quyết ----
  add('POST', '/api/kit/submission/:id/decide', UI, async (c) => {
    const sub = need('asset_submissions', c.params.id, 'lần nộp');
    const b = c.body || {};
    const actorName = (c.sess.user.display_name || c.sess.user.username || '').trim() || null;
    const reason = typeof b.reason === 'string' ? b.reason.trim() : '';
    if (b.verdict === 'approve') {
      return { result: write(actorOf(c), 'submission.set_state', { submission: sub.display_id, state: 'approved', decision_kind: 'owner', decided_actor: actorName, decision_reason: reason || null }) };
    }
    if (b.verdict === 'rework') {
      if (reason.length < 10) throw fail('invalid', 'Lý do làm lại cần tối thiểu 10 ký tự.');
      return { result: write(actorOf(c), 'submission.set_state', { submission: sub.display_id, state: 'rework', decision_kind: 'owner', decided_actor: actorName, decision_reason: reason }) };
    }
    if (b.verdict === 'reject') {
      if (reason.length < 10) throw fail('invalid', 'Lý do bỏ (từ chối) cần tối thiểu 10 ký tự.');
      return { result: write(actorOf(c), 'submission.set_state', { submission: sub.display_id, state: 'rejected', decision_kind: 'owner', decided_actor: actorName, decision_reason: reason }) };
    }
    if (b.verdict === 'reopen') {
      return { result: write(actorOf(c), 'submission.set_state', { submission: sub.display_id, state: 'submitted', decision_kind: null, decided_actor: null, decision_reason: null }) };
    }
    throw fail('invalid', 'verdict phải là approve/rework/reject/reopen.', { verdict: b.verdict });
  });

  // ---- A3 Xác nhận ô (tick đủ M*/H) ----
  add('POST', '/api/kit/certify', UI, async (c) => ({ result: write(actorOf(c), 'kit.certify', c.body || {}) }));
  // ---- A2/A3 Miễn tiêu chí (lý do ≥ 10 ký tự) ----
  add('POST', '/api/kit/waive', UI, async (c) => ({ result: write(actorOf(c), 'check.waive', c.body || {}) }));
  // ---- A6 Cài đặt kho: đồng bộ lại danh mục 457 ô từ seed/kit-slots.json ----
  add('POST', '/api/kit/sync', UI, async (c) => ({ result: write(actorOf(c), 'kit.sync', {}) }));
}

module.exports = { register };
