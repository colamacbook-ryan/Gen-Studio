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
