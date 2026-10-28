// © 2026 Gen Labs — All rights reserved.
// Lưới `assets` (DATABASE §5.2). Một file mỗi lưới (SPEC-0.2.0 §2.4): gói sau thêm cột trong file lưới của mình.
// Định nghĩa: { from, where, cols:{khoá:{label,type,expr,search?}}, sort, footer(rows) } — expr là SQL cố định (whitelist), KHÔNG nhận dữ liệu người dùng.
'use strict';
const { sum } = require('./_util');

const { RIGHTS_SQL } = require('../rights');

const grid = {
  from: 'assets a',
  where: 'a.workspace_id=?',
  cols: {
    display_id: { label: 'ID', type: 'id', expr: 'a.display_id', search: true },
    kind: { label: 'Loại', type: 'enum', expr: 'a.kind' },
    mime: { label: 'MIME', type: 'text', expr: 'a.mime' },
    bytes: { label: 'Dung lượng', type: 'num', expr: 'a.bytes' },
    media_present: { label: 'Còn tệp', type: 'bool', expr: 'a.media_present' },
    source: { label: 'Nguồn', type: 'enum', expr: 'a.source' },
    created_at: { label: 'Tạo lúc', type: 'date', expr: 'a.created_at' },
    // 0.2.0 (thêm sẵn, SPEC §13.2/§6.10): vai trò do agent khai (chỉ là gợi ý) và trạng thái quyền dùng: attested | pending | exempt (D0: #/assets?q=rights:pending)
    role: { label: 'Vai trò', type: 'text', expr: "CASE WHEN json_valid(a.meta) THEN json_extract(a.meta,'$.role') END", search: true },
    rights: { label: 'Quyền', type: 'enum', expr: RIGHTS_SQL },
  },
  sort: '-created_at',
  footer: rows => ({ count: rows.length, total_bytes: sum(rows, 'bytes') }),
};

module.exports = { name: 'assets', grid };
