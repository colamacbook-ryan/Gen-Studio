// © 2026 Gen Labs — All rights reserved.
// Khối `title`: tiêu đề bài — từng chữ nảy vào, chữ nhấn có vạch highlight vàng, gạch chân vẽ dần.
// Tham số: { text: string (≤80), highlight?: string[] (cụm chữ nhấn, ≤8) } — chữ thuộc thuật ngữ tiếng Anh của bài tự đổi sang tím nghiêng.
(function (root) {
  'use strict';
  var U = (typeof module === 'object' && module.exports) ? require('./util') : root.GSUtil;
  var norm = function (w) { return w.toLowerCase().replace(/[.,;:!?"'“”‘’()]/g, ''); };
  function layout(text) {
    var lines = U.balance(text, 18), longest = Math.max.apply(null, lines.map(function (l) { return l.length; }));
    return { lines: lines, fs: U.clamp(112 * 16 / longest, 64, 112) };
  }
  function marks(words, highlight) {
    var m = words.map(function () { return false; }), nw = words.map(norm);
    (highlight || []).forEach(function (ph) {
      var toks = ph.trim().split(/\s+/).map(norm);
      for (var i = 0; i + toks.length <= nw.length; i++) if (toks.every(function (x, j) { return nw[i + j] === x; })) for (var j = 0; j < toks.length; j++) m[i + j] = true;
    });
    return m;
  }
  var block = {
    name: 'title', version: 1, place: 'new', stackOn: [], intro: true, peak: 0.5, settle: 3,
    schema: { type: 'object', required: ['text'], additionalProperties: false, properties: {
      text: { type: 'string', minLength: 1, maxLength: 80 },
      highlight: { type: 'array', maxItems: 8, items: { type: 'string', minLength: 1, maxLength: 40 } } } },
    footprint: function (aspect, p) { var L = layout((p && p.text) || 'Tiêu đề'); return { w: 1300, h: Math.round(L.lines.length * L.fs * 1.1 + 90) }; },
    sfx: [{ at: 'in', name: 'pop', vol: 0.35 }, { at: 'peak', name: 'swish', vol: 0.25 }],
    mount: function (world, p, ctx) {
      var L = layout(p.text), box = U.box(ctx.slot, 'b-title'); box.style.fontSize = L.fs + 'px';
      var words = [], hl = marks(p.text.trim().split(/\s+/), p.highlight), k = 0;
      var h = L.lines.map(function (line) {
        return '<div class="tl">' + line.split(/\s+/).map(function (w) {
          var cls = 'wd' + (hl[k++] ? ' hl' : '') + (ctx.terms.indexOf(norm(w)) >= 0 ? ' en' : '');
          return '<span class="' + cls + '">' + U.esc(w) + '</span>';
        }).join(' ') + '</div>';
      }).join('');
      box.innerHTML = h + '<svg class="scr" width="880" height="60" viewBox="0 0 880 60"><path d="M6 40 C160 10 300 52 450 30 S760 14 874 34" fill="none" stroke="#FF6F59" stroke-width="9" stroke-linecap="round" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1"/></svg>';
      world.appendChild(box);
      box._r = { words: [].slice.call(box.querySelectorAll('.wd')), path: box.querySelector('.scr path') };
      return box;
    },
    draw: function (el, t) {
      var r = el._r;
      r.words.forEach(function (w, i) { var p = U.eb(U.seg(t, i * 0.07, 0.44 + i * 0.07)); U.setT(w, 'translateY(' + ((1 - p) * 70) + 'px) rotate(' + ((1 - p) * (i % 2 ? 6 : -6)) + 'deg)', U.clamp(p * 1.5)); });
      U.dash(r.path, U.eo(U.seg(t, 0.6, 1.2)));
    }
  };
  if (typeof module === 'object' && module.exports) module.exports = block; else (root.GSBlockDefs = root.GSBlockDefs || {})[block.name] = block;
})(typeof self !== 'undefined' ? self : this);
