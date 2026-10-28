// © 2026 Gen Labs — All rights reserved.
// Gói U — nhạc nền trailer (SPEC-0.2.0 §6.7, F4-2): media/mix.js trộn nhạc (lặp đủ độ dài, hạ gain_db) và GIỌNG ÉP NHẠC bằng sidechaincompress — đo RMS phần nhạc
// (bản trộn có nhạc − bản trộn không nhạc) lúc có giọng thấp hơn lúc im ≥ 8 dB. Không có nhạc ⇒ đồ thị cũ.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const wav = require('../media/wav');
const M = require('../media/mix');

const RATE = 48000;
const tone = (sec, f, amp) => { const n = Math.round(sec * RATE), p = new Int16Array(n); for (let i = 0; i < n; i++) p[i] = Math.round(Math.sin(2 * Math.PI * f * i / RATE) * amp * 32767); return p; };

test('nhạc nền: lặp đủ độ dài, giọng ép nhạc ≥ 8 dB khi có giọng (RMS), hết giọng thì nhạc trở lại; thiếu giọng ⇒ lỗi rõ', async (t) => {
  try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); } catch { t.skip('không có ffmpeg'); return; }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-music-'));
  try {
    const v = path.join(dir, 'v.wav'), m = path.join(dir, 'm.wav');
    fs.writeFileSync(v, wav.encode({ rate: RATE, channels: 1, pcm: tone(2, 220, 0.4) }));
    fs.writeFileSync(m, wav.encode({ rate: RATE, channels: 1, pcm: tone(2.5, 660, 0.5) }));   // ngắn hơn clip ⇒ phải lặp
    const base = { voices: [{ path: v, at_ms: 2000 }], sfx: [], duration_ms: 7000, ffmpegPath: 'ffmpeg', targetLufs: null };
    await M.mix(Object.assign({}, base, { out: path.join(dir, 'a.wav') }));
    await M.mix(Object.assign({}, base, { out: path.join(dir, 'b.wav'), music: { path: m, gain_db: -18, duck_db: -10 } }));
    const A = await M.decodeMono(path.join(dir, 'a.wav')), B = await M.decodeMono(path.join(dir, 'b.wav'));
    assert.equal(A.pcm.length, B.pcm.length, 'cùng độ dài clip');
    const rms = (a, b) => { let s = 0; const i0 = Math.round(a * RATE), i1 = Math.round(b * RATE); for (let i = i0; i < i1; i++) { const d = B.pcm[i] - A.pcm[i]; s += d * d; } return Math.sqrt(s / (i1 - i0)); };
    const before = rms(0.4, 1.8), during = rms(2.6, 3.8), after = rms(5.0, 6.8);
    const db = (x, y) => 20 * Math.log10(x / y);
    assert.ok(before > 50, 'có nhạc trước giọng');
    assert.ok(db(before, during) >= 8, `ép ${db(before, during).toFixed(1)} dB (cần ≥ 8)`);
    assert.ok(Math.abs(db(before, after)) <= 3, `nhạc lặp tới hết clip và trở lại sau giọng (lệch ${db(before, after).toFixed(1)} dB)`);
    assert.match(M.musicGraph([{ path: v, at_ms: 0 }], 1, { path: m }, 7000, 0), /sidechaincompress=.*\[duck\]/);
    await assert.rejects(M.mix({ voices: [], sfx: [{ path: v, at_ms: 0 }], duration_ms: 3000, out: path.join(dir, 'c.wav'), ffmpegPath: 'ffmpeg', music: { path: m } }), /ít nhất một giọng/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
