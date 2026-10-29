// © 2026 Gen Labs — All rights reserved.
// F7 (SPEC-0.2.0-F7 §3.5) — get_capabilities.aspects = render/aspects.js catalog() (cỡ, token, loại bài, preset nền tảng, vùng an toàn, thời lượng mục tiêu, khối và mẫu ảnh bìa theo tỉ lệ)
// + aspect_default (tỉ lệ mặc định của kênh đang xem). Chỉ cấp `capabilities(ctx, args)` — không sửa capabilities.js, không có tool mới (agent không ĐẶT được default_aspect / work_orders.aspect, §9).
'use strict';
const { catalogFor, channelDefault } = require('../ops/aspect.js');
const { kit } = require('./_kit.js');

function capabilities(ctx, args) {
  const out = { aspects: catalogFor() };
  try {
    const { channelOf, chanData } = kit(ctx);
    out.aspect_default = channelDefault(chanData(channelOf(args && args.channel)));
  } catch (e) { if (!(e && e.code === 'not_found')) throw e; out.aspect_default = out.aspects.default; }
  return out;
}

module.exports = { capabilities };
