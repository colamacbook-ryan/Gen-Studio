/* gen-chibi engine — i18n 0.1: giao diện nhiều ngôn ngữ kiểu gettext (ADR 0007)
 * © 2026 Gen Labs — All rights reserved.
 *
 * msgid = chuỗi tiếng Việt HIỆN CÓ trong mã (ngôn ngữ nguồn). Chế độ vi trả nguyên msgid → không đổi một chữ nào so với trước.
 * Ngôn ngữ khác tra bảng (locales/<lang>/*.json: { "msgid tiếng Việt": "bản dịch" }); thiếu thì trả msgid và ghi vào danh sách thiếu.
 *   t(msgid, vars)          → chuỗi theo ngôn ngữ hiện tại; placeholder {ten} thay bằng String(vars.ten) (không có khoá thì giữ nguyên {ten})
 *   tr(lang, msgid, vars)   → như t nhưng chỉ định ngôn ngữ (server: mỗi yêu cầu một ngôn ngữ, không đụng ngôn ngữ chung)
 *   label(s, vars)          → nhãn DỮ LIỆU (tên âm, vai giọng, biểu cảm… hoặc tên do người dùng đặt): có bản dịch thì dịch, không thì giữ nguyên,
 *                             KHÔNG ghi vào danh sách thiếu (nội dung người dùng không bao giờ là "thiếu bản dịch")
 *   N(msgid)                → đánh dấu chuỗi để công cụ quét thu thập, trả nguyên (bảng hằng ở cấp module; dịch lúc HIỂN THỊ bằng t())
 *   setLang / lang / add(lang, dict) / has(lang, msgid) / missing(lang) / locale()
 * Số nhiều: bản dịch có thể là mảng [một, nhiều] — chọn theo vars.n (hoặc biến số đầu tiên): n === 1 → một.
 * Ngân sách (L-42): bảng nạp MỘT lần; t() là một lần tra đối tượng + một replace — gọi lúc dựng giao diện, không gọi mỗi khung hình.
 * Thuần dữ liệu, không đụng DOM: chạy trong trình duyệt (GenChibi.i18n), trong vm của server (loadEngine) và require() thẳng từ Node.
 */
(function (GC) {
  'use strict';
  var hasOwn = function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); };
  var SOURCE = 'vi';             // ngôn ngữ của msgid
  var LANGS = ['en', 'vi'];      // ngôn ngữ giao diện hỗ trợ; en là mặc định (ADR 0007)
  var DEFAULT = 'en';
  var MISS_CAP = 2000;           // trần danh sách thiếu (server chạy lâu: không phình bộ nhớ vì chuỗi động)
  var dicts = {}, cur = DEFAULT, miss = {}, nMiss = 0;

  // 'en-GB' / 'vi_VN' / ' EN ' → 'en' | 'vi'; lạ → ''
  function norm(l) {
    var b = String(l == null ? '' : l).trim().toLowerCase().split(/[-_]/)[0];
    return LANGS.indexOf(b) >= 0 ? b : '';
  }
  function fmt(s, vars) {
    if (!vars || typeof vars !== 'object') return s;
    return s.replace(/\{([A-Za-z0-9_]+)\}/g, function (m, k) { return hasOwn(vars, k) ? String(vars[k]) : m; });
  }
  function countOf(vars) {
    if (!vars || typeof vars !== 'object') return null;
    if (hasOwn(vars, 'n')) return +vars.n;
    for (var k in vars) if (hasOwn(vars, k) && typeof vars[k] === 'number') return vars[k];
    return null;
  }
  // bản dịch thô (chuỗi hoặc [một, nhiều]) → chuỗi; null khi không có
  function pick(v, vars) {
    if (typeof v === 'string') return v || null;
    if (Array.isArray(v) && v.length && typeof v[0] === 'string') { var n = countOf(vars); return (n === 1 || v.length < 2 ? v[0] : v[1]) || null; }
    return null;
  }
  function lookup(l, id, vars) {
    if (l === SOURCE) return id;
    var d = dicts[l];
    return d && hasOwn(d, id) ? pick(d[id], vars) : null;
  }
  function note(l, id) {
    var k = l + '\u0000' + id;
    if (!hasOwn(miss, k) && nMiss < MISS_CAP) { miss[k] = 1; nMiss++; }
  }
  function translate(l, msgid, vars) {
    var id = String(msgid == null ? '' : msgid), L = norm(l) || cur;
    var s = id ? lookup(L, id, vars) : id;
    if (s === null) { s = id; note(L, id); }
    return fmt(s, vars);
  }
  // NGỮ CẢNH (kiểu pgettext): cùng một chữ tiếng Việt mà tiếng Anh khác nghĩa ("Cập nhật" = menu Updates / cột Updated, "Đạt" = duyệt Approved /
  // cổng kiểm Passed) → khoá "[ngữ cảnh] msgid". Tiếng Việt vẫn hiện msgid; thiếu khoá có ngữ cảnh thì ghi thiếu rồi rơi về bản dịch của msgid trần
  function ctxKey(ctx, msgid) { return '[' + String(ctx) + '] ' + String(msgid == null ? '' : msgid); }
  function ptranslate(l, ctx, msgid, vars) {
    var id = String(msgid == null ? '' : msgid), L = norm(l) || cur;
    if (!id || L === SOURCE) return fmt(id, vars);
    var k = ctxKey(ctx, id), s = lookup(L, k, vars);
    if (s === null) { note(L, k); s = lookup(L, id, vars); if (s === null) s = id; }
    return fmt(s, vars);
  }
  function label(l, s, vars) {
    var id = String(s == null ? '' : s), L = norm(l) || cur;
    var r = id ? lookup(L, id, vars) : id;
    return fmt(r === null ? id : r, vars);
  }

  var I = {
    SOURCE: SOURCE, LANGS: LANGS.slice(), DEFAULT: DEFAULT,
    norm: norm, fmt: fmt,
    t: function (msgid, vars) { return translate(cur, msgid, vars); },
    pt: function (ctx, msgid, vars) { return ptranslate(cur, ctx, msgid, vars); },
    ptr: ptranslate, ctxKey: ctxKey,
    tr: translate,
    label: function (s, vars) { return label(cur, s, vars); },
    labelIn: label,
    N: function (msgid) { return msgid; },
    lang: function () { return cur; },
    setLang: function (l) { var n = norm(l); if (n) cur = n; return cur; },
    // nạp (gộp) một bảng: { msgid: bản dịch | [một, nhiều] }; khoá bắt đầu bằng "//" (ghi chú trong tệp JSON) bị bỏ qua
    add: function (l, dict) {
      var n = norm(l);
      if (!n || n === SOURCE || !dict || typeof dict !== 'object') return 0;
      var d = dicts[n] || (dicts[n] = {}), c = 0;
      for (var k in dict) if (hasOwn(dict, k) && k.slice(0, 2) !== '//' && pick(dict[k], { n: 2 }) !== null) { d[k] = dict[k]; c++; }
      return c;
    },
    has: function (l, msgid) { var n = norm(l); return n === SOURCE || !!(n && dicts[n] && hasOwn(dicts[n], String(msgid)) && pick(dicts[n][String(msgid)], { n: 2 }) !== null); },
    size: function (l) { var d = dicts[norm(l)]; return d ? Object.keys(d).length : 0; },
    // msgid đã gọi qua t() mà bảng thiếu (theo ngôn ngữ; mặc định ngôn ngữ hiện tại)
    missing: function (l) {
      var L = norm(l) || cur, out = [];
      for (var k in miss) if (hasOwn(miss, k) && k.slice(0, k.indexOf('\u0000')) === L) out.push(k.slice(k.indexOf('\u0000') + 1));
      return out;
    },
    clearMissing: function () { miss = {}; nMiss = 0; },
    // locale cho Intl / toLocaleString: người dùng châu Âu đọc giờ 24h, ngày/tháng
    locale: function (l) { return (norm(l) || cur) === 'vi' ? 'vi-VN' : 'en-GB'; }
  };
  if (GC) GC.i18n = I;
  if (typeof module === 'object' && module && module.exports) module.exports = I;
})(typeof window !== 'undefined' ? window.GenChibi : (typeof globalThis !== 'undefined' ? globalThis.GenChibi : undefined));
