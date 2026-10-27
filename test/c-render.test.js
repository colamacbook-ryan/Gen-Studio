// © 2026 Gen Labs — All rights reserved.
// Gói C — tích hợp: render thật bằng Chromium headless (CDP thuần) 2 giây ở 12 fps → đủ khung, 0 lỗi console, sfx + cover.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const chromium = require('../render/chromium');
const { renderPlan } = require('../render/render');
const { buildPlan } = require('../render/engine/timeline');

const LINES = [
  { id: 'LN-1', who: 'CM-0002', say: 'Anh Gen ơi, sao A.I. nói sai mà vẫn tự tin thế ạ?', terms: ['A.I.'], subtitle: { en: 'Why so sure?' } },
  { id: 'LN-2', who: 'CM-0001', say: 'Câu quen thì Hà Nội chiếm chín mươi hai phần trăm.' }
];
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 60"><rect width="100" height="60" fill="#FFD84A"/><circle cx="50" cy="30" r="20" fill="#FF6F59"/></svg>';

test('render thật 2 s @12 fps: đủ khung, 0 lỗi, sfx WAV, cover', { skip: chromium.find() ? false : 'không có Chromium' }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-c-render-')), svgPath = path.join(dir, 'hinh.svg'); fs.writeFileSync(svgPath, SVG);
  const plan = buildPlan({ fps: 12, lesson: { title: 'Bài thử', lines: LINES, beats: [
    { id: 'B1', block: 'title', anchor: { line: 'LN-1', word: 'Anh' }, params: { text: 'Vì sao A.I. sai mà vẫn tự tin?', highlight: ['tự tin?'] } },
    { id: 'B2', block: 'illustration', anchor: { line: 'LN-1', word: 'sao' }, params: { asset: svgPath, caption: 'Hình thử', fit: 'contain' } },
    { id: 'B3', block: 'prob-card', anchor: { line: 'LN-2', word: 'Hà Nội' }, params: { prompt: 'Thủ đô là', options: [['Hà Nội', 92], ['Huế', 4]], pick: 0 } }] } });
  plan.duration_ms = 2000;   // chỉ lấy 2 giây đầu để test nhanh
  const t0 = Date.now(), progress = [];
  const r = await renderPlan({ plan, outDir: dir, assetRoot: dir, onProgress: p => progress.push(p) });
  const secs = (Date.now() - t0) / 1000;
  assert.deepStrictEqual(r.errors, []);
  assert.strictEqual(r.frames, 24); assert.strictEqual(r.fps, 12);
  const files = fs.readdirSync(path.join(dir, 'frames')).sort();
  assert.strictEqual(files.length, 24); assert.strictEqual(files[0], 'f00000.jpg'); assert.strictEqual(files[23], 'f00023.jpg');
  assert.ok(r.framesPattern.endsWith('f%05d.jpg'));
  files.forEach(f => { const b = fs.readFileSync(path.join(dir, 'frames', f)); assert.ok(b[0] === 0xff && b[1] === 0xd8 && b.length > 5000, f); });
  // các khung khác nhau (có chuyển động)
  assert.notStrictEqual(fs.readFileSync(path.join(dir, 'frames', files[0])).toString('base64'), fs.readFileSync(path.join(dir, 'frames', files[23])).toString('base64'));
  assert.ok(fs.statSync(r.cover).size > 5000);
  const names = Object.keys(r.sfx); assert.ok(names.includes('pop'));
  names.forEach(n => { const w = fs.readFileSync(r.sfx[n]); assert.strictEqual(w.slice(0, 4).toString(), 'RIFF'); assert.strictEqual(w.slice(8, 12).toString(), 'WAVE'); });
  assert.ok(progress[progress.length - 1] === 1);
  console.log('# render: ' + r.frames + ' khung / ' + (r.render_ms / 1000).toFixed(1) + ' s = ' + r.render_fps + ' khung/s (tổng ' + secs.toFixed(1) + ' s)');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('asset illustration không đọc được → báo lỗi, không sập', { skip: chromium.find() ? false : 'không có Chromium' }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-c-render-'));
  const plan = buildPlan({ fps: 6, lesson: { lines: LINES, beats: [{ id: 'B2', block: 'illustration', anchor: { line: 'LN-1', word: 'sao' }, params: { asset: '/không/có/file.svg' } }] } });
  plan.duration_ms = 500;
  const r = await renderPlan({ plan, outDir: dir });
  assert.ok(r.errors.some(e => /illustration/.test(e)));
  fs.rmSync(dir, { recursive: true, force: true });
});

test('asset illustration ngoài thư mục asset hoặc qua symlink ra ngoài bị từ chối; SVG phải có gốc <svg>', () => {
  const { insideRoot, mimeOf } = require('../render/render');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-c-root-')), out = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-c-out-'));
  fs.writeFileSync(path.join(out, 'x.svg'), SVG); fs.writeFileSync(path.join(root, 'ok.svg'), SVG);
  fs.symlinkSync(path.join(out, 'x.svg'), path.join(root, 'link.svg'));
  assert.ok(insideRoot('ok.svg', root).endsWith('ok.svg'));
  assert.throws(() => insideRoot(path.join(out, 'x.svg'), root), /ngoài thư mục asset/);
  assert.throws(() => insideRoot('../' + path.basename(out) + '/x.svg', root), /ngoài thư mục asset/);
  assert.throws(() => insideRoot('link.svg', root), /ngoài thư mục asset/);
  assert.throws(() => insideRoot('ok.svg', null), /chưa cấu hình/);
  assert.strictEqual(mimeOf(Buffer.from(SVG)), 'image/svg+xml');
  assert.strictEqual(mimeOf(Buffer.from('<?xml version="1.0"?><!-- c --><svg viewBox="0 0 1 1"></svg>')), 'image/svg+xml');
  assert.strictEqual(mimeOf(Buffer.from('<html><svg></svg></html>')), null);
  fs.rmSync(root, { recursive: true, force: true }); fs.rmSync(out, { recursive: true, force: true });
});

test('c-render: Cdp.send không có phản hồi → reject cdp_timeout và gỡ khỏi pending', async () => {
  const { Cdp } = require('../render/cdp');
  const ws = { addEventListener() {}, send() { /* không bao giờ trả lời */ }, close() {} };
  const c = new Cdp(ws, { sendTimeoutMs: 50 });
  await assert.rejects(c.send('Page.enable'), e => e.code === 'cdp_timeout');
  assert.equal(c.pending.size, 0);
});
