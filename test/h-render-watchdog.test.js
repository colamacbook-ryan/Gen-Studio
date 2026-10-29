// © 2026 Gen Labs — All rights reserved.
// A-INT: nguyên nhân gốc lỗi render_timeout 120 s khi chạy cả bộ test — hạn cũ max(120 s, 5× độ dài) gần bằng chi phí dựng thật trên máy bận.
// renderPlan nay có hai hạn: TREO (stallMs: không ra khung mới ⇒ đóng Chromium) và TỔNG (deadlineMs). Chromium không mồ côi khi tiến trình Node thoát.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const chromium = require('../render/chromium');
const { renderPlan } = require('../render/render');
const H = require('./g-thumb-helpers');

const SKIP = H.NO_CHROMIUM;
const plan = () => { const p = H.fixturePlan(); p.duration_ms = 3000; return p; };
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return false; } };

test('hạn TREO: không ra khung trong stallMs ⇒ render_timeout "bị treo", Chromium đã đóng', { skip: SKIP, timeout: 120000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-wd-'));
  try {
    const before = chromium.live();
    await assert.rejects(renderPlan({ plan: plan(), outDir: dir, stallMs: 5 }), (e) => e.code === 'render_timeout' && /bị treo/.test(e.message));
    // Chromium đang mở dở lúc quá hạn cũng phải tự đóng khi mở xong (không mồ côi)
    const t0 = Date.now(); while (chromium.live() !== before && Date.now() - t0 < 30000) await new Promise((r) => setTimeout(r, 100));
    assert.equal(chromium.live(), before, 'Chromium của bản dựng bị treo đã đóng');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('hạn TỔNG: deadlineMs vẫn chặn trên tuyệt đối dù đang tiến', { skip: SKIP, timeout: 120000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-wd-'));
  try {
    const before = chromium.live();
    await assert.rejects(renderPlan({ plan: plan(), outDir: dir, deadlineMs: 5 }), (e) => e.code === 'render_timeout' && /quá hạn tổng/.test(e.message));
    const t0 = Date.now(); while (chromium.live() !== before && Date.now() - t0 < 30000) await new Promise((r) => setTimeout(r, 100));
    assert.equal(chromium.live(), before);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('đồng hồ treo đặt lại mỗi khung: tổng thời gian dựng khung > stallMs mà vẫn xong bình thường', { skip: SKIP, timeout: 180000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-wd-'));
  try {
    const p = plan(); p.fps = 30; p.duration_ms = 4000;   // 120 khung
    const r = await renderPlan({ plan: p, outDir: dir, stallMs: 1500 });
    assert.equal(r.frames, 120); assert.deepEqual(r.errors, []);
    assert.ok(r.render_ms > 1500, 'vòng khung dài hơn stallMs (' + r.render_ms + ' ms) — chỉ qua được nếu đồng hồ được đặt lại mỗi khung');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('Chromium không mồ côi: tiến trình Node mở Chromium rồi thoát ⇒ Chromium bị đóng theo', { skip: SKIP, timeout: 60000 }, () => {
  const code = "require(" + JSON.stringify(path.join(__dirname, '../render/chromium')) + ").launch({}).then(c => { console.log(c.pid); process.exit(0); })";
  const r = spawnSync(process.execPath, ['-e', code], { encoding: 'utf8', timeout: 45000 });
  const pid = Number(r.stdout.trim());
  assert.ok(pid > 0, r.stderr);
  const t0 = Date.now(); while (alive(pid) && Date.now() - t0 < 3000) spawnSync('sleep', ['0.1']);
  assert.equal(alive(pid), false, 'Chromium pid ' + pid + ' còn sống sau khi Node thoát');
});
