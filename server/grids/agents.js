// © 2026 Gen Labs — All rights reserved.
// Lưới `agents` (DATABASE §5.2). Một file mỗi lưới (SPEC-0.2.0 §2.4): gói sau thêm cột trong file lưới của mình.
// Định nghĩa: { from, where, cols:{khoá:{label,type,expr,search?}}, sort, footer(rows) } — expr là SQL cố định (whitelist), KHÔNG nhận dữ liệu người dùng.
'use strict';

const grid = {
  from: 'agents ag',
  where: 'ag.workspace_id=? AND ag.deleted_at IS NULL',
  cols: {
    display_id: { label: 'ID', type: 'id', expr: 'ag.display_id', search: true },
    name: { label: 'Tên', type: 'text', expr: 'ag.name', search: true },
    kind: { label: 'Loại', type: 'enum', expr: 'ag.kind' },
    scopes: { label: 'Phạm vi', type: 'json', expr: 'ag.scopes' },
    status: { label: 'Trạng thái', type: 'enum', expr: 'ag.status' },
    last_call_at: { label: 'Gọi gần nhất', type: 'date', expr: 'ag.last_call_at' },
    wake_limit_per_day: { label: 'Lượt/ngày', type: 'num', expr: 'ag.wake_limit_per_day' },
    // hạn sớm nhất còn hiệu lực của quyền: lớn nhất trong token chưa thu hồi + refresh chưa dùng (token tay không hết hạn → trống)
    expires_at: { label: 'Hết hạn', type: 'date', expr: "(SELECT MAX(x) FROM (SELECT t.expires_at AS x FROM agent_tokens t WHERE t.agent_id=ag.id AND t.revoked_at IS NULL UNION ALL SELECT g.expires_at FROM oauth_grants g WHERE g.agent_id=ag.id AND g.kind='refresh' AND g.used_at IS NULL AND g.revoked_at IS NULL))" },
  },
  sort: 'display_id',
  footer: rows => ({ count: rows.length }),
};

module.exports = { name: 'agents', grid };
