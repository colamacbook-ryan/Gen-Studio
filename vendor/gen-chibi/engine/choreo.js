/* gen-chibi engine — choreo 0.1: BIÊN ĐẠO liên hoàn cho một nhân vật
 * © 2026 Gen Labs — All rights reserved.
 *
 * Động tác (motion) là một vòng k() lặp mãi — đủ cho "đứng nói chuyện", không đủ cho một chuỗi hành động.
 * Biên đạo là một DÒNG THỜI GIAN tư thế then chốt (pose-to-pose như hoạt hình 2D):
 *   tư thế then chốt + nhịp (ease) → nội suy → lò xo cho phần lắc theo (đầu, vạt áo, cẳng tay, binh khí: overlap / follow-through)
 *   + dịch chuyển gốc trong thế giới (đi, chạy, lướt, nhảy) + nét mặt / góc nhìn đổi theo nhịp
 *   + máy quay (zoom, bám, dẫn khung, nghiêng, rung, thị sai) + thời gian (slow-mo, tua nhanh, hit-stop)
 *   + hiệu ứng (vệt chém, va chạm, bụi, vòng sóng, bóng mờ, vạch tốc độ, chữ tượng thanh) + âm thanh theo nhịp.
 * Lõi (pose, clip, build, finalAt, frameSVG) thuần dữ liệu — chạy trong Node để test đo độ mượt; player() mới cần DOM.
 * Ngân sách (L-42): 1 diễn viên khung xương 60 fps + ≤ 24 hiệu ứng sống; tab ẩn thì requestAnimationFrame tự dừng.
 *
 * Quy ước tư thế (giá trị tuyệt đối trên tư thế trung tính, độ / đơn vị khung 200×240):
 *   góc nghiêng (q45 / q90 / q135): viết theo bản chuẩn QUAY MẶT SANG TRÁI màn hình — phía trước là −x, tay gần là R;
 *     quay phải = lật gương (engine tự đảo cả gốc). Chính diện: viết đúng như nhìn trên màn hình.
 *   wR / wL: góc binh khí trong THẾ GIỚI (0 = dựng đứng, + = theo chiều kim đồng hồ) — engine tự giải ra góc bàn tay.
 */
(function (GC) {
  'use strict';
  // NGÔN NGỮ (ADR 0007): câu engine sinh vẫn TIẾNG VIỆT (msgid). N_(msgid, vars): đánh dấu msgid (tools/i18n-scan.mjs) + điền {biến} — KHÔNG dịch;
  // Studio / server dịch ở chỗ hiển thị (t(msgid, vars) hoặc khớp ngược mẫu — engine/i18n-msg.js)
  function N_(id, vars) { return !vars ? id : id.replace(/\{([A-Za-z0-9_]+)\}/g, function (m, k) { return Object.prototype.hasOwnProperty.call(vars, k) ? String(vars[k]) : m; }); }
  var J = GC.JOINT_IDS, CH = GC.CHANNELS, NJ = J.length, NC = CH.length, N = NJ * NC + 2;
  var IDX = {};
  J.forEach(function (j, a) { CH.forEach(function (c, b) { IDX[j + '.' + c] = a * NC + b; }); });
  IDX.wL = NJ * NC; IDX.wR = NJ * NC + 1;
  var HZ = 120, DT = 1 / HZ;
  var SW = 640, SH = 360;                   // khung hình (đơn vị cảnh)

  /* ------------------------------------------------------------ 1. NHỊP */
  var EASE = {
    lin: function (u) { return u; },
    io: function (u) { return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2; },
    sine: function (u) { return -(Math.cos(Math.PI * u) - 1) / 2; },
    out: function (u) { return 1 - Math.pow(1 - u, 3); },
    in: function (u) { return u * u * u; },
    snap: function (u) { return 1 - Math.pow(1 - u, 4); },                                  // ra đòn: rất nhanh rồi chậm lại
    back: function (u) { var c = 1.70158; return 1 + (c + 1) * Math.pow(u - 1, 3) + c * Math.pow(u - 1, 2); },   // vượt quá rồi về
    up: function (u) { return 1 - (1 - u) * (1 - u); },                                     // bay lên (đạn đạo: chậm dần)
    down: function (u) { return u * u; },                                                   // rơi xuống (nhanh dần)
    hold: function (u) { return u < 1 ? 0 : 1; }
  };

  /* ---------------------------------------------- 2. TƯ THẾ + CLIP (thư viện) */
  var POSES = {}, CLIPS = {}, ORDER = [];
  function neutral() { var a = new Float64Array(N); for (var i = 0; i < NJ; i++) { a[i * NC + 3] = 1; a[i * NC + 4] = 1; } return a; }
  // spec: 'tên' | { $: 'tên tư thế nền', khớp: { kênh: số }, wR: số, wL: số }
  function resolve(spec, depth) { return resolveIn(null, spec, depth); }
  // như resolve, nhưng tra trước bảng tư thế cục bộ của một gói CHƯA nạp (chữ ký nội dung gói, kiểm thử)
  function resolveIn(local, spec, depth) {
    var get = function (n) { return local && Object.prototype.hasOwnProperty.call(local, n) ? local[n] : POSES[n]; };
    if ((depth || 0) > 8) throw new Error('choreo: ' + N_('tư thế kế thừa quá sâu'));
    if (typeof spec === 'string') { if (!get(spec)) throw new Error('choreo: ' + N_('không có tư thế {id}', { id: spec })); spec = { $: spec }; }
    var base = spec.$ ? resolveIn(local, get(spec.$) || (function () { throw new Error('choreo: ' + N_('không có tư thế {id}', { id: spec.$ })); })(), (depth || 0) + 1) : neutral();
    var a = new Float64Array(base);
    for (var k in spec) {
      if (k === '$') continue;
      if (k === 'wL' || k === 'wR') { a[IDX[k]] = +spec[k]; continue; }
      var chs = spec[k];
      if (!chs || typeof chs !== 'object') continue;
      for (var c in chs) if (IDX[k + '.' + c] !== undefined && isFinite(chs[c])) a[IDX[k + '.' + c]] = +chs[c];
    }
    return a;
  }
  // đổi chân / tay trái ↔ phải (chu kỳ bước ở góc nghiêng: hai chân cùng mặt phẳng nên chỉ đổi tên, không đảo dấu)
  function swapLR(spec) {
    var o = {};
    for (var k in spec) o[/L$/.test(k) && IDX[k + '.x'] !== undefined ? k.replace(/L$/, 'R') : /R$/.test(k) && IDX[k + '.x'] !== undefined ? k.replace(/R$/, 'L') : k] = spec[k];
    return o;
  }
  // trộn tư thế (khớp nào có ở sau đè kênh của khớp đó) + xoay cả người quanh một điểm trên thân — dùng khi VIẾT tư thế / gói động tác
  function mix() { var o = {}; for (var i = 0; i < arguments.length; i++) { var a = arguments[i]; for (var k in a) o[k] = typeof a[k] === 'object' && !Array.isArray(a[k]) ? Object.assign({}, o[k], a[k]) : a[k]; } return o; }
  // xoay cả người quanh một điểm trên thân (lộn, ngã) thay vì quanh bàn chân: trả về { root: { rot, x, y } }
  // extra.ground: đặt điểm thấp nhất (đỉnh đầu / mông / chân) chạm đất rồi cộng thêm extra.y (âm = bay lên)
  function about(deg, cx, cy, extra) {
    extra = extra || {};
    var r = deg * Math.PI / 180, cs = Math.cos(r), sn = Math.sin(r), dx = cx - 100, dy = cy - 228;
    var o = { root: { rot: deg, x: dx - (dx * cs - dy * sn) + (extra.x || 0), y: dy - (dx * sn + dy * cs) + (extra.y || 0) } };
    if (extra.ground) {
      var rotY = function (px, py) { return cy + (px - cx) * sn + (py - cy) * cs; };   // y sau khi xoay quanh (cx, cy)
      o.root.y += 228 - Math.max(rotY(100, 96) + 52, rotY(100, 228), rotY(100, 205) + 12);
    }
    return o;
  }
  function pose(id, spec) { POSES[id] = spec; return spec; }
  function clip(id, def) { def.id = id; CLIPS[id] = def; if (ORDER.indexOf(id) < 0) ORDER.push(id); return def; }

  /* ------------------------------------- 2b. GÓI ĐỘNG TÁC (dữ liệu, v0.16) */
  // Loại asset thứ tư: tư thế + clip + hành động (+ màn diễn) dạng JSON thuần, đi qua cổng như linh kiện / cảnh.
  // Không có hàm (make), không có HTML; mọi số kẹp khoảng, mọi tên tra trong từ vựng. Khi nạp, tư thế / clip của gói mang tiền tố
  // "<id gói>:" nên không đè được khung; id HÀNH ĐỘNG là chung toàn hệ (kịch bản gọi bằng tên) → trùng với khung / gói khác thì chặn.
  var FRAME_PACK = 'gen.dong-tac';
  var MOTION = {
    format: 'gen-chibi.motion/1',
    views: ['front', 'back', 'q45', 'q90', 'q135'],
    points: ['tip', 'butt', 'hand', 'handL', 'head', 'chest', 'feet', 'foot'],
    fx: ['impact', 'spark', 'glint', 'dust', 'ring', 'debris', 'smear', 'text', 'projectile'],
    sfx: ['pop', 'whoosh', 'step', 'sting', 'hit', 'boing', 'sparkle', 'rumble', 'drip', 'sad', 'snore', 'party', 'hmm', 'gong', 'chime', 'swish', 'tick'],   // 17 tên cũ — luôn hợp lệ; sự kiện nhận mọi âm của GC.sounds (soundOk trong checkPack)
    music: ['calm', 'tense', 'epic', 'comic', 'sad'],
    grades: ['none', 'cool', 'warm', 'dark', 'gold'],
    arts: ['rock', 'tomato'],
    needs: { weapon: 'cầm binh khí ở tay phải (bộ phận heldR)' },
    hide: ['heldR', 'heldL', 'tallR', 'tallL'],
    budget: { poses: 64, clips: 48, actions: 32, shows: 4, keys: 64, events: 48, travel: 32, cam: 16, speed: 16, faces: 16, clipDur: 12, actionDur: 6, actionClips: 6, showSteps: 60, bytes: 300000 }
  };
  var PACKS = {}, PACK_ORDER = [];
  var ID_RE = /^[a-z][A-Za-z0-9]{1,31}$/, PACK_RE = /^[a-z0-9][a-z0-9-]{1,39}$/, HEXC = /^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/;
  var hasOwn = function (o, k) { return o != null && Object.prototype.hasOwnProperty.call(o, k); };
  function plainText(s, n) { return String(s == null ? '' : s).replace(/[<>&"`]/g, '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n); }
  // kiểm một gói (dữ liệu người dùng / agent / gói nhập) → { errors, def } — def là bản CHUẨN HOÁ dựng lại từ đầu (không giữ khoá lạ)
  // opts.tolerant (lúc NẠP gói đã lưu — khởi động, mở Studio): âm của sự kiện không còn trong thư viện âm thì bỏ riêng sfx đó + ghi chú (notes), KHÔNG loại cả gói —
  // gói âm đổi sau khi gói động tác được lưu không được làm màn đấu biến mất (CNS-102); lúc LƯU (mặc định) vẫn là lỗi
  function checkPack(def, opts) {
    var errs = [], d = {}, B = MOTION.budget, E = function (m) { if (errs.length < 30) errs.push(m); }, tolerant = !!(opts && opts.tolerant), notes = [];
    if (!def || typeof def !== 'object' || Array.isArray(def)) return { errors: [N_('gói động tác phải là object')], def: null };
    try { if (JSON.stringify(def).length > B.bytes) return { errors: [N_('gói quá lớn (tối đa {n} KB)', { n: B.bytes / 1000 })], def: null }; }
    catch (x) { return { errors: [N_('gói không phải JSON thuần')], def: null }; }
    if (!PACK_RE.test(String(def.id || ''))) E('id: ' + N_('chữ thường, số, gạch nối, 2–40 ký tự'));
    d.id = String(def.id || ''); d.name = plainText(def.name || def.id, 40); d.description = plainText(def.description, 300);
    var num = function (v, lo, hi, path, dflt) {
      if (v === undefined && dflt !== undefined) return dflt;
      if (typeof v !== 'number' || !isFinite(v) || v < lo || v > hi) { E(path + ': ' + N_('cần số trong khoảng {min}…{max}', { min: lo, max: hi })); return lo; }
      return v;
    };
    var oneOf = function (v, list, path) { if (list.indexOf(v) < 0) { E(path + ': ' + N_('chọn {ids}', { ids: list.join(', ') })); return list[0]; } return v; };
    var obj = function (v, path) { if (!v || typeof v !== 'object' || Array.isArray(v)) { E(path + ': ' + N_('cần object')); return null; } return v; };
    var arr = function (v, max, path) { if (v === undefined) return []; if (!Array.isArray(v)) { E(path + ': ' + N_('cần mảng')); return []; } if (v.length > max) E(path + ': ' + N_('tối đa {n} phần tử', { n: max })); return v.slice(0, max); };
    var ids = function (o, max, path) {
      if (o === undefined) return [];
      if (!obj(o, path)) return [];
      var ks = Object.keys(o);
      if (ks.length > max) E(path + ': ' + N_('tối đa {n}', { n: max }));
      return ks.slice(0, max).filter(function (k) {
        if (!ID_RE.test(k)) { E(path + '.' + k.slice(0, 32) + ': ' + N_('id camelCase 2–32 ký tự (vd. "spinSlash")')); return false; }
        if (k in Object.prototype) { E(path + '.' + k + ': ' + N_('tên dành riêng của JavaScript — đổi tên')); return false; }   // toString, constructor… đè phép tra cứu
        return true;
      });
    };
    var POS = { x: [-400, 400], y: [-400, 400], rot: [-2160, 2160], sx: [0.1, 3], sy: [0.1, 3] };
    var localPoses = def.poses && typeof def.poses === 'object' ? def.poses : {};
    var poseRef = function (name, path) {
      if (typeof name !== 'string' || !(hasOwn(localPoses, name) || hasOwn(POSES, name)) || name.indexOf(':') >= 0) { E(path + ': ' + N_('không có tư thế "{ref}" (tư thế của gói hoặc của khung)', { ref: String(name).slice(0, 32) })); return null; }
      return name;
    };
    var pose = function (p, path) {
      if (typeof p === 'string') return poseRef(p, path);
      if (!obj(p, path)) return null;
      var o = {};
      Object.keys(p).forEach(function (k) {
        if (k === '$') { o.$ = poseRef(p.$, path + '.$'); return; }
        if (k === 'wR' || k === 'wL') { o[k] = num(p[k], -2160, 2160, path + '.' + k); return; }
        if (J.indexOf(k) < 0 || k === 'stage') { E(path + '.' + k.slice(0, 32) + ': ' + N_('khớp lạ ({ids})', { ids: J.filter(function (j) { return j !== 'stage'; }).join(', ') + ', wR, wL' })); return; }
        var ch = obj(p[k], path + '.' + k); if (!ch) return;
        o[k] = {};
        Object.keys(ch).forEach(function (c) {
          if (!hasOwn(POS, c)) { E(path + '.' + k + '.' + c.slice(0, 16) + ': ' + N_('kênh lạ (x, y, rot, sx, sy)')); return; }
          o[k][c] = num(ch[c], POS[c][0], POS[c][1], path + '.' + k + '.' + c);
        });
      });
      return o;
    };
    var L = GC.LIB || {};
    var face = function (f, path) {
      if (!obj(f, path)) return {};
      var o = {};
      Object.keys(f).forEach(function (k) {
        var v = f[k];
        if (k === 'eyes' && hasOwn(L.eyePoses, v)) o.eyes = v;
        else if (k === 'brows' && hasOwn(L.browPoses, v)) o.brows = v;
        else if (k === 'mouth' && hasOwn(L.mouths, v)) o.mouth = v;
        else if (k === 'fx' && Array.isArray(v) && v.length <= 3 && v.every(function (x) { return hasOwn(L.fx, x); })) o.fx = v.slice();
        else E(path + '.' + String(k).slice(0, 16) + ': ' + N_('giá trị nét mặt lạ (xem get_catalog: eyePoses, browPoses, mouths, fx)'));
      });
      return o;
    };
    var ease = function (v, path) { return v === undefined ? undefined : oneOf(v, Object.keys(EASE), path); };
    var hideList = function (v, path) { if (!Array.isArray(v) || v.length > 4 || v.some(function (x) { return MOTION.hide.indexOf(x) < 0; })) { E(path + ': ' + N_('mảng trong {ids}', { ids: MOTION.hide.join(', ') })); return []; } return v.slice(); };
    var times = function (list, path, tmax) {   // [[t, …]] — t tăng dần, trong 0…tmax; trả lại chỉ các phần tử đúng dạng (lỗi đã ghi)
      var prev = -1;
      return list.filter(function (q, i) {
        if (!Array.isArray(q) || typeof q[0] !== 'number') { E(path + '[' + i + ']: ' + N_('cần [giây, …]')); return false; }
        num(q[0], 0, tmax, path + '[' + i + '][0]');
        if (q[0] < prev) E(path + '[' + i + ']: ' + N_('thời điểm phải tăng dần')); prev = q[0];
        return true;
      });
    };
    // âm của sự kiện: tên trong thư viện âm (GC.sounds) nhìn thấy từ dự án của gói — 17 tên cũ (MOTION.sfx) vẫn hợp lệ; chưa nạp sounds.js thì chỉ 17 tên cũ.
    // Gói âm của dự án phải nạp TRƯỚC gói động tác tham chiếu nó (Studio / server / gói dự án đều nạp theo thứ tự đó).
    var evProject = typeof def.project === 'string' && def.project ? def.project : '', visSnd = null;
    var soundOk = function (x) {
      if (typeof x !== 'string') return false;
      if (!GC.sounds) return MOTION.sfx.indexOf(x) >= 0;
      return (visSnd = visSnd || GC.sounds.names({ project: evProject })).indexOf(x) >= 0;
    };
    var EVN = { gain: [0, 1.5], dx: [-300, 300], dy: [-300, 300], size: [0.1, 4], hitstop: [0, 0.4], shake: [0, 30], flash: [0, 1], push: [-1, 1],
      lines: [0, 3], ghosts: [0, 3], smear: [0, 0.6], rot: [-45, 45], flight: [0.1, 2], hold: [0, 8], letterbox: [0, 1] };
    var event = function (e, path) {
      if (!obj(e, path)) return {};
      var o = {};
      Object.keys(e).forEach(function (k) {
        var v = e[k], p = path + '.' + String(k).slice(0, 16);
        if (hasOwn(EVN, k)) o[k] = num(v, EVN[k][0], EVN[k][1], p);
        else if (k === 'sfx') {
          var s = Array.isArray(v) ? v : [v], bad = s.filter(function (x) { return !soundOk(x); });
          if (!s.length || s.length > 3) E(p + ': ' + N_('chọn 1–3 tên âm trong thư viện âm (get_sound_spec · list_sounds)'));
          else if (bad.length) {
            var refs = bad.slice(0, 3).map(function (x) { return '"' + String(x).slice(0, 32) + '"'; }).join(', ');
            var why = p + ': ' + (evProject ? N_('âm {refs} không có trong thư viện âm của dự án "{project}" (list_sounds)', { refs: refs, project: evProject }) : N_('âm {refs} không có trong thư viện âm của gói dùng chung (list_sounds)', { refs: refs }));
            if (!tolerant) E(why);
            else { notes.push(N_('{msg} — đã bỏ khỏi sự kiện', { msg: why })); var good = s.filter(soundOk); if (good.length) o.sfx = Array.isArray(v) ? good : good[0]; }
          } else o.sfx = Array.isArray(v) ? s.slice() : v;
        }
        else if (k === 'at') o.at = oneOf(v, MOTION.points, p);
        else if (k === 'fx') o.fx = oneOf(v, MOTION.fx, p);
        else if (k === 'from') { if (typeof v === 'number') o.from = num(v, -600, 600, p); else o.from = oneOf(v, MOTION.points, p); }
        else if (k === 'hit' || k === 'release') { if (typeof v !== 'boolean') E(p + ': true / false'); else o[k] = v; }
        else if (k === 'text') o.text = plainText(v, 16);
        else if (k === 'title') o.title = plainText(v, 60);
        else if (k === 'sub') o.sub = plainText(v, 80);
        else if (k === 'color' || k === 'flashColor') { if (!HEXC.test(String(v))) E(p + ': ' + N_('mã hex')); else o[k] = String(v); }
        else if (k === 'style') o.style = oneOf(v, ['h', 'r'], p);
        else if (k === 'grade') o.grade = oneOf(v, MOTION.grades, p);
        else if (k === 'art') o.art = oneOf(v, MOTION.arts, p);
        else if (k === 'music') { if (v === null) o.music = null; else o.music = oneOf(v, MOTION.music, p); }
        else if (k === 'ambient') {
          var am = obj(v, p), S = GC.SCENE || { times: {}, weathers: {} };
          if (am) { o.ambient = {}; if (am.time !== undefined) { if (hasOwn(S.times, am.time)) o.ambient.time = am.time; else E(p + '.time: ' + N_('giờ lạ')); } if (am.weather !== undefined) { if (hasOwn(S.weathers, am.weather)) o.ambient.weather = am.weather; else E(p + '.weather: ' + N_('thời tiết lạ')); } }
        }
        else E(p + ': ' + N_('khoá sự kiện lạ'));
      });
      return o;
    };
    var CAMK = { z: [0.6, 4], fy: [0, 1.6], lead: [-300, 300], roll: [-30, 30], lag: [0, 20] };
    var cam = function (c, path) { if (!obj(c, path)) return {}; var o = {}; Object.keys(c).forEach(function (k) { if (hasOwn(CAMK, k)) o[k] = num(c[k], CAMK[k][0], CAMK[k][1], path + '.' + k); else E(path + '.' + String(k).slice(0, 16) + ': ' + N_('khoá máy quay lạ (z, fy, lead, roll, lag)')); }); return o; };
    // ---- tư thế
    d.poses = {};
    ids(def.poses, B.poses, 'poses').forEach(function (k) { d.poses[k] = pose(def.poses[k], 'poses.' + k) || {}; if (typeof d.poses[k] === 'string') d.poses[k] = { $: d.poses[k] }; });
    Object.keys(d.poses).forEach(function (k) {   // kế thừa vòng tròn trong gói (a → b → a) làm treo lúc dựng → chặn ở cổng
      var seen = {}, n = k;
      while (n && hasOwn(d.poses, n)) { if (seen[n]) { E('poses.' + k + ': ' + N_('kế thừa "$" vòng tròn')); break; } seen[n] = 1; n = d.poses[n].$; }
    });
    // ---- clip
    d.clips = {};
    var localClips = def.clips && typeof def.clips === 'object' ? def.clips : {};
    ids(def.clips, B.clips, 'clips').forEach(function (k) {
      var c = obj(def.clips[k], 'clips.' + k), P = 'clips.' + k, o = {};
      if (!c) return;
      Object.keys(c).forEach(function (f) {
        if (['label', 'view', 'face', 'hide', 'keys', 'travel', 'speed', 'faces', 'events', 'cam', 'dur'].indexOf(f) < 0) E(P + '.' + String(f).slice(0, 16) + ': ' + N_('trường lạ (make / hàm không được phép trong gói dữ liệu)'));
      });
      o.label = plainText(c.label || k, 40);
      if (c.view !== undefined) o.view = oneOf(c.view, MOTION.views, P + '.view');
      if (c.face !== undefined) o.face = face(c.face, P + '.face');
      if (c.hide !== undefined) o.hide = hideList(c.hide, P + '.hide');
      var tmax = B.clipDur;
      var keys = arr(c.keys, B.keys, P + '.keys');
      if (!keys.length) E(P + '.keys: ' + N_('cần ít nhất 1 tư thế then chốt'));
      keys = times(keys, P + '.keys', tmax);
      o.keys = keys.map(function (q, i) {
        var kp = P + '.keys[' + i + ']', r = [q[0], pose(q[1], kp + '[1]')];
        if (q[2] !== undefined) r.push(ease(q[2], kp + '[2]'));
        if (q[3] !== undefined) {
          var x = obj(q[3], kp + '[3]'), xo = {};
          if (x) Object.keys(x).forEach(function (f) {
            var v = x[f];
            if (f === 'ez') { var ez = obj(v, kp + '.ez'); if (ez) { xo.ez = {}; Object.keys(ez).forEach(function (ch) { if (!hasOwn(IDX, ch)) E(kp + '.ez.' + ch.slice(0, 24) + ': ' + N_('kênh lạ (vd. "root.y")')); else xo.ez[ch] = ease(ez[ch], kp + '.ez.' + ch); }); } }
            else if (f === 'spin') xo.spin = !!v;
            else if (f === 'dir') { if (v !== 1 && v !== -1) E(kp + '.dir: ' + N_('1 hoặc -1')); else xo.dir = v; }
            else if (f === 'view') xo.view = oneOf(v, MOTION.views, kp + '.view');
            else if (f === 'face') xo.face = face(v, kp + '.face');
            else if (f === 'hide') xo.hide = hideList(v, kp + '.hide');
            else E(kp + '.' + String(f).slice(0, 16) + ': ' + N_('khoá lạ (ez, spin, dir, view, face, hide)'));
          });
          if (r.length === 2) r.push('io');
          r.push(xo);
        }
        return r;
      });
      if (c.travel !== undefined) { var tr = times(arr(c.travel, B.travel, P + '.travel'), P + '.travel', tmax); o.travel = tr.map(function (q, i) { var r = [q[0], num(q[1], -900, 900, P + '.travel[' + i + '][1]')]; if (q[2] !== undefined) r.push(ease(q[2], P + '.travel[' + i + '][2]')); return r; }); }
      if (c.speed !== undefined) { var sp = times(arr(c.speed, B.speed, P + '.speed'), P + '.speed', tmax); o.speed = sp.map(function (q, i) { return [q[0], num(q[1], 0.05, 4, P + '.speed[' + i + '][1]')]; }); }
      if (c.faces !== undefined) { var fs = times(arr(c.faces, B.faces, P + '.faces'), P + '.faces', tmax); o.faces = fs.map(function (q, i) { return [q[0], face(q[1], P + '.faces[' + i + ']')]; }); }
      if (c.events !== undefined) { var ev = times(arr(c.events, B.events, P + '.events'), P + '.events', tmax); o.events = ev.map(function (q, i) { return [q[0], event(q[1], P + '.events[' + i + ']')]; }); }
      if (c.cam !== undefined) { var cm = times(arr(c.cam, B.cam, P + '.cam'), P + '.cam', tmax); o.cam = cm.map(function (q, i) { var r = [q[0], cam(q[1], P + '.cam[' + i + ']')]; if (q[2] !== undefined) r.push(ease(q[2], P + '.cam[' + i + '][2]')); return r; }); }
      if (c.dur !== undefined) o.dur = num(c.dur, 0.05, tmax, P + '.dur');
      // tổng trong một clip (CNS-043): khựng hình ≤ 1,2 s · ≤ 4 sự kiện bóng mờ / vạch tốc độ / vệt chém (mỗi cái nhân chi phí vẽ mọi khung) · ≤ 2 thẻ tiêu đề
      var EV = (o.events || []).map(function (q) { return q[1] || {}; });
      if (EV.reduce(function (n, e) { return n + (e.hitstop || 0); }, 0) > 1.2) E(P + '.events: ' + N_('tổng hitstop tối đa 1,2 s'));
      if (EV.filter(function (e) { return e.ghosts || e.lines || e.smear || e.fx === 'smear'; }).length > 4) E(P + '.events: ' + N_('tối đa 4 sự kiện ghosts / lines / smear'));
      if (EV.filter(function (e) { return e.title; }).length > 2) E(P + '.events: ' + N_('tối đa 2 thẻ tiêu đề'));
      d.clips[k] = o;
    });
    var clipLen = function (c) {
      var t = c && typeof c.dur === 'number' ? c.dur : 0;
      if (c) ['keys', 'travel', 'speed', 'faces', 'events', 'cam'].forEach(function (f) { (Array.isArray(c[f]) ? c[f] : []).forEach(function (q) { if (Array.isArray(q) && typeof q[0] === 'number' && isFinite(q[0])) t = Math.max(t, q[0]); }); });
      return t;
    };
    var clipRef = function (id, path) {
      if (typeof id === 'string' && hasOwn(localClips, id)) return id;
      if (typeof id === 'string' && id.indexOf(':') < 0 && hasOwn(CLIPS, id) && !CLIPS[id].make) return id;
      E(path + ': ' + N_('không có clip "{ref}" (clip của gói hoặc của khung; hold / stepIn chỉ dùng trong màn diễn)', { ref: String(id).slice(0, 32) })); return null;
    };
    // ---- hành động
    d.actions = {};
    ids(def.actions, B.actions, 'actions').forEach(function (k) {
      var a = obj(def.actions[k], 'actions.' + k), P = 'actions.' + k, o = {};
      if (!a) return;
      Object.keys(a).forEach(function (f) { if (['label', 'clips', 'attack', 'needs', 'shock', 'ranged', 'art', 'hint', 'aim'].indexOf(f) < 0) E(P + '.' + String(f).slice(0, 16) + ': ' + N_('trường lạ')); });
      o.label = plainText(a.label || k, 40);
      if (a.hint !== undefined) o.hint = plainText(a.hint, 120);
      var cl = arr(a.clips, B.actionClips, P + '.clips');
      if (!cl.length) E(P + '.clips: ' + N_('cần 1–{n} clip', { n: B.actionClips }));
      o.clips = cl.map(function (c, i) { return clipRef(c, P + '.clips[' + i + ']'); });
      // trần tĩnh TRƯỚC khi dựng (review: gói 28 KB, 32 đòn × 6 clip × 12 s chặn server 47 s) — đòn dài nhất của khung / bộ mẫu ~1,7 s
      var dur = o.clips.reduce(function (n, c) { return n + (c ? clipLen(d.clips[c] || (hasOwn(localClips, c) ? null : CLIPS[c])) : 0); }, 0);
      if (dur > B.actionDur) E(P + '.clips: ' + N_('tổng thời lượng {dur} s — một hành động tối đa {max} s (chuỗi dài hơn: dùng shows)', { dur: dur.toFixed(2), max: B.actionDur }));
      if (a.attack !== undefined) o.attack = a.attack === true;
      if (a.needs !== undefined) { if (!hasOwn(MOTION.needs, a.needs)) E(P + '.needs: ' + N_('chọn {ids}', { ids: Object.keys(MOTION.needs).join(', ') })); else o.needs = a.needs; }
      if (a.shock !== undefined) o.shock = num(a.shock, 0, 200, P + '.shock');
      if (a.ranged !== undefined) o.ranged = a.ranged === true;
      if (a.art !== undefined) o.art = oneOf(a.art, MOTION.arts, P + '.art');
      if (a.aim !== undefined) o.aim = oneOf(a.aim, ['body', 'head'], P + '.aim');
      if (o.ranged && !o.attack) E(P + ': ' + N_('ranged chỉ dùng cho đòn đánh (attack: true)'));
      // đòn đánh phải có điểm va chạm (sự kiện hit / hitstop) — đòn ném: phải có sự kiện release (lúc buông tay)
      if (o.attack) {
        var evs = []; o.clips.forEach(function (c) { var cc = c && (d.clips[c] || (CLIPS[c] && !hasOwn(localClips, c) ? CLIPS[c] : null)); if (cc) (cc.events || []).forEach(function (e) { evs.push(e[1] || {}); }); });
        if (o.ranged ? !evs.some(function (e) { return e.release; }) : !evs.some(function (e) { return e.hit || e.hitstop > 0; })) E(P + ': ' + (o.ranged ? N_('đòn ném cần một sự kiện { release: true } lúc buông tay') : N_('đòn đánh cần ít nhất một sự kiện va chạm { hit: true } hoặc { hitstop }')));
      }
      d.actions[k] = o;
    });
    // ---- màn diễn (show): một diễn viên diễn liền nhiều clip
    d.shows = {};
    ids(def.shows, B.shows, 'shows').forEach(function (k) {
      var s = obj(def.shows[k], 'shows.' + k), P = 'shows.' + k, o = {};
      if (!s) return;
      Object.keys(s).forEach(function (f) { if (['title', 'character', 'scene', 'scale', 'ground', 'world', 'x0', 'dir', 'steps', 'weapon'].indexOf(f) < 0) E(P + '.' + String(f).slice(0, 16) + ': ' + N_('trường lạ')); });
      o.title = plainText(s.title || k, 60);
      if (s.character !== undefined) { if (typeof s.character !== 'string' || s.character.length > 80) E(P + '.character: ' + N_('key nhân vật')); else o.character = s.character; }
      if (s.scene !== undefined) { if (typeof s.scene !== 'string' || s.scene.length > 80) E(P + '.scene: ' + N_('key cảnh')); else o.scene = s.scene; }
      o.scale = num(s.scale, 0.3, 1.2, P + '.scale', 0.62); o.ground = num(s.ground, 200, 360, P + '.ground', 330);
      o.world = num(s.world, 640, 2560, P + '.world', 640); o.x0 = num(s.x0, -200, 2560, P + '.x0', 120);
      o.dir = s.dir === -1 ? -1 : 1;
      if (s.weapon !== undefined) { var w = obj(s.weapon, P + '.weapon'), wr = w && obj(w.R, P + '.weapon.R'); if (wr) o.weapon = { R: { angle: num(wr.angle, -180, 180, P + '.weapon.R.angle', 0), tip: num(wr.tip, 0, 400, P + '.weapon.R.tip', 24), butt: num(wr.butt, 0, 200, P + '.weapon.R.butt', 0) } }; }
      var st = arr(s.steps, B.showSteps, P + '.steps');
      if (!st.length) E(P + '.steps: ' + N_('cần ít nhất 1 bước'));
      o.steps = st.map(function (x, i) {
        var q = P + '.steps[' + i + ']', r = {};
        if (!obj(x, q)) return { clip: 'hold' };
        Object.keys(x).forEach(function (f) { if (['clip', 'tempo', 'dir', 'view', 'face', 'dur', 'pose', 'dist', 'label'].indexOf(f) < 0) E(q + '.' + String(f).slice(0, 16) + ': ' + N_('trường lạ')); });
        if (x.clip === 'hold' || x.clip === 'stepIn') r.clip = x.clip; else r.clip = clipRef(x.clip, q + '.clip');
        if (x.tempo !== undefined) r.tempo = num(x.tempo, 0.3, 3, q + '.tempo');
        if (x.dir !== undefined) { if (x.dir !== 1 && x.dir !== -1) E(q + '.dir: ' + N_('1 hoặc -1')); else r.dir = x.dir; }
        if (x.view !== undefined) r.view = oneOf(x.view, MOTION.views, q + '.view');
        if (x.face !== undefined) r.face = face(x.face, q + '.face');
        if (x.dur !== undefined) r.dur = num(x.dur, 0.1, 8, q + '.dur');
        if (x.pose !== undefined) r.pose = poseRef(x.pose, q + '.pose');
        if (x.dist !== undefined) r.dist = num(x.dist, -600, 600, q + '.dist');
        if (x.label !== undefined) r.label = plainText(x.label, 40);
        return r;
      });
      d.shows[k] = o;
    });
    // tổng thời lượng clip của màn diễn (giới hạn vòng dựng / bộ nhớ khung hình): ≤ 90 giây
    Object.keys(d.shows).forEach(function (k) {
      var tot = 0; d.shows[k].steps.forEach(function (x) { var c = x.clip && (d.clips[x.clip] || CLIPS[x.clip]); if (!c) return; var dd = c.dur != null ? c.dur : c.keys && c.keys.length ? c.keys[c.keys.length - 1][0] : (x.dur || 1); tot += dd / (x.tempo || 1); });
      if (tot > 90) E('shows.' + k + ': ' + N_('dài quá 90 giây'));
    });
    if (def.project != null && def.project !== '' && !/^[a-z0-9][a-z0-9-]{0,39}$/.test(String(def.project))) E('project: ' + N_('slug dự án'));
    d.project = def.project ? String(def.project) : '';
    d.status = def.status === 'published' ? 'published' : 'draft';
    d.kind = 'motion'; d.format = MOTION.format;
    return { errors: errs, def: errs.length ? null : d, notes: notes };
  }
  // CNS-065 (v0.23): id hành động của BỘ KHUNG cũng theo luật registerPack áp cho gói — không trùng tên hoạt động (activity) / trạng thái (state)
  // của kịch bản. 5 đòn khung đổi tên (thrust · rage · victory · salute · wave); id cũ còn là BÍ DANH: thuộc tính ẩn của ACTIONS (tra được, hasOwn
  // đúng, không liệt kê — danh sách, số đếm, guide chỉ thấy id mới), nên tác phẩm / đề xuất / agent cũ diễn y hệt. Tác phẩm lưu với id cũ được
  // chuyển sang id mới khi đọc / ghi (migrateWork — server/store.js qua MCP). Bí danh không bao giờ là id của gói (registerPack chặn trùng activity / state).
  var ALIASES = {};
  function defineAlias(map, old, id) { Object.defineProperty(map, old, { get: function () { return map[id]; }, enumerable: false, configurable: true }); }
  function aliasAction(old, id) {
    var C = GC.choreo;
    if (!hasOwn(C.ACTIONS, id) || hasOwn(ALIASES, old)) return false;
    ALIASES[old] = id; defineAlias(C.ACTIONS, old, id);
    return true;
  }
  function actionId(id) { return typeof id === 'string' && hasOwn(ALIASES, id) ? ALIASES[id] : id; }
  // tác phẩm (hoặc một phân cảnh) dùng id cũ → id mới, sửa tại chỗ; trả số bước đã đổi
  function migrateWork(w) {
    var n = 0;
    ((w && Array.isArray(w.shots)) ? w.shots : (w && w.event ? [w] : [])).forEach(function (s) {
      ((s && s.event && Array.isArray(s.event.steps)) ? s.event.steps : []).forEach(function (st) { if (st && typeof st.action === 'string' && hasOwn(ALIASES, st.action)) { st.action = ALIASES[st.action]; n++; } });
    });
    return n;
  }
  // gỡ mọi thứ một gói đã nạp (nạp lại bản mới / xoá gói)
  function unregisterPack(key) {
    var P = PACKS[key]; if (!P) return;
    var pre = P.id + ':';
    Object.keys(POSES).forEach(function (k) { if (k.indexOf(pre) === 0) delete POSES[k]; });
    Object.keys(CLIPS).forEach(function (k) { if (k.indexOf(pre) === 0) { delete CLIPS[k]; var i = ORDER.indexOf(k); if (i >= 0) ORDER.splice(i, 1); } });
    var C = GC.choreo;
    Object.keys(C.ACTIONS).forEach(function (k) { if (C.ACTIONS[k].pack === key) delete C.ACTIONS[k]; });
    Object.keys(C.demos).forEach(function (k) { if (C.demos[k].pack === key) delete C.demos[k]; });
    delete PACKS[key]; PACK_ORDER.splice(PACK_ORDER.indexOf(key), 1);
  }
  // nạp gói đã qua cổng vào bộ biên đạo: đặt tiền tố tên, chặn trùng id hành động / màn diễn với khung và gói khác
  function registerPack(packNs, def, opts) {
    var c = checkPack(def, opts);
    if (c.errors.length) return c;
    var d = c.def, key = packNs + '/' + d.id, pre = d.id + ':', C = GC.choreo, errs = [];
    Object.keys(d.actions).forEach(function (k) { var x = hasOwn(C.ACTIONS, k) ? C.ACTIONS[k] : null; if (x && x.pack !== key) errs.push('actions.' + k + ': ' + (x.pack === FRAME_PACK ? N_('trùng id hành động của bộ khung — đổi tên') : N_('trùng id hành động của gói {pack} — đổi tên', { pack: x.pack }))); });
    // id hành động không trùng tên hoạt động / trạng thái của kịch bản (CNS-051): "salute" là activity hay action? — chặn nhập nhằng
    var LB = GC.LIB || {};
    Object.keys(d.actions).forEach(function (k) { if (hasOwn(LB.activities, k) || hasOwn(LB.states, k)) errs.push('actions.' + k + ': ' + (hasOwn(LB.states, k) ? N_('trùng tên trạng thái (state) của kịch bản — đổi tên') : N_('trùng tên hoạt động (activity) của kịch bản — đổi tên'))); });
    Object.keys(d.shows).forEach(function (k) { var x = hasOwn(C.demos, k) ? C.demos[k] : null; if (x && x.pack !== key) errs.push('shows.' + k + ': ' + N_('trùng id màn diễn — đổi tên')); });
    if (errs.length) return { errors: errs, def: null };
    unregisterPack(key);
    var P = function (n) { return n && hasOwn(d.poses, n) ? pre + n : n; };
    var Cl = function (n) { return n && hasOwn(d.clips, n) ? pre + n : n; };
    var fixPose = function (p) { if (typeof p === 'string') return P(p); var o = Object.assign({}, p); if (o.$) o.$ = P(o.$); return o; };
    Object.keys(d.poses).forEach(function (k) { POSES[pre + k] = fixPose(d.poses[k]); });
    Object.keys(d.clips).forEach(function (k) {
      var c0 = d.clips[k], cc = JSON.parse(JSON.stringify(c0));
      cc.keys = c0.keys.map(function (q) { var r = q.slice(); r[1] = fixPose(q[1]); return r; });
      cc.pack = key; clip(pre + k, cc);
    });
    Object.keys(d.actions).forEach(function (k) { C.ACTIONS[k] = Object.assign({}, d.actions[k], { clips: d.actions[k].clips.map(Cl), pack: key }); });
    Object.keys(d.shows).forEach(function (k) { var s = JSON.parse(JSON.stringify(d.shows[k])); s.steps.forEach(function (x) { x.clip = Cl(x.clip); if (x.pose) x.pose = P(x.pose); }); s.pack = key; C.demos[k] = s; });
    d.pack = packNs; d.key = key; d.version = Math.max(1, Math.floor(+def.version) || 1);
    PACKS[key] = d; PACK_ORDER.push(key);
    return { errors: [], def: d, notes: c.notes || [] };
  }
  // cầm binh khí ở tay phải? (đòn needs: 'weapon')
  // có binh khí? (đòn needs: 'weapon') — tay phải cầm TRANG BỊ loại "Vũ khí", hoặc linh kiện khai grip: 'weapon' (CNS-044).
  // Không đoán theo độ dài: quạt lông dài 95 vẫn là đạo cụ; khối "que" của khung chỉ là dáng, chưa phải binh khí
  function hasWeapon(asset) {
    if (!asset) return false;
    var eq = asset.look && asset.look.equip, it = eq && eq.heldR && GC.getItem ? GC.getItem(eq.heldR, asset.pack) : null;
    if (it) return it.type === 'weapon';
    var ref = GC.partRef ? GC.partRef(asset, 'heldR') : null;
    if (!ref || /(^|\/)none$/.test(ref)) return false;
    var p = GC.getPart('heldR', ref, asset.pack);
    if (!p) return false;
    if (p.grip) return p.grip === 'weapon';
    // dữ liệu trước v0.16 chưa khai grip (CNS-062): vật cầm tay DÀI tự vẽ (tall) coi là binh khí — phim cũ không mất màn đấu.
    // Linh kiện của khung (gen.*) không áp luật này: khối "que" chỉ là dáng
    return !!(p.tall && !/^gen\./.test(p.pack || ''));
  }
  function canDo(asset, act) { var a = typeof act === 'string' ? (GC.choreo.ACTIONS || {})[act] : act; return !!a && (!a.needs || (a.needs === 'weapon' && hasWeapon(asset))); }
  function actionsFor(asset) { var A = GC.choreo.ACTIONS || {}; return Object.keys(A).filter(function (k) { return canDo(asset, A[k]); }); }

  /* --------------------------------------------------------- 3. LÒ XO */
  // kênh lắc theo: [kênh, ω (rad/s), ζ] — ω nhỏ, ζ nhỏ = trễ nhiều, nảy nhiều (vạt áo); đầu / cẳng tay / binh khí trễ vừa
  var SPRINGS = [['head.rot', 19, 0.42], ['head.y', 24, 0.5], ['hem.rot', 12, 0.3], ['hem.sx', 14, 0.35], ['body.rot', 30, 0.65],
    ['foreL.rot', 24, 0.5], ['foreR.rot', 24, 0.5], ['wR', 30, 0.55], ['wL', 30, 0.55]];

  function seg(list, t) { var lo = 0, hi = list.length - 1, r = -1; while (lo <= hi) { var m = (lo + hi) >> 1; if (list[m].t <= t) { r = m; lo = m + 1; } else hi = m - 1; } return r; }
  function lerpKeys(list, t, field) {
    var i = seg(list, t);
    if (i < 0) return list.length ? list[0][field] : 0;
    if (i >= list.length - 1) return list[i][field];
    var A = list[i], B = list[i + 1], u = (t - A.t) / Math.max(1e-6, B.t - A.t);
    return A[field] + (B[field] - A[field]) * (EASE[B.ease] || EASE.io)(u);
  }
  function viewName(kind, dir) {
    if (kind === 'front' || kind === 'back') return kind;
    return (dir < 0 ? 'left' : 'right') + ({ q45: '45', q90: '90', q135: '135' }[kind] || '90');
  }

  /* --------------------------------------------------------- 4. DỰNG */
  // một diễn viên: { asset, steps: [{ clip, dir?, tempo?, face?, cam?, speed?, events? }], x0, dir, scale, ground, weapon, cams }
  // → then chốt, đường đi, nét mặt, đoạn hành vi + sự kiện / máy quay / tốc độ (dùng chung cả cảnh)
  function compileActor(a, ai, out) {
    var K = a.scale || 0.62, keys = [], trav = [{ t: 0, x: a.x0 == null ? 120 : a.x0, ease: 'lin' }], faces = [], segs = [];
    var t = 0, X = trav[0].x, dir = a.dir || 1;
    (a.steps || []).forEach(function (step, si) {
      var c = CLIPS[step.clip];
      if (!c) throw new Error('choreo: ' + N_('không có clip {id}', { id: step.clip }));
      if (c.make) c = Object.assign({}, c, c.make(step));
      var d = step.dir || dir, sc = step.tempo || 1, t0 = t, view = step.view || c.view || 'q90';
      dir = d;
      var f0 = Object.assign({}, c.face || {}, step.face || {});
      if (Object.keys(f0).length) faces.push({ t: t0, f: f0 });
      (c.faces || []).forEach(function (f) { faces.push({ t: t0 + f[0] * sc, f: f[1] }); });
      c.keys.forEach(function (k) {
        var x = k[3] || {};
        // x.dir: hướng TƯƠNG ĐỐI với hướng của bước (xoay người: -1 = đang quay về phía sau) — đánh sang trái vẫn đúng
        keys.push({ t: t0 + k[0] * sc, p: resolve(k[1]), ease: k[2] || 'io', ez: x.ez, spin: !!x.spin, view: viewName(x.view || view, x.dir ? x.dir * d : d), hide: x.hide || step.hide || c.hide || [], clip: c.id, step: si });
        if (x.face) faces.push({ t: t0 + k[0] * sc, f: x.face });
      });
      var x0 = X, ts = (a.travelScale || 1) * (step.tscale > 0 ? step.tscale : 1);   // tscale: thu / giãn quãng đi riêng bước này (đòn bay ngắn lại khi sau lưng hết chỗ lùi)
      (c.travel || []).forEach(function (q) { X = x0 + d * q[1] * ts; trav.push({ t: t0 + q[0] * sc, x: X, ease: q[2] || 'io' }); });
      (c.events || []).concat(step.events || []).forEach(function (e) {
        var ev = Object.assign({ t: t0 + e[0] * sc, dir: d, step: si, a: ai }, e[1]);
        // vai phụ (người bị đánh): không tự khựng hình / đổi nhạc / khung điện ảnh — nhịp cảnh do người ra đòn cầm
        if (a.quiet) ['hitstop', 'music', 'ambient', 'letterbox', 'title', 'grade'].forEach(function (k) { delete ev[k]; });
        out.evs.push(ev);
      });
      if (a.cams !== false) (step.cam || c.cam || []).forEach(function (q) { out.cams.push(Object.assign({ t: t0 + q[0] * sc, ease: q[2] || 'io' }, q[1])); });
      if (a.speeds !== false) (step.speed || c.speed || []).forEach(function (q) { out.spd.push({ t: t0 + q[0] * sc, r: q[1], ease: 'lin' }); });
      t = t0 + (c.dur != null ? c.dur : c.keys[c.keys.length - 1][0]) * sc;
      segs.push({ id: c.id, label: step.label || c.label || c.id, t0: t0, t1: t, view: view, dir: d });
    });
    if (!keys.length) throw new Error('choreo: ' + N_('diễn viên {id} chưa có bước nào', { id: ai }));
    keys.sort(function (p, q) { return p.t - q.t; });
    // góc quay nhiều vòng (binh khí, lộn người): mỗi then chốt lấy góc tương đương GẦN NHẤT với then chốt trước — viết góc tự nhiên,
    // engine tự đi đường ngắn; then chốt đánh dấu spin giữ nguyên số vòng tác giả viết (múa thương 2 vòng)
    ['wR', 'wL', 'root.rot'].forEach(function (ch) {
      var ix = IDX[ch], prevA = null, prevW = null;
      keys.forEach(function (k) {
        var v = k.p[ix];
        if (prevW !== null) v = k.spin ? prevW + (v - prevA) : v + 360 * Math.round((prevW - v) / 360);
        prevA = k.p[ix]; k.p[ix] = v; prevW = v;
      });
    });
    faces.sort(function (p, q) { return p.t - q.t; });
    var acc = { eyes: null, brows: null, mouth: null, fx: [] };
    faces.forEach(function (f) { acc = Object.assign({}, acc, f.f); f.full = acc; });
    return { asset: a.asset, K: K, G: a.ground || 330, weapon: a.weapon || handWeapon(a.asset), keys: keys, trav: trav, faces: faces, segments: segs, T: t, cache: {} };
  }
  // tư thế mỗi khung (120 Hz): nội suy then chốt → lò xo; vị trí trong thế giới
  function bake(A, nF) {
    var keys = A.keys, frames = new Float32Array(nF * N), tmp = new Float64Array(N), xs = new Float32Array(nF);
    var sp = SPRINGS.map(function (s) { return { ix: IDX[s[0]], w: s[1], z: s[2], x: null, v: 0 }; });
    function keyedAt(tt, out) {
      var i = seg(keys, tt);
      if (i < 0) { out.set(keys[0].p); return; }
      if (i >= keys.length - 1) { out.set(keys[keys.length - 1].p); return; }
      var P = keys[i], Q = keys[i + 1], u = (tt - P.t) / Math.max(1e-6, Q.t - P.t), eu = (EASE[Q.ease] || EASE.io)(u);
      for (var n = 0; n < N; n++) out[n] = P.p[n] + (Q.p[n] - P.p[n]) * eu;
      if (Q.ez) for (var ch in Q.ez) { var ix = IDX[ch]; if (ix !== undefined) out[ix] = P.p[ix] + (Q.p[ix] - P.p[ix]) * (EASE[Q.ez[ch]] || EASE.io)(u); }
    }
    for (var f = 0; f < nF; f++) {
      keyedAt(f * DT, tmp);
      sp.forEach(function (s) {
        var target = tmp[s.ix];
        if (s.x === null) s.x = target;
        s.v += (s.w * s.w * (target - s.x) - 2 * s.z * s.w * s.v) * DT;
        s.x += s.v * DT;
        tmp[s.ix] = s.x;
      });
      frames.set(tmp, f * N);
      xs[f] = lerpKeys(A.trav, f * DT, 'x');
    }
    A.frames = frames; A.xs = xs; A.nF = nF;
  }
  // script một diễn viên (màn mẫu): { scale, ground, world, x0, dir, scene, weapon, steps } — build(asset, script)
  // script nhiều diễn viên (đấu, phim): { world, scene, title, follow: [chỉ số diễn viên máy bám], actors: [{ asset, steps, x0, dir, scale, ground, weapon, cams, speeds }] } — build(script)
  function build(asset, script) {
    var S = script ? Object.assign({}, script, { actors: [{ asset: asset, steps: script.steps, x0: script.x0, dir: script.dir, scale: script.scale, ground: script.ground, weapon: script.weapon, travelScale: script.travelScale }] }) : asset;
    var W = S.world || 1280, out = { evs: [], cams: [], spd: [] };
    var actors = (S.actors || []).map(function (a, ai) { return compileActor(a, ai, out); });
    if (!actors.length) throw new Error('choreo: ' + N_('cảnh chưa có diễn viên'));
    var T = Math.max.apply(null, actors.map(function (A) { return A.T; })), nF = Math.ceil(T * HZ) + 2;
    // trần cứng lúc chạy (phòng thủ lớp hai sau cổng gói — CNS-043): dòng thời gian ≤ 180 s, ≤ 600 sự kiện, tổng khựng hình ≤ 12 s
    if (!(T > 0 && T <= 180)) throw new Error('choreo: ' + (isFinite(T) ? N_('dòng thời gian {s} s — tối đa 180 s', { s: T.toFixed(1) }) : N_('dòng thời gian lỗi — tối đa 180 s')));
    if (out.evs.length > 600) throw new Error('choreo: ' + N_('quá nhiều sự kiện ({n} > 600)', { n: out.evs.length }));
    if (out.evs.reduce(function (n, e) { return n + Math.min(0.4, e.hitstop > 0 ? e.hitstop : 0); }, 0) > 12) throw new Error('choreo: ' + N_('tổng khựng hình quá 12 s'));
    actors.forEach(function (A) { bake(A, nF); });
    var evs = out.evs.sort(function (p, q) { return p.t - q.t; }), cams = out.cams.sort(function (p, q) { return p.t - q.t; }), spd = out.spd;
    evs.forEach(function (e, i) { e.i = i; });
    // máy quay: bám (lò xo tới hạn) trung điểm các diễn viên được chọn, dẫn khung về hướng diễn viên đầu
    var A0 = actors[0], follow = (S.follow || [0]).filter(function (i) { return actors[i]; });
    var cx = new Float32Array(nF), cy = new Float32Array(nF), cz = new Float32Array(nF), cr = new Float32Array(nF);
    var CAMF = ['z', 'lead', 'fy', 'roll', 'fol', 'ax', 'lag'], cdef = { z: 1, lead: 0, fy: 0.5, roll: 0, fol: 1, ax: W / 2, lag: 6 };
    var camK = cams.length ? cams : [{ t: 0 }];
    camK.forEach(function (c, i) { CAMF.forEach(function (k) { if (c[k] === undefined) c[k] = i ? camK[i - 1][k] : cdef[k]; }); });
    var sx = null, sy = null, vx = 0, vy = 0, segT = A0.segments.map(function (s) { return { t: s.t0 }; });
    for (var f = 0; f < nF; f++) {
      var tt = f * DT, X0 = 0, lift = 0;
      follow.forEach(function (i) { X0 += actors[i].xs[f] / follow.length; lift += -actors[i].frames[f * N + IDX['root.y']] * actors[i].K / follow.length; });
      var z = lerpKeys(camK, tt, 'z'), fol = lerpKeys(camK, tt, 'fol'), lag = lerpKeys(camK, tt, 'lag');
      var dI = A0.segments[Math.max(0, seg(segT, tt))] || { dir: 1 };
      var tx = fol * (X0 + dI.dir * lerpKeys(camK, tt, 'lead')) + (1 - fol) * lerpKeys(camK, tt, 'ax');
      var ty = A0.G - lerpKeys(camK, tt, 'fy') * 150 * A0.K - lift * 0.6;
      if (sx === null) { sx = tx; sy = ty; }
      vx += (lag * lag * (tx - sx) - 2 * lag * vx) * DT; sx += vx * DT;
      vy += (lag * lag * (ty - sy) - 2 * lag * vy) * DT; sy += vy * DT;
      var roll = lerpKeys(camK, tt, 'roll'), zz = z * (1 + Math.abs(roll) / 40);   // nghiêng máy: phóng thêm để không lộ mép
      cz[f] = zz; cr[f] = roll;
      cx[f] = Math.max(SW / 2 / zz, Math.min(W - SW / 2 / zz, sx));
      cy[f] = Math.max(SH / 2 / zz, Math.min(SH - SH / 2 / zz, sy));
    }
    // thời gian: tốc độ (slow-mo / tua nhanh) + hit-stop → bảng đổi giờ truyện ↔ giờ thật — chung cả cảnh (hai bên cùng khựng)
    spd.sort(function (p, q) { return p.t - q.t; });
    var tl = { T: T, W: W, nF: nF, actors: actors, cam: { x: cx, y: cy, z: cz, roll: cr }, events: evs, speeds: spd, scene: S.scene || null, title: S.title || '' };
    // lối tắt diễn viên đầu (màn một người, đo, test)
    ['asset', 'K', 'G', 'keys', 'frames', 'xs', 'faces', 'segments', 'weapon', 'cache'].forEach(function (k) { tl[k] = A0[k]; });
    retime(tl);
    // hiệu ứng cần vị trí: mũi binh khí / chân / đầu / tay của diễn viên phát sự kiện; vệt chém = đường mũi binh khí quét qua
    evs.forEach(function (e) {
      if (e.at) { var p = pointAt(tl, e.t, e.at, e.a); e.x = p[0] + (e.dx || 0) * e.dir; e.y = p[1] + (e.dy || 0); }
      if (e.smear) {
        var a = e.t - e.smear, pts = [];
        for (var i = 0; i <= 12; i++) pts.push(pointAt(tl, a + (e.t - a) * i / 12, e.from || 'tip', e.a));
        e.pts = pts;
      }
    });
    return tl;
  }
  // hình học binh khí cầm tay (tay phải): góc nghiêng sẵn của bản vẽ + chiều dài tới mũi / tới chuôi, đọc thẳng từ lớp vẽ
  // (đa số đồ cầm tay vẽ dựng đứng từ điểm nắm 128,193; có thể bọc trong rotate(a 128 193))
  var WEAPON_CACHE = {};
  // dạng dùng trong dòng thời gian: { R: hình học } — tay không thì {} (mũi = bàn tay)
  function handWeapon(asset) { var w = weaponOf(asset); return w && w.tip ? { R: w } : {}; }
  function weaponOf(asset) {
    var ref = asset && GC.partRef ? GC.partRef(asset, 'heldR') : null;
    if (!ref || /(^|\/)none$/.test(ref)) return {};   // 'none' / 'gen.core/none' = tay không
    var p = GC.getPart('heldR', ref, asset.pack), w = { angle: 0, tip: 24, butt: 0 };
    var L = p && (p.layers || (p.data && p.data.layers)), art = L && (L.heldR || '');   // linh kiện dữ liệu giữ bản gốc ở p.data
    var ck = ref + '#' + (typeof art === 'string' ? art.length + ':' + art.slice(0, 64) + art.slice(-64) : !!(p && p.tall));   // sửa bản vẽ → khoá khác
    if (WEAPON_CACHE[ck]) return WEAPON_CACHE[ck];
    if (typeof art === 'string' && art) {
      var m = /rotate\(\s*(-?[\d.]+)\s+128\s+193\s*\)/.exec(art), ys = [];
      art.replace(/\by="(-?[\d.]+)"[^>]*?height="([\d.]+)"/g, function (_, y, h) { ys.push(+y, +y + +h); return _; });
      art.replace(/\bd="([^"]+)"/g, function (_, d) { var nums = d.match(/-?[\d.]+/g) || []; for (var i = 1; i < nums.length; i += 2) ys.push(+nums[i]); return _; });
      if (ys.length) { w.tip = Math.max(20, 193 - Math.min.apply(null, ys)); w.butt = Math.max(0, Math.max.apply(null, ys) - 193); }
      if (m) w.angle = +m[1];
    } else if (p && p.tall) w.tip = 110;
    return (WEAPON_CACHE[ck] = w);
  }
  function mapTime(A, B, v) {
    var lo = 0, hi = A.length - 1;
    if (v <= A[0]) return B[0];
    if (v >= A[hi]) return B[hi];
    while (hi - lo > 1) { var m = (lo + hi) >> 1; if (A[m] <= v) lo = m; else hi = m; }
    var d = A[hi] - A[lo];
    return d < 1e-9 ? B[lo] : B[lo] + (B[hi] - B[lo]) * (v - A[lo]) / d;
  }
  function storyToReal(tl, s) { return mapTime(tl.mS, tl.mR, s); }
  function realToStory(tl, r) { return mapTime(tl.mR, tl.mS, r); }

  /* ------------------------------------------------- 4b. ĐẤU (hai diễn viên) */
  // spec: { a: { asset, x, y, k, face? }, b: { asset, x, y, k }, action, react, scene?, world?, walls? } — x, y: chân trong toạ độ cảnh, k: tỉ lệ; walls: x người đứng xem
  // 1) dựng riêng người ra đòn, tìm điểm va chạm (sự kiện hitstop / hit) và mũi binh khí lúc đó
  // 2) thiếu / thừa tầm → chèn bước áp sát (lướt) hoặc lùi trước đòn, để mũi binh khí chạm đúng mặt trước thân đối thủ
  // 3) đối thủ thủ thế chờ rồi phản ứng ĐÚNG khung va chạm (trúng / đỡ / né / ngã) — hai bên chung một đồng hồ (cùng khựng, cùng slow-mo)
  function actorSpec(p, dir, steps, extra) {
    return Object.assign({ asset: p.asset, x0: p.x, dir: dir, scale: p.k || 0.8, ground: p.y || 330, travelScale: (p.k || 0.8) / 0.62, steps: steps }, extra || {});
  }
  // khoảng cách đầu–đầu nhỏ nhất giữa diễn viên 0 và 1 trong cả màn (mẫu 60 Hz)
  // khoảng cách tâm đầu nhỏ nhất của hai diễn viên — tách hai đoạn: TRƯỚC lúc va chạm (áp sát) và SAU (thu đòn, về thế thủ)
  function minHead(tl, tSplit) {
    var g = Infinity, pre = Infinity, post = Infinity;
    for (var t = 0; t <= tl.T; t += 1 / 60) {
      var a = pointAt(tl, t, 'head', 0), b = pointAt(tl, t, 'head', 1), d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (d < g) g = d; if (tSplit != null) { if (t <= tSplit) pre = Math.min(pre, d); else post = Math.min(post, d); }
    }
    return tSplit == null ? g : { g: g, pre: pre, post: post };
  }
  var STRIKES = ['tip', 'hand', 'handL', 'foot', 'head', 'chest'];
  function strikeOf(e) { return STRIKES.indexOf(e.at) >= 0 ? e.at : 'tip'; }
  function impacts(tl, ai) { return tl.events.filter(function (e) { return (e.a || 0) === (ai || 0) && (e.hitstop > 0 || e.hit); }); }
  function duel(spec) {
    var AC = GC.choreo.ACTIONS || {}, RE = GC.choreo.REACTS || {}, has = Object.prototype.hasOwnProperty;
    var act = has.call(AC, spec.action) ? AC[spec.action] : null, re = has.call(RE, spec.react || 'hit') ? RE[spec.react || 'hit'] : null;
    if (!act || !act.attack) throw new Error('choreo: ' + N_('"{ref}" không phải đòn đánh ({ids})', { ref: spec.action, ids: Object.keys(AC).filter(function (k) { return AC[k].attack; }).join(', ') }));
    if (!re) throw new Error('choreo: ' + N_('phản ứng lạ "{ref}" ({ids})', { ref: spec.react, ids: Object.keys(RE).join(', ') }));
    var A = spec.a, B = spec.b, dir = B.x >= A.x ? 1 : -1, kB = B.k || 0.8;
    var fierce = { eyes: 'fierce', brows: 'angry', mouth: 'flat' };
    var mk = function (pre) { return [{ clip: 'hold', dur: 0.28 + (pre || 0), pose: 'guard', face: Object.assign({}, fierce, A.face || {}) }].concat(act.clips.map(function (c) { return { clip: c }; })); };
    var W0 = spec.world || SW, hold0 = mk();
    // người đứng xem chen GIỮA hai đấu thủ không tính (không cấm người ra đòn tiến tới) — chỉ chặn phía sau lưng mỗi người
    var walls = (spec.walls || []).filter(function (w) { return (w - A.x) * (w - B.x) > 0; });
    // tầm theo cú VƯƠN XA NHẤT (liên hoàn: cú đâm, không phải cú hất thương lên trời); phản ứng khớp cú CUỐI
    var reach = function (tl) {
      var hs = impacts(tl, 0), best = null;
      // điểm đánh của từng cú = nơi sự kiện va chạm đặt hiệu ứng (mũi binh khí / nắm tay / bàn chân), mặc định mũi binh khí
      hs.forEach(function (e) { var tip = pointAt(tl, e.t, strikeOf(e), 0), root = xAt(tl.actors[0], e.t), ahead = (tip[0] - root) * dir; if (!best || ahead > best.ahead) best = { e: e, ahead: ahead, root: root }; });
      return best;
    };
    var steps, lone, delta = 0, plan = null;
    if (act.ranged) {
      // ĐÒN NÉM: đứng tại chỗ, vật bay từ tay lúc buông (sự kiện release của clip) tới ngực đối thủ; va chạm = lúc buông + thời gian bay theo quãng xa
      steps = mk(); lone = build({ actors: [actorSpec(A, dir, steps)], world: W0 });
      var rel = lone.events.filter(function (e) { return (e.a || 0) === 0 && e.release; })[0];
      if (!rel) throw new Error('choreo: ' + N_('đòn ném {id} thiếu sự kiện release', { id: spec.action }));
      var hp = pointAt(lone, rel.t, 'hand', 0), bt = build({ actors: [actorSpec(B, -dir, [{ clip: 'hold', dur: 0.3, pose: 'guard' }])], world: W0 }), cp = pointAt(bt, 0.2, 'chest', 0);
      var fl = Math.max(0.22, Math.min(0.9, Math.abs(cp[0] - hp[0]) / 560)), tLoc = rel.t - lone.actors[0].segments[rel.step].t0 + fl, art = act.art || 'rock';
      steps[rel.step].events = [[tLoc, { fx: 'projectile', x: cp[0], y: cp[1], x0: hp[0], y0: hp[1], flight: fl, art: art }],
        [tLoc, { x: cp[0], y: cp[1], fx: 'impact', size: 0.9, hitstop: 0.07, shake: 4, sfx: 'hit', hit: true }],
        [tLoc + 0.02, { x: cp[0], y: cp[1] - 26, fx: 'text', text: art === 'tomato' ? 'BẸP!' : 'BỐP!', size: 1, color: art === 'tomato' ? '#e8402a' : '#ff4d3d', rot: 8 }]];
      lone = build({ actors: [actorSpec(A, dir, steps)], world: W0 });
    } else {
      var solo1 = build({ actors: [actorSpec(A, dir, hold0)], world: W0 }), r1 = reach(solo1);
      if (!r1) throw new Error('choreo: ' + N_('đòn {id} không có điểm va chạm', { id: spec.action }));
      // đích: binh khí → mặt trước THÂN đối thủ (đập đất: cách thêm "shock"); tay không (aim: 'head') → MẶT đối thủ — chibi đầu to, tay chân ngắn:
      // đấm vào thân thì hai đầu đã chồng nhau, nên tay không đứng thẳng / ngả ra sau và đánh vào mặt (đo tâm đầu đối thủ lúc thủ thế)
      var front = B.x - dir * (26 + (act.shock || 0)) * kB;
      if (act.aim === 'head') { var bh = build({ actors: [actorSpec(B, -dir, [{ clip: 'hold', dur: 0.3, pose: POSES.fistGuard ? 'fistGuard' : 'guard' }])], world: W0 }); front = pointAt(bh, 0.2, 'head', 0)[0] - dir * 52 * 0.7 * kB; }
      var minGap = 64 * Math.max(A.k || 0.8, kB), ts = (A.k || 0.8) / 0.62;   // ≥ bề rộng thân (hai thân không lồng nhau); hai đầu do rào đầu bên dưới lo
      var have = (r1.root - A.x) * dir;
      delta = (front - A.x) * dir - r1.ahead - have;
      // chỗ lùi sau lưng người ra đòn (tới mép sân / tới người đứng xem, chừa một thân) — đòn bay xa hơn khoảng cách hai người
      // thì phải lùi lấy đà; hết chỗ lùi → lùi hết chỗ, phần còn lại thu ngắn chính quãng bay của đòn
      var room = Math.max(0, dir > 0 ? A.x - 36 : W0 - 36 - A.x);
      walls.forEach(function (w) { var bd = (A.x - w) * dir; if (bd > 0) room = Math.min(room, Math.max(0, bd - 100 * (A.k || 0.8))); });
      plan = function (delta) {
        var st = mk(), back = delta, sc = 1;
        if (delta < -room && have > 10) { back = -room; sc = Math.max(0.2, (have + delta + room) / have); }
        if (sc < 1) st.forEach(function (x, i) { if (i) x.tscale = sc; });
        if (Math.abs(back) > 8) st.splice(1, 0, { clip: 'stepIn', dist: back / ts });
        return st;
      };
      // hai vòng: chèn bước áp sát làm lò xo của binh khí lúc va chạm hơi khác → đo lại, chỉnh phần dư
      for (var it = 0; it < 2; it++) {
        delta = Math.max(-420, Math.min(420, delta));
        var gap = (B.x - (A.x + dir * (have + delta))) * dir;   // không áp sát quá một thân người
        if (gap < minGap) delta -= minGap - gap;
        steps = plan(delta);
        lone = build({ actors: [actorSpec(A, dir, steps)], world: W0 });
        var r2 = reach(lone), tipX = pointAt(lone, r2.e.t, strikeOf(r2.e), 0)[0], miss = (front - tipX) * dir;
        if (Math.abs(miss) < 3 || Math.abs(delta) <= 8 && Math.abs(miss) < 8) break;
        delta += miss;
      }
    }
    // né / đỡ: canh cú ĐẦU (tránh hoặc gạt cả chuỗi); trúng / ngã / choáng: canh cú CUỐI (đòn kết liễu)
    var stage = function (steps, lone) {
      var hs = impacts(lone, 0), early = re.miss || spec.react === 'block', tImp = (early ? hs[0] : hs[hs.length - 1]).t, tReach = reach(lone).e.t;
      var wait = tImp - re.contact;
      if (wait < 0.3) { steps[0].dur += 0.3 - wait; tImp += 0.3 - wait; tReach += 0.3 - wait; wait = 0.3; }
      var bSteps = [{ clip: 'hold', dur: wait, pose: 'guard', face: { eyes: 'fierce', brows: 'determined', mouth: 'flat' } }].concat(re.clips.map(function (c) { return { clip: c }; }));
      // thu đòn: đòn tay không chạm gần (đá, đẩy) — đánh xong LÙI VỀ cho hai cái đầu chibi không chồng nhau khi về thế thủ
      if (recoil > 8) steps.push({ clip: 'stepIn', dist: -recoil / ts });
      steps.push({ clip: 'hold', dur: 0.35, pose: 'guard' });
      var specs = [actorSpec(A, dir, steps), actorSpec(B, -dir, bSteps, { quiet: true, cams: false, speeds: false })];
      var mk3 = function () { return build({ actors: specs, follow: [0, 1], world: W0, scene: spec.scene || null }); };
      // văng / lộn / lùi ra ngoài sân khấu → thu ngắn quãng đi của diễn viên đó cho vừa (chừa nửa thân ở mép)
      return { tl: fitStage(mk3(), specs, [A.x, B.x], mk3, W0, walls), tImp: tImp, tReach: tReach };
    };
    // rào đầu: đổ người tới (đâm xuống, chém quét) hay đối thủ gập người khi trúng đòn có thể làm hai cái đầu chibi chồng nhau dù gốc chân
    // đã cách minGap → đo cả màn, thiếu thì lùi người ra đòn đúng phần thiếu (chịu mũi binh khí ngắn đi một chút, ghi vào duel.short)
    // Chồng đầu SAU va chạm (đánh xong về thế thủ ngay sát đối thủ) → thêm bước lùi thu đòn, giữ nguyên tầm đòn; chồng đầu TRƯỚC / lúc
    // va chạm (đổ người tới) → mới phải lùi cả đòn (đòn ngắn đi, ghi vào duel.short)
    var headGap = 90 * Math.max(A.k || 0.8, kB), short = 0, recoil = 0, out, g, mh;
    if (!ts) ts = (A.k || 0.8) / 0.62;
    // Bước lùi chỉ cứu được chồng đầu xảy ra SAU khi đòn dứt; chồng đầu ngay trong lúc thu đòn / đối thủ ngã chúi (review cortex CNS-079)
    // thì lùi không đủ → quay về cách chắc chắn: lùi cả đòn. Vòng cuối luôn là bản đã đo đạt, hoặc bản tốt nhất đo được.
    var lastPost = null;
    for (var hg = 0; hg < 6; hg++) {
      var cp = steps.map(function (x) { return Object.assign({}, x); });   // stage() sửa bước (dur, thêm hold) — mỗi vòng dựng từ bản sao
      if (act.ranged) { out = stage(cp, lone); g = minHead(out.tl); break; }   // ném: đứng xa, không áp sát
      out = stage(cp, lone); mh = minHead(out.tl, out.tReach + 0.05); g = mh.g;
      if (g >= headGap - 1 || hg === 5) break;
      // thiếu TRƯỚC va chạm → thu ngắn đúng phần thiếu đó (phần sau để bước lùi lo); chỉ thiếu SAU → lùi về; lùi không đỡ → thu ngắn
      var back;
      if (mh.pre < headGap - 1) back = headGap - mh.pre + 2;
      else if (recoil < 160 && (lastPost === null || mh.post > lastPost + 2)) { lastPost = mh.post; recoil += headGap - mh.post + 4; continue; }
      else back = headGap - mh.post + 2;
      short += back; delta -= back;
      steps = plan(delta);
      lone = build({ actors: [actorSpec(A, dir, steps)], world: W0 });
    }
    var tl = out.tl;
    if (re.miss) impacts(tl, 0).forEach(function (e) { delete e.hitstop; if (e.fx === 'impact') e.fx = 'spark'; if (e.sfx === 'hit' || (e.sfx && e.sfx.indexOf && e.sfx.indexOf('hit') >= 0)) e.sfx = 'swish'; e.miss = true; e.hit = true; });
    if (re.miss && act.ranged) tl.events.forEach(function (e) { if ((e.a || 0) === 0 && e.fx === 'text' && e.t >= out.tImp - 0.01) e.text = 'VÈO!'; });   // ném trượt: không "BỐP!"
    // giờ thật đổi khi bỏ khựng hình (né) → dựng lại bảng giờ
    if (re.miss) retime(tl);
    tl.duel = { dir: dir, impact: out.tImp, reach: out.tReach, react: spec.react || 'hit', action: spec.action, short: Math.round(short), head: Math.round(g),
      end: tl.actors.map(function (X) { return X.xs[X.xs.length - 1]; }) };
    return tl;
  }
  // một người diễn một hành động (múa thương, nhảy mừng, thi lễ…) tại chỗ đứng hiện tại
  function solo(spec) {
    var AC = GC.choreo.ACTIONS || {}, act = Object.prototype.hasOwnProperty.call(AC, spec.action) ? AC[spec.action] : null;
    if (!act) throw new Error('choreo: ' + N_('không có hành động {id}', { id: spec.action }));
    var A = spec.a, steps = act.clips.map(function (c) { return { clip: c }; }).concat([{ clip: 'hold', dur: 0.3, pose: act.attack ? 'guard' : 'ready' }]);
    var specs = [actorSpec(A, spec.dir || 1, steps)], mk2 = function () { return build({ actors: specs, world: spec.world || SW, scene: spec.scene || null }); };
    var tl = fitStage(mk2(), specs, [A.x], mk2, spec.world || SW, spec.walls);
    tl.duel = { dir: spec.dir || 1, action: spec.action, end: [tl.actors[0].xs[tl.actors[0].xs.length - 1]] };
    return tl;
  }
  // diễn viên nào đi ra ngoài [36, W − 36] (văng, lộn, lùi lấy đà) → thu quãng đi của RIÊNG người đó cho vừa, dựng lại một lần
  // walls: chỗ đứng (x) của người đứng xem — coi như mép sân phụ, chừa ~một thân người, để không lộn / văng đè lên họ
  function fitStage(tl, specs, origins, rebuild, W, walls) {
    var again = false;
    specs.forEach(function (sp, ai) {
      var xs = tl.actors[ai].xs, o = origins[ai] != null ? origins[ai] : sp.x0, mn = Infinity, mx = -Infinity, f = 1, lo = 36, hi = W - 36, clr = 100 * (sp.scale || 0.8);
      // đang đứng sẵn trong vùng chừa thì mốc là chỗ đứng (không bắt lùi xa hơn) · sai số 3 đv cho lò xo / làm tròn
      (walls || []).forEach(function (w) { if (w < o) lo = Math.max(lo, Math.min(o, w + clr) - 3); else if (w > o) hi = Math.min(hi, Math.max(o, w - clr) + 3); });
      for (var q = 0; q < xs.length; q++) { if (xs[q] < mn) mn = xs[q]; if (xs[q] > mx) mx = xs[q]; }
      if (mn < lo && o > mn) f = Math.min(f, Math.max(0, o - lo) / (o - mn));
      if (mx > hi && mx > o) f = Math.min(f, Math.max(0, hi - o) / (mx - o));
      if (f < 0.999) { sp.travelScale = (sp.travelScale || 1) * Math.max(0.15, f); again = true; }
    });
    return again ? rebuild() : tl;
  }
  // dựng lại bảng giờ truyện ↔ thật (sau khi sửa sự kiện khựng hình)
  function retime(tl) {
    var hs = tl.events.filter(function (e) { return e.hitstop > 0; }), spd = tl.speeds, T = tl.T;
    var rateAt = function (x) { return spd.length ? lerpKeys(spd, x, 'r') : 1; };
    var mS = [0], mR = [0], st = 0, rt = 0, hi = 0, stp = 1 / 480;
    while (st < T - 1e-9) {
      while (hi < hs.length && hs[hi].t <= st) { rt += Math.min(0.4, hs[hi].hitstop); mS.push(st); mR.push(rt); hi++; }
      var r = Math.max(0.05, rateAt(st + stp / 2)), d2 = Math.min(stp, T - st);
      st += d2; rt += d2 / r; mS.push(st); mR.push(rt);
    }
    tl.mS = mS; tl.mR = mR; tl.real = rt;
    tl.events.forEach(function (e) { e.rt = storyToReal(tl, e.t); });
  }

  /* ------------------------------------------------- 5. LẤY MẪU MỘT KHUNG */
  function actorOf(tl, ai) { return tl.actors ? tl.actors[ai || 0] : tl; }
  function flatAt(A, s) {
    var f = Math.max(0, Math.min(A.nF - 1.001, s * HZ)), i = Math.floor(f), u = f - i, out = new Float64Array(N), a = i * N, b = a + N;
    for (var n = 0; n < N; n++) out[n] = A.frames[a + n] + (A.frames[b + n] - A.frames[a + n]) * u;
    return out;
  }
  function arr(tl, name, s) { var f = Math.max(0, Math.min(tl.nF - 1.001, s * HZ)), i = Math.floor(f), u = f - i, A = name === 'xs' ? tl.xs : tl.cam[name]; return A[i] + (A[i + 1] - A[i]) * u; }
  function xAt(A, s) { var f = Math.max(0, Math.min(A.nF - 1.001, s * HZ)), i = Math.floor(f), u = f - i; return A.xs[i] + (A.xs[i + 1] - A.xs[i]) * u; }
  // góc nhìn / che binh khí: đổi ở giữa đoạn chuyển giữa hai then chốt (quay người nhanh = các then chốt sát nhau).
  // nghiêng ↔ chính diện (hoặc ↔ sau lưng) cùng hướng: chèn góc 45° (135°) ở 1/3 giữa → quay người ba nhịp, không "giật" góc
  var MIDVIEW = { 'left90|front': 'left45', 'right90|front': 'right45', 'left90|back': 'left135', 'right90|back': 'right135' };
  function viewAt(A, s) {
    var K = A.keys, i = seg(K, s);
    if (i < 0) return K[0];
    if (i >= K.length - 1) return K[i];
    var P = K[i], Q = K[i + 1], u = (s - P.t) / Math.max(1e-6, Q.t - P.t);
    var mid = MIDVIEW[P.view + '|' + Q.view] || MIDVIEW[Q.view + '|' + P.view];
    if (mid && u >= 0.3 && u < 0.7) return { view: mid, hide: (u < 0.5 ? P : Q).hide };
    return u >= 0.5 ? Q : P;
  }
  function faceAt(A, s) { var i = seg(A.faces, s); return i < 0 ? {} : A.faces[i].full; }
  // tư thế cuối (đã giải góc bàn tay, lật gương, cỡ đầu, xoay 3/4) + lớp vẽ của diễn viên ai ở giờ truyện s
  function finalAt(tl, s, ai) {
    var A = actorOf(tl, ai), flat = flatAt(A, s), k = viewAt(A, s), fc = faceAt(A, s), hide = k.hide || [];
    var dirn = { view: k.view, motion: 'rest', hide: hide };
    if (fc.eyes) dirn.eyes = fc.eyes; if (fc.brows) dirn.brows = fc.brows; if (fc.mouth) dirn.mouth = fc.mouth; if (fc.fx && fc.fx.length) dirn.fx = fc.fx;
    var sig = JSON.stringify(dirn), c = A.cache[sig];
    if (!c) { c = A.cache[sig] = GC.compose(A.asset, 'normal', dirn); c.sig = sig; }
    var st = c.state, pz = {};
    J.forEach(function (j, a) { pz[j] = { x: flat[a * NC], y: flat[a * NC + 1], rot: flat[a * NC + 2], sx: flat[a * NC + 3], sy: flat[a * NC + 4] }; });
    ['L', 'R'].forEach(function (sd) { pz['hand' + sd].rot = flat[IDX['w' + sd]] - (A.weapon[sd] ? A.weapon[sd].angle || 0 : 0) - (pz.root.rot + pz.pelvis.rot + pz.body.rot + pz['arm' + sd].rot + pz['fore' + sd].rot); });
    if (st.mirror) { pz.root.x = -pz.root.x; pz.root.rot = -pz.root.rot; }   // gốc nằm ngoài phép lật → đảo tay để lật gương chính xác
    GC.finishPose(A.asset, st, pz);
    return { pose: pz, st: st, layers: c.layers, sig: sig, x: xAt(A, s), face: fc, view: k.view, seg: segAt(A, s), K: A.K, G: A.G, ai: ai || 0 };
  }
  function segAt(A, s) { var S = A.segments; for (var i = S.length - 1; i >= 0; i--) if (S[i].t0 <= s) return S[i]; return S[0]; }
  // điểm khung (px, py) → thế giới
  function toWorld(F, p) { return [F.x + (p[0] - 100) * F.K, F.G + (p[1] - 228) * F.K]; }
  function pointAt(tl, s, what, ai) {
    var A = actorOf(tl, ai), F = finalAt(tl, s, ai), M = GC.jointMatrices(F.pose), at = function (j, px, py) { var m = M[j]; return toWorld(F, [m[0] * px + m[2] * py + m[4], m[1] * px + m[3] * py + m[5]]); };
    if (what === 'tip' || what === 'butt') {
      var w = A.weapon.R || { angle: 0, tip: 24, butt: 0 }, a = (w.angle || 0) * Math.PI / 180, L = what === 'tip' ? w.tip : -(w.butt || 0);
      return at('handR', 128 + L * Math.sin(a), 193 - L * Math.cos(a));
    }
    if (what === 'head') return at('head', 100, 96);
    if (what === 'chest') return at('body', 100, 170);
    if (what === 'hand') return at('handR', 128, 193);
    if (what === 'foot') return at('footR', 108, 226);   // mũi bàn chân gần (đá)
    if (what === 'handL') return at('handL', 72, 193);
    return [F.x, F.G];   // feet
  }

  /* ------------------------------------------------------- 6. VẼ (chuỗi SVG) */
  var f1 = function (v) { return (Math.round(v * 10) / 10).toString(); };
  function rnd(i) { var x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
  function camAt(tl, r) {
    var s = realToStory(tl, r), c = { s: s, x: arr(tl, 'x', s), y: arr(tl, 'y', s), z: arr(tl, 'z', s), roll: arr(tl, 'roll', s), sx: 0, sy: 0 };
    tl.events.forEach(function (e) {
      if (!e.shake || r < e.rt || r > e.rt + 0.6) return;
      var a = e.shake * Math.exp(-(r - e.rt) * 9);
      c.sx += a * Math.sin(r * 97 + e.i * 3.1); c.sy += a * Math.cos(r * 83 + e.i * 1.7);
    });
    return c;
  }
  function layerTf(c, p) {
    var z = 1 + (c.z - 1) * p, x = SW / 2 + (c.x - SW / 2) * p, y = SH / 2 + (c.y - SH / 2) * p;
    return 'translate(' + f1(SW / 2 + c.sx * p) + ' ' + f1(SH / 2 + c.sy * p) + ') rotate(' + c.roll.toFixed(2) + ') scale(' + z.toFixed(4) + ') translate(' + f1(-x) + ' ' + f1(-y) + ')';
  }
  var PARALLAX = { sky: 0.04, far: 0.35, mid: 0.7, ground: 1, front: 1.25 };
  function tile(art, W) { return '<g>' + art + '</g><g transform="translate(' + (2 * SW) + ' 0) scale(-1 1)">' + art + '</g>' + (W > 2 * SW ? '<g transform="translate(' + (2 * SW) + ' 0)">' + art + '</g>' : ''); }
  function sceneArt(tl) {
    if (tl._scene) return tl._scene;
    var sc = tl.scene && GC.getScene(tl.scene, 'local.my'), L = sc ? GC.sceneLayers(sc) : {};
    var out = {};
    ['sky', 'far', 'mid', 'ground', 'front'].forEach(function (k) {
      out[k] = L[k] ? (k === 'sky' ? '<g transform="translate(-160 -90) scale(1.5)">' + L[k] + '</g>' : tile(L[k], tl.W)) : '';
    });
    if (!L.ground) out.ground = '<rect x="0" y="' + tl.G + '" width="' + tl.W + '" height="' + (SH - tl.G + 40) + '" fill="#9cbf6e"/>';
    if (!L.sky) out.sky = '<rect x="-200" y="-200" width="1040" height="760" fill="#cfe6f2"/>';
    out.weather = L.weather || ''; out.tint = L.tint || '';
    return (tl._scene = out);
  }
  function actorSvg(tl, F, extra) {
    var chain = GC.chainTransforms(F.pose), s = '';
    GC.RIG.layers.forEach(function (l) { if (F.layers[l[0]]) s += '<g transform="' + chain[l[1]] + '">' + F.layers[l[0]] + '</g>'; });
    return '<g class="gc-full"' + (extra || '') + ' transform="translate(' + f1(F.x - 100 * F.K) + ' ' + f1(F.G - 228 * F.K) + ') scale(' + F.K + ')">' + s + '</g>';
  }
  function shadowSvg(tl, F) {
    var lift = Math.max(0, -F.pose.root.y), k = Math.max(0.3, 1 - lift / 110);
    return '<ellipse cx="' + f1(F.x) + '" cy="' + f1(F.G + 1) + '" rx="' + f1(44 * F.K * k) + '" ry="' + f1(7 * F.K * k) + '" fill="rgba(20,24,22,' + (0.2 * k).toFixed(3) + ')"/>';
  }
  // hiệu ứng trong thế giới (zoom theo máy quay) — mỗi loại có tuổi thọ riêng; tối đa 24 cái sống
  var LIFE = { impact: 0.32, spark: 0.28, dust: 0.7, ring: 0.5, smear: 0.2, text: 0.75, projectile: 0, glint: 0.4, debris: 0.7 };
  function fxSvg(tl, r, s) {
    var out = '', live = 0;
    tl.events.forEach(function (e) {
      if (live >= 24) return;
      var kind = e.fx, age = r - e.rt;
      if (kind === 'projectile') {
        var fl = e.flight || 0.35; age = r - (e.rt - fl);
        if (age < 0 || age > fl) return;
        // điểm xuất phát: x0 / y0 thật (đòn ném: tay lúc buông) hoặc lệch "from" đơn vị về phía trước (đá bay vào khung)
        var x0 = e.x0 != null ? e.x0 : e.x + e.dir * (typeof e.from === 'number' ? e.from : 260), y0 = e.y0 != null ? e.y0 : e.y - 40;
        var q = age / fl, x = x0 + (e.x - x0) * q, y = y0 + (e.y - y0) * q - Math.sin(q * Math.PI) * Math.min(60, 30 + Math.abs(e.x - x0) * 0.08);
        live++; out += '<g transform="translate(' + f1(x) + ' ' + f1(y) + ') rotate(' + Math.round(q * 720) + ')">' + (e.art === 'tomato'
          ? '<circle r="7.5" fill="#e8402a" stroke="#2b211d" stroke-width="1.6"/><path d="M-3,-7 L0,-4 L3,-7 L1,-9 L-1,-9 Z" fill="#4c9a3a" stroke="#2b211d" stroke-width="1"/>'
          : '<path d="M-7,-5 L4,-8 L9,1 L3,8 L-8,5 Z" fill="#8a8178" stroke="#2b211d" stroke-width="1.6" stroke-linejoin="round"/>') + '</g>';
        return;
      }
      var life = LIFE[kind] || 0;
      if (!life || age < 0 || age > life) return;
      var q = age / life, o = (1 - q).toFixed(3), x = e.x, y = e.y, sz = e.size || 1;
      live++;
      if (kind === 'impact') {
        var R = (14 + 30 * Math.pow(q, 0.5)) * sz, pts = '';
        for (var i = 0; i < 16; i++) { var a = i / 16 * Math.PI * 2, rr = i % 2 ? R * 0.42 : R; pts += f1(x + Math.cos(a) * rr) + ',' + f1(y + Math.sin(a) * rr) + ' '; }
        out += '<polygon points="' + pts + '" fill="#fff6c4" stroke="#ff8a1f" stroke-width="' + f1(3 * (1 - q) + 0.5) + '" opacity="' + o + '"/><circle cx="' + f1(x) + '" cy="' + f1(y) + '" r="' + f1(R * 0.3) + '" fill="#fff" opacity="' + o + '"/>';
      } else if (kind === 'spark' || kind === 'glint') {
        for (var i2 = 0; i2 < (kind === 'glint' ? 1 : 7); i2++) {
          var a2 = kind === 'glint' ? 0 : rnd(e.i * 7 + i2) * Math.PI * 2, d = kind === 'glint' ? 0 : (10 + 34 * q) * sz;
          var gx = x + Math.cos(a2) * d, gy = y + Math.sin(a2) * d, gs = kind === 'glint' ? 9 * Math.sin(q * Math.PI) * sz : 3.5 * (1 - q) * sz;
          out += '<path d="M' + f1(gx) + ',' + f1(gy - gs * 2) + ' L' + f1(gx + gs * 0.5) + ',' + f1(gy) + ' L' + f1(gx) + ',' + f1(gy + gs * 2) + ' L' + f1(gx - gs * 0.5) + ',' + f1(gy) + ' Z M' + f1(gx - gs * 2) + ',' + f1(gy) + ' L' + f1(gx) + ',' + f1(gy - gs * 0.5) + ' L' + f1(gx + gs * 2) + ',' + f1(gy) + ' L' + f1(gx) + ',' + f1(gy + gs * 0.5) + ' Z" fill="#fffbe0" stroke="#f2b62c" stroke-width="0.8" opacity="' + (kind === 'glint' ? 1 : o) + '"/>';
        }
      } else if (kind === 'dust') {
        for (var i3 = 0; i3 < 6; i3++) {
          var side = i3 % 2 ? 1 : -1, dx = side * (8 + 30 * q * (0.6 + rnd(e.i + i3) * 0.8)) * sz + (e.push || 0) * e.dir * q * 20;
          out += '<circle cx="' + f1(x + dx) + '" cy="' + f1(y - 4 - 10 * q * rnd(i3 + e.i * 3)) + '" r="' + f1((4 + 9 * q) * sz * (0.7 + rnd(i3 * 5) * 0.5)) + '" fill="#e9dcc3" stroke="#b9a582" stroke-width="1" opacity="' + (0.85 * (1 - q)).toFixed(3) + '"/>';
        }
      } else if (kind === 'ring') {
        out += '<ellipse cx="' + f1(x) + '" cy="' + f1(y) + '" rx="' + f1((12 + 110 * q) * sz) + '" ry="' + f1((4 + 22 * q) * sz) + '" fill="none" stroke="#fffaf0" stroke-width="' + f1(6 * (1 - q) + 1) + '" opacity="' + o + '"/>';
      } else if (kind === 'debris') {
        for (var i4 = 0; i4 < 7; i4++) {
          var vx = (rnd(e.i * 11 + i4) - 0.5) * 120 * sz, vy = -(60 + rnd(i4 * 3 + e.i) * 90) * sz, tq = age;
          out += '<rect x="' + f1(x + vx * tq - 2.5) + '" y="' + f1(y + vy * tq + 260 * tq * tq - 2.5) + '" width="5" height="4" fill="#8f7a5c" stroke="#2b211d" stroke-width="0.8" transform="rotate(' + Math.round(tq * 600 + i4 * 40) + ' ' + f1(x + vx * tq) + ' ' + f1(y + vy * tq + 260 * tq * tq) + ')" opacity="' + o + '"/>';
        }
      } else if (kind === 'smear' && e.pts) {
        var p = e.pts, dd = 'M' + f1(p[0][0]) + ',' + f1(p[0][1]);
        for (var i5 = 1; i5 < p.length; i5++) dd += ' L' + f1(p[i5][0]) + ',' + f1(p[i5][1]);
        out += '<path d="' + dd + '" fill="none" stroke="#ffffff" stroke-width="' + f1(11 * (1 - q) * sz + 1) + '" stroke-linecap="round" stroke-linejoin="round" opacity="' + (0.85 * (1 - q)).toFixed(3) + '"/>' +
          '<path d="' + dd + '" fill="none" stroke="#bfe3ff" stroke-width="' + f1(4 * (1 - q) * sz + 0.5) + '" stroke-linecap="round" opacity="' + o + '"/>';
      } else if (kind === 'text') {
        var pop = q < 0.15 ? 0.4 + q / 0.15 * 0.8 : q < 0.25 ? 1.2 - (q - 0.15) : 1.1, fs = 30 * sz * pop;
        out += '<text x="' + f1(x) + '" y="' + f1(y - 12 * q) + '" font-family="Impact, \'Arial Black\', sans-serif" font-weight="900" font-size="' + f1(fs) + '" text-anchor="middle" fill="' + esc(e.color || '#ffd23f') + '" stroke="#2b211d" stroke-width="' + f1(fs / 7) + '" paint-order="stroke" stroke-linejoin="round" transform="rotate(' + (+e.rot || -8) + ' ' + f1(x) + ' ' + f1(y) + ')" opacity="' + (q > 0.8 ? (1 - q) / 0.2 : 1).toFixed(3) + '">' + esc(e.text || '') + '</text>';
      }
    });
    return out;
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  // lớp màn hình: màu (grade), vạch tốc độ, viền tối, khung điện ảnh, chớp trắng
  function stateAt(tl, r, kind) {   // sự kiện bật / tắt kiểu "từ giờ" (grade, letterbox): lấy cái gần nhất trước r
    var v = null; tl.events.forEach(function (e) { if (e[kind] !== undefined && e.rt <= r) v = { v: e[kind], rt: e.rt }; }); return v;
  }
  // opts.bare: lồng vào phim (không viền tối, không tiêu đề)
  function overlaySvg(tl, r, opts) {
    var s = '', bare = opts && opts.bare;
    var g = stateAt(tl, r, 'grade'), GR = { cool: ['#3a6db0', 0.22], warm: ['#ff9a3c', 0.16], dark: ['#10131c', 0.35], gold: ['#ffd66b', 0.18] };
    if (g && GR[g.v]) s += '<rect width="' + SW + '" height="' + SH + '" fill="' + GR[g.v][0] + '" opacity="' + (GR[g.v][1] * Math.min(1, (r - g.rt) / 0.25)).toFixed(3) + '" style="mix-blend-mode:multiply"/>';
    tl.events.forEach(function (e) {
      if (!e.lines || r < e.rt || r > e.rt + e.lines) return;
      var fr = Math.floor(r * 30), q = (r - e.rt) / e.lines, op = Math.min(1, q * 6, (1 - q) * 6);
      for (var i = 0; i < 26; i++) {
        var a = rnd(fr * 31 + i) * Math.PI * 2, r0 = 150 + rnd(fr + i * 7) * 60, r1 = 340, cx = SW / 2, cy = SH / 2;
        if (e.style === 'h') { var yy = rnd(fr * 13 + i) * SH, xx = rnd(fr * 7 + i) * SW; s += '<line x1="' + f1(xx) + '" y1="' + f1(yy) + '" x2="' + f1(xx + 120 + rnd(i) * 160) + '" y2="' + f1(yy) + '" stroke="#ffffff" stroke-width="' + f1(1 + rnd(i * 3) * 2.5) + '" opacity="' + (0.55 * op).toFixed(3) + '"/>'; continue; }
        s += '<line x1="' + f1(cx + Math.cos(a) * r0) + '" y1="' + f1(cy + Math.sin(a) * r0 * 0.6) + '" x2="' + f1(cx + Math.cos(a) * r1 * 1.4) + '" y2="' + f1(cy + Math.sin(a) * r1) + '" stroke="#ffffff" stroke-width="' + f1(1.2 + rnd(i * 5 + fr) * 2.6) + '" opacity="' + (0.6 * op).toFixed(3) + '"/>';
      }
    });
    if (!bare) s += '<rect width="' + SW + '" height="' + SH + '" fill="url(#gcc-vig)"/>';
    // khung điện ảnh: tắt chỉ co lại khi trước đó đang bật (sự kiện "tắt" đứng một mình không làm dải đen chớp ra)
    var lbs = tl.events.filter(function (e) { return e.letterbox !== undefined && e.rt <= r; }), lb = lbs[lbs.length - 1], wasOn = lbs.length > 1 && lbs[lbs.length - 2].letterbox;
    var lbv = lb ? (lb.letterbox ? Math.min(1, (r - lb.rt) / 0.4) : wasOn ? Math.max(0, 1 - (r - lb.rt) / 0.4) : 0) : 0;
    if (lbv > 0) { var hb = (36 * lbv).toFixed(1); s += '<rect width="' + SW + '" height="' + hb + '" fill="#000"/><rect y="' + (SH - hb) + '" width="' + SW + '" height="' + hb + '" fill="#000"/>'; }
    tl.events.forEach(function (e) { if (e.flash && r >= e.rt && r < e.rt + 0.18) s += '<rect width="' + SW + '" height="' + SH + '" fill="' + esc(e.flashColor || '#fff') + '" opacity="' + (e.flash * (1 - (r - e.rt) / 0.18)).toFixed(3) + '"/>'; });
    var ttl = !bare && tl.events.filter(function (e) { return e.title && r >= e.rt && r < e.rt + (e.hold || 2.5); })[0];
    if (ttl) {
      var qa = Math.min(1, (r - ttl.rt) / 0.3);
      s += '<g opacity="' + qa.toFixed(3) + '"><rect x="0" y="' + (SH - 100) + '" width="' + SW + '" height="70" fill="url(#gcc-band)"/><text x="' + SW / 2 + '" y="' + (SH - 64) + '" text-anchor="middle" font-family="Georgia, serif" font-size="30" font-weight="700" fill="#fff8e6" stroke="#2b211d" stroke-width="5" paint-order="stroke">' + esc(ttl.title) + '</text>' +
        (ttl.sub ? '<text x="' + SW / 2 + '" y="' + (SH - 42) + '" text-anchor="middle" font-family="Georgia, serif" font-size="13" fill="#fff8e6" stroke="#2b211d" stroke-width="3" paint-order="stroke">' + esc(ttl.sub) + '</text>' : '') + '</g>';
    }
    return s;
  }
  var DEFS = '<defs><radialGradient id="gcc-vig" cx="50%" cy="50%" r="75%"><stop offset="60%" stop-color="#000" stop-opacity="0"/><stop offset="100%" stop-color="#000" stop-opacity="0.38"/></radialGradient>' +
    '<linearGradient id="gcc-band" x1="0" x2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset=".5" stop-color="#000" stop-opacity=".5"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient></defs>';
  // bóng mờ (afterimage) khi lướt: vẽ lại diễn viên ở các thời điểm trước, mờ dần
  function ghostsSvg(tl, r, s, asSvg) {
    var out = '', live = 0;
    tl.events.forEach(function (e) {
      if (!e.ghosts || r < e.rt || r > e.rt + e.ghosts || live >= 2) return;   // ≤ 2 vệt bóng mờ một khung (mỗi vệt = 3 bản vẽ diễn viên)
      live++;
      [0.05, 0.1, 0.15].forEach(function (d, i) { var F = finalAt(tl, Math.max(0, s - d), e.a); out += asSvg(F, ' opacity="' + (0.34 - i * 0.1).toFixed(2) + '"'); });
    });
    return out;
  }
  // mọi diễn viên ở giờ truyện s, xếp theo chiều sâu (hàng sau vẽ trước); cùng hàng: người đang ra đòn vẽ sau cùng
  function allAt(tl, s) {
    return (tl.actors || [tl]).map(function (A, i) { return finalAt(tl, s, i); }).sort(function (p, q) { return p.G - q.G || (q.ai === 0) - (p.ai === 0); });
  }
  // một khung hình hoàn chỉnh (Node / xuất ảnh / kiểm thử): r = giây thật
  function frameSVG(tl, r, opts) {
    opts = opts || {};
    var c = camAt(tl, r), s = c.s, Fs = allAt(tl, s), A = sceneArt(tl);
    var w = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + SW + ' ' + SH + '"' + (opts.size ? ' width="' + opts.size + '" height="' + Math.round(opts.size * SH / SW) + '"' : '') + ' style="background:#000">' + DEFS;
    w += '<g transform="' + layerTf(c, PARALLAX.sky) + '">' + A.sky + '</g><g transform="' + layerTf(c, PARALLAX.far) + '">' + A.far + '</g><g transform="' + layerTf(c, PARALLAX.mid) + '">' + A.mid + '</g>';
    w += '<g transform="' + layerTf(c, 1) + '">' + A.ground + Fs.map(function (F) { return shadowSvg(tl, F); }).join('') + ghostsSvg(tl, r, s, function (G2, ex) { return actorSvg(tl, G2, ex); }) +
      Fs.map(function (F) { return actorSvg(tl, F); }).join('') + fxSvg(tl, r, s) + '</g>';
    w += '<g transform="' + layerTf(c, PARALLAX.front) + '">' + A.front + '</g>' + A.weather + A.tint + overlaySvg(tl, r);
    return w + '</svg>';
  }

  /* ------------------------------------- 6b. XUẤT HOẠT ẢNH (asset, v0.16 — Q9) */
  // Một hành động → hoạt ảnh dùng ở nơi khác (game, web, chat): khung CỐ ĐỊNH ôm trọn mọi tư thế + hiệu ứng (không máy quay,
  // không cảnh, nền trong suốt) → các khung SVG + sprite sheet + metadata timeline. Thuần dữ liệu: Node (MCP) và trình duyệt (Studio).
  // spec: { asset, action, partner?, react?, k? } — đòn đánh không có partner thì đánh một ma-nơ-canh khung
  function actionTimeline(spec) {
    var A = spec && spec.asset, AC = GC.choreo.ACTIONS || {}, act = A && Object.prototype.hasOwnProperty.call(AC, spec.action) ? AC[spec.action] : null, k = spec.k || 0.8;
    if (!A) throw new Error('choreo: ' + N_('thiếu nhân vật'));
    if (!act) throw new Error('choreo: ' + N_('không có hành động "{ref}" (xem list_actions)', { ref: spec.action }));
    if (!act.attack) return solo({ a: { asset: A, x: 320, y: 330, k: k }, action: spec.action, dir: 1 });
    var B = spec.partner || GC.ASSETS['gen.khung/ma-no-canh'] || A;
    return duel({ a: { asset: A, x: 240, y: 330, k: k }, b: { asset: B, x: act.ranged ? 540 : 420, y: 330, k: k }, action: spec.action, react: spec.react || 'hit' });
  }
  // khung ôm: lấy mẫu 30 lần / giây mọi điểm của mọi diễn viên (đầu, chân, tay, mũi binh khí) + vị trí hiệu ứng, chừa nửa đầu
  function animBox(tl) {
    var x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, K = 0.8;
    var add = function (p, pad) { if (!p || !isFinite(p[0]) || !isFinite(p[1])) return; x0 = Math.min(x0, p[0] - pad); x1 = Math.max(x1, p[0] + pad); y0 = Math.min(y0, p[1] - pad); y1 = Math.max(y1, p[1] + pad); };
    (tl.actors || [tl]).forEach(function (A, ai) {
      K = Math.max(K, A.K);
      for (var s = 0; s <= tl.T + 1e-9; s += 1 / 30) {
        add(pointAt(tl, s, 'head', ai), 58 * A.K); add(pointAt(tl, s, 'feet', ai), 12 * A.K);
        ['hand', 'handL', 'foot', 'tip'].forEach(function (w) { add(pointAt(tl, s, w, ai), 10 * A.K); });
      }
    });
    tl.events.forEach(function (e) { if (e.fx && isFinite(e.x) && isFinite(e.y)) add([e.x, e.y], e.fx === 'text' ? 40 : 28); if (isFinite(e.x0)) add([e.x0, e.y0], 12); });
    var pad = 8 * K;
    return { x: Math.floor(x0 - pad), y: Math.floor(y0 - pad), w: Math.ceil(x1 - x0 + 2 * pad), h: Math.ceil(y1 - y0 + 2 * pad) };
  }
  // một khung hoạt ảnh (r = giây thật) trong khung ôm cố định; opts: { size: cạnh dài px, fx: false bỏ hiệu ứng, shadow: false }
  function animFrame(tl, r, box, opts) {
    opts = opts || {};
    var s = realToStory(tl, r), Fs = allAt(tl, s), sc = opts.size ? opts.size / Math.max(box.w, box.h) : 1;
    var w = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + box.x + ' ' + box.y + ' ' + box.w + ' ' + box.h + '"' + (opts.size ? ' width="' + Math.round(box.w * sc) + '" height="' + Math.round(box.h * sc) + '"' : '') + '>';
    if (opts.shadow !== false) w += Fs.map(function (F) { return shadowSvg(tl, F); }).join('');
    w += ghostsSvg(tl, r, s, function (G2, ex) { return actorSvg(tl, G2, ex); }) + Fs.map(function (F) { return actorSvg(tl, F); }).join('');
    if (opts.fx !== false) w += fxSvg(tl, r, s);
    return w + '</svg>';
  }
  // trọn hoạt ảnh: { fps, frames: [{ t, svg }], box, duration, impact, meta } — fps 4…30, tối đa maxFrames (≤ 120) khung.
  // Đòn dài hơn trần khung thì TỰ HẠ fps cho khung phủ trọn đòn (review: trước đây cắt cụt lặng lẽ); dài đến mức 4 fps vẫn không đủ → meta.truncated
  function animate(tl, opts) {
    opts = opts || {};
    var want = Math.max(4, Math.min(30, Math.round(+opts.fps || 12))), cap = Math.max(2, Math.min(120, Math.floor(+opts.maxFrames || 120)));
    var fps = Math.max(4, Math.min(want, Math.floor((cap - 1) / Math.max(tl.real, 1e-6))));
    var n = Math.min(cap, Math.max(2, Math.ceil(tl.real * fps) + 1)), box = animBox(tl), frames = [];
    for (var i = 0; i < n; i++) { var r = Math.min(tl.real, i / fps); frames.push({ t: +r.toFixed(3), svg: animFrame(tl, r, box, opts) }); }
    var d = tl.duel || {};
    return { fps: fps, frames: frames, box: box, duration: +tl.real.toFixed(3),
      meta: { format: 'gen-chibi.anim/1', action: d.action || null, react: d.react || null, fps: fps, requestedFps: want, frameCount: n, duration: +tl.real.toFixed(3),
        truncated: (n - 1) / fps < tl.real - 1e-6,
        impact: d.impact != null ? +storyToReal(tl, d.impact).toFixed(3) : null, impactFrame: d.impact != null ? Math.round(storyToReal(tl, d.impact) * fps) : null,
        box: box, segments: (tl.actors || [tl]).map(function (A, ai) { return A.segments.map(function (g) { return { actor: ai, clip: g.id, label: g.label, t0: +storyToReal(tl, g.t0).toFixed(3), t1: +storyToReal(tl, g.t1).toFixed(3) }; }); }) } };
  }
  // sprite sheet VECTƠ: mọi khung xếp lưới trong một SVG (cols cột, ô cell px) — Studio raster ra PNG; agent dùng thẳng hoặc tự raster
  function sheetSVG(anim, opts) {
    opts = opts || {};
    var n = anim.frames.length, cols = Math.max(1, Math.min(n, Math.floor(+opts.cols) || Math.ceil(Math.sqrt(n)))), rows = Math.ceil(n / cols), b = anim.box;
    var cw = Math.max(16, Math.min(1024, Math.round(+opts.cell) || 160)), ch = Math.max(1, Math.round(cw * b.h / b.w)), out = '<svg xmlns="http://www.w3.org/2000/svg" width="' + cols * cw + '" height="' + rows * ch + '" viewBox="0 0 ' + cols * cw + ' ' + rows * ch + '">';
    anim.frames.forEach(function (f, i) {
      var m = /^<svg[^>]*?viewBox="([^"]*)"[^>]*>/.exec(f.svg); if (!m) return;
      var pre = 'f' + i + '-', body = f.svg.slice(m[0].length).replace(/\bid="([^"]+)"/g, 'id="' + pre + '$1"').replace(/url\(#([^)]+)\)/g, 'url(#' + pre + '$1)').replace(/href="#([^"]+)"/g, 'href="#' + pre + '$1"');
      out += '<svg x="' + (i % cols) * cw + '" y="' + Math.floor(i / cols) * ch + '" width="' + cw + '" height="' + ch + '" viewBox="' + m[1] + '">' + body;
    });
    return { svg: out + '</svg>', cols: cols, rows: rows, cell: { w: cw, h: ch } };
  }

  /* --------------------------------------------------------- 7. BỘ PHÁT (DOM) */
  function player(box, tl, opts) {
    opts = opts || {};
    var NS = 'http://www.w3.org/2000/svg', A = GC.audio, A0 = sceneArt(tl);
    if (GC.render && GC.render.injectCSS) GC.render.injectCSS();
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + SW + ' ' + SH); svg.setAttribute('class', 'gcc-stage'); svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', tl.title || 'Biên đạo');
    svg.innerHTML = DEFS + '<g data-p="sky">' + A0.sky + '</g><g data-p="far">' + A0.far + '</g><g data-p="mid">' + A0.mid + '</g>' +
      '<g data-p="ground">' + A0.ground + '<g class="gcc-shs"></g><g class="gcc-ghosts"></g><g class="gcc-actors"></g><g class="gcc-fx"></g></g>' +
      '<g data-p="front">' + A0.front + '</g>' + A0.weather + A0.tint + '<g class="gcc-ov"></g>';
    box.appendChild(svg);
    var P = {}; Array.prototype.forEach.call(svg.querySelectorAll('[data-p]'), function (g) { P[g.getAttribute('data-p')] = g; });
    var fxG = svg.querySelector('.gcc-fx'), ov = svg.querySelector('.gcc-ov'), gh = svg.querySelector('.gcc-ghosts');
    // mỗi diễn viên: một nhóm lớp vẽ (đổi nội dung khi nét mặt / góc nhìn đổi) + một bóng đổ
    var cast = (tl.actors || [tl]).map(function () {
      var g = document.createElementNS(NS, 'g'), sh = document.createElementNS(NS, 'ellipse'), groups = {};
      g.setAttribute('class', 'gc-full');
      GC.RIG.layers.forEach(function (l) { var q = document.createElementNS(NS, 'g'); g.appendChild(q); groups[l[0]] = q; });
      svg.querySelector('.gcc-actors').appendChild(g); svg.querySelector('.gcc-shs').appendChild(sh);
      return { g: g, sh: sh, groups: groups, sig: null };
    });
    var r = 0, playing = false, last = 0, raf = 0, fired = {}, hold = 0;
    function paint() {
      var c = camAt(tl, r), Fs = allAt(tl, c.s), F = Fs.filter(function (x) { return x.ai === 0; })[0];
      ['sky', 'far', 'mid', 'front'].forEach(function (k) { P[k].setAttribute('transform', layerTf(c, PARALLAX[k])); });
      P.ground.setAttribute('transform', layerTf(c, 1));
      Fs.forEach(function (G2, z) {
        var C2 = cast[G2.ai];
        if (C2.g.parentNode.childNodes[z] !== C2.g) C2.g.parentNode.insertBefore(C2.g, C2.g.parentNode.childNodes[z] || null);   // thứ tự vẽ theo chiều sâu
        if (G2.sig !== C2.sig) { C2.sig = G2.sig; GC.RIG.layers.forEach(function (l) { C2.groups[l[0]].innerHTML = G2.layers[l[0]] || ''; }); }
        var chain = GC.chainTransforms(G2.pose);
        GC.RIG.layers.forEach(function (l) { C2.groups[l[0]].setAttribute('transform', chain[l[1]]); });
        C2.g.setAttribute('transform', 'translate(' + f1(G2.x - 100 * G2.K) + ' ' + f1(G2.G - 228 * G2.K) + ') scale(' + G2.K + ')');
        var lift = Math.max(0, -G2.pose.root.y), k = Math.max(0.3, 1 - lift / 110);
        C2.sh.setAttribute('cx', f1(G2.x)); C2.sh.setAttribute('cy', f1(G2.G + 1)); C2.sh.setAttribute('rx', f1(44 * G2.K * k)); C2.sh.setAttribute('ry', f1(7 * G2.K * k)); C2.sh.setAttribute('fill', 'rgba(20,24,22,' + (0.2 * k).toFixed(3) + ')');
      });
      gh.innerHTML = ghostsSvg(tl, r, c.s, function (G2, ex) { return actorSvg(tl, G2, ex); });
      fxG.innerHTML = fxSvg(tl, r, c.s);
      ov.innerHTML = overlaySvg(tl, r);
      if (opts.onTick) opts.onTick(r, F.seg);
    }
    function sound(r0, r1) {
      if (!A || r1 < r0) return;
      tl.events.forEach(function (e) {
        if (fired[e.i] || e.rt < r0 || e.rt > r1) return;
        fired[e.i] = 1;
        var pan = Math.max(-0.8, Math.min(0.8, (e.x != null ? e.x : xAt(actorOf(tl, e.a), e.t)) / tl.W * 2 - 1));
        if (e.sfx) [].concat(e.sfx).forEach(function (n, i) { A.sfx(n, { gain: e.gain != null ? e.gain : 0.8, pan: pan }); });
        if (e.music !== undefined) A.music(e.music);
        if (e.ambient !== undefined) A.ambient(e.ambient);
      });
    }
    function loop(now) {
      if (!playing) return;
      var dt = last ? Math.min(0.1, (now - last) / 1000) : 0; last = now;
      if (hold > 0) { hold -= dt; if (hold <= 0) { r = 0; fired = {}; } }
      else {
        var r0 = r; r = Math.min(tl.real, r + dt);
        sound(r0, r);
        if (r >= tl.real) { if (opts.loop) hold = 1.6; else { playing = false; if (opts.onEnd) opts.onEnd(); } }
      }
      paint();
      raf = requestAnimationFrame(loop);
    }
    paint();
    return {
      el: svg, duration: tl.real,
      play: function () { if (playing) return; if (A && A.unlock) A.unlock(); if (r >= tl.real) { r = 0; fired = {}; } playing = true; last = 0; raf = requestAnimationFrame(loop); },
      pause: function () { playing = false; cancelAnimationFrame(raf); if (A) A.stopAll(); },
      seek: function (t) { r = Math.max(0, Math.min(tl.real, t)); fired = {}; tl.events.forEach(function (e) { if (e.rt < r) fired[e.i] = 1; }); paint(); },
      get time() { return r; }, get playing() { return playing; },
      destroy: function () { playing = false; cancelAnimationFrame(raf); if (A) A.stopAll(); svg.remove(); }
    };
  }

  /* ------------------------------------------------------ 8. ĐO (test / trang demo) */
  // độ mượt: mỗi khung thật (fps), điểm mốc cơ thể dịch bao nhiêu đơn vị thế giới. Khung đổi góc nhìn (bản vẽ đổi) đo riêng,
  // so khớp cả khi trái ↔ phải đổi nhãn do lật gương. Đa dạng: "dáng đỉnh" (xa tư thế đứng nhất) của mỗi hành vi so từng cặp.
  function measure(tl, fps) {
    fps = fps || 60;
    var sw = function (k) { return /L$/.test(k) ? k.replace(/L$/, 'R') : /R$/.test(k) ? k.replace(/R$/, 'L') : k; };
    var at = function (r) {
      var s = realToStory(tl, r), F = finalAt(tl, s), kp = GC.keyPoints(F.pose), o = {};
      for (var k in kp) o[k] = [F.x + (kp[k][0] - 100) * tl.K, tl.G + (kp[k][1] - 228) * tl.K];
      return { o: o, F: F };
    };
    var jump = function (a, b, swap) { var m = 0; for (var k in b.o) { var q = a.o[swap ? sw(k) : k]; m = Math.max(m, Math.hypot(b.o[k][0] - q[0], b.o[k][1] - q[1])); } return m; };
    var prev = at(0), moves = [], turns = [], maxAt = 0, maxMove = 0;
    for (var f = 1; f <= Math.ceil(tl.real * fps); f++) {
      var r = Math.min(tl.real, f / fps), cur = at(r);
      if (cur.F.view !== prev.F.view) turns.push(Math.min(jump(prev, cur, false), jump(prev, cur, true)));
      else { var m = jump(prev, cur, false); moves.push(m); if (m > maxMove) { maxMove = m; maxAt = r; } }
      prev = cur;
    }
    var sorted = moves.slice().sort(function (a, b) { return a - b; }), pct = function (q) { return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] || 0; };
    var standKP = GC.keyPoints(GC.neutralPose()), peaks = tl.segments.map(function (sg) {
      var best = null, bd = -1;
      tl.keys.forEach(function (k) { if (k.t <= sg.t0 || k.t > sg.t1) return; var P = finalAt(tl, k.t).pose, kp = GC.keyPoints(P), d = 0, n = 0; for (var q in kp) { d += Math.hypot(kp[q][0] - standKP[q][0], kp[q][1] - standKP[q][1]); n++; } d /= n; if (d > bd) { bd = d; best = P; } });
      return { id: sg.id, pose: best, d: bd };
    });
    var minPair = Infinity, pairAt = '', sum = 0, np = 0;
    for (var i = 0; i < peaks.length; i++) for (var j = i + 1; j < peaks.length; j++) {
      var d = GC.poseDistance(peaks[i].pose, peaks[j].pose); sum += d; np++;
      if (d < minPair) { minPair = d; pairAt = peaks[i].id + '↔' + peaks[j].id; }
    }
    var ids = tl.segments.map(function (s) { return s.id; });
    var slow = 0, fast = 0;
    for (var t = 0; t < tl.T; t += 0.05) { var rr = (storyToReal(tl, t + 0.05) - storyToReal(tl, t)) / 0.05; if (rr > 1.5) slow += 0.05; else if (rr < 0.8) fast += 0.05; }
    return {
      real: tl.real, story: tl.T, behaviors: ids.length, unique: ids.filter(function (x, i) { return ids.indexOf(x) === i; }).length,
      keys: tl.keys.length, frames: moves.length + turns.length, fps: fps,
      move: { p50: pct(0.5), p90: pct(0.9), p99: pct(0.99), max: maxMove, maxAt: maxAt },
      turns: { n: turns.length, max: turns.length ? Math.max.apply(null, turns) : 0 },
      variety: { minPair: minPair, minPairAt: pairAt, meanPair: np ? sum / np : 0, minPeak: Math.min.apply(null, peaks.map(function (p) { return p.d; })) },
      time: { slowmo: +slow.toFixed(2), fast: +fast.toFixed(2), hitstops: tl.events.filter(function (e) { return e.hitstop; }).length },
      sfx: tl.events.filter(function (e) { return e.sfx; }).length, fx: tl.events.filter(function (e) { return e.fx || e.lines || e.ghosts; }).length,
      faces: tl.faces.length, views: tl.keys.map(function (k) { return k.view; }).filter(function (v, i, a) { return a.indexOf(v) === i; }).length
    };
  }

  GC.choreo = {
    HZ: HZ, EASE: EASE, POSES: POSES, CLIPS: CLIPS, ORDER: ORDER, SPRINGS: SPRINGS,
    pose: pose, clip: clip, resolve: resolve, resolveIn: resolveIn, swapLR: swapLR, mix: mix, about: about,
    build: build, duel: duel, solo: solo, impacts: impacts, finalAt: finalAt, allAt: allAt, pointAt: pointAt, weaponOf: weaponOf, fxSvg: fxSvg, overlaySvg: overlaySvg, storyToReal: storyToReal, realToStory: realToStory, camAt: camAt,
    frameSVG: frameSVG, player: player, measure: measure, demos: {}, ACTIONS: {}, REACTS: {},
    MOTION: MOTION, FRAME_PACK: FRAME_PACK, PACKS: PACKS, packs: function () { return PACK_ORDER.map(function (k) { return PACKS[k]; }); },
    checkPack: checkPack, registerPack: registerPack, unregisterPack: unregisterPack, ACTION_ALIASES: ALIASES, aliasAction: aliasAction, actionId: actionId, migrateWork: migrateWork, hasWeapon: hasWeapon, canDo: canDo, actionsFor: actionsFor,
    actionTimeline: actionTimeline, animBox: animBox, animFrame: animFrame, animate: animate, sheetSVG: sheetSVG
  };
})(typeof window !== 'undefined' ? window.GenChibi : globalThis.GenChibi);
