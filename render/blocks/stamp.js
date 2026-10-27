// © 2026 Gen Labs — All rights reserved.
// Khối `stamp`: con dấu đập xuống (phóng to 2,6× rồi thu về, nghiêng −8°), engine rung máy quay ở khoảnh khắc chạm.
// Đặt chồng lên khối liền trước (cùng ô, canh giữa). Tham số: { text: string (≤28), sub: string (≤70, có thể rỗng) }
(function (root) {
  'use strict';
  var U = (typeof module === 'object' && module.exports) ? require('./util') : root.GSUtil;
  var block = {
    name: 'stamp', version: 1, place: 'over', stackOn: [], peak: 0.22, impact: 0.22, settle: 2,
    schema: { type: 'object', required: ['text'], additionalProperties: false, properties: {
      text: { type: 'string', minLength: 1, maxLength: 28 }, sub: { type: 'string', maxLength: 70 } } },
    footprint: function () { return { w: 1000, h: 280 }; },
    sfx: [{ at: 'peak', name: 'wham', vol: 0.6 }],
    mount: function (world, p, ctx) {
      var box = U.box(ctx.slot, 'b-stamp'), fs = U.clamp(86 * 16 / Math.max(1, p.text.length), 44, 86);
      box.innerHTML = '<div class="st"><b style="font-size:' + fs + 'px"></b><span></span></div>';
      box.querySelector('b').textContent = p.text; box.querySelector('span').textContent = p.sub || '';
      world.appendChild(box); box._r = { st: box.querySelector('.st') };
      return box;
    },
    draw: function (el, t) { var st = U.seg(t, 0, 0.22); U.setT(el._r.st, 'rotate(-8deg) scale(' + U.lerp(2.6, 1, U.eo(st)) + ')', U.clamp(st * 3)); }
  };
  if (typeof module === 'object' && module.exports) module.exports = block; else (root.GSBlockDefs = root.GSBlockDefs || {})[block.name] = block;
})(typeof self !== 'undefined' ? self : this);
