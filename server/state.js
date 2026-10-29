// © 2026 Gen Labs — All rights reserved.
// Máy trạng thái Render / Work order + lối review duy nhất (R2).
'use strict';
const { WriteError } = require('./db');
const queue = require('./queue');

const ACTIVE = ['queued', 'voicing', 'judging', 'aligning', 'rendering', 'mixing', 'gating'];
const SIDE = ['waiting_quota', 'retrying', 'blocked', 'superseded'];
const RESUME = [...ACTIVE, 'blocked', 'superseded'];
const RENDER_EDGES = {
  queued: ['voicing', ...SIDE],
  voicing: ['judging', ...SIDE],
  judging: ['aligning', 'voicing', ...SIDE],
  aligning: ['rendering', ...SIDE],
  rendering: ['mixing', ...SIDE],
  mixing: ['gating', ...SIDE],
  gating: ['awaiting_review', ...SIDE],
  awaiting_review: ['approved', 'changes_requested', 'rejected', 'superseded'],
  waiting_quota: [...RESUME, 'retrying'],
  retrying: [...RESUME, 'waiting_quota'],
  blocked: ['queued', 'superseded', 'rejected'],
  approved: [], changes_requested: [], rejected: [], superseded: [],
};
const REVIEW_ONLY = new Set(['approved', 'changes_requested']);
const WO_EDGES = {
  open: ['assigned', 'cancelled', 'stalled'],
  assigned: ['fulfilled', 'stalled', 'cancelled', 'open'],
  stalled: ['open', 'assigned', 'cancelled'],
  fulfilled: [], cancelled: [],
};
const MAX_UNBLOCK = 2; // CNS-035

const bad = (code, text, detail) => new WriteError(code, text, detail);
const byRef = (db, table, ref) => db.json(db.get(`SELECT * FROM ${table} WHERE workspace_id=? AND (id=? OR display_id=?)`, db.ws, ref, ref));

function actorStr(a) { return typeof a === 'string' ? a : a ? (a.id ? `${a.type}:${a.id}` : a.type) : 'system'; }

function renderRow(db, ref) {
  const r = byRef(db, 'renders', ref);
  if (!r) throw bad('not_found', 'Không tìm thấy bản dựng.', { ref });
  return r;
}

function createWorkOrder(db, f) {
  return db.tx(() => {
    try {
      const wo = db.insertRow('work_orders', {
        channel_id: f.channel_id, kind: f.kind, curriculum_node_id: f.curriculum_node_id || null, lesson_id: f.lesson_id || null,
        review_id: f.review_id || null, render_id: f.render_id || null, agent_id: f.agent_id || null,
        state: f.state || 'open', brief: f.brief || null, attempts: 0, opened_at: db.now(),
        closed_at: null, summary: f.summary || null, created_by: f.created_by || 'system',
        ...(f.aspect ? { aspect: f.aspect } : {}),   // F7: NULL = theo kênh; revise/unblock không đặt ⇒ bài kế thừa tỉ lệ version trước
      }, { prefix: 'WO' });
      db.emitChange({ entity: 'work_order', id: wo.display_id });
      return wo;
    } catch (e) {
      if (/UNIQUE/.test(String(e.message))) {
        throw bad('conflict', 'Mục giáo trình này đã có lệnh sản xuất đang mở.', { curriculum_node_id: f.curriculum_node_id });
      }
      throw e;
    }
  });
}

function transitionWorkOrder(db, woId, to, extra = {}) {
  return db.tx(() => {
    const wo = byRef(db, 'work_orders', woId);
    if (!wo) throw bad('not_found', 'Không tìm thấy lệnh sản xuất.', { woId });
    if (!(WO_EDGES[wo.state] || []).includes(to)) {
      throw bad('conflict', `Lệnh sản xuất ${wo.display_id} đang ở trạng thái "${wo.state}", không chuyển được sang "${to}".`, { from: wo.state, to });
    }
    const now = db.now();
    const f = { state: to };
    if (to === 'assigned') {
      f.assigned_at = now;
      if (extra.agent_id) {
        const ag = byRef(db, 'agents', extra.agent_id);
        if (!ag) throw bad('not_found', 'Không tìm thấy agent.', { agent: extra.agent_id });
        f.agent_id = ag.id;
      }
    }
    if (to === 'open' && wo.state === 'assigned') f.attempts = wo.attempts + 1;
    if (to === 'fulfilled' || to === 'cancelled') f.closed_at = now;
    if (extra.summary !== undefined) f.summary = extra.summary;
    if (extra.lesson_id) f.lesson_id = extra.lesson_id;
    db.update('work_orders', wo.id, f);
    db.audit({ actor: actorStr(extra.actor || 'system'), entry: extra.entry || 'system', action: `work_order.${to}`,
      entity_type: 'work_order', entity_id: wo.display_id, before: { state: wo.state }, after: { state: to } });
    db.emitChange({ entity: 'work_order', id: wo.display_id });
    return byRef(db, 'work_orders', wo.id);
  });
}

function lessonOfRender(db, render) {
  return db.json(db.get(
    `SELECT l.* FROM lessons l JOIN lesson_versions lv ON lv.lesson_id=l.id WHERE lv.id=?`, render.lesson_version_id));
}

function openUnblockWo(db, render, reason) {
  const lesson = lessonOfRender(db, render);
  const n = db.get(`SELECT COUNT(*) AS n FROM work_orders WHERE kind='unblock' AND lesson_id=? AND state!='cancelled'`, lesson.id).n;
  const brief = `Bản dựng ${render.display_id} bị chặn: ${reason.text_human || reason.code}. Hãy sửa bài ${lesson.display_id} và nộp phiên bản mới.`;
  if (n >= MAX_UNBLOCK) {
    // đã có lệnh stalled cho bài này thì không tạo thêm bản trùng
    const dup = db.get(`SELECT id FROM work_orders WHERE kind='unblock' AND lesson_id=? AND state='stalled' LIMIT 1`, lesson.id);
    if (dup) return byRef(db, 'work_orders', dup.id);
    return createWorkOrder(db, { channel_id: lesson.channel_id, kind: 'unblock', lesson_id: lesson.id, render_id: render.id, state: 'stalled',
      brief, summary: `Đã đạt trần ${MAX_UNBLOCK} lệnh gỡ chặn cho bài này; cần chủ xưởng xem.` });
  }
  return createWorkOrder(db, { channel_id: lesson.channel_id, kind: 'unblock', lesson_id: lesson.id, render_id: render.id, brief });
}

function move(db, render, to, extra, internal) {
  const edges = RENDER_EDGES[render.state] || [];
  if (!edges.includes(to)) {
    throw bad('conflict', `Bản dựng ${render.display_id} đang ở "${render.state}", không chuyển được sang "${to}".`, { from: render.state, to });
  }
  if (!internal && (REVIEW_ONLY.has(to) || (to === 'rejected' && render.state === 'awaiting_review'))) {
    throw bad('forbidden', 'Duyệt hay bỏ bản dựng chỉ được làm qua review của người dùng trên giao diện.', { to });
  }
  const f = { state: to, state_changed_at: db.now() };
  f.progress = extra.progress !== undefined ? extra.progress : to === 'awaiting_review' ? 1 : render.progress;
  f.waiting_until = to === 'waiting_quota' || to === 'retrying' ? extra.waiting_until || null : null;
  if (to === 'waiting_quota' && !extra.waiting_until) throw bad('invalid', 'waiting_quota cần waiting_until.', null);
  f.blocked_reason = to === 'blocked'
    ? extra.blocked_reason || { code: 'blocked', text_human: 'Bản dựng bị chặn.', detail: null } : null;
  if (extra.manifest !== undefined) {
    if (render.manifest && JSON.stringify(render.manifest) !== JSON.stringify(extra.manifest)) {
      throw bad('conflict', 'Manifest đã đóng băng, không sửa được.', null);
    }
    if (!render.manifest) f.manifest = extra.manifest;
  }
  // outputs GỘP DẦN trong pipeline (`gating` thêm được outputs.thumbs mà không mất mp4/srt…; khoá cùng khoá thì ghi đè). Sau khi rời pipeline,
  // trigger tr_render_outputs_once (0003, CNS-104/119) chặn mọi UPDATE outputs — nên chỉ đi qua đây khi bản dựng còn ở trạng thái pipeline.
  if (extra.outputs) f.outputs = { ...(render.outputs || {}), ...extra.outputs };
  // awaiting_review_at ghi MỘT LẦN, lúc vào awaiting_review (CNS-091; M2 của Tổng quan dùng cột này). Trigger tr_render_awaiting_once chặn sửa lại.
  if (to === 'awaiting_review' && !render.awaiting_review_at) f.awaiting_review_at = db.now();
  if (extra.duration_ms !== undefined) f.duration_ms = extra.duration_ms;
  if (extra.frames !== undefined) f.frames = extra.frames;
  db.update('renders', render.id, f);
  if (to === 'superseded' || to === 'rejected') queue.cancelByRender(db, render.id);
  const out = byRef(db, 'renders', render.id);
  db.audit({ actor: actorStr(extra.actor || 'system'), entry: internal ? 'ui' : 'system', action: `render.${to}`,
    entity_type: 'render', entity_id: render.display_id, before: { state: render.state }, after: { state: to } });
  if (to === 'blocked') openUnblockWo(db, out, f.blocked_reason);
  db.emitChange({ entity: 'render', id: render.display_id });
  return out;
}

function transitionRender(db, renderId, to, extra = {}) {
  return db.tx(() => move(db, renderRow(db, renderId), to, extra, false));
}

function review(db, { user, renderId, decision, notes = [], reviewSeconds = null, entry } = {}) {
  if (!user || (user.type && user.type !== 'user') || !['owner', 'reviewer'].includes(user.role) || entry !== 'ui') {
    throw bad('forbidden', 'Chỉ chủ xưởng hoặc người duyệt, trên giao diện web, mới được duyệt bản dựng.', { entry, role: user && user.role });
  }
  if (!['approved', 'changes_requested', 'rejected'].includes(decision)) throw bad('invalid', 'Quyết định không hợp lệ.', { decision });
  return db.tx(() => {
    const u = db.get('SELECT id, role FROM users WHERE id=? AND deleted_at IS NULL', user.id);
    if (!u || !['owner', 'reviewer'].includes(u.role)) throw bad('forbidden', 'Người dùng không tồn tại hoặc không có quyền duyệt.', null);
    const render = renderRow(db, renderId);
    if (render.state !== 'awaiting_review') {
      throw bad('conflict', `Bản dựng ${render.display_id} không ở trạng thái chờ duyệt (đang "${render.state}").`, { state: render.state });
    }
    const lesson = lessonOfRender(db, render);
    const clean = notes.map((n, i) => {
      if (!['line', 'beat', 'time'].includes(n.pin_kind)) throw bad('invalid', `Ghi chú ${i + 1}: loại ghim không hợp lệ.`, null);
      if (!n.text || !String(n.text).trim()) throw bad('invalid', `Ghi chú ${i + 1} trống.`, null);
      if (n.pin_ref === undefined || n.pin_ref === null || n.pin_ref === '') throw bad('invalid', `Ghi chú ${i + 1} thiếu vị trí ghim.`, null);
      return n;
    });
    let wo = null;
    if (decision === 'changes_requested') {
      const lines = clean.map((n) => `- ${n.pin_ref}${n.at_ms != null ? ` @${n.at_ms}ms` : ''}: ${n.text}`).join('\n');
      wo = createWorkOrder(db, { channel_id: lesson.channel_id, kind: 'revise', lesson_id: lesson.id, render_id: render.id,
        brief: `Chủ xưởng yêu cầu sửa bài ${lesson.display_id} (${render.display_id}).${lines ? `\n${lines}` : ''}`, created_by: `user:${u.id}` });
    }
    const rv = db.insertRow('reviews', { render_id: render.id, decision, decided_by: u.id, review_seconds: reviewSeconds,
      work_order_id: wo ? wo.id : null, created_by: `user:${u.id}` }, { prefix: 'RV' });
    for (const n of clean) {
      db.insertRow('review_notes', { review_id: rv.id, pin_kind: n.pin_kind, pin_ref: String(n.pin_ref), at_ms: n.at_ms == null ? null : n.at_ms, text: n.text });
    }
    if (wo) db.update('work_orders', wo.id, { review_id: rv.id });
    move(db, render, decision, { actor: { type: 'user', id: u.id } }, true);
    if (decision === 'approved' && lesson.curriculum_node_id) db.update('curriculum_nodes', lesson.curriculum_node_id, { status: 'done' });
    db.audit({ actor: `user:${u.id}`, entry: 'ui', action: 'review.create', entity_type: 'review', entity_id: rv.display_id,
      before: null, after: { render: render.display_id, decision, notes: clean.length } });
    db.emitChange({ entity: 'review', id: rv.display_id });
    return { ...rv, notes: clean, work_order: wo ? wo.display_id : null };
  });
}

module.exports = { actorStr, review, transitionRender, transitionWorkOrder, createWorkOrder, RENDER_EDGES, WO_EDGES, MAX_UNBLOCK };
