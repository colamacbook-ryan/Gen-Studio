// © 2026 Gen Labs — All rights reserved.
// Khối `morph` (K4): vật đời thường biến thành phần tử UI/sơ đồ (chìa khoá → icon công cụ, thước dây → kẹp giấy, điện thoại → phong bì…), 1–3 cặp cùng lúc (lệch 0,12 s).
// Trước biến: vật lớn trên nền tròn giấy, thở nhẹ. Lúc biến (mặc định 0,6 s): vật thu nhỏ + xoay + mờ, vòng sóng loé, đích nảy ra thành ô UI bo góc (hoặc hình trơn), nhãn đổi bằng mờ chéo.
// Tham số: { items: [{ from: biểu tượng | asset, to: biểu tượng | asset, from_label?: ≤18, to_label?: ≤18 }] (1–3), at?: cue (lúc bắt đầu biến; mặc định 1,0 s),
//   dur_s?: 0,3–2 (mặc định 0,6), style?: tile (mặc định, đích là ô UI) | plain }
// 9:16: cùng bố cục, ô 230 px, nhãn 40 px. Ngân sách (L-42): mỗi cặp 4 phần tử động (vật, sóng, đích, nhãn) ⇒ ≤ 8 với 2 cặp, 3 cặp chỉ trong 0,6 s biến; chỉ transform/opacity.
(function (root) {
  'use strict';
  var isNode = typeof module === 'object' && module.exports;
  var U = isNode ? require('./util') : root.GSUtil, I = isNode ? require('./icons') : root.GSIcons;
  var lay = function (p, aspect) {
    var v = aspect === '9:16', n = p.items.length, cell = v ? (n === 3 ? 290 : 340) : 380, gap = v ? 30 : 70, art = v ? (n === 3 ? 190 : 230) : 260;
    return { v: v, cell: cell, gap: gap, art: art, lfs: v ? 40 : 48, W: n * cell + (n - 1) * gap, H: art + 60 + 110 };
  };
  var timing = function (p, cues) { var a = cues && typeof cues[0] === 'number' ? cues[0] : 1.0; return { at: Math.max(0.5, a), dur: p.dur_s || 0.6 }; };
  var pic = function (a, size) { return I.has(a) ? I.svg(a, size) : '<img alt="" data-a="1" style="width:' + size + 'px;height:' + size + 'px;object-fit:contain">'; };
  var block = {
    name: 'morph', version: 1, place: 'new', stackOn: [], peak: 1.0,
    schema: { type: 'object', required: ['items'], additionalProperties: false, properties: {
      items: { type: 'array', minItems: 1, maxItems: 3, items: { type: 'object', required: ['from', 'to'], additionalProperties: false, properties: {
        from: { type: 'string', minLength: 1, maxLength: 400 }, to: { type: 'string', minLength: 1, maxLength: 400 },
        from_label: { type: 'string', maxLength: 18 }, to_label: { type: 'string', maxLength: 18 } } } },
      at: { type: 'cue' }, dur_s: { type: 'number', minimum: 0.3, maximum: 2 }, style: { type: 'string', enum: ['tile', 'plain'] } } },
    cues: function (p) { return [p.at]; },
    assetsOf: function (p) { var o = []; (p.items || []).forEach(function (x) { [x.from, x.to].forEach(function (a) { if (a && !I.has(a)) o.push(a); }); }); return o; },
    mapAssets: function (p, fn) { return Object.assign({}, p, { items: p.items.map(function (x) { return Object.assign({}, x, { from: I.has(x.from) ? x.from : fn(x.from), to: I.has(x.to) ? x.to : fn(x.to) }); }) }); },
    settleFor: function (p, ctx) { var T = timing(p, ctx && ctx.cues); return T.at + T.dur + 0.24 * p.items.length + 0.8; },
    footprint: function (aspect, p) { var L = lay(p && p.items ? p : { items: [{}] }, aspect); return { w: L.W, h: L.H }; },
    sfx: [{ at: 'in', name: 'pop', vol: 0.3 }],
    sfxTimed: function (p, cues) { var T = timing(p, cues); return [{ t: 0, name: 'pop', vol: 0.3 }, { t: T.at, name: 'poof', vol: 0.35 }, { t: T.at + T.dur * 0.6, name: 'sparkle', vol: 0.35 }]; },
    mount: function (world, p, ctx) {
      var L = lay(p, ctx.aspect), box = U.box(ctx.slot, 'b-morph' + (p.style === 'plain' ? ' plain' : '')), h = '';
      p.items.forEach(function (x, i) {
        h += '<div class="mo-c" style="left:' + i * (L.cell + L.gap) + 'px;width:' + L.cell + 'px;height:' + L.H + 'px">' +
          '<i class="mo-disc" style="width:' + (L.art + 70) + 'px;height:' + (L.art + 70) + 'px"></i><i class="mo-wave" style="width:' + (L.art + 70) + 'px;height:' + (L.art + 70) + 'px"></i>' +
          '<span class="mo-f">' + pic(x.from, L.art) + '</span><span class="mo-t" style="width:' + Math.round(L.art * 0.92) + 'px;height:' + Math.round(L.art * 0.92) + 'px">' + pic(x.to, Math.round(L.art * 0.62)) + '</span>' +
          '<span class="mo-l a" style="font-size:' + L.lfs + 'px"></span><span class="mo-l b" style="font-size:' + L.lfs + 'px"></span></div>';
      });
      box.innerHTML = h;
      var cells = [].slice.call(box.querySelectorAll('.mo-c')).map(function (c, i) {
        var x = p.items[i];
        [].forEach.call(c.querySelectorAll('.mo-f img[data-a]'), function (im) { var u = ctx.assetUrl(x.from); if (u) im.src = u; });
        [].forEach.call(c.querySelectorAll('.mo-t img[data-a]'), function (im) { var u = ctx.assetUrl(x.to); if (u) im.src = u; });
        c.querySelector('.mo-l.a').textContent = x.from_label || ''; c.querySelector('.mo-l.b').textContent = x.to_label || '';
        return { c: c, disc: c.querySelector('.mo-disc'), wave: c.querySelector('.mo-wave'), f: c.querySelector('.mo-f'), t: c.querySelector('.mo-t'), la: c.querySelector('.mo-l.a'), lb: c.querySelector('.mo-l.b'), hasA: !!x.from_label, hasB: !!x.to_label };
      });
      world.appendChild(box); box._r = { cells: cells };
      return box;
    },
    draw: function (el, t, ctx) {
      var p = ctx.chain[0].params, T = timing(p, ctx.cues);
      el._r.cells.forEach(function (C, i) {
        var a = T.at + i * 0.12, d = T.dur, k = U.seg(t, a, a + d), inq = U.back(U.seg(t, i * 0.1, i * 0.1 + 0.5), 1.3);
        var bob = Math.sin((t + i * 0.7) * 2.6) * 6 * (1 - U.clamp(k * 3));
        // vật: thu về 0,35 + xoay −28°, mờ hết ở 55 % đoạn biến; đích: từ 0,3 nảy lên 1 (back) bắt đầu ở 35 %
        var fk = U.eio(U.seg(k, 0, 0.55)), tk = U.back(U.seg(k, 0.35, 1), 1.5);
        U.setT(C.f, 'translateY(' + U.f3(bob) + 'px) scale(' + U.f3(U.lerp(0.7, 1, inq) * U.lerp(1, 0.35, fk)) + ') rotate(' + U.f3(-28 * fk) + 'deg)', U.f3(U.clamp(inq * 2) * (1 - fk)));
        U.setT(C.t, 'scale(' + U.f3(U.lerp(0.3, 1, tk)) + ') rotate(' + U.f3((1 - tk) * 14) + 'deg)', U.f3(U.clamp(U.seg(k, 0.35, 0.6))));
        U.setT(C.disc, 'translate(-50%,-50%) scale(' + U.f3(U.lerp(0.6, 1, inq) * (1 - 0.25 * U.eio(U.seg(k, 0.2, 0.7)))) + ')', U.f3(U.clamp(inq * 2) * (1 - U.eio(U.seg(k, 0.3, 0.8)))));
        var wk = U.seg(k, 0.25, 1);
        U.setT(C.wave, 'translate(-50%,-50%) scale(' + U.f3(U.lerp(0.5, 1.35, U.eo(wk))) + ')', U.f3(wk > 0 && wk < 1 ? 0.9 * (1 - wk) : 0));
        // nhãn: mờ chéo + trượt dọc 14 px ở cỡ thật (không lật trục X — chữ không bị ép dẹt giữa chừng, cổng G-SAFE đo được mọi khung)
        var lk = U.eio(U.seg(k, 0.3, 0.8)), lin = U.eo(U.seg(t, 0.2 + i * 0.1, 0.6 + i * 0.1));
        U.setTV(C.la, 'translateX(-50%) translateY(' + U.f3(-14 * lk) + 'px)', U.f3(C.hasA ? lin * (1 - lk) : 0));
        U.setTV(C.lb, 'translateX(-50%) translateY(' + U.f3(14 * (1 - lk)) + 'px)', U.f3(C.hasB ? lk : 0));
      });
    }
  };
  block.layout = lay; block.timing = timing;
  if (isNode) module.exports = block; else (root.GSBlockDefs = root.GSBlockDefs || {})[block.name] = block;
})(typeof self !== 'undefined' ? self : this);
