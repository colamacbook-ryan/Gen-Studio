// © 2026 Gen Labs — All rights reserved.
// STUB do gói P0b tạo (SPEC-0.2.0 §5.5, §13.2): gói T (ảnh bìa) sở hữu file này và thay bằng bản thật. Thuần (không DOM), chạy Node.
//   resolveThumbs(thumbnail, plan, ctx?) → specs[]   — đặc tả bài (`lesson_versions.thumbnail`) → phương án đã phân giải cho sân khấu (lấy khối của beat, cast, brand); mỗi spec đưa thẳng vào
//                                                      __still('thumb', spec) (renderPlan gọi 2 lần: có chữ / textOff:true). Hook plan.after của gói T gán kết quả vào plan.thumbs.
//   measure(specs, domMeasures, pixels) → measure của G-THUMB: { variants:[{index, pass, score, …}] } — pipeline đọc measure.variants[] để chọn phương án đạt ⇒ outputs.thumbs.
// Bản stub: không có phương án nào.
'use strict';

function resolveThumbs(thumbnail, plan, ctx) { return []; }
function measure(specs, domMeasures, pixels) { return { variants: [] }; }

module.exports = { resolveThumbs, measure, stub: true };
