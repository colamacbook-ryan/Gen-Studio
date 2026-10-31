// © 2026 Gen Labs — All rights reserved.
// Lưới `kit_submissions` (0.3.0 gói D — A2 Hàng chờ duyệt, nhóm «Sản xuất»). Một file mỗi lưới (SPEC-0.2.0 §2.4).
// Định nghĩa: { from, where, cols:{khoá:{label,type,expr,search?}}, sort, footer(rows) } — expr là SQL cố định (whitelist), KHÔNG nhận dữ liệu người dùng.
'use strict';

const grid = {
  from: 'asset_submissions s LEFT JOIN kit_slots ks ON ks.code=s.kit_slot AND ks.workspace_id=s.workspace_id LEFT JOIN assets a ON a.id=s.asset_id LEFT JOIN agents ag ON ag.id=s.agent_id',
  where: 's.workspace_id=?',
  cols: {
    display_id: { label: 'ID', type: 'id', expr: 's.display_id', search: true },
    kit_slot: { label: 'Ô Bộ Neo', type: 'text', expr: 's.kit_slot', search: true },
    group_code: { label: 'Nhóm', type: 'enum', expr: 'ks.group_code' },
    state: { label: 'Trạng thái', type: 'enum', expr: 's.state' },
    checks_level: { label: 'Kiểm máy', type: 'enum', expr: "COALESCE(s.checks_level,'pending')" },
    decision_kind: { label: 'Quyết bởi loại', type: 'enum', expr: "COALESCE(s.decision_kind,'')" },
    attempt: { label: 'Lần nộp', type: 'num', expr: 's.attempt' },
    agent: { label: 'Agent', type: 'id', expr: 'ag.display_id' },
    asset: { label: 'Tài sản', type: 'id', expr: 'a.display_id' },
    mime: { label: 'MIME', type: 'text', expr: 'a.mime' },
    bytes: { label: 'Dung lượng', type: 'num', expr: 'a.bytes' },
    decision_reason: { label: 'Lý do', type: 'text', expr: 's.decision_reason', search: true },
    created_at: { label: 'Nộp lúc', type: 'date', expr: 's.created_at' },
  },
  sort: '-created_at',
  footer: rows => ({ count: rows.length }),
};

module.exports = { name: 'kit_submissions', grid };
