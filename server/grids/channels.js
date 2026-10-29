// © 2026 Gen Labs — All rights reserved.
// Lưới `channels` (DATABASE §5.2). Một file mỗi lưới (SPEC-0.2.0 §2.4): gói sau thêm cột trong file lưới của mình.
// Định nghĩa: { from, where, cols:{khoá:{label,type,expr,search?}}, sort, footer(rows) } — expr là SQL cố định (whitelist), KHÔNG nhận dữ liệu người dùng.
'use strict';

const grid = {
  from: 'channels ch',
  where: 'ch.workspace_id=? AND ch.deleted_at IS NULL',
  cols: {
    display_id: { label: 'ID', type: 'id', expr: 'ch.display_id', search: true },
    name: { label: 'Tên', type: 'text', expr: 'ch.name', search: true },
    lang_primary: { label: 'Ngôn ngữ', type: 'enum', expr: 'ch.lang_primary' },
    lang_terms: { label: 'Ngôn ngữ thuật ngữ', type: 'enum', expr: 'ch.lang_terms' },
    version: { label: 'Version', type: 'num', expr: 'ch.current_version' },
    schedule: { label: 'Lịch', type: 'text', expr: "COALESCE(json_extract((SELECT data FROM channel_versions v WHERE v.entity_id=ch.id AND v.version=ch.current_version),'$.schedule.time'), json_extract((SELECT data FROM channel_versions v WHERE v.entity_id=ch.id AND v.version=ch.current_version),'$.schedule.cron'))" },
    // F7: tỉ lệ mặc định (default_aspect, bí danh cũ `aspect`; thiếu = 16:9)
    default_aspect: { label: 'Tỉ lệ mặc định', type: 'enum', expr: "COALESCE(json_extract((SELECT data FROM channel_versions v WHERE v.entity_id=ch.id AND v.version=ch.current_version),'$.default_aspect'), json_extract((SELECT data FROM channel_versions v WHERE v.entity_id=ch.id AND v.version=ch.current_version),'$.aspect'), '16:9')" },
  },
  sort: 'display_id',
  footer: rows => ({ count: rows.length }),
};

module.exports = { name: 'channels', grid };
