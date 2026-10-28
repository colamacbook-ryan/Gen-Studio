// © 2026 Gen Labs — All rights reserved.
// Lưới `runs` (DATABASE §5.2). Một file mỗi lưới (SPEC-0.2.0 §2.4): gói sau thêm cột trong file lưới của mình.
// Định nghĩa: { from, where, cols:{khoá:{label,type,expr,search?}}, sort, footer(rows) } — expr là SQL cố định (whitelist), KHÔNG nhận dữ liệu người dùng.
'use strict';

const grid = {
  from: 'runs rn LEFT JOIN renders r ON r.id=rn.render_id LEFT JOIN work_orders w ON w.id=rn.work_order_id',
  where: 'rn.workspace_id=?',
  cols: {
    display_id: { label: 'ID', type: 'id', expr: 'rn.display_id', search: true },
    kind: { label: 'Loại', type: 'enum', expr: 'rn.kind' },
    state: { label: 'Trạng thái', type: 'enum', expr: 'rn.state' },
    render: { label: 'Render', type: 'id', expr: 'r.display_id' },
    work_order: { label: 'Lệnh', type: 'id', expr: 'w.display_id' },
    attempt: { label: 'Lần', type: 'num', expr: 'rn.attempt' },
    progress: { label: 'Tiến độ', type: 'num', expr: 'rn.progress' },
    started_at: { label: 'Bắt đầu', type: 'date', expr: 'rn.started_at' },
    finished_at: { label: 'Kết thúc', type: 'date', expr: 'rn.finished_at' },
    calls: { label: 'Lượt gọi', type: 'num', expr: "COALESCE(json_extract(rn.cost,'$.calls'),0)" },
    error: { label: 'Lỗi', type: 'text', expr: "json_extract(rn.error,'$.text_human')", search: true },
  },
  sort: '-started_at',
  footer: rows => {
    const day = new Date().toISOString().slice(0, 10);
    return { count: rows.length, calls_today: rows.filter(r => String(r.started_at || '').startsWith(day)).reduce((a, r) => a + (r.calls || 0), 0) };
  },
};

module.exports = { name: 'runs', grid };
