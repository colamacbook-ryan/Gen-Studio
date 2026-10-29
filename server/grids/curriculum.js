// © 2026 Gen Labs — All rights reserved.
// Lưới `curriculum` (DATABASE §5.2). Một file mỗi lưới (SPEC-0.2.0 §2.4): gói sau thêm cột trong file lưới của mình.
// Định nghĩa: { from, where, cols:{khoá:{label,type,expr,search?}}, sort, footer(rows) } — expr là SQL cố định (whitelist), KHÔNG nhận dữ liệu người dùng.
'use strict';

const grid = {
  from: 'curriculum_nodes cu LEFT JOIN channels ch ON ch.id=cu.channel_id',
  where: 'cu.workspace_id=? AND cu.deleted_at IS NULL',
  cols: {
    display_id: { label: 'ID', type: 'id', expr: 'cu.display_id', search: true },
    channel: { label: 'Kênh', type: 'id', expr: 'ch.display_id' },
    ord: { label: 'Thứ tự', type: 'num', expr: 'cu.ord' },
    title: { label: 'Mục', type: 'text', expr: 'cu.title', search: true },
    principle: { label: 'Nguyên lý', type: 'text', expr: 'cu.principle', search: true },
    status: { label: 'Trạng thái', type: 'enum', expr: 'cu.status' },
  },
  sort: 'ord',
  footer: rows => ({ total: rows.length, done: rows.filter(r => r.status === 'done').length }),
};

module.exports = { name: 'curriculum', grid };
