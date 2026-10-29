// © 2026 Gen Labs — All rights reserved.
// Tiện ích dùng chung cho server/mcp-tools/*.js (không phải module tool: tên bắt đầu bằng `_` nên bộ nạp bỏ qua).
// kit(ctx) chỉ cần ctx = { db, write, config } — chạy được cả khi test hợp đồng gọi tools({db, write, config}) mà không có máy chủ.
'use strict';
const api = require('../api.js');

const arr = (v) => (Array.isArray(v) ? v : []);
const cap = (s, n = 12000) => (s.length > n ? s.slice(0, n) + '\n…(đã cắt bớt)' : s);

function kit(ctx) {
  const { db, write } = ctx;
  const fail = (code, text, detail) => api.fail(code, text, detail);
  const S = { type: 'string' }, N = { type: 'number' }, O = { type: 'object' };
  const actorOf = (c) => ({ type: 'agent', id: c.agent.id, scopes: c.scopes, entry: 'mcp' });
  const need = (table, ref, what) => api.need(db, table, ref, what);
  const channelOf = (ref) => {
    if (ref) return need('channels', ref, 'kênh');
    const ch = db.json(db.get('SELECT * FROM channels WHERE workspace_id=? AND deleted_at IS NULL ORDER BY created_at LIMIT 1', db.ws));
    if (!ch) throw fail('not_found', 'Chưa có kênh nào.');
    return ch;
  };
  const chanData = (ch) => { const v = db.json(db.get('SELECT data FROM channel_versions WHERE entity_id=? AND version=?', ch.id, ch.current_version)); return (v && v.data) || {}; };
  const castOf = (ch) => db.all('SELECT * FROM cast_members WHERE channel_id=? AND deleted_at IS NULL ORDER BY display_id', ch.id).map((m) => {
    const v = db.json(db.get('SELECT data FROM cast_versions WHERE entity_id=? AND version=?', m.id, m.current_version));
    return { display_id: m.display_id, name: m.name, role_label: m.role_label, version: m.current_version, data: (v && v.data) || {} };
  });
  const assigned = (c) => db.get("SELECT * FROM work_orders WHERE workspace_id=? AND agent_id=? AND state='assigned' ORDER BY assigned_at LIMIT 1", db.ws, c.agent.id);
  const renderOf = (a) => {
    if (a.render) return need('renders', a.render, 'bản dựng');
    if (a.lesson) { const l = need('lessons', a.lesson, 'bài học'); if (!l.latest_render_id) throw fail('not_found', 'Bài chưa có bản dựng.'); return db.json(db.get('SELECT * FROM renders WHERE id=?', l.latest_render_id)); }
    throw fail('invalid', 'Cần render hoặc lesson.');
  };
  // móc mở rộng của writer (lessonExt, gates…); test dùng writer giả không có ext ⇒ rỗng
  const ext = write && write.ext ? write.ext : null;
  return { api, ctx, db, write, config: ctx.config, fail, S, N, O, arr, cap, actorOf, need, channelOf, chanData, castOf, assigned, renderOf, ext };
}

module.exports = { kit, arr, cap };
