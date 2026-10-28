// © 2026 Gen Labs — All rights reserved.
// Gói P0a — đường dựng một khung (render/still.js + openStage + GSStill): PNG thật bằng Chromium, chế độ stub, hàng đợi, resolveAssets theo assetRefs, ảnh bìa trong renderPlan.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const chromium = require('../render/chromium');
const { renderPlan, resolveAssets } = require('../render/render');
const still = require('../render/still');
const { buildPlan } = require('../render/engine/timeline');

const HAS = chromium.find() ? false : 'không có Chromium';
const FFMPEG = require('node:child_process').spawnSync('sh', ['-c', 'command -v ffmpeg'], { encoding: 'utf8' }).stdout.trim() || null;
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'gs-h-still-'));
const isPng = b => b.length > 1000 && b.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
const pngSize = b => [b.readUInt32BE(16), b.readUInt32BE(20)];
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 60"><rect width="100" height="60" fill="#FFD84A"/></svg>';

test.after(() => still.closeStill());

test('renderStill: mỗi chế độ (thumb/frame/brand/cast) dựng ra PNG thật, đúng cỡ, 0 lỗi console', { skip: HAS }, async () => {
  const dir = tmp();
  for (const mode of still.MODES.filter(m => m !== 'thumb')) {   // thumb: gói T đã thay stub bằng bản thật (cần đặc tả đã phân giải) — test/g-thumb-render.test.js
    const out = path.join(dir, mode + '.png');
    const r = await still.renderStill({ mode, payload: { label: 'thử' }, size: [960, 540], format: 'png', outFile: out });
    assert.deepEqual(r.errors, [], mode);
    assert.equal(r.file, out); assert.ok(isPng(fs.readFileSync(out)), mode);
    assert.deepEqual(pngSize(r.buffer), [960, 540], mode);
    assert.equal(r.measures.mode, mode); assert.equal(r.measures.stub, mode === 'brand' ? false : true, mode + (mode === 'brand' ? ' là bản thật của gói B' : ' là stub ở P0a'));
  }
  await assert.rejects(still.renderStill({ mode: 'thumb', payload: { label: 'thử' }, size: [960, 540] }), /đặc tả ảnh bìa/, 'thumb thật: payload không phải đặc tả ⇒ lỗi rõ, không vẽ khung giả');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('renderStill mode frame: dựng đúng một khung của plan (cùng __load/__seek), JPEG; khác nhau theo t_ms', { skip: HAS }, async () => {
  const say = 'Anh Gen ơi, sao A.I. nói sai mà vẫn tự tin thế ạ?', toks = say.split(' ');
  const clips = { 'LN-1': { duration_ms: toks.length * 300 + 200, word_times: toks.map((w, i) => ({ w, t0: i * 300, t1: i * 300 + 280 })), envelope: new Array(60).fill(0.5) } };
  const plan = buildPlan({ fps: 12, lesson: { title: 'T', lines: [{ id: 'LN-1', who: 'CM-0002', say }], beats: [{ id: 'B1', block: 'title', anchor: { line: 'LN-1', word: 'Anh' }, params: { text: 'Vì sao A.I. sai?' } }] }, clips, channel: { name: 'K' } });
  const a = await still.renderStill({ mode: 'frame', payload: { plan, t_ms: 200 }, size: [1920, 1080], format: 'jpeg', quality: 80 });
  const b = await still.renderStill({ mode: 'frame', payload: { plan, t_ms: 2500 }, size: [1920, 1080], format: 'jpeg', quality: 80 });
  assert.deepEqual(a.errors, []); assert.deepEqual(b.errors, []);
  assert.equal(a.measures.stub, false);
  assert.ok(a.buffer[0] === 0xff && a.buffer[1] === 0xd8 && a.buffer.length > 5000);
  assert.notEqual(a.buffer.toString('base64'), b.buffer.toString('base64'), 'hai thời điểm cho hai khung khác nhau');
});

test('renderStill: tham số sai bị từ chối có mã; chế độ chưa đăng ký ⇒ lỗi rõ', { skip: HAS }, async () => {
  await assert.rejects(still.renderStill({ mode: 'xyz' }), { code: 'still_mode' });
  await assert.rejects(still.renderStill({ mode: 'cast', size: [1920, 2000] }), { code: 'still_size' });
  await assert.rejects(still.renderStill({ mode: 'cast', size: [0, 10] }), { code: 'still_size' });
});

test('renderStill: hàng đợi FIFO ≤ 8, 1 chạy một lúc; đầy ⇒ still_queue_full; Chromium ấm dùng lại', { skip: HAS }, async () => {
  const before = still.stats().launched;
  const jobs = [];
  for (let i = 0; i < 1 + still.QUEUE_MAX; i++) jobs.push(still.renderStill({ mode: 'cast', size: [320, 180], format: 'jpeg' }));
  await assert.rejects(still.renderStill({ mode: 'cast', size: [320, 180] }), { code: 'still_queue_full' });
  const rs = await Promise.all(jobs);
  assert.equal(rs.length, 9); rs.forEach(r => assert.deepEqual(r.errors, []));
  assert.ok(still.stats().launched - before <= 1, 'cả loạt dùng một Chromium');
  assert.equal(still.stats().warm, true);
  await still.closeStill(); assert.equal(still.stats().warm, false);
});

test('renderStill: quá hạn tính từ lúc bắt đầu ⇒ still_timeout và bỏ Chromium', { skip: HAS }, async () => {
  await assert.rejects(still.renderStill({ mode: 'cast', size: [320, 180], timeoutMs: 1 }), { code: 'still_timeout' });
  const r = await still.renderStill({ mode: 'cast', size: [320, 180] });   // lần sau mở lại bình thường
  assert.deepEqual(r.errors, []);
});

test('resolveAssets: đọc theo plan.assetRefs (+ illustration cũ), kiểm magic bytes, trong assetRoot, hạ cỡ ảnh lớn', { skip: FFMPEG ? false : 'không có ffmpeg' }, () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, 'a.svg'), SVG); fs.writeFileSync(path.join(dir, 'x.txt'), 'không phải ảnh');
  // PNG 400×200 do ffmpeg tạo
  const big = path.join(dir, 'big.png');
  require('node:child_process').execFileSync(FFMPEG, ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=red:s=400x200', '-frames:v', '1', big]);
  const errors = [];
  const plan = { beats: [{ id: 'B1', block: 'illustration', params: { asset: 'a.svg' } }, { id: 'B2', block: 'title', params: {} }],
    assetRefs: [{ asset: 'big.png', label: 'màn SC-1', maxPx: [100, 100] }, 'x.txt', { asset: '../ngoai.png' }, { asset: 'khong-co.png', label: 'logo' }] };
  const d = resolveAssets(plan, errors, dir, { ffmpegPath: FFMPEG });
  assert.deepEqual(Object.keys(d).sort(), ['a.svg', 'big.png']);
  assert.match(d['a.svg'], /^data:image\/svg\+xml;base64,/);
  const png = Buffer.from(d['big.png'].split(',')[1], 'base64');
  assert.deepEqual(pngSize(png), [100, 50], 'hạ về vừa 100×100, giữ tỉ lệ');
  assert.equal(errors.length, 3);
  assert.ok(errors.some(e => /^assetRefs\[1\]: .*không phải PNG/.test(e)));
  assert.ok(errors.some(e => /ngoài thư mục asset|không đọc được/.test(e)));
  assert.ok(errors.some(e => /^logo: /.test(e)));
  // không assetRoot ⇒ không đọc file nào (luật cũ)
  const e2 = []; assert.deepEqual(resolveAssets({ beats: [], assetRefs: ['a.svg'] }, e2, null), {}); assert.match(e2[0], /chưa cấu hình thư mục asset/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('renderPlan: plan.thumbs ⇒ __still("thumb") trong CÙNG phiên Chromium, PNG có chữ + không chữ + JPEG 1280/1920; không có thumbs ⇒ [] (đường cũ)', { skip: HAS || (FFMPEG ? false : 'không có ffmpeg') }, async () => {
  const dir = tmp();
  const say = 'Xin chào', clips = { 'LN-1': { duration_ms: 800, word_times: [{ w: 'Xin', t0: 0, t1: 300 }, { w: 'chào', t0: 300, t1: 600 }], envelope: new Array(24).fill(0.5) } };
  const plan = buildPlan({ fps: 10, lesson: { title: 'T', lines: [{ id: 'LN-1', who: 'CM-0001', say }], beats: [{ id: 'B1', block: 'title', anchor: { line: 'LN-1', word: 'Xin' }, params: { text: 'Chào' } }] }, clips, channel: { name: 'K' } });
  plan.duration_ms = 600;
  const r0 = await renderPlan({ plan, outDir: path.join(dir, 'a'), assetRoot: dir });
  assert.deepEqual(r0.errors, []); assert.deepEqual(r0.thumbs, []);
  plan.thumbs = require('../render/thumb.js').resolveThumbs({ variants: [{ template: 'big-visual', headline: 'Chào bạn', face: { cast: 'CM-0001', mood: 'shock' }, visual: { beat: 'B1' } }] }, plan, {});
  const r = await renderPlan({ plan, outDir: path.join(dir, 'b'), assetRoot: dir, ffmpegPath: FFMPEG });
  assert.deepEqual(r.errors, []);
  assert.equal(r.thumbs.length, 1);
  const t = r.thumbs[0];
  assert.equal(t.measures.mode, 'thumb'); assert.equal(t.measures.stub, false); assert.equal(t.measures.headline.text, 'Chào bạn');
  assert.ok(isPng(fs.readFileSync(t.png)) && isPng(fs.readFileSync(t.png_notext)));
  assert.ok(fs.statSync(t.jpg1280).size > 500 && fs.statSync(t.jpg1920).size > 500);
  assert.ok(fs.statSync(r.cover).size > 1000, 'cover.jpg kiểu cũ vẫn có');
  fs.rmSync(dir, { recursive: true, force: true });
});
