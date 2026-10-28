// © 2026 Gen Labs — All rights reserved.
// Khối `callout` (F4, SPEC-0.2.0 §6.5): chú thích có mũi tên chỉ vào đích, KHÔNG phóng. Tham số: { target, text ≤ 60 ký tự (≤ 2 dòng), side?: auto|top|bottom|left|right }.
// Vị trí thẻ + phía đã tính sẵn trong Node (render/engine/tutorial.js calloutBox — nằm trọn khung an toàn, né PiP) nên G-CURSOR C7 đo đúng cái sân khấu vẽ.
// Cũng cấp lớp phủ dùng chung cho `focus`: overlay(layer, accent, dim) → {el, draw(ringBox, alpha, dimAlpha, bounce, callout?, calloutAlpha)}.
// Làm tối nền = MỘT path SVG evenodd (khung ngoài trừ lỗ đích), vòng sáng = rect SVG stroke 6 px màu nhấn — không filter/backdrop-filter; mỗi khung chỉ đổi thuộc tính SVG + transform/opacity.
(function (root) {
  'use strict';
  var isNode = typeof module === 'object' && module.exports;
  var U = isNode ? require('./util') : root.GSUtil;
  var NS = 'http://www.w3.org/2000/svg';

  function overlay(layer, accent, opts) {
    var el = U.el('div', 'b-ovl'); el.style.display = 'none'; layer.appendChild(el);
    var svg = document.createElementNS(NS, 'svg'); svg.setAttribute('width', '1920'); svg.setAttribute('height', '1080'); svg.setAttribute('class', 'ovl-svg'); el.appendChild(svg);
    var dim = document.createElementNS(NS, 'path'); dim.setAttribute('fill', '#05070D'); dim.setAttribute('fill-rule', 'evenodd'); dim.setAttribute('opacity', '0'); svg.appendChild(dim);
    var ring = document.createElementNS(NS, 'rect'); ring.setAttribute('fill', 'none'); ring.setAttribute('stroke', accent); ring.setAttribute('stroke-width', String(opts.stroke || 6)); ring.setAttribute('rx', '12'); ring.setAttribute('opacity', '0'); svg.appendChild(ring);
    var card = null, txt = null, arrow = null;
    if (opts.callout) {
      card = U.el('div', 'ovl-card'); card.style.opacity = '0'; card.style.borderColor = accent; el.appendChild(card);
      txt = U.el('div', 'ovl-text'); card.appendChild(txt);
      opts.callout.lines.forEach(function (l, i) { if (i) txt.appendChild(document.createElement('br')); txt.appendChild(document.createTextNode(l)); });
      card.style.width = opts.callout.w + 'px'; card.style.height = opts.callout.h + 'px'; card.style.fontSize = opts.callout.fs + 'px';
      arrow = U.el('i', 'ovl-arrow a-' + opts.callout.side); arrow.style.borderColor = accent; card.appendChild(arrow);
    }
    var shown = false;
    return {
      el: el,
      hide: function () { if (shown) { el.style.display = 'none'; shown = false; } },
      // rb = hộp vòng sáng (khung); a = độ hiện vòng; da = độ tối nền; bounce = hệ số nảy; cb = hộp thẻ đã dời theo vòng; ca = độ hiện thẻ
      draw: function (rb, a, da, bounce, cb, ca) {
        if (!shown) { el.style.display = ''; shown = true; }
        var cx = rb.x + rb.w / 2, cy = rb.y + rb.h / 2, w = rb.w * bounce, h = rb.h * bounce, x = cx - w / 2, y = cy - h / 2;
        ring.setAttribute('x', x.toFixed(1)); ring.setAttribute('y', y.toFixed(1)); ring.setAttribute('width', w.toFixed(1)); ring.setAttribute('height', h.toFixed(1)); ring.setAttribute('opacity', a.toFixed(3));
        if (da > 0.001) {
          var hx = rb.x - 4, hy = rb.y - 4, hw = rb.w + 8, hh = rb.h + 8;
          dim.setAttribute('d', 'M-10 -10H1930V1090H-10Z M' + hx.toFixed(1) + ' ' + hy.toFixed(1) + 'h' + hw.toFixed(1) + 'v' + hh.toFixed(1) + 'h' + (-hw).toFixed(1) + 'Z');
          dim.setAttribute('opacity', da.toFixed(3));
        } else dim.setAttribute('opacity', '0');
        if (card && cb) U.setT(card, 'translate(' + cb.x.toFixed(1) + 'px,' + cb.y.toFixed(1) + 'px)', ca);
      }
    };
  }

  var block = {
    name: 'callout', version: 1, place: 'track', stackOn: [], peak: 0.3, settle: Infinity, overlay: overlay,
    schema: { type: 'object', required: ['target', 'text'], additionalProperties: false, properties: {
      target: { type: 'string', minLength: 1, maxLength: 32 }, text: { type: 'string', minLength: 1, maxLength: 60 }, side: { type: 'string', enum: ['auto', 'top', 'bottom', 'left', 'right'] } } },
    footprint: function () { return { w: 1920, h: 1080 }; },
    sfx: [],
    mount: function (layer, p, ctx) {
      var tut = ctx.plan.tutorial || {}, c = (tut.callouts || []).filter(function (x) { return x.beat === ctx.beat.id; })[0];
      if (!c) { var e = U.el('div', 'b-callout'); e.style.display = 'none'; layer.appendChild(e); return e; }
      var o = overlay(layer, tut.accent || '#FF6F59', { stroke: 4, callout: c.callout });
      o.el._r = { o: o, c: c }; o.el.classList.add('b-callout');
      return o.el;
    },
    draw: function (el, tl, ctx) {
      var r = el._r; if (!r) return;
      var c = r.c, t = ctx.beat.t_in + tl * 1000;
      if (t > c.tEnd + 300) { r.o.hide(); return; }
      var cam = root.GSCamera.sample(ctx.plan.camera, t), b = root.GSCamera.boxToFrame(cam, c.box);
      var rb = { x: b.x - 8, y: b.y - 8, w: b.w + 16, h: b.h + 16 }, dx = rb.x - c.ring.x, dy = rb.y - c.ring.y;
      var a = U.clamp((t - c.t) / 220) * (1 - U.clamp((t - c.tEnd) / 300));
      r.o.draw(rb, a, 0, 1, { x: c.callout.x + dx, y: c.callout.y + dy + (1 - U.eo(U.clamp((t - c.t) / 260))) * 14 }, a);
    }
  };
  if (isNode) module.exports = block; else (root.GSBlockDefs = root.GSBlockDefs || {})[block.name] = block;
})(typeof self !== 'undefined' ? self : this);
