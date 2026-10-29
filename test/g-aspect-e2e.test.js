// © 2026 Gen Labs — All rights reserved.
// F7 A-INT (SPEC-0.2.0-F7 §1 M15/M16, §10.3): e2e THẬT, không móc giả — kênh default_aspect (owner qua phiên UI) → lịch mở lệnh → runner + agent giả
// qua MCP HTTP thật nộp bài (9:16 ⇒ mẫu lesson-vertical, ảnh bìa dọc vì kênh bắt buộc ảnh bìa) → pipeline thật (Chromium + ffmpeg) → awaiting_review
// với mọi cổng áp dụng pass (8 R3 + G-THUMB + G-SAFE cho 9:16) → duyệt qua UI → xuất gói đúng tên + manifest.json.
// Ca 16:9 đi cùng đường để chứng minh không đổi: không G-SAFE, không khoá F7 mới trong plan/manifest/outputs, tên tệp xuất như cũ.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { bootTmp, request, ui } = require('./d-helpers.js');
const { gatesFor } = require('../media/gates/index.js');
const scheduler = require('../server/scheduler.js');
const { createRunner } = require('../agent/runner.js');
const chromium = require('../render/chromium');
const A = require('../render/aspects.js');

const PW = 'demo-mat-khau-123';
const FFPROBE = spawnSync('sh', ['-c', 'command -v ffprobe'], { encoding: 'utf8' }).stdout.trim() || null;
const SKIP = !chromium.find() ? 'không có Chromium' : !FFPROBE ? 'không có ffprobe' : false;

async function waitFor(fn, ms, what) {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t0 > ms) throw new Error('Quá thời gian chờ: ' + what);
    await new Promise((r) => setTimeout(r, 500));
  }
}
const probe = (f) => JSON.parse(spawnSync(FFPROBE, ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'json', f], { encoding: 'utf8' }).stdout).streams[0];

async function runAspect(aspect) {
  process.env.GS_DEMO_PASSWORD = PW;
  const t = await bootTmp({ seed: true, workers: true, pipeline: { pollMs: 200 } });
  const { db } = t.app.ctx;
  let runner = null;
  try {
    const lg = await request(t.base, 'POST', '/api/login', { body: { username: 'ryan', password: PW }, origin: t.base });
    assert.equal(lg.status, 200, lg.text);
    const call = ui(t.base, { cookie: String(lg.headers['set-cookie']).split(';')[0], csrf: lg.json.csrf });

    // --- owner chọn tỉ lệ mặc định của kênh + bắt buộc ảnh bìa (một lần, INT-02) ---
    const ch = db.get('SELECT display_id FROM channels WHERE deleted_at IS NULL ORDER BY id LIMIT 1').display_id;
    const up = await call('POST', '/api/channels', { channel: ch, data: { default_aspect: aspect, policy: { thumbnail_required: true } } });
    assert.ok(up.status < 300, up.text);
    const ag = await call('POST', '/api/agents', { name: 'Agent e2e ' + aspect, scopes: ['read', 'compose', 'run'] });
    assert.equal(ag.status, 201);

    // --- lịch mở lệnh (không đặt aspect: theo kênh) → agent giả qua MCP HTTP thật ---
    const opened = scheduler.openScheduled(t.app.ctx, new Date(Date.now() + 25 * 3600e3));
    assert.equal(opened.length, 1);
    const wo = db.get('SELECT * FROM work_orders WHERE display_id=?', opened[0]);
    assert.equal(wo.aspect, null, 'lệnh lịch không có schedule.mix ⇒ NULL = theo kênh');
    runner = createRunner({ url: t.base + '/mcp', token: ag.json.token, fake: true });
    assert.equal(await runner.tick(), 'done');
    const lv = db.json(db.get('SELECT * FROM lesson_versions WHERE work_order_id=?', wo.id));
    assert.equal(lv.aspect, aspect, 'cổng ghi lưu tỉ lệ đã phân giải (agent không gửi aspect)');
    assert.ok(lv.thumbnail && lv.thumbnail.variants.length >= 2, 'kênh bắt buộc ảnh bìa ⇒ agent nộp phương án');
    const tplAspects = [...new Set(lv.thumbnail.variants.map((v) => require('../render/thumb.js').aspectOf(require('../render/thumb.js').template(v.template))))];
    assert.deepEqual(tplAspects, [aspect], 'mẫu ảnh bìa đúng tỉ lệ của bài');
    const rd = db.get('SELECT * FROM renders WHERE lesson_version_id=?', lv.id);

    // --- pipeline thật → awaiting_review ---
    const done = await waitFor(() => {
      const r = db.json(db.get('SELECT * FROM renders WHERE id=?', rd.id));
      if (['blocked', 'waiting_quota', 'failed'].includes(r.state)) throw new Error('Render ' + r.state + ': ' + JSON.stringify(r.blocked_reason));
      return r.state === 'awaiting_review' ? r : null;
    }, 600000, 'awaiting_review');
    const view = await call('GET', '/api/renders/' + rd.display_id);
    assert.equal(view.status, 200);
    const gates = view.json.gates;
    assert.deepEqual(gates.map((g) => g.gate), gatesFor('lesson', lv), 'đủ cổng theo GATES của bài');
    assert.deepEqual(gates.filter((g) => g.result !== 'pass').map((g) => g.gate + ':' + g.result), [], 'mọi cổng áp dụng pass');
    const out = { t, db, call, rd, lv, done, view: view.json, gates: Object.fromEntries(gates.map((g) => [g.gate, g])) };

    // --- duyệt qua UI → xuất gói ---
    const rv = await call('POST', '/api/renders/' + rd.display_id + '/review', { decision: 'approved', notes: [], review_seconds: 9 });
    assert.equal(rv.status, 201, rv.text);
    const ex = await call('POST', '/api/renders/' + rd.display_id + '/export');
    assert.equal(ex.status, 200, ex.text);
    out.exportDir = ex.json.path; out.files = fs.readdirSync(ex.json.path).sort();
    out.manifest = JSON.parse(fs.readFileSync(path.join(ex.json.path, 'manifest.json'), 'utf8'));
    const mp4 = out.files.find((f) => f.endsWith('.mp4'));
    const st = probe(path.join(ex.json.path, mp4)); out.mp4Size = [st.width, st.height];   // đo trước khi t.clean() xoá thư mục
    return out;
  } finally { if (runner) runner.stop(); await t.clean(); }
}

test('e2e 9:16 (M15, M16): kênh dọc → agent giả qua MCP → pipeline thật 1080×1920 → 8 R3 + G-THUMB + G-SAFE pass → xuất RD-….9x16.mp4 + manifest platforms[]', { skip: SKIP, timeout: 900000 }, async () => {
  const o = await runAspect('9:16');
  const V = A.get('9:16');
  assert.deepEqual(o.gates['G-MUX'].measure.size, V.size, 'G-MUX đo đúng 1080×1920 (plan.size)');
  assert.ok(o.gates['G-SAFE'], 'G-SAFE áp cho bài 9:16');
  const sm = o.gates['G-SAFE'].measure;
  assert.equal(sm.aspect, '9:16'); assert.equal(sm.safe_ref, V.safe.ref); assert.equal(sm.violations.length, 0);
  assert.ok(sm.samples >= 4, 'đủ mốc đo: ' + sm.samples); assert.ok(sm.min_font_px >= V.min_font_px, 'chữ nhỏ nhất ' + sm.min_font_px);
  assert.ok(o.gates['G-THUMB'], 'G-THUMB áp (có ảnh bìa)');
  assert.ok(o.gates['G-THUMB'].measure.variants.every((v) => v.pass && v.template.startsWith('v-')), 'ảnh bìa dọc đều đạt');
  // renderView (§3.6)
  assert.equal(o.view.render.aspect, '9:16'); assert.deepEqual(o.view.render.size, V.size);
  assert.equal(typeof o.view.media.cover_frame_ms, 'number');
  assert.ok(o.view.fit && o.view.fit.yt_shorts && o.view.fit.yt_shorts.ok === true);
  assert.equal(o.done.manifest.aspect, '9:16'); assert.deepEqual(o.done.manifest.size, V.size); assert.equal(o.done.manifest.safe_ref, V.safe.ref);
  assert.equal(o.done.outputs.cover_frame_ms, o.view.media.cover_frame_ms);
  assert.ok(o.done.outputs.thumbs.length >= 2);
  // gói xuất: tên có token 9x16, MP4 1080×1920, manifest.json có platforms[]
  const id = o.rd.display_id;
  for (const f of [id + '.9x16.mp4', id + '.9x16.vi.srt', id + '.9x16.cover.jpg', id + '.9x16.cover-1920.jpg', 'manifest.json']) assert.ok(o.files.includes(f), f + ' trong ' + o.files.join(', '));
  assert.ok(!o.files.includes(id + '.mp4'), 'không có tên 16:9');
  assert.deepEqual(o.mp4Size, V.size, 'MP4 xuất ra 1080×1920');
  assert.equal(o.manifest.aspect, '9:16'); assert.deepEqual(o.manifest.size, V.size);
  assert.equal(o.manifest.cover_frame_ms, o.done.outputs.cover_frame_ms);
  assert.deepEqual(o.manifest.platforms.map((p) => p.preset), ['yt_shorts', 'fb_reels', 'tiktok']);
  assert.ok(o.manifest.platforms.every((p) => p.fit === true && /^https:\/\//.test(p.source)));
});

test('e2e 16:9 cùng đường: không G-SAFE, không khoá F7 mới (plan.layout, manifest.safe_ref, outputs.cover_frame_ms, manifest.json.platforms), tên xuất như cũ', { skip: SKIP, timeout: 900000 }, async () => {
  const o = await runAspect('16:9');
  assert.ok(!('G-SAFE' in o.gates));
  assert.deepEqual(o.gates['G-MUX'].measure.size, [1920, 1080]);
  assert.ok(o.gates['G-THUMB'].measure.variants.every((v) => v.pass && !v.template.startsWith('v-')));
  assert.equal(o.view.render.aspect, '16:9'); assert.deepEqual(o.view.render.size, [1920, 1080]);
  assert.ok(!('layout' in o.view.plan), 'plan 16:9 không có layout');
  assert.ok(!('safe_ref' in o.done.manifest)); assert.equal(o.done.manifest.aspect, '16:9');
  assert.ok(!('cover_frame_ms' in o.done.outputs));
  assert.deepEqual(o.mp4Size, [1920, 1080]);
  const id = o.rd.display_id;
  for (const f of [id + '.mp4', id + '.vi.srt', 'manifest.json']) assert.ok(o.files.includes(f), f + ' trong ' + o.files.join(', '));
  assert.ok(!o.files.some((f) => /\.16x9\./.test(f)), 'không chèn token cho 16:9');
  for (const k of ['aspect', 'size', 'duration_s', 'cover_frame_ms', 'platforms']) assert.ok(!(k in o.manifest), 'manifest.json 16:9 không có ' + k);
});
