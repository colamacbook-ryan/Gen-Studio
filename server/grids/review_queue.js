// © 2026 Gen Labs — All rights reserved.
// Lưới `review_queue` (DATABASE §5.2). Một file mỗi lưới (SPEC-0.2.0 §2.4): gói sau thêm cột trong file lưới của mình.
// Định nghĩa: { from, where, cols:{khoá:{label,type,expr,search?}}, sort, footer(rows) } — expr là SQL cố định (whitelist), KHÔNG nhận dữ liệu người dùng.
'use strict';
const { sum } = require('./_util');
const AGENT_OF_RENDER = '(SELECT a.display_id FROM lesson_versions lv2 JOIN work_orders w ON w.id=lv2.work_order_id JOIN agents a ON a.id=w.agent_id WHERE lv2.id=r.lesson_version_id)';

const grid = {
  from: 'renders r JOIN lesson_versions lv ON lv.id=r.lesson_version_id JOIN lessons l ON l.id=lv.lesson_id',
  where: "r.workspace_id=? AND r.state='awaiting_review'",
  cols: {
    display_id: { label: 'ID', type: 'id', expr: 'r.display_id', search: true },
    render: { label: 'Render', type: 'id', expr: 'r.display_id' },
    state: { label: 'Trạng thái', type: 'enum', expr: 'r.state' },
    lesson: { label: 'Bài', type: 'id', expr: 'l.display_id' },
    title: { label: 'Tiêu đề', type: 'text', expr: 'l.title', search: true },
    version: { label: 'Version', type: 'num', expr: 'lv.version' },
    duration_ms: { label: 'Thời lượng', type: 'ms', expr: 'r.duration_ms' },
    waiting_since: { label: 'Chờ từ', type: 'date', expr: 'r.state_changed_at' },
    agent: { label: 'Agent', type: 'id', expr: AGENT_OF_RENDER },
    // 0.2.0 (thêm sẵn cho UI-R2/D0, SPEC §13.2): loại bài, có ảnh bìa không, số nhân vật chưa chốt trong bài (CNS-110)
    kind: { label: 'Loại', type: 'enum', expr: 'lv.kind' },
    aspect: { label: 'Tỉ lệ', type: 'enum', expr: "COALESCE(lv.aspect,'16:9')" },   // F7 (NULL = 16:9)
    thumbs: { label: 'Ảnh bìa', type: 'bool', expr: "COALESCE(json_array_length(json_extract(r.outputs,'$.thumbs')),0)>0" },
    cast_unapproved: { label: 'Nhân vật chưa chốt', type: 'num', expr: "(SELECT COUNT(DISTINCT cm.id) FROM lines ln2 JOIN cast_members cm ON cm.id=ln2.cast_member_id WHERE ln2.lesson_version_id=lv.id AND cm.status!='approved')" },
  },
  sort: '-waiting_since',
  footer: rows => ({ count: rows.length, total_duration_ms: sum(rows, 'duration_ms') }),
};

module.exports = { name: 'review_queue', grid };
