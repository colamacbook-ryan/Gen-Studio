// © 2026 Gen Labs — All rights reserved.
// Đo trên mặt nạ bóng do GSStill.cast trả về (SPEC §3.11 F1-4/F1-5): masks[size] = { w, h, chars:{[id]: base64 — 1 byte/điểm, 0|1} }, hai người cùng khung nhìn nên khớp điểm-điểm.
'use strict';
const decode = (m, id) => Buffer.from(m.chars[id], 'base64');
// xorRatio(masks, size, a, b) → |A xor B| / |A ∪ B| (0..1)
function xorRatio(masks, size, a, b) {
  const m = masks[size]; if (!m || !m.chars[a] || !m.chars[b]) throw new Error('thiếu mặt nạ ' + size + 'px cho ' + a + '/' + b);
  const A = decode(m, a), B = decode(m, b); let x = 0, u = 0;
  for (let i = 0; i < A.length; i++) { if (A[i] !== B[i]) x++; if (A[i] || B[i]) u++; }
  return u ? x / u : 0;
}
// area(masks, size, id) → số điểm bóng (để biết bóng không rỗng)
function area(masks, size, id) { return decode(masks[size], id).reduce((s, v) => s + (v ? 1 : 0), 0); }
module.exports = { xorRatio, area };
