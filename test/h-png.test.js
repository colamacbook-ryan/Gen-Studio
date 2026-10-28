// © 2026 Gen Labs — All rights reserved.
// render/png.js: giải mã/mã hoá/thu nhỏ PNG thuần Node — nền của still tất định (khung = hàm thuần của (plan, t), không nhờ clip.scale của Chromium).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const png = require('../render/png');

function img(w, h, bpp, f) { const px = Buffer.alloc(w * h * bpp); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let c = 0; c < bpp; c++) px[(y * w + x) * bpp + c] = f(x, y, c); return { w, h, bpp, px }; }

test('png: mã hoá rồi giải mã trả lại đúng điểm ảnh (RGB + RGBA)', () => {
  for (const bpp of [3, 4]) {
    const a = img(7, 5, bpp, (x, y, c) => (x * 31 + y * 17 + c * 59) & 255), b = png.decode(png.encode(a));
    assert.equal(b.w, 7); assert.equal(b.h, 5); assert.equal(b.bpp, bpp); assert.ok(b.px.equals(a.px));
  }
});

test('png: thu nhỏ một nửa = trung bình khối 2×2; cùng đầu vào ⇒ cùng byte', () => {
  const a = img(4, 4, 3, (x, y) => (x + y * 4) * 10), r = png.resize(a, 2, 2);
  assert.equal(r.px[0], Math.round((0 + 10 + 40 + 50) / 4));
  assert.equal(r.px[(1 * 2 + 1) * 3], Math.round((100 + 110 + 140 + 150) / 4));
  assert.ok(png.encode(png.resize(a, 2, 2)).equals(png.encode(png.resize(a, 2, 2))));
  const e = png.resize(img(10, 6, 3, () => 200), 3, 2); assert.ok(e.px.every((v) => v === 200), 'ảnh phẳng giữ nguyên ở tỉ lệ lẻ');
});
