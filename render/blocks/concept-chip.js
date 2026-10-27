// © 2026 Gen Labs — All rights reserved.
// Khối `concept-chip`: thẻ khái niệm (viên thuốc viền đậm, chữ gõ dần) + dòng chú thích viết tay bên dưới.
// Tham số: { text: string (≤40), sub?: string (≤90) }
(function (root) {
  'use strict';
  var U = (typeof module === 'object' && module.exports) ? require('./util') : root.GSUtil;
  var fsOf = function (text) { return U.clamp(64 * 18 / Math.max(1, text.length), 36, 64); };
  var block = {
    name: 'concept-chip', version: 1, place: 'new', stackOn: [], peak: 0.9, settle: 3,
    schema: { type: 'object', required: ['text'], additionalProperties: false, properties: {
      text: { type: 'string', minLength: 1, maxLength: 40 }, sub: { type: 'string', maxLength: 90 } } },
    footprint: function () { return { w: 1100, h: 260 }; },
    sfx: [{ at: 'in', name: 'pop', vol: 0.45 }],
    mount: function (world, p, ctx) {
      var box = U.box(ctx.slot, 'b-chip');
      box.innerHTML = '<div class="chip"><span class="en"></span></div><div class="csub hand"></div>';
      box.querySelector('.chip').style.fontSize = fsOf(p.text) + 'px';
      box.querySelector('.csub').textContent = p.sub || '';
      world.appendChild(box);
      box._r = { chip: box.querySelector('.chip'), txt: box.querySelector('.en'), sub: box.querySelector('.csub') };
      return box;
    },
    draw: function (el, t, ctx) {
      var r = el._r, p = ctx.chain[0].params, lp = U.eb(U.seg(t, 0, 0.5));
      U.setT(r.chip, 'scale(' + lp + ') rotate(' + ((1 - lp) * -8) + 'deg)', U.clamp(lp * 2));
      var n = Math.round(p.text.length * U.seg(t, 0.15, 0.95));
      r.txt.textContent = p.text.slice(0, n) + (n < p.text.length && n > 0 ? '▌' : '');
      var sp = U.eo(U.seg(t, 0.8, 1.3)); U.setT(r.sub, 'translateY(' + ((1 - sp) * 30) + 'px)', sp);
    }
  };
  if (typeof module === 'object' && module.exports) module.exports = block; else (root.GSBlockDefs = root.GSBlockDefs || {})[block.name] = block;
})(typeof self !== 'undefined' ? self : this);
