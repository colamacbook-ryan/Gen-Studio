// © 2026 Gen Labs — All rights reserved.
// Khối `shot` (0.2.x clip dài, v7): BỐ CỤC CẢNH — đặt lại hai người dẫn theo kiểu cảnh, giữ tới khi beat `shot` kế tiếp vào.
//   dialogue — hai người dẫn to (~60% cao khung) đứng đối mặt hai bên, nền giấy che thẻ phía sau (cảnh nói chuyện, không thẻ);
//   side     — một người dẫn to đứng sát mép thẻ (đè mép thẻ một chút) để chỉ vào thẻ, người kia lui ra ngoài khung;
//   demo     — thẻ tràn ngang, hai người dẫn thu nhỏ thành «ô phản ứng» ló lên ở hai góc dưới (nảy nhẹ khi đổi tư thế);
//   closeup  — cận mặt MỘT người dẫn (khoảnh khắc «à ra thế» / câu chốt), nền giấy che thẻ, người kia ra ngoài khung;
//   normal   — trả về chỗ đứng mặc định của plan (actorLayout).
// Chuyển giữa hai cảnh: nội suy dur_s (mặc định 0,4 s, easeInOutCubic) từ cảnh trước của chuỗi `shot` — không nhảy khung; tất định theo t.
// Sân khấu (render/stage/stage.js drawActor) đọc ctx.actorFx[id].shot = {from, to, k} — from/to = {cx, by, s} (toạ độ khung 1920×1080, s nhân với cỡ gốc) hoặc null (= chỗ mặc định).
// Tham số: { kind: dialogue|side|demo|closeup|normal, host?: mã nhân vật (side/closeup; mặc định người đầu), dur_s?: 0,2–1,2 }. Chỉ 16:9.
// Ngân sách (L-42): 1 phần tử nền (opacity) + transform của 2 nhân vật mỗi khung; không vẽ SVG thêm.
(function (root) {
  'use strict';
  var U = (typeof module === 'object' && module.exports) ? require('./util') : root.GSUtil;
  var KINDS = ['dialogue', 'side', 'demo', 'closeup', 'normal'];
  function actorsOf(plan) { return plan.actors || []; }
  function hostOf(plan, p) { var a = actorsOf(plan), h = p.host ? a.filter(function (x) { return x.id === p.host; })[0] : a[0]; return h || a[0] || null; }
  // đích từng người dẫn cho một cảnh: {cx, by (đáy hộp nhân vật), s (bội số cỡ gốc)} hoặc null (= chỗ mặc định); bd = độ đục nền giấy che thẻ
  function targets(plan, p) {
    var A = actorsOf(plan), host = hostOf(plan, p), out = {}, k = p.kind;
    A.forEach(function (a, i) {
      var left = i === 0, me = host && a.id === host.id;
      if (k === 'normal') out[a.id] = null;
      else if (k === 'dialogue') out[a.id] = { cx: left ? 470 : 1450, by: 1114 + 120, s: 1.38 };
      else if (k === 'demo') out[a.id] = { cx: left ? 165 : 1755, by: 1114 + 40, s: 0.66 };
      else if (k === 'side') out[a.id] = me ? { cx: left ? 300 : 1620, by: 1114 + 40, s: 1.18 } : { cx: left ? -420 : 2340, by: 1114, s: 1 };
      else if (k === 'closeup') out[a.id] = me ? { cx: 960, by: 1114 + 230, s: 2.4 } : { cx: left ? -520 : 2440, by: 1114, s: 1 };
    });
    return { actors: out, bd: k === 'dialogue' || k === 'closeup' ? 1 : 0 };
  }
  // chuỗi shot: cảnh trước beat này + mốc beat kế (giây, tính từ lúc beat này vào)
  function chainOf(plan, beat) {
    var list = plan.beats.filter(function (b) { return b.block === 'shot'; }).sort(function (a, b) { return a.t_in - b.t_in; });
    var i = list.map(function (b) { return b.id; }).indexOf(beat.id);
    return { prev: i > 0 ? list[i - 1].params : { kind: 'normal' }, next: list[i + 1] ? (list[i + 1].t_in - beat.t_in) / 1000 : Infinity };
  }
  var block = {
    name: 'shot', version: 1, place: 'hud', stackOn: [], peak: 0.4,
    schema: { type: 'object', required: ['kind'], additionalProperties: false, properties: {
      kind: { type: 'string', enum: KINDS }, host: { type: 'string', minLength: 1, maxLength: 40 }, dur_s: { type: 'number', minimum: 0.2, maximum: 1.2 } } },
    // beat kế thay thế ⇒ thôi vẽ ngay sau mốc đó (beat kế nội suy từ đích của beat này); beat cuối vẽ mỗi khung (actorFx xoá mỗi __seek)
    settleFor: function (p, ctx) { var c = chainOf(ctx.plan, ctx.beat); return c.next === Infinity ? undefined : c.next + 0.02; },
    footprint: function () { return { w: 0, h: 0 }; },
    sfx: [],
    mount: function (world, p, ctx) {
      var box = U.el('div', 'b-shot'), bd = U.el('div', 'sh-bd');
      box.appendChild(bd); ctx.hud.insertBefore(box, ctx.hud.firstChild);   // đầu lớp HUD ⇒ sau nhân vật, giấy nhớ, phụ đề; trên thẻ của trang vở
      var c = chainOf(ctx.plan, ctx.beat);
      box._r = { bd: bd, next: c.next, from: targets(ctx.plan, c.prev), to: targets(ctx.plan, p) };
      return box;
    },
    draw: function (el, t, ctx) {
      var r = el._r, p = ctx.chain[0].params, dur = p.dur_s || 0.4;
      if (t >= r.next) { r.bd.style.opacity = '0'; return; }   // beat kế đã nhận lái
      var k = U.eio(U.seg(t, 0, dur));
      Object.keys(r.to.actors).forEach(function (id) {
        var a = r.from.actors[id] === undefined ? null : r.from.actors[id], b = r.to.actors[id];
        if (a === null && b === null) return;
        var fx = ctx.actorFx[id] || (ctx.actorFx[id] = {}); fx.shot = { from: a, to: b, k: k };
      });
      r.bd.style.opacity = U.f3(U.lerp(r.from.bd, r.to.bd, k));
    }
  };
  block.targets = targets; block.chainOf = chainOf; block.KINDS = KINDS;
  if (typeof module === 'object' && module.exports) module.exports = block; else (root.GSBlockDefs = root.GSBlockDefs || {})[block.name] = block;
})(typeof self !== 'undefined' ? self : this);
