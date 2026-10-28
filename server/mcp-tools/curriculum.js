// © 2026 Gen Labs — All rights reserved.
// Tool MCP về giáo trình: list_curriculum · save_curriculum_node. Chuyển NGUYÊN TRẠNG từ server/mcp.js (P0b).
'use strict';
const { kit } = require('./_kit.js');

function tools(ctx) {
  const { db, write, S, N, channelOf, actorOf } = kit(ctx);
  return [
    { name: 'list_curriculum', scope: 'read', description: 'Danh sách mục giáo trình của kênh.', schema: { channel: S }, required: [], handler: (a) => {
      const ch = channelOf(a.channel);
      const rows = db.all('SELECT cu.display_id, cu.ord, cu.title, cu.principle, cu.status, p.display_id AS parent FROM curriculum_nodes cu LEFT JOIN curriculum_nodes p ON p.id=cu.parent_id WHERE cu.channel_id=? AND cu.deleted_at IS NULL ORDER BY cu.ord', ch.id);
      return { text: rows.map((r) => `${r.display_id} #${r.ord} [${r.status}] ${r.title}`).join('\n') || 'Giáo trình trống.', data: { channel: ch.display_id, nodes: rows } };
    } },
    { name: 'save_curriculum_node', scope: 'compose', description: 'Tạo/sửa mục giáo trình.', schema: { node: S, channel: S, title: S, principle: S, status: S, ord: N, parent: S, prereq: { type: 'array', items: S } }, required: [], handler: (a, c) => {
      const out = write(actorOf(c), 'curriculum.save', { id: a.node, channel: a.channel || (a.node ? undefined : channelOf().display_id), title: a.title, principle: a.principle, status: a.status, ord: a.ord, parent: a.parent, prereq: a.prereq });
      return { text: `Đã lưu mục ${out.display_id} "${out.title}".`, data: { node: out.display_id } };
    } },
  ];
}

module.exports = { tools };
