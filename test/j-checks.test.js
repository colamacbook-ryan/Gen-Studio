// © 2026 Gen Labs — All rights reserved.
// Gói E — máy kiểm thường trực (server/checks/): PNG qua ffmpeg (nền đúng/sai, kích thước sai, đệm mép,
// vật chạm mép + đệm cùng lúc, hộp bao cách mép, 16-bit chuẩn hoá qua ffmpeg), WAV qua ffmpeg sine
// (LUFS/peak/sample-rate/lặng đầu đúng/sai, AU-03 chỉ nhạc nền/AU-04 chỉ SFX), SVG/Lottie. ffmpeg thật, không mạng.
// Sửa theo review PR #32 (opus): #1/#2 AU-03 chỉ music, AU-04 chỉ sfx · #3 đệm = CẢ hàng/cột đồng màu
// (không còn coi vai/chân chạm mép là đệm) · #4 ảnh trống không còn "pass" oan (CH-03) · #5 pass:null (pending)
// ⇒ verdict 'review' · #6 UI-02/MO-02/MO-03 là 'missing' (M), không phải H · #7 PR-01/FX-01 bật lại đệm +
// đo hộp bao cách mép · #8 PNG 16-bit chuẩn hoá qua ffmpeg, mã riêng GEN-DECODE · #10 CH-07 groundY cố định.
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

// nền phẳng (hoặc màu lệch để test trượt), có thể vẽ thêm các hộp "vật"/"nhân vật" bằng drawbox.
function bgWithBoxes(file, { w, h, bg = '0x00B140', boxes = [], extra = [] } = {}) {
  const vf = boxes.map((b) => `drawbox=x=${b.x}:y=${b.y}:w=${b.w}:h=${b.h}:color=${b.color}:t=fill`).concat(extra).join(',');
  ff('-f', 'lavfi', '-i', `color=c=${bg}:s=${w}x${h}`, ...(vf ? ['-vf', vf] : []), '-frames:v', '1', file);
}
// nền #00B140 với đệm (letterbox thật — viền ĐỒNG MÀU bao hết cả 4 cạnh) dày padPx, trên khung w×h
function paddedPng(file, { w, h, padPx, bg = '0x00B140', border = '0xFFFFFF' }) {
  ff('-f', 'lavfi', '-i', `color=c=${border}:s=${w}x${h},drawbox=x=${padPx}:y=${padPx}:w=${w - 2 * padPx}:h=${h - 2 * padPx}:color=${bg}:t=fill`, '-frames:v', '1', file);
}

test('prop.tech.01 nền đúng + vật thật cách mép ≥64px ⇒ mọi tiêu chí M đạt, verdict pass', async (t) => {
  if (skip(t)) return;
  const f = path.join(tmp, 'prop-ok.png');
  bgWithBoxes(f, { w: 2048, h: 2048, boxes: [{ x: 624, y: 624, w: 800, h: 800, color: '0x336699' }] });
  const r = await runChecks(f, 'prop.tech.01', { ffmpegPath: FF });
  assert.equal(r.verdict, 'pass', JSON.stringify(r.checks, null, 1));
  assert.equal(find(r.checks, 'PR-01').pass, true);
  assert.equal(find(r.checks, 'CH-02').pass, true);
  assert.equal(find(r.checks, 'PR-02').pass, true);
});

test('CH-02 trượt: nền lệch (4,165,60) thay vì (0,177,64) — bài học MR-051', async (t) => {
  if (skip(t)) return;
  const f = path.join(tmp, 'prop-badbg.png');
  bgWithBoxes(f, { w: 2048, h: 2048, bg: '0x04A53C' }); // rgb(4,165,60)
  const r = await runChecks(f, 'prop.tech.02', { ffmpegPath: FF });
  assert.equal(r.verdict, 'rework');
  assert.equal(find(r.checks, 'CH-02').pass, false);
});

test('PR-01 trượt: kích thước sai (1000×1000 thay vì 2048×2048)', async (t) => {
  if (skip(t)) return;
  const f = path.join(tmp, 'prop-badsize.png');
  bgWithBoxes(f, { w: 1000, h: 1000 });
  const r = await runChecks(f, 'prop.tech.03', { ffmpegPath: FF });
  assert.equal(r.verdict, 'rework');
  assert.equal(find(r.checks, 'PR-01').pass, false);
  assert.equal(find(r.checks, 'PR-01').measured.w, 1000);
});

test('PR-01 trượt: vật quá sát mép (margin < 64px) dù kích thước/nền đúng — review #7', async (t) => {
  if (skip(t)) return;
  const f = path.join(tmp, 'prop-tooclose.png');
  bgWithBoxes(f, { w: 2048, h: 2048, boxes: [{ x: 20, y: 624, w: 800, h: 800, color: '0x336699' }] }); // cách mép trái 20px < 64
  const r = await runChecks(f, 'prop.tech.04', { ffmpegPath: FF });
  assert.equal(r.verdict, 'rework');
  assert.equal(find(r.checks, 'PR-01').pass, false);
  assert.ok(find(r.checks, 'PR-01').measured.bbox.margin < 64, JSON.stringify(find(r.checks, 'PR-01').measured));
});

test('CH-01 trượt: đệm mép 8px khác màu nền (bài học MR-044, cho phép ≤4px) — nền trống, không nhân vật', async (t) => {
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

// --- Chuẩn thật phải pass (review: "thêm ca test mẫu đạt chuẩn thật phải pass cho char/sfx/voice") ---

test('nhi.expr.10 mẫu đạt chuẩn thật (char/expr): vai chạm 2 mép KHÔNG bị coi là đệm — regression review #3', async (t) => {
  if (skip(t)) return;
  const f = path.join(tmp, 'expr-shoulders.png');
  // 2 khối "vai" chạm hẳn mép trái/phải ở 30% dưới ảnh, KHÔNG lấp hết bề ngang (hàng không đồng màu toàn bộ)
  // ⇒ trước review #3 (quét 1 scanline giữa cạnh) sẽ bị tính nhầm là đệm; sau sửa thì KHÔNG bị tính.
  bgWithBoxes(f, { w: 2048, h: 2048, boxes: [{ x: 0, y: 1500, w: 200, h: 400, color: '0x3366CC' }, { x: 1848, y: 1500, w: 200, h: 400, color: '0x3366CC' }] });
  const r = await runChecks(f, 'nhi.expr.10', { ffmpegPath: FF });
  assert.equal(find(r.checks, 'CH-01').pass, true, 'CH-01: ' + JSON.stringify(find(r.checks, 'CH-01').measured));
  assert.equal(find(r.checks, 'CH-02').pass, true);
  assert.equal(find(r.checks, 'CH-03').pass, true, 'CH-03: ' + JSON.stringify(find(r.checks, 'CH-03').measured));
  assert.equal(find(r.checks, 'CH-05').pass, true, 'CH-05 (vai chạm mép): ' + JSON.stringify(find(r.checks, 'CH-05').measured));
  // CH-04 (M*) luôn pass:null (chưa có dò mốc mặt) ⇒ verdict chỉ có thể là 'review' (Ryan xác nhận), KHÔNG 'pass' im lặng — review #5.
  const ch04 = find(r.checks, 'CH-04');
  assert.equal(ch04.pass, null);
  assert.equal(r.verdict, 'review', JSON.stringify(r.checks, null, 1));
});

test('nhi.pose.01 mẫu đạt chuẩn thật (char/pose): không có CH-04 ⇒ verdict pass thật', async (t) => {
  if (skip(t)) return;
  const f = path.join(tmp, 'pose-ok.png');
  // chân (khối giữa, không chạm mép trái/phải) có hàng thấp nhất đúng y=2400 (groundY cố định — review #10)
  bgWithBoxes(f, { w: 2048, h: 2560, boxes: [{ x: 824, y: 2000, w: 400, h: 401, color: '0x3366CC' }] });
  const r = await runChecks(f, 'nhi.pose.01', { ffmpegPath: FF });
  assert.equal(find(r.checks, 'CH-01').pass, true, 'CH-01: ' + JSON.stringify(find(r.checks, 'CH-01').measured));
  assert.equal(find(r.checks, 'CH-02').pass, true);
  assert.equal(find(r.checks, 'CH-03').pass, true);
  assert.equal(find(r.checks, 'CH-07').pass, true, 'CH-07: ' + JSON.stringify(find(r.checks, 'CH-07').measured));
  assert.equal(r.verdict, 'pass', JSON.stringify(r.checks, null, 1));
});

test('audio.sfx.* mẫu đạt chuẩn thật ⇒ pass; AU-03 (−16 LUFS) KHÔNG áp cho SFX — review #1', async (t) => {
  if (skip(t)) return;
  const f = path.join(tmp, 'sfx-ok.wav');
  ff('-f', 'lavfi', '-i', 'sine=frequency=440:duration=0.3', '-ar', '48000', '-af', 'volume=-6dB', '-c:a', 'pcm_s24le', f);
  const r = await runChecks(f, 'audio.sfx.whoosh.01', { ffmpegPath: FF, declaredMime: 'audio/wav' });
  assert.equal(find(r.checks, 'AU-01').pass, true, JSON.stringify(find(r.checks, 'AU-01').measured));
  assert.equal(find(r.checks, 'AU-02').pass, true);
  assert.equal(find(r.checks, 'AU-03'), undefined, 'SFX không có AU-03');
  assert.equal(find(r.checks, 'AU-04').pass, true, JSON.stringify(find(r.checks, 'AU-04').measured));
  assert.equal(r.verdict, 'pass');
});

test('audio.voice.* mẫu đạt chuẩn thật ⇒ pass; không bị ép AU-03/AU-04 — review #1/#2', async (t) => {
  if (skip(t)) return;
  const f = path.join(tmp, 'voice-ok.wav');
  ff('-f', 'lavfi', '-i', 'sine=frequency=220:duration=1', '-ar', '48000', '-c:a', 'pcm_s24le', f); // lặng đầu 0 dù không kiểm AU-04
  const r = await runChecks(f, 'audio.voice.nhi', { ffmpegPath: FF });
  assert.equal(find(r.checks, 'AU-01').pass, true, JSON.stringify(find(r.checks, 'AU-01').measured));
  assert.equal(find(r.checks, 'AU-02').pass, true);
  assert.equal(find(r.checks, 'AU-03'), undefined, 'voice không có AU-03');
  assert.equal(find(r.checks, 'AU-04'), undefined, 'voice không có AU-04');
  assert.equal(r.verdict, 'pass', JSON.stringify(r.checks, null, 1));
});

test('AU-03 trượt: nhạc nền quá nhỏ (LUFS rất âm) — chỉ áp audio.bgm.*', async (t) => {
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

test('PNG 16-bit vẫn đo được qua chuẩn hoá ffmpeg (không GEN-DECODE) — review #8', async (t) => {
  if (skip(t)) return;
  const f = path.join(tmp, 'prop-16bit.png');
  ff('-f', 'lavfi', '-i', 'color=c=0x00B140:s=2048x2048', '-pix_fmt', 'rgb48be', '-frames:v', '1', f);
  assert.match(execFileSync('file', [f]).toString(), /16-bit/);
  const r = await runChecks(f, 'prop.tech.05', { ffmpegPath: FF });
  assert.equal(find(r.checks, 'GEN-DECODE'), undefined);
  assert.equal(find(r.checks, 'CH-02').pass, true, JSON.stringify(find(r.checks, 'CH-02')));
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

test('runChecks ui.chat.01: UI-01 đạt nhưng UI-02 "missing" (M chưa cài máy đo) ⇒ verdict review — review #6', async () => {
  const f = path.join(tmp, 'ui-chat.svg');
  fs.writeFileSync(f, '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>');
  const r = await runChecks(f, 'ui.chat.01');
  assert.equal(find(r.checks, 'UI-01').pass, true);
  const ui02 = find(r.checks, 'UI-02');
  assert.equal(ui02.level, 'M');
  assert.equal(ui02.pass, null);
  assert.equal(ui02.measured.missing, true);
  assert.equal(r.verdict, 'review');
});

test('MO-01 Lottie hợp lệ ⇒ MO-02/MO-03 "missing" (review), có expression ⇒ MO-01 fail (rework)', async () => {
  const good = { v: '5.9.0', fr: 30, ip: 0, op: 12, w: 512, h: 512, layers: [] };
  const okFile = path.join(tmp, 'motion-ok.json');
  fs.writeFileSync(okFile, JSON.stringify(good));
  assert.equal(lottieMod.lottieOk(fs.readFileSync(okFile)).ok, true);
  const r = await runChecks(okFile, 'motion.trans.01');
  assert.equal(find(r.checks, 'MO-01').pass, true);
  assert.equal(find(r.checks, 'MO-02').pass, null);
  assert.equal(find(r.checks, 'MO-03').pass, null);
  assert.equal(find(r.checks, 'MO-03').level, 'M + H');
  assert.equal(r.verdict, 'review');

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
