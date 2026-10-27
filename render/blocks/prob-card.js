// © 2026 Gen Labs — All rights reserved.
// Khối `prob-card`: thẻ xác suất "từ tiếp theo". Hai prob-card liền nhau = MORPH (engine gộp thành một chuỗi, một thẻ DOM):
// chữ câu hỏi và nhãn lật từng chữ, thanh co giãn sang số mới, chữ trả lời bay vào ô trống — không cắt cảnh.
// Tham số: { prompt: string (≤80), options: [[label ≤24, pct 0–100]] (2–5 cặp, tổng pct ≤ 100), pick: số nguyên chỉ mục option được chọn, chip?: string (≤30) }
// Mốc peak (mặc định 2,2 s với thẻ đầu, 1,9 s với thẻ morph; hoặc neo phụ anchor2): hàng được chọn sáng lên rồi chữ bay vào ô trống.
(function (root) {
  'use strict';
  var U = (typeof module === 'object' && module.exports) ? require('./util') : root.GSUtil;
  var ROW = 92, WORD_GAP = 0.08;
  var block = {
    name: 'prob-card', version: 1, place: 'new', stackOn: [], morphs: true, peak: 2.2, peakMorph: 1.9, settle: 4,
    schema: { type: 'object', required: ['prompt', 'options', 'pick'], additionalProperties: false, properties: {
      prompt: { type: 'string', minLength: 1, maxLength: 80 },
      options: { type: 'array', minItems: 2, maxItems: 5, items: { type: 'tuple', items: [{ type: 'string', minLength: 1, maxLength: 24 }, { type: 'number', minimum: 0, maximum: 100 }] } },
      pick: { type: 'integer', minimum: 0, maximum: 4 },
      chip: { type: 'string', maxLength: 30 } } },
    check: function (p) {
      var e = [];
      if (Array.isArray(p.options)) {
        if (typeof p.pick === 'number' && p.pick >= p.options.length) e.push('params.pick: chỉ mục ' + p.pick + ' vượt số lựa chọn (' + p.options.length + ')');
        var sum = p.options.reduce(function (s, o) { return s + (o && typeof o[1] === 'number' ? o[1] : 0); }, 0);
        if (sum > 100.5) e.push('params.options: tổng phần trăm ' + sum + ' vượt 100');
      }
      return e;
    },
    footprint: function () { return { w: 1200, h: 680 }; },
    sfx: [{ at: 'in', name: 'zoom', vol: 0.3 }, { at: 'peak', name: 'ding', vol: 0.45 }, { at: 'peak', name: 'zip', vol: 0.3, dt: 750 }],
    morphSfx: [{ at: 'in', name: 'xylo-down', vol: 0.3 }, { at: 'peak', name: 'zip', vol: 0.3, dt: 600 }],
    mount: function (world, p0, ctx) {
      var links = ctx.chain.map(function (c) { return c.params; });
      var W = Math.max.apply(null, links.map(function (p) { return p.prompt.trim().split(/\s+/).length; }));
      var R = Math.max.apply(null, links.map(function (p) { return p.options.length; }));
      var longest = Math.max.apply(null, links.map(function (p) { return p.prompt.length; }));
      var fs = Math.min(62, 62 * 26 / longest);
      var box = U.box(ctx.slot, 'b-card'), h = '<div class="card"><div class="prompt" style="font-size:' + fs + 'px">';
      for (var i = 0; i < W; i++) h += '<span class="pw"></span>';
      h += '</div><div class="blank" style="font-size:' + fs + 'px"><span class="ans"></span></div><div class="rows">';
      for (i = 0; i < R; i++) h += '<div class="row" style="top:' + i * ROW + 'px"><span class="lab"></span><div class="trk"><div class="fill"></div></div><span class="pct">0%</span></div>';
      h += '</div><div class="fly"></div><div class="chip-ok"></div></div>';
      box.innerHTML = h; world.appendChild(box);
      var card = box.querySelector('.card');
      box._r = { card: card, pws: [].slice.call(box.querySelectorAll('.pw')), blank: box.querySelector('.blank'), ans: box.querySelector('.ans'),
        rows: [].slice.call(box.querySelectorAll('.row')).map(function (r) { return { r: r, lab: r.querySelector('.lab'), fill: r.querySelector('.fill'), pct: r.querySelector('.pct') }; }),
        fly: box.querySelector('.fly'), chip: box.querySelector('.chip-ok'), fs: fs, blankLeft: -1, key: '' };
      return box;
    },
    draw: function (el, t, ctx) {
      var r = el._r, chain = ctx.chain, k = 0;
      for (var i = 0; i < chain.length; i++) if (t >= chain[i].t) k = i;
      var cur = chain[k], P = cur.params, prev = k > 0 ? chain[k - 1].params : null, tau = t - cur.t, words = function (p) { return p ? p.prompt.trim().split(/\s+/) : []; };
      var cw = words(P), pw = words(prev);
      // thẻ nở ra
      var cg = U.eb(U.seg(t, 0, 0.75));
      U.setT(r.card, 'scale(' + U.lerp(0.08, 1, cg) + ') translateY(' + ((1 - cg) * -260) + 'px)', U.clamp(cg * 4));
      r.card.style.borderRadius = U.lerp(60, 26, cg) + 'px';
      // câu hỏi
      var changed = false;
      r.pws.forEach(function (w, j) {
        var txt, ang = 0, pin = 1;
        if (!prev) { txt = cw[j] || ''; pin = U.eo(U.seg(t, 0.35 + j * 0.05, 0.75 + j * 0.05)); }
        else { var p = U.seg(tau, j * WORD_GAP, j * WORD_GAP + 0.32); txt = p < 0.5 ? (pw[j] || '') : (cw[j] || ''); ang = p < 0.5 ? p * 180 : (1 - p) * 180; }
        if (w.textContent !== txt) { w.textContent = txt; w.style.display = txt ? '' : 'none'; changed = true; }
        U.setT(w, 'rotateX(' + ang + 'deg) translateY(' + ((1 - pin) * 30) + 'px)', pin);
      });
      if (changed || r.blankLeft < 0) {
        var last = null; r.pws.forEach(function (w) { if (w.textContent) last = w; });
        if (last) { r.blankLeft = 60 + last.offsetLeft + last.offsetWidth + 24; r.blank.style.left = r.blankLeft + 'px'; }
      }
      // thanh xác suất
      var hlOf = function (j) {
        var cur2 = j === P.pick ? U.seg(t - cur.t - cur.peak, 0, 0.3) : 0;
        var old = prev && j === prev.pick ? 1 - U.seg(tau, 0, 0.3) : 0;
        return Math.max(cur2, old);
      };
      r.rows.forEach(function (R, j) {
        var inCur = j < P.options.length, inPrev = prev && j < prev.options.length, lab, ang = 0, op, v;
        if (!prev) {
          lab = inCur ? P.options[j][0] : ''; op = inCur ? U.eo(U.seg(t, 0.55 + j * 0.1, 0.95 + j * 0.1)) : 0;
          v = inCur ? P.options[j][1] * U.eo(U.seg(t, 0.9 + j * 0.15, 1.8 + j * 0.15)) : 0;
        } else {
          var lp = U.seg(tau, 0.3 + j * WORD_GAP, 0.62 + j * WORD_GAP);
          lab = lp < 0.5 ? (inPrev ? prev.options[j][0] : '') : (inCur ? P.options[j][0] : ''); ang = lp < 0.5 ? lp * 180 : (1 - lp) * 180;
          var a = inPrev ? prev.options[j][1] : 0, b = inCur ? P.options[j][1] : 0;
          v = U.lerp(a, b, U.eio(U.seg(tau, 0.6 + j * 0.12, 1.6 + j * 0.12)));
          op = U.lerp(inPrev ? 1 : 0, inCur ? 1 : 0, U.seg(tau, 0.3, 0.9));
        }
        if (R.lab.textContent !== lab) R.lab.textContent = lab;
        R.r.style.opacity = op; R.lab.style.transform = 'rotateX(' + ang + 'deg)';
        R.fill.style.width = v + '%'; R.pct.textContent = Math.round(v) + '%';
        var hl = hlOf(j); R.r.style.background = 'rgba(255,216,74,' + (hl * 0.9) + ')'; R.fill.style.background = hl > 0.5 ? 'var(--v-ink)' : '';
      });
      // chữ trả lời bay từ nhãn lên ô trống
      var pk = cur.peak, fp = U.seg(tau, pk + 0.5, pk + 1.05), pickLab = P.options[P.pick][0];
      if (fp > 0 && fp < 1) {
        var e = U.eio(fp), bx = r.blankLeft > 0 ? r.blankLeft : 900;
        r.fly.textContent = pickLab; r.fly.style.opacity = 1; r.fly.style.fontSize = r.fs + 'px';
        r.fly.style.transform = 'translate(' + U.lerp(60, bx + 10, e) + 'px,' + (U.lerp(196 + P.pick * ROW, 44, e) - Math.sin(e * Math.PI) * 120) + 'px) scale(' + U.lerp(0.72, 1, e) + ')';
      } else r.fly.style.opacity = 0;
      var nextT = k + 1 < chain.length ? chain[k + 1].t : Infinity;
      var landed = tau >= pk + 1.05 && t < nextT + 0.1;
      var ans = landed ? pickLab : '';
      if (r.ans.textContent !== ans) r.ans.textContent = ans;
      var ok = P.chip ? U.eb(U.seg(tau, pk + 1.05, pk + 1.45)) : 0;
      if (r.chip.textContent !== (P.chip || '')) r.chip.textContent = P.chip || '';
      U.setT(r.chip, 'rotate(-5deg) scale(' + ok + ')', U.clamp(ok * 2));
    }
  };
  if (typeof module === 'object' && module.exports) module.exports = block; else (root.GSBlockDefs = root.GSBlockDefs || {})[block.name] = block;
})(typeof self !== 'undefined' ? self : this);
