// © 2026 Gen Labs — All rights reserved.
// F7 (SPEC-0.2.0-F7 §3.6) — GET /api/aspects: danh mục tỉ lệ khung cho giao diện. CÙNG object với get_capabilities.aspects
// ({version, default, aspects:[{id,size,token,kinds,presets,enabled,default,safe,target_s,min_font_px,blocks,thumbnail_templates}], presets:[…]}); fixture hợp đồng test/fixtures/api-aspects.json.
// Cần phiên đăng nhập (mọi vai đọc được). Cache theo `version` của render/aspects.json (ETag); dữ liệu chỉ đổi khi sửa file + khởi động lại.
'use strict';
const { catalogFor } = require('../ops/aspect.js');

function register(add) {
  add('GET', '/api/aspects', { sess: true }, async () => {
    const body = catalogFor();
    return { status: 200, body, headers: { ETag: `W/"aspects-v${body.version}"`, 'Cache-Control': 'private, max-age=60' } };
  });
}

module.exports = { register };
