// © 2026 Gen Labs — All rights reserved.
// Khối `end-card` (v2): thẻ kết (nền nhấn vàng, bóng đậm) hiện trên lớp màn hình (HUD), không nằm trên trang vở nên không bị máy quay kéo theo.
// Tham số: { title: string (≤40, tên kênh/series), sub?: string (≤80, tên bài), next?: string (≤80, gợi ý bài sau),
//            cta?: string (≤40, lời kêu gọi; không có thì lấy brand.end_card.cta), url_label?: string (≤40, chữ thường, KHÔNG phải link — trailer F4 dùng) }
// Nhận diện kênh (SPEC §4.5): có plan.style.brand ⇒ thêm logo (khi logo.show có "end_card"), CTA và gợi ý bài sau theo brand.end_card.next_hint. Không có brand ⇒ y như v1.
(function (root) {
  'use strict';
  var U = (typeof module === 'object' && module.exports) ? require('./util') : root.GSUtil;
  var block = {
    name: 'end-card', version: 2, place: 'hud', stackOn: [], peak: 0.35, settle: 2,
    schema: { type: 'object', required: ['title'], additionalProperties: false, properties: {
      title: { type: 'string', minLength: 1, maxLength: 40 }, sub: { type: 'string', maxLength: 80 }, next: { type: 'string', maxLength: 80 },
      cta: { type: 'string', maxLength: 40 }, url_label: { type: 'string', maxLength: 40 } } },
    footprint: function () { return { w: 1100, h: 300 }; },
    sfx: [{ at: 'in', name: 'rimshot', vol: 0.35, dt: 350 }],
    mount: function (world, p, ctx) {
      var brand = ctx.plan && ctx.plan.style && ctx.plan.style.brand || null, ec = brand && brand.end_card || null;
      var e = U.el('div', 'end-card'); e.innerHTML = '<b></b><span></span><small></small>';
      e.querySelector('b').textContent = p.title; e.querySelector('span').textContent = p.sub || '';
      e.querySelector('small').textContent = (ec && ec.next_hint === false) ? '' : (p.next || '');
      e.querySelector('b').style.fontSize = U.clamp(92 * 16 / Math.max(1, p.title.length), 48, 92) + 'px';
      var cta = p.cta || (ec && ec.cta) || '', url = (p.url_label || '').toLowerCase();   // url_label: chữ thường, không bao giờ là link
      if (cta || url) {
        var c = U.el('small', 'ec-cta'); c.textContent = [cta, url].filter(Boolean).join(' · ');
        e.appendChild(c);
      }
      if (brand && brand.logo && brand.logo.ref && brand.logo.show.indexOf('end_card') >= 0) {
        var u = ctx.assetUrl(brand.logo.ref);
        if (u) { var im = U.el('img', 'ec-logo'); im.src = u; im.alt = ''; e.insertBefore(im, e.firstChild); }
      }
      ctx.hud.appendChild(e); return e;
    },
    draw: function (el, t) { var ep = U.seg(t, 0, 0.55); U.setT(el, 'translate(-50%,-50%) rotate(-2deg) scale(' + U.eb(ep) + ')', U.clamp(ep * 3)); }
  };
  if (typeof module === 'object' && module.exports) module.exports = block; else (root.GSBlockDefs = root.GSBlockDefs || {})[block.name] = block;
})(typeof self !== 'undefined' ? self : this);
