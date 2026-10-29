// © 2026 Gen Labs — All rights reserved.
// Hàm gộp dùng chung cho footer các lưới (không phải lưới: tên bắt đầu `_` nên bộ nạp bỏ qua).
'use strict';
function sum(rows, k) { return rows.reduce((a, r) => a + (Number(r[k]) || 0), 0); }
function median(a) { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }

module.exports = { sum, median };
