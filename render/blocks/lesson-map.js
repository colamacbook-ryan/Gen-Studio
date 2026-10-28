// © 2026 Gen Labs — All rights reserved.
// Khối `lesson-map`: bản đồ bài học — máy quay lùi ra toàn cảnh trang vở, một đường chấm vẽ dần nối các vùng theo thứ tự đã đi qua,
// mỗi vùng có huy hiệu số. Không tham số: engine tự điền từ bố cục (ctx.zones). buildPlan tự thêm khối này cuối bài nếu bài chưa có.
(function (root) {
  'use strict';
  var U = (typeof module === 'object' && module.exports) ? require('./util') : root.GSUtil;
  var block = {
    name: 'lesson-map', version: 1, place: 'overview', stackOn: [], peak: 1.4, settle: 4,
    schema: { type: 'object', required: [], additionalProperties: false, properties: {} },
    footprint: function () { return { w: 0, h: 0 }; },
    sfx: [{ at: 'in', name: 'slide-up', vol: 0.3 }],
    mount: function (world, p, ctx) {
      var NS = 'http://www.w3.org/2000/svg', box = U.box(ctx.slot, 'b-map'), svg = document.createElementNS(NS, 'svg');
      svg.setAttribute('width', ctx.slot.w); svg.setAttribute('height', ctx.slot.h); svg.setAttribute('viewBox', '0 0 ' + ctx.slot.w + ' ' + ctx.slot.h);
      var pts = ctx.zones.map(function (z) { return { x: z.x - 20, y: z.y - 20 }; }), d = '';
      pts.forEach(function (q, i) { if (!i) d = 'M' + q.x + ' ' + q.y; else { var a = pts[i - 1], mx = (a.x + q.x) / 2, my = (a.y + q.y) / 2 - 90; d += ' Q' + mx + ' ' + my + ' ' + q.x + ' ' + q.y; } });
      var defs = document.createElementNS(NS, 'defs'), mk = document.createElementNS(NS, 'mask'), reveal = document.createElementNS(NS, 'path');
      mk.setAttribute('id', 'lm-mask'); mk.setAttribute('maskUnits', 'userSpaceOnUse'); mk.setAttribute('x', 0); mk.setAttribute('y', 0); mk.setAttribute('width', ctx.slot.w); mk.setAttribute('height', ctx.slot.h);
      [['d', d || 'M0 0'], ['fill', 'none'], ['stroke', 'white'], ['stroke-width', '30'], ['pathLength', '1'], ['stroke-dasharray', '1'], ['stroke-dashoffset', '1']].forEach(function (kv) { reveal.setAttribute(kv[0], kv[1]); });
      mk.appendChild(reveal); defs.appendChild(mk); svg.appendChild(defs);
      var path = document.createElementNS(NS, 'path');
      [['d', d || 'M0 0'], ['fill', 'none'], ['style', 'stroke:var(--v-accent2)'], ['stroke-width', '12'], ['stroke-linecap', 'round'], ['pathLength', '1'], ['stroke-dasharray', '0.012 0.016'], ['mask', 'url(#lm-mask)']].forEach(function (kv) { path.setAttribute(kv[0], kv[1]); });
      svg.appendChild(path);
      var badges = pts.map(function (q, i) {
        var g = document.createElementNS(NS, 'g'); g.setAttribute('transform', 'translate(' + q.x + ' ' + q.y + ')');
        g.innerHTML = '<circle r="44" style="fill:var(--v-ink);stroke:var(--v-card)" stroke-width="6"/><text y="17" text-anchor="middle" font-size="50" font-weight="800" style="fill:var(--v-card)" font-family="inherit">' + (i + 1) + '</text>';
        svg.appendChild(g); return g;
      });
      box.appendChild(svg); world.appendChild(box);
      box._r = { reveal: reveal, badges: badges, n: pts.length };
      return box;
    },
    draw: function (el, t) {
      var r = el._r; U.dash(r.reveal, U.eo(U.seg(t, 0.3, 2.2)));
      r.badges.forEach(function (g, i) { var q = 0.3 + (i / Math.max(1, r.n)) * 1.6; g.style.opacity = U.clamp(U.seg(t, q, q + 0.4) * 2); });
    }
  };
  if (typeof module === 'object' && module.exports) module.exports = block; else (root.GSBlockDefs = root.GSBlockDefs || {})[block.name] = block;
})(typeof self !== 'undefined' ? self : this);
