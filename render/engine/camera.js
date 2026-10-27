// © 2026 Gen Labs — All rights reserved.
// Máy quay tự sinh trên "trang vở" thế giới (thuần, không DOM): mỗi vùng nội dung (zone) có một khung nhìn; máy quay lia/zoom
// easeInOutCubic giữa các khung — không cắt cứng. Keyframe {t (ms), x, y, z}; sample() nội suy dùng chung cho Node và trang sân khấu.
(function (root) {
  'use strict';
  var C = {};
  var clamp = function (x, a, b) { return Math.min(b, Math.max(a, x)); };
  // easeInOutCubic — vận tốc 0 ở hai đầu mỗi đoạn
  var eio = C.easeInOutCubic = function (x) { return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
  var VIEW = { w: 1920, h: 1080 }, FOCUS_DY = 60, DRIFT = 1.03, INTRO_Z = 1.32;

  // nội suy tại t (ms): giữa hai keyframe liền kề dùng easeInOutCubic
  C.sample = function (keys, t) {
    var n = keys.length; if (!n) return { x: VIEW.w / 2, y: VIEW.h / 2, z: 1 };
    if (t <= keys[0].t) return { x: keys[0].x, y: keys[0].y, z: keys[0].z };
    if (t >= keys[n - 1].t) return { x: keys[n - 1].x, y: keys[n - 1].y, z: keys[n - 1].z };
    var lo = 0, hi = n - 1; while (hi - lo > 1) { var m = (lo + hi) >> 1; if (keys[m].t <= t) lo = m; else hi = m; }
    var a = keys[lo], b = keys[hi], p = eio((t - a.t) / (b.t - a.t));
    return { x: a.x + (b.x - a.x) * p, y: a.y + (b.y - a.y) * p, z: a.z + (b.z - a.z) * p };
  };

  // khung nhìn cho một vùng: canh giữa, zoom vừa đủ (chừa chỗ cho nhân vật ở hai góc dưới và phụ đề)
  C.frameOf = function (zone, hint) {
    var z = clamp(Math.min(1340 / Math.max(1, zone.w), 660 / Math.max(1, zone.h)), 0.7, 1.05);
    var f = { x: zone.cx, y: zone.cy + FOCUS_DY, z: z };
    if (hint) { if (typeof hint.zoom === 'number') f.z = clamp(hint.zoom, 0.3, 2); if (typeof hint.dx === 'number') f.x += hint.dx; if (typeof hint.dy === 'number') f.y += hint.dy; }
    return f;
  };
  // toàn cảnh: lùi máy quay cho thấy mọi vùng
  C.overviewFrame = function (zones) {
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    zones.forEach(function (q) { x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x + q.w); y1 = Math.max(y1, q.y + q.h); });
    var w = x1 - x0 + 360, h = y1 - y0 + 360;
    return { x: (x0 + x1) / 2, y: (y0 + y1) / 2 + 30, z: clamp(Math.min(VIEW.w / w, (VIEW.h - 120) / h), 0.3, 1) };
  };

  // build({zones:[{cx,cy,w,h,x,y,tIn,tLast}], hints:{zoneIdx:{zoom,dx,dy}}, overviewT|null, durationMs}) → {keys, moves}
  // zone.tIn = mốc vào của beat đầu; zone.tLast = mốc vào của beat cuối (máy quay chưa rời vùng trước tLast + 900 ms).
  C.build = function (o) {
    var Z = o.zones, keys = [], moves = [];
    if (!Z.length) return { keys: [{ t: 0, x: 960, y: 540, z: 1 }, { t: o.durationMs, x: 960, y: 540, z: 1 }], moves: [] };
    var push = function (t, f) { var last = keys[keys.length - 1]; if (last && t <= last.t) t = last.t + 1; keys.push({ t: Math.round(t), x: +f.x.toFixed(2), y: +f.y.toFixed(2), z: +f.z.toFixed(4) }); };
    var frames = Z.map(function (q, i) { return C.frameOf(q, o.hints && o.hints[i]); });
    var f0 = frames[0];
    push(0, { x: f0.x, y: f0.y, z: f0.z * INTRO_Z });
    var departMin = 0, cur = f0, curT = 1050;
    // vùng đầu: đẩy ra từ cận cảnh
    var firstMoveStart = Z.length > 1 ? Z[1].tIn : (o.overviewT === null || o.overviewT === undefined ? o.durationMs : o.overviewT);
    var arrive0 = Math.max(400, Math.min(1050, firstMoveStart - 600));
    push(arrive0, f0); curT = arrive0;
    function leave(frame, from) { var d = { x: frame.x, y: frame.y, z: frame.z * DRIFT }; if (from > curT) push(from, d); return d; }
    for (var i = 1; i < Z.length; i++) {
      var prev = Z[i - 1], tgt = frames[i], dist = Math.hypot(tgt.x - cur.x, tgt.y - cur.y) * Math.max(cur.z, tgt.z);
      var dur = clamp(500 + dist / 2.8, 800, 1700);
      var tArr = Z[i].tIn + 150, start = tArr - dur, dMin = Math.max(curT + 300, prev.tLast + 900);
      if (start < dMin) { start = dMin; dur = Math.max(550, tArr - start); tArr = start + dur; }
      var from = leave(cur, start);
      moves.push({ t: start, dur: dur, dist: dist });
      push(tArr, tgt); cur = tgt; curT = tArr;
    }
    if (o.overviewT !== null && o.overviewT !== undefined) {
      var ov = C.overviewFrame(Z), start2 = Math.max(o.overviewT, curT + 100), dur2 = 1500;
      leave(cur, start2); moves.push({ t: start2, dur: dur2, dist: 99999, overview: true });
      push(start2 + dur2, ov); cur = ov;
    }
    if (o.durationMs > keys[keys.length - 1].t) push(o.durationMs, { x: cur.x, y: cur.y, z: cur.z });
    return { keys: keys, moves: moves };
  };
  C.VIEW = VIEW;
  if (typeof module === 'object' && module.exports) module.exports = C; else root.GSCamera = C;
})(typeof self !== 'undefined' ? self : this);
