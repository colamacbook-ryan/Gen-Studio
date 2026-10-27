// © 2026 Gen Labs — All rights reserved.
// Khối `end-card`: thẻ kết (nền vàng, bóng đậm) hiện trên lớp màn hình (HUD), không nằm trên trang vở nên không bị máy quay kéo theo.
// Tham số: { title: string (≤40, tên kênh/series), sub?: string (≤80, tên bài), next?: string (≤80, gợi ý bài sau) }
(function (root) {
  'use strict';
  var U = (typeof module === 'object' && module.exports) ? require('./util') : root.GSUtil;
  var block = {
    name: 'end-card', version: 1, place: 'hud', stackOn: [], peak: 0.35, settle: 2,
    schema: { type: 'object', required: ['title'], additionalProperties: false, properties: {
      title: { type: 'string', minLength: 1, maxLength: 40 }, sub: { type: 'string', maxLength: 80 }, next: { type: 'string', maxLength: 80 } } },
    footprint: function () { return { w: 1100, h: 300 }; },
    sfx: [{ at: 'in', name: 'rimshot', vol: 0.35, dt: 350 }],
    mount: function (world, p, ctx) {
      var e = U.el('div', 'end-card'); e.innerHTML = '<b></b><span></span><small></small>';
      e.querySelector('b').textContent = p.title; e.querySelector('span').textContent = p.sub || ''; e.querySelector('small').textContent = p.next || '';
      e.querySelector('b').style.fontSize = U.clamp(92 * 16 / Math.max(1, p.title.length), 48, 92) + 'px';
      ctx.hud.appendChild(e); return e;
    },
    draw: function (el, t) { var ep = U.seg(t, 0, 0.55); U.setT(el, 'translate(-50%,-50%) rotate(-2deg) scale(' + U.eb(ep) + ')', U.clamp(ep * 3)); }
  };
  if (typeof module === 'object' && module.exports) module.exports = block; else (root.GSBlockDefs = root.GSBlockDefs || {})[block.name] = block;
})(typeof self !== 'undefined' ? self : this);
