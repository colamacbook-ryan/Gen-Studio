// © 2026 Gen Labs — All rights reserved.
// Gói E — máy kiểm thường trực (server/checks/): PNG qua ffmpeg (nền đúng/sai, kích thước sai, đệm mép),
// WAV qua ffmpeg sine (LUFS/peak đúng/sai), SVG > 2 MB. Dùng ffmpeg thật (lavfi), không mạng.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { runChecks } = require('../server/checks/index.js');
const svgMod = require('../server/checks/svg.js');
const lottieMod = require('../server/checks/lottie.js');

const FF = process.env.FFMPEG_PATH || process.env.GS_FFMPEG_PATH || 'ffmpeg';
let hasFfmpeg = true;
try { execFileSync(FF, ['-version'], { stdio: 'ignore' }); } catch { hasFfmpeg = false; }

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-j-'));
test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
const ff = (...a) => execFileSync(FF, ['-hide_banner', '-loglevel', 'error', '-y', ...a]);

const find = (checks, code) => checks.find((c) => c.code === code);
const skip = (t) => { if (!hasFfmpeg) { t.skip('không có ffmpeg trên máy này'); return true; } return false; };

// nền phẳng #00B140 (hoặc màu khác để test trượt), kích thước tuỳ ý
function flatPng(file, { w, h, color = '0x00B140' }) {
  ff('-f', 'lavfi', '-i', `color=c=${color}:s=${w}x${h}`, '-frames:v', '1', file);
}
// nền #00B140 với đệm (viền) màu khác, dày padPx, trên khung w×h
function paddedPng(file, { w, h, padPx, bg = '0x00B140', border = '0xFFFFFF' }) {
  ff('-f', 'lavfi', '-i', `color=c=${border}:s=${w}x${h},drawbox=x=${padPx}:y=${padPx}:w=${w - 2 * padPx}:h=${h - 2 * padPx}:color=${bg}:t=fill`, '-frames:v', '1', file);
}

test('prop.tech.01 nền #00B140 đúng khung 2048×2048 ⇒ mọi tiêu chí M đạt, verdict pass', async (t) => {
  if (skip(t)) return;
  const f = path.join(tmp, 'prop-ok.png');
  flatPng(f, { w: 2048, h: 2048 });
  const r = await runChecks(f, 'prop.tech.01', { ffmpegPath: FF });
  assert.equal(r.verdict, 'pass', JSON.stringify(r.checks, null, 1));
  assert.equal(find(r.checks, 'PR-01').pass, true);
  assert.equal(find(r.checks, 'CH-02').pass, true);
  assert.equal(find(r.checks, 'PR-02').pass, true);
});

test('CH-02 trượt: nền lệch (4,165,60) thay vì (0,177,64) — bài học MR-051', async (t) => {
  if (skip(t)) return;
  const f = path.join(tmp, 'prop-badbg.png');
  flatPng(f, { w: 2048, h: 2048, color: '0x04A53C' }); // rgb(4,165,60)
  const r = await runChecks(f, 'prop.tech.02', { ffmpegPath: FF });
  assert.equal(r.verdict, 'rework');
  assert.equal(find(r.checks, 'CH-02').pass, false);
});

test('PR-01 trượt: kích thước sai (1000×1000 thay vì 2048×2048)', async (t) => {
  if (skip(t)) return;
  const f = path.join(tmp, 'prop-badsize.png');
  flatPng(f, { w: 1000, h: 1000 });
  const r = await runChecks(f, 'prop.tech.03', { ffmpegPath: FF });
  assert.equal(r.verdict, 'rework');
  assert.equal(find(r.checks, 'PR-01').pass, false);
  assert.equal(find(r.checks, 'PR-01').measured.w, 1000);
});

test('CH-01 trượt: đệm mép 8px khác màu nền (bài học MR-044, cho phép ≤4px)', async (t) => {
  if (skip(t)) return;
  const f = path.join(tmp, 'expr-pad.png');
  paddedPng(f, { w: 2048, h: 2048, padPx: 8 });
  const r = await runChecks(f, 'nhi.expr.08', { ffmpegPath: FF });
  assert.equal(r.verdict, 'rework');
  const ch01 = find(r.checks, 'CH-01');
  assert.equal(ch01.pass, false);
  assert.ok(ch01.measured.maxPad >= 8, JSON.stringify(ch01.measured));
});

test('CH-01 đạt: không đệm (viền ≤4px vẫn trong ngưỡng)', async (t) => {
  if (skip(t)) return;
  const f = path.join(tmp, 'expr-nopad.png');
  paddedPng(f, { w: 2048, h: 2048, padPx: 2 });
  const r = await runChecks(f, 'nhi.expr.09', { ffmpegPath: FF });
  assert.equal(find(r.checks, 'CH-01').pass, true, JSON.stringify(find(r.checks, 'CH-01').measured));
});

test('AU-01/02/03 đạt: WAV 48 kHz/24-bit, ~-16 LUFS, đỉnh ≤ -1 dBFS', async (t) => {
  if (skip(t)) return;
  const f = path.join(tmp, 'sfx-ok.wav');
  ff('-f', 'lavfi', '-i', 'sine=frequency=440:duration=3', '-ar', '48000', '-af', 'volume=5.8dB', '-c:a', 'pcm_s24le', f);
  const r = await runChecks(f, 'audio.sfx.whoosh.01', { ffmpegPath: FF, declaredMime: 'audio/wav' });
  assert.equal(find(r.checks, 'AU-01').pass, true, JSON.stringify(find(r.checks, 'AU-01').measured));
  assert.equal(find(r.checks, 'AU-02').pass, true);
  assert.equal(find(r.checks, 'AU-03').pass, true, JSON.stringify(find(r.checks, 'AU-03').measured));
  assert.equal(find(r.checks, 'AU-04').pass, true, JSON.stringify(find(r.checks, 'AU-04').measured));
  assert.equal(r.verdict, 'pass');
});

test('AU-03 trượt: quá nhỏ (im lặng gần hết mức, LUFS rất âm)', async (t) => {
  if (skip(t)) return;
  const f = path.join(tmp, 'bgm-quiet.wav');
  ff('-f', 'lavfi', '-i', 'sine=frequency=440:duration=3', '-ar', '48000', '-af', 'volume=-40dB', '-c:a', 'pcm_s24le', f);
  const r = await runChecks(f, 'audio.bgm.01', { ffmpegPath: FF });
  assert.equal(find(r.checks, 'AU-03').pass, false);
  assert.equal(r.verdict, 'rework');
});

test('AU-04 trượt (SFX): lặng đầu > 50 ms', async (t) => {
  if (skip(t)) return;
  const f = path.join(tmp, 'sfx-late.wav');
  ff('-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=mono:d=0.3', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1',
    '-filter_complex', '[0:a][1:a]concat=n=2:v=0:a=1,volume=5.8dB[a]', '-map', '[a]', '-c:a', 'pcm_s24le', f);
  const r = await runChecks(f, 'audio.sfx.pop.01', { ffmpegPath: FF });
  assert.equal(find(r.checks, 'AU-04').pass, false, JSON.stringify(find(r.checks, 'AU-04').measured));
});

test('AU-01 trượt: sample rate sai (44100 thay vì 48000)', async (t) => {
  if (skip(t)) return;
  const f = path.join(tmp, 'sfx-44k.wav');
  ff('-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', '-ar', '44100', '-af', 'volume=5.8dB', '-c:a', 'pcm_s24le', f);
  const r = await runChecks(f, 'audio.sfx.pop.02', { ffmpegPath: FF });
  assert.equal(find(r.checks, 'AU-01').pass, false);
  assert.equal(r.verdict, 'rework');
});

test('UI-01 SVG hợp lệ ≤ 2 MB ⇒ pass; SVG > 2 MB ⇒ fail', () => {
  const okFile = path.join(tmp, 'ui-ok.svg');
  fs.writeFileSync(okFile, '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#00B140"/></svg>');
  assert.equal(svgMod.svgOk(fs.readFileSync(okFile)), true);
  const bigFile = path.join(tmp, 'ui-big.svg');
  const pad = ' '.repeat(2 * 1024 * 1024);
  fs.writeFileSync(bigFile, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><!--${''}--><rect width="10" height="10"/><title>${pad}</title></svg>`);
  assert.ok(fs.statSync(bigFile).size > 2 * 1024 * 1024);
  assert.equal(svgMod.svgOk(fs.readFileSync(bigFile)), false);
});

test('runChecks UI-01: SVG qua mã ô ui.chat.01', async () => {
  const f = path.join(tmp, 'ui-chat.svg');
  fs.writeFileSync(f, '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>');
  const r = await runChecks(f, 'ui.chat.01');
  assert.equal(r.verdict, 'pass');
  assert.equal(find(r.checks, 'UI-01').pass, true);
});

test('MO-01 Lottie hợp lệ ⇒ pass; có expression ⇒ fail', async () => {
  const good = { v: '5.9.0', fr: 30, ip: 0, op: 12, w: 512, h: 512, layers: [] };
  const okFile = path.join(tmp, 'motion-ok.json');
  fs.writeFileSync(okFile, JSON.stringify(good));
  assert.equal(lottieMod.lottieOk(fs.readFileSync(okFile)).ok, true);
  const r = await runChecks(okFile, 'motion.trans.01');
  assert.equal(r.verdict, 'pass');

  const bad = { v: '5.9.0', fr: 30, ip: 0, op: 12, w: 512, h: 512, layers: [{ ks: { x: 'time*2' } }] };
  const badFile = path.join(tmp, 'motion-bad.json');
  fs.writeFileSync(badFile, JSON.stringify(bad));
  const r2 = await runChecks(badFile, 'motion.trans.02');
  assert.equal(r2.verdict, 'rework');
  assert.equal(find(r2.checks, 'MO-01').pass, false);
});

test('mã ô không hợp lệ ⇒ GEN-SPEC fail, rework', async () => {
  const f = path.join(tmp, 'whatever.svg');
  fs.writeFileSync(f, '<svg xmlns="http://www.w3.org/2000/svg"></svg>');
  const r = await runChecks(f, 'khong-dung-quy-uoc');
  assert.equal(r.verdict, 'rework');
  assert.equal(find(r.checks, 'GEN-SPEC').pass, false);
});
