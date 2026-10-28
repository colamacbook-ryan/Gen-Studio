// © 2026 Gen Labs — All rights reserved.
// Khối `cursor` (F4, SPEC-0.2.0 §6.5): một bước con trỏ neo vào chữ. Mốc neo = KHOẢNH KHẮC hành động (lúc bấm, lúc bắt đầu gõ/cuộn/kéo), không phải lúc bắt đầu di.
// Tham số: { action: move|click|double_click|right_click|drag|type|scroll|hover, target: "btn_save", to?: đích thả (drag), text?: ≤ 80 (type), dy?: px màn (scroll), cps?: 8–20 }
// Đường đi do render/engine/cursor-path.js biên dịch sẵn (plan.cursor, toạ độ khung sau máy quay). Trên sân khấu chỉ beat tự thêm `AUTO-cursor` vẽ:
// con trỏ arrow/hand/ibeam là SVG NỘI TUYẾN do Gen Labs vẽ (CSP chỉ cho img-src data:), gợn sóng màu nhấn (plan.tutorial.accent), bóng kéo, dấu bánh xe; trôi Lissajous 2 px
// chỉ là lớp "sống" (không phải bằng chứng chuyển động — C9 đếm sự kiện thật). Mỗi khung chỉ đổi transform/opacity (L-42).
(function (root) {
  'use strict';
  var isNode = typeof module === 'object' && module.exports;
  var U = isNode ? require('./util') : root.GSUtil;
  var ACTIONS = ['move', 'click', 'double_click', 'right_click', 'drag', 'type', 'scroll', 'hover'];
  // SVG con trỏ (Gen Labs) — điểm nóng (hotspot) tính theo px của hình 40×40
  var SVG = {
    arrow: { hx: 6, hy: 4, s: '<svg width="40" height="40" viewBox="0 0 40 40"><path d="M6 4 L6 31 L12.6 25.2 L17.4 35.6 L22.4 33.4 L17.6 23.2 L26.6 23.2 Z" fill="#fff" stroke="#111827" stroke-width="2.2" stroke-linejoin="round"/></svg>' },
    hand: { hx: 15, hy: 4, s: '<svg width="40" height="40" viewBox="0 0 40 40"><path d="M13 19 L13 6.5 a2.6 2.6 0 0 1 5.2 0 L18.2 17 L18.2 14.6 a2.5 2.5 0 0 1 5 0 L23.2 17.4 L23.2 15.8 a2.5 2.5 0 0 1 5 0 L28.2 18.8 L28.2 17.8 a2.4 2.4 0 0 1 4.8 0 L33 26 C33 32 29.4 36 24 36 L19.6 36 C16.4 36 14.6 34.6 12.8 32.2 L7.6 25.4 a2.6 2.6 0 0 1 4 -3.2 Z" fill="#fff" stroke="#111827" stroke-width="2" stroke-linejoin="round"/></svg>' },
    ibeam: { hx: 20, hy: 20, s: '<svg width="40" height="40" viewBox="0 0 40 40"><path d="M14 7 C17 7 19 8 20 10 C21 8 23 7 26 7 M20 10 L20 30 M14 33 C17 33 19 32 20 30 C21 32 23 33 26 33 M16.5 20 L23.5 20" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round"/><path d="M14 7 C17 7 19 8 20 10 C21 8 23 7 26 7 M20 10 L20 30 M14 33 C17 33 19 32 20 30 C21 32 23 33 26 33 M16.5 20 L23.5 20" fill="none" stroke="#111827" stroke-width="2.2" stroke-linecap="round"/></svg>' }
  };
  var RIPPLE_MS = 420, RIPPLES = 4;
  function sample(keys, t) {
    var n = keys.length; if (!n) return null;
    if (t <= keys[0].t) return keys[0];
    if (t >= keys[n - 1].t) return keys[n - 1];
    var lo = 0, hi = n - 1; while (hi - lo > 1) { var m = (lo + hi) >> 1; if (keys[m].t <= t) lo = m; else hi = m; }
    var a = keys[lo], b = keys[hi], p = (t - a.t) / (b.t - a.t);
    return { x: a.x + (b.x - a.x) * p, y: a.y + (b.y - a.y) * p, kind: a.kind, press: a.press };
  }

  var block = {
    name: 'cursor', version: 1, place: 'track', stackOn: [], peak: 0, settle: Infinity, SVG: SVG,
    schema: { type: 'object', required: ['action', 'target'], additionalProperties: false, properties: {
      action: { type: 'string', enum: ACTIONS }, target: { type: 'string', minLength: 1, maxLength: 32 }, to: { type: 'string', minLength: 1, maxLength: 32 },
      text: { type: 'string', minLength: 1, maxLength: 80 }, dy: { type: 'integer', minimum: -4000, maximum: 4000 }, cps: { type: 'number', minimum: 8, maximum: 20 } } },
    check: function (p) {
      var e = [];
      if (p.action === 'drag' && !p.to) e.push('params.to: kéo (drag) cần đích thả');
      if (p.action !== 'drag' && p.to !== undefined) e.push('params.to: chỉ dùng cho drag');
      if (p.action === 'type' && !p.text) e.push('params.text: gõ (type) cần chữ');
      if (p.action !== 'type' && (p.text !== undefined || p.cps !== undefined)) e.push('params.text/cps: chỉ dùng cho type');
      if (p.action === 'scroll' && !p.dy) e.push('params.dy: cuộn (scroll) cần dy ≠ 0');
      if (p.action !== 'scroll' && p.dy !== undefined) e.push('params.dy: chỉ dùng cho scroll');
      return e;
    },
    footprint: function () { return { w: 1920, h: 1080 }; },
    sfx: [],
    mount: function (layer, p, ctx) {
      var el = U.el('div', 'b-cursor');
      layer.appendChild(el);
      if (ctx.beat.id !== 'AUTO-cursor') { el.style.display = 'none'; return el; }   // bước = dữ liệu; chỉ beat tự thêm vẽ con trỏ (một sprite cho cả bài)
      var plan = ctx.plan, tut = plan.tutorial || {}, accent = tut.accent || '#FF6F59';
      var rip = [], i;
      var svgR = '<svg class="cur-rip" width="96" height="96" viewBox="-48 -48 96 96"><circle class="fill" r="1" fill="' + accent + '"/><circle class="ring" r="1" fill="none" stroke="' + accent + '" stroke-width="6"/></svg>';
      for (i = 0; i < RIPPLES; i++) { var rr = U.el('div', 'cur-ripw', svgR); rr.style.opacity = '0'; el.appendChild(rr); rip.push({ el: rr, fill: rr.querySelector('.fill'), ring: rr.querySelector('.ring') }); }
      var ghost = U.el('div', 'cur-ghost'); ghost.style.opacity = '0'; el.appendChild(ghost);
      var wheel = U.el('div', 'cur-wheel', '<i></i>'); wheel.style.opacity = '0'; el.appendChild(wheel);
      var spr = U.el('div', 'cur-sprite'), kinds = {};
      Object.keys(SVG).forEach(function (k) { var d = U.el('div', 'cur-k k-' + k, SVG[k].s); d.style.display = k === 'arrow' ? '' : 'none'; spr.appendChild(d); kinds[k] = d; });
      el.appendChild(spr);
      el._r = { spr: spr, kinds: kinds, kind: 'arrow', rip: rip, ghost: ghost, ghostLabel: '', wheel: wheel, cursor: plan.cursor || { keys: [], clicks: [], moves: [] }, tut: tut };
      return el;
    },
    draw: function (el, tl, ctx) {
      var r = el._r; if (!r) return;
      var t = ctx.beat.t_in + tl * 1000, cur = r.cursor, k = sample(cur.keys, t);
      if (!k) { el.style.opacity = 0; return; }
      el.style.opacity = U.clamp((t - (r.tut.cursorFrom || 0)) / 300);
      // trôi Lissajous 2 px khi đứng yên (tắt dần quanh đoạn di để đường đi giữ sạch)
      var near = 1e9; (cur.moves || []).forEach(function (m) { near = Math.min(near, t < m.t0 ? m.t0 - t : t > m.t1 ? t - m.t1 : 0); });
      var amp = 2 * U.clamp(near / 400), dx = amp * Math.sin(t / 3100 * 6.2832), dy = amp * Math.sin(t / 4700 * 6.2832 + 1.1);
      if (k.kind !== r.kind && r.kinds[k.kind]) { r.kinds[r.kind].style.display = 'none'; r.kinds[k.kind].style.display = ''; r.kind = k.kind; }
      var z = ctx.plan.camera && root.GSCamera ? root.GSCamera.sample(ctx.plan.camera, t).z : 1, sc = Math.sqrt(z) * (k.press ? 0.88 : 1), h = SVG[r.kind];
      U.setT(r.spr, 'translate(' + (k.x + dx - h.hx * sc) + 'px,' + (k.y + dy - h.hy * sc) + 'px) scale(' + sc + ')');
      // gợn sóng: r 6→36 px (easeOut), vòng đặc màu nhấn tới 200 ms rồi tan; nhấp đúp = 2 gợn
      var live = (cur.clicks || []).filter(function (c) { return t >= c.t && t < c.t + RIPPLE_MS; }).slice(-RIPPLES);
      r.rip.forEach(function (q, i) {
        var c = live[i]; if (!c) { if (q.on) { q.el.style.opacity = 0; q.on = false; } return; }
        var u = (t - c.t) / RIPPLE_MS, rad = 6 + 30 * U.eo(u);
        q.ring.setAttribute('r', rad.toFixed(1)); q.fill.setAttribute('r', (rad * 0.8).toFixed(1));
        q.fill.style.opacity = (0.55 * (1 - u)).toFixed(3);
        U.setT(q.el, 'translate(' + (c.x - 48) + 'px,' + (c.y - 48) + 'px)', u < 0.48 ? 1 : U.clamp(1 - (u - 0.48) / 0.52)); q.on = true;
      });
      // kéo: bản sao mờ 70 % của phần tử đi theo con trỏ
      var dg = (r.tut.drags || []).filter(function (d) { return t >= d.t0 && t <= d.t1 + 120; })[0];
      if (dg && dg.w) {
        if (r.ghostLabel !== dg.beat) { r.ghostLabel = dg.beat; r.ghost.textContent = dg.label || ''; r.ghost.style.width = dg.w + 'px'; r.ghost.style.height = dg.h + 'px'; r.ghost.style.lineHeight = dg.h + 'px'; }
        U.setT(r.ghost, 'translate(' + (k.x - dg.w / 2) + 'px,' + (k.y - dg.h / 2) + 'px) scale(' + z + ')', t > dg.t1 ? 0.7 * (1 - (t - dg.t1) / 120) : 0.7);
      } else if (r.ghostLabel) { r.ghost.style.opacity = 0; r.ghostLabel = ''; }
      // cuộn: dấu bánh xe cạnh con trỏ
      var sc2 = (r.tut.scrolls || []).filter(function (s) { return t >= s.t0 - 120 && t <= s.t1 + 120; })[0];
      if (sc2) U.setT(r.wheel, 'translate(' + (k.x + 26) + 'px,' + (k.y + 30) + 'px)', 1); else if (r.wheel.style.opacity !== '0') r.wheel.style.opacity = 0;
      if (sc2) r.wheel.firstChild.style.transform = 'translateY(' + ((sc2.dy > 0 ? 1 : -1) * 6 * Math.sin((t - sc2.t0) / 90)) + 'px)';
    }
  };
  if (isNode) module.exports = block; else (root.GSBlockDefs = root.GSBlockDefs || {})[block.name] = block;
})(typeof self !== 'undefined' ? self : this);
