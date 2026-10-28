// © 2026 Gen Labs — All rights reserved.
// Khối `focus` (F4, SPEC-0.2.0 §6.5): phóng máy quay vào đích + làm tối nền + vòng sáng (nảy 1→1,04 một lần) + chú thích tuỳ chọn.
// Tham số: { target, zoom?: 1–2.5, dim?: 0–0.7 (mặc định 0,55), ring?: true, callout?: ≤ 60 ký tự, side?: auto|top|bottom|left|right, hold_ms?: 300–6000 }.
// Máy quay do camera.buildRegions tính sẵn (plan.camera); khối này chỉ vẽ lớp phủ bám đích theo máy quay (lớp track, khung 1920×1080) qua overlay của khối `callout`.
(function (root) {
  'use strict';
  var isNode = typeof module === 'object' && module.exports;
  var U = isNode ? require('./util') : root.GSUtil;
  var block = {
    name: 'focus', version: 1, place: 'track', stackOn: [], peak: 0.7, settle: Infinity,
    schema: { type: 'object', required: ['target'], additionalProperties: false, properties: {
      target: { type: 'string', minLength: 1, maxLength: 32 }, zoom: { type: 'number', minimum: 1, maximum: 2.5 }, dim: { type: 'number', minimum: 0, maximum: 0.7 },
      ring: { type: 'boolean' }, callout: { type: 'string', minLength: 1, maxLength: 60 }, side: { type: 'string', enum: ['auto', 'top', 'bottom', 'left', 'right'] },
      hold_ms: { type: 'integer', minimum: 300, maximum: 6000 } } },
    footprint: function () { return { w: 1920, h: 1080 }; },
    sfx: [],
    mount: function (layer, p, ctx) {
      var tut = ctx.plan.tutorial || {}, f = (tut.focus || []).filter(function (x) { return x.beat === ctx.beat.id; })[0];
      var C = root.GSBlockDefs && root.GSBlockDefs.callout;
      if (!f || !C) { var e = U.el('div', 'b-focus'); e.style.display = 'none'; layer.appendChild(e); return e; }
      var o = C.overlay(layer, tut.accent || '#FF6F59', { stroke: 6, callout: f.callout });
      o.el._r = { o: o, f: f }; o.el.classList.add('b-focus');
      return o.el;
    },
    draw: function (el, tl, ctx) {
      var r = el._r; if (!r) return;
      var f = r.f, t = ctx.beat.t_in + tl * 1000, end = (f.out || f.tEnd) + 60;
      if (t > end) { r.o.hide(); return; }
      var cam = root.GSCamera.sample(ctx.plan.camera, t), b = root.GSCamera.boxToFrame(cam, f.box);
      var rb = { x: b.x - 10, y: b.y - 10, w: b.w + 20, h: b.h + 20 };
      var pin = U.eo(U.clamp((t - f.t) / Math.max(1, f.arrive - f.t))), pout = 1 - U.clamp((t - f.tEnd) / 320);
      var bounce = 1 + 0.04 * Math.sin(Math.PI * U.clamp((t - f.arrive) / 360));
      var ca = U.clamp((t - f.arrive + 80) / 260) * pout, cb = null;
      if (f.callout) cb = { x: f.callout.x + (rb.x - f.ring.x), y: f.callout.y + (rb.y - f.ring.y) + (1 - ca) * 12 };
      r.o.draw(rb, f.ring ? pin * pout : 0, f.dim * pin * pout, bounce, cb, ca);
    }
  };
  if (isNode) module.exports = block; else (root.GSBlockDefs = root.GSBlockDefs || {})[block.name] = block;
})(typeof self !== 'undefined' ? self : this);
