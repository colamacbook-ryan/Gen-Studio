// © 2026 Gen Labs — All rights reserved.
// Lưới `cast` (DATABASE §5.2). Một file mỗi lưới (SPEC-0.2.0 §2.4): gói sau thêm cột trong file lưới của mình.
// Định nghĩa: { from, where, cols:{khoá:{label,type,expr,search?}}, sort, footer(rows) } — expr là SQL cố định (whitelist), KHÔNG nhận dữ liệu người dùng.
'use strict';

const grid = {
  from: 'cast_members cm LEFT JOIN channels ch ON ch.id=cm.channel_id',
  where: 'cm.workspace_id=? AND cm.deleted_at IS NULL',
  cols: {
    display_id: { label: 'ID', type: 'id', expr: 'cm.display_id', search: true },
    name: { label: 'Tên', type: 'text', expr: 'cm.name', search: true },
    role_label: { label: 'Vai', type: 'text', expr: 'cm.role_label', search: true },
    channel: { label: 'Kênh', type: 'id', expr: 'ch.display_id' },
    version: { label: 'Version', type: 'num', expr: 'cm.current_version' },
    // 0.2.0 (thêm sẵn, SPEC §13.2/§3.7): draft | candidate | approved | retired + bản đã chốt (D0: #/cast?q=status:candidate)
    status: { label: 'Trạng thái nhân vật', type: 'enum', expr: 'cm.status' },
    approved_version: { label: 'Bản đã chốt', type: 'num', expr: 'cm.approved_version' },
    approved_at: { label: 'Chốt lúc', type: 'date', expr: 'cm.approved_at' },
  },
  sort: 'display_id',
  footer: rows => ({ count: rows.length }),
};

module.exports = { name: 'cast', grid };
