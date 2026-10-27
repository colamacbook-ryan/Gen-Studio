/* gen-chibi engine — voices 0.2: GIỌNG THEO VAI (tuổi × giới × văn / võ × tính cách) cho tiếng Việt, tiếng Anh, tiếng Trung, tiếng Quảng Đông
 * © 2026 Gen Labs — All rights reserved.
 *
 * Một nguồn cho mọi nơi cần "nhân vật này nói giọng gì": giọng AI (server/voice.js — Gemini TTS), giọng trình duyệt dự phòng
 * (engine/audio.js — speechSynthesis đúng ngôn ngữ + giọng vùng + giới, cao độ / tốc độ theo vai), Studio (ô chọn vai), MCP (get_catalog).
 *   vai (ROLES): cách nói (style — gửi trong speech_metadata.style, KHÔNG chứa tuổi / giới / giọng vùng: những thứ đó thuộc về GIỌNG),
 *     chân dung để THIẾT KẾ giọng, tuổi + cao độ để chọn giọng thư viện Google, giọng dựng sẵn hợp vai, cao độ / tốc độ cho giọng trình duyệt.
 *   ngôn ngữ (LANGS): giọng vùng + mã BCP-47 của từng vùng (giọng trình duyệt) + câu mô tả khi thiết kế + mã ngôn ngữ thư viện Google.
 *     Giọng vùng THẬT chỉ có ở giọng đã thiết kế (thư viện tiếng Việt không phân Bắc / Trung / Nam) — và giọng trình duyệt theo mã vùng nếu máy có.
 *   cast(asset, opts) → hồ sơ giọng của một nhân vật (vai, ngôn ngữ, giọng vùng, cao độ / tốc độ) — chọn giọng AI cụ thể là việc của server.
 * Thuần dữ liệu, không đụng DOM: chạy trong trình duyệt, trong vm của server (loadEngine) và require() thẳng từ Node.
 */
(function (GC) {
  'use strict';
  var hasOwn = function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); };

  // 30 giọng dựng sẵn của Gemini TTS: [tên, giới m / f / n (đối chiếu dữ liệu thư viện giọng Google 2026-10-19), chất giọng]
  var AI_VOICES = [
    ['Charon', 'm', 'trầm, rõ'], ['Algenib', 'm', 'khàn, dày'], ['Orus', 'm', 'chắc, dứt khoát'], ['Alnilam', 'm', 'chắc'], ['Rasalgethi', 'm', 'rõ ý'],
    ['Iapetus', 'm', 'trong, rõ'], ['Schedar', 'm', 'đều, điềm tĩnh'], ['Sadaltager', 'm', 'từng trải'], ['Algieba', 'm', 'mượt'], ['Enceladus', 'm', 'nhiều hơi thở'],
    ['Umbriel', 'm', 'thoải mái'], ['Zubenelgenubi', 'm', 'tự nhiên, đời thường'], ['Achird', 'm', 'thân thiện'], ['Puck', 'm', 'vui tươi'], ['Fenrir', 'm', 'hào hứng'], ['Sadachbia', 'm', 'sinh động'],
    ['Kore', 'f', 'chắc, rõ'], ['Gacrux', 'f', 'trưởng thành'], ['Sulafat', 'f', 'ấm áp'], ['Vindemiatrix', 'f', 'dịu dàng'], ['Achernar', 'f', 'nhẹ nhàng'], ['Despina', 'f', 'mượt'],
    ['Erinome', 'f', 'trong'], ['Callirrhoe', 'f', 'thoải mái'], ['Aoede', 'f', 'thoáng, nhẹ'], ['Pulcherrima', 'n', 'thẳng thắn, trung tính'], ['Zephyr', 'f', 'sáng'], ['Autonoe', 'f', 'sáng'],
    ['Laomedeia', 'f', 'vui tươi'], ['Leda', 'f', 'trẻ trung']
  ].map(function (v) { return { name: v[0], gender: v[1], style: v[2] }; });
  var AI_SET = {}; AI_VOICES.forEach(function (v) { AI_SET[v.name] = v; });

  // nhóm tuổi theo thứ tự hiện trong ô chọn
  var AGES = [['tre-em', 'Trẻ em'], ['thieu-nien', 'Thiếu niên'], ['thanh-nien', 'Thanh niên'], ['trung-nien', 'Trung niên'], ['cao-tuoi', 'Cao tuổi']];
  // kiểu vai (văn / võ / quyền quý / tính cách) — để lọc và để Studio gom nhóm
  var KINDS = { thuong: 'Thường ngày', van: 'Văn', vo: 'Võ', quy: 'Quyền quý', hai: 'Hài', ac: 'Phản diện', ke: 'Kể chuyện' };

  // [id, nhãn, nhóm tuổi, giới m/f, kiểu, cách nói (style — KHÔNG ghi tuổi / giới / giọng vùng: Google dặn những thứ đó thuộc về GIỌNG),
  //  chân dung để THIẾT KẾ giọng (tuổi + chất giọng, tiếng Anh), tuổi hợp vai [min, max] để chọn giọng thư viện (null = vai trẻ em: thư viện
  //  không có, Google chặn thiết kế giọng trẻ em → giọng trẻ trung có sẵn), cao độ ưu tiên low / medium / high,
  //  giọng dựng sẵn hợp vai (thứ tự ưu tiên; đã đối chiếu giới + cao độ với dữ liệu Google 2026-10-19), cao độ, tốc độ (giọng trình duyệt)]
  // Vai trẻ em lồng bằng giọng nữ cao trẻ trung — cách làm phổ biến của phim hoạt hình, không giả lập giọng trẻ thật.
  var ROLE_ROWS = [
    ['be-trai', 'Bé trai', 'tre-em', 'm', 'thuong', 'bright, playful, energetic', '', null, 'high', ['Leda', 'Laomedeia', 'Zephyr'], 1.55, 1.08],
    ['be-gai', 'Bé gái', 'tre-em', 'f', 'thuong', 'sweet, cheerful, bubbly', '', null, 'high', ['Leda', 'Zephyr', 'Laomedeia', 'Achernar'], 1.7, 1.08],
    ['thieu-nien', 'Cậu thiếu niên', 'thieu-nien', 'm', 'thuong', 'energetic, eager', '', null, 'high', ['Fenrir', 'Puck', 'Achird'], 1.25, 1.06],
    ['thieu-nu', 'Cô thiếu nữ', 'thieu-nien', 'f', 'thuong', 'lively, clear', '', null, 'high', ['Leda', 'Autonoe', 'Zephyr'], 1.38, 1.06],
    ['nam-tre', 'Nam thanh niên', 'thanh-nien', 'm', 'thuong', 'friendly, natural', 'a friendly young man in his mid 20s with a clear, natural voice', [20, 32], 'medium', ['Achird', 'Puck', 'Umbriel', 'Zubenelgenubi'], 1.05, 1.02],
    ['nu-tre', 'Nữ thanh niên', 'thanh-nien', 'f', 'thuong', 'warm, natural', 'a warm young woman in her mid 20s with a clear, natural voice', [20, 32], 'medium', ['Aoede', 'Callirrhoe', 'Despina', 'Zephyr'], 1.2, 1.02],
    ['hiep-khach', 'Hiệp khách trẻ', 'thanh-nien', 'm', 'vo', 'calm, confident, resolute', 'a calm, confident young swordsman in his late 20s with a clear, steady voice', [22, 35], 'medium', ['Iapetus', 'Orus', 'Algieba'], 1, 1],
    ['nu-tuong', 'Nữ tướng', 'thanh-nien', 'f', 'vo', 'fierce, firm, commanding', 'a fierce female general in her 30s with a firm, commanding voice', [26, 45], 'low', ['Kore', 'Gacrux'], 1, 1],
    ['tieu-thu', 'Tiểu thư / nữ văn sĩ', 'thanh-nien', 'f', 'van', 'soft, graceful, refined', 'an elegant, refined young lady poet in her 20s with a soft, graceful voice', [20, 32], 'high', ['Despina', 'Erinome', 'Achernar', 'Vindemiatrix'], 1.15, 0.95],
    ['nam-trung-nien', 'Đàn ông trung niên', 'trung-nien', 'm', 'thuong', 'steady, grounded', 'a steady middle-aged man in his late 40s with a grounded voice', [38, 55], 'low', ['Charon', 'Iapetus', 'Schedar'], 0.9, 0.97],
    ['nu-trung-nien', 'Phụ nữ trung niên', 'trung-nien', 'f', 'thuong', 'warm, firm', 'a warm, firm middle-aged woman in her late 40s', [38, 55], 'medium', ['Sulafat', 'Kore', 'Gacrux'], 1.02, 0.97],
    ['vo-tuong', 'Võ tướng', 'trung-nien', 'm', 'vo', 'booming, commanding, powerful', 'a powerful battle-hardened general in his 40s with a booming, deep, commanding voice', [32, 55], 'low', ['Alnilam', 'Orus', 'Algenib', 'Charon'], 0.72, 0.96],
    ['quan-su', 'Quân sư / văn sĩ', 'trung-nien', 'm', 'van', 'calm, measured, wise', 'a calm, scholarly strategist in his 40s with a measured, wise and refined voice', [35, 60], 'medium', ['Sadaltager', 'Rasalgethi', 'Schedar', 'Iapetus'], 0.95, 0.9],
    ['vua-chua', 'Vua / chủ công', 'trung-nien', 'm', 'quy', 'dignified, authoritative, regal', 'a dignified ruler in his 50s with a regal, authoritative and resonant voice', [40, 62], 'low', ['Charon', 'Schedar', 'Alnilam'], 0.85, 0.92],
    ['hoang-hau', 'Hoàng hậu / phu nhân', 'trung-nien', 'f', 'quy', 'dignified, composed, regal', 'a dignified noble lady in her 40s with a composed, regal voice', [35, 58], 'medium', ['Gacrux', 'Kore', 'Despina'], 1, 0.93],
    ['phan-dien', 'Phản diện', 'trung-nien', 'm', 'ac', 'menacing, sly, low', 'a cunning, menacing villain in his 40s with a low, sly, smooth voice', [30, 58], 'low', ['Algenib', 'Enceladus', 'Charon'], 0.8, 0.94],
    ['nu-phan-dien', 'Nữ phản diện', 'trung-nien', 'f', 'ac', 'cold, cunning, smooth', 'a cunning villainess in her 30s with a cold, smooth voice', [28, 55], 'medium', ['Despina', 'Gacrux', 'Kore'], 0.95, 0.95],
    ['hai-huoc', 'Vai hài', 'thanh-nien', 'm', 'hai', 'silly, exaggerated, bouncy', 'a goofy comic sidekick in his 20s with a silly, exaggerated, bouncy voice', [20, 40], 'medium', ['Fenrir', 'Sadachbia', 'Puck'], 1.3, 1.14],
    ['nu-hai-huoc', 'Vai hài (nữ)', 'thanh-nien', 'f', 'hai', 'bubbly, exaggerated, playful', 'a bubbly comic young woman in her 20s with an exaggerated, playful voice', [20, 40], 'high', ['Laomedeia', 'Leda', 'Autonoe'], 1.4, 1.12],
    ['ong-lao', 'Ông lão', 'cao-tuoi', 'm', 'thuong', 'slow, slightly raspy, wise', 'a wise grandfather in his late 70s with a slow, slightly raspy, warm voice', [55, 99], 'low', ['Algenib', 'Sadaltager', 'Enceladus'], 0.8, 0.84],
    ['ba-lao', 'Bà lão', 'cao-tuoi', 'f', 'thuong', 'slow, gentle, slightly shaky', 'a kind grandmother in her late 70s with a soft, slightly shaky, slow and warm voice', [53, 99], 'medium', ['Gacrux', 'Vindemiatrix', 'Sulafat'], 0.95, 0.84],
    ['ke-chuyen', 'Người kể chuyện', 'trung-nien', 'm', 'ke', 'warm, even pacing, storytelling', 'a warm storyteller in his 50s with an even, engaging narrator voice', [40, 65], 'low', ['Schedar', 'Charon', 'Sulafat'], 0.95, 0.95]
  ];
  var ROLES = {};
  ROLE_ROWS.forEach(function (r) { ROLES[r[0]] = { id: r[0], label: r[1], age: r[2], gender: r[3], kind: r[4], style: r[5], tags: r[5], design: r[6], ages: r[7], prefPitch: r[8], ai: r[9], pitch: r[10], rate: r[11] }; });
  // Google chặn THIẾT KẾ giọng trẻ em / vị thành niên (chính sách an toàn — đo 2026-10-19: "Voice prompt was blocked by safety policies")
  function canDesign(id) { return hasOwn(ROLES, id) && !!ROLES[id].design; }

  // ngôn ngữ phim + giọng vùng; mặc định của mỗi ngôn ngữ đứng đầu. Thẻ giọng vùng đi cùng thẻ vai trong [ ] đầu câu.
  // [id, nhãn, tên giọng vùng (tiếng Anh), cụm mô tả khi THIẾT KẾ giọng, mã ngôn ngữ thư viện / thiết kế giọng Google, mã BCP-47 cho giọng trình duyệt]
  // vi / en / zh / yue — thứ tự hiện trong ô chọn
  // Thư viện giọng Google (quét 2026-10-19): vi-VN 40 giọng người lớn 22–62 tuổi, KHÔNG phân Bắc / Nam; en-US 215, en-GB 117; tiếng Trung 0
  // → giọng vùng tiếng Việt và mọi giọng tiếng Trung đúng chất chỉ có qua Thiết kế giọng.
  var LANGS = {
    vi: { label: 'Tiếng Việt', bcp: 'vi-VN', accents: [
      ['bac', 'Giọng Bắc', 'Northern Vietnamese (Hanoi) accent', 'Vietnamese, from Hanoi, speaking Vietnamese with a natural Northern (Hanoi) accent', 'vi-VN', 'vi-VN'],
      ['nam', 'Giọng Nam', 'Southern Vietnamese (Saigon) accent', 'Vietnamese, from Saigon, speaking Vietnamese with a natural Southern (Saigon) accent', 'vi-VN', 'vi-VN'],
      ['trung', 'Giọng Trung (Huế)', 'Central Vietnamese (Hue) accent', 'Vietnamese, from Hue, speaking Vietnamese with a natural Central (Hue) accent', 'vi-VN', 'vi-VN']] },
    en: { label: 'Tiếng Anh', bcp: 'en-US', accents: [
      ['us', 'Anh Mỹ', 'American English accent', 'American, speaking English with a General American accent', 'en-US', 'en-US'],
      ['uk', 'Anh Anh', 'British English accent', 'British, speaking English with a Southern British accent', 'en-GB', 'en-GB']] },
    zh: { label: 'Tiếng Trung', bcp: 'zh-CN', accents: [
      ['pt', 'Phổ thông', 'standard Mandarin Chinese', 'Chinese, speaking standard Mandarin Chinese (Putonghua) with clear pronunciation', 'cmn-CN', 'zh-CN'],
      ['tw', 'Đài Loan', 'Taiwanese Mandarin accent', 'Taiwanese, speaking Mandarin Chinese with a Taiwanese accent', 'cmn-TW', 'zh-TW']] },
    // tiếng Quảng Đông là NGÔN NGỮ riêng (không phải giọng vùng của tiếng Trung phổ thông): model đọc theo chữ — viết lời thoại bằng
    // tiếng Quảng Đông (phồn thể + khẩu ngữ 喺 / 咩 / 我哋…) thì giọng nào cũng đọc ra Quảng Đông (đo 2026-10-19: nhận diện 0,99);
    // thiết kế giọng với mã yue-HK chạy được; thư viện Google chưa có giọng Quảng Đông
    yue: { label: 'Tiếng Quảng Đông', bcp: 'zh-HK', accents: [['hk', 'Hồng Kông', 'Hong Kong Cantonese', 'Hong Konger, speaking Cantonese with a natural Hong Kong accent', 'yue-HK', 'zh-HK']] }
  };
  function lang(id) { return hasOwn(LANGS, id) ? id : 'vi'; }
  function accent(l, a) {
    var L = LANGS[lang(l)], i;
    for (i = 0; i < L.accents.length; i++) if (L.accents[i][0] === a) return L.accents[i];
    return L.accents[0];
  }

  // đoán vai từ vai trò / tính cách / tên (khi nhân vật chưa chọn vai). Vai trò + tính cách xét TRƯỚC tên:
  // "Bé Na — Nhân viên mới" là người lớn, chữ "Bé" trong tên chỉ là biệt danh. \b của JS không hiểu chữ có dấu → tự viết biên.
  var B = '(?:^|[\\s,.;:()/"\'-])', E = '(?=$|[\\s,.;:()/"\'-])';
  function kw(words) { return new RegExp(B + '(?:' + words + ')' + E, 'i'); }
  var FEMALE = kw('cô|chị|bà|nàng|công chúa|tiểu thư|bé gái|mẹ|nữ|phu nhân|hoàng hậu|tiên nữ|thiếu nữ|nữ tướng|nữ hiệp|girl|woman|lady|queen|princess|mother|她|女');
  var RULES = [   // [biểu thức, vai nam, vai nữ] — luật đầu tiên khớp thắng
    [kw('ông lão|ông già|ông cụ|cụ ông|bà lão|bà già|bà cụ|cụ bà|lão nhân|trưởng lão|lão ông|lão bà|ông nội|bà nội|ông ngoại|bà ngoại|elder|old man|old woman|grandpa|grandma|老人|老爷|奶奶|爷爷'), 'ong-lao', 'ba-lao'],
    [kw('em bé|bé trai|bé gái|trẻ con|nhóc|tiểu đồng|đứa trẻ|child|kid|little boy|little girl|孩子|小孩|童'), 'be-trai', 'be-gai'],
    [kw('thiếu niên|thiếu nữ|học sinh|cậu bé|cô bé|teen|teenager|student|少年|少女'), 'thieu-nien', 'thieu-nu'],
    [kw('vua|hoàng đế|thiên tử|hoàng thượng|chúa công|chủ công|chúa|king|emperor|lord|皇帝|主公|王'), 'vua-chua', 'hoang-hau'],
    [kw('hoàng hậu|phu nhân|thái hậu|queen|empress|皇后|夫人'), 'vua-chua', 'hoang-hau'],
    [kw('quân sư|mưu sĩ|thừa tướng|tiên sinh|thư sinh|học sĩ|văn sĩ|nho sinh|đạo sĩ|nhà thơ|strategist|scholar|advisor|军师|谋士|先生'), 'quan-su', 'tieu-thu'],
    [kw('hiệp khách|kiếm khách|hiệp sĩ|kiếm sĩ|swordsman|knight|侠|剑客'), 'hiep-khach', 'nu-tuong'],
    [kw('võ tướng|đại tướng|tướng quân|tướng|chiến binh|dũng sĩ|võ sĩ|lính|binh|warrior|general|soldier|将军|将|兵'), 'vo-tuong', 'nu-tuong'],
    [kw('phản diện|gian thần|gian|ác|tặc|cướp|ma vương|villain|bandit|evil|反派|贼'), 'phan-dien', 'nu-phan-dien'],
    [kw('hài|lầy|ngố|hề|comic|clown|funny|搞笑'), 'hai-huoc', 'nu-hai-huoc'],
    [kw('người kể chuyện|người dẫn chuyện|dẫn chuyện|narrator|旁白'), 'ke-chuyen', 'nu-trung-nien'],
    [kw('tiểu thư|công chúa|princess|小姐|公主'), 'nam-tre', 'tieu-thu'],
    [kw('sếp|giám đốc|trưởng phòng|bố|cha|mẹ|chú|bác|thầy|cô giáo|boss|manager|father|mother|teacher|老板|经理'), 'nam-trung-nien', 'nu-trung-nien']
  ];
  function textOf(a) { return a ? [a.role, a.persona, a.desc].filter(Boolean).join(' · ').toLowerCase() : ''; }
  // vai giọng của một nhân vật: vai đã chọn (asset.voice.role) nếu hợp lệ, không thì đoán từ vai trò / tính cách / tên — MỘT nguồn cho Studio, server, phim xuất
  function roleOf(a) { var r = a && a.voice && a.voice.role; return typeof r === 'string' && hasOwn(ROLES, r) ? r : guessRole(a); }
  function guessRole(a) {
    var meta = textOf(a), name = String((a && a.name) || '').toLowerCase(), fem = FEMALE.test(meta) || FEMALE.test(name), i;
    for (i = 0; i < RULES.length; i++) if (RULES[i][0].test(meta)) return RULES[i][fem ? 2 : 1];
    for (i = 0; i < RULES.length; i++) if (RULES[i][0].test(name)) return RULES[i][fem ? 2 : 1];
    return fem ? 'nu-tre' : 'nam-tre';
  }
  // băm chuỗi ổn định (FNV-1a) — cùng nhân vật luôn ra cùng giọng trong nhóm hợp vai
  function hash(s) { var h = 2166136261, i; s = String(s || ''); for (i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  // khoảng cao độ / tốc độ giọng nhân vật — MỘT nguồn cho engine, server (mcp.prepare), Studio
  var CLAMP = { pitch: [0.5, 2], rate: [0.6, 1.6] };
  var num = function (n, lo, hi, d) { return typeof n === 'number' && isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d; };

  // giọng Gemini cho vai: xoay danh sách hợp vai theo băm id (ổn định), bỏ giọng đã có người dùng trong cùng tác phẩm (taken);
  // hết giọng hợp vai thì lấy giọng cùng giới chưa ai dùng; hết nữa mới cho trùng
  function pickAi(R, asset, taken) {
    var h = hash(asset && (asset.id || asset.key || asset.name)), n = R.ai.length, i, k, t = taken || {};
    for (i = 0; i < n; i++) { k = R.ai[(h + i) % n]; if (!t[k]) return k; }
    var same = AI_VOICES.filter(function (v) { return v.gender === R.gender && !t[v.name]; });
    return same.length ? same[h % same.length].name : R.ai[h % n];
  }
  // hồ sơ giọng của một nhân vật. opts: { lang, accent } của tác phẩm (nhân vật có voice.accent riêng thì giữ của nhân vật)
  // → { role, label, gender, lang, bcp, accent, ai, tags (vai + giọng vùng), pitch, rate }
  function cast(asset, opts) {
    var v = (asset && asset.voice) || {}, o = opts || {};
    var rid = hasOwn(ROLES, v.role) ? v.role : guessRole(asset), R = ROLES[rid];
    var l = lang(o.lang), ac = accent(l, v.accent && accent(l, v.accent)[0] === v.accent ? v.accent : o.accent);
    var ai = typeof v.ai === 'string' && hasOwn(AI_SET, v.ai) ? v.ai : pickAi(R, asset, o.taken);
    return { role: rid, label: R.label, gender: R.gender, lang: l, bcp: ac[5] || LANGS[l].bcp, accent: ac[0], ai: ai,
      style: R.style, libLang: ac[4], ages: R.ages, prefPitch: R.prefPitch,
      design: R.design ? 'A ' + R.design.replace(/^an? /, '') + '. ' + ac[3] + '.' : '',
      pitch: num(v.pitch, CLAMP.pitch[0], CLAMP.pitch[1], R.pitch), rate: num(v.rate, CLAMP.rate[0], CLAMP.rate[1], R.rate) };
  }
  // cảm xúc (18 trạng thái của khung) + kiểu bong bóng → cách nói (speech_metadata.style của Interactions API; model đời trước: [ ] đầu câu)
  var STATE_TAGS = {
    normal: '', work: 'focused', think: 'thoughtful', unsure: 'hesitant', smug: 'smug', greedy: 'greedy, sly', proud: 'proud',
    vow: 'determined, solemn', beg: 'pleading', shock: 'shocked', panic: 'panicked, fast', rage: 'angry', dizzy: 'dazed',
    cry: 'crying, sobbing', injured: 'in pain', exhausted: 'exhausted, out of breath', lazy: 'lazy, yawning', sleep: 'sleepy, mumbling'
  };
  var BUBBLE_TAGS = { shout: 'shouting', whisper: 'whispering', think: 'inner thought, softly' };
  function mood(state, bubble) { return [hasOwn(STATE_TAGS, state) ? STATE_TAGS[state] : '', hasOwn(BUBBLE_TAGS, bubble) ? BUBBLE_TAGS[bubble] : ''].filter(Boolean).join(', '); }
  // danh sách cho ô chọn / catalog: [{ id, label, age, ageLabel, gender, kind, kindLabel }] theo nhóm tuổi
  function roleList() {
    var out = [];
    AGES.forEach(function (ag) { ROLE_ROWS.forEach(function (r) { if (r[2] === ag[0]) out.push({ id: r[0], label: r[1], age: r[2], ageLabel: ag[1], gender: r[3], kind: r[4], kindLabel: KINDS[r[4]] }); }); });
    return out;
  }
  function langList() {
    return Object.keys(LANGS).map(function (k) { return { id: k, label: LANGS[k].label, bcp: LANGS[k].bcp, accents: LANGS[k].accents.map(function (a) { return { id: a[0], label: a[1] }; }) }; });
  }

  var V = { AI_VOICES: AI_VOICES, canDesign: canDesign, CLAMP: CLAMP, isAiVoice: function (n) { return hasOwn(AI_SET, n); }, ROLES: ROLES, LANGS: LANGS, AGES: AGES, KINDS: KINDS, STATE_TAGS: STATE_TAGS, BUBBLE_TAGS: BUBBLE_TAGS,
    cast: cast, guessRole: guessRole, roleOf: roleOf, mood: mood, lang: lang, accent: function (l, a) { return accent(l, a)[0]; }, roleList: roleList, langList: langList };
  if (GC) GC.voices = V;
  if (typeof module === 'object' && module && module.exports) module.exports = V;
})(typeof window !== 'undefined' ? window.GenChibi : (typeof globalThis !== 'undefined' ? globalThis.GenChibi : undefined));
