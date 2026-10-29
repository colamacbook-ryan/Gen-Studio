// © 2026 Gen Labs — All rights reserved.
// G-SAFE (SPEC-0.2.0-F7 §6.2): chữ/khối/logo của clip khung dọc không nằm dưới UI nền tảng (thanh trên, cột nút, vùng caption).
// Luật S1–S6 tính THUẦN ở render/aspects.js safeCheck (một nguồn — agent giả, test, UI cùng gọi); file này chỉ bọc thành kết quả cổng.
//   gateSafe({ aspect, measures, planAspect? }) → { gate:'G-SAFE', result:'pass'|'fail'|'unknown', measure }
//   measures = renderPlan().measures = { duration_s, samples:[{t_ms, kind, beat?, zone?, line?, cam, els:[…]}] } (mẫu window.__measure() ở mốc aspects.sampleTimes).
//   Tỉ lệ không có vùng an toàn (16:9) ⇒ pass, applicable:false (cổng không áp cho bài đó — GATES lọc trước). Không mẫu / mẫu hỏng / lỗi ⇒ unknown ⇒ chặn (INT-08).
//   planAspect khác aspect của bài (bản dựng không theo tỉ lệ đã nộp) ⇒ unknown: số đo không thuộc khung cần kiểm.
'use strict';
const aspects = require('../../render/aspects');

// tỉ lệ của một lesson_versions (cột aspect; NULL ⇒ 16:9 — hàng trước 0.2.0)
const aspectOf = (lv) => (lv && typeof lv.aspect === 'string' && lv.aspect) || '16:9';
// G-SAFE áp ⇔ tỉ lệ của bài có vùng an toàn (`safe` ≠ null trong render/aspects.json)
function applies(lv) { const d = aspects.get(aspectOf(lv)); return !!(d && d.safe); }

function gateSafe({ aspect, measures, planAspect }) {
  try {
    if (planAspect && aspect && planAspect !== aspect)
      return { gate: 'G-SAFE', result: 'unknown', measure: { aspect, plan_aspect: planAspect, text_human: `Bản dựng ở tỉ lệ ${planAspect} nhưng bài khai ${aspect}; số đo vùng an toàn không dùng được — bản dựng bị chặn.` } };
    const r = aspects.safeCheck(aspect, measures);
    return { gate: 'G-SAFE', result: r.result, measure: r.measure };
  } catch (e) {
    return { gate: 'G-SAFE', result: 'unknown', measure: { aspect: aspect || null, error: String((e && e.message) || e), text_human: 'Không đo được vùng an toàn — bản dựng bị chặn.' } };
  }
}

module.exports = { gateSafe, applies, aspectOf };
