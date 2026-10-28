// © 2026 Gen Labs — All rights reserved.
// E2E MVP (ARCHITECTURE §9): lịch mở WO → runner + agent giả qua MCP HTTP thật → pipeline thật (Chromium + ffmpeg) → awaiting_review với 8 cổng pass
// → token agent review bị 403 → review qua phiên UI → approved → export có MP4 + SRT.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { bootTmp, request, ui } = require('./d-helpers.js');
const { gatesFor } = require('../media/gates/index.js');   // danh sách cổng đọc từ registry GATES (SPEC-0.2.0 §2.5), không hardcode số 8
const scheduler = require('../server/scheduler.js');
const { createRunner } = require('../agent/runner.js');

const PW = 'demo-mat-khau-123';
async function waitFor(fn, ms, what) {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t0 > ms) throw new Error('Quá thời gian chờ: ' + what);
    await new Promise(r => setTimeout(r, 500));
  }
}

test('e2e-mvp: lịch → agent giả → pipeline thật → duyệt qua UI → export', { timeout: 900000 }, async () => {
  process.env.GS_DEMO_PASSWORD = PW; // seedDemo đọc mật khẩu demo từ process.env
  const t = await bootTmp({ seed: true, workers: true, pipeline: { pollMs: 200 } });
  const { db } = t.app.ctx;
  try {
    // --- phiên UI của owner (user demo) ---
    const lg = await request(t.base, 'POST', '/api/login', { body: { username: 'ryan', password: PW }, origin: t.base });
    assert.equal(lg.status, 200, lg.text);
    const s = { cookie: String(lg.headers['set-cookie']).split(';')[0], csrf: lg.json.csrf };
    const call = ui(t.base, s);

    // --- agent token compose+run (không review) ---
    const ag = await call('POST', '/api/agents', { name: 'Agent e2e', scopes: ['read', 'compose', 'run'] });
    assert.equal(ag.status, 201); const token = ag.json.token;

    // --- lịch mở WO new_lesson cho mục giáo trình kế tiếp ---
    const openedBefore = db.get("SELECT COUNT(*) AS n FROM work_orders WHERE state='open'").n;
    const opened = scheduler.openScheduled(t.app.ctx, new Date(Date.now() + 25 * 3600e3));
    assert.equal(opened.length, 1, 'lịch phải mở đúng 1 WO (per_run=1)');
    const wo = db.get('SELECT * FROM work_orders WHERE display_id=?', opened[0]);
    assert.equal(wo.kind, 'new_lesson'); assert.equal(wo.state, 'open'); assert.equal(openedBefore, 0);

    // --- runner + agent giả qua MCP HTTP thật ---
    const runner = createRunner({ url: t.base + '/mcp', token, fake: true });
    assert.equal(await runner.tick(), 'done');
    assert.equal(db.get('SELECT state FROM work_orders WHERE id=?', wo.id).state, 'fulfilled');
    const lv = db.get('SELECT lv.* FROM lesson_versions lv WHERE lv.work_order_id=?', wo.id);
    assert.ok(lv, 'agent giả đã nộp bài gắn với WO');
    assert.equal(db.get('SELECT COUNT(*) AS n FROM lines WHERE lesson_version_id=?', lv.id).n, 3);
    const rd = db.get('SELECT * FROM renders WHERE lesson_version_id=?', lv.id);

    // --- pipeline thật chạy tới awaiting_review ---
    const done = await waitFor(() => {
      const r = db.json(db.get('SELECT * FROM renders WHERE id=?', rd.id));
      if (['blocked', 'waiting_quota'].includes(r.state)) throw new Error('Render ' + r.state + ': ' + JSON.stringify(r.blocked_reason));
      return r.state === 'awaiting_review' ? r : null;
    }, 600000, 'awaiting_review');
    assert.ok(done.duration_ms > 3000 && done.frames > 90);
    const view = await call('GET', '/api/renders/' + rd.display_id);
    assert.equal(view.status, 200);
    assert.deepEqual(view.json.gates.map(g => g.gate), gatesFor('lesson', {}), 'đủ cổng theo GATES của bài (không có thumbnail ⇒ 8 cổng R3)');
    assert.deepEqual(view.json.gates.filter(g => g.result !== 'pass'), [], 'mọi cổng áp dụng phải pass'); 
    assert.equal(view.json.render.state, 'awaiting_review');
    assert.ok(view.json.plan.lines.length >= 3 && view.json.plan.beats.length >= 3);
    assert.ok(view.json.media.asset_id);
    const q = await call('GET', '/api/grid/review_queue?q=' + encodeURIComponent('state:awaiting_review'));
    assert.ok(q.json.rows.some(r => r.render === rd.display_id));

    // --- video xem được (Range) ---
    const part = await request(t.base, 'GET', '/media/' + view.json.media.asset_id, { cookie: s.cookie, headers: { Range: 'bytes=0-1023' } });
    assert.equal(part.status, 206); assert.equal(part.buf.length, 1024);
    assert.equal(part.buf.subarray(4, 8).toString('latin1'), 'ftyp', 'MP4 hợp lệ');

    // --- token agent review bị từ chối (R2) ---
    const bad = await request(t.base, 'POST', '/api/renders/' + rd.display_id + '/review', { token, origin: t.base, body: { decision: 'approved', notes: [], review_seconds: 1 } });
    assert.equal(bad.status, 403);
    assert.equal(db.get("SELECT state FROM renders WHERE id=?", rd.id).state, 'awaiting_review');
    assert.equal(db.get('SELECT COUNT(*) AS n FROM reviews WHERE render_id=?', rd.id).n, 0);
    const mcpTry = await request(t.base, 'POST', '/mcp', { token, body: { jsonrpc: '2.0', id: 9, method: 'tools/call', params: { name: 'review_render', arguments: { render: rd.display_id, decision: 'approved' } } } });
    assert.ok(mcpTry.json.error, 'MCP không có tool review');

    // --- review qua phiên UI → approved ---
    const rv = await call('POST', '/api/renders/' + rd.display_id + '/review', { decision: 'approved', notes: [], review_seconds: 12 });
    assert.equal(rv.status, 201, rv.text);
    assert.equal(db.get('SELECT state FROM renders WHERE id=?', rd.id).state, 'approved');
    assert.equal(db.get('SELECT entry FROM audit_log WHERE action=? ORDER BY rowid DESC', 'review.create').entry, 'ui');

    // --- export: MP4 + SRT + cover + manifest ---
    const ex = await call('POST', '/api/renders/' + rd.display_id + '/export');
    assert.equal(ex.status, 200, ex.text);
    const dir = ex.json.path;
    assert.ok(dir.startsWith(path.join(t.dir, 'exports')));
    const files = fs.readdirSync(dir);
    assert.ok(files.some(f => f.endsWith('.mp4')), 'có MP4: ' + files);
    assert.ok(files.some(f => f.endsWith('.vi.srt')), 'có SRT vi');
    assert.ok(files.includes('manifest.json'));
    const mp4 = fs.readFileSync(path.join(dir, rd.display_id + '.mp4'));
    assert.ok(mp4.length > 10000 && mp4.subarray(4, 8).toString('latin1') === 'ftyp');
    const srt = fs.readFileSync(path.join(dir, rd.display_id + '.vi.srt'), 'utf8');
    assert.equal((srt.match(/-->/g) || []).length, 3);
    const man = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
    assert.equal(man.render, rd.display_id);
    runner.stop();
  } finally { await t.clean(); }
});
