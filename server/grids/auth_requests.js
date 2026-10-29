// © 2026 Gen Labs — All rights reserved.
// Lưới `auth_requests` (DATABASE §5.2). Một file mỗi lưới (SPEC-0.2.0 §2.4): gói sau thêm cột trong file lưới của mình.
// Định nghĩa: { from, where, cols:{khoá:{label,type,expr,search?}}, sort, footer(rows) } — expr là SQL cố định (whitelist), KHÔNG nhận dữ liệu người dùng.
'use strict';

const grid = {
  from: 'auth_requests r',
  where: "r.workspace_id=? AND r.status='pending' AND r.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now')",
  cols: {
    display_id: { label: 'ID', type: 'id', expr: 'r.display_id', search: true },
    kind: { label: 'Loại', type: 'enum', expr: 'r.kind' },
    client_name: { label: 'Tên client', type: 'text', expr: 'r.client_name', search: true },
    scopes_requested: { label: 'Phạm vi xin', type: 'json', expr: 'r.scopes_requested' },
    channel: { label: 'Nguồn', type: 'text', expr: "CASE r.channel WHEN 'internal' THEN 'trong máy · container agent' WHEN 'loopback' THEN 'trong máy' ELSE 'qua Internet' END" },
    redirect_uri: { label: 'Chuyển về', type: 'text', expr: 'r.redirect_uri' },
    created_at: { label: 'Yêu cầu lúc', type: 'date', expr: 'r.created_at' },
    expires_at: { label: 'Hết hạn', type: 'date', expr: 'r.expires_at' },
  },
  sort: '-created_at',
  footer: rows => ({ count: rows.length }),
};

module.exports = { name: 'auth_requests', grid };
