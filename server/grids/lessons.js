// © 2026 Gen Labs — All rights reserved.
// Lưới `lessons` (DATABASE §5.2). Một file mỗi lưới (SPEC-0.2.0 §2.4): gói sau thêm cột trong file lưới của mình.
// Định nghĩa: { from, where, cols:{khoá:{label,type,expr,search?}}, sort, footer(rows) } — expr là SQL cố định (whitelist), KHÔNG nhận dữ liệu người dùng.
'use strict';
const { sum } = require('./_util');

const grid = {
  from: 'lessons l LEFT JOIN channels ch ON ch.id=l.channel_id LEFT JOIN curriculum_nodes cu ON cu.id=l.curriculum_node_id LEFT JOIN renders lr ON lr.id=l.latest_render_id LEFT JOIN lesson_versions lv ON lv.lesson_id=l.id AND lv.version=l.current_version',
  where: 'l.workspace_id=? AND l.deleted_at IS NULL',
  cols: {
    display_id: { label: 'ID', type: 'id', expr: 'l.display_id', search: true },
    title: { label: 'Tiêu đề', type: 'text', expr: 'l.title', search: true },
    channel: { label: 'Kênh', type: 'id', expr: 'ch.display_id' },
    node: { label: 'Mục giáo trình', type: 'id', expr: 'cu.display_id' },
    version: { label: 'Version', type: 'num', expr: 'l.current_version' },
    render: { label: 'Render', type: 'id', expr: 'lr.display_id' },
    state: { label: 'Trạng thái', type: 'enum', expr: 'lr.state' },
    duration_ms: { label: 'Thời lượng', type: 'ms', expr: 'lr.duration_ms' },
    updated_at: { label: 'Cập nhật', type: 'date', expr: 'l.updated_at' },
    // 0.2.0 (thêm sẵn, SPEC §13.2): loại bài (lesson | tutorial…) và bài có đặc tả ảnh bìa không
    kind: { label: 'Loại', type: 'enum', expr: 'lv.kind' },
    thumbnail: { label: 'Ảnh bìa', type: 'bool', expr: 'lv.thumbnail IS NOT NULL' },
    // F7: tỉ lệ khung của version hiện hành (NULL = 16:9); lọc được bằng `aspect:9:16`
    aspect: { label: 'Tỉ lệ', type: 'enum', expr: "COALESCE(lv.aspect,'16:9')" },
  },
  sort: '-updated_at',
  footer: rows => ({ count: rows.length, total_duration_ms: sum(rows, 'duration_ms') }),
};

module.exports = { name: 'lessons', grid };
