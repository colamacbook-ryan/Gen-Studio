// © 2026 Gen Labs — All rights reserved.
// Khối `title`: tiêu đề bài — từng chữ nảy vào, chữ nhấn có vạch highlight vàng, gạch chân vẽ dần.
// Tham số: { text: string (≤80), highlight?: string[] (cụm chữ nhấn, ≤8), num?: 0–99 (K13 bumper: số lớn trong huy hiệu tròn phía trên, vd "Cửa 1"),
//   kicker?: ≤16 (chữ nhỏ cạnh số, vd "CỬA") } — chữ thuộc thuật ngữ tiếng Anh của bài tự đổi sang tím nghiêng.
// Không có `num` ⇒ DOM/khung y như bản 0.1.x (golden 16:9). Có `num`: huy hiệu nảy vào trước (0–0,45 s), chữ theo sau 0,25 s.
(function (root) {
  'use strict';
  var U = (typeof module === 'object' && module.exports) ? require('./util') : root.GSUtil;
  var NUM_H = 250;   // chiều cao thêm khi có huy hiệu số (đĩa 220 + khe 30)
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
      highlight: { type: 'array', maxItems: 8, items: { type: 'string', minLength: 1, maxLength: 40 } },
      num: { type: 'integer', minimum: 0, maximum: 99 }, kicker: { type: 'string', minLength: 1, maxLength: 16 } } },
    check: function (p) { return p.kicker !== undefined && p.num === undefined ? ['params.kicker: chỉ dùng kèm num (vd num 1, kicker "CỬA")'] : []; },
    footprint: function (aspect, p) { var L = layout((p && p.text) || 'Tiêu đề'); return { w: 1300, h: Math.round(L.lines.length * L.fs * 1.1 + 90) + (p && p.num !== undefined ? NUM_H : 0) }; },
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
      box.innerHTML = h + '<svg class="scr" width="880" height="60" viewBox="0 0 880 60"><path d="M6 40 C160 10 300 52 450 30 S760 14 874 34" fill="none" style="stroke:var(--v-accent2)" stroke-width="9" stroke-linecap="round" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1"/></svg>';
      var num = null;
      if (p.num !== undefined) {
        num = U.el('div', 'tnum'); num.innerHTML = '<i></i><b></b>' + (p.kicker ? '<span></span>' : '');
        num.querySelector('b').textContent = String(p.num); if (p.kicker) num.querySelector('span').textContent = p.kicker;
        box.insertBefore(num, box.firstChild);
      }
      world.appendChild(box);
      box._r = { words: [].slice.call(box.querySelectorAll('.wd')), path: box.querySelector('.scr path'), num: num, d: num ? 0.25 : 0 };
      return box;
    },
    draw: function (el, t) {
      var r = el._r, d = r.d;
      if (r.num) { var nq = U.back(U.seg(t, 0, 0.45), 1.6); U.setT(r.num, 'scale(' + U.f3(U.lerp(0.4, 1, nq)) + ') rotate(' + U.f3((1 - nq) * -14) + 'deg)', U.f3(U.clamp(nq * 2.5))); }
      r.words.forEach(function (w, i) { var p = U.eb(U.seg(t, d + i * 0.07, d + 0.44 + i * 0.07)); U.setT(w, 'translateY(' + ((1 - p) * 70) + 'px) rotate(' + ((1 - p) * (i % 2 ? 6 : -6)) + 'deg)', U.clamp(p * 1.5)); });
      U.dash(r.path, U.eo(U.seg(t, d + 0.6, d + 1.2)));
    }
  };
  if (typeof module === 'object' && module.exports) module.exports = block; else (root.GSBlockDefs = root.GSBlockDefs || {})[block.name] = block;
})(typeof self !== 'undefined' ? self : this);
