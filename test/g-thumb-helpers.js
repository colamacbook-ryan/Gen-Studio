// © 2026 Gen Labs — All rights reserved.
// Tiện ích test gói T (không phải file test): PNG RGBA tự dựng (ảnh mặt chủ kênh giả, ảnh tương phản biết trước), plan mẫu có 3 nhịp, đường dẫn ffmpeg/Chromium.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { spawnSync } = require('node:child_process');
const chromium = require('../render/chromium');
const { buildPlan } = require('../render/engine/timeline');

const FFMPEG = spawnSync('sh', ['-c', 'command -v ffmpeg'], { encoding: 'utf8' }).stdout.trim() || null;
const NO_CHROMIUM = chromium.find() ? false : 'không có Chromium';
const NO_BROWSER_OR_FFMPEG = NO_CHROMIUM || (FFMPEG ? false : 'không có ffmpeg');

// ---- PNG RGBA tối thiểu (không phụ thuộc thư viện) ----
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]), crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
// canvas = { w, h, px: Uint8Array RGBA }; opaque ⇒ ghi PNG kiểu RGB (không kênh alpha)
function canvas(w, h, fill) { const px = new Uint8Array(w * h * 4); if (fill) for (let i = 0; i < w * h; i++) px.set(fill, i * 4); return { w, h, px }; }
function ellipse(c, cx, cy, rx, ry, rgba) {
  for (let y = Math.max(0, Math.floor(cy - ry)); y <= Math.min(c.h - 1, Math.ceil(cy + ry)); y++) for (let x = Math.max(0, Math.floor(cx - rx)); x <= Math.min(c.w - 1, Math.ceil(cx + rx)); x++) {
    if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) c.px.set(rgba, (y * c.w + x) * 4);
  }
}
function rectFill(c, x0, y0, w, h, rgba) { for (let y = Math.max(0, y0); y < Math.min(c.h, y0 + h); y++) for (let x = Math.max(0, x0); x < Math.min(c.w, x0 + w); x++) c.px.set(rgba, (y * c.w + x) * 4); }
function encodePng(c, { opaque } = {}) {
  const ch = opaque ? 3 : 4, raw = Buffer.alloc((c.w * ch + 1) * c.h);
  for (let y = 0; y < c.h; y++) {
    raw[y * (c.w * ch + 1)] = 0;
    for (let x = 0; x < c.w; x++) for (let k = 0; k < ch; k++) raw[y * (c.w * ch + 1) + 1 + x * ch + k] = c.px[(y * c.w + x) * 4 + k];
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(c.w, 0); ihdr.writeUInt32BE(c.h, 4); ihdr[8] = 8; ihdr[9] = opaque ? 2 : 6;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
// Ảnh mặt chủ kênh GIẢ (đầu + vai hoạt hình, nền trong suốt khi alpha=true): chỉ để thử đường ảnh mặt thật, không phải ảnh thật của ai
function ownerFacePng({ alpha = true, w = 420, h = 520 } = {}) {
  const c = canvas(w, h, alpha ? [0, 0, 0, 0] : [214, 232, 250, 255]);
  const skin = [242, 201, 160, 255], dark = [36, 33, 31, 255], white = [255, 255, 255, 255];
  ellipse(c, w / 2, h * 1.02, w * 0.5, h * 0.34, [43, 58, 140, 255]);               // vai
  rectFill(c, Math.round(w * 0.43), Math.round(h * 0.6), Math.round(w * 0.14), Math.round(h * 0.16), skin);   // cổ
  ellipse(c, w / 2, h * 0.38, w * 0.34, h * 0.31, skin);                              // mặt
  ellipse(c, w / 2, h * 0.17, w * 0.36, h * 0.15, dark);                              // tóc
  ellipse(c, w * 0.38, h * 0.4, w * 0.075, h * 0.075, white); ellipse(c, w * 0.62, h * 0.4, w * 0.075, h * 0.075, white);   // mắt (mở to)
  ellipse(c, w * 0.38, h * 0.4, w * 0.03, h * 0.03, dark); ellipse(c, w * 0.62, h * 0.4, w * 0.03, h * 0.03, dark);
  ellipse(c, w / 2, h * 0.54, w * 0.08, h * 0.06, [120, 30, 40, 255]);                // miệng há
  return encodePng(c, { opaque: !alpha });
}
// ảnh phẳng cỡ 1280×720 bằng ffmpeg (nền + hộp đặc) → rgb PNG; dùng cho phép thử độ tương phản biết trước (F3-3)
function flatPng(file, { bg, box }) {
  const vf = box ? `drawbox=x=${box.x}:y=${box.y}:w=${box.w}:h=${box.h}:color=${box.color}:t=fill` : null;
  const r = spawnSync(FFMPEG, ['-v', 'error', '-y', '-f', 'lavfi', '-i', `color=c=${bg}:s=1280x720:d=1`, ...(vf ? ['-vf', vf] : []), '-frames:v', '1', file], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error('ffmpeg: ' + r.stderr);
  return file;
}

// ---- plan mẫu: 2 câu, 3 nhịp (BT-0001 title · BT-0002 prob-card · BT-0003 stamp), cast mặc định CM-0001 Anh Gen / CM-0002 Bé Hỏi ----
function fixturePlan(aspect) {   // aspect (F7): bỏ trống = 16:9 như cũ; '9:16' ⇒ plan dọc (plan.size, plan.layout)
  const say = 'Anh Gen ơi, sao A.I. nói sai mà vẫn tự tin thế ạ?', toks = say.split(' ');
  const say2 = 'Câu quen thì Hà Nội chiếm chín mươi hai phần trăm.', toks2 = say2.split(' ');
  const mk = (ts, n) => ({ duration_ms: ts.length * 300 + 200, word_times: ts.map((w, i) => ({ w, t0: i * 300, t1: i * 300 + 280 })), envelope: new Array(n).fill(0.5) });
  return buildPlan({ fps: 10, ...(aspect ? { aspect } : {}), lesson: { title: 'T', lines: [{ id: 'LN-1', who: 'CM-0002', say }, { id: 'LN-2', who: 'CM-0001', say: say2 }],
    beats: [
      { id: 'BT-0001', block: 'title', anchor: { line: 'LN-1', word: 'Anh' }, params: { text: 'Vì sao A.I. sai?' } },
      { id: 'BT-0002', block: 'prob-card', anchor: { line: 'LN-2', word: 'Hà' }, params: { prompt: 'Thủ đô của Việt Nam là', options: [['Hà Nội', 92], ['Huế', 4], ['TP.HCM', 3]], pick: 0, chip: '✓ chắc chắn' } },
      { id: 'BT-0003', block: 'stamp', anchor: { line: 'LN-2', word: 'phần' }, params: { text: 'ĐOÁN ≠ BIẾT', sub: '' } }] },
  clips: { 'LN-1': mk(toks, 60), 'LN-2': mk(toks2, 60) }, channel: { name: 'Lớp AI Bình Dân' } });
}
const BEAT_ORDER = ['BT-0001', 'BT-0002', 'BT-0003'];

// 4 phương án mẫu — mỗi mẫu một cái, đều phải qua G-THUMB (face.owner:true ⇒ cần ctx.faces, hoặc rơi về KOL host_lead)
function fourVariants() {
  return { variants: [
    { template: 'host-shock-left', headline: 'AI bịa chuyện thế nào?', highlight: 'bịa', kicker: 'SỰ THẬT', face: { owner: true, mood: 'shock' }, sidekick: { cast: 'CM-0002', mood: 'panic' }, visual: { beat: 1 } },
    { template: 'host-shock-right', headline: 'Đừng tin AI 100%', highlight: 'tin', kicker: 'CẢNH BÁO', face: { cast: 'CM-0001', mood: 'smug' }, sidekick: { cast: 'CM-0002', mood: 'think' }, visual: { beat: 2 } },
    { template: 'duo-versus', headline: 'Máy đoán chữ kế tiếp', highlight: 'đoán', face: { cast: 'CM-0001', mood: 'vow' }, sidekick: { cast: 'CM-0002', mood: 'panic' }, visual: { beat: 0 } },
    { template: 'big-visual', headline: 'Hà Nội chiếm 92%', highlight: '92%', kicker: 'SỐ LIỆU', face: { cast: 'CM-0002', mood: 'excited' }, visual: { beat: 1 } },
  ] };
}
const mkdtemp = (p) => fs.mkdtempSync(path.join(require('node:os').tmpdir(), p || 'gs-thumb-'));

module.exports = { FFMPEG, NO_CHROMIUM, NO_BROWSER_OR_FFMPEG, canvas, ellipse, rectFill, encodePng, ownerFacePng, flatPng, fixturePlan, BEAT_ORDER, fourVariants, mkdtemp };
