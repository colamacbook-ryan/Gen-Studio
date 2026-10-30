// © 2026 Gen Labs — All rights reserved.
// Khối `split-compare-run` (K19): màn chia đôi — lần chạy CŨ (trái) và MỚI (phải) của agent chạy song song trên CÙNG một đồng hồ (giữa màn có đồng hồ chung 0:00 ↑),
// mỗi bên là một bảng agent-steps (dùng lại agent-steps.panel: cùng trạng thái, cùng nút Duyệt/Từ chối, cùng con trỏ "Bạn").
// Tham số: { left: SIDE, right: SIDE, clock?: bool (mặc định true) } với SIDE = { label?: ≤16 (mặc định "Lệnh cũ"/"Lệnh mới"), title?: ≤30, task?: ≤60,
//   steps: (như agent-steps, 1–4), step_s?: 1–8, decision?: approve|reject, decide_at?: cue }
// Chỉ 16:9 (hai bảng cạnh nhau cần bề ngang; 9:16 dùng hai agent-steps nối tiếp). Chữ UI ≥ 22 px@720 sau zoom (mono 38 px thế giới).
// Ngân sách (L-42): mỗi bảng ≤ 4 phần tử động cùng lúc (hàng đang chạy, vòng quay, huy hiệu/nút, con trỏ) + đồng hồ ⇒ ≤ 9 trong khoảnh khắc hai bên cùng đổi; chỉ transform/opacity.
(function (root) {
  'use strict';
  var isNode = typeof module === 'object' && module.exports;
  var U = isNode ? require('./util') : root.GSUtil;
  var AS = function () { return (isNode ? require('./agent-steps') : root.GSBlockDefs['agent-steps']).panel; };
  var PW = 640, GAP = 40, TAG = 70;
  var side = function () {
    return { type: 'object', required: ['steps'], additionalProperties: false, properties: {
      label: { type: 'string', maxLength: 16 }, title: { type: 'string', maxLength: 30 }, task: { type: 'string', maxLength: 60 },
      steps: { type: 'array', minItems: 1, maxItems: 4, items: AS().STEPS_SCHEMA.items }, step_s: { type: 'number', minimum: 1, maximum: 8 },
      decision: { type: 'string', enum: ['approve', 'reject'] }, decide_at: { type: 'cue' } } };
  };
  // hai bảng cùng chiều cao (hàng thẳng nhau ⇒ dễ so); chữ mono 38 px thế giới để ≥ 22 px@720 sau zoom ~0,87
  var lay = function (p) {
    var a = AS(), L = a.lay(p.left, '16:9', PW), R = a.lay(p.right, '16:9', PW);
    [L, R].forEach(function (x, i) { var s = i ? p.right : p.left; x.mfs = 38; x.rowH = Math.round(x.tfs * 1.25 + x.mfs * 1.3 + 30); x.task = (p.left.task || p.right.task) ? 92 : 0; x.H = x.head + x.task + s.steps.length * (x.rowH + 10) + 24; });
    var H = Math.max(L.H, R.H); L.H = R.H = H;
    return { L: L, R: R, W: PW * 2 + GAP, H: H + TAG };
  };
  var nC = function (p) { return p.left.steps.length + 1; };
  var cuesOf = function (s) { return s.steps.map(function (x) { return x.at; }).concat([s.decide_at]); };
  var split = function (p, cues) { var n = nC(p); return cues ? [cues.slice(0, n), cues.slice(n)] : [null, null]; };
  var block = {
    name: 'split-compare-run', version: 1, place: 'new', stackOn: [], peak: 0.8,
    schema: { type: 'object', required: ['left', 'right'], additionalProperties: false, properties: { left: side(), right: side(), clock: { type: 'boolean' } } },
    check: function (p) {
      var e = [], ag = isNode ? require('./agent-steps') : root.GSBlockDefs['agent-steps'];
      ['left', 'right'].forEach(function (k) { if (p[k] && Array.isArray(p[k].steps)) ag.check(p[k]).forEach(function (x) { e.push(x.replace('params.', 'params.' + k + '.')); }); });
      return e;
    },
    cues: function (p) { return cuesOf(p.left).concat(cuesOf(p.right)); },
    settleFor: function (p, ctx) {
      var a = AS(), c = split(p, ctx && ctx.cues), end = 0;
      [[p.left, c[0]], [p.right, c[1]]].forEach(function (x) { var T = a.timing(x[0], x[1]); end = Math.max(end, T.res[T.res.length - 1], T.dec); });
      return p.clock === false ? end + 1.6 : undefined;   // đồng hồ chạy suốt ⇒ không lắng (1 phần tử đổi chữ mỗi giây)
    },
    footprint: function (aspect, p) { if (!p || !p.left) return { w: PW * 2 + GAP, h: 700 }; var L = lay(p); return { w: L.W, h: L.H }; },
    sfx: [{ at: 'in', name: 'slide-up', vol: 0.25 }],
    sfxTimed: function (p, cues) {
      var ag = isNode ? require('./agent-steps') : root.GSBlockDefs['agent-steps'], c = split(p, cues), out = [];
      ag.sfxTimed(p.left, c[0]).concat(ag.sfxTimed(p.right, c[1]).slice(1)).forEach(function (s) { out.push(s); });
      return out.sort(function (a, b) { return a.t - b.t; });
    },
    mount: function (world, p, ctx) {
      var a = AS(), G = lay(p), box = U.box(ctx.slot, 'b-split'), h = '';
      [['left', G.L, 0], ['right', G.R, PW + GAP]].forEach(function (x) {
        h += '<div class="sp-col ' + x[0] + '" style="left:' + x[2] + 'px;width:' + PW + 'px"><div class="sp-tag"></div><div class="sp-p">' + a.html(p[x[0]], x[1], 'sp') + '</div></div>';
      });
      if (p.clock !== false) h += '<div class="sp-clock"><b>0:00</b></div>';
      box.innerHTML = h;
      var cols = [].slice.call(box.querySelectorAll('.sp-col')).map(function (c, i) {
        var s = i ? p.right : p.left; c.querySelector('.sp-tag').textContent = s.label || (i ? 'Lệnh mới' : 'Lệnh cũ');
        return { c: c, tag: c.querySelector('.sp-tag'), R: a.refs(c.querySelector('.as-w'), s) };
      });
      world.appendChild(box);
      box._r = { cols: cols, clock: box.querySelector('.sp-clock'), cb: box.querySelector('.sp-clock b'), sec: -1 };
      return box;
    },
    draw: function (el, t, ctx) {
      var a = AS(), r = el._r, p = ctx.chain[0].params, c = split(p, ctx.cues);
      r.cols.forEach(function (C, i) {
        var s = i ? p.right : p.left, T = a.timing(s, c[i]);
        C.ev = C.ev || a.statusEvents(s, T);
        var tq = U.back(U.seg(t, 0.1 + i * 0.12, 0.55 + i * 0.12), 1.4);
        U.setT(C.tag, 'rotate(' + (i ? 2 : -2) + 'deg) scale(' + U.f3(U.lerp(0.5, 1, tq)) + ')', U.f3(U.clamp(tq * 2)));
        a.paint(C.R, s, T, t, C.ev);   // CÙNG một t cho hai bên — đồng bộ tuyệt đối
      });
      if (r.clock) {
        var cq = U.back(U.seg(t, 0.3, 0.7), 1.5), sec = Math.max(0, Math.floor(t - 0.8));
        U.setT(r.clock, 'translate(-50%,0) scale(' + U.f3(cq) + ')', U.f3(U.clamp(cq * 2)));
        if (sec !== r.sec) { r.sec = sec; r.cb.textContent = Math.floor(sec / 60) + ':' + ('0' + (sec % 60)).slice(-2); }   // chỉ đổi chữ khi sang giây mới
      }
    }
  };
  block.layout = lay;
  if (isNode) module.exports = block; else (root.GSBlockDefs = root.GSBlockDefs || {})[block.name] = block;
})(typeof self !== 'undefined' ? self : this);
