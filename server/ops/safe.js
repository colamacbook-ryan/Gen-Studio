// © 2026 Gen Labs — All rights reserved.
// Gói A2 (SPEC-0.2.0-F7 §6.2): cài đặt cổng G-SAFE qua write.ext.gates — không op ghi nào, không đụng lõi.
// GATES (media/gates/index.js) quyết định cổng có áp cho bài không (tỉ lệ của bài có `safe` ⇒ mọi bài 9:16); ở đây chỉ đo:
//   aspect = lesson_versions.aspect (giá trị đã phân giải lúc nộp; NULL ⇒ 16:9), measures = renderPlan().measures (render/render.js, mẫu __measure ở aspects.sampleTimes).
//   Plan dựng ở tỉ lệ khác bài (lỗi nối dữ liệu) ⇒ unknown ⇒ chặn. Số đo đầy đủ (vi phạm có mép/hộp/câu/beat) đi vào gate_results.measure ⇒ WO unblock cho agent.
'use strict';
const { gateSafe, aspectOf } = require('../../media/gates/safe.js');

function register(op, ctx) {
  ctx.ext.gates.register('G-SAFE', async ({ B, plan, rendered }) =>
    gateSafe({ aspect: aspectOf(B && B.lv), planAspect: (plan && plan.aspect) || '16:9', measures: rendered && rendered.measures }));
}

module.exports = { register, OWNER: 'A2' };
