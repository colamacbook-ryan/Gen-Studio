// © 2026 Gen Labs — All rights reserved.
// Tiện ích dùng chung của khối hình: easing, tính khoảng thời gian, dựng DOM và bộ kiểm lược đồ tham số (Node + trình duyệt).
(function (root) {
  'use strict';
  var U = {};
  var clamp = U.clamp = function (x, a, b) { a = a === undefined ? 0 : a; b = b === undefined ? 1 : b; return Math.min(b, Math.max(a, x)); };
  U.seg = function (t, a, b) { return clamp((t - a) / (b - a)); };
  U.eo = function (x) { return 1 - Math.pow(1 - x, 3); };
  U.eio = function (x) { return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
  // easeOutBack: nảy nhẹ khi vào
  U.eb = function (x) { if (x <= 0) return 0; if (x >= 1) return 1; var c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
  U.lerp = function (a, b, p) { return a + (b - a) * p; };
  // ---- bộ chuyển động mềm cho khối dài (0.2.x: quiz, compare-split…) — hàm thuần của t, không đồng hồ thật ----
  // easeOutBack có độ nảy chỉnh được (s nhỏ = nảy nhẹ; U.eb cũ = s 1,9)
  U.back = function (x, s) { if (x <= 0) return 0; if (x >= 1) return 1; var c1 = s === undefined ? 1.2 : s, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
  // lò xo tắt dần (vận tốc đầu 0 nhờ nhân easeInOut 12 % đầu): x ∈ [0,1+] ⇒ 0 → vọt nhẹ → 1
  U.spring = function (x) { if (x <= 0) return 0; if (x >= 1.6) return 1; var k = Math.min(1, x / 0.12); return (1 - Math.exp(-6 * x) * Math.cos(7.5 * x)) * (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2); };
  // cửa sổ vào/ra mềm: 0 trước a · lên 1 trong din · giữ · xuống 0 trong dout trước b (b = Infinity ⇒ không ra)
  U.win = function (t, a, b, din, dout) { var i = U.eio(U.seg(t, a, a + (din || 0.3))); return b === Infinity ? i : i * (1 - U.eio(U.seg(t, b - (dout === undefined ? din || 0.3 : dout), b))); };
  // mốc cue đã phân giải (giây tính từ lúc khối vào; engine điền ctx.cues theo def.cues) — chưa khai/không có ⇒ mặc định
  U.cueAt = function (ctx, i, dflt) { var c = ctx && ctx.cues; return c && typeof c[i] === 'number' ? c[i] : dflt; };
  U.f3 = function (v) { return Math.round(v * 1000) / 1000; };
  U.esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  // ước độ rộng chữ (px) theo số ký tự — dùng cho footprint thuần (không đo DOM)
  U.textW = function (s, fs) { return Math.round(String(s).length * fs * 0.56); };
  // dựng phần tử (chỉ gọi trong trình duyệt)
  U.el = function (tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
  U.box = function (slot, cls) { var e = U.el('div', 'w ' + cls); e.style.left = slot.x + 'px'; e.style.top = slot.y + 'px'; e.style.width = slot.w + 'px'; e.style.height = slot.h + 'px'; return e; };
  U.setT = function (e, tx, op) { e.style.transform = tx; if (op !== undefined) e.style.opacity = op; };
  U.dash = function (p, v) { p.style.strokeDashoffset = 1 - v; };
  // chia chữ thành 1–2 dòng cân bằng
  U.balance = function (text, maxLine) {
    var words = String(text).trim().split(/\s+/);
    if (text.length <= maxLine || words.length < 2) return [words.join(' ')];
    var best = 1, bd = 1e9;
    for (var i = 1; i < words.length; i++) {
      var a = words.slice(0, i).join(' ').length, b = words.slice(i).join(' ').length, d = Math.abs(a - b);
      if (d < bd) { bd = d; best = i; }
    }
    return [words.slice(0, best).join(' '), words.slice(best).join(' ')];
  };

  // ---------- kiểm lược đồ: {type, required, properties, items, enum, min/max…}; trả mảng lỗi tiếng Việt ----------
  function validate(schema, v, path, errs) {
    var T = schema.type;
    if (v === undefined || v === null) { errs.push(path + ': còn thiếu'); return; }
    if (T === 'string') {
      if (typeof v !== 'string') return errs.push(path + ': phải là chữ');
      if (schema.minLength !== undefined && v.trim().length < schema.minLength) errs.push(path + ': không được để trống');
      if (schema.maxLength !== undefined && v.length > schema.maxLength) errs.push(path + ': dài tối đa ' + schema.maxLength + ' ký tự (đang ' + v.length + ')');
      if (schema.enum && schema.enum.indexOf(v) < 0) errs.push(path + ': phải là một trong ' + schema.enum.join(' | '));
    } else if (T === 'number' || T === 'integer') {
      if (typeof v !== 'number' || !isFinite(v)) return errs.push(path + ': phải là số');
      if (T === 'integer' && Math.floor(v) !== v) errs.push(path + ': phải là số nguyên');
      if (schema.minimum !== undefined && v < schema.minimum) errs.push(path + ': tối thiểu ' + schema.minimum);
      if (schema.maximum !== undefined && v > schema.maximum) errs.push(path + ': tối đa ' + schema.maximum);
    } else if (T === 'boolean') {
      if (typeof v !== 'boolean') errs.push(path + ': phải là đúng/sai');
    } else if (T === 'array') {
      if (!Array.isArray(v)) return errs.push(path + ': phải là danh sách');
      if (schema.minItems !== undefined && v.length < schema.minItems) errs.push(path + ': cần ít nhất ' + schema.minItems + ' mục');
      if (schema.maxItems !== undefined && v.length > schema.maxItems) errs.push(path + ': tối đa ' + schema.maxItems + ' mục');
      if (schema.items) v.slice(0, 64).forEach(function (x, i) { validate(schema.items, x, path + '[' + i + ']', errs); });
    } else if (T === 'tuple') {
      if (!Array.isArray(v) || v.length !== schema.items.length) return errs.push(path + ': phải là cặp ' + schema.items.length + ' phần tử');
      schema.items.forEach(function (s, i) { validate(s, v[i], path + '[' + i + ']', errs); });
    } else if (T === 'cue') {
      // mốc trong khối: số giây sau lúc khối vào, HOẶC neo chữ {line, word | word_index, offset_s?} (engine đổi ra ms theo mốc từng chữ của giọng)
      if (typeof v === 'number') {
        if (!isFinite(v) || v < 0 || v > 600) errs.push(path + ': mốc phải là số giây 0–600 sau lúc khối vào, hoặc neo chữ {line, word}');
      } else if (typeof v === 'object' && !Array.isArray(v)) {
        if (typeof v.line !== 'string' && !(typeof v.line === 'number' && Math.floor(v.line) === v.line && v.line >= 0)) errs.push(path + '.line: neo chữ cần mã câu (vd "LN-0003") hoặc số thứ tự câu');
        var hasW = typeof v.word === 'string' && v.word.trim().length > 0, hasI = typeof v.word_index === 'number' && Math.floor(v.word_index) === v.word_index && v.word_index >= 0;
        if (!hasW && !hasI) errs.push(path + ': neo chữ cần `word` (chữ có trong câu) hoặc `word_index`');
        if (v.offset_s !== undefined && (typeof v.offset_s !== 'number' || !isFinite(v.offset_s) || Math.abs(v.offset_s) > 5)) errs.push(path + '.offset_s: lệch tối đa ±5 giây');
        Object.keys(v).forEach(function (k) { if (['line', 'word', 'word_index', 'offset_s'].indexOf(k) < 0) errs.push(path + '.' + k + ': neo chữ chỉ có line, word, word_index, offset_s'); });
      } else errs.push(path + ': mốc phải là số giây hoặc neo chữ {line, word}');
    } else if (T === 'object') {
      if (typeof v !== 'object' || Array.isArray(v)) return errs.push(path + ': phải là đối tượng');
      var props = schema.properties || {}, req = schema.required || [];
      req.forEach(function (k) { if (v[k] === undefined || v[k] === null) errs.push(path + '.' + k + ': còn thiếu'); });
      Object.keys(v).forEach(function (k) {
        if (!props[k]) { if (schema.additionalProperties === false) errs.push(path + '.' + k + ': tham số không có trong khối'); return; }
        if (v[k] === undefined || v[k] === null) return;
        validate(props[k], v[k], path + '.' + k, errs);
      });
    }
  }
  U.validate = function (schema, value, path) { var errs = []; validate(schema, value, path || 'params', errs); return errs; };

  if (typeof module === 'object' && module.exports) module.exports = U; else root.GSUtil = U;
})(typeof self !== 'undefined' ? self : this);
