// © 2026 Gen Labs — All rights reserved.
// Lưới `audit` (DATABASE §5.2). Một file mỗi lưới (SPEC-0.2.0 §2.4): gói sau thêm cột trong file lưới của mình.
// Định nghĩa: { from, where, cols:{khoá:{label,type,expr,search?}}, sort, footer(rows) } — expr là SQL cố định (whitelist), KHÔNG nhận dữ liệu người dùng.
'use strict';

const grid = {
  from: 'audit_log a',
  where: 'a.workspace_id=?',
  cols: {
    display_id: { label: 'ID', type: 'id', expr: 'a.display_id', search: true },
    ts: { label: 'Lúc', type: 'date', expr: 'a.ts' },
    actor: { label: 'Tác nhân', type: 'text', expr: 'a.actor', search: true },
    entry: { label: 'Lối vào', type: 'enum', expr: 'a.entry' },
    action: { label: 'Hành động', type: 'text', expr: 'a.action', search: true },
    entity_type: { label: 'Đối tượng', type: 'enum', expr: 'a.entity_type' },
    entity_id: { label: 'Mã đối tượng', type: 'text', expr: 'a.entity_id', search: true },
  },
  sort: '-ts',
  footer: rows => ({ count: rows.length }),
};

module.exports = { name: 'audit', grid };
