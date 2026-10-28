// © 2026 Gen Labs — All rights reserved.
// STUB do gói P0b tạo (SPEC-0.2.0 §4.5, §13.2): gói B (nhận diện kênh) sở hữu file này và thay bằng bản thật. Thuần (không DOM), chạy Node + trình duyệt.
// Hợp đồng mà pipeline/timeline đã gọi:
//   normalize(channelData) → brand | null   — gộp preset + mặc định + chuyển `style.palette` cũ; null ⇒ kênh chưa có nhận diện ⇒ giao diện mặc định v0.1.x (plan.style.brand = null)
//   hash(brand) → chuỗi hex (manifest.brand_hash; đổi brand ⇒ đổi hash) · check(brand) → [lỗi] (lược đồ + tương phản WCAG) · cssVars(brand) → {'--v-paper': …} · PRESETS
// Bản stub: chỉ nhận `channelData.brand` object ⇒ trả nguyên (bản sao) kèm hash SHA-256 của JSON ổn định; không có ⇒ null. Không kiểm tương phản.
(function (root) {
  'use strict';
  var isNode = typeof module === 'object' && module.exports;
  function stable(v) {
    if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
    if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map(function (k) { return JSON.stringify(k) + ':' + stable(v[k]); }).join(',') + '}';
    return JSON.stringify(v);
  }
  var api = {
    stub: true, PRESETS: {},
    normalize: function (data) {
      var b = data && data.brand;
      if (!b || typeof b !== 'object' || Array.isArray(b)) return null;
      var out = JSON.parse(JSON.stringify(b)); delete out.hash;
      out.hash = api.hash(out);
      return out;
    },
    hash: function (brand) {
      if (!brand) return null;
      var o = Object.assign({}, brand); delete o.hash;
      return isNode ? require('node:crypto').createHash('sha256').update(stable(o)).digest('hex').slice(0, 16) : stable(o).length.toString(16);
    },
    check: function () { return []; },
    cssVars: function () { return {}; }
  };
  if (isNode) module.exports = api; else root.GSBrandData = api;
})(typeof self !== 'undefined' ? self : this);
