// © 2026 Gen Labs — All rights reserved.
// Khối `token-row`: hàng token hiện lần lượt, kết bằng ô "?" nét đứt; chú thích gạch chân vàng hiện ở mốc peak (neo phụ) hoặc sau hàng token.
// Tham số: { tokens: string[] (1–8, mỗi token ≤24), next?: string (≤60, chú thích dưới hàng, vd "next token prediction") }
(function (root) {
  'use strict';
  var U = (typeof module === 'object' && module.exports) ? require('./util') : root.GSUtil;
  function scaleOf(tokens) { var w = tokens.reduce(function (s, x) { return s + U.textW(x, 50) + 70; }, 0) + 120; return Math.min(1, 1360 / w); }
  var block = {
    name: 'token-row', version: 1, place: 'stack', stackOn: ['concept-chip', 'illustration'], peak: 1.0, settle: Infinity,
    schema: { type: 'object', required: ['tokens'], additionalProperties: false, properties: {
      tokens: { type: 'array', minItems: 1, maxItems: 8, items: { type: 'string', minLength: 1, maxLength: 24 } },
      next: { type: 'string', maxLength: 60 } } },
    footprint: function () { return { w: 1400, h: 280 }; },
    sfx: [{ at: 'in', name: 'pop', vol: 0.3 }, { at: 'peak', name: 'sparkle', vol: 0.35 }],
    mount: function (world, p, ctx) {
      var box = U.box(ctx.slot, 'b-tokens'), s = scaleOf(p.tokens);
      box.innerHTML = '<div class="row" style="transform:scale(' + s + ')">' + p.tokens.map(function (x) { return '<span class="tok">' + U.esc(x) + '</span>'; }).join('') + '<span class="tok q">?</span></div>' +
        '<div class="ntp"><span class="en">' + (p.next ? '= ' + U.esc(p.next) : '') + '</span><svg width="640" height="24" viewBox="0 0 640 24"><path d="M4 14 C180 4 420 22 636 10" fill="none" stroke="#FFD84A" stroke-width="12" stroke-linecap="round" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1"/></svg></div>';
      world.appendChild(box);
      box._r = { toks: [].slice.call(box.querySelectorAll('.tok')), ntp: box.querySelector('.ntp'), line: box.querySelector('.ntp path') };
      return box;
    },
    draw: function (el, t, ctx) {
      var r = el._r, n = r.toks.length;
      r.toks.forEach(function (k, i) { var p = U.eb(U.seg(t, i * 0.16, i * 0.16 + 0.4)); var q = i === n - 1 && t > n * 0.16 + 0.4 ? 1 + 0.08 * Math.sin(t * 7) : 1; U.setT(k, 'translateY(' + ((1 - p) * 60) + 'px) scale(' + (U.lerp(0.6, 1, p) * q) + ')', U.clamp(p * 2)); });
      var pk = ctx.peak, np = U.eo(U.seg(t, pk - 0.25, pk + 0.35));
      U.setT(r.ntp, 'translateX(' + ((1 - np) * 80) + 'px)', np); U.dash(r.line, U.eo(U.seg(t, pk + 0.3, pk + 1.0)));
    }
  };
  if (typeof module === 'object' && module.exports) module.exports = block; else (root.GSBlockDefs = root.GSBlockDefs || {})[block.name] = block;
})(typeof self !== 'undefined' ? self : this);
