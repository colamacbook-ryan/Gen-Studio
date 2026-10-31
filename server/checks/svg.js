// © 2026 Gen Labs — All rights reserved.
// UI-01 (STANDARD-KIT-v1.md §4.4): SVG ≤ 2 MB qua `svgOk` (danh sách cho phép). BẢN SAO CÓ CHỦ Ý của
// svgOk trong server/write.js (op asset.put) — write.js nằm ngoài phạm vi gói E (CLAUDE.md), không export
// hàm nội bộ được; giữ đúng cùng luật (thẻ/thuộc tính cho phép, cấm thực thể/script/href ngoài). Đổi luật
// ⇒ sửa CẢ HAI nơi.
'use strict';

const SVG_TAGS = new Set(['svg', 'g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'text', 'tspan',
  'defs', 'lineargradient', 'radialgradient', 'stop', 'clippath', 'mask', 'title', 'desc']);
const SVG_ATTRS = new Set(['xmlns', 'viewbox', 'width', 'height', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry',
  'd', 'points', 'transform', 'fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-linecap',
  'stroke-linejoin', 'stroke-dasharray', 'stroke-dashoffset', 'stroke-miterlimit', 'opacity', 'id', 'clip-path', 'clip-rule', 'mask',
  'offset', 'stop-color', 'stop-opacity', 'gradientunits', 'gradienttransform', 'spreadmethod', 'fx', 'fy', 'font-family', 'font-size',
  'font-weight', 'font-style', 'text-anchor', 'dominant-baseline', 'letter-spacing', 'dx', 'dy', 'preserveaspectratio', 'version',
  'aria-hidden', 'role', 'aria-label', 'vector-effect', 'paint-order', 'clippathunits', 'maskunits']);
const MAX_BYTES = 2 * 1024 * 1024;

function svgOk(buf) {
  if (buf.length > MAX_BYTES) return false;
  const t = buf.toString('utf8');
  if (/&#|<!|<\?(?!xml\s)|&(?!(amp|lt|gt|quot|apos);)/i.test(t)) return false;
  const tagRe = /<\s{0,8}(\/?)\s{0,8}([a-zA-Z][\w:.-]{0,63})([^<>]{0,4096})>/g;
  let m, seen = 0;
  while ((m = tagRe.exec(t))) {
    seen++;
    if (!SVG_TAGS.has(m[2].toLowerCase())) return false;
    if (m[1]) continue;
    const attrRe = /([^\s=\/<>]{1,64})\s{0,8}=\s{0,8}("([^"]{0,4096})"|'([^']{0,4096})')/g;
    let a;
    const rest = m[3].replace(/\/\s*$/, '');
    const stripped = rest.replace(attrRe, '').trim();
    if (stripped) return false;
    while ((a = attrRe.exec(rest))) {
      const name = a[1].toLowerCase(), val = a[3] !== undefined ? a[3] : a[4];
      if (!SVG_ATTRS.has(name) && !name.startsWith('xmlns')) return false;
      if (/url\(\s*['"]?(?!#)/i.test(val) || /javascript:|data:/i.test(val)) return false;
    }
  }
  const lt = (t.match(/</g) || []).length;
  return seen > 0 && seen === lt;
}

module.exports = { svgOk, MAX_BYTES };
