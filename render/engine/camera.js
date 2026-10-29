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

  // ---------- bố cục theo tỉ lệ (F7 §4.1) — CHỈ khi plan có `layout` (không legacy); 16:9 đi frameOf/overviewFrame ở trên, không đổi ----------
  // Khung nhìn một vùng: z = clamp(min(frame_box.w/zone.w, frame_box.h/zone.h), z_min, z_max); tâm vùng đặt ở content_center trên màn
  // (máy quay {x,y} = điểm thế giới nằm ở GIỮA khung `size`, như stage.js: translate(size/2 − c·z)). lay = layout.camera, size = [w,h] của tỉ lệ.
  C.frameOfLay = function (zone, hint, lay, size) {
    var fb = lay.frame_box, cc = lay.content_center, zr = lay.z;
    var z = clamp(Math.min(fb[0] / Math.max(1, zone.w), fb[1] / Math.max(1, zone.h)), zr[0], zr[1]);
    if (hint && typeof hint.zoom === 'number') z = clamp(hint.zoom, 0.3, 2);
    var f = { x: zone.cx - (cc[0] - size[0] / 2) / z, y: zone.cy - (cc[1] - size[1] / 2) / z, z: z };
    if (hint) { if (typeof hint.dx === 'number') f.x += hint.dx; if (typeof hint.dy === 'number') f.y += hint.dy; }
    return f;
  };
  // toàn cảnh dọc: lùi cho thấy mọi vùng trong khung `size` (chừa overview_pad_h cho phụ đề/nhân vật); không sàn z (cột dài ⇒ z nhỏ — S13 xem, kém thì layout.overview=false)
  C.overviewFrameLay = function (zones, lay, size) {
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    zones.forEach(function (q) { x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x + q.w); y1 = Math.max(y1, q.y + q.h); });
    var w = x1 - x0 + 360, h = y1 - y0 + 360;
    return { x: (x0 + x1) / 2, y: (y0 + y1) / 2, z: Math.min(1, size[0] / w, (size[1] - lay.overview_pad_h) / h) };
  };
  // tham số cho build() khi plan có layout: thay frameOf/overviewFrame/tâm khung; legacy không truyền ⇒ build() chạy đúng như cũ
  C.layOpts = function (lay, size) {
    // zoomed(f, k): đổi z của khung f thành f.z·k mà điểm thế giới ở content_center đứng yên (cú đẩy vào lúc mở đầu) — tâm nội dung lệch tâm khung nên không zoom quanh {x,y}
    var off = function (f) { return { x: (lay.content_center[0] - size[0] / 2) / f.z, y: (lay.content_center[1] - size[1] / 2) / f.z }; };
    var zoomed = function (f, k) { var a = off(f), g = { x: 0, y: 0, z: f.z * k }, b = off(g); g.x = f.x + a.x - b.x; g.y = f.y + a.y - b.y; return g; };
    return { frame: function (q, h) { return C.frameOfLay(q, h, lay, size); }, overview: function (Z) { return C.overviewFrameLay(Z, lay, size); }, center: { x: size[0] / 2, y: size[1] / 2 }, zoomed: zoomed };
  };

  // build({zones:[{cx,cy,w,h,x,y,tIn,tLast}], hints:{zoneIdx:{zoom,dx,dy}}, overviewT|null, durationMs, frame?, overview?, center?}) → {keys, moves}
  // zone.tIn = mốc vào của beat đầu; zone.tLast = mốc vào của beat cuối (máy quay chưa rời vùng trước tLast + 900 ms).
  // frame/overview/center/zoomed (F7, C.layOpts): chỉ bố cục không-legacy truyền; thiếu ⇒ frameOf/overviewFrame/(960,540)/zoom quanh {x,y} như 0.1.x.
  C.build = function (o) {
    var Z = o.zones, keys = [], moves = [], ctr = o.center || { x: 960, y: 540 };
    if (!Z.length) return { keys: [{ t: 0, x: ctr.x, y: ctr.y, z: 1 }, { t: o.durationMs, x: ctr.x, y: ctr.y, z: 1 }], moves: [] };
    var push = function (t, f) { var last = keys[keys.length - 1]; if (last && t <= last.t) t = last.t + 1; keys.push({ t: Math.round(t), x: +f.x.toFixed(2), y: +f.y.toFixed(2), z: +f.z.toFixed(4) }); };
    var frameOf = o.frame || C.frameOf, overviewOf = o.overview || C.overviewFrame;
    var zoomed = o.zoomed || function (f, k) { return { x: f.x, y: f.y, z: f.z * k }; };
    var frames = Z.map(function (q, i) { return frameOf(q, o.hints && o.hints[i]); });
    var f0 = frames[0];
    push(0, zoomed(f0, INTRO_Z));
    var departMin = 0, cur = f0, curT = 1050;
    // vùng đầu: đẩy ra từ cận cảnh
    var firstMoveStart = Z.length > 1 ? Z[1].tIn : (o.overviewT === null || o.overviewT === undefined ? o.durationMs : o.overviewT);
    var arrive0 = Math.max(400, Math.min(1050, firstMoveStart - 600));
    push(arrive0, f0); curT = arrive0;
    function leave(frame, from) { var d = { x: frame.x, y: frame.y, z: frame.z * DRIFT }; if (from > curT) push(from, d); return d; }   // trôi giữ x,y (aspects.sampleTimes coi đoạn này là máy quay đứng yên)
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
      var ov = overviewOf(Z), start2 = Math.max(o.overviewT, curT + 100), dur2 = 1500;
      leave(cur, start2); moves.push({ t: start2, dur: dur2, dist: 99999, overview: true });
      push(start2 + dur2, ov); cur = ov;
    }
    if (o.durationMs > keys[keys.length - 1].t) push(o.durationMs, { x: cur.x, y: cur.y, z: cur.z });
    return { keys: keys, moves: moves };
  };

  // ---------- máy quay theo vùng (tutorial, SPEC-0.2.0 §6.5) — KHÔNG đổi C.build ở trên ----------
  // Thế giới = màn hiện hành đã đặt vào khung (máy quay {960,540,1} = toàn màn). Mỗi `focus` ⇒ khung nhìn ôm đích với đệm 1,6×:
  // z = clamp(min(1920/(w·1,6), 1080/(h·1,6)), 1, zmax); đích đặt ở điểm neo khung A (mặc định 1000,470 — tránh PiP góc trái dưới và dải phụ đề);
  // khung nhìn được kẹp trong thiết bị (không lộ nền) trừ khi kẹp làm đích rơi khỏi khung an toàn / chạm PiP. Chuyển cảnh easeInOutCubic 600–900 ms (trailer 450–700).
  var FULL = { x: 960, y: 540, z: 1 }, MIN_CTX = { w: 900, h: 506 }, EDGE = 72;
  C.FULL = FULL;
  C.toFrame = function (cam, p) { return { x: (p.x - cam.x) * cam.z + 960, y: (p.y - cam.y) * cam.z + 540 }; };
  C.boxToFrame = function (cam, b) { var a = C.toFrame(cam, { x: b.x, y: b.y }); return { x: a.x, y: a.y, w: b.w * cam.z, h: b.h * cam.z }; };
  var inside = function (b, s) { return b.x >= s.x0 && b.y >= s.y0 && b.x + b.w <= s.x1 && b.y + b.h <= s.y1; };
  var hits = function (a, b) { return !!b && a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; };
  C.regionFrame = function (o) {
    var b = o.box, A = o.anchor || { x: 1000, y: 470 }, safe = o.safe || { x0: 48, y0: 48, x1: 1872, y1: 880 }, d = o.device;
    // vùng ngữ cảnh tối thiểu MIN_CTX (khung px) quanh đích: đích nhỏ không bị phóng tới mức mất ngữ cảnh (z mặc định ≤ ~2,1; `zoom` khai rõ thì theo khai, ≤ zmax)
    var z0 = typeof o.zoom === 'number' ? o.zoom : clamp(Math.min(VIEW.w / Math.max(b.w * 1.6, MIN_CTX.w), VIEW.h / Math.max(b.h * 1.6, MIN_CTX.h)), 1, 2.5);
    z0 = clamp(z0, 1, Math.max(1, o.zmax || 2.5));
    var cx = b.x + b.w / 2, cy = b.y + b.h / 2, at = function (z) { return { x: cx - (A.x - 960) / z, y: cy - (A.y - 540) / z, z: z }; }, f = at(z0);
    if (d) {
      // kẹp khung nhìn trong thiết bị (không lộ nền); không được thì hạ zoom dần (tối đa −30 %), vẫn không được thì giữ đích ở điểm neo
      for (var z = z0; z >= Math.max(1, z0 * 0.7) - 1e-9; z -= 0.1) {
        var g = at(z), hw = 960 / z, hh = 540 / z, m = EDGE / z, dx0 = d.x - m, dx1 = d.x + d.w + m, dy0 = d.y - m, dy1 = d.y + d.h + m;   // lộ nền tối đa EDGE px khung
        g.x = (dx1 - dx0) * z >= VIEW.w ? clamp(g.x, dx0 + hw, dx1 - hw) : (dx0 + dx1) / 2;
        g.y = (dy1 - dy0) * z >= VIEW.h ? clamp(g.y, dy0 + hh, dy1 - hh) : (dy0 + dy1) / 2;
        var fb = C.boxToFrame(g, b), cb = o.reserve ? { x: fb.x, y: fb.y, w: fb.w + o.reserve.w, h: fb.h } : fb;
        if (inside(fb, safe) && inside(cb, safe) && !hits(fb, o.pip)) { f = g; break; }
      }
    }
    return { x: +f.x.toFixed(2), y: +f.y.toFixed(2), z: Math.floor(f.z * 1e4) / 1e4 };   // z làm tròn xuống: không vượt zmax
  };
  C.transitionMs = function (a, b, pace) {
    var lo = pace === 'trailer' ? 450 : 600, hi = pace === 'trailer' ? 700 : 900;
    var dist = Math.hypot(b.x - a.x, b.y - a.y) * Math.max(a.z, b.z) + 320 * Math.abs(Math.log(b.z / a.z));
    return Math.round(clamp(lo + dist * 0.25, lo, hi));
  };
  // buildRegions({ regions:[{t, tEnd, frame:{x,y,z}}] (đã sắp, không chồng: tutorial.js tính tEnd), durationMs, pace }) → { keys, moves:[{t0,t1}], regions:[{t, arrive, tEnd, out}] }
  //   Mỗi vùng: lia từ khung hiện tại tại t → tới khung vùng; giữ tới tEnd; rồi lùi về toàn màn (trừ khi vùng kế bắt đầu ngay tEnd: đi thẳng vùng → vùng).
  C.buildRegions = function (o) {
    var keys = [], moves = [], out = [], cur = FULL, R = o.regions || [];
    var push = function (t, f) { var last = keys[keys.length - 1]; t = Math.round(t); if (last && t <= last.t) t = last.t + 1; keys.push({ t: t, x: +f.x.toFixed(2), y: +f.y.toFixed(2), z: +f.z.toFixed(4) }); return t; };
    push(0, FULL);
    R.forEach(function (r, i) {
      var nx = R[i + 1], F = r.frame, dur = C.transitionMs(cur, F, o.pace);
      var t0 = push(r.t, cur), t1 = push(t0 + dur, F); moves.push({ t0: t0, t1: t1 });
      var tEnd = Math.max(r.tEnd, t1 + 200), rec = { t: t0, arrive: t1, tEnd: tEnd, out: null };
      if (nx && nx.t <= tEnd + 1) { push(Math.max(tEnd, nx.t) - 1, F); cur = F; }
      else { var dOut = C.transitionMs(F, FULL, o.pace), e0 = push(tEnd, F), e1 = push(e0 + dOut, FULL); moves.push({ t0: e0, t1: e1 }); rec.out = e1; cur = FULL; }
      out.push(rec);
    });
    if (o.durationMs > keys[keys.length - 1].t) push(o.durationMs, cur);
    return { keys: keys, moves: moves, regions: out };
  };
  C.VIEW = VIEW;
  if (typeof module === 'object' && module.exports) module.exports = C; else root.GSCamera = C;
})(typeof self !== 'undefined' ? self : this);
