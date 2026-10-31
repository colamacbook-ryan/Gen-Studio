// © 2026 Gen Labs — All rights reserved.
// Sniff magic bytes cho máy kiểm Bộ Neo (STANDARD-KIT-v1 §7 / DB-GK-0.1 §7). Mở rộng từ MAGIC của
// server/mcp-tools/asset.js (svg/png/jpeg/webp) thêm wav/mp3/ogg/mp4/webm/ttf/otf/woff2/json(lottie).
// Không phụ thuộc npm — chỉ so byte đầu buffer.
'use strict';

const SNIFF = {
  'image/png': (b) => b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  'image/jpeg': (b) => b.length >= 2 && b[0] === 0xff && b[1] === 0xd8,
  'image/webp': (b) => b.length >= 12 && b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP',
  'image/svg+xml': (b) => /^\s*(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*<svg[\s>]/i.test(b.subarray(0, 2000).toString('utf8')),
  'audio/wav': (b) => b.length >= 12 && b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WAVE',
  'audio/mpeg': (b) => b.length >= 3 && (b.subarray(0, 3).toString('latin1') === 'ID3' || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0)),
  'audio/ogg': (b) => b.length >= 4 && b.subarray(0, 4).toString('latin1') === 'OggS',
  'video/mp4': (b) => b.length >= 12 && b.subarray(4, 8).toString('latin1') === 'ftyp',
  'video/webm': (b) => b.length >= 4 && b.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])),
  'font/woff2': (b) => b.length >= 4 && b.subarray(0, 4).toString('latin1') === 'wOF2',
  'font/woff': (b) => b.length >= 4 && b.subarray(0, 4).toString('latin1') === 'wOFF',
  'font/ttf': (b) => b.length >= 4 && (b.subarray(0, 4).equals(Buffer.from([0x00, 0x01, 0x00, 0x00])) || b.subarray(0, 4).toString('latin1') === 'true'),
  'font/otf': (b) => b.length >= 4 && b.subarray(0, 4).toString('latin1') === 'OTTO',
  'application/json': (b) => { const t = b.subarray(0, 1024).toString('utf8').trimStart(); return t.startsWith('{') || t.startsWith('['); },
};

// → mime phát hiện (ưu tiên định dạng nhị phân rõ ràng trước json/svg mơ hồ) hoặc null.
function detect(buf) {
  const order = ['image/png', 'image/jpeg', 'image/webp', 'audio/wav', 'video/webm', 'video/mp4',
    'audio/ogg', 'audio/mpeg', 'font/woff2', 'font/woff', 'font/otf', 'font/ttf', 'image/svg+xml', 'application/json'];
  for (const k of order) if (SNIFF[k](buf)) return k;
  return null;
}

// Khai `declared` lệch nội dung thật ⇒ invalid {declared, detected} (cùng kiểu lỗi với svg/raster trong write.js).
function sniff(buf, declared) {
  const detected = detect(buf);
  const ok = !!detected && (!declared || detected === declared);
  return { ok, detected, declared: declared || null };
}

module.exports = { SNIFF, detect, sniff };
