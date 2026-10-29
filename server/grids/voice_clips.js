// © 2026 Gen Labs — All rights reserved.
// Lưới `voice_clips` (DATABASE §5.2). Một file mỗi lưới (SPEC-0.2.0 §2.4): gói sau thêm cột trong file lưới của mình.
// Định nghĩa: { from, where, cols:{khoá:{label,type,expr,search?}}, sort, footer(rows) } — expr là SQL cố định (whitelist), KHÔNG nhận dữ liệu người dùng.
'use strict';
const { sum } = require('./_util');

const grid = {
  from: 'voice_clips vc',
  where: 'vc.workspace_id=?',
  cols: {
    display_id: { label: 'ID', type: 'id', expr: 'vc.display_id', search: true },
    say: { label: 'Lời', type: 'text', expr: 'vc.say', search: true },
    voice: { label: 'Giọng', type: 'text', expr: 'vc.voice' },
    model: { label: 'Model', type: 'text', expr: 'vc.model' },
    duration_ms: { label: 'Thời lượng', type: 'ms', expr: 'vc.duration_ms' },
    created_at: { label: 'Tạo lúc', type: 'date', expr: 'vc.created_at' },
  },
  sort: '-created_at',
  footer: rows => ({ count: rows.length, total_duration_ms: sum(rows, 'duration_ms') }),
};

module.exports = { name: 'voice_clips', grid };
