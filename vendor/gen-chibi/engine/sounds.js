/* gen-chibi engine — sounds 0.1: THƯ VIỆN ÂM THANH — gói âm dạng dữ liệu (gen-chibi.sound/1), cổng kiểm, sổ đăng ký,
 * bộ âm chuẩn "gen.am" (khung), luật ghép S1–S7, tự gán âm theo cảnh, công thức ghép mẫu.
 * © 2026 Gen Labs — All rights reserved.
 *
 * Âm là ASSET như gói động tác (v0.16): một âm = công thức các LỚP tổng hợp + siêu dữ liệu (nhãn, nhóm, thẻ, "dùng khi", cảnh tự gán).
 * engine/audio.js THÔNG DỊCH công thức bằng Web Audio. Gói không chứa mã, không tệp mẫu: chỉ số + chuỗi trong danh sách cho phép
 * (gói đến từ agent / người lạ — đây là ranh giới tin cậy: không eval, không Function, khoá lạ là lỗi chứ không lặng lẽ bỏ).
 *
 * Phong cách bộ chuẩn (v0.18, Ryan: "khoa trương như trong phim hoạt hình"): mỗi âm là một "nhân vật" — cao độ trượt lớn (1–2 quãng
 * tám), có nốt nhạc rõ, đuôi rung / lắc, phóng đại hơn đời thực, hơi "đồ chơi", đọc được ý ngay (BONK, BOING, ZIP, WHAM, SPLAT, TA-DA).
 * Hai nhịp: đà → va (cú lớn có lấy đà). Vẫn sạch: không vỡ (bus trộn + limiter của audio.js), không chói kéo dài trên 4 kHz, độ to đều
 * (level hiệu chuẩn bằng tools/audio-lab.mjs calibrate), không đè lời thoại (duck có sẵn + luật S3).
 *
 * Một nguồn cho mọi nơi: bộ phát (cueFor thay bảng cứng SFX_STATE / SFX_FX / SFX_ACT), Studio (list theo nhóm, ▶, "dùng khi"),
 * agent (spec / guide), lint kịch bản (lintSoundTrack). DOM-free: chạy trong trình duyệt, trong vm của server, require() từ Node.
 *
 *   validateSoundPack(pack, {frame}) → { errors, def }      cổng kiểm; def = bản CHUẨN HOÁ dựng lại từ đầu (không giữ khoá lạ)
 *   registerPack(pack) → { errors, def } · unregisterPack(id) · packs() · pack(id)    tên âm là không gian tên CHUNG (trùng → lỗi chỉ ra gói)
 *   get(name) → âm (chỉ đọc) · has(name) · names({project}) · list({cat, tag, q, project}) · info(name)
 *   refsOf({shots, motionPacks}) → mọi chỗ gọi tên âm · bundleDeps({shots, motionPacks}) → { names, packs, missing }: gói âm cần đi theo khi đóng gói (sao lưu / gói bán / phim xuất)
 *   allowedSounds({work, cast, project, shot, scene}) → [tên…] âm dùng được: MỘT hàm cho lược đồ / lời nhắc đạo diễn, Bảng bước, S6 và bộ phát · projectFor(…) → dự án quyết
 *   cueFor({state, fx, activity, event, mood, project, max}) → [tên…] ≤ 2: tự gán âm cho một bước (gói dự án > gói chung > khung)
 *   cueTable({project, mood}) → { state: {…}, fx: {…}, activity: {…}, event: {…} } — bảng tương thích để bộ phát thay bảng cứng
 *   lintSoundTrack(steps | shot | work, {project, mood, auto}) → [{ code: 'S1'…'S7', level: 'error'|'warn', path, step, name, msg }]
 *                                     mood: chuỗi | hàm (steps) → chuỗi (GC.film.moodOf) — không khí để tính âm tự gán; auto: false = không tính âm tự gán
 *   RULES · RECIPES · CATS · VOCAB · INST · nodesOf(sound) · spec() · guide({project}) · EXAMPLE
 *
 * Cho Studio (trình duyệt: nạp engine/sounds.js + engine/audio.js; server nạp qua server/engine-node.js):
 *   danh sách ........ GC.sounds.list({ cat, tag, q, project }) → [{ name, label, cat, catLabel, tags, use, dur, accent, cue, pack, project… }] · info(name) · packs() · CATS · RECIPES
 *   ▶ nghe ........... GC.audio.sfx(name, { gain, pan, delay }) — cần GC.audio.unlock() trong cú bấm; nghe công thức ghép: lặp sfx(tên, { delay: giây }) theo RECIPES[i].seq
 *   tải WAV .......... GC.audio.renderWav(tên | danh sách, { sampleRate, volume, tail, seed }) → Promise<ArrayBuffer> (WAV 16-bit stereo, dựng offline, không cần unlock)
 *   gói của người dùng  GET /api/sound-packs → registerPack(gói) lúc mở Studio (TRƯỚC gói động tác) · POST /api/sound-packs { pack, note } lưu qua cổng · pack(id) = JSON tải về
 *   chấm luật ........ lintSoundTrack(steps | { event } | { shots }, { project, mood: GC.film.moodOf }) — cùng bộ luật save_shot / save_work chạy ở server
 */
(function (GC) {
  'use strict';
  var hasOwn = function (o, k) { return o != null && Object.prototype.hasOwnProperty.call(o, k); };
  // NGÔN NGỮ (ADR 0007): câu engine sinh vẫn TIẾNG VIỆT (msgid). N_(msgid, vars): đánh dấu msgid (tools/i18n-scan.mjs) + điền {biến} — KHÔNG dịch;
  // Studio / server dịch ở chỗ hiển thị (t(msgid, vars) hoặc khớp ngược mẫu — engine/i18n-msg.js)
  function N_(id, vars) { return !vars ? id : id.replace(/\{([A-Za-z0-9_]+)\}/g, function (m, k) { return hasOwn(vars, k) ? String(vars[k]) : m; }); }
  var FORMAT = 'gen-chibi.sound/1', FRAME = 'gen.am';

  /* --------------------------------------------------------------- từ vựng */
  // nhóm âm theo thứ tự hiện (Studio, guide, list). "nhấn" (accent) = nhóm thu hút sự chú ý — mỗi bước tối đa một (S1)
  var CATS = [
    ['danh', 'Va chạm & đánh'], ['di-chuyen', 'Di chuyển'], ['hai', 'Hài hước'], ['cam-xuc', 'Cảm xúc & nhấn'],
    ['phep', 'Phép & năng lượng'], ['tu-nhien', 'Thiên nhiên'], ['do-vat', 'Đồ vật & chuông'], ['nhac-cu', 'Nhạc cụ hiệu ứng']
  ];
  var CAT_LABEL = {}; CATS.forEach(function (c) { CAT_LABEL[c[0]] = c[1]; });
  var ACCENT = ['cam-xuc', 'nhac-cu'];
  // khoá của "cue" (cảnh tự gán) — trùng từ vựng kịch bản của engine/core.js (test 2m so khớp, lệch là lỗi)
  var VOCAB = {
    state: ['normal', 'work', 'think', 'unsure', 'smug', 'greedy', 'proud', 'vow', 'beg', 'shock', 'panic', 'rage', 'dizzy', 'cry', 'injured', 'exhausted', 'lazy', 'sleep'],
    fx: ['tears', 'sweat', 'sweatMany', 'vein', 'blush', 'gloomLines', 'gloom', 'coins', 'sparkles', 'fire', 'aura', 'speed', 'steam', 'zzz', 'snot', 'gum', 'dots', 'exclaim',
      'question', 'stars', 'bandage', 'crown', 'confetti', 'soul', 'dust', 'speedLines', 'wind', 'splash', 'tremble'],
    activity: ['stand', 'sit-chair', 'sit-floor', 'kneel', 'squat', 'lie', 'walk', 'run', 'sneak', 'jump', 'crawl', 'fly', 'swim', 'flee', 'eat', 'drink', 'sleep', 'study', 'write',
      'attack', 'thrust', 'defend', 'charge', 'victory', 'scared', 'faint', 'bow', 'salute', 'kowtow', 'wave', 'point', 'cheer'],
    event: ['impact', 'miss', 'block', 'enter', 'exit', 'cut'],      // sự kiện của bộ phát / biên đạo: trúng đòn · hụt · đỡ · ra sân · rời sân · chuyển máy
    mood: ['calm', 'tense', 'epic', 'comic', 'sad']                   // ĐIỀU KIỆN (không phải tác nhân): âm chỉ được gán khi không khí cảnh khớp
  };
  var TRIGGERS = ['state', 'fx', 'activity', 'event'];
  // 17 tên của âm thanh v0.17 — từ vựng công khai (gói động tác, kịch bản, đạo diễn đang dùng): không đổi, không xoá
  var LEGACY = ['pop', 'whoosh', 'step', 'sting', 'hit', 'boing', 'sparkle', 'rumble', 'drip', 'sad', 'snore', 'party', 'hmm', 'gong', 'chime', 'swish', 'tick'];

  // nhạc cụ gõ "mallet": các phần [tỉ số tần số, biên độ, hệ số thời tắt] (vật thật có hài KHÔNG nguyên, hài cao tắt nhanh hơn)
  var INST = {
    xylo: [[1, 1, 1], [3.93, 0.28, 0.32], [9.2, 0.09, 0.12]],          // mộc cầm (thanh gỗ cứng): sáng, gõ "tóc"
    marimba: [[1, 1, 1], [3.99, 0.18, 0.35], [10, 0.04, 0.1]],          // marimba: tròn, ấm
    glock: [[1, 1, 1], [2.76, 0.32, 0.4], [5.4, 0.1, 0.18]],            // chuông thanh kim loại (glockenspiel)
    wood: [[1, 1, 1], [2.37, 0.45, 0.55]],                              // mõ / gáo dừa / gõ gỗ
    pizz: [[1, 1, 1], [2, 0.42, 0.6], [3, 0.16, 0.4]],                  // dây gảy pizzicato (hài nguyên)
    harp: [[1, 1, 1], [2, 0.24, 0.5]],                                  // đàn hạc: tròn, ngân
    bell: [[1, 1, 1], [2, 0.3, 0.6], [2.76, 0.25, 0.45], [5.4, 0.08, 0.2]]   // chuông nhỏ
  };
  var WAVES = ['sine', 'triangle', 'square', 'sawtooth'], FILTERS = ['lowpass', 'highpass', 'bandpass', 'notch'], COLS = ['white', 'pink', 'brown'];
  var VFILTERS = ['lowpass', 'bandpass'];

  /* ------------------------------------------------- khuôn tham số của lớp */
  // khoảng số [min, max]; số có thể là hằng hoặc { v, r } = v + R·r (R ∈ [0,1) rút MỘT lần mỗi lần phát, dùng chung mọi lớp)
  var HZ = [20, 16000], QQ = [0.1, 30];
  var RANGE = {
    at: [0, 4], jit: [0, 0.2], dur: [0.003, 4], peak: [0, 1.5], a: [0, 3], hold: [0, 4],
    hz: HZ, to: HZ, lp: HZ, f0: HZ, f1: HZ, f2: HZ, nf: [100, 8000],
    glide: [0.01, 1], mid: [0.001, 4], q: QQ, q1: QQ, nq: QQ, sat: [1, 4], bias: [-0.5, 0.5], cents: [-2400, 2400],
    am: [0.1, 80], vib: [0.1, 40], vib1: [0.1, 40], vibc: [0, 2400], vibc1: [0, 2400], vibd: [0, 4], vibr: [0.001, 2],
    ratio: [0.05, 16], index: [0, 30], index1: [0, 30], det: [0, 100],
    n: [1, 64], span: [0.01, 4], len: [0.002, 0.5], skew: [0.2, 5],
    decay: [0.01, 6], poly: [1, 6], click: [0, 1.5], snare: [0, 1.5], ndur: [0.005, 2]
  };
  var INTS = { n: 1, poly: 1, lane: 1 };
  var VIBS = ['vib', 'vibc', 'vibc1', 'vib1', 'vibd', 'vibr'];
  var PITCH = ['hz', 'to', 'glide', 'path', 'curve'];
  // mỗi loại lớp: khoá được phép (ngoài k, at, jit, lane) · bắt buộc · khoá chuỗi (danh sách cho phép)
  var KINDS = {
    tone: { keys: ['type', 'dur', 'peak', 'a', 'hold', 'lp', 'q', 'am', 'sat', 'bias', 'cents'].concat(PITCH, VIBS), need: ['dur', 'peak'], en: { type: WAVES } },
    noise: { keys: ['col', 'type', 'f0', 'f1', 'mid', 'f2', 'q', 'q1', 'dur', 'peak', 'a', 'hold', 'sat', 'mv'], need: ['dur', 'peak'], en: { type: FILTERS, col: COLS } },
    crackle: { keys: ['n', 'span', 'len', 'type', 'f0', 'q', 'peak', 'skew'], need: ['n', 'span', 'len', 'f0', 'peak'], en: { type: FILTERS } },
    modes: { keys: ['hz', 'list', 'peak'], need: ['hz', 'list', 'peak'], en: {} },
    voice: { keys: ['type', 'ftype', 'hz', 'cut', 'amp', 'peak', 'q', 'det', 'sat'].concat(VIBS), need: ['hz', 'cut', 'amp', 'peak'], en: { type: WAVES, ftype: VFILTERS } },
    fm: { keys: ['type', 'mtype', 'dur', 'peak', 'a', 'hold', 'lp', 'q', 'sat', 'bias', 'cents', 'ratio', 'index', 'index1'].concat(PITCH, VIBS), need: ['hz', 'dur', 'peak'], en: { type: WAVES, mtype: WAVES } },
    mallet: { keys: ['inst', 'notes', 'decay', 'peak', 'a', 'poly', 'lp'], need: ['inst', 'notes', 'peak'], en: { inst: Object.keys(INST) } },
    drum: { keys: ['hz', 'to', 'glide', 'dur', 'peak', 'a', 'sat', 'bias', 'click', 'snare', 'nf', 'nq', 'ndur'], need: ['hz', 'dur', 'peak'], en: {} }
  };
  var SOUND_KEYS = ['label', 'cat', 'tags', 'use', 'cue', 'dur', 'level', 'rev', 'vary', 'lanes', 'layers', 'hitAt'];
  // khoá cấp gói: NỘI DUNG (giữ lại, kể cả license / owner / author — INT-02) + bản ghi của store (kind / savedAt / note… — chấp nhận rồi bỏ).
  // Khoá khác là LỖI có path chứ không lặng lẽ bỏ: "project_id" gõ nhầm sẽ thành gói dùng chung (CNS-100, CNS-108)
  var PACK_KEYS = ['format', 'id', 'name', 'description', 'project', 'version', 'status', 'license', 'owner', 'author', 'sounds'];
  var PACK_META = PACK_KEYS.concat(['kind', 'pack', 'key', 'savedAt', 'note', 'createdAt', 'updatedAt']);
  var RESERVED_IDS = ['constructor', 'prototype', '__proto__'];   // id gói trùng thuộc tính của Object (sổ đăng ký tra theo id) — CNS-112
  var BUDGET = { sounds: 64, layers: 24, nodes: 60, bytes: 200000, dur: 4, lanes: 6, path: 16, curve: 48, list: 12, points: 48, notes: 32, tags: 8 };
  var NAME_RE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/, PACK_RE = /^[a-z0-9][a-z0-9-]{1,39}$/, PROJ_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;
  var BAD_KEYS = { __proto__: 1, constructor: 1, prototype: 1 };

  function plainText(s, n) { return String(s == null ? '' : s).replace(/[<>&"`]/g, '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n); }
  function isNum(v) { return typeof v === 'number' && isFinite(v); }
  function numMax(v) { return v == null ? 0 : typeof v === 'number' ? v : v.v + Math.max(0, v.r); }

  /* ------------------------------------------------------------- ngân sách */
  // số node Web Audio một lớp dựng (đếm như mkFx / các nguyên hàm của engine/audio.js — test-audio so với số đếm thật)
  function vibN(L) { return L.vib ? 2 : 0; }
  var NODES = {
    tone: function (L) { return 2 + (L.sat ? 1 : 0) + (L.lp ? 1 : 0) + (L.am ? 3 : 0) + vibN(L); },
    noise: function (L) { return 3 + (L.sat ? 1 : 0) + (L.mv ? 1 : 0); },
    crackle: function () { return 3; },
    modes: function (L) { return 2 * L.list.length; },
    voice: function (L) { return 3 + (L.det ? 2 : 1) + (L.sat ? 1 : 0) + vibN(L); },
    fm: function (L) { return 4 + (L.sat ? 1 : 0) + (L.lp ? 1 : 0) + vibN(L); },
    mallet: function (L) { return 2 * Math.min(L.poly || 2, L.notes.length) * INST[L.inst].length + (L.lp ? 1 : 0); },
    drum: function (L) { return 2 + (L.sat ? 1 : 0) + (L.click ? 3 : 0) + (L.snare ? 3 : 0); }
  };
  // 3 = gain độ to + panner (khi người gọi đặt pan) + gửi vang — tính trường hợp xấu nhất
  function nodesOf(s) {
    var n = 3 + (s.lanes ? s.lanes.length : 0), i;
    for (i = 0; i < s.layers.length; i++) n += NODES[s.layers[i].k](s.layers[i]);
    return n;
  }
  // thời lượng tối đa của một lớp (giây, tính từ lúc lớp bắt đầu)
  function layerDur(L) {
    var k = L.k, i, m;
    if (k === 'crackle') return numMax(L.span) + numMax(L.len);
    if (k === 'modes') { m = 0; for (i = 0; i < L.list.length; i++) m = Math.max(m, L.list[i][2] + (L.list[i][3] || 0)); return m; }
    if (k === 'voice') return L.amp[L.amp.length - 1][0];
    if (k === 'mallet') { var P = INST[L.inst], dm = 0; for (i = 0; i < P.length; i++) dm = Math.max(dm, P[i][2]); return L.notes[L.notes.length - 1][0] + numMax(L.a) + numMax(L.decay == null ? 0.3 : L.decay) * dm; }
    if (k === 'drum') return Math.max(numMax(L.dur), L.click ? 0.012 : 0, L.snare ? numMax(L.ndur == null ? Math.min(numMax(L.dur), 0.2) : L.ndur) : 0);
    return numMax(L.dur);
  }

  /* -------------------------------------------------------------- cổng kiểm */
  function validateSoundPack(pack, opts) {
    opts = opts || {};
    var errs = [], E = function (m) { if (errs.length < 40) errs.push(m); };
    if (!pack || typeof pack !== 'object' || Array.isArray(pack)) return { errors: [N_('gói âm phải là object')], def: null };
    var size;
    try { size = JSON.stringify(pack).length; } catch (x) { return { errors: [N_('gói không phải JSON thuần')], def: null }; }
    if (size > BUDGET.bytes) return { errors: [N_('gói quá lớn (tối đa {n} KB)', { n: BUDGET.bytes / 1000 })], def: null };
    // không có mã: mọi giá trị phải là JSON thuần (hàm / symbol / bigint / getter đều là lỗi), không khoá nguy hiểm
    (function scan(v, p, depth) {
      if (depth > 8) { E(p + ': ' + N_('lồng quá sâu')); return; }
      var t = typeof v;
      if (t === 'function' || t === 'symbol' || t === 'bigint' || t === 'undefined') { E(p + ': ' + N_('chứa mã / kiểu không phải dữ liệu ({type}) — gói chỉ được có số + chuỗi', { type: t })); return; }
      if (v && t === 'object') Object.keys(v).forEach(function (k) {
        if (hasOwn(BAD_KEYS, k) || k === '__proto__') { E(p + '.' + k + ': ' + N_('tên khoá dành riêng của JavaScript')); return; }
        var d = Object.getOwnPropertyDescriptor(v, k);
        if (d && (d.get || d.set)) { E(p + '.' + k + ': ' + N_('getter / setter là mã — không cho phép')); return; }
        scan(v[k], p + '.' + k, depth + 1);
      });
    })(pack, 'pack', 0);
    if (errs.length) return { errors: errs, def: null };

    // opts.tolerant (lúc NẠP gói đã lưu từ trước — khởi động, mở Studio): lỗi "khoá lạ / chỉ một phần / cue của gói chung" hạ thành ghi chú + bỏ phần sai,
    // gói không rơi khỏi sổ; lúc LƯU (mặc định) vẫn là lỗi
    var notes = [], EL = opts.tolerant ? function (m) { notes.push(m); } : E;
    var d = { format: FORMAT, kind: 'sound' };
    Object.keys(pack).forEach(function (k) {
      if (k === 'partial') EL('pack.partial: ' + N_('đây là gói CHỈ CÓ MỘT PHẦN (get_sound_pack › names) — lưu sẽ làm gói co lại; lấy gói đầy đủ (không truyền names), sửa rồi lưu'));
      else if (PACK_META.indexOf(k) < 0) EL('pack.' + k.slice(0, 20) + ': ' + N_('khoá lạ ở cấp gói (được dùng: {ids})', { ids: PACK_KEYS.join(', ') }));
    });
    if (pack.format !== undefined && pack.format !== FORMAT) E('format: ' + N_('phải là "{code}"', { code: FORMAT }));
    var id = String(pack.id == null ? '' : pack.id);
    if (opts.frame) { if (id !== FRAME) E('id: ' + N_('gói khung phải là "{code}"', { code: FRAME })); }
    else if (!PACK_RE.test(id)) E('id: ' + (/^gen\./.test(id) ? N_('chữ thường, số, gạch nối, 2–40 ký tự (vd. "tam-quoc-am") — tiền tố "gen." dành cho gói khung') : N_('chữ thường, số, gạch nối, 2–40 ký tự (vd. "tam-quoc-am")')));
    else if (RESERVED_IDS.indexOf(id) >= 0 || id in Object.prototype) E('id: ' + N_('"{id}" là tên dành riêng của JavaScript — đổi id', { id: id }));
    d.id = id; d.name = plainText(pack.name || id, 60); d.description = plainText(pack.description, 300);
    if (pack.project != null && pack.project !== '' && !PROJ_RE.test(String(pack.project))) E('project: ' + N_('slug dự án'));
    d.project = pack.project ? String(pack.project) : '';
    d.version = Math.max(1, Math.floor(+pack.version) || 1);
    d.status = pack.status === 'published' ? 'published' : 'draft';
    // giấy phép / chủ sở hữu / tác giả đi theo gói (nạp, lưu, xuất, bán) — INT-02
    ['license', 'owner', 'author'].forEach(function (k) {
      if (pack[k] === undefined) return;
      if (typeof pack[k] !== 'string') { E('pack.' + k + ': ' + N_('cần chuỗi')); return; }
      var t = plainText(pack[k], k === 'license' ? 200 : 60); if (t) d[k] = t;
    });
    var shared = !d.project && !opts.frame;   // gói dùng chung (không dự án) — không phải bộ khung
    var S = pack.sounds;
    if (!S || typeof S !== 'object' || Array.isArray(S)) { E('sounds: ' + N_('cần object { tên: âm }')); return { errors: errs, def: null }; }
    var names = Object.keys(S);
    if (!names.length || names.length > BUDGET.sounds) E('sounds: ' + N_('1…{max} âm (đang có {n})', { max: BUDGET.sounds, n: names.length }));
    d.sounds = {};
    names.slice(0, BUDGET.sounds).forEach(function (nm) {
      var p = 'sounds.' + nm.slice(0, 32);
      if (!NAME_RE.test(nm) || nm.length < 2 || nm.length > 32) { E(p + ': ' + N_('tên âm chữ thường ASCII + gạch nối, 2–32 ký tự (vd. "kiem-cham")')); return; }
      if (nm in Object.prototype) { E(p + ': ' + N_('tên dành riêng của JavaScript — đổi tên')); return; }
      var s = checkSound(S[nm], p, E);
      // cue của gói dùng chung đổi âm tự gán của KHUNG ở mọi dự án (ranh giới tin cậy, INT-10): chỉ gói thuộc một dự án mới có cue, và chỉ trong dự án đó
      if (s && s.cue && shared) { EL(p + '.cue: ' + N_('gói dùng chung không được đổi âm tự gán của khung — đặt "project" của gói (cue chỉ có hiệu lực trong dự án đó)')); if (opts.tolerant) delete s.cue; }
      if (s) d.sounds[nm] = s;
    });
    return { errors: errs, def: errs.length ? null : d, notes: notes };
  }

  function checkSound(s0, p, E) {
    if (!s0 || typeof s0 !== 'object' || Array.isArray(s0)) { E(p + ': ' + N_('cần object')); return null; }
    var s = {}, n0 = 0;
    Object.keys(s0).forEach(function (k) { if (SOUND_KEYS.indexOf(k) < 0) E(p + '.' + k.slice(0, 20) + ': ' + N_('khoá lạ (được dùng: {ids})', { ids: SOUND_KEYS.join(', ') })); });
    var fixed = function (v, lo, hi, path, dflt) {
      if (v === undefined && dflt !== undefined) return dflt;
      if (!isNum(v) || v < lo || v > hi) { E(path + ': ' + N_('cần số trong khoảng {min}…{max}', { min: lo, max: hi })); return lo; }
      return v;
    };
    if (typeof s0.label !== 'string' || !plainText(s0.label, 40)) E(p + '.label: ' + N_('cần nhãn (≤ 40 ký tự)'));   // nhãn viết bằng ngôn ngữ của người dùng / dự án (INT-18)
    s.label = plainText(s0.label, 40);
    if (!hasOwn(CAT_LABEL, s0.cat)) E(p + '.cat: ' + N_('chọn {ids}', { ids: CATS.map(function (c) { return c[0]; }).join(', ') }));
    s.cat = String(s0.cat);
    if (typeof s0.use !== 'string' || !s0.use.trim()) E(p + '.use: ' + N_('cần một câu "dùng khi" (≤ 160 ký tự)'));
    else if (s0.use.length > 160) E(p + '.use: ' + N_('dài quá 160 ký tự'));
    s.use = plainText(s0.use, 160);
    s.tags = [];
    if (s0.tags !== undefined) {
      if (!Array.isArray(s0.tags) || s0.tags.length > BUDGET.tags || s0.tags.some(function (t) { return typeof t !== 'string' || !t.trim() || t.length > 24; })) E(p + '.tags: ' + N_('mảng ≤ {n} chuỗi, mỗi chuỗi ≤ 24 ký tự', { n: BUDGET.tags }));
      else s.tags = s0.tags.map(function (t) { return plainText(t, 24); });
    }
    s.dur = fixed(s0.dur, 0.03, BUDGET.dur, p + '.dur');
    s.level = fixed(s0.level, 0.05, 2, p + '.level');
    s.rev = fixed(s0.rev, 0, 0.6, p + '.rev', 0.1);
    s.vary = fixed(s0.vary, 0, 0.1, p + '.vary', 0.03);
    if (s0.hitAt !== undefined) s.hitAt = fixed(s0.hitAt, 0, s.dur, p + '.hitAt');
    if (s0.cue !== undefined) { var c = checkCue(s0.cue, p + '.cue', E); if (c) s.cue = c; }
    var lanesN = 0;
    if (s0.lanes !== undefined) {
      if (!Array.isArray(s0.lanes) || !s0.lanes.length || s0.lanes.length > BUDGET.lanes) E(p + '.lanes: ' + N_('mảng 1…{n} làn [pan đầu, pan cuối?, giây trượt?, giây bắt đầu trượt?]', { n: BUDGET.lanes }));
      else {
        s.lanes = s0.lanes.map(function (ln, i) {
          var q = p + '.lanes[' + i + ']';
          if (!Array.isArray(ln) || ln.length < 1 || ln.length > 4) { E(q + ': ' + N_('cần [pan đầu, pan cuối?, giây trượt?, giây bắt đầu?]')); return [0]; }
          var o = [fixed(ln[0], -1, 1, q + '[0]')];
          if (ln.length > 1 && ln[1] !== null) o[1] = fixed(ln[1], -1, 1, q + '[1]'); else if (ln.length > 1) o[1] = null;
          if (ln.length > 2) o[2] = fixed(ln[2], 0.01, 4, q + '[2]');
          if (ln.length > 3) o[3] = fixed(ln[3], 0, 4, q + '[3]');
          return o;
        });
        lanesN = s.lanes.length;
      }
    }
    if (!Array.isArray(s0.layers) || !s0.layers.length || s0.layers.length > BUDGET.layers) { E(p + '.layers: ' + N_('mảng 1…{n} lớp', { n: BUDGET.layers })); return null; }
    s.layers = [];
    s0.layers.forEach(function (L0, i) {
      var L = checkLayer(L0, p + '.layers[' + i + ']', E, lanesN);
      if (!L) return;
      // lớp không vượt quá thời lượng khai báo của âm (MAX_FX + dọn node tính theo dur)
      var end = numMax(L.at) + (L.jit || 0) + layerDur(L);
      if (end > s.dur + 0.05) E(p + '.layers[' + i + ']: ' + N_('kết thúc lúc {end} s > dur {dur} s (+0,05) — tăng dur của âm hoặc rút lớp', { end: end.toFixed(2), dur: s.dur }));
      s.layers.push(L);
    });
    if (s.layers.length === s0.layers.length) {
      n0 = nodesOf(s);
      if (n0 > BUDGET.nodes) E(p + ': ' + N_('{n} node Web Audio > ngân sách {max} (L-42: âm là thứ chạy nhiều nhất trong phim) — bớt lớp / hài / làn', { n: n0, max: BUDGET.nodes }));
      s.nodes = n0;
    }
    return s;
  }

  function checkCue(c0, p, E) {
    if (!c0 || typeof c0 !== 'object' || Array.isArray(c0)) { E(p + ': ' + N_('cần object { state | fx | activity | event | mood: [..] }')); return null; }
    var c = {}, trig = 0;
    Object.keys(c0).forEach(function (k) {
      if (!hasOwn(VOCAB, k)) { E(p + '.' + k.slice(0, 20) + ': ' + N_('khoá lạ (được dùng: {ids})', { ids: Object.keys(VOCAB).join(', ') })); return; }
      var v = c0[k];
      if (!Array.isArray(v) || !v.length || v.length > 24) { E(p + '.' + k + ': ' + N_('cần mảng 1…24 giá trị')); return; }
      var bad = v.filter(function (x) { return VOCAB[k].indexOf(x) < 0; });
      if (bad.length) { E(p + '.' + k + ': ' + N_('giá trị lạ {refs} (chọn: {ids})', { refs: bad.slice(0, 3).map(function (x) { return '"' + String(x).slice(0, 20) + '"'; }).join(', '), ids: VOCAB[k].join(', ') })); return; }
      c[k] = v.filter(function (x, i) { return v.indexOf(x) === i; });
      if (TRIGGERS.indexOf(k) >= 0) trig++;
    });
    if (c.mood && !trig) E(p + '.mood: ' + N_('là điều kiện — cần đi kèm state / fx / activity / event'));
    return c;
  }

  function checkLayer(L0, p, E, lanesN) {
    if (!L0 || typeof L0 !== 'object' || Array.isArray(L0)) { E(p + ': ' + N_('cần object')); return null; }
    var K = KINDS[L0.k];
    if (!K || !hasOwn(KINDS, L0.k)) { E(p + '.k: ' + N_('loại lớp {ids}', { ids: Object.keys(KINDS).join(' | ') })); return null; }
    var L = { k: L0.k }, ok = true;
    var err = function (m) { ok = false; E(m); };
    var num = function (v, key, path) {
      var R = RANGE[key];
      if (isNum(v)) {
        if (v < R[0] || v > R[1]) { err(path + ': ' + N_('cần số trong khoảng {min}…{max}', { min: R[0], max: R[1] })); return R[0]; }
        if (INTS[key] && v !== Math.floor(v)) { err(path + ': ' + N_('cần số nguyên')); return R[0]; }
        return v;
      }
      // ngẫu nhiên có kiểm soát { v, r }: cả v lẫn v + r phải trong khoảng
      if (v && typeof v === 'object' && !Array.isArray(v) && !INTS[key] && Object.keys(v).every(function (x) { return x === 'v' || x === 'r'; }) && isNum(v.v) && isNum(v.r)) {
        if (v.v < R[0] || v.v > R[1] || v.v + v.r < R[0] || v.v + v.r > R[1]) { err(path + ': ' + N_('{ v, r } — cả v lẫn v + r phải trong {min}…{max}', { min: R[0], max: R[1] })); return R[0]; }
        return { v: v.v, r: v.r };
      }
      err(path + ': ' + (INTS[key] ? N_('cần số nguyên trong khoảng {min}…{max}', { min: R[0], max: R[1] }) : N_('cần số hoặc { "v": số, "r": số } (ngẫu nhiên mỗi lần phát) trong khoảng {min}…{max}', { min: R[0], max: R[1] })));
      return R[0];
    };
    var allowed = ['k', 'at', 'jit', 'lane'].concat(K.keys);
    Object.keys(L0).forEach(function (key) {
      var v = L0[key], q = p + '.' + key.slice(0, 16);
      if (allowed.indexOf(key) < 0) { err(q + ': ' + N_('khoá lạ cho lớp "{kind}" (được dùng: {ids})', { kind: L0.k, ids: allowed.join(', ') })); return; }
      if (key === 'k') return;
      if (hasOwn(K.en, key)) { if (K.en[key].indexOf(v) < 0) err(q + ': ' + N_('chọn {ids}', { ids: K.en[key].join(', ') })); else L[key] = v; return; }
      if (key === 'lane') { if (!isNum(v) || v !== Math.floor(v) || v < 0 || v >= lanesN) err(q + ': ' + (lanesN ? N_('số thứ tự làn 0…{max}', { max: lanesN - 1 }) : N_('số thứ tự làn 0…{max} (âm chưa khai lanes)', { max: lanesN - 1 }))); else L.lane = v; return; }
      if (key === 'path') { L.path = points(v, q, BUDGET.path, 1, false, err); return; }
      if (key === 'curve') { L.curve = curvePts(v, q, err); return; }
      if (key === 'list') { L.list = modeList(v, q, err); return; }
      if (key === 'mv') { if (!Array.isArray(v) || v.length !== 2 || !v.every(function (x) { return isNum(x) && x >= -1 && x <= 1; })) err(q + ': ' + N_('cần [pan đầu, pan cuối] trong −1…1')); else L.mv = v.slice(); return; }
      if (key === 'notes') { L.notes = noteList(v, q, err); return; }
      if (L0.k === 'voice' && (key === 'hz' || key === 'cut' || key === 'amp')) { L[key] = points(v, q, BUDGET.points, key === 'amp' ? 2 : 1, key !== 'amp', err, key === 'amp'); return; }
      if (!hasOwn(RANGE, key)) { err(q + ': ' + N_('khoá lạ')); return; }
      L[key] = num(v, key, q);
    });
    K.need.forEach(function (key) { if (L0[key] === undefined) err(p + ': ' + N_('thiếu "{key}" (lớp {kind} cần {ids})', { key: key, kind: L0.k, ids: K.need.join(', ') })); });
    if ((L0.k === 'tone') && L0.hz === undefined && L0.curve === undefined) err(p + ': ' + N_('lớp tone cần "hz" hoặc "curve"'));
    if (!ok) return null;
    // bao biên độ: tấn công + giữ phải xong trước khi hết lớp
    if (L.a != null && L.dur != null && numMax(L.a) + numMax(L.hold) > numMax(L.dur) * 0.98 && L.k !== 'mallet') { E(p + ': ' + N_('a + hold phải ngắn hơn dur')); return null; }
    if (L.vibd != null && L.dur != null && numMax(L.vibd) >= numMax(L.dur)) { E(p + '.vibd: ' + N_('rung bắt đầu sau khi lớp đã hết')); return null; }
    if ((L.vibc != null || L.vibc1 != null || L.vib1 != null || L.vibd != null || L.vibr != null) && L.vib == null) { E(p + ': ' + N_('có vibc / vibd… nhưng thiếu "vib" (tần số rung, Hz)')); return null; }
    return L;
  }
  // [[giây, giá trị, 's'?]…] tăng dần — tần số (hz) hoặc biên độ (amp, tuyến tính, 0…1.5)
  function points(v, q, max, minN, allowS, err, isAmp) {
    if (!Array.isArray(v) || v.length < minN || v.length > max) { err(q + ': ' + N_(isAmp ? 'cần mảng {min}…{max} điểm [giây, độ to{s}]' : 'cần mảng {min}…{max} điểm [giây, Hz{s}]', { min: minN, max: max, s: allowS ? ", 's'?" : '' })); return []; }
    var prev = -1, out = [];
    v.forEach(function (pt, i) {
      var r = q + '[' + i + ']';
      if (!Array.isArray(pt) || pt.length < 2 || pt.length > 3 || !isNum(pt[0]) || !isNum(pt[1])) { err(r + ': ' + N_('cần [giây, số{s}]', { s: allowS ? ", 's'?" : '' })); return; }
      if (pt[0] < 0 || pt[0] > 4) err(r + '[0]: ' + N_('giây trong 0…4'));
      if (pt[0] < prev) err(r + '[0]: ' + N_('thời điểm phải tăng dần'));
      prev = pt[0];
      if (isAmp ? pt[1] < 0 || pt[1] > 1.5 : pt[1] < HZ[0] || pt[1] > HZ[1]) err(r + '[1]: ' + (isAmp ? N_('độ to 0…1.5') : N_('tần số 20…16000 Hz')));
      if (pt.length === 3 && !(allowS && pt[2] === 's')) err(r + '[2]: ' + N_("chỉ được là 's' (nhảy tức thì)"));
      out.push(pt.slice());
    });
    return out;
  }
  function curvePts(v, q, err) {
    if (!Array.isArray(v) || v.length < 2 || v.length > BUDGET.curve) { err(q + ': ' + N_('cần 2…{max} điểm [u 0…1, Hz]', { max: BUDGET.curve })); return []; }
    var prev = -1;
    v.forEach(function (pt, i) {
      var r = q + '[' + i + ']';
      if (!Array.isArray(pt) || pt.length !== 2 || !isNum(pt[0]) || !isNum(pt[1]) || pt[0] < 0 || pt[0] > 1 || pt[1] < HZ[0] || pt[1] > HZ[1]) { err(r + ': ' + N_('cần [u 0…1, Hz 20…16000]')); return; }
      if (pt[0] <= prev) err(r + ': ' + N_('u phải tăng dần'));
      prev = pt[0];
    });
    if (v[0] && v[0][0] !== 0) err(q + '[0]: ' + N_('điểm đầu u = 0'));
    if (v[v.length - 1] && v[v.length - 1][0] !== 1) err(q + ': ' + N_('điểm cuối u = 1'));
    return v.map(function (pt) { return pt.slice(); });
  }
  function modeList(v, q, err) {
    if (!Array.isArray(v) || !v.length || v.length > BUDGET.list) { err(q + ': ' + N_('cần 1…{max} phần [tỉ số, biên độ, thời tắt (s), tấn công (s)?]', { max: BUDGET.list })); return []; }
    return v.map(function (m, i) {
      var r = q + '[' + i + ']';
      if (!Array.isArray(m) || m.length < 3 || m.length > 4 || !m.every(isNum)) { err(r + ': ' + N_('cần [tỉ số 0.1…32, biên độ 0…1.5, thời tắt 0.005…6, tấn công 0…1?]')); return [1, 0, 0.1]; }
      if (m[0] < 0.1 || m[0] > 32 || m[1] < 0 || m[1] > 1.5 || m[2] < 0.005 || m[2] > 6 || (m.length > 3 && (m[3] < 0 || m[3] > 1))) err(r + ': ' + N_('ngoài khoảng (tỉ số 0.1…32, biên độ 0…1.5, thời tắt 0.005…6, tấn công 0…1)'));
      return m.slice();
    });
  }
  function noteList(v, q, err) {
    if (!Array.isArray(v) || !v.length || v.length > BUDGET.notes) { err(q + ': ' + N_('cần 1…{max} nốt [giây, Hz, độ to?]', { max: BUDGET.notes })); return []; }
    var prev = -1;
    return v.map(function (m, i) {
      var r = q + '[' + i + ']';
      if (!Array.isArray(m) || m.length < 2 || m.length > 3 || !m.every(isNum)) { err(r + ': ' + N_('cần [giây 0…4, Hz 20…16000, độ to 0…1.5?]')); return [0, 440]; }
      if (m[0] < 0 || m[0] > 4 || m[1] < HZ[0] || m[1] > HZ[1] || (m.length > 2 && (m[2] < 0 || m[2] > 1.5))) err(r + ': ' + N_('ngoài khoảng (giây 0…4, Hz 20…16000, độ to 0…1.5)'));
      if (m[0] < prev) err(r + '[0]: ' + N_('thời điểm phải tăng dần'));
      prev = m[0];
      return m.slice();
    });
  }

  /* --------------------------------------------------------------- sổ đăng ký */
  var PACKS = Object.create(null), ORDER = [], OWNER = Object.create(null), CUE = null;   // không prototype: id gói / tên âm tuỳ ý không đụng thuộc tính của Object (CNS-112)
  // ưu tiên tự gán: gói dự án (0) > gói dùng chung (1) > khung (2); cùng tầng thì gói nạp trước thắng
  function tier(d) { return d.id === FRAME ? 2 : d.project ? 0 : 1; }
  function registerPack(pack, opts) {
    var c = validateSoundPack(pack, opts);
    if (c.errors.length) return c;
    var d = c.def, errs = [];
    Object.keys(d.sounds).forEach(function (nm) {
      var o = OWNER[nm];
      if (o && o !== d.id) errs.push('sounds.' + nm + ': ' + N_('trùng tên âm của gói "{pack}" ({label}) — tên âm là chung toàn thư viện, đổi tên (vd. "{alt}")', { pack: o, label: PACKS[o].name, alt: nm + '-' + d.id.split('-')[0] }));
    });
    if (errs.length) return { errors: errs, def: null };
    if (PACKS[d.id]) unregisterPack(d.id, true);
    Object.keys(d.sounds).forEach(function (nm) { var s = d.sounds[nm]; s.name = nm; s.pack = d.id; OWNER[nm] = d.id; });
    PACKS[d.id] = d; ORDER.push(d.id); CUE = null; SUGIDX = null;
    return { errors: [], def: d, notes: c.notes || [] };
  }
  function unregisterPack(id, force) {
    var d = PACKS[id];
    if (!d || (id === FRAME && !force)) return false;
    Object.keys(d.sounds).forEach(function (nm) { if (OWNER[nm] === id) delete OWNER[nm]; });
    delete PACKS[id]; ORDER.splice(ORDER.indexOf(id), 1); CUE = null; SUGIDX = null;
    return true;
  }
  function get(name) { var o = typeof name === 'string' && hasOwn(OWNER, name) ? OWNER[name] : null; return o ? PACKS[o].sounds[name] : null; }
  function has(name) { return !!get(name); }
  // gói nhìn thấy được từ một dự án: khung + gói dùng chung + gói của chính dự án đó (S6)
  function visible(d, project) { return !d.project || d.project === (project || ''); }
  function names(o) {
    var out = [], pr = o && o.project, all = !o || o.project === undefined;
    ORDER.forEach(function (id) { var d = PACKS[id]; if (all || visible(d, pr)) out = out.concat(Object.keys(d.sounds)); });
    return out;
  }
  // "ÂM NÀO DÙNG ĐƯỢC" — MỘT định nghĩa cho lược đồ / lời nhắc đạo diễn, Bảng bước, S6 (lintSoundTrack) và bộ phát (CNS-104; CNS-064 tái phạm cho âm).
  // Dự án quyết: chỉ định (project) > tác phẩm (work.project) > phân cảnh (shot.project) > bối cảnh > diễn viên đầu tiên có dự án > '' (khung + gói dùng chung).
  // Dàn diễn viên chỉ là DỰ PHÒNG khi chưa biết tác phẩm: nhân vật bộ mẫu trong phim của dự án khác không được mời âm của bộ mẫu rồi bị S6 từ chối
  function projectFor(o) {
    o = o || {};
    if (typeof o.project === 'string') return o.project;
    if (o.work && typeof o.work.project === 'string') return o.work.project;
    if (o.shot && typeof o.shot.project === 'string') return o.shot.project;
    if (o.scene && o.scene.project) return String(o.scene.project);
    var cast = Array.isArray(o.cast) ? o.cast : [];
    for (var i = 0; i < cast.length; i++) if (cast[i] && cast[i].project) return String(cast[i].project);
    return '';
  }
  function allowedSounds(o) { return names({ project: projectFor(o) }); }
  function packs() { return ORDER.map(function (id) { var d = PACKS[id]; return { id: d.id, name: d.name, project: d.project, version: d.version, status: d.status, count: Object.keys(d.sounds).length, frame: id === FRAME }; }); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  // bản xuất của một gói (gen-chibi.sound/1 chạy lại được qua cổng): không có trường nội bộ (name / pack / nodes trên từng âm)
  function pack(id) {
    var d = PACKS[id]; if (!d) return null;
    var o = clone(d);
    Object.keys(o.sounds).forEach(function (nm) { delete o.sounds[nm].name; delete o.sounds[nm].pack; delete o.sounds[nm].nodes; });
    delete o.kind;
    return o;
  }
  function info(name) {
    var s = get(name); if (!s) return null;
    return { name: name, label: s.label, cat: s.cat, catLabel: CAT_LABEL[s.cat], tags: s.tags.slice(), use: s.use, dur: s.dur, level: s.level, nodes: s.nodes, pack: s.pack, project: PACKS[s.pack].project, accent: ACCENT.indexOf(s.cat) >= 0, cue: s.cue ? clone(s.cue) : null, hitAt: s.hitAt == null ? null : s.hitAt };
  }
  function fold(t) { t = String(t == null ? '' : t).toLowerCase(); if (t.normalize) t = t.normalize('NFD').replace(/[̀-ͯ]/g, ''); return t.replace(/đ/g, 'd'); }
  // danh sách cho list_sounds / Studio: lọc theo nhóm · thẻ · chữ (bỏ dấu) · dự án; xếp theo thứ tự nhóm rồi thứ tự nạp
  // (có chữ tìm: khớp tên / nhãn / thẻ đứng trước khớp trong câu "dùng khi")
  function list(o) {
    o = o || {};
    var q = fold(o.q).trim(), out = [];
    ORDER.forEach(function (id) {
      var d = PACKS[id];
      if (o.project !== undefined && !visible(d, o.project)) return;
      if (o.pack && o.pack !== id) return;
      Object.keys(d.sounds).forEach(function (nm) {
        var s = d.sounds[nm];
        if (o.cat && s.cat !== o.cat) return;
        if (o.tag && s.tags.map(fold).indexOf(fold(o.tag)) < 0) return;
        var head = q ? [nm.replace(/-/g, ' '), s.label].concat(s.tags).map(fold).join(' | ') : '';
        if (q && head.indexOf(q) < 0 && fold(s.use).indexOf(q) < 0) return;
        var x = info(nm); x.r = q && head.indexOf(q) < 0 ? 1 : 0;
        out.push(x);
      });
    });
    return out.map(function (x, i) { x.i = i; return x; }).sort(function (a, b) { return a.r - b.r || catIdx(a.cat) - catIdx(b.cat) || a.i - b.i; }).map(function (x) { delete x.i; delete x.r; return x; });
  }
  function catIdx(c) { for (var i = 0; i < CATS.length; i++) if (CATS[i][0] === c) return i; return 99; }

  /* ----------------------------------------------------------------- tự gán */
  // chỉ mục cue: CUE[khoá][giá trị] = [{ name, tier, ord, mood }] xếp theo ưu tiên; dựng lại khi sổ đổi
  function index() {
    if (CUE) return CUE;
    CUE = { state: {}, fx: {}, activity: {}, event: {} };
    ORDER.forEach(function (id, ord) {
      var d = PACKS[id];
      Object.keys(d.sounds).forEach(function (nm) {
        var c = d.sounds[nm].cue; if (!c) return;
        TRIGGERS.forEach(function (k) {
          (c[k] || []).forEach(function (v) { (CUE[k][v] = CUE[k][v] || []).push({ name: nm, tier: tier(d), ord: ord, mood: c.mood || null, project: d.project }); });
        });
      });
    });
    Object.keys(CUE).forEach(function (k) { Object.keys(CUE[k]).forEach(function (v) { CUE[k][v].sort(function (a, b) { return a.tier - b.tier || a.ord - b.ord; }); }); });
    return CUE;
  }
  // âm thắng cho một (khoá, giá trị): gói nhìn thấy được, điều kiện mood khớp (âm có điều kiện mood thắng âm không điều kiện cùng tầng)
  function pick(k, v, mood, project) {
    if (typeof v !== 'string') return null;
    var L = hasOwn(index()[k], v) ? CUE[k][v] : null, best = null, i, e;
    if (!L) return null;
    for (i = 0; i < L.length; i++) {
      e = L[i];
      if (e.project && e.project !== (project || '')) continue;
      if (e.mood && e.mood.indexOf(mood) < 0) continue;
      if (!best || e.tier < best.tier || (e.tier === best.tier && e.mood && !best.mood)) best = e;
    }
    return best ? best.name : null;
  }
  // tự gán âm cho một bước — thứ tự & cắt giống hệt bảng cứng cũ của engine/player.js: [cảm xúc] + [hiệu ứng…] + [hoạt động] (+ [sự kiện]), bỏ trùng, ≤ 2.
  // Luật S1 áp cả cho âm tự gán (CNS-103): ≤ RULES.maxAccent âm NHẤN mỗi bước — âm nhấn thứ hai bị bỏ, nhường chỗ cho âm thường kế tiếp.
  // Khung chỉ có một âm nhấn (sting) nên bảng cũ không đổi
  function cueFor(c) {
    c = c || {};
    var out = [], acc = 0, add = function (n) {
      if (!n || out.indexOf(n) >= 0) return;
      var d = get(n);
      if (d && ACCENT.indexOf(d.cat) >= 0) { if (acc >= RULES.maxAccent) return; acc++; }
      out.push(n);
    };
    add(pick('state', c.state, c.mood, c.project));
    (Array.isArray(c.fx) ? c.fx : []).forEach(function (f) { add(pick('fx', f, c.mood, c.project)); });
    add(pick('activity', c.activity, c.mood, c.project));
    add(pick('event', c.event, c.mood, c.project));
    return out.slice(0, c.max == null ? RULES.autoMax : Math.max(0, c.max | 0));
  }
  // bảng tương thích (cho bộ phát / Studio hiện "âm tự gán"): { state: { shock: 'sting' … }, fx: {…}, activity: {…}, event: {…} }
  function cueTable(o) {
    o = o || {};
    var t = {};
    TRIGGERS.forEach(function (k) { t[k] = {}; VOCAB[k].forEach(function (v) { var n = pick(k, v, o.mood, o.project); if (n) t[k][v] = n; }); });
    return t;
  }

  /* ----------------------------------------------------------- luật ghép âm */
  // Một nguồn: lint dưới đây, guide() cho agent, Studio. Thời gian ước lượng như bộ phát (engine/player.js): máy quay 0,42 s +
  // bong bóng 0,26 s rồi mới nói (bong bóng hiện kèm tiếng "pop" — tính vào mật độ); âm của bước phát lúc 0,12 / 0,38 / 0,64 s;
  // giọng đọc thật ≈ 0,3 s mỗi chữ (tối thiểu 0,6 s), giữ khung ≥ 0,38 s (hoặc hold); bước biên đạo (action) ≈ 2,5 s.
  var RULES = {
    maxPerStep: 3, maxAccent: 1, accent: ACCENT, autoMax: 2,
    density: { window: 2, max: 4, skip: ['step', 'tick'] },
    speech: { sfxAt: [0.12, 0.38, 0.64], speechAt: 0.68, gap: 0.3, perWord: 0.3, min: 0.6, tail: 0.38, bubble: 'pop' },
    impact: { cat: 'danh', activities: ['attack', 'thrust', 'defend', 'kowtow', 'faint', 'jump'], states: ['injured', 'dizzy'] },
    repeat: { max: 3, skip: ['step', 'tick'] },
    long: { dur: 2 }
  };
  // CÂU LUẬT sinh từ chính các con số ở trên — hướng dẫn agent, mô tả tool MCP, tab Luật ghép của Studio, docs/HUONG-DAN.md đều lấy từ đây (một nguồn, CNS-107):
  // đổi RULES.maxPerStep là mọi chỗ đổi theo, test so khớp từng câu. rule = câu đầy đủ · short = vế ngắn cho mô tả tool
  (function (R) {
    var vi = function (n) { return String(n).replace('.', ','); }, sk = function (xs) { return xs.join(' / '); };
    R.list = [
      { code: 'S1', level: 'error', short: N_('≤ {max} âm / ≤ {acc} âm nhấn mỗi bước', { max: R.maxPerStep, acc: R.maxAccent }),
        rule: N_('≤ {max} âm mỗi bước; ≤ {acc} âm NHẤN (nhóm {ids}) mỗi bước — hai cú nhấn cùng lúc triệt tiêu nhau.', { max: R.maxPerStep, acc: R.maxAccent, ids: sk(R.accent) }) },
      { code: 'S2', level: 'warn', short: N_('mật độ ≤ {max} âm / {win} s', { max: R.density.max, win: R.density.window }),
        rule: N_('Mật độ ≤ {max} âm trong {win} giây phim (kể cả âm tự gán và tiếng bật bong bóng thoại, không tính {ids}) — dày hơn là "ồn", khán giả mất điểm nhấn.', { max: R.density.max, win: R.density.window, ids: sk(R.density.skip) }) },
      { code: 'S3', level: 'warn', short: N_('âm nhấn không đè lời thoại'),
        rule: N_('Âm nhấn không đè câu thoại: đặt ở bước không có lời, hoặc chọn âm ngắn xong trước câu ≥ {gap} s.', { gap: vi(R.speech.gap) }) },
      { code: 'S4', level: 'warn', short: N_('âm va chạm để đòn đánh tự phát'),
        rule: N_('Âm va chạm (nhóm {cat}) để động tác tự phát ở điểm đánh; đặt tay chỉ khi bước có cú va thấy được ({ids}).', { cat: R.impact.cat, ids: R.impact.activities.concat(R.impact.states).join(', ') }) },
      { code: 'S5', level: 'warn', short: N_('một âm ≤ {max} bước liền', { max: R.repeat.max }),
        rule: N_('Cùng một âm không quá {max} bước liền (trừ {ids}) — đổi âm cùng nhóm hoặc bỏ.', { max: R.repeat.max, ids: sk(R.repeat.skip) }) },
      { code: 'S6', level: 'error', short: N_('âm phải có trong thư viện của dự án'),
        rule: N_('Âm phải có trong thư viện của dự án (khung + gói dùng chung + gói của dự án) — tên lạ / âm của dự án khác là lỗi, có gợi ý tên gần nhất.') },
      { code: 'S7', level: 'warn', short: N_('âm dài > {dur} s chỉ ở đầu / cuối cảnh', { dur: R.long.dur }),
        rule: N_('Âm dài > {dur} s (gong, dun-dun, trống trận…) chỉ ở bước đầu / cuối cảnh (mở màn, chuyển cảnh).', { dur: R.long.dur }) }
    ];
    // mã luật theo mức, gộp dãy liền: error → "S1, S6" · warn → "S2–S5, S7"
    var span = function (codes) {
      var n = codes.map(function (c) { return +c.slice(1); }), out = [], i = 0, j;
      while (i < n.length) { j = i; while (j + 1 < n.length && n[j + 1] === n[j] + 1) j++; out.push(j > i + 1 ? 'S' + n[i] + '–S' + n[j] : n.slice(i, j + 1).map(function (x) { return 'S' + x; }).join(', ')); i = j + 1; }
      return out.join(', ');
    };
    R.levels = { error: span(R.list.filter(function (r) { return r.level === 'error'; }).map(function (r) { return r.code; })), warn: span(R.list.filter(function (r) { return r.level !== 'error'; }).map(function (r) { return r.code; })) };
  })(RULES);
  function words(t) { return String(t || '').trim().split(/\s+/).filter(Boolean).length; }
  function hasSay(s) { return /[0-9A-Za-zÀ-ɏḀ-ỿ]/.test(String(s.say || '')); }
  function stepDur(s) {
    var P = RULES.speech;
    if (s.action) return 2.5;                                          // một màn biên đạo ~ 2–3 s
    return P.speechAt + Math.max((hasSay(s) ? Math.max(P.min, words(s.say) * P.perWord) : 0) + P.tail, +s.hold || 0);
  }
  function lev(a, b) {
    if (Math.abs(a.length - b.length) > 4) return 99;
    var d = [], i, j; for (j = 0; j <= b.length; j++) d[j] = j;
    for (i = 1; i <= a.length; i++) { var p = d[0]; d[0] = i; for (j = 1; j <= b.length; j++) { var t = d[j]; d[j] = Math.min(d[j] + 1, d[j - 1] + 1, p + (a[i - 1] === b[j - 1] ? 0 : 1)); p = t; } }
    return d[b.length];
  }
  // gợi ý tên gần nhất trong thư viện nhìn thấy được: trùng nhãn / thẻ (bỏ dấu) trước, rồi khoảng cách sửa chữ ≤ 3.
  // Chỉ mục (tên + khoá bỏ dấu của từng âm nhìn thấy được, cùng thứ tự với list()) dựng MỘT lần mỗi dự án, bỏ khi sổ đổi (CNS-105: trước đây dựng lại list() cho mỗi tên lạ)
  var SUGIDX = null;
  function sugIndex(project) {
    var k = project || '';
    if (k && !ORDER.some(function (id) { return PACKS[id].project === k; })) k = '';    // dự án không có gói riêng nhìn thấy giống '' — không để chuỗi tuỳ ý phình bộ nhớ đệm
    SUGIDX = SUGIDX || Object.create(null);
    if (SUGIDX[k]) return SUGIDX[k];
    var xs = [];
    ORDER.forEach(function (id) {
      var d = PACKS[id]; if (!visible(d, k)) return;
      Object.keys(d.sounds).forEach(function (nm) {
        var x = d.sounds[nm];
        xs.push({ name: nm, cat: catIdx(x.cat), i: xs.length, keys: [fold(x.label).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')].concat(x.tags.map(function (t) { return fold(t).replace(/\s+/g, '-'); })) });
      });
    });
    return (SUGIDX[k] = xs.sort(function (a, b) { return a.cat - b.cat || a.i - b.i; }));
  }
  function suggest(name, project) {
    var f = fold(name).replace(/[\s_]+/g, '-'), best = null, bd = 4;
    sugIndex(project).forEach(function (x) {
      if (best && bd === 0) return;
      if (x.keys.indexOf(f) >= 0) { best = x.name; bd = 0; return; }
      var dd = lev(f, x.name); if (dd < bd) { bd = dd; best = x.name; }
    });
    return best;
  }
  // trần đầu vào của lint (CNS-105): lint_sound_track mở cho link MCP + AI chatroom, mà Node chạy một luồng — một request 0,44 MB từng giữ server 29 s.
  // 12 bước / phân cảnh = trần của lược đồ đạo diễn; 200 phân cảnh = trần tổng của cổng nhập gói dự án; bytes = cỡ JSON của đầu vào
  var LINT_MAX = { steps: 12, shots: 200, bytes: 1000000, sfx: 12, suggest: 20 };
  function lintSoundTrack(input, opts) {
    opts = opts || {};
    var out = [], project = opts.project || '', shots;
    if (Array.isArray(input)) shots = [{ steps: input, path: 'steps' }];
    else if (input && Array.isArray(input.shots)) shots = input.shots.map(function (s, j) { return { steps: (s && s.event && Array.isArray(s.event.steps) && s.event.steps) || [], path: 'shots[' + j + '].event.steps', shot: j }; });
    else if (input && input.event && Array.isArray(input.event.steps)) shots = [{ steps: input.event.steps, path: 'event.steps' }];
    else if (input && Array.isArray(input.steps)) shots = [{ steps: input.steps, path: 'steps' }];
    else return [{ code: 'S0', level: 'error', path: '', step: -1, msg: N_('cần mảng bước (steps), một phân cảnh ({ event: { steps } }) hoặc tác phẩm ({ shots })') }];
    var big = function (path, msg) { return [{ code: 'S0', level: 'error', path: path, step: -1, msg: 'S0: ' + msg }]; }, tooMany = null;
    if (shots.length > LINT_MAX.shots) return big('shots', N_('tối đa {max} phân cảnh một lần chấm (đang có {n}) — chấm từng tác phẩm / từng phân cảnh', { max: LINT_MAX.shots, n: shots.length }));
    shots.forEach(function (sh) { if (!tooMany && sh.steps.length > LINT_MAX.steps) tooMany = sh; });
    if (tooMany) return big(tooMany.path, N_('tối đa {max} bước một phân cảnh (đang có {n}) — đúng trần của lược đồ đạo diễn', { max: LINT_MAX.steps, n: tooMany.steps.length }));
    var size; try { size = JSON.stringify(input).length; } catch (x) { return big('', N_('đầu vào không phải JSON thuần')); }
    if (size > LINT_MAX.bytes) return big('', N_('đầu vào quá lớn ({n} KB > {max} KB)', { n: Math.round(size / 1000), max: LINT_MAX.bytes / 1000 }));
    var ctx = { sug: Object.create(null), nSug: 0 };    // nhớ gợi ý theo tên lạ; chỉ gợi ý LINT_MAX.suggest tên lạ đầu (mỗi lần gợi ý là một lượt quét ~70 âm)
    shots.forEach(function (sh) { lintShot(sh, opts, project, out, ctx); });
    return out;
  }
  function lintShot(sh, opts, project, out, ctx) {
    var steps = sh.steps, t = 0, ev = [], run = {}, R = RULES;
    var mood = typeof opts.mood === 'function' ? opts.mood(steps) : opts.mood;     // không khí của cảnh (âm tự gán có điều kiện mood): chuỗi, hoặc hàm (các bước) → chuỗi — GC.film.moodOf
    var W = function (code, i, name, msg, sub, level) {
      var rl = R.list.filter(function (r) { return r.code === code; })[0];
      var o = { code: code, level: level || rl.level, path: sh.path + '[' + i + ']' + (sub || ''), step: i, name: name || null, msg: code + ': ' + msg };
      if (sh.shot != null) o.shot = sh.shot;
      out.push(o);
    };
    var hint = function (nm) {
      if (!(nm in ctx.sug)) { ctx.sug[nm] = ctx.nSug++ < LINT_MAX.suggest ? suggest(nm, project) : null; }
      return ctx.sug[nm];
    };
    steps.forEach(function (s, i) {
      s = s && typeof s === 'object' ? s : {};
      var dur = stepDur(s), ex = Array.isArray(s.sfx) ? s.sfx : null, eff = [], acc = 0, auto = false;
      // S1 (âm nhấn) + S3 (nhấn đè lời) cho MỘT âm — dùng chung cho sfx ghi tay và âm tự gán (CNS-103): tự gán thì chỉ là cảnh báo + cách tắt
      var accent = function (nm, snd, k, sub) {
        if (ACCENT.indexOf(snd.cat) < 0) return;
        if (++acc === R.maxAccent + 1) W('S1', i, nm, auto ? N_('hai âm nhấn TỰ GÁN trong một bước ("{name}" và âm nhấn trước nó) — giữ một', { name: nm }) : N_('hai âm nhấn trong một bước ("{name}" và âm nhấn trước nó) — giữ một', { name: nm }), sub, auto ? 'warn' : undefined);
        if (hasSay(s) && (R.speech.sfxAt[Math.min(k, 2)] + snd.dur > R.speech.speechAt - R.speech.gap))
          W('S3', i, nm, auto ? N_('âm nhấn TỰ GÁN "{name}" ({dur} s) đè lên câu thoại của bước — đặt sfx: [] để tắt âm tự gán, hoặc bỏ cue của âm đó', { name: nm, dur: snd.dur })
            : N_('âm nhấn "{name}" ({dur} s) đè lên câu thoại của bước — chuyển sang bước không có lời / bước trước, hoặc chọn âm ngắn hơn', { name: nm, dur: snd.dur }), sub, auto ? 'warn' : undefined);
      };
      if (ex) {
        if (ex.length > R.maxPerStep) W('S1', i, null, N_('bước có {n} âm (tối đa {max}) — giữ âm quan trọng nhất', { n: ex.length, max: R.maxPerStep }), '.sfx');
        ex.slice(0, LINT_MAX.sfx).forEach(function (nm, k) {    // quá LINT_MAX.sfx tên thì S1 đã báo; không duyệt tiếp
          var snd = typeof nm === 'string' ? get(nm) : null, sub = '.sfx[' + k + ']';
          if (!snd || !visible(PACKS[snd.pack], project)) {
            var sg = typeof nm === 'string' ? hint(nm) : null;
            W('S6', i, String(nm).slice(0, 32), snd ? (sg ? N_('âm "{name}" thuộc gói "{pack}" của dự án khác — gần nhất: "{alt}"', { name: nm, pack: snd.pack, alt: sg }) : N_('âm "{name}" thuộc gói "{pack}" của dự án khác', { name: nm, pack: snd.pack }))
              : (sg ? N_('không có âm "{name}" trong thư viện — gần nhất: "{alt}"', { name: String(nm).slice(0, 32), alt: sg }) : N_('không có âm "{name}" trong thư viện', { name: String(nm).slice(0, 32) })), sub);
            return;
          }
          eff.push(nm);
          accent(nm, snd, k, sub);
          if (snd.cat === R.impact.cat) {
            if (s.action) W('S4', i, nm, N_('bước có động tác "{action}" — âm va chạm đã tự phát ở điểm đánh; bỏ "{name}" khỏi sfx (hoặc sửa âm trong gói động tác)', { action: s.action, name: nm }), sub);
            else if (R.impact.activities.indexOf(s.activity) < 0 && R.impact.states.indexOf(s.state) < 0) W('S4', i, nm, N_('âm va chạm "{name}" rải giữa bước không có cú va thấy được — dùng action (đòn đánh) hoặc activity attack / defend / faint…', { name: nm }), sub);
          }
          if (snd.dur > R.long.dur && i !== 0 && i !== steps.length - 1) W('S7', i, nm, N_('âm dài "{name}" ({dur} s) giữa cảnh — để ở bước đầu / cuối cảnh', { name: nm, dur: snd.dur }), sub);
        });
      } else if (opts.auto !== false) {
        auto = true;
        eff = cueFor({ state: s.state, fx: s.fx, activity: s.activity, mood: mood, project: project });
        eff.forEach(function (nm, k) { accent(nm, get(nm), k, ''); });
      }
      eff.forEach(function (nm, k) {
        if (R.density.skip.indexOf(nm) < 0) ev.push({ t: t + R.speech.sfxAt[Math.min(k, 2)], i: i, name: nm });
      });
      if (hasSay(s) && !s.action) ev.push({ t: t + R.speech.speechAt, i: i, name: R.speech.bubble });   // bong bóng thoại bật "pop"
      // S5: cùng âm nhiều bước liền
      var next = {};
      eff.forEach(function (nm) {
        if (R.repeat.skip.indexOf(nm) >= 0) return;
        next[nm] = (run[nm] || 0) + 1;
        if (next[nm] === R.repeat.max + 1) W('S5', i, nm, ex ? N_('âm "{name}" lặp {n} bước liền — đổi âm cùng nhóm ({label}) hoặc bỏ', { name: nm, n: next[nm], label: CAT_LABEL[get(nm).cat] || '' })
          : N_('âm "{name}" lặp {n} bước liền — đổi âm cùng nhóm ({label}) hoặc bỏ (âm tự gán: đặt sfx của bước để thay)', { name: nm, n: next[nm], label: CAT_LABEL[get(nm).cat] || '' }));
      });
      run = next;
      t += dur;
    });
    // S2: mật độ trong cửa sổ trượt — sắp MỘT lần sau vòng lặp (trước đây sắp lại mỗi bước: O(n² log n))
    ev.sort(function (a, b) { return a.t - b.t; });
    var warned = {};
    ev.forEach(function (e, a) {
      var n = 0; for (var b = a; b < ev.length && ev[b].t < e.t + R.density.window; b++) n++;
      if (n > R.density.max) {
        var last = ev[a + n - 1];
        if (!warned[last.i]) { warned[last.i] = 1; W('S2', last.i, null, N_('{n} âm trong {win} s (tối đa {max}) — bỏ bớt (đặt sfx: [] cho bước không cần âm)', { n: n, win: R.density.window, max: R.density.max })); }
      }
    });
  }

  /* ------------------------------------------------------- phụ thuộc khi đóng gói / đổi gói */
  // MỌI chỗ gọi tên âm trong dữ liệu: step.sfx của phân cảnh (shots[].event.steps[].sfx) + events[].sfx của clip trong gói động tác (clips[k].events = [[giây, { sfx }]…]).
  // Âm có BA nơi gọi (bước, sự kiện gói động tác, cue) nên sao lưu / gói bán / phim xuất / rào đổi gói phải theo dõi đủ — một hàm cho tất cả (CNS-101, CNS-102)
  function refsOf(o) {
    o = o || {};
    var out = [];
    (Array.isArray(o.shots) ? o.shots : []).forEach(function (sh, j) {
      var steps = sh && sh.event && Array.isArray(sh.event.steps) ? sh.event.steps : [];
      steps.forEach(function (st, i) {
        (st && Array.isArray(st.sfx) ? st.sfx : []).forEach(function (n) { if (typeof n === 'string') out.push({ name: n, kind: 'step', shot: sh.id != null ? String(sh.id) : String(j), step: i }); });
      });
    });
    (Array.isArray(o.motionPacks) ? o.motionPacks : []).forEach(function (p) {
      var clips = p && p.clips && typeof p.clips === 'object' ? p.clips : {};
      Object.keys(clips).forEach(function (k) {
        var evs = clips[k] && Array.isArray(clips[k].events) ? clips[k].events : [];
        evs.forEach(function (q, e) {
          var sfx = q && q[1] && q[1].sfx;
          (sfx === undefined || sfx === null ? [] : Array.isArray(sfx) ? sfx : [sfx]).forEach(function (n) { if (typeof n === 'string') out.push({ name: n, kind: 'event', pack: p.id, clip: k, event: e }); });
        });
      });
    });
    return out;
  }
  // gói âm (không phải khung) mà dữ liệu cần để chạy ở máy sạch: { names: tên được gọi, packs: id gói giữ các tên đó (thứ tự nạp), missing: tên không có trong sổ }.
  // o = { shots, motionPacks } — dùng cho CẢ BA bộ đóng gói: sao lưu / gói bán (server exportProject, Studio projectBundle) và phim xuất (Studio filmSoundPacks)
  function bundleDeps(o) {
    var names = [], seen = Object.create(null), want = Object.create(null), missing = [];
    refsOf(o).forEach(function (r) {
      if (seen[r.name]) return; seen[r.name] = 1; names.push(r.name);
      var d = get(r.name);
      if (!d) missing.push(r.name); else if (d.pack !== FRAME) want[d.pack] = 1;
    });
    return { names: names, packs: ORDER.filter(function (id) { return want[id]; }), missing: missing };
  }

  /* ------------------------------------------------- công thức ghép mẫu */
  // chuỗi âm theo giây — "đà → va → hậu quả" — dùng cho trang nghe, guide và làm mẫu cho người viết kịch bản (mỗi âm một bước)
  var RECIPES = [
    { id: 'vo-chuoi', label: 'Rón rén → giẫm vỏ chuối → trượt ngã → bẹp → thất bại', seq: [[0, 'tiptoe'], [1.2, 'slip'], [1.4, 'slide-down'], [2.25, 'splat'], [2.75, 'sad']], note: 'Hài kiểu té ngã: âm "rơi" (slide-down) nối thẳng vào cú bẹp, kèn buồn ở bước sau cùng.' },
    { id: 'dam-choang', label: 'Lấy đà → WHAM → ngã → chim bay vòng', seq: [[0, 'wham'], [0.5, 'nga-xuong'], [1.05, 'tweet']], note: 'wham có lấy đà sẵn (hitAt 0,24 s): đặt ở bước TRƯỚC khung trúng đòn, hoặc dùng pow / hit khi phát đúng điểm đánh.' },
    { id: 'y-tuong', label: 'Loé ý tưởng → chạy biến', seq: [[0, 'ding'], [0.75, 'scramble']], note: 'Âm nhấn (ding) ở bước có biểu cảm, bước sau là hành động.' },
    { id: 'bien-hinh', label: 'Tích lực → biến hình → ta-da', seq: [[0, 'tu-luc'], [1.35, 'poof'], [1.85, 'ta-da']], note: 'Ba bước, mỗi bước một âm; ta-da là âm nhấn — để ở bước không có lời.' },
    { id: 'chuyen-cuoi', label: 'Bóp còi → ba-dum-tss', seq: [[0, 'honk'], [0.6, 'rimshot']], note: 'Chốt câu đùa: rimshot ở bước SAU câu thoại (S3).' }
  ];

  /* ------------------------------------------------------- spec + guide */
  var KIND_DOC = {
    tone: 'dao động một sóng (sine | triangle | square | sawtooth): hz → to (trượt mũ trong dur·glide) hoặc path [[giây, Hz]…] hoặc curve [[u 0…1, Hz]…]; a / hold (bao), lp + q (lọc thấp), am (Hz, nhấp nháy 100 %), sat 1…4 + bias (méo mềm), cents; rung vib (Hz) · vibc → vibc1 (độ sâu, cent) · vib1 (Hz cuối) · vibd (trễ) · vibr (thời gian vào)',
    noise: 'nhiễu col (white | pink | brown) qua bộ lọc type (lowpass | highpass | bandpass | notch): f0 → f1 (sau "mid" giây) → f2 (cuối), q → q1; a / hold; sat; mv [pan đầu, pan cuối]',
    crackle: 'n xung nhiễu ngắn (len s) rải ngẫu nhiên trong span s (sỏi, kim tuyến, giọt bắn); type / f0 / q; skew > 1 dồn về đầu — 3 node cho cả chuỗi',
    modes: 'chuông / thanh kim loại / gỗ: list [[tỉ số, biên độ, thời tắt s, tấn công s?]…] trên hz gốc — hài không nguyên, hài cao tắt nhanh hơn',
    voice: 'giọng liên tục (kèn, ngâm nga, còi bóp, kẽo kẹt): hz / cut [[giây, Hz, \'s\'?]…] (\'s\' = nhảy), amp [[giây, 0…1.5]…] (tuyến tính); det (cent, 2 dao động), sat, q, ftype lowpass | bandpass, rung vib…',
    fm: 'FM hai toán tử (lò xo "boing" đàn môi, "đoing", kim loại ngân, tia phép): sóng mang hz/to/path/curve; bộ điều chế = sóng mang × ratio, độ sâu index → index1 (sáng → tối); mtype; lp; sat; rung vib…',
    mallet: N_('nhạc cụ gõ có nốt: inst ({ids}), notes [[giây, Hz, độ to?]…] ≤ 32, decay (s), poly 1…6 (số giọng luân phiên: nốt ngân tới khi giọng đó gõ nốt mới), lp — một chuỗi nốt chỉ tốn 2·poly·số hài node', { ids: Object.keys(INST).join(' | ') }),
    drum: 'trống tổng hợp: thân sin hz → to (tụt cao độ trong dur·glide; kick / tom / timpani / taiko), sat + bias (dày), click (tách dùi 0…1.5), snare (dây snare 0…1.5, nf Hz, nq, ndur s)'
  };
  var EXAMPLE = {
    format: FORMAT, id: 'vi-du-am', name: 'Ví dụ gói âm', project: '', version: 1, status: 'draft',
    sounds: {
      'vi-du-coc': { label: 'Cốc đầu (ví dụ)', cat: 'hai', tags: ['cốc', 'gõ'], use: 'Ví dụ: cú cốc nhẹ vào đầu — gỗ “tóc” + lò xo rung.', dur: 0.6, level: 0.8, rev: 0.1, vary: 0.04,
        layers: [
          { k: 'modes', hz: 900, list: [[1, 1, 0.08], [2.4, 0.5, 0.04]], peak: 0.7 },
          { k: 'fm', at: 0.01, hz: 700, to: 320, glide: 0.3, ratio: 1, index: 1.5, index1: 0.2, dur: 0.5, peak: 0.4, hold: 0.05, vib: 11, vibc: 80, vibc1: 10 }
        ] },
      'vi-du-len-day': { label: 'Lên dây (ví dụ)', cat: 'nhac-cu', tags: ['mộc cầm'], use: 'Ví dụ: chuỗi mộc cầm đi lên — vui, leo trèo.', dur: 0.7, level: 0.8, rev: 0.15, vary: 0.01,
        layers: [{ k: 'mallet', inst: 'xylo', notes: [[0, 523.25], [0.06, 659.26], [0.12, 783.99], [0.18, 1046.5]], decay: 0.3, peak: 0.5 }] }
    }
  };
  function spec() {
    return {
      format: FORMAT, frame: FRAME, budget: clone(BUDGET), cats: CATS.map(function (c) { return { id: c[0], label: c[1], accent: ACCENT.indexOf(c[0]) >= 0 }; }),
      kinds: clone(KIND_DOC), keys: Object.keys(KINDS).reduce(function (o, k) { o[k] = { allowed: ['k', 'at', 'jit', 'lane'].concat(KINDS[k].keys), required: KINDS[k].need.slice(), enums: clone(KINDS[k].en) }; return o; }, {}),
      ranges: clone(RANGE), inst: clone(INST), sound: { keys: SOUND_KEYS.slice(), dur: [0.03, BUDGET.dur], level: [0.05, 2], rev: [0, 0.6], vary: [0, 0.1], use: 160, label: 40 },
      random: 'Số bất kỳ (trừ n / poly / lane) có thể là { "v": số, "r": số } = v + R·r; R ∈ [0,1) rút MỘT lần mỗi lần phát, chung mọi lớp. "jit" trên lớp = lệch giờ ngẫu nhiên riêng (s).',
      timing: 'at + jit + thời lượng lớp ≤ dur của âm + 0,05 s. lanes: [[pan đầu, pan cuối?, giây trượt?, giây bắt đầu trượt?]…]; lớp chọn làn bằng "lane": số thứ tự.',
      cue: clone(VOCAB), cueNote: 'cue: { state | fx | activity | event: [..] } = cảnh tự gán; mood: [..] là điều kiện đi kèm. Ưu tiên: gói dự án > gói dùng chung > khung.',
      legacy: LEGACY.slice(), rules: clone(RULES.list), recipes: clone(RECIPES), example: clone(EXAMPLE)
    };
  }
  // hướng dẫn cho agent / người viết kịch bản (markdown) — sinh từ dữ liệu, không viết luật ở nơi khác
  function guide(o) {
    o = o || {};
    var L = [], pr = o.project === undefined ? undefined : o.project || '';
    // mỗi dòng là MỘT msgid (N_, có placeholder cho số lấy từ RULES / BUDGET) → Studio dịch từng dòng; tiêu đề "## Quy trình ghép" giữ nguyên chữ (Studio tìm mục theo chữ này)
    L.push(N_('# Âm thanh hiệu ứng — thư viện + quy trình ghép ({code})', { code: FORMAT }), '');
    L.push(N_('Phong cách: KHOA TRƯƠNG kiểu phim hoạt hình — cao độ trượt lớn, có nốt nhạc, đuôi rung, hai nhịp đà → va. Mọi âm tổng hợp bằng code (không tệp mẫu).'), '');
    L.push(N_('## Quy trình ghép (làm theo thứ tự)'));
    // các bước đánh số NGOÀI msgid: Studio bóc "n. " rồi dịch phần chữ (msgid có biến → GenChibi.i18nMsg.msg(lang, câu) hoặc t(msgid, vars))
    [
      N_('Để TRỐNG `sfx` ở phần lớn các bước — bộ phát tự gán ≤ {n} âm theo cảm xúc (state) / hiệu ứng (fx) / hoạt động (activity) qua cue của âm (gói dự án thắng khung).', { n: RULES.autoMax }),
      N_('Chỉ đặt `sfx` khi muốn NHẤN một khoảnh khắc: tối đa {max} âm, trong đó ≤ {acc} âm nhấn (nhóm {ids}); âm nhấn để ở bước KHÔNG có lời hoặc bước trước câu.', { max: RULES.maxPerStep, acc: RULES.maxAccent, ids: ACCENT.join(' / ') }),
      N_('Va chạm (nhóm danh): dùng `action` (đòn đánh) — âm tự phát đúng điểm đánh. Đặt tay chỉ khi bước có cú va thấy được.'),
      N_('Hài: ghép "đà → va → hậu quả" trải trên 2–3 bước, mỗi bước MỘT âm (xem công thức mẫu). Âm có lấy đà (hitAt) đặt ở bước trước khung va.'),
      N_('`sfx: []` = bước im (tắt âm tự gán). Chạy lint (S1–S7) trước khi xuất: lỗi (error) phải sửa, cảnh báo (warn) nên sửa.')
    ].forEach(function (x, i) { L.push((i + 1) + '. ' + x); });
    L.push('');
    L.push(N_('## Luật (lintSoundTrack)'));
    RULES.list.forEach(function (r) { L.push('- **' + r.code + '** (' + (r.level === 'error' ? N_('lỗi') : N_('cảnh báo')) + '): ' + r.rule); });
    L.push('', N_('## Công thức ghép mẫu (giây → âm)'));
    RECIPES.forEach(function (r) { L.push('- **' + r.label + '** (`' + r.id + '`): ' + r.seq.map(function (x) { return x[0] + ' s ' + x[1]; }).join(' → ') + ' — ' + r.note); });
    L.push('', pr !== undefined ? N_('## Thư viện theo nhóm (dự án "{project}")', { project: pr }) : N_('## Thư viện theo nhóm'));
    CATS.forEach(function (c) {
      var xs = list({ cat: c[0], project: pr });
      if (!xs.length) return;
      L.push('### ' + c[1] + ' (`' + c[0] + '`)' + (ACCENT.indexOf(c[0]) >= 0 ? N_(' — âm NHẤN') : ''));
      xs.forEach(function (x) { L.push('- `' + x.name + '` — ' + x.label + ' (' + x.dur + ' s' + (x.pack !== FRAME ? N_(', gói {pack}', { pack: x.pack }) : '') + '): ' + x.use); });
    });
    L.push('', N_('## Viết gói âm mới'), N_('Gọi spec để có khuôn tham số + ví dụ chạy được. Tên âm là chung toàn thư viện (trùng = lỗi). Ngân sách ≤ {nodes} node / âm, ≤ {layers} lớp, dur ≤ {dur} s. Không nghe được ở server (Node không có Web Audio): nhờ người dùng bấm ▶ trong Studio.', { nodes: BUDGET.nodes, layers: BUDGET.layers, dur: BUDGET.dur }));
    return L.join('\n');
  }

  /* ============================================================ BỘ ÂM CHUẨN gen.am */
  // 62 âm, 8 nhóm. 17 âm đầu là tên cũ (từ vựng công khai) — thiết kế lại theo phong cách hoạt hình; cue của chúng tái lập ĐÚNG bảng
  // tự gán cũ của engine/player.js (test 2m). level: hiệu chuẩn bằng `node tools/audio-lab.mjs calibrate --write` (dòng đầu mỗi âm).
  var GEN_AM = {
    format: FORMAT, id: FRAME, name: 'Bộ âm chuẩn (khung)', version: 1, status: 'published',
    description: 'Âm thanh hiệu ứng trung lập của khung, phong cách hoạt hình khoa trương — dùng chung mọi dự án.',
    sounds: {
      /* ---------- 17 âm cũ ---------- */
      pop: { label: 'Bong bóng nổ “PÓP”', cat: 'hai', dur: 0.22, level: 2, rev: 0.05, vary: 0.04, tags: ['pop', 'bóng', 'thoại', 'bật'],
        use: 'Bong bóng thoại / vật nhỏ hiện ra, nút bật — tiếng “póp” tròn, ngắn; bộ phát tự dùng khi hiện bong bóng.',
        layers: [
          { k: 'tone', type: 'sine', hz: 330, to: 1150, glide: 0.3, dur: 0.11, peak: 1.15, a: 0.001 },
          { k: 'tone', type: 'sine', hz: 170, to: 95, dur: 0.05, peak: 0.4, a: 0.001 },
          { k: 'noise', col: 'pink', type: 'lowpass', f0: 4500, dur: 0.01, peak: 0.5, a: 0.0005 }
        ] },
      whoosh: { label: 'Vút qua “VÙÙ”', cat: 'di-chuyen', dur: 0.6, level: 1.1, rev: 0.22, tags: ['vút', 'gió', 'lao', 'chuyển cảnh'],
        use: 'Vật lớn / người lao qua, chạy, xông lên, chuyển máy — luồng gió có cao độ trượt, lướt trái sang phải.',
        cue: { state: ['vow'], activity: ['charge', 'run', 'flee'], event: ['cut'] },
        lanes: [[-0.75, 0.75, 0.5]],
        layers: [
          { k: 'noise', col: 'pink', type: 'bandpass', f0: 330, f1: 2100, mid: 0.23, f2: 420, q: 2.6, q1: 1.3, dur: 0.55, peak: 0.6, a: 0.21, lane: 0 },
          { k: 'tone', type: 'sine', hz: 250, path: [[0.23, 640], [0.5, 170]], dur: 0.52, peak: 0.1, a: 0.2, lane: 0 },
          { k: 'noise', col: 'brown', type: 'lowpass', f0: 160, f1: 260, mid: 0.2, f2: 120, dur: 0.5, peak: 0.12, a: 0.2, sat: 1.5 }
        ] },
      step: { label: 'Bước chân “póc”', cat: 'di-chuyen', dur: 0.16, level: 1.65, rev: 0.05, vary: 0.06, tags: ['bước', 'đi', 'chân'],
        use: 'Bước chân nhẹ của nhân vật nhỏ (gót rồi mũi) — bộ phát tự rải khi đi; mỗi lần một dáng khác.',
        cue: { event: ['enter'] },
        layers: [
          { k: 'tone', type: 'sine', hz: { v: 280, r: 70 }, to: 130, glide: 0.6, dur: 0.06, peak: 0.55, a: 0.002, sat: 1.3 },
          { k: 'noise', type: 'lowpass', f0: { v: 750, r: 400 }, q: 0.7, dur: 0.035, peak: 0.6, a: 0.002 },
          { k: 'tone', at: { v: 0.055, r: 0.02 }, type: 'sine', hz: { v: 380, r: 60 }, to: 240, dur: 0.035, peak: 0.28, a: 0.002 },
          { k: 'noise', at: { v: 0.055, r: 0.02 }, type: 'bandpass', f0: { v: 1500, r: 400 }, q: 0.9, dur: 0.025, peak: 0.35, a: 0.002 }
        ] },
      sting: { label: 'Giật mình “đùn-ĐÙNG!”', cat: 'cam-xuc', dur: 1.0, level: 0.36, rev: 0.35, vary: 0.01, tags: ['sốc', 'giật mình', 'kịch tính', 'nhấn'],
        use: 'Sốc, hoảng, phát hiện điều động trời — hai cú dàn kèn + trống định âm; âm nhấn, để ở bước không lời.',
        cue: { state: ['shock', 'panic'], fx: ['exclaim'], activity: ['scared'] },
        layers: [
          { k: 'drum', hz: 115, to: 70, dur: 0.15, peak: 0.35, sat: 1.8 },
          { k: 'tone', type: 'sawtooth', hz: 164.81, dur: 0.13, peak: 0.3, a: 0.008, lp: 2400, sat: 1.4 },
          { k: 'tone', type: 'sawtooth', hz: 233.08, dur: 0.13, peak: 0.27, a: 0.008, lp: 2400, cents: 6 },
          { k: 'drum', at: 0.2, hz: 100, to: 52, dur: 0.55, peak: 0.7, sat: 2, bias: 0.1 },
          { k: 'tone', at: 0.2, type: 'sawtooth', hz: 164.81, dur: 0.65, peak: 0.4, a: 0.01, lp: 2600, sat: 1.5, vib: 5.5, vibc: 14, vibd: 0.15 },
          { k: 'tone', at: 0.2, type: 'sawtooth', hz: 233.08, dur: 0.65, peak: 0.36, a: 0.01, lp: 2600, cents: 6, vib: 5.5, vibc: 14, vibd: 0.15 },
          { k: 'tone', at: 0.2, type: 'sawtooth', hz: 329.63, dur: 0.6, peak: 0.2, a: 0.01, lp: 2600, cents: -5 },
          { k: 'noise', at: 0.2, type: 'bandpass', f0: 3400, f1: 2200, q: 0.7, dur: 0.6, peak: 0.24, a: 0.003 }
        ] },
      hit: { label: 'Cú đấm “BỐP”', cat: 'danh', dur: 0.4, level: 1.89, rev: 0.16, vary: 0.04, tags: ['đấm', 'va chạm', 'bốp', 'trúng'],
        use: 'Trúng đòn thường (đấm, đá, va) — đòn đánh tự phát ở điểm đánh; đặt tay cho cú ngã đập đầu, va vào vật.',
        cue: { state: ['injured'], activity: ['kowtow', 'faint'], event: ['impact'] },
        layers: [
          { k: 'drum', hz: 190, to: 60, glide: 0.4, dur: 0.24, peak: 0.75, sat: 2.3, bias: 0.12, click: 0.45 },
          { k: 'noise', col: 'pink', type: 'bandpass', f0: 1500, f1: 450, mid: 0.06, q: 0.9, dur: 0.09, peak: 1.2, a: 0.0008 },
          { k: 'noise', type: 'bandpass', f0: 2200, q: 1.2, dur: 0.03, peak: 0.4, a: 0.0006 },
          { k: 'tone', type: 'triangle', hz: 560, to: 230, glide: 0.6, dur: 0.1, peak: 0.55, a: 0.001, sat: 1.4 },
          { k: 'fm', hz: 320, to: 120, glide: 0.7, ratio: 1.5, index: 2.2, index1: 0.2, dur: 0.18, peak: 0.3, a: 0.002 }
        ] },
      boing: { label: 'Lò xo “BOIOIOING”', cat: 'hai', dur: 1.2, level: 0.15, rev: 0.06, vary: 0.03, tags: ['lò xo', 'nảy', 'nhảy', 'choáng'],
        use: 'Nhảy bật, nảy, choáng váng, sao bay quanh đầu — đàn môi FM, cao độ vọt lên rồi rung lắc tắt dần.',
        cue: { state: ['dizzy'], fx: ['stars'], activity: ['jump'] },
        layers: [
          { k: 'noise', col: 'pink', type: 'lowpass', f0: 3000, dur: 0.012, peak: 0.25, a: 0.001 },
          { k: 'fm', hz: 170, path: [[0.06, 390], [1.1, 290]], ratio: 1, index: 2.2, index1: 0.35, dur: 1.1, peak: 0.7, a: 0.003, hold: 0.3, sat: 1.3, vib: 13, vibc: 420, vibc1: 25, vib1: 6, vibd: 0.04, vibr: 0.02 },
          { k: 'tone', type: 'triangle', hz: 85, path: [[0.06, 195], [1.1, 145]], dur: 1.1, peak: 0.4, a: 0.003, hold: 0.3, lp: 900, vib: 13, vibc: 420, vibc1: 25, vib1: 6, vibd: 0.04, vibr: 0.02 }
        ] },
      sparkle: { label: 'Lấp lánh “ting-ting-ting”', cat: 'phep', dur: 0.95, level: 0.48, rev: 0.4, vary: 0.012, tags: ['lấp lánh', 'phép', 'tự hào', 'thắng'],
        use: 'Tự hào, đắc thắng, phép nhỏ, vật quý loé sáng — chuông thanh chạy lên, trải hai bên tai.',
        cue: { state: ['proud', 'smug'], fx: ['sparkles'], activity: ['victory'] },
        lanes: [[-0.5], [0.5], [0]],
        layers: [
          { k: 'mallet', inst: 'glock', notes: [[0, 1046.5], [0.1, 1568], [0.2, 2637]], decay: 0.7, peak: 0.3, lane: 0 },
          { k: 'mallet', inst: 'glock', notes: [[0.05, 1318.5], [0.15, 2093], [0.25, 3136]], decay: 0.7, peak: 0.28, lane: 1 },
          { k: 'tone', at: 0.25, type: 'sine', hz: 3136, dur: 0.62, peak: 0.05, a: 0.05, am: 17, lane: 2 }
        ] },
      rumble: { label: 'Rung chuyển “ÙÙÙ-rầm rầm”', cat: 'tu-nhien', dur: 0.95, level: 0.49, rev: 0.2, tags: ['rung', 'động đất', 'giận', 'lửa'],
        use: 'Nổi giận sôi máu, lửa bốc, đất rung — ù trầm lắc lư + chén bát lách cách.',
        cue: { state: ['rage'], fx: ['vein', 'fire'] },
        layers: [
          { k: 'noise', col: 'brown', type: 'lowpass', f0: 160, f1: 280, mid: 0.35, f2: 170, dur: 0.92, peak: 0.4, a: 0.25, sat: 2.5, mv: [-0.25, 0.25] },
          { k: 'tone', type: 'sawtooth', hz: 48, to: 40, dur: 0.92, peak: 0.35, a: 0.25, lp: 260, q: 1.5, am: 14, sat: 1.8 },
          { k: 'tone', type: 'sawtooth', hz: 52, to: 43, dur: 0.92, peak: 0.25, a: 0.25, lp: 260, am: 19 },
          { k: 'noise', col: 'pink', type: 'bandpass', f0: 300, f1: 500, mid: 0.4, f2: 280, q: 1, dur: 0.9, peak: 0.45, a: 0.25, sat: 2 },
          { k: 'crackle', at: 0.1, n: 10, span: 0.7, len: 0.03, f0: 1400, q: 2, peak: 0.3 }
        ] },
      drip: { label: 'Giọt nước “BLÚP-tinh”', cat: 'tu-nhien', dur: 0.5, level: 0.84, rev: 0.12, vary: 0.04, tags: ['giọt', 'nước', 'mồ hôi', 'van xin'],
        use: 'Giọt mồ hôi, giọt nước, van xin rụt rè — “blúp” vọt cao độ rồi một giọt nhỏ hơn.',
        cue: { state: ['beg'], fx: ['sweat', 'sweatMany'] },
        layers: [
          { k: 'tone', type: 'sine', hz: 480, to: 1650, glide: 0.5, dur: 0.1, peak: 0.95, a: 0.002 },
          { k: 'tone', type: 'sine', hz: 960, to: 3300, glide: 0.5, dur: 0.04, peak: 0.07, a: 0.002 },
          { k: 'noise', col: 'pink', type: 'lowpass', f0: 3500, dur: 0.006, peak: 0.15, a: 0.0006 },
          { k: 'tone', at: 0.17, type: 'sine', hz: 560, to: 1350, glide: 0.5, dur: 0.09, peak: 0.42, a: 0.002 }
        ] },
      sad: { label: 'Kèn buồn “wah-wah-wah-WAAAH”', cat: 'hai', dur: 2.0, level: 0.17, rev: 0.2, vary: 0.01, tags: ['buồn', 'thất bại', 'khóc', 'trombone'],
        use: 'Thất bại, hụt hẫng, khóc, kiệt sức — trombone bịt “wah” bốn nốt tụt dần, nốt cuối rung và rơi.',
        cue: { state: ['cry', 'exhausted'], fx: ['tears'] },
        layers: [
          { k: 'voice', type: 'sawtooth', det: 7, sat: 2, q: 5, peak: 0.75,
            hz: [[0, 233.08], [0.37, 233.08], [0.4, 220, 's'], [0.77, 220], [0.8, 207.65, 's'], [1.17, 207.65], [1.2, 196, 's'], [1.55, 196], [1.95, 165]],
            cut: [[0, 450], [0.08, 1900], [0.36, 600], [0.4, 450, 's'], [0.48, 1900], [0.76, 600], [0.8, 450, 's'], [0.88, 1800], [1.16, 600], [1.2, 450, 's'], [1.32, 1700], [1.6, 900], [1.95, 350]],
            amp: [[0, 0], [0.03, 1], [0.33, 0.8], [0.37, 0], [0.4, 0], [0.43, 0.95], [0.73, 0.75], [0.77, 0], [0.8, 0], [0.83, 0.9], [1.13, 0.7], [1.17, 0], [1.2, 0], [1.24, 1], [1.75, 0.8], [1.95, 0]],
            vib: 5.5, vibc: 40, vibd: 1.35, vibr: 0.25 },
          { k: 'voice', type: 'triangle', q: 0.8, peak: 0.35,
            hz: [[0, 233.08], [0.37, 233.08], [0.4, 220, 's'], [0.77, 220], [0.8, 207.65, 's'], [1.17, 207.65], [1.2, 196, 's'], [1.55, 196], [1.95, 165]],
            cut: [[0, 1500], [1.95, 1500]],
            amp: [[0, 0], [0.03, 1], [0.33, 0.8], [0.37, 0], [0.4, 0], [0.43, 0.95], [0.73, 0.75], [0.77, 0], [0.8, 0], [0.83, 0.9], [1.13, 0.7], [1.17, 0], [1.2, 0], [1.24, 1], [1.75, 0.8], [1.95, 0]],
            vib: 5.5, vibc: 40, vibd: 1.35, vibr: 0.25 }
        ] },
      snore: { label: 'Ngáy “KHÒÒ… phìiu-u-u”', cat: 'hai', dur: 1.6, level: 0.75, rev: 0.15, vary: 0.02, tags: ['ngủ', 'ngáy', 'zzz'],
        use: 'Ngủ gật, ngủ say — hít vào khò khè rồi thở ra kèm tiếng huýt “phìiu” lượn sóng kiểu hoạt hình.',
        cue: { state: ['sleep'], fx: ['zzz'] },
        layers: [
          { k: 'noise', col: 'pink', type: 'bandpass', f0: 300, f1: 800, mid: 0.55, q: 1.2, dur: 0.62, peak: 0.6, a: 0.45 },
          { k: 'tone', at: 0.06, type: 'sawtooth', hz: 70, to: 95, dur: 0.55, peak: 0.3, a: 0.35, lp: 700, q: 2.5, am: 22, sat: 1.8 },
          { k: 'noise', at: 0.78, col: 'pink', type: 'bandpass', f0: 900, f1: 450, q: 1.1, dur: 0.65, peak: 0.4, a: 0.1 },
          { k: 'tone', at: 0.8, type: 'sine', hz: 820, path: [[0.25, 1050], [0.6, 900]], dur: 0.65, peak: 0.16, a: 0.08, vib: 8, vibc: 60 }
        ] },
      party: { label: 'Pháo giấy “BÓC! pi-pííí”', cat: 'do-vat', dur: 1.2, level: 0.51, rev: 0.3, tags: ['pháo giấy', 'mừng', 'tiệc', 'reo'],
        use: 'Ăn mừng, reo hò, tiệc — pháo giấy nổ, kèn thổi “pííí”, kim tuyến rơi, chuỗi chuông vui.',
        cue: { fx: ['confetti'], activity: ['cheer'] },
        layers: [
          { k: 'drum', hz: 220, to: 60, dur: 0.12, peak: 0.7, sat: 1.8, click: 0.6 },
          { k: 'noise', type: 'bandpass', f0: 2400, q: 0.7, dur: 0.05, peak: 0.5, a: 0.001 },
          { k: 'crackle', at: 0.05, n: 14, span: 0.7, len: 0.03, f0: 4200, q: 1.2, peak: 0.15, skew: 1.6 },
          { k: 'voice', at: 0.06, type: 'sawtooth', det: 10, sat: 1.8, q: 3, peak: 0.15, hz: [[0, 500], [0.1, 900], [0.42, 920]], cut: [[0, 1200], [0.42, 2200]], amp: [[0, 0], [0.03, 1], [0.36, 0.8], [0.42, 0]] },
          { k: 'mallet', inst: 'glock', notes: [[0.1, 1046.5], [0.17, 1318.5], [0.24, 1568], [0.31, 2093]], decay: 0.5, peak: 0.22 }
        ] },
      hmm: { label: 'Ngẫm nghĩ “Ừm-HỪM?”', cat: 'hai', dur: 0.65, level: 0.27, rev: 0.12, vary: 0.02, tags: ['nghĩ', 'thắc mắc', 'hỏi'],
        use: 'Suy nghĩ, ngờ vực, dấu hỏi — hai nốt ngâm nga như kazoo, nốt sau vọt lên như câu hỏi.',
        cue: { state: ['think', 'unsure'], fx: ['question', 'dots'] },
        layers: [
          { k: 'voice', det: 6, sat: 1.5, q: 2.6, peak: 0.55,
            hz: [[0, 196], [0.15, 196], [0.2, 220, 's'], [0.55, 349.23]],
            cut: [[0, 480], [0.17, 480], [0.2, 620, 's'], [0.46, 1500], [0.58, 700]],
            amp: [[0, 0], [0.025, 1], [0.13, 0.9], [0.16, 0], [0.2, 0], [0.24, 1], [0.5, 0.9], [0.59, 0]],
            vib: 6, vibc: 28, vibd: 0.34, vibr: 0.1 }
        ] },
      gong: { label: 'Chiêng lớn “BOANGGG”', cat: 'do-vat', dur: 3.4, level: 0.24, rev: 0.4, vary: 0.012, tags: ['chiêng', 'mở màn', 'tiêu đề'],
        use: 'Mở màn, thẻ tiêu đề, tuyên bố trọng đại — chiêng ngân dài, hơi oằn cao độ; âm dài, chỉ ở đầu / cuối cảnh.',
        layers: [
          { k: 'modes', hz: 110, list: [[1, 0.45, 3.4, 0.01], [1.0075, 0.3, 3.3, 0.01], [2.02, 0.6, 3, 0.02], [2.76, 0.5, 2.6, 0.05], [3.52, 0.35, 2.1, 0.09], [4.31, 0.28, 1.7, 0.14], [5.46, 0.2, 1.3, 0.2], [6.71, 0.13, 1, 0.25], [8.2, 0.08, 0.8, 0.3]], peak: 1 },
          { k: 'fm', hz: 110, path: [[2.5, 104]], ratio: 2.76, index: 0.9, index1: 0.05, dur: 3.2, peak: 0.25, a: 0.02, vib: 3.5, vibc: 14 },
          { k: 'tone', type: 'sine', hz: 55, dur: 2.4, peak: 0.08, a: 0.02 },
          { k: 'noise', type: 'lowpass', f0: 900, dur: 0.05, peak: 0.6, a: 0.002 },
          { k: 'noise', type: 'bandpass', f0: 3200, q: 0.8, dur: 0.35, peak: 0.25, a: 0.03 }
        ] },
      chime: { label: 'Chuông “TING-TING”', cat: 'do-vat', dur: 1.1, level: 0.42, rev: 0.1, vary: 0.012, tags: ['chuông', 'tiền', 'chào', 'lễ'],
        use: 'Chào, cúi lạy, tiền vào, tham lam — hai nhát chuông thanh trong trẻo.',
        cue: { state: ['greedy'], fx: ['coins'], activity: ['bow', 'salute'] },
        layers: [
          { k: 'mallet', inst: 'glock', notes: [[0, 1318.5], [0.11, 1760]], decay: 1, peak: 0.34 },
          { k: 'noise', col: 'pink', type: 'lowpass', f0: 5000, dur: 0.005, peak: 0.12, a: 0.0004 },
          { k: 'noise', at: 0.11, col: 'pink', type: 'lowpass', f0: 5000, dur: 0.005, peak: 0.1, a: 0.0004 }
        ] },
      swish: { label: 'Vung “VÚT”', cat: 'danh', dur: 0.32, level: 1.45, rev: 0.07, tags: ['vung', 'kiếm', 'hụt', 'chém'],
        use: 'Vung kiếm / tay, đòn hụt, chém gió — “vút” mảnh có tiếng rít trượt, lướt qua tai.',
        cue: { activity: ['attack', 'thrust'], event: ['miss'] },
        lanes: [[-0.6, 0.6, 0.24]],
        layers: [
          { k: 'noise', col: 'pink', type: 'bandpass', f0: 900, f1: 4000, mid: 0.09, f2: 1500, q: 2.4, q1: 1.2, dur: 0.24, peak: 0.6, a: 0.07, lane: 0 },
          { k: 'tone', type: 'sine', hz: 900, path: [[0.08, 2300], [0.22, 650]], dur: 0.22, peak: 0.13, a: 0.06, lane: 0 }
        ] },
      tick: { label: 'Tích tắc / mõ “CỐC”', cat: 'do-vat', dur: 0.1, level: 2, rev: 0.05, vary: 0.04, tags: ['đồng hồ', 'mõ', 'gõ', 'nhịp'],
        use: 'Đồng hồ chạy, đếm nhịp, gõ mõ, chờ đợi — “cốc” gỗ rất ngắn; lặp nhiều không sao (không tính mật độ).',
        layers: [
          { k: 'modes', hz: { v: 1750, r: 300 }, list: [[1, 1, 0.05, 0.0006], [1.77, 0.4, 0.025, 0.0006]], peak: 1 },
          { k: 'tone', type: 'sine', hz: 640, to: 520, dur: 0.035, peak: 0.45, a: 0.001 },
          { k: 'noise', type: 'bandpass', f0: { v: 2800, r: 500 }, q: 1.4, dur: 0.014, peak: 0.7, a: 0.0006 },
          { k: 'noise', type: 'highpass', f0: 5500, dur: 0.005, peak: 0.25, a: 0.0004 }
        ] },

      /* ---------- danh: va chạm & đánh ---------- */
      bonk: { label: 'Cốc đầu “CỐC—oioi”', cat: 'danh', dur: 0.7, level: 0.22, rev: 0.08, vary: 0.04, tags: ['cốc', 'gõ đầu', 'bonk', 'u đầu'],
        use: 'Bị cốc / gõ vào đầu, va trán vào cột — gõ gỗ + “đoing” tụt cao độ rồi rung lắc.',
        layers: [
          { k: 'modes', hz: 820, list: [[1, 1, 0.1, 0.0005], [2.37, 0.5, 0.05, 0.0005], [3.91, 0.2, 0.03, 0.0005]], peak: 0.6 },
          { k: 'noise', col: 'pink', type: 'lowpass', f0: 4000, dur: 0.008, peak: 0.45, a: 0.0005 },
          { k: 'drum', hz: 170, to: 75, dur: 0.12, peak: 0.5, sat: 1.6 },
          { k: 'fm', hz: 760, to: 300, glide: 0.25, ratio: 1, index: 1.6, index1: 0.25, dur: 0.62, peak: 0.6, a: 0.002, hold: 0.15, vib: 12, vibc: 90, vibc1: 8, vib1: 8, vibd: 0.06, vibr: 0.03 }
        ] },
      wham: { label: 'Cú đấm lớn “VÚÚ—RẦM!”', cat: 'danh', dur: 0.95, level: 0.2, rev: 0.2, vary: 0.02, hitAt: 0.24, tags: ['đấm mạnh', 'lấy đà', 'wham', 'trời giáng'],
        use: 'Cú trời giáng có lấy đà (vút 0,24 s rồi RẦM) — đặt ở bước TRƯỚC khung trúng đòn; đúng điểm đánh thì dùng pow.',
        lanes: [[-0.5, 0, 0.24]],
        layers: [
          { k: 'noise', col: 'pink', type: 'bandpass', f0: 300, f1: 1800, mid: 0.24, q: 1.4, dur: 0.25, peak: 0.55, a: 0.2, lane: 0 },
          { k: 'tone', type: 'sine', hz: 220, to: 760, glide: 1, dur: 0.24, peak: 0.12, a: 0.19, lane: 0 },
          { k: 'drum', at: 0.24, hz: 150, to: 40, glide: 0.4, dur: 0.42, peak: 1, sat: 2.6, bias: 0.12, click: 0.7, snare: 0.55, nf: 1900, nq: 0.7, ndur: 0.16 },
          { k: 'noise', at: 0.24, type: 'bandpass', f0: 3000, f1: 1700, q: 0.6, dur: 0.6, peak: 0.28, a: 0.002 },
          { k: 'noise', at: 0.24, col: 'pink', type: 'lowpass', f0: 2800, f1: 300, mid: 0.09, dur: 0.16, peak: 0.9, a: 0.001, sat: 1.6 },
          { k: 'tone', at: 0.24, type: 'triangle', hz: 480, to: 160, glide: 0.6, dur: 0.12, peak: 0.4, a: 0.001 },
          { k: 'tone', at: 0.24, type: 'sawtooth', hz: 98, dur: 0.3, peak: 0.25, a: 0.004, lp: 1400, sat: 1.6 },
          { k: 'tone', at: 0.24, type: 'sawtooth', hz: 146.83, dur: 0.3, peak: 0.2, a: 0.004, lp: 1400, cents: 5 }
        ] },
      pow: { label: 'Cú đấm “BỤP!”', cat: 'danh', dur: 0.5, level: 2, rev: 0.15, vary: 0.04, tags: ['đấm', 'pow', 'mạnh', 'trúng'],
        use: 'Cú đấm đanh, phát ngay (không lấy đà) — mạnh và sáng hơn hit; cho đòn kết liễu, cú knock-out.',
        layers: [
          { k: 'drum', hz: 230, to: 62, glide: 0.3, dur: 0.26, peak: 0.8, sat: 2.4, bias: 0.1, click: 0.6, snare: 0.75, nf: 2300, nq: 0.8, ndur: 0.1 },
          { k: 'tone', type: 'triangle', hz: 640, to: 180, glide: 0.5, dur: 0.13, peak: 0.5, a: 0.001, sat: 1.6, lp: 2600 },
          { k: 'noise', col: 'pink', type: 'lowpass', f0: 2600, f1: 300, mid: 0.1, dur: 0.15, peak: 0.6, a: 0.001 },
          { k: 'noise', type: 'bandpass', f0: 2600, f1: 1600, q: 0.7, dur: 0.35, peak: 0.12, a: 0.002 }
        ] },
      'kiem-cham': { label: 'Kiếm chạm “KENG!”', cat: 'danh', dur: 1.2, level: 0.49, rev: 0.25, vary: 0.02, tags: ['kiếm', 'kim loại', 'đỡ', 'clang'],
        use: 'Hai lưỡi kiếm / binh khí chạm nhau, đỡ bằng kim loại — “keng” sáng, ngân rung.',
        layers: [
          { k: 'noise', col: 'pink', type: 'lowpass', f0: 6000, dur: 0.006, peak: 0.5, a: 0.0004 },
          { k: 'noise', type: 'bandpass', f0: 3000, f1: 2200, q: 2, dur: 0.14, peak: 0.35, a: 0.001 },
          { k: 'modes', hz: 1150, list: [[1, 0.9, 1.1, 0.001], [1.506, 0.5, 0.75, 0.001], [2.41, 0.32, 0.45, 0.001], [2.98, 0.22, 0.3, 0.001], [4.08, 0.12, 0.16, 0.001]], peak: 0.45 },
          { k: 'fm', hz: 1150, ratio: 1.41, index: 1.2, index1: 0.08, dur: 1.0, peak: 0.22, a: 0.002, hold: 0.05, vib: 7, vibc: 22, vibc1: 6 }
        ] },
      'do-don': { label: 'Đỡ đòn “BỘP-keng”', cat: 'danh', dur: 0.45, level: 2, rev: 0.12, vary: 0.04, tags: ['đỡ', 'khiên', 'chặn', 'block'],
        use: 'Đỡ / chặn đòn bằng khiên, gậy, cánh tay — “bộp” gỗ dày kèm tiếng kim loại nhỏ.',
        cue: { event: ['block'] },
        layers: [
          { k: 'drum', hz: 270, to: 120, glide: 0.5, dur: 0.15, peak: 0.85, sat: 1.8, click: 0.45 },
          { k: 'modes', hz: 420, list: [[1, 1, 0.12, 0.0008], [2.6, 0.4, 0.06, 0.0008], [4.3, 0.18, 0.03, 0.0008]], peak: 0.5 },
          { k: 'modes', hz: 1900, list: [[1, 1, 0.28, 0.001], [2.72, 0.4, 0.12, 0.001]], peak: 0.16 },
          { k: 'noise', col: 'pink', type: 'bandpass', f0: 900, q: 1, dur: 0.05, peak: 0.55, a: 0.0008 }
        ] },
      'nga-xuong': { label: 'Ngã “THỊCH-thịch”', cat: 'danh', dur: 0.8, level: 0.91, rev: 0.14, vary: 0.03, tags: ['ngã', 'té', 'rơi', 'đổ'],
        use: 'Ngã sõng soài, rơi bịch xuống đất — cú thịch lớn, nảy hai lần nhỏ, bụi lả tả.',
        layers: [
          { k: 'drum', hz: 125, to: 42, glide: 0.4, dur: 0.3, peak: 1, sat: 2.3, bias: 0.12, click: 0.5 },
          { k: 'noise', col: 'pink', type: 'lowpass', f0: 1000, f1: 250, dur: 0.2, peak: 0.6, a: 0.001 },
          { k: 'tone', type: 'triangle', hz: 230, to: 110, glide: 0.6, dur: 0.12, peak: 0.45, a: 0.001 },
          { k: 'drum', at: 0.21, hz: 145, to: 55, dur: 0.17, peak: 0.55, sat: 1.8 },
          { k: 'drum', at: 0.34, hz: 160, to: 65, dur: 0.1, peak: 0.25 },
          { k: 'crackle', at: 0.04, n: 8, span: 0.45, len: 0.03, f0: 1800, q: 0.8, peak: 0.22 }
        ] },

      /* ---------- di-chuyen ---------- */
      zip: { label: 'Vút bỏ chạy “ZÍÍP”', cat: 'di-chuyen', dur: 0.38, level: 2, rev: 0.1, vary: 0.04, tags: ['chạy biến', 'zip', 'lao đi', 'ra vào'],
        use: 'Chạy biến, lao ra / vào khung hình trong tích tắc — cao độ vọt lên, lướt sang phải.',
        cue: { event: ['exit'] },
        lanes: [[0, 0.85, 0.28]],
        layers: [
          { k: 'noise', col: 'brown', type: 'lowpass', f0: 420, dur: 0.14, peak: 0.4, a: 0.003 },
          { k: 'tone', type: 'triangle', hz: 300, to: 2300, glide: 0.75, dur: 0.24, peak: 0.8, a: 0.004, lp: 3600, lane: 0 },
          { k: 'tone', type: 'sine', hz: 460, to: 3100, glide: 0.75, dur: 0.22, peak: 0.25, a: 0.004, lane: 0 },
          { k: 'noise', col: 'pink', type: 'bandpass', f0: 800, f1: 3400, q: 1.6, dur: 0.26, peak: 0.6, a: 0.02, lane: 0 }
        ] },
      zoom: { label: 'Lao vèo qua “VRRRÓOOM”', cat: 'di-chuyen', dur: 0.9, level: 1.05, rev: 0.15, vary: 0.03, tags: ['lao qua', 'xe', 'doppler', 'tốc độ'],
        use: 'Lao vèo qua trước mặt (xe, ngựa, người chạy cực nhanh) — tiếng máy rền đổi cao độ Doppler, trái sang phải.',
        lanes: [[-0.9, 0.9, 0.8]],
        layers: [
          { k: 'tone', type: 'sawtooth', hz: 250, path: [[0.36, 290], [0.5, 175], [0.8, 150]], dur: 0.8, peak: 0.32, a: 0.38, lp: 1500, q: 1.6, am: 31, sat: 1.4, lane: 0 },
          { k: 'noise', col: 'pink', type: 'bandpass', f0: 600, f1: 1800, mid: 0.4, f2: 500, q: 1.2, dur: 0.8, peak: 0.35, a: 0.38, lane: 0 }
        ] },
      tiptoe: { label: 'Rón rén “pinh-ponh”', cat: 'di-chuyen', dur: 1.3, level: 0.35, rev: 0.12, vary: 0.01, tags: ['rón rén', 'lén', 'trộm', 'pizzicato'],
        use: 'Rón rén, lén lút, kẻ trộm nhón gót — dây gảy pizzicato bò lên xuống từng nửa cung + tiếng gót “tóc”.',
        layers: [
          { k: 'mallet', inst: 'pizz', notes: [[0, 196], [0.3, 207.65], [0.6, 196], [0.9, 185]], decay: 0.42, peak: 0.85, lp: 2400 },
          { k: 'noise', type: 'bandpass', f0: 420, q: 3, dur: 0.02, peak: 0.35, a: 0.001 },
          { k: 'noise', at: 0.3, type: 'bandpass', f0: 440, q: 3, dur: 0.02, peak: 0.35, a: 0.001 },
          { k: 'noise', at: 0.6, type: 'bandpass', f0: 420, q: 3, dur: 0.02, peak: 0.35, a: 0.001 },
          { k: 'noise', at: 0.9, type: 'bandpass', f0: 400, q: 3, dur: 0.02, peak: 0.35, a: 0.001 },
          { k: 'mallet', inst: 'wood', notes: [[0.15, 1250, 0.7], [0.45, 1150, 0.6], [0.75, 1250, 0.7], [1.05, 1050, 0.6]], decay: 0.04, peak: 0.35 }
        ] },
      scramble: { label: 'Chân cuống cuồng “brrrr—vút”', cat: 'di-chuyen', dur: 0.85, level: 0.28, rev: 0.1, vary: 0.03, tags: ['chạy', 'cuống', 'quay chân', 'bỏ chạy'],
        use: 'Chân quay tít tại chỗ rồi phóng đi (hoảng hốt bỏ chạy) — gõ gỗ dồn dập dâng lên, kết bằng “vút”.',
        lanes: [[0, 0.9, 0.3, 0.46]],
        layers: [
          { k: 'mallet', inst: 'wood', notes: [[0, 480], [0.028, 560], [0.056, 500], [0.084, 590], [0.112, 530], [0.14, 620], [0.168, 560], [0.196, 660], [0.224, 600], [0.252, 700], [0.28, 640], [0.308, 740], [0.336, 680], [0.364, 790], [0.392, 730], [0.42, 850]], decay: 0.045, peak: 0.9 },
          { k: 'tone', type: 'triangle', hz: 170, to: 260, glide: 1, dur: 0.46, peak: 0.35, a: 0.03, lp: 1200, am: 28 },
          { k: 'tone', at: 0.46, type: 'triangle', hz: 340, to: 2500, glide: 0.75, dur: 0.24, peak: 0.26, a: 0.004, lp: 3600, lane: 0 },
          { k: 'noise', at: 0.46, col: 'pink', type: 'bandpass', f0: 900, f1: 3300, q: 1.5, dur: 0.26, peak: 0.22, a: 0.01, lane: 0 }
        ] },
      skid: { label: 'Phanh trượt “KÍÍÍT”', cat: 'di-chuyen', dur: 0.75, level: 0.23, rev: 0.12, vary: 0.03, tags: ['phanh', 'thắng gấp', 'trượt', 'dừng'],
        use: 'Phanh gấp, khựng lại trước vực / trước mặt ai — tiếng rít rung rần rật.',
        layers: [
          { k: 'tone', type: 'triangle', hz: 1150, to: 880, glide: 1, dur: 0.66, peak: 0.34, a: 0.015, hold: 0.25, lp: 3000, sat: 1.3, vib: 27, vibc: 85 },
          { k: 'tone', type: 'sine', hz: 2300, to: 1760, glide: 1, dur: 0.6, peak: 0.04, a: 0.015, hold: 0.2, vib: 27, vibc: 85 },
          { k: 'noise', col: 'pink', type: 'bandpass', f0: 1700, q: 2, dur: 0.66, peak: 0.5, a: 0.02, hold: 0.2, sat: 1.6 },
          { k: 'noise', col: 'brown', type: 'lowpass', f0: 300, dur: 0.3, peak: 0.2, a: 0.01 }
        ] },
      'tiep-dat': { label: 'Tiếp đất “PHỊCH”', cat: 'di-chuyen', dur: 0.4, level: 2, rev: 0.1, vary: 0.04, tags: ['tiếp đất', 'đáp', 'nhảy xuống'],
        use: 'Nhảy xuống / đáp đất gọn — “phịch” trầm + bụi phụt.',
        layers: [
          { k: 'drum', hz: 165, to: 60, dur: 0.16, peak: 0.85, sat: 1.9, click: 0.4 },
          { k: 'tone', type: 'triangle', hz: 260, to: 120, glide: 0.6, dur: 0.08, peak: 0.45, a: 0.001 },
          { k: 'noise', col: 'brown', type: 'lowpass', f0: 650, f1: 200, dur: 0.26, peak: 0.55, a: 0.004 },
          { k: 'crackle', at: 0.02, n: 5, span: 0.2, len: 0.02, f0: 1500, q: 0.9, peak: 0.2 }
        ] },

      /* ---------- hai ---------- */
      squeak: { label: 'Vịt cao su “CHÍP-chíp”', cat: 'hai', dur: 0.42, level: 0.25, rev: 0.06, vary: 0.04, tags: ['vịt', 'bóp', 'chít', 'đồ chơi'],
        use: 'Bóp đồ chơi, giẫm phải vật chít chít, cử chỉ ngớ ngẩn — hai tiếng vịt cao su.',
        layers: [
          { k: 'voice', type: 'square', q: 2, peak: 0.32, hz: [[0, 1050], [0.07, 1500], [0.14, 1320]], cut: [[0, 2300], [0.14, 2700]], amp: [[0, 0], [0.012, 1], [0.11, 0.8], [0.15, 0]], vib: 32, vibc: 45 },
          { k: 'voice', at: 0.22, type: 'square', q: 2, peak: 0.28, hz: [[0, 1150], [0.07, 1620], [0.15, 1420]], cut: [[0, 2300], [0.15, 2800]], amp: [[0, 0], [0.012, 1], [0.12, 0.75], [0.16, 0]], vib: 32, vibc: 45 }
        ] },
      honk: { label: 'Còi bóp “HÓNK-hónk”', cat: 'hai', dur: 0.62, level: 0.25, rev: 0.08, vary: 0.03, tags: ['còi', 'bóp còi', 'chú hề', 'trêu'],
        use: 'Chú hề bóp còi, trêu chọc, véo mũi, chốt câu đùa — hai tiếng còi cao su “hónk”.',
        layers: [
          { k: 'voice', type: 'sawtooth', ftype: 'bandpass', det: 18, sat: 2.6, q: 3, peak: 0.9, hz: [[0, 300], [0.035, 375], [0.24, 365], [0.29, 320]], cut: [[0, 900], [0.035, 1250], [0.27, 1050]], amp: [[0, 0], [0.015, 1], [0.23, 0.85], [0.29, 0]] },
          { k: 'voice', type: 'square', det: 10, sat: 1.8, q: 1.5, peak: 0.35, hz: [[0, 300], [0.035, 375], [0.24, 365], [0.29, 320]], cut: [[0, 600], [0.035, 700], [0.27, 600]], amp: [[0, 0], [0.015, 1], [0.23, 0.85], [0.29, 0]] },
          { k: 'noise', col: 'pink', type: 'bandpass', f0: 1800, q: 2, dur: 0.27, peak: 0.12, a: 0.01 },
          { k: 'voice', at: 0.36, type: 'sawtooth', ftype: 'bandpass', det: 18, sat: 2.6, q: 3, peak: 0.8, hz: [[0, 300], [0.03, 375], [0.15, 365], [0.2, 320]], cut: [[0, 900], [0.03, 1250], [0.18, 1050]], amp: [[0, 0], [0.012, 0.9], [0.15, 0.75], [0.2, 0]] },
          { k: 'voice', at: 0.36, type: 'square', det: 10, sat: 1.8, q: 1.5, peak: 0.3, hz: [[0, 300], [0.03, 375], [0.15, 365], [0.2, 320]], cut: [[0, 600], [0.03, 700], [0.18, 600]], amp: [[0, 0], [0.012, 0.9], [0.15, 0.75], [0.2, 0]] },
          { k: 'noise', at: 0.36, col: 'pink', type: 'bandpass', f0: 1800, q: 2, dur: 0.18, peak: 0.1, a: 0.01 }
        ] },
      'slide-up': { label: 'Còi trượt lên “PHUÍÍT↑”', cat: 'hai', dur: 0.75, level: 0.13, rev: 0.1, vary: 0.02, tags: ['còi trượt', 'nhảy', 'leo', 'bay lên'],
        use: 'Nhảy vọt, bị nhấc bổng, bay lên, nhướng mày — còi trượt vọt hai quãng tám.',
        layers: [
          { k: 'tone', type: 'sine', hz: 340, to: 1400, glide: 0.85, dur: 0.66, peak: 0.6, a: 0.04, hold: 0.5, vib: 6, vibc: 18, vibc1: 35, vibd: 0.1, vibr: 0.1 },
          { k: 'tone', type: 'sine', hz: 680, to: 2800, glide: 0.85, dur: 0.6, peak: 0.05, a: 0.04, hold: 0.45, vib: 6, vibc: 18, vibc1: 35, vibd: 0.1, vibr: 0.1 },
          { k: 'noise', col: 'pink', type: 'bandpass', f0: 900, f1: 2600, mid: 0.56, q: 1.3, dur: 0.62, peak: 0.1, a: 0.05, hold: 0.45 }
        ] },
      'slide-down': { label: 'Còi trượt xuống “PHUÙÙU↓”', cat: 'hai', dur: 0.95, level: 0.13, rev: 0.1, vary: 0.02, tags: ['còi trượt', 'rơi', 'ngã', 'tụt'],
        use: 'Rơi xuống, trượt ngã, xìu xuống — còi trượt rơi hai quãng tám, rung lắc dần.',
        layers: [
          { k: 'tone', type: 'sine', hz: 1500, to: 300, glide: 0.9, dur: 0.86, peak: 0.6, a: 0.03, hold: 0.6, vib: 6, vibc: 20, vibc1: 50, vibd: 0.1, vibr: 0.1 },
          { k: 'tone', type: 'sine', hz: 3000, to: 600, glide: 0.9, dur: 0.8, peak: 0.04, a: 0.03, hold: 0.55, vib: 6, vibc: 20, vibc1: 50, vibd: 0.1, vibr: 0.1 },
          { k: 'noise', col: 'pink', type: 'bandpass', f0: 2600, f1: 800, q: 1.3, dur: 0.82, peak: 0.1, a: 0.04, hold: 0.55 }
        ] },
      wobble: { label: 'Lắc lư “UÔNG-uông-uông”', cat: 'hai', dur: 1.0, level: 0.22, rev: 0.1, vary: 0.03, tags: ['lắc', 'run', 'thạch', 'say'],
        use: 'Run lẩy bẩy, chân nhũn, rung như thạch, say xỉn — tiếng cao su lắc lư chậm dần.',
        layers: [
          { k: 'fm', hz: 165, to: 140, glide: 1, ratio: 1, index: 2.4, index1: 0.5, dur: 0.95, peak: 0.55, a: 0.01, hold: 0.25, lp: 1600, sat: 1.3, vib: 6.5, vibc: 420, vibc1: 70, vib1: 4.5 },
          { k: 'tone', type: 'sine', hz: 82.5, to: 70, glide: 1, dur: 0.95, peak: 0.35, a: 0.01, hold: 0.25, vib: 6.5, vibc: 420, vibc1: 70, vib1: 4.5 }
        ] },
      tweet: { label: 'Chim bay vòng “chíp-chíp” (choáng)', cat: 'hai', dur: 1.6, level: 1.15, rev: 0.2, vary: 0.03, tags: ['choáng', 'chim', 'sao', 'hoa mắt'],
        use: 'Choáng sau cú va — chim hót bay vòng quanh đầu (trái → phải → trái) kèm sao lấp lánh.',
        lanes: [[-0.8, 0.8, 0.8], [0.8, -0.8, 0.8, 0.8]],
        layers: [
          { k: 'tone', jit: 0.02, type: 'sine', hz: 2150, path: [[0.025, 2850], [0.06, 2350]], dur: 0.07, peak: 0.33, a: 0.004, lane: 0 },
          { k: 'tone', at: 0.11, jit: 0.02, type: 'sine', hz: 2250, path: [[0.025, 2950], [0.06, 2450]], dur: 0.07, peak: 0.3, a: 0.004, lane: 0 },
          { k: 'tone', at: 0.4, jit: 0.02, type: 'sine', hz: 2050, path: [[0.025, 2750], [0.06, 2250]], dur: 0.07, peak: 0.33, a: 0.004, lane: 0 },
          { k: 'tone', at: 0.51, jit: 0.02, type: 'sine', hz: 2200, path: [[0.025, 2900], [0.06, 2400]], dur: 0.07, peak: 0.3, a: 0.004, lane: 0 },
          { k: 'tone', at: 0.8, jit: 0.02, type: 'sine', hz: 2150, path: [[0.025, 2850], [0.06, 2350]], dur: 0.07, peak: 0.33, a: 0.004, lane: 1 },
          { k: 'tone', at: 0.91, jit: 0.02, type: 'sine', hz: 2250, path: [[0.025, 2950], [0.06, 2450]], dur: 0.07, peak: 0.3, a: 0.004, lane: 1 },
          { k: 'tone', at: 1.2, jit: 0.02, type: 'sine', hz: 2050, path: [[0.025, 2750], [0.06, 2250]], dur: 0.07, peak: 0.33, a: 0.004, lane: 1 },
          { k: 'tone', at: 1.31, jit: 0.02, type: 'sine', hz: 2200, path: [[0.025, 2900], [0.06, 2400]], dur: 0.07, peak: 0.3, a: 0.004, lane: 1 },
          { k: 'mallet', inst: 'glock', notes: [[0.2, 1975.53, 0.5], [0.6, 2349.32, 0.5], [1, 1975.53, 0.5], [1.3, 2349.32, 0.5]], decay: 0.3, peak: 0.15, lp: 3500 }
        ] },
      splat: { label: 'Bẹp “BẸT!”', cat: 'hai', dur: 0.6, level: 1.62, rev: 0.1, vary: 0.04, tags: ['bẹp', 'bánh kem', 'dính', 'splat'],
        use: 'Ngã bẹp, ăn bánh kem vào mặt, vật nhão rơi — “bẹt” ướt, nhão rung, giọt bắn tung toé.',
        layers: [
          { k: 'noise', col: 'pink', type: 'lowpass', f0: 3200, f1: 260, mid: 0.12, q: 1.2, dur: 0.26, peak: 1, a: 0.001, sat: 1.8 },
          { k: 'noise', col: 'pink', type: 'bandpass', f0: 1800, f1: 350, mid: 0.18, q: 5, q1: 3, dur: 0.3, peak: 0.75, a: 0.002 },
          { k: 'drum', hz: 115, to: 45, dur: 0.16, peak: 0.6, sat: 2 },
          { k: 'tone', type: 'sine', hz: 420, to: 120, glide: 0.6, dur: 0.2, peak: 0.12, a: 0.002, vib: 18, vibc: 140, vibc1: 40 },
          { k: 'crackle', at: 0.06, n: 9, span: 0.4, len: 0.025, f0: 1200, q: 3, peak: 0.45 },
          { k: 'noise', at: 0.22, col: 'pink', type: 'bandpass', f0: 900, f1: 480, q: 6, dur: 0.13, peak: 0.35, a: 0.004 },
          { k: 'noise', at: 0.36, col: 'pink', type: 'bandpass', f0: 800, f1: 420, q: 6, dur: 0.1, peak: 0.22, a: 0.004 }
        ] },
      slip: { label: 'Trượt chân “VÍT—”', cat: 'hai', dur: 0.35, level: 0.99, rev: 0.08, vary: 0.04, tags: ['trượt', 'vỏ chuối', 'hụt chân'],
        use: 'Giẫm vỏ chuối, hụt chân — “vít” vọt lên + chân chới với; nối tiếp bằng slide-down / nga-xuong.',
        layers: [
          { k: 'tone', type: 'sine', hz: 480, to: 1900, glide: 1, dur: 0.15, peak: 0.8, a: 0.004 },
          { k: 'tone', type: 'square', hz: 1250, to: 1650, glide: 1, dur: 0.06, peak: 0.2, a: 0.002, lp: 2600 },
          { k: 'noise', col: 'pink', type: 'bandpass', f0: 700, f1: 2600, q: 1.5, dur: 0.17, peak: 0.55, a: 0.01 },
          { k: 'tone', at: 0.12, type: 'sine', hz: 1900, to: 2300, dur: 0.18, peak: 0.2, a: 0.01, vib: 9, vibc: 50 }
        ] },

      /* ---------- cam-xuc: cảm xúc & nhấn ---------- */
      'dun-dun': { label: 'Kịch tính “ĐÙN-ĐÙN-ĐÙNNN”', cat: 'cam-xuc', dur: 2.2, level: 0.25, rev: 0.35, vary: 0.01, tags: ['kịch tính', 'âm mưu', 'lộ mặt', 'nhấn'],
        use: 'Lộ âm mưu, sự thật động trời, kẻ xấu xuất hiện — ba nốt kèn + trống, nốt cuối ngân run; âm dài, đầu / cuối cảnh.',
        layers: [
          { k: 'drum', hz: 110, to: 78, dur: 0.24, peak: 0.6, sat: 1.8 },
          { k: 'tone', type: 'sawtooth', hz: 146.83, dur: 0.22, peak: 0.4, a: 0.01, hold: 0.1, lp: 1700, sat: 1.5 },
          { k: 'drum', at: 0.3, hz: 118, to: 84, dur: 0.24, peak: 0.6, sat: 1.8 },
          { k: 'tone', at: 0.3, type: 'sawtooth', hz: 174.61, dur: 0.22, peak: 0.4, a: 0.01, hold: 0.1, lp: 1700, sat: 1.5 },
          { k: 'drum', at: 0.6, hz: 92, to: 48, glide: 0.5, dur: 0.95, peak: 1, sat: 2.2, bias: 0.1 },
          { k: 'tone', at: 0.6, type: 'sawtooth', hz: 138.59, dur: 1.55, peak: 0.42, a: 0.012, hold: 0.5, lp: 1500, sat: 1.6, vib: 5, vibc: 14, vibd: 0.3 },
          { k: 'tone', at: 0.6, type: 'sawtooth', hz: 196, dur: 1.55, peak: 0.3, a: 0.012, hold: 0.5, lp: 1500, cents: 4 },
          { k: 'tone', at: 0.6, type: 'sawtooth', hz: 277.18, dur: 1.45, peak: 0.16, a: 0.04, hold: 0.4, lp: 1900, am: 9 },
          { k: 'noise', at: 0.6, type: 'bandpass', f0: 2800, f1: 1600, q: 0.7, dur: 1.0, peak: 0.16, a: 0.006 }
        ] },
      ding: { label: 'Ý tưởng “TING!”', cat: 'cam-xuc', dur: 1.0, level: 0.63, rev: 0.25, vary: 0.01, tags: ['ý tưởng', 'bóng đèn', 'à ra thế', 'nhấn'],
        use: 'Loé ra ý tưởng, “à ra thế!”, bóng đèn bật sáng trên đầu — một nhát chuông trong vắt + lấp lánh.',
        layers: [
          { k: 'modes', hz: 1568, list: [[1, 1, 0.95, 0.001], [2, 0.22, 0.5, 0.001], [2.76, 0.28, 0.35, 0.001], [5.4, 0.07, 0.14, 0.001]], peak: 0.4 },
          { k: 'tone', type: 'triangle', hz: 3136, dur: 0.06, peak: 0.1, a: 0.0008 },
          { k: 'noise', col: 'pink', type: 'lowpass', f0: 5000, dur: 0.005, peak: 0.25, a: 0.0004 },
          { k: 'tone', at: 0.1, type: 'sine', hz: 2637, dur: 0.4, peak: 0.06, a: 0.05, vib: 9, vibc: 30 }
        ] },
      'giat-minh': { label: 'Giật nảy “UÉT!”', cat: 'cam-xuc', dur: 0.6, level: 0.65, rev: 0.2, vary: 0.02, tags: ['giật mình', 'hết hồn', 'nhảy dựng', 'nhấn'],
        use: 'Giật nảy người, tóc dựng đứng — tiếng rít vọt lên như dây đàn kéo mạnh + cú trống; ngắn hơn sting.',
        layers: [
          { k: 'drum', hz: 190, to: 95, dur: 0.12, peak: 0.6, sat: 1.6, snare: 0.4, nf: 2400, ndur: 0.08 },
          { k: 'tone', type: 'sawtooth', hz: 380, to: 1250, glide: 0.4, dur: 0.42, peak: 0.24, a: 0.008, hold: 0.08, lp: 2800, q: 2, sat: 1.4, vib: 9, vibc: 40, vibd: 0.12 },
          { k: 'fm', hz: 570, to: 1800, glide: 0.35, ratio: 2, index: 1.5, index1: 0.3, dur: 0.36, peak: 0.18, a: 0.006 },
          { k: 'noise', type: 'bandpass', f0: 3000, f1: 2000, q: 0.8, dur: 0.35, peak: 0.16, a: 0.002 }
        ] },
      'tim-dap': { label: 'Tim đập “THỊCH-thịch”', cat: 'cam-xuc', dur: 1.25, level: 0.4, rev: 0.1, vary: 0.02, tags: ['tim', 'hồi hộp', 'sợ', 'yêu'],
        use: 'Hồi hộp, sợ run, tim đập thình thịch (trái tim phồng ra khỏi ngực) — hai nhịp “thịch-thịch”.',
        layers: [
          { k: 'drum', hz: 110, to: 55, dur: 0.16, peak: 1, sat: 2.6, bias: 0.2, click: 0.25 },
          { k: 'tone', type: 'triangle', hz: 220, to: 150, dur: 0.12, peak: 0.45, a: 0.003 },
          { k: 'drum', at: 0.18, hz: 98, to: 52, dur: 0.18, peak: 0.75, sat: 2.6, bias: 0.2 },
          { k: 'drum', at: 0.7, hz: 110, to: 55, dur: 0.16, peak: 1, sat: 2.6, bias: 0.2, click: 0.25 },
          { k: 'tone', at: 0.7, type: 'triangle', hz: 220, to: 150, dur: 0.12, peak: 0.45, a: 0.003 },
          { k: 'drum', at: 0.88, hz: 98, to: 52, dur: 0.18, peak: 0.75, sat: 2.6, bias: 0.2 }
        ] },
      'tim-bay': { label: 'Mê tít “fuýt-fiuuu”', cat: 'cam-xuc', dur: 1.35, level: 0.29, rev: 0.3, vary: 0.01, tags: ['yêu', 'mê', 'tim bay', 'huýt sáo'],
        use: 'Phải lòng, mắt hình trái tim, khen “đẹp quá” — đàn hạc lướt lên + tiếng huýt sáo hai nhịp.',
        layers: [
          { k: 'mallet', inst: 'harp', notes: [[0, 523.25], [0.045, 587.33], [0.09, 659.26], [0.135, 783.99], [0.18, 880], [0.225, 1046.5]], decay: 0.9, peak: 0.3, poly: 3 },
          { k: 'tone', at: 0.3, type: 'sine', hz: 950, to: 2100, glide: 0.8, dur: 0.2, peak: 0.32, a: 0.02 },
          { k: 'tone', at: 0.58, type: 'sine', hz: 1150, path: [[0.18, 2300], [0.62, 1200]], dur: 0.68, peak: 0.34, a: 0.02, hold: 0.2, vib: 6, vibc: 20, vibd: 0.25, vibr: 0.1 }
        ] },
      'xi-hoi': { label: 'Giận bốc hơi “XÌÌÌ—TUÝT”', cat: 'cam-xuc', dur: 1.5, level: 0.3, rev: 0.15, vary: 0.02, tags: ['giận', 'bốc hơi', 'ấm sôi', 'tức'],
        use: 'Tức sôi máu, khói bốc lên đầu — xì hơi + còi ấm nước rít lên run run.',
        layers: [
          { k: 'noise', col: 'brown', type: 'lowpass', f0: 420, dur: 0.3, peak: 0.3, a: 0.004 },
          { k: 'noise', col: 'pink', type: 'bandpass', f0: 2400, f1: 3000, q: 0.9, dur: 1.35, peak: 0.28, a: 0.12, hold: 0.7 },
          { k: 'tone', type: 'sine', hz: 1400, to: 2050, glide: 0.6, dur: 1.3, peak: 0.24, a: 0.35, hold: 0.55, vib: 11, vibc: 35 }
        ] },
      'cang-thang': { label: 'Căng thẳng dâng “ỪỪỪ↑”', cat: 'cam-xuc', dur: 2.0, level: 0.69, rev: 0.3, vary: 0.01, tags: ['căng thẳng', 'dồn nén', 'sắp nổ', 'riser'],
        use: 'Không khí căng dần trước cao trào (đối mặt, đếm ngược) — dây rung tremolo dâng cao rồi cắt phụt.',
        layers: [
          { k: 'tone', type: 'sawtooth', hz: 220, to: 440, glide: 1, dur: 1.9, peak: 0.26, a: 1.55, hold: 0.27, lp: 2200, am: 11, sat: 1.2 },
          { k: 'tone', type: 'sawtooth', hz: 233.08, to: 466.16, glide: 1, dur: 1.9, peak: 0.2, a: 1.55, hold: 0.27, lp: 2200, am: 13 },
          { k: 'noise', col: 'pink', type: 'bandpass', f0: 500, f1: 2800, q: 1.5, dur: 1.9, peak: 0.2, a: 1.6, hold: 0.22 }
        ] },
      gulp: { label: 'Nuốt khan “ỰC”', cat: 'cam-xuc', dur: 0.4, level: 0.85, rev: 0.06, vary: 0.04, tags: ['nuốt', 'lo', 'sợ', 'ực'],
        use: 'Nuốt nước bọt vì sợ / lo, cổ họng chạy lên xuống — “ực” tụt giọng + “bụp” nhỏ.',
        layers: [
          { k: 'noise', col: 'pink', type: 'lowpass', f0: 2500, dur: 0.01, peak: 0.35, a: 0.0005 },
          { k: 'voice', type: 'sawtooth', q: 5, peak: 0.42, hz: [[0, 185], [0.13, 120]], cut: [[0, 1400], [0.06, 520], [0.13, 360]], amp: [[0, 0], [0.01, 1], [0.08, 0.6], [0.14, 0]] },
          { k: 'tone', at: 0.02, type: 'sine', hz: 540, to: 160, glide: 0.6, dur: 0.13, peak: 0.5, a: 0.002 },
          { k: 'tone', at: 0.2, type: 'sine', hz: 300, to: 720, glide: 0.6, dur: 0.06, peak: 0.22, a: 0.002 }
        ] },

      /* ---------- phep ---------- */
      poof: { label: 'Biến hình “BÙM-phụt”', cat: 'phep', dur: 1.0, level: 0.49, rev: 0.3, vary: 0.02, tags: ['biến', 'khói', 'phép', 'xuất hiện'],
        use: 'Biến hình, hiện ra / biến mất trong làn khói — “phụt” khói + đàn hạc lướt + lấp lánh.',
        layers: [
          { k: 'noise', col: 'pink', type: 'lowpass', f0: 1900, f1: 300, mid: 0.25, dur: 0.42, peak: 0.9, a: 0.004, sat: 1.4 },
          { k: 'drum', hz: 125, to: 60, dur: 0.2, peak: 0.5, sat: 1.6 },
          { k: 'mallet', at: 0.08, inst: 'harp', notes: [[0, 783.99], [0.035, 987.77], [0.07, 1174.66], [0.105, 1567.98], [0.14, 1975.53]], decay: 0.6, peak: 0.22, poly: 3 },
          { k: 'tone', at: 0.25, type: 'sine', hz: 2349.3, dur: 0.6, peak: 0.05, a: 0.06, am: 14 }
        ] },
      'dich-chuyen': { label: 'Dịch chuyển “VUÙNG—bụp”', cat: 'phep', dur: 0.85, level: 0.29, rev: 0.25, vary: 0.03, tags: ['dịch chuyển', 'teleport', 'biến mất'],
        use: 'Dịch chuyển tức thời, bị hút đi, chui vào cổng phép — vút lên lấp lánh rồi “bụp”.',
        layers: [
          { k: 'fm', hz: 200, to: 1600, glide: 0.95, ratio: 1.5, index: 3, index1: 0.5, dur: 0.56, peak: 0.34, a: 0.03, hold: 0.3, vib: 14, vibc: 60 },
          { k: 'tone', type: 'sine', hz: 400, to: 3000, glide: 1, dur: 0.56, peak: 0.07, a: 0.05, hold: 0.3, am: 22 },
          { k: 'tone', at: 0.56, type: 'sine', hz: 600, to: 1500, glide: 0.4, dur: 0.07, peak: 0.5, a: 0.001 },
          { k: 'noise', at: 0.56, col: 'pink', type: 'lowpass', f0: 3500, dur: 0.01, peak: 0.4, a: 0.0005 }
        ] },
      'tu-luc': { label: 'Tích lực “pi-pi-pi-VÙÙNG”', cat: 'phep', dur: 1.45, level: 0.39, rev: 0.25, vary: 0.01, tags: ['tích lực', 'power-up', 'gồng', 'năng lượng'],
        use: 'Gồng mình tích lực, nạp năng lượng, sắp tung tuyệt chiêu — hợp âm rải dâng lên + tiếng ù dồn nén.',
        layers: [
          { k: 'voice', type: 'square', det: 8, q: 1, peak: 0.22,
            hz: [[0, 261.63], [0.08, 329.63, 's'], [0.16, 392, 's'], [0.24, 523.25, 's'], [0.32, 659.26, 's'], [0.4, 783.99, 's'], [0.48, 1046.5, 's'], [1.35, 1046.5]],
            cut: [[0, 1200], [0.5, 3000], [1.35, 2600]],
            amp: [[0, 0], [0.01, 0.6], [0.48, 1], [1.2, 0.85], [1.35, 0]], vib: 7, vibc: 25, vibd: 0.55, vibr: 0.2 },
          { k: 'tone', type: 'sawtooth', hz: 110, to: 440, glide: 1, dur: 1.35, peak: 0.26, a: 1.0, hold: 0.25, lp: 1200, am: 16, sat: 1.3 },
          { k: 'noise', col: 'pink', type: 'bandpass', f0: 400, f1: 2500, q: 2, dur: 1.35, peak: 0.18, a: 1.0, hold: 0.25 }
        ] },
      zap: { label: 'Tia phép “PIU!”', cat: 'phep', dur: 0.35, level: 1.11, rev: 0.15, vary: 0.04, tags: ['tia', 'bắn', 'laser', 'phép'],
        use: 'Bắn tia phép / tia sáng, chưởng nhỏ — “piu” tụt cao độ nhanh.',
        layers: [
          { k: 'fm', hz: 2200, to: 220, glide: 1, ratio: 0.5, index: 2, index1: 0.4, dur: 0.26, peak: 0.8, a: 0.001 },
          { k: 'tone', type: 'square', hz: 1800, to: 180, glide: 1, dur: 0.2, peak: 0.14, a: 0.001, lp: 3000 }
        ] },

      /* ---------- tu-nhien ---------- */
      sam: { label: 'Sấm “RẮC—ĐÙNG!”', cat: 'tu-nhien', dur: 2.0, level: 0.22, rev: 0.3, vary: 0.03, tags: ['sấm', 'sét', 'giông', 'bão', 'boom', 'thunder'],
        use: 'Sấm sét (thật, hay “sét đánh ngang tai” khi nghe tin dữ) — tiếng rắc rồi nổ trầm cuộn dài.',
        layers: [
          { k: 'crackle', n: 24, span: 0.24, len: 0.018, f0: 2200, q: 0.8, peak: 0.9, skew: 1.6 },
          { k: 'noise', col: 'pink', type: 'bandpass', f0: 1500, f1: 600, q: 0.8, dur: 0.22, peak: 0.7, a: 0.001, sat: 2 },
          { k: 'drum', at: 0.12, hz: 70, to: 32, glide: 0.5, dur: 0.9, peak: 1, sat: 2.6, bias: 0.15 },
          { k: 'noise', at: 0.12, col: 'brown', type: 'lowpass', f0: 420, f1: 120, dur: 1.75, peak: 0.75, a: 0.02, hold: 0.2, sat: 2 },
          { k: 'tone', at: 0.2, type: 'sawtooth', hz: 46, to: 38, glide: 1, dur: 1.4, peak: 0.25, a: 0.15, lp: 220, am: 9, sat: 1.6 }
        ] },
      'gio-giat': { label: 'Gió rít “VUUU-u-u”', cat: 'tu-nhien', dur: 1.6, level: 1.2, rev: 0.2, vary: 0.03, tags: ['gió', 'lạnh', 'hoang vắng', 'thổi bay'],
        use: 'Cơn gió rít qua, cảnh hoang vắng / im phăng phắc, bị thổi bay — gió hú có cao độ lượn.',
        layers: [
          { k: 'noise', col: 'pink', type: 'bandpass', f0: 500, f1: 1100, mid: 0.6, f2: 600, q: 6, q1: 4, dur: 1.5, peak: 0.7, a: 0.4, mv: [-0.6, 0.6] },
          { k: 'tone', type: 'sine', hz: 500, path: [[0.6, 1000], [1.4, 650]], dur: 1.5, peak: 0.07, a: 0.4, vib: 4, vibc: 50 },
          { k: 'noise', col: 'brown', type: 'lowpass', f0: 300, dur: 1.5, peak: 0.15, a: 0.5 }
        ] },
      'te-nuoc': { label: 'Rơi tõm “TÙM!”', cat: 'tu-nhien', dur: 1.0, level: 1.39, rev: 0.2, vary: 0.04, tags: ['nước', 'tõm', 'bắn nước', 'rơi xuống'],
        use: 'Rơi tõm xuống nước, té nước — “tùm” tụt cao độ, nước bắn, bong bóng nổi lên.',
        layers: [
          { k: 'tone', type: 'sine', hz: 900, to: 200, glide: 0.4, dur: 0.2, peak: 0.5, a: 0.002 },
          { k: 'noise', col: 'pink', type: 'bandpass', f0: 1200, f1: 500, q: 0.8, dur: 0.5, peak: 0.9, a: 0.005, sat: 1.5 },
          { k: 'crackle', at: 0.12, n: 14, span: 0.6, len: 0.025, f0: 2200, q: 2, peak: 0.35 },
          { k: 'tone', at: 0.32, type: 'sine', hz: 400, to: 900, glide: 0.6, dur: 0.05, peak: 0.25, a: 0.002 },
          { k: 'tone', at: 0.45, type: 'sine', hz: 500, to: 1100, glide: 0.6, dur: 0.05, peak: 0.2, a: 0.002 },
          { k: 'tone', at: 0.58, type: 'sine', hz: 350, to: 800, glide: 0.6, dur: 0.05, peak: 0.18, a: 0.002 }
        ] },
      'bot-nuoc': { label: 'Sủi bọt “BLÚP-blúp”', cat: 'tu-nhien', dur: 1.0, level: 1.2, rev: 0.12, vary: 0.05, tags: ['bọt', 'nước sôi', 'dưới nước', 'nồi'],
        use: 'Nồi sôi, dưới nước, ngâm mình, độc dược sủi — chuỗi bong bóng “blúp” vọt cao độ.',
        layers: [
          { k: 'noise', col: 'brown', type: 'lowpass', f0: 300, dur: 0.9, peak: 0.08, a: 0.2 },
          { k: 'tone', jit: 0.05, type: 'sine', hz: { v: 280, r: 60 }, to: 650, glide: 0.6, dur: 0.06, peak: 0.4, a: 0.003 },
          { k: 'tone', at: 0.13, jit: 0.05, type: 'sine', hz: 380, to: 870, glide: 0.6, dur: 0.06, peak: 0.35, a: 0.003 },
          { k: 'tone', at: 0.27, jit: 0.05, type: 'sine', hz: 260, to: 600, glide: 0.6, dur: 0.06, peak: 0.4, a: 0.003 },
          { k: 'tone', at: 0.37, jit: 0.05, type: 'sine', hz: 420, to: 960, glide: 0.6, dur: 0.06, peak: 0.3, a: 0.003 },
          { k: 'tone', at: 0.52, jit: 0.05, type: 'sine', hz: 330, to: 760, glide: 0.6, dur: 0.06, peak: 0.38, a: 0.003 },
          { k: 'tone', at: 0.68, jit: 0.05, type: 'sine', hz: 460, to: 1050, glide: 0.6, dur: 0.06, peak: 0.3, a: 0.003 }
        ] },

      /* ---------- do-vat ---------- */
      'go-cua': { label: 'Gõ cửa “CỘC-CỘC-CỘC”', cat: 'do-vat', dur: 0.7, level: 0.35, rev: 0.15, vary: 0.03, tags: ['gõ cửa', 'có khách', 'gỗ'],
        use: 'Có người gõ cửa, gõ bàn đòi chú ý — ba tiếng gỗ dày.',
        layers: [
          { k: 'mallet', inst: 'wood', notes: [[0, 245], [0.17, 240, 0.9], [0.34, 250]], decay: 0.1, peak: 0.8 },
          { k: 'drum', hz: 150, to: 90, dur: 0.07, peak: 0.55, sat: 1.5 },
          { k: 'drum', at: 0.17, hz: 150, to: 90, dur: 0.07, peak: 0.5, sat: 1.5 },
          { k: 'drum', at: 0.34, hz: 150, to: 90, dur: 0.07, peak: 0.55, sat: 1.5 },
          { k: 'noise', col: 'pink', type: 'bandpass', f0: 1800, q: 1, dur: 0.012, peak: 0.5, a: 0.0005 },
          { k: 'noise', at: 0.17, col: 'pink', type: 'bandpass', f0: 1800, q: 1, dur: 0.012, peak: 0.45, a: 0.0005 },
          { k: 'noise', at: 0.34, col: 'pink', type: 'bandpass', f0: 1800, q: 1, dur: 0.012, peak: 0.5, a: 0.0005 }
        ] },
      'cua-ket': { label: 'Cửa kẽo kẹt “KÉÉÉT”', cat: 'do-vat', dur: 1.3, level: 1.48, rev: 0.25, vary: 0.04, tags: ['cửa', 'kẽo kẹt', 'rùng rợn', 'lén'],
        use: 'Cửa / sàn gỗ kẽo kẹt, mở cửa rón rén, cảnh rùng rợn — tiếng nghiến từng nấc + rít lượn.',
        layers: [
          { k: 'voice', type: 'sawtooth', ftype: 'bandpass', q: 9, sat: 2, peak: 0.9,
            hz: [[0, 34], [0.3, 52], [0.55, 40], [0.85, 66], [1.15, 48]], cut: [[0, 1100], [1.15, 1500]],
            amp: [[0, 0], [0.06, 1], [0.12, 0.4], [0.18, 0.9], [0.26, 0.3], [0.34, 1], [0.42, 0.5], [0.5, 0.9], [0.6, 0.35], [0.68, 1], [0.78, 0.45], [0.86, 0.95], [0.95, 0.4], [1.05, 0.85], [1.15, 0.3], [1.2, 0]] },
          { k: 'tone', at: 0.05, type: 'triangle', hz: 650, path: [[0.5, 880], [1.1, 610]], dur: 1.15, peak: 0.05, a: 0.15, hold: 0.6, lp: 2000, vib: 16, vibc: 45 }
        ] },
      'dong-xu': { label: 'Nhặt xu “TINH-TING”', cat: 'do-vat', dur: 0.6, level: 0.45, rev: 0.12, vary: 0.01, tags: ['xu', 'tiền', 'nhặt', 'điểm'],
        use: 'Nhặt được xu / vật nhỏ, ghi điểm — hai nốt vui kiểu trò chơi.',
        layers: [
          { k: 'voice', type: 'square', q: 0.7, peak: 0.2, hz: [[0, 987.77], [0.075, 1318.5, 's'], [0.5, 1318.5]], cut: [[0, 3200], [0.5, 2400]], amp: [[0, 0], [0.004, 1], [0.07, 0.75], [0.078, 1], [0.5, 0]] },
          { k: 'modes', at: 0.075, hz: 2640, list: [[1, 1, 0.35, 0.001], [2.1, 0.35, 0.15, 0.001]], peak: 0.1 }
        ] },
      'bao-thuc': { label: 'Báo thức “RENG-RENG”', cat: 'do-vat', dur: 1.5, level: 0.51, rev: 0.15, vary: 0.01, tags: ['báo thức', 'chuông', 'dậy', 'gấp'],
        use: 'Đồng hồ báo thức, chuông reo gấp, hết giờ — hai chuông đồng bị búa nhỏ gõ dồn dập.',
        layers: [
          { k: 'mallet', inst: 'bell', lp: 3000, decay: 0.12, peak: 0.3,
            notes: [[0, 1650], [0.05, 1850], [0.1, 1650], [0.15, 1850], [0.2, 1650], [0.25, 1850], [0.3, 1650], [0.35, 1850], [0.4, 1650], [0.45, 1850], [0.5, 1650], [0.55, 1850], [0.6, 1650],
              [0.65, 1850], [0.7, 1650], [0.75, 1850], [0.8, 1650], [0.85, 1850], [0.9, 1650], [0.95, 1850], [1, 1650], [1.05, 1850], [1.1, 1650, 0.8], [1.15, 1850, 0.7], [1.2, 1650, 0.55], [1.25, 1850, 0.4]] }
        ] },

      /* ---------- nhac-cu ---------- */
      'ta-da': { label: 'Kèn mừng “TA-DAAA!”', cat: 'nhac-cu', dur: 1.6, level: 0.25, rev: 0.35, vary: 0.005, tags: ['ta-da', 'xuất hiện', 'thành công', 'kèn'],
        use: 'Ra mắt hoành tráng, làm xong trò ảo thuật, thành công — kèn đồng hai hợp âm, nốt sau ngân rung.',
        layers: [
          { k: 'tone', type: 'sawtooth', hz: 196, dur: 0.14, peak: 0.24, a: 0.008, hold: 0.06, lp: 2400, sat: 1.3 },
          { k: 'tone', type: 'sawtooth', hz: 246.94, dur: 0.14, peak: 0.2, a: 0.008, hold: 0.06, lp: 2400 },
          { k: 'tone', type: 'sawtooth', hz: 293.66, dur: 0.14, peak: 0.2, a: 0.008, hold: 0.06, lp: 2400 },
          { k: 'voice', at: 0.2, det: 6, sat: 1.3, q: 1.2, peak: 0.3, hz: [[0, 245.93], [0.06, 261.63], [1.3, 261.63]], cut: [[0, 900], [0.06, 2800], [1.3, 1600]], amp: [[0, 0], [0.02, 1], [0.9, 0.85], [1.3, 0]], vib: 5.5, vibc: 18, vibd: 0.35, vibr: 0.2 },
          { k: 'voice', at: 0.2, sat: 1.3, q: 1.2, peak: 0.24, hz: [[0, 309.85], [0.06, 329.63], [1.3, 329.63]], cut: [[0, 900], [0.06, 2800], [1.3, 1600]], amp: [[0, 0], [0.02, 1], [0.9, 0.85], [1.3, 0]], vib: 5.5, vibc: 18, vibd: 0.35, vibr: 0.2 },
          { k: 'voice', at: 0.2, sat: 1.3, q: 1.2, peak: 0.24, hz: [[0, 368.48], [0.06, 392], [1.3, 392]], cut: [[0, 900], [0.06, 2800], [1.3, 1600]], amp: [[0, 0], [0.02, 1], [0.9, 0.85], [1.3, 0]], vib: 5.5, vibc: 18, vibd: 0.35, vibr: 0.2 },
          { k: 'voice', at: 0.2, sat: 1.3, q: 1.2, peak: 0.18, hz: [[0, 491.85], [0.06, 523.25], [1.3, 523.25]], cut: [[0, 900], [0.06, 3000], [1.3, 1800]], amp: [[0, 0], [0.02, 1], [0.9, 0.85], [1.3, 0]], vib: 5.5, vibc: 18, vibd: 0.35, vibr: 0.2 },
          { k: 'drum', at: 0.2, hz: 98, to: 60, dur: 0.6, peak: 0.6, sat: 1.6 },
          { k: 'noise', at: 0.2, type: 'bandpass', f0: 3200, f1: 2200, q: 0.6, dur: 1.0, peak: 0.16, a: 0.003 }
        ] },
      rimshot: { label: 'Ba-dum-TSS', cat: 'nhac-cu', dur: 1.1, level: 0.53, rev: 0.2, vary: 0.01, tags: ['câu đùa', 'chốt', 'trống', 'ba-dum-tss'],
        use: 'Chốt câu đùa nhạt / câu chơi chữ — hai tom “ba-dum” + snare và chũm chọe “TSS”; đặt ở bước SAU câu thoại.',
        layers: [
          { k: 'drum', hz: 210, to: 160, glide: 0.6, dur: 0.18, peak: 0.75, sat: 1.5, click: 0.35 },
          { k: 'drum', at: 0.16, hz: 145, to: 105, glide: 0.6, dur: 0.24, peak: 0.8, sat: 1.5, click: 0.35 },
          { k: 'drum', at: 0.42, hz: 195, to: 170, dur: 0.12, peak: 0.55, sat: 1.4, snare: 1, nf: 2700, nq: 0.8, ndur: 0.17 },
          { k: 'noise', at: 0.42, type: 'bandpass', f0: 3400, f1: 2500, q: 0.6, dur: 0.65, peak: 0.32, a: 0.002 }
        ] },
      'xylo-up': { label: 'Mộc cầm chạy lên', cat: 'nhac-cu', dur: 0.75, level: 0.33, rev: 0.2, vary: 0.005, tags: ['mộc cầm', 'leo', 'vui', 'đi lên'],
        use: 'Leo trèo, mọi thứ suôn sẻ, hớn hở đi lên — chuỗi mộc cầm chạy nhanh lên một quãng tám rưỡi.',
        layers: [
          { k: 'mallet', inst: 'xylo', notes: [[0, 523.25], [0.045, 587.33], [0.09, 659.26], [0.135, 783.99], [0.18, 880], [0.225, 1046.5], [0.27, 1174.66], [0.315, 1318.51]], decay: 0.45, peak: 0.5 }
        ] },
      'xylo-down': { label: 'Mộc cầm rơi xuống', cat: 'nhac-cu', dur: 0.95, level: 0.37, rev: 0.2, vary: 0.005, tags: ['mộc cầm', 'rơi', 'lăn cầu thang', 'choáng'],
        use: 'Lăn lông lốc xuống cầu thang, đổ sụp, hoa mắt — chuỗi mộc cầm chạy xuống, chậm dần ở cuối.',
        layers: [
          { k: 'mallet', inst: 'xylo', notes: [[0, 1567.98], [0.05, 1318.51], [0.1, 1174.66], [0.15, 1046.5], [0.2, 880], [0.255, 783.99], [0.315, 659.26], [0.38, 587.33], [0.46, 523.25]], decay: 0.45, peak: 0.5 }
        ] },
      'harp-gliss': { label: 'Đàn hạc lướt (mơ / hồi tưởng)', cat: 'nhac-cu', dur: 1.6, level: 0.34, rev: 0.4, vary: 0.005, tags: ['đàn hạc', 'mơ', 'hồi tưởng', 'phép'],
        use: 'Chìm vào giấc mơ, hồi tưởng, chuyển cảnh mềm, phép màu dịu — đàn hạc lướt hai quãng tám.',
        layers: [
          { k: 'mallet', inst: 'harp', poly: 6, decay: 1, peak: 0.28,
            notes: [[0, 261.63], [0.035, 293.66], [0.07, 329.63], [0.105, 349.23], [0.14, 392], [0.175, 440], [0.21, 493.88], [0.245, 523.25], [0.28, 587.33], [0.315, 659.26],
              [0.35, 698.46], [0.385, 783.99], [0.42, 880], [0.455, 987.77], [0.49, 1046.5], [0.525, 1174.66]] }
        ] }
    }
  };

  var API = {
    FORMAT: FORMAT, FRAME: FRAME, LINT_MAX: LINT_MAX, CATS: CATS, ACCENT: ACCENT, VOCAB: VOCAB, LEGACY: LEGACY, INST: INST, BUDGET: BUDGET, RULES: RULES, RECIPES: RECIPES, EXAMPLE: EXAMPLE,
    validateSoundPack: validateSoundPack, refsOf: refsOf, bundleDeps: bundleDeps, projectFor: projectFor, allowedSounds: allowedSounds, registerPack: registerPack, unregisterPack: unregisterPack, get: get, has: has, names: names, packs: packs, pack: pack,
    info: info, list: list, cueFor: cueFor, cueTable: cueTable, lintSoundTrack: lintSoundTrack, suggest: suggest, nodesOf: nodesOf, layerDur: layerDur, spec: spec, guide: guide,
    catLabel: function (c) { return CAT_LABEL[c] || ''; }
  };
  // nạp bộ chuẩn qua CÙNG cổng kiểm như gói người dùng (frame: cho phép id "gen.am") — sai là lỗi lập trình, báo to
  var r0 = registerPack(GEN_AM, { frame: true });
  if (r0.errors.length && typeof console !== 'undefined') console.error('[GC.sounds] bộ âm chuẩn không qua cổng:', r0.errors.slice(0, 5).join(' | '));
  if (GC) GC.sounds = API;
  if (typeof module === 'object' && module && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window.GenChibi : (typeof globalThis !== 'undefined' ? globalThis.GenChibi : undefined));
