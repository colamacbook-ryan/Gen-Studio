// © 2026 Gen Labs — All rights reserved.
// Biên dịch rãnh con trỏ (SPEC-0.2.0 §6.5, CNS-100) — thuần, không DOM, tất định (F4-7: cùng input ⇒ cùng byte JSON).
// compile({ steps, camAt, camMoves, fps, durationMs, startT, startPos, constants? }) →   (compileCursor(o) = compile(o).cursor, hoặc null khi không có bước)
//   { cursor: { keys:[{t,x,y,kind,press}], clicks:[{t,x,y}], typing:[{t0,t1,target,text,screen,at}], moves:[{t0,t1}] },   // x,y = khung 1920×1080 SAU máy quay
//     steps:[{beat, action, t, moveStart, arrive, from, p}], drags:[{beat,t0,t1,label,w,h}] }
//   steps (toạ độ THẾ GIỚI = màn đã đặt vào khung ở máy quay z=1): [{ id, action, t (mốc hành động, ms), p:{x,y}, W (cạnh nhỏ của đích, px thế giới), kind:'hand'|'ibeam'|'arrow',
//            to?:{x,y}, toW?, text?, cps?, scrollMs?, target, screen, label?, dragBox?:{w,h} }]
//   camAt(t) → {x,y,z} (camera.sample) · camMoves: [{t0,t1}] đoạn máy quay lia (con trỏ KHÔNG di trong các đoạn này).
// Luật: Fitts T = clamp(max(250 + 150·log2(D/W + 1), 0,45·L), 350, 1300) ms (D, W, L đo bằng px khung sau máy quay; L = độ dài cung ≥ D nên sàn chặt hơn 0,45·D);
// đường Bézier bậc 3 lệch vuông góc 8–18 % theo hash(beat.id); easing minimum-jerk 10u³−15u⁴+6u⁵; D > 600 px ⇒ vượt đà 3–6 px rồi lắng 120 ms;
// tới đích trước mốc hành động ≥ 150 ms; bấm: nhấn 80 ms + gợn; nhấp đúp 2 gợn cách 140 ms; kéo: nhấn → di T×1,3 → thả có gợn; gõ: cps mặc định 14 (±20 % theo hash).
(function (root) {
  'use strict';
  var C = {};
  var DEF = { a: 250, b: 150, floorK: 0.45, tMin: 350, tMax: 1300, dwell: 150, settle: 120, overMin: 3, overMax: 6, overD: 600, bendMin: 0.08, bendMax: 0.18,
    press: 80, dbl: 140, dragK: 1.3, dragHold: 120, cps: 14, cpsJit: 0.2, gap: 40 };
  C.DEFAULTS = DEF;
  var clamp = function (x, a, b) { return Math.min(b, Math.max(a, x)); };
  var r2 = function (v) { return Math.round(v * 100) / 100; };
  var r1 = function (v) { return Math.round(v * 10) / 10; };

  // FNV-1a 32-bit → [0,1): tất định theo chuỗi (id beat) + muối
  C.hash01 = function (s, salt) {
    var h = 0x811c9dc5, str = String(s) + '|' + (salt === undefined ? '' : salt);
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return (h >>> 0) / 4294967296;
  };
  C.minJerk = function (u) { u = clamp(u, 0, 1); return u * u * u * (10 + u * (-15 + 6 * u)); };
  C.minJerkVel = function (u) { u = clamp(u, 0, 1); return 30 * u * u * (1 - u) * (1 - u); };   // ds/du — 0 ở hai đầu
  C.eio = function (x) { return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
  C.fittsMs = function (D, W, L, k) {
    k = k || DEF;
    var T = k.a + k.b * Math.log2(D / Math.max(1, W) + 1);
    return clamp(Math.max(T, k.floorK * Math.max(D, L || 0)), k.tMin, k.tMax);
  };

  // Bézier bậc 3 p0→p1, điểm điều khiển lệch vuông góc f·D (f ∈ [8%, 18%], chiều theo hash)
  C.bezier = function (p0, p1, seed, k) {
    k = k || DEF;
    var dx = p1.x - p0.x, dy = p1.y - p0.y, D = Math.hypot(dx, dy);
    var f = k.bendMin + (k.bendMax - k.bendMin) * C.hash01(seed, 'bend'), sgn = C.hash01(seed, 'side') < 0.5 ? -1 : 1;
    var nx = D ? -dy / D : 0, ny = D ? dx / D : 0, off = sgn * f * D;
    var c1 = { x: p0.x + dx / 3 + nx * off, y: p0.y + dy / 3 + ny * off }, c2 = { x: p0.x + 2 * dx / 3 + nx * off, y: p0.y + 2 * dy / 3 + ny * off };
    var pth = { p0: p0, c1: c1, c2: c2, p1: p1, D: D, L: 0 };
    var prev = p0; for (var i = 1; i <= 32; i++) { var q = C.bezAt(pth, i / 32); pth.L += Math.hypot(q.x - prev.x, q.y - prev.y); prev = q; }
    return pth;
  };
  C.bezAt = function (p, u) {
    var v = 1 - u, a = v * v * v, b = 3 * v * v * u, c = 3 * v * u * u, d = u * u * u;
    return { x: a * p.p0.x + b * p.c1.x + c * p.c2.x + d * p.p1.x, y: a * p.p0.y + b * p.c1.y + c * p.c2.y + d * p.p1.y };
  };

  // một đoạn di: {t0, T, settle, path, over:{x,y}|null} → vị trí thế giới tại t
  function moveAt(m, t) {
    if (t <= m.t0) return m.path.p0;
    if (t < m.t0 + m.T) { var s = C.minJerk((t - m.t0) / m.T); var q = C.bezAt(m.path, s); return m.over ? { x: q.x + m.over.x * s, y: q.y + m.over.y * s } : q; }
    if (m.over && t < m.t0 + m.T + m.settle) { var e = C.eio((t - m.t0 - m.T) / m.settle); return { x: m.path.p1.x + m.over.x * (1 - e), y: m.path.p1.y + m.over.y * (1 - e) }; }
    return m.path.p1;
  }
  C.moveAt = moveAt;

  C.typingTimes = function (text, t0, cps, seed, k) {
    k = k || DEF; var at = [], t = t0, base = 1000 / clamp(cps || k.cps, 8, 20);
    for (var i = 0; i < text.length; i++) { at.push(Math.round(t)); t += base * (1 - k.cpsJit + 2 * k.cpsJit * C.hash01(seed, 'c' + i)) * (text[i] === ' ' ? 1.15 : 1); }
    return at;
  };

  // compileCursor(o) → plan.cursor | null (không có bước nào ⇒ null, hợp lệ theo lược đồ h-fixtures) · compile(o) → kết quả đầy đủ (cursor + steps + drags)
  C.compileCursor = function (o) { return o && Array.isArray(o.steps) && o.steps.length ? C.compile(o).cursor : null; };
  C.compile = function (o) {
    var k = Object.assign({}, DEF, o.constants || {}), fps = o.fps || 30, camAt = o.camAt, camMoves = o.camMoves || [];
    var cur = { x: o.startPos.x, y: o.startPos.y }, busy = o.startT || 0;
    var moves = [], presses = [], clicks = [], typing = [], kinds = [{ t: 0, kind: 'arrow' }], out = [], drags = [];
    var overlapCam = function (a, b) { for (var i = 0; i < camMoves.length; i++) { var m = camMoves[i]; if (a < m.t1 && b > m.t0) return m; } return null; };
    function planMove(from, to, tStart, tArrive, seed, W, slow) {
      // tStart: sớm nhất được đi; tArrive: muộn nhất phải tới (null = không ràng). → {t0, T, settle, path, over} | null
      var z = camAt(tArrive === null ? tStart : tArrive).z, path = C.bezier(from, to, seed, k), D = path.D * z;
      if (D < 1) return null;
      var T = C.fittsMs(D, W * z, path.L * z, k) * (slow || 1), Tfloor = Math.max(k.tMin, k.floorK * path.L * z) * (slow || 1);
      var over = null, settle = 0;
      if (D > k.overD) { var o2 = (k.overMin + (k.overMax - k.overMin) * C.hash01(seed, 'over')) / z; over = { x: (to.x - from.x) / path.D * o2, y: (to.y - from.y) / path.D * o2 }; settle = k.settle; }
      var t0 = tArrive === null ? tStart : Math.max(tStart, tArrive - T - settle);
      // máy quay lia ⇒ con trỏ đứng. Đoạn di chạm đoạn lia: ưu tiên di XONG TRƯỚC khi máy quay bắt đầu (con trỏ đã nằm ở đích khi phóng — không "bay" khỏi khung),
      // không kịp thì dời ra sau đoạn lia (nén về sàn Fitts; vẫn trễ thì G-CURSOR báo C3/C5).
      var m0 = overlapCam(t0, t0 + T + settle);
      if (m0) {
        var zb = camAt(m0.t0).z, Tb = C.fittsMs(path.D * zb, W * zb, path.L * zb, k) * (slow || 1), tb = m0.t0 - 1 - Tb - settle;
        if (tb >= tStart && !overlapCam(tb, tb + Tb + settle)) return { t0: tb, T: Tb, settle: settle, path: path, over: over, seed: seed };
        for (var g = 0; g < 8; g++) { var m = overlapCam(t0, t0 + T + settle); if (!m) break; t0 = m.t1 + 1; }
      }
      if (tArrive !== null && t0 + T + settle > tArrive) T = Math.max(Tfloor, tArrive - t0 - settle);   // bước trước bận lâu / sau đoạn lia: nén về sàn Fitts
      return { t0: t0, T: T, settle: settle, path: path, over: over, seed: seed };
    }
    (o.steps || []).forEach(function (s) {
      var rec = { beat: s.id, action: s.action, t: s.t, from: { x: r1(cur.x), y: r1(cur.y) }, p: { x: r1(s.p.x), y: r1(s.p.y) }, moveStart: null, arrive: null };
      var m = planMove(cur, s.p, busy + k.gap, s.t - k.dwell, s.id, s.W || 40, 1);
      if (m) { moves.push(m); kinds.push({ t: m.t0, kind: 'arrow' }); rec.moveStart = r2(m.t0); rec.arrive = r2(m.t0 + m.T + m.settle); cur = s.p; }
      else rec.arrive = r2(Math.max(busy, s.t - k.dwell));
      kinds.push({ t: rec.arrive, kind: s.kind || 'arrow' });
      var a = s.action, t = s.t;
      if (a === 'click' || a === 'right_click') { presses.push([t, t + k.press]); clicks.push({ t: t, p: s.p }); busy = t + k.press + 20; }
      else if (a === 'double_click') { presses.push([t, t + k.press - 10], [t + k.dbl, t + k.dbl + k.press - 10]); clicks.push({ t: t, p: s.p }, { t: t + k.dbl, p: s.p }); busy = t + k.dbl + k.press + 20; }
      else if (a === 'hover' || a === 'move') busy = t;
      else if (a === 'type') {
        var at = C.typingTimes(s.text || '', t, s.cps, s.id, k), t1 = at.length ? at[at.length - 1] + 60 : t;
        typing.push({ t0: t, t1: t1, target: s.target, text: s.text || '', screen: s.screen, at: at }); busy = t1;
      } else if (a === 'scroll') busy = t + (s.scrollMs || 700);
      else if (a === 'drag') {
        var d0 = t + k.dragHold, m2 = planMove(s.p, s.to, d0, null, s.id + '>', s.toW || 40, k.dragK);
        var rel = m2 ? m2.t0 + m2.T + m2.settle : d0;
        if (m2) { moves.push(m2); cur = s.to; }
        presses.push([t, rel]); clicks.push({ t: rel, p: s.to }); kinds.push({ t: t, kind: 'hand' });
        drags.push({ beat: s.id, t0: t, t1: rel, label: s.label || '', w: (s.dragBox && s.dragBox.w) || 0, h: (s.dragBox && s.dragBox.h) || 0 });
        rec.release = r2(rel); busy = rel + 100;
      }
      out.push(rec);
    });
    kinds.sort(function (a, b) { return a.t - b.t; });

    var posAt = function (t) { var p = { x: o.startPos.x, y: o.startPos.y }; for (var i = 0; i < moves.length; i++) { if (t < moves[i].t0) break; p = moveAt(moves[i], t); } return p; };
    var kindAt = function (t) { var kd = 'arrow'; for (var i = 0; i < kinds.length; i++) { if (kinds[i].t > t) break; kd = kinds[i].kind; } return kd; };
    var pressAt = function (t) { for (var i = 0; i < presses.length; i++) if (t >= presses[i][0] && t < presses[i][1]) return true; return false; };
    var toFrame = function (p, t) { var c = camAt(t); return { x: r1((p.x - c.x) * c.z + 960), y: r1((p.y - c.y) * c.z + 540) }; };

    // lấy mẫu mỗi khung + các mốc đổi trạng thái; rồi bỏ khoá thừa (đứng yên ⇒ 2 khoá) — stage nội suy tuyến tính giữa hai khoá
    var N = Math.ceil(o.durationMs / 1000 * fps), ts = [];
    for (var i = 0; i <= N; i++) ts.push(r2(i * 1000 / fps));
    presses.forEach(function (p) { ts.push(r2(p[0]), r2(p[1])); }); kinds.forEach(function (x) { ts.push(r2(x.t)); });
    ts = ts.filter(function (t) { return t >= 0 && t <= o.durationMs; }).sort(function (a, b) { return a - b; }).filter(function (t, i, a) { return i === 0 || t !== a[i - 1]; });
    var raw = ts.map(function (t) { var f = toFrame(posAt(t), t); return { t: t, x: f.x, y: f.y, kind: kindAt(t), press: pressAt(t) }; });
    var keys = raw.filter(function (q, i) {
      if (i === 0 || i === raw.length - 1) return true;
      var a = raw[i - 1], b = raw[i + 1], same = function (u, v) { return u.x === v.x && u.y === v.y && u.kind === v.kind && u.press === v.press; };
      return !(same(a, q) && same(q, b));
    });
    return {
      cursor: {
        keys: keys,
        clicks: clicks.map(function (c) { var f = toFrame(c.p, c.t); return { t: r2(c.t), x: f.x, y: f.y }; }),
        typing: typing,
        moves: moves.map(function (m) { return { t0: r2(m.t0), t1: r2(m.t0 + m.T + m.settle) }; })
      },
      steps: out, drags: drags.map(function (d) { return { beat: d.beat, t0: r2(d.t0), t1: r2(d.t1), label: d.label, w: d.w, h: d.h }; })
    };
  };

  // nội suy rãnh đã biên dịch (dùng chung sân khấu + G-CURSOR): keys đã sắp theo t
  C.sampleKeys = function (keys, t) {
    var n = keys.length; if (!n) return null;
    if (t <= keys[0].t) return keys[0];
    if (t >= keys[n - 1].t) return keys[n - 1];
    var lo = 0, hi = n - 1; while (hi - lo > 1) { var m = (lo + hi) >> 1; if (keys[m].t <= t) lo = m; else hi = m; }
    var a = keys[lo], b = keys[hi], p = (t - a.t) / (b.t - a.t);
    return { t: t, x: a.x + (b.x - a.x) * p, y: a.y + (b.y - a.y) * p, kind: a.kind, press: a.press };
  };

  if (typeof module === 'object' && module.exports) module.exports = C; else root.GSCursorPath = C;
})(typeof self !== 'undefined' ? self : this);
