// © 2026 Gen Labs — All rights reserved.
// Dựng phụ đề SRT từ các câu (mốc a_ms..b_ms).
'use strict';

function ts(ms) {
  ms = Math.max(0, Math.round(ms));
  const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60, r = ms % 1000;
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${p(h)}:${p(m)}:${p(s)},${p(r, 3)}`;
}

// Văn bản cue: line.subtitle[lang] nếu có, không thì line.text, không thì line.say.
function build(lines, lang) {
  return lines.map((l, i) => {
    const text = (l.subtitle && lang && l.subtitle[lang]) || l.text || l.say || '';
    return `${i + 1}\n${ts(l.a_ms)} --> ${ts(l.b_ms)}\n${text}\n`;
  }).join('\n');
}

// Đọc lại SRT → [{a_ms, b_ms, text}] (dùng cho G-MUX).
function parse(text) {
  const out = [];
  for (const block of text.replace(/\r/g, '').split(/\n\n+/)) {
    const m = block.match(/(\d+):(\d+):(\d+),(\d+)\s*-->\s*(\d+):(\d+):(\d+),(\d+)\n?([\s\S]*)/);
    if (!m) continue;
    const t = (h, mi, s, ms) => ((+h * 60 + +mi) * 60 + +s) * 1000 + +ms;
    out.push({ a_ms: t(m[1], m[2], m[3], m[4]), b_ms: t(m[5], m[6], m[7], m[8]), text: m[9].trim() });
  }
  return out;
}

module.exports = { build, parse, ts };
