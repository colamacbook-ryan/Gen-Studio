// © 2026 Gen Labs — All rights reserved.
// Khối `checklist-card` (K8): thẻ vàng «Bạn làm gì · n» gồm 1–5 dòng, tick lần lượt theo từ khoá (dấu tick vẽ dần, ô nảy nhẹ, dòng vừa tick có vạch dạ quang quét qua).
// Tham số: { items: string[1–5] (mỗi dòng ≤ 36 ký tự, kịch bản: ≤ 6 từ), title?: ≤24 (mặc định "Bạn làm gì"), num?: 1–99 (⇒ "Bạn làm gì · 1"),
//   icon?: tên biểu tượng (mặc định hand), tick_at?: cue[] (mốc tick từng dòng; thiếu ⇒ 1,3 s + 1,0 s/dòng) }
// Nền var(--v-hl) (mặc định #FFD84A ≈ #FFD23F của kịch bản; nhận diện kênh đổi được), chữ mực đậm 52 px thế giới (≥ 30 px@720 sau zoom).
// Khi thẻ đang hiện, PiP tròn của host (khối pip-swap) tự phóng ×1,3 (cờ pipBoost).
// Ngân sách (L-42): ≤ 8 phần tử động (thẻ, ≤ 5 dòng, tick đang vẽ, vạch quét); chỉ transform/opacity + dashoffset; lắng sau tick cuối 1 s.
(function (root) {
  'use strict';
  var isNode = typeof module === 'object' && module.exports;
  var U = isNode ? require('./util') : root.GSUtil, I = isNode ? require('./icons') : root.GSIcons;
  function lay(p, aspect) {
    var v = aspect === '9:16', W = v ? 1000 : 1180, fs = v ? 46 : 52, n = p.items.length;
    var tw = W - 70 - 64 - 26 - 50, lines = p.items.map(function (x) { return Math.min(2, Math.ceil(U.textW(x, fs) / tw)); });
    var rows = lines.map(function (l) { return Math.round(l * fs * 1.18 + (v ? 26 : 30)); });
    return { v: v, W: W, fs: fs, rows: rows, head: v ? 104 : 112, H: (v ? 104 : 112) + rows.reduce(function (s, h) { return s + h; }, 0) + (n - 1) * 8 + 46 };
  }
  function timing(p, cues) {
    var t = p.items.map(function (_, i) { return cues && typeof cues[i] === 'number' ? cues[i] : 1.3 + i * 1.0; });
    for (var i = 1; i < t.length; i++) t[i] = Math.max(t[i], t[i - 1] + 0.35);
    return { ticks: t.map(function (x, i) { return Math.max(x, 0.55 + i * 0.12); }) };
  }
  var block = {
    name: 'checklist-card', version: 1, place: 'new', stackOn: [], peak: 1.3, pipBoost: true,
    schema: { type: 'object', required: ['items'], additionalProperties: false, properties: {
      items: { type: 'array', minItems: 1, maxItems: 5, items: { type: 'string', minLength: 1, maxLength: 36 } },
      title: { type: 'string', maxLength: 24 }, num: { type: 'integer', minimum: 1, maximum: 99 }, icon: { type: 'string', enum: I.names() },
      tick_at: { type: 'array', maxItems: 5, items: { type: 'cue' } } } },
    check: function (p) { return Array.isArray(p.items) && Array.isArray(p.tick_at) && p.tick_at.length > p.items.length ? ['params.tick_at: có ' + p.tick_at.length + ' mốc tick nhưng chỉ ' + p.items.length + ' dòng'] : []; },
    cues: function (p) { return p.items.map(function (_, i) { return (p.tick_at || [])[i]; }); },
    settleFor: function (p, ctx) { var T = timing(p, ctx && ctx.cues); return T.ticks[T.ticks.length - 1] + 1.0; },
    footprint: function (aspect, p) { var L = lay(p && p.items ? p : { items: ['a', 'b', 'c'] }, aspect); return { w: L.W, h: L.H }; },
    sfx: [{ at: 'in', name: 'pop', vol: 0.35 }],
    sfxTimed: function (p, cues) { return [{ t: 0, name: 'pop', vol: 0.35 }].concat(timing(p, cues).ticks.map(function (t) { return { t: t, name: 'tick', vol: 0.4 }; })); },
    mount: function (world, p, ctx) {
      var L = lay(p, ctx.aspect), box = U.box(ctx.slot, 'b-check' + (L.v ? ' v' : ''));
      var h = '<div class="ck-c"><div class="ck-h" style="height:' + L.head + 'px"><span class="ck-ic">' + I.svg(p.icon || 'hand', 54) + '</span><b></b></div>';
      p.items.forEach(function (x, i) {
        h += '<div class="ck-r" style="font-size:' + L.fs + 'px;min-height:' + L.rows[i] + 'px"><span class="ck-bx"><i></i><svg viewBox="0 0 64 64"><path d="M14 33 L27 46 L51 18" fill="none" stroke="#fff" stroke-width="9" stroke-linecap="round" stroke-linejoin="round" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1"/></svg></span>' +
          '<span class="ck-t"><i class="ck-m"></i><span></span></span></div>';
      });
      box.innerHTML = h + '</div>';
      box.querySelector('.ck-h b').textContent = (p.title === undefined ? 'Bạn làm gì' : p.title) + (p.num ? ' · ' + p.num : '');
      var rows = [].slice.call(box.querySelectorAll('.ck-r')).map(function (r, i) {
        r.querySelector('.ck-t > span').textContent = p.items[i];
        return { r: r, bx: r.querySelector('.ck-bx'), fill: r.querySelector('.ck-bx i'), tk: r.querySelector('.ck-bx path'), m: r.querySelector('.ck-m') };
      });
      world.appendChild(box);
      box._r = { c: box.querySelector('.ck-c'), h: box.querySelector('.ck-h'), rows: rows };
      return box;
    },
    draw: function (el, t, ctx) {
      var r = el._r, p = ctx.chain[0].params, T = timing(p, ctx.cues);
      var cq = U.spring(U.seg(t, 0, 1.0) * 1.6);   // lò xo tắt dần: vào nhanh, vọt nhẹ ~8 %, lắng trong 1 s
      U.setT(r.c, 'translateY(' + U.f3((1 - cq) * 90) + 'px) rotate(' + U.f3((1 - cq) * -3 - 0.6) + 'deg)', U.f3(U.clamp(U.seg(t, 0, 0.25))));
      r.rows.forEach(function (R, i) {
        var a = 0.3 + i * 0.12, q = U.eo(U.seg(t, a, a + 0.45)), k = T.ticks[i];
        U.setT(R.r, 'translateX(' + U.f3((1 - q) * -30) + 'px)', U.f3(q));
        var fill = U.eio(U.seg(t, k, k + 0.18)), pop = Math.sin(Math.PI * U.seg(t, k, k + 0.3));
        R.fill.style.opacity = U.f3(fill); R.bx.style.transform = 'scale(' + U.f3(1 + 0.18 * pop) + ')';
        U.dash(R.tk, U.eo(U.seg(t, k + 0.05, k + 0.4)));
        R.m.style.transform = 'scaleX(' + U.f3(U.eio(U.seg(t, k + 0.1, k + 0.55))) + ')';
      });
    }
  };
  block.layout = lay; block.timing = timing;
  if (isNode) module.exports = block; else (root.GSBlockDefs = root.GSBlockDefs || {})[block.name] = block;
})(typeof self !== 'undefined' ? self : this);
