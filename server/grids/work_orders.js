// © 2026 Gen Labs — All rights reserved.
// Lưới `work_orders` (DATABASE §5.2). Một file mỗi lưới (SPEC-0.2.0 §2.4): gói sau thêm cột trong file lưới của mình.
// Định nghĩa: { from, where, cols:{khoá:{label,type,expr,search?}}, sort, footer(rows) } — expr là SQL cố định (whitelist), KHÔNG nhận dữ liệu người dùng.
'use strict';

const grid = {
  from: 'work_orders w LEFT JOIN channels ch ON ch.id=w.channel_id LEFT JOIN curriculum_nodes cu ON cu.id=w.curriculum_node_id LEFT JOIN lessons l ON l.id=w.lesson_id LEFT JOIN agents a ON a.id=w.agent_id',
  where: 'w.workspace_id=?',
  cols: {
    display_id: { label: 'ID', type: 'id', expr: 'w.display_id', search: true },
    kind: { label: 'Loại', type: 'enum', expr: 'w.kind' },
    state: { label: 'Trạng thái', type: 'enum', expr: 'w.state' },
    channel: { label: 'Kênh', type: 'id', expr: 'ch.display_id' },
    node: { label: 'Mục giáo trình', type: 'id', expr: 'cu.display_id' },
    lesson: { label: 'Bài', type: 'id', expr: 'l.display_id' },
    agent: { label: 'Agent', type: 'id', expr: 'a.display_id' },
    brief: { label: 'Giao việc', type: 'text', expr: 'w.brief', search: true },
    attempts: { label: 'Lần', type: 'num', expr: 'w.attempts' },
    aspect: { label: 'Tỉ lệ', type: 'enum', expr: 'w.aspect' },   // F7: NULL = theo kênh
    opened_at: { label: 'Mở lúc', type: 'date', expr: 'w.opened_at' },
    closed_at: { label: 'Đóng lúc', type: 'date', expr: 'w.closed_at' },
    summary: { label: 'Tóm tắt', type: 'text', expr: 'w.summary', search: true },
  },
  sort: '-opened_at',
  footer: rows => { const by = {}; rows.forEach(r => { by[r.state] = (by[r.state] || 0) + 1; }); return { count: rows.length, by_state: by }; },
};

module.exports = { name: 'work_orders', grid };
