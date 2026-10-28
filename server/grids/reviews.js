// © 2026 Gen Labs — All rights reserved.
// Lưới `reviews` (DATABASE §5.2). Một file mỗi lưới (SPEC-0.2.0 §2.4): gói sau thêm cột trong file lưới của mình.
// Định nghĩa: { from, where, cols:{khoá:{label,type,expr,search?}}, sort, footer(rows) } — expr là SQL cố định (whitelist), KHÔNG nhận dữ liệu người dùng.
'use strict';
const { median } = require('./_util');

const grid = {
  from: 'reviews rv JOIN renders r ON r.id=rv.render_id LEFT JOIN users u ON u.id=rv.decided_by',
  where: 'rv.workspace_id=?',
  cols: {
    display_id: { label: 'ID', type: 'id', expr: 'rv.display_id', search: true },
    render: { label: 'Render', type: 'id', expr: 'r.display_id' },
    decision: { label: 'Quyết định', type: 'enum', expr: 'rv.decision' },
    review_seconds: { label: 'Giây duyệt', type: 'num', expr: 'rv.review_seconds' },
    decided_by: { label: 'Người duyệt', type: 'text', expr: 'u.display_name' },
    decided_at: { label: 'Lúc', type: 'date', expr: 'rv.created_at' },
    notes: { label: 'Ghi chú', type: 'num', expr: '(SELECT COUNT(*) FROM review_notes n WHERE n.review_id=rv.id)' },
  },
  sort: '-decided_at',
  footer: rows => ({ count: rows.length, median_review_seconds: median(rows.map(r => r.review_seconds).filter(x => typeof x === 'number')) }),
};

module.exports = { name: 'reviews', grid };
