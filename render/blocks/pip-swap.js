// © 2026 Gen Labs — All rights reserved.
// Khối `pip-swap` (K2): host thu vào PiP tròn góc trái dưới (to: 'pip') hoặc bung ra lại sân khấu (to: 'stage'), vòng cắt thu theo log 0,5 s — không pop.
// Đường kính 225 px khung (= 150 px ở 720p, kịch bản); khi một khối có cờ pipBoost (checklist-card) đang hiện, PiP tự phóng ×1,3 (vào/ra 0,42 s).
// Sân khấu (render/stage/stage.js) đọc ctx.actorFx[host] = {pip 0..1, cx, cy, r} mỗi khung để đặt nhân vật + clip-path; khối này vẽ đĩa nền, viền, thẻ tên.
// Tham số: { to: pip|stage, host?: mã nhân vật (mặc định người đầu của plan.actors), name?: ≤16 (thẻ tên; mặc định tên nhân vật), dur_s?: 0,3–1,5 (mặc định 0,5), boost?: bool (mặc định true) }
// Chỉ 16:9 (PiP góc dưới trái đụng vùng caption của nền tảng dọc). Lớp HUD; beat bị pip-swap kế tiếp (cùng host) thay thế thì thôi vẽ.
// Ngân sách (L-42): 1 nhân vật (transform + clip-path) + 3 phần tử (đĩa, viền, thẻ tên) chỉ transform/opacity.
(function (root) {
  'use strict';
  var U = (typeof module === 'object' && module.exports) ? require('./util') : root.GSUtil;
  var R0 = 112.5, CX = 40 + R0, CY = 1080 - 40 - R0, BOOST = 1.3;
  var reg = function () { return typeof module === 'object' && module.exports ? require('./registry') : root.GSBlocks; };
  function hostOf(plan, p) { var a = plan.actors || [], h = p.host ? a.filter(function (x) { return x.id === p.host; })[0] : a[0]; return h || null; }
  // chuỗi pip-swap của cùng host: trạng thái trước beat này + mốc beat kế (giây, tính từ lúc beat này vào)
  function chainOf(plan, beat, host) {
    var list = plan.beats.filter(function (b) { return b.block === 'pip-swap' && (hostOf(plan, b.params) || {}).id === host; }).sort(function (a, b) { return a.t_in - b.t_in; });
    var i = list.map(function (b) { return b.id; }).indexOf(beat.id), prev = i > 0 ? (list[i - 1].params.to === 'pip' ? 1 : 0) : 0;
    return { from: prev, next: list[i + 1] ? (list[i + 1].t_in - beat.t_in) / 1000 : Infinity };
  }
  // khung phóng: mỗi beat của khối pipBoost → [vào, beat kế có vùng trang vở (máy quay rời đi)) — giây tuyệt đối
  function boostWins(plan) {
    var R = reg(), bs = plan.beats.slice().sort(function (a, b) { return a.t_in - b.t_in; }), out = [];
    bs.forEach(function (b, i) {
      var d = R && R.get(b.block); if (!d || !d.pipBoost) return;
      var nx = null; for (var j = i + 1; j < bs.length; j++) if (bs[j].zone && bs[j].zone !== b.zone && bs[j].t_in > b.t_in) { nx = bs[j]; break; }
      out.push([b.t_in / 1000, nx ? nx.t_in / 1000 : b.t_in / 1000 + 8]);
    });
    return out;
  }
  var block = {
    name: 'pip-swap', version: 1, place: 'hud', stackOn: [], peak: 0.5,
    schema: { type: 'object', required: ['to'], additionalProperties: false, properties: {
      to: { type: 'string', enum: ['pip', 'stage'] }, host: { type: 'string', minLength: 1, maxLength: 40 }, name: { type: 'string', maxLength: 16 },
      dur_s: { type: 'number', minimum: 0.3, maximum: 1.5 }, boost: { type: 'boolean' } } },
    // khi bị beat kế thay thế: thôi vẽ ngay sau mốc đó (beat kế tự nội suy từ trạng thái này); còn lại vẽ mỗi khung (actorFx xoá mỗi __seek)
    settleFor: function (p, ctx) { var c = chainOf(ctx.plan, ctx.beat, (hostOf(ctx.plan, p) || {}).id); return c.next === Infinity ? undefined : c.next + 0.02; },
    footprint: function () { return { w: 0, h: 0 }; },
    sfx: [{ at: 'in', name: 'swish', vol: 0.25 }],
    mount: function (world, p, ctx) {
      var host = hostOf(ctx.plan, p), hud = ctx.hud, mk = function (cls) { var e = U.el('div', 'pip-sw ' + cls); e.style.left = (CX - R0) + 'px'; e.style.top = (CY - R0) + 'px'; return e; };
      // một hộp (sân khấu bật/tắt hiện theo t_in) đặt ĐẦU lớp HUD ⇒ nằm sau nhân vật; viền vẽ bằng bóng NGOÀI vòng tròn nên không bị nhân vật (đã cắt tròn) che
      var box = U.el('div', 'b-pipsw'), bg = mk('bg'), ring = mk('ring'), tag = U.el('div', 'pip-sw tag');
      tag.textContent = p.name !== undefined ? p.name : host ? host.name : '';
      box.appendChild(bg); box.appendChild(ring); box.appendChild(tag);
      hud.insertBefore(box, hud.firstChild);
      box._r = { host: host ? host.id : null, bg: bg, ring: ring, tag: tag, chain: chainOf(ctx.plan, ctx.beat, host ? host.id : null), wins: p.boost === false ? [] : boostWins(ctx.plan), t0: ctx.beat.t_in / 1000 };
      return box;
    },
    draw: function (el, t, ctx) {
      var r = el._r, p = ctx.chain[0].params, dur = p.dur_s || 0.5, gone = t >= r.chain.next;
      var k = gone ? 0 : U.lerp(r.chain.from, p.to === 'pip' ? 1 : 0, U.eio(U.seg(t, 0, dur))), ta = r.t0 + t, b = 0;
      r.wins.forEach(function (w) { b = Math.max(b, U.win(ta, w[0], w[1], 0.42, 0.42)); });
      var rad = R0 * (1 + (BOOST - 1) * b), cx = CX + (rad - R0), cy = CY - (rad - R0);
      if (r.host && k > 0) ctx.actorFx[r.host] = { pip: k, cx: cx, cy: cy, r: rad };
      // đĩa + viền chỉ hiện khi vòng cắt đã gần cỡ cuối (như bản 80 s): bán kính cắt R = exp(lerp(ln 1700, ln r, k))
      var Rc = Math.exp(U.lerp(Math.log(1700), Math.log(rad), k)), po = k > 0 ? U.clamp((440 - Rc) / 280) : 0, s = Rc / R0;
      var tx = 'translate(' + U.f3(cx - CX) + 'px,' + U.f3(cy - CY) + 'px) scale(' + U.f3(Math.min(s, 4)) + ')';
      U.setT(r.bg, tx, U.f3(po)); U.setT(r.ring, tx, U.f3(po));
      U.setT(r.tag, 'translate(' + U.f3(cx - 60) + 'px,' + U.f3(cy + rad - 22) + 'px)', U.f3(U.clamp((k - 0.7) / 0.3)));
    }
  };
  block.boostWins = boostWins; block.chainOf = chainOf; block.GEO = { cx: CX, cy: CY, r: R0, boost: BOOST };
  if (typeof module === 'object' && module.exports) module.exports = block; else (root.GSBlockDefs = root.GSBlockDefs || {})[block.name] = block;
})(typeof self !== 'undefined' ? self : this);
