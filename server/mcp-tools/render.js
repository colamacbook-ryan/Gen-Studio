// © 2026 Gen Labs — All rights reserved.
// Tool MCP về bản dựng/pipeline: get_render · run_lesson · get_run · retry_run · list_review_notes · get_export. Chuyển NGUYÊN TRẠNG từ server/mcp.js (P0b).
// (get_render trả danh sách cổng theo loại bài — api.renderView; get_export gọi hook export.after với entry mcp ⇒ gói O chỉ đặt exported_at, §10.)
'use strict';
const pipeline = require('../pipeline.js');
const { kit } = require('./_kit.js');

function tools(ctx) {
  const { db, api, S, fail, need, actorOf, renderOf } = kit(ctx);
  return [
    { name: 'get_render', scope: 'read', description: 'Trạng thái bản dựng: tiến độ, các cổng áp cho loại bài, manifest, lý do chặn.', schema: { render: S, lesson: S }, required: [], handler: (a) => {
      const r = renderOf(a), v = api.renderView(db, r);
      return { text: `Bản dựng ${r.display_id} (${v.render.lesson_display_id} v${v.render.version}): ${r.state}, tiến độ ${Math.round((r.progress || 0) * 100)}%${r.waiting_until ? ', chạy tiếp lúc ' + r.waiting_until : ''}${v.render.blocked_reason ? '\nBị chặn: ' + v.render.blocked_reason.text_human : ''}\nCổng: ` + v.gates.map((g) => g.gate + '=' + g.result).join(' '), data: v };
    } },
    { name: 'run_lesson', scope: 'run', description: 'Chạy lại pipeline cho bài (bản dựng mới hoặc chạy tiếp bản đang chặn/chờ).', schema: { lesson: S }, required: ['lesson'], handler: (a, c) => {
      const out = pipeline.requeueRender(ctx, renderOf({ lesson: a.lesson }), { actor: actorOf(c) });
      return { text: `Bản dựng ${out.display_id} đã vào hàng đợi (${out.state}).`, data: { render: out.display_id, state: out.state } };
    } },
    { name: 'get_run', scope: 'read', description: 'Xem một Run.', schema: { run: S }, required: ['run'], handler: (a) => {
      const r = need('runs', a.run, 'lượt chạy');
      const rd = r.render_id ? db.get('SELECT display_id FROM renders WHERE id=?', r.render_id) : null;
      return { text: `Run ${r.display_id} (${r.kind}) ${r.state}, tiến độ ${Math.round((r.progress || 0) * 100)}%${r.error ? ', lỗi: ' + r.error.text_human : ''}`, data: { run: { display_id: r.display_id, kind: r.kind, state: r.state, attempt: r.attempt, progress: r.progress, render: rd && rd.display_id, error: r.error, waiting_until: r.waiting_until } } };
    } },
    { name: 'retry_run', scope: 'run', description: 'Thử lại: chạy tiếp bản dựng của Run đã lỗi/bị huỷ.', schema: { run: S }, required: ['run'], handler: (a, c) => {
      const r = need('runs', a.run, 'lượt chạy');
      if (!r.render_id) throw fail('invalid', 'Run này không gắn với bản dựng nên không thử lại được.');
      const out = pipeline.requeueRender(ctx, db.json(db.get('SELECT * FROM renders WHERE id=?', r.render_id)), { actor: actorOf(c) });
      return { text: `Bản dựng ${out.display_id} đã vào hàng đợi (${out.state}).`, data: { render: out.display_id, state: out.state } };
    } },
    { name: 'list_review_notes', scope: 'read', description: 'Ghi chú duyệt (chỉ đọc) của một bản dựng hoặc bài.', schema: { render: S, lesson: S }, required: [], handler: (a) => {
      const rows = [];
      if (a.render || !a.lesson) rows.push(...api.reviewNotes(db, renderOf(a)));
      else db.all('SELECT r.* FROM renders r JOIN lesson_versions lv ON lv.id=r.lesson_version_id WHERE lv.lesson_id=? ORDER BY r.created_at', need('lessons', a.lesson, 'bài học').id).forEach((r) => rows.push(...api.reviewNotes(db, r)));
      return { text: rows.map((n) => `${n.review} ${n.decision} ${n.pin_ref}: ${n.text}`).join('\n') || 'Chưa có ghi chú duyệt.', data: { notes: rows } };
    } },
    { name: 'get_export', scope: 'run', description: 'Đường dẫn gói xuất (MP4 + SRT + cover + manifest.json) của bản dựng đã duyệt.', schema: { render: S }, required: ['render'], handler: (a, c) => {
      const r = need('renders', a.render, 'bản dựng');
      const ex = pipeline.exportRender(ctx, r, { actor: actorOf(c), entry: 'mcp' });
      return { text: `Gói xuất ${r.display_id}: ${ex.dir} (${ex.files.join(', ')}).`, data: ex };
    } },
  ];
}

module.exports = { tools };
