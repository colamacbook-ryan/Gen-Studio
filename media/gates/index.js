// © 2026 Gen Labs — All rights reserved.
// Cổng kiểm R3: voiceGates (từng câu) + renderGates (bản dựng). 'unknown' luôn chặn.
// GATES (SPEC-0.2.0 §2.5): danh sách cổng theo loại bài — 8 cổng R3 cũ luôn áp; G-THUMB áp khi bài có `thumbnail`; G-CURSOR chỉ cho `tutorial`.
// Cài đặt G-THUMB (gói T) và G-CURSOR (gói U) nằm ở media/gates/thumb.js, cursor.js; ở đây chỉ khai danh sách để pipeline/UI đọc, không hardcode 8 cổng.
// G-SAFE (F7 §6.2, gói A2): áp khi tỉ lệ của bài (lv.aspect, NULL ⇒ 16:9) có vùng an toàn trong render/aspects.json ⇒ mọi bài 9:16, không bài 16:9 nào (M14).
'use strict';
const { voiceGates, tailSig } = require('./voice');
const { renderGates } = require('./render');
const safe = require('./safe');

// Tổng hợp: có fail → 'fail'; không fail mà có unknown → 'unknown'; còn lại 'pass'.
function summarize(results) {
  return results.some((r) => r.result === 'fail') ? 'fail' : results.some((r) => r.result !== 'pass') ? 'unknown' : 'pass';
}

// lv = lesson_versions row (hoặc object có `thumbnail`); thumbnail rỗng/null ⇒ không áp G-THUMB (bài cũ, kênh chưa bật luật — CNS-086)
const hasThumb = (lv) => !!lv && lv.thumbnail !== undefined && lv.thumbnail !== null && lv.thumbnail !== '';
const GATES = [
  { id: 'G-WAV', applies: () => true }, { id: 'G-SCRIPT', applies: () => true }, { id: 'G-PRON', applies: () => true },
  { id: 'G-LOUD', applies: () => true }, { id: 'G-SYNC', applies: () => true }, { id: 'G-MOTION', applies: () => true },
  { id: 'G-FRAMES', applies: () => true }, { id: 'G-MUX', applies: () => true },
  // G-THUMB theo DỮ LIỆU bài (CNS-086): áp khi và chỉ khi bài có `thumbnail`. Bài tutorial luôn có thumbnail khi tính năng ảnh bìa (gói T) đã bật —
  // luật đó nằm ở lessonExt của gói U (server/ops/tutorial.js), không ở đây (gói U, 0.2.0: tutorial chưa có thumbnail thì không đòi cổng chưa cài).
  { id: 'G-THUMB', applies: (kind, lv) => hasThumb(lv) },
  { id: 'G-SAFE', applies: (kind, lv) => safe.applies(lv) },
  { id: 'G-CURSOR', applies: (kind) => kind === 'tutorial' },
];
// Mã các cổng áp cho một bài, theo thứ tự GATES
function gatesFor(kind, lv) { return GATES.filter((g) => g.applies(kind || 'lesson', lv)).map((g) => g.id); }

module.exports = { GATES, gatesFor, voiceGates, renderGates, tailSig, summarize };
