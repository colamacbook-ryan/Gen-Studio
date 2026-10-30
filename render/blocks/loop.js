// © 2026 Gen Labs — All rights reserved.
// Khối `loop` (K10): sơ đồ vòng LÀM → KIỂM → SỬA — 3 nút trên một vòng tròn, chấm sáng chạy vòng (mỗi nút node_s giây), nút có chấm thì sáng lên;
// hết `rounds` vòng thì chấm dừng ở nút đầu, cờ XONG bật giữa vòng và biển ĐIỂM DỪNG hiện bên phải (agent biết lúc nào thôi lặp).
// Tham số: { nodes?: string[3] (mỗi nút ≤ 8; mặc định LÀM/KIỂM/SỬA), rounds?: 1–3 (mặc định 2), node_s?: 0,8–3 (mặc định 1,5),
//   done?: ≤12 (cờ, mặc định "XONG"; "" = ẩn), stop?: ≤28 (biển điểm dừng, mặc định "ĐIỂM DỪNG"; "" = ẩn), at?: cue (lúc chấm bắt đầu chạy; mặc định 0,9 s) }
// Ngân sách (L-42): ≤ 7 phần tử động (3 nút, chấm, vệt, cờ, biển); chỉ transform/opacity + dashoffset vệt; lắng sau biển 1 s.
(function (root) {
  'use strict';
  var U = (typeof module === 'object' && module.exports) ? require('./util') : root.GSUtil;
  var RAD = 210, CX = 430, CY = 320, ANG = [-90, 30, 150];   // nút: trên · phải dưới · trái dưới (chạy theo chiều kim đồng hồ)
  var timing = function (p, cues) {
    var a = cues && typeof cues[0] === 'number' ? cues[0] : 0.9, ns = p.node_s || 1.5, R = p.rounds || 2;
    return { start: a, ns: ns, end: a + R * 3 * ns, R: R };
  };
  var block = {
    name: 'loop', version: 1, place: 'new', stackOn: [], peak: 0.9,
    schema: { type: 'object', required: [], additionalProperties: false, properties: {
      nodes: { type: 'array', minItems: 3, maxItems: 3, items: { type: 'string', minLength: 1, maxLength: 8 } }, rounds: { type: 'integer', minimum: 1, maximum: 3 },
      node_s: { type: 'number', minimum: 0.8, maximum: 3 }, done: { type: 'string', maxLength: 12 }, stop: { type: 'string', maxLength: 28 }, at: { type: 'cue' } } },
    cues: function (p) { return [p.at]; },
    settleFor: function (p, ctx) { return timing(p, ctx && ctx.cues).end + 1.6; },
    footprint: function () { return { w: 1200, h: 640 }; },
    sfx: [{ at: 'in', name: 'pop', vol: 0.3 }],
    sfxTimed: function (p, cues) {
      var T = timing(p, cues), out = [{ t: 0, name: 'pop', vol: 0.3 }];
      for (var i = 1; i <= T.R * 3; i++) out.push({ t: T.start + i * T.ns - 0.05, name: i === T.R * 3 ? 'ta-da' : 'tick', vol: i === T.R * 3 ? 0.4 : 0.22 });
      return out;
    },
    mount: function (world, p, ctx) {
      var box = U.box(ctx.slot, 'b-loop'), names = p.nodes || ['LÀM', 'KIỂM', 'SỬA'];
      var h = '<svg class="lp-s" width="860" height="640" viewBox="0 0 860 640"><circle class="lp-ring" cx="' + CX + '" cy="' + CY + '" r="' + RAD + '"/>' +
        '<circle class="lp-trail" cx="' + CX + '" cy="' + CY + '" r="' + RAD + '" pathLength="1" stroke-dasharray="0.16 1" transform="rotate(-90 ' + CX + ' ' + CY + ')"/>';
      ANG.forEach(function (a) { var m = (a + 60) * Math.PI / 180, x = CX + RAD * Math.cos(m), y = CY + RAD * Math.sin(m); h += '<path class="lp-ar" d="M-14 -14 L8 0 L-14 14" transform="translate(' + U.f3(x) + ' ' + U.f3(y) + ') rotate(' + (a + 150) + ')"/>'; });
      h += '</svg><i class="lp-dot"></i>';
      ANG.forEach(function (a, i) { var m = a * Math.PI / 180; h += '<div class="lp-n" style="left:' + U.f3(CX + RAD * Math.cos(m)) + 'px;top:' + U.f3(CY + RAD * Math.sin(m)) + 'px"><i></i><b></b></div>'; });
      h += '<div class="lp-done" style="left:' + CX + 'px;top:' + CY + 'px"></div><div class="lp-stop"><span class="oct"></span><b></b></div>';
      box.innerHTML = h;
      var ns = [].slice.call(box.querySelectorAll('.lp-n'));
      ns.forEach(function (n, i) { n.querySelector('b').textContent = names[i]; });
      var done = box.querySelector('.lp-done'), stop = box.querySelector('.lp-stop');
      done.textContent = p.done === undefined ? 'XONG ✓' : p.done; stop.querySelector('b').textContent = p.stop === undefined ? 'ĐIỂM DỪNG' : p.stop;
      if (!done.textContent) done.style.display = 'none'; if (!stop.querySelector('b').textContent) stop.style.display = 'none';
      world.appendChild(box);
      box._r = { s: box.querySelector('.lp-s'), trail: box.querySelector('.lp-trail'), dot: box.querySelector('.lp-dot'), ns: ns.map(function (n) { return { n: n, hl: n.querySelector('i') }; }), done: done, stop: stop };
      return box;
    },
    draw: function (el, t, ctx) {
      var r = el._r, p = ctx.chain[0].params, T = timing(p, ctx.cues);
      var sq = U.eo(U.seg(t, 0, 0.5)); U.setT(r.s, 'scale(' + U.f3(U.lerp(0.85, 1, sq)) + ')', U.f3(sq));
      // tiến trình theo "nút": 0..3R; mỗi đoạn giữa hai nút easeInOut (chấm dừng nhẹ ở nút rồi chạy tiếp, không giật)
      var u = U.clamp((t - T.start) / T.ns, 0, T.R * 3), k = Math.floor(u), f = u - k, pos = k + (k < T.R * 3 ? U.eio(f) : 0);
      var ang = (-90 + pos * 120) * Math.PI / 180, on = U.clamp(U.seg(t, T.start - 0.3, T.start)) * (1 - U.eio(U.seg(t, T.end + 0.2, T.end + 0.6)));
      U.setT(r.dot, 'translate(' + U.f3(CX + RAD * Math.cos(ang)) + 'px,' + U.f3(CY + RAD * Math.sin(ang)) + 'px) translate(-50%,-50%)', U.f3(on));
      r.trail.setAttribute('transform', 'rotate(' + U.f3(-90 + pos * 120 - 57.6) + ' ' + CX + ' ' + CY + ')'); r.trail.style.opacity = U.f3(on * 0.9);
      r.ns.forEach(function (N, i) {
        var q = U.back(U.seg(t, 0.15 + i * 0.12, 0.6 + i * 0.12), 1.4);
        var d = Math.abs(((pos - i) % 3 + 3) % 3), near = t >= T.start - 0.2 ? Math.max(0, 1 - Math.min(d, 3 - d) / 0.45) : 0, fin = i === 0 ? U.eio(U.seg(t, T.end, T.end + 0.3)) : 0;
        var lit = Math.max(near * on, fin);
        U.setT(N.n, 'translate(-50%,-50%) scale(' + U.f3(U.lerp(0.5, 1, q) * (1 + 0.1 * lit)) + ')', U.f3(U.clamp(q * 2)));
        N.hl.style.opacity = U.f3(lit);
      });
      var dq = U.back(U.seg(t, T.end + 0.1, T.end + 0.5), 1.8); U.setT(r.done, 'translate(-50%,-50%) rotate(' + U.f3((1 - dq) * -14 - 4) + 'deg) scale(' + U.f3(dq) + ')', U.f3(U.clamp(dq * 2)));
      var sp = U.eo(U.seg(t, T.end + 0.5, T.end + 1.0)); U.setTV(r.stop, 'translateX(' + U.f3((1 - sp) * 60) + 'px)', U.f3(sp));
    }
  };
  block.timing = timing;
  if (typeof module === 'object' && module.exports) module.exports = block; else (root.GSBlockDefs = root.GSBlockDefs || {})[block.name] = block;
})(typeof self !== 'undefined' ? self : this);
