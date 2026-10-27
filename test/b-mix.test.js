// © 2026 Gen Labs — All rights reserved.
// Test gói B: mix, mux, loudness, freeze/cuts và các cổng trên bản dựng, dùng ffmpeg thật (lavfi), không mạng.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const wav = require('../media/wav');
const fake = require('../media/providers/fake');
const mixmod = require('../media/mix');
const gates = require('../media/gates');
const srt = require('../media/srt');

const FF = process.env.FFMPEG_PATH || 'ffmpeg';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-b-'));
test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
const ff = (...a) => execFileSync(FF, ['-hide_banner', '-loglevel', 'error', '-y', ...a]);
const byGate = (rs, g, tier) => rs.find((r) => r.gate === g && (!tier || r.measure.tier === tier));

const lines = [{ id: 'L1', a_ms: 200, b_ms: 2000 }, { id: 'L2', a_ms: 2400, b_ms: 4200 }];
let mixPath, mp4Path, moving;

test('mix 48 kHz stereo + loudness đọc được số, gần -16 LUFS, đỉnh ≤ -1 dBTP', async () => {
  const voices = [];
  for (const [i, t] of ['Anh Gen ơi, A.I. là gì vậy anh?', 'Đó là trí tuệ nhân tạo, em nhé, rất thú vị'].entries()) {
    const c = await fake.tts({ voice: 'Kore', text: t });
    const p = path.join(tmp, `v${i}.wav`); fs.writeFileSync(p, c.wav);
    voices.push({ path: p, at_ms: lines[i].a_ms });
  }
  mixPath = path.join(tmp, 'mix.wav');
  await mixmod.mix({ voices, sfx: [], duration_ms: 5000, out: mixPath, ffmpegPath: FF });
  const pr = await mixmod.probe(mixPath, { ffmpegPath: FF });
  assert.strictEqual(pr.streams[0].sample_rate, '48000'); assert.strictEqual(pr.streams[0].channels, 2);
  assert.ok(Math.abs(pr.duration_ms - 5000) < 30, String(pr.duration_ms));
  const l = await mixmod.loudness(mixPath, { ffmpegPath: FF });
  assert.ok(Number.isFinite(l.lufs) && Number.isFinite(l.tp), JSON.stringify(l));
  assert.ok(Math.abs(l.lufs + 16) <= 2 && l.tp <= -1, JSON.stringify(l));
});

test('mux ra MP4 H.264+AAC thật từ ảnh màu đơn; G-MUX pass; G-FRAMES; faststart', async () => {
  const fdir = path.join(tmp, 'frames'); fs.mkdirSync(fdir);
  ff('-f', 'lavfi', '-i', 'color=c=0x336699:s=320x180:r=30:d=5', path.join(fdir, '%05d.png'));
  assert.strictEqual(fs.readdirSync(fdir).length, 150);
  mp4Path = path.join(tmp, 'out.mp4');
  await mixmod.mux({ framesPattern: path.join(fdir, '%05d.png'), fps: 30, audio: mixPath, out: mp4Path, ffmpegPath: FF });
  const p = await mixmod.probe(mp4Path, { ffmpegPath: FF });
  assert.deepStrictEqual(p.streams.map((s) => s.codec_name).sort(), ['aac', 'h264']);
  const head = fs.readFileSync(mp4Path).subarray(0, 4096);
  assert.ok(head.indexOf('moov') > 0 && head.indexOf('moov') < head.indexOf('mdat') || head.indexOf('mdat') < 0, 'moov phải đứng trước mdat');
  const srtVi = srt.build(lines.map((l, i) => ({ ...l, say: 'câu ' + i })), 'vi');
  const g = await gates.renderGates({ mixPath, mp4Path, lines, beats: [{ anchor_ok: true }], frames: { expected: 150, got: 150, errors: [] }, cutsAllowed: [], srt: [{ lang: 'vi', text: srtVi }], ffmpegPath: FF });
  assert.strictEqual(g.length, 6);
  assert.strictEqual(byGate(g, 'G-MUX').result, 'pass', JSON.stringify(byGate(g, 'G-MUX')));
  assert.strictEqual(byGate(g, 'G-FRAMES').result, 'pass');
  assert.strictEqual(byGate(g, 'G-SYNC').result, 'pass');
  assert.strictEqual(byGate(g, 'G-LOUD').result, 'pass', JSON.stringify(byGate(g, 'G-LOUD')));
  assert.strictEqual(byGate(g, 'G-WAV', 'b').result, 'pass', JSON.stringify(byGate(g, 'G-WAV', 'b')));
  // ảnh màu đơn đứng yên suốt lúc có giọng → G-MOTION fail
  assert.strictEqual(byGate(g, 'G-MOTION').result, 'fail');
});

test('G-MOTION pass với video chuyển động; cắt ngoài cutsAllowed → fail', async () => {
  moving = path.join(tmp, 'moving.mp4');
  ff('-f', 'lavfi', '-i', 'testsrc2=s=320x180:r=30:d=4', '-pix_fmt', 'yuv420p', moving);
  const base = { mp4Path: moving, lines, ffmpegPath: FF };
  const { gateMotion } = require('../media/gates/render');
  assert.strictEqual((await gateMotion({ ...base, cutsAllowed: [] })).result, 'pass');
  const cut = path.join(tmp, 'cut.mp4');
  ff('-f', 'lavfi', '-i', 'color=c=red:s=320x180:r=30:d=1.5', '-f', 'lavfi', '-i', 'color=c=blue:s=320x180:r=30:d=1.5', '-filter_complex', '[0][1]concat=n=2:v=1:a=0', '-pix_fmt', 'yuv420p', cut);
  const r = await gateMotion({ mp4Path: cut, lines: [{ a_ms: 0, b_ms: 800 }], cutsAllowed: [], ffmpegPath: FF });
  assert.strictEqual(r.result, 'fail'); assert.ok(r.measure.bad_cuts.length >= 1, JSON.stringify(r.measure));
  const ok = await gateMotion({ mp4Path: cut, lines: [{ a_ms: 0, b_ms: 800 }], cutsAllowed: [1.5], ffmpegPath: FF });
  assert.strictEqual(ok.result, 'pass', JSON.stringify(ok.measure));
});

test('G-WAV(b) fail khi có xung bất thường quanh mốc ghép', async () => {
  const p = wav.parse(fs.readFileSync(mixPath));
  const pcm = p.pcm.slice();
  // xung nhiễu mạnh 20 ms quanh 2200 ms (kênh trái/phải xen kẽ, mix stereo)
  const at = Math.round(2.2 * 48000) * 2;
  for (let i = 0; i < 960 * 2; i++) pcm[at + i] = (Math.floor(i / 2) % 3 ? 30000 : -30000);
  const bad = path.join(tmp, 'mix-bad.wav'); fs.writeFileSync(bad, wav.encode({ rate: 48000, channels: 2, pcm }));
  const { gateWavB } = require('../media/gates/render');
  const r = await gateWavB({ mixPath: bad, lines: [{ a_ms: 200, b_ms: 2200 }], ffmpegPath: FF });
  assert.strictEqual(r.result, 'fail', JSON.stringify(r.measure));
});

test('đo lỗi (ffmpeg sai đường dẫn / file hỏng) → unknown, không bao giờ pass', async () => {
  const g = await gates.renderGates({ mixPath, mp4Path, lines, beats: [{ anchor_ok: true }], frames: { expected: 1, got: 1 }, ffmpegPath: '/nonexistent/ffmpeg' });
  const by = Object.fromEntries(g.map((r) => [r.gate + (r.measure.tier || ''), r.result]));
  assert.deepStrictEqual(by, { 'G-WAVb': 'unknown', 'G-LOUD': 'unknown', 'G-SYNC': 'pass', 'G-MOTION': 'unknown', 'G-FRAMES': 'pass', 'G-MUX': 'unknown' });
  const junk = path.join(tmp, 'junk.mp4'); fs.writeFileSync(junk, 'khong phai mp4');
  const g2 = await gates.renderGates({ mixPath: junk, mp4Path: junk, lines, beats: [], frames: null, ffmpegPath: FF });
  assert.ok(g2.filter((r) => !['G-SYNC'].includes(r.gate)).every((r) => r.result === 'unknown'), JSON.stringify(g2.map((r) => r.result)));
  assert.strictEqual(gates.summarize(g), 'unknown');
});
