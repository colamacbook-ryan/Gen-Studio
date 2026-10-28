// © 2026 Gen Labs — All rights reserved.
// Tool MCP về nhân vật: list_cast · save_cast_member · render_cast_preview. Chuyển NGUYÊN TRẠNG từ server/mcp.js (P0b). Gói V mở rộng tại đây
// (kiểm công thức, cast.approve KHÔNG có tool vì chỉ owner trên UI — §10); gói K có thể thay render_cast_preview bằng renderStill mode cast.
'use strict';
const { kit } = require('./_kit.js');

function tools(ctx) {
  const { write, S, O, channelOf, castOf, actorOf } = kit(ctx);
  return [
    { name: 'list_cast', scope: 'read', description: 'Danh sách nhân vật của kênh.', schema: { channel: S }, required: [], handler: (a) => {
      const m = castOf(channelOf(a.channel));
      return { text: m.map((x) => `${x.display_id} ${x.name} (${x.role_label || '—'}) v${x.version}`).join('\n') || 'Chưa có nhân vật.', data: { cast: m } };
    } },
    { name: 'save_cast_member', scope: 'compose', description: 'Tạo/sửa nhân vật (công thức Gen-Chibi trong data) — version mới.', schema: { cast: S, channel: S, name: S, role_label: S, data: O, note: S }, required: ['data'], handler: (a, c) => {
      const out = write(actorOf(c), 'cast.save', { id: a.cast, channel: a.channel, name: a.name, role_label: a.role_label, data: a.data, note: a.note });
      return { text: `Đã lưu nhân vật ${out.display_id} v${out.version}.`, data: { cast: out.display_id, version: out.version } };
    } },
    { name: 'render_cast_preview', scope: 'read', description: 'Xem trước nhân vật (SVG).', schema: { cast: S }, required: [], handler: () => ({ text: 'Xem trước nhân vật chưa hỗ trợ ở bản này (chủ xưởng xem trên giao diện).', data: { supported: false, code: 'not_supported' } }) },
  ];
}

module.exports = { tools };
