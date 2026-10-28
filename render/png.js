// © 2026 Gen Labs — All rights reserved.
// PNG tối thiểu, thuần Node (zlib có sẵn): giải mã 8 bit RGB/RGBA không xen kẽ · thu nhỏ theo diện tích (box filter) · mã hoá lại.
// Dùng cho render/still.js: ảnh nhỏ hơn 1920 được thu nhỏ Ở ĐÂY từ ảnh chụp 1:1, không nhờ Chromium (clip.scale) — xem ghi chú ở still.js.
'use strict';
const zlib = require('node:zlib');

const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(buf) { let c = 0xFFFFFFFF; for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
function chunk(type, data) { const b = Buffer.alloc(12 + data.length); b.writeUInt32BE(data.length, 0); b.write(type, 4, 'latin1'); data.copy(b, 8); b.writeUInt32BE(crc32(b.subarray(4, 8 + data.length)), 8 + data.length); return b; }

function decode(buf) {
  let p = 8, w = 0, h = 0, ct = 0; const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), type = buf.subarray(p + 4, p + 8).toString('latin1'), data = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); ct = data[9]; if (data[8] !== 8 || data[12] !== 0 || (ct !== 2 && ct !== 6)) throw new Error('png: chỉ hỗ trợ RGB/RGBA 8 bit không xen kẽ'); }
    if (type === 'IDAT') idat.push(data);
    p += 12 + len;
  }
  const bpp = ct === 6 ? 4 : 3, raw = zlib.inflateSync(Buffer.concat(idat)), stride = w * bpp, out = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[y * stride + x - bpp] : 0, b = y ? out[(y - 1) * stride + x] : 0, c = x >= bpp && y ? out[(y - 1) * stride + x - bpp] : 0;
      let v = src[x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      out[y * stride + x] = v & 255;
    }
  }
  return { w, h, bpp, px: out };
}

function encode(im) {
  const stride = im.w * im.bpp, raw = Buffer.alloc((stride + 1) * im.h);
  for (let y = 0; y < im.h; y++) im.px.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(im.w, 0); ihdr.writeUInt32BE(im.h, 4); ihdr[8] = 8; ihdr[9] = im.bpp === 4 ? 6 : 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 6 })), chunk('IEND', Buffer.alloc(0))]);
}

// Thu nhỏ theo diện tích: mỗi điểm ảnh ra = trung bình có trọng số phần giao với ô nguồn. Thuần số học ⇒ cùng ảnh vào, cùng byte ra.
function resize(im, w, h) {
  const out = Buffer.alloc(w * h * im.bpp), fx = im.w / w, fy = im.h / h, acc = new Float64Array(im.bpp);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    acc.fill(0);
    const x0 = x * fx, x1 = (x + 1) * fx, y0 = y * fy, y1 = (y + 1) * fy; let wsum = 0;
    for (let sy = Math.floor(y0); sy < Math.min(im.h, Math.ceil(y1)); sy++) {
      const wy = Math.min(sy + 1, y1) - Math.max(sy, y0);
      for (let sx = Math.floor(x0); sx < Math.min(im.w, Math.ceil(x1)); sx++) {
        const wt = wy * (Math.min(sx + 1, x1) - Math.max(sx, x0)), i = (sy * im.w + sx) * im.bpp;
        for (let c = 0; c < im.bpp; c++) acc[c] += im.px[i + c] * wt;
        wsum += wt;
      }
    }
    const o = (y * w + x) * im.bpp; for (let c = 0; c < im.bpp; c++) out[o + c] = Math.round(acc[c] / wsum);
  }
  return { w, h, bpp: im.bpp, px: out };
}

module.exports = { decode, encode, resize };
