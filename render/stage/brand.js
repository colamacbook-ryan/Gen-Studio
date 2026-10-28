// © 2026 Gen Labs — All rights reserved.
// STUB do gói P0b tạo (SPEC-0.2.0 §4.5, §13.2): gói B sở hữu file này. Nạp SAU stage.js/still.js.
//   GSBrand.apply(rootEl, brand) — đặt biến CSS --v-*, gắn logo, dựng lower-third + intro (HUD, chỉ transform/opacity). stage.js gọi 1 lần lúc __load khi plan.style.brand ≠ null.
//   GSBrand.inkFilter(svg, brand) → svg — thay GC.INK (#2b211d) bằng brand.tokens.ink trong SVG nhân vật; stage.js CHỈ gọi khi chuỗi SVG đổi (CNS-088), không mỗi khung.
//   GSStill.brand(payload) — xem trước nhận diện (renderStill mode 'brand'); stub P0a trong still.js vẫn đang dùng (measures.stub = true).
// Bản stub: apply no-op, inkFilter trả nguyên.
(function () {
  'use strict';
  window.GSBrand = window.GSBrand || {
    stub: true,
    apply: function (rootEl, brand) { /* no-op */ },
    inkFilter: function (svg, brand) { return svg; }
  };
})();
