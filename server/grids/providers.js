// © 2026 Gen Labs — All rights reserved.
// Lưới `providers` (DATABASE §5.2). Một file mỗi lưới (SPEC-0.2.0 §2.4): gói sau thêm cột trong file lưới của mình.
// Định nghĩa: { from, where, cols:{khoá:{label,type,expr,search?}}, sort, footer(rows) } — expr là SQL cố định (whitelist), KHÔNG nhận dữ liệu người dùng.
'use strict';
const { sum } = require('./_util');

const grid = {
  from: 'providers pv',
  where: 'pv.workspace_id=? AND pv.deleted_at IS NULL',
  cols: {
    display_id: { label: 'ID', type: 'id', expr: 'pv.display_id', search: true },
    kind: { label: 'Loại', type: 'enum', expr: 'pv.kind' },
    vendor: { label: 'Nhà cung cấp', type: 'text', expr: 'pv.vendor', search: true },
    model: { label: 'Model', type: 'text', expr: 'pv.model', search: true },
    enabled: { label: 'Bật', type: 'bool', expr: 'pv.enabled' },
    models_ready: { label: 'Model sẵn sàng', type: 'num', expr: "(SELECT COUNT(*) FROM json_each(COALESCE(pv.scan,'{}'),'$.models') m WHERE json_extract(m.value,'$.available'))" },
    // gói L (giọng offline): trạng thái sidecar + giọng quét được (STD-10). Gemini không có service ⇒ trống.
    service_state: { label: 'Dịch vụ', type: 'enum', expr: "json_extract(pv.scan,'$.service.state')" },
    voices: { label: 'Giọng', type: 'text', expr: "(SELECT group_concat(v.value, ', ') FROM json_each(COALESCE(pv.scan,'{}'),'$.voices') v)" },
    calls_today: { label: 'Lượt hôm nay', type: 'num', expr: "COALESCE((SELECT u.calls FROM provider_usage u WHERE u.provider_id=pv.id AND u.day=strftime('%Y-%m-%d','now')),0)" },
  },
  sort: 'display_id',
  footer: rows => ({ count: rows.length, calls_today: sum(rows, 'calls_today') }),
};

module.exports = { name: 'providers', grid };
