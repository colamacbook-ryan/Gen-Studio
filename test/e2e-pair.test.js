// © 2026 Gen Labs — All rights reserved.
// E2E ghép thiết bị: runner (không token) xin mã → chủ xưởng Duyệt qua phiên UI → runner lưu token (0600) → agent giả nhận việc và nộp bài qua /mcp thật
// → access token sắp hết hạn tự refresh → thu hồi thì runner phải ghép lại (không còn quyền cũ). Không cần Chromium/ffmpeg (không chạy pipeline).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { bootTmp, request, ui } = require('./d-helpers.js');
const scheduler = require('../server/scheduler.js');
const { createRunner } = require('../agent/runner.js');

const PW = 'demo-mat-khau-123';
async function waitFor(fn, ms, what) {
  const t0 = Date.now();
  for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) throw new Error('Quá thời gian chờ: ' + what); await new Promise(r => setTimeout(r, 40)); }
}

test('e2e-pair: runner chờ cửa sổ ghép → owner mở + Duyệt → chạy bài → refresh → "Tắt" thì không tự xin lại → mở lại mới ghép', { timeout: 60000 }, async () => {
  process.env.GS_DEMO_PASSWORD = PW;
  const t = await bootTmp({ seed: true, config: { deviceIntervalMs: 20 } });
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-agent-state-'));
  const { db } = t.app.ctx;
  let runner;
  const pendingReqs = async call => (await call('GET', '/api/auth-requests')).json.requests;
  try {
    const lg = await request(t.base, 'POST', '/api/login', { body: { username: 'ryan', password: PW }, origin: t.base });
    assert.equal(lg.status, 200, lg.text);
    const call = ui(t.base, { cookie: String(lg.headers['set-cookie']).split(';')[0], csrf: lg.json.csrf });
    const opened = scheduler.openScheduled(t.app.ctx, new Date(Date.now() + 25 * 3600e3));
    assert.equal(opened.length, 1);

    // runner đi vào bằng Host nội bộ (kênh internal) như trong mạng Docker; không có token → unpaired, KHÔNG xin mã khi cửa sổ đóng
    runner = createRunner({ url: t.base + '/mcp', fake: true, stateDir, pollMs: 50, statusMs: 50, hostHeader: 'studio:7490', clientName: 'Runner e2e' });
    assert.ok(runner.auth, 'không có token → chế độ ghép thiết bị');
    const tick = runner.tick();
    const rs = await waitFor(async () => (await call('GET', '/api/runner-status')).json.runner, 5000, 'runner báo trạng thái');
    assert.equal(rs.state, 'unpaired'); assert.equal(rs.online, true);
    await new Promise(r => setTimeout(r, 300));
    assert.equal(db.get('SELECT COUNT(*) AS n FROM auth_requests').n, 0, 'chưa mở cửa sổ ghép thì runner không xin mã');
    // owner bấm "Bật agent nội bộ" → runner xin đúng một mã → thẻ internal hiện ra → Duyệt
    assert.equal((await call('POST', '/api/pairing/open', { channel: 'internal' })).status, 200);
    const req = await waitFor(async () => (await pendingReqs(call))[0], 5000, 'yêu cầu ghép');
    assert.equal(req.kind, 'device'); assert.equal(req.agent_kind, 'internal'); assert.equal(req.channel, 'internal'); assert.equal(req.needs_code, false);
    await waitFor(async () => (await call('GET', '/api/runner-status')).json.runner.state === 'waiting', 5000, 'runner báo waiting');
    const ap = await call('POST', `/api/auth-requests/${req.id}/approve`, {});
    assert.equal(ap.status, 200, ap.text);
    assert.equal(await tick, 'done');
    assert.equal(db.get('SELECT COUNT(*) AS n FROM auth_requests').n, 1, 'chỉ một yêu cầu cho một lần mở cửa sổ');

    const f = path.join(stateDir, 'token.json');
    assert.equal(fs.statSync(f).mode & 0o777, 0o600);
    const saved = JSON.parse(fs.readFileSync(f, 'utf8'));
    assert.match(saved.access_token, /^gsa_/); assert.match(saved.refresh_token, /^gsr_/); assert.match(saved.client_id, /^dev_/);
    const agent = db.get('SELECT * FROM agents WHERE display_id=?', ap.json.agent.display_id);
    assert.equal(agent.kind, 'internal');
    assert.equal(db.get('SELECT state FROM work_orders WHERE display_id=?', opened[0]).state, 'fulfilled');
    assert.ok(db.get('SELECT 1 AS x FROM lesson_versions lv JOIN work_orders w ON w.id=lv.work_order_id WHERE w.display_id=?', opened[0]));
    // lời gọi mang Bearer là actor agent:<id> (có kiểm phạm vi), không phải runner/system
    assert.ok(db.get("SELECT 1 AS x FROM audit_log WHERE action='lesson.submit' AND actor=? AND entry='mcp'", 'agent:' + agent.id));
    assert.equal(db.get("SELECT COUNT(*) AS n FROM audit_log WHERE action='lesson.submit' AND actor IN ('runner','system')").n, 0);

    // access token sắp hết hạn → tự refresh (token cũ đã xoay, cặp mới được lưu nguyên tử)
    runner.auth.tok.expires_at = Date.now() + 1000;
    assert.equal(await runner.tick(), 'idle');
    const saved2 = JSON.parse(fs.readFileSync(f, 'utf8'));
    assert.notEqual(saved2.refresh_token, saved.refresh_token); assert.ok(saved2.expires_at > Date.now() + 3000e3);
    // refresh song song chỉ chạy một lần (single-flight)
    const before = db.get("SELECT COUNT(*) AS n FROM oauth_grants WHERE kind='refresh'").n;
    runner.auth.tok.expires_at = Date.now() + 1000;
    await Promise.all([runner.auth.get(), runner.auth.get(), runner.auth.get()]);
    assert.equal(db.get("SELECT COUNT(*) AS n FROM oauth_grants WHERE kind='refresh'").n, before + 1);
    assert.equal(db.get("SELECT status FROM agents WHERE id=?", agent.id).status, 'active', 'không bị coi là refresh bị dùng lại');

    // "Tắt agent nội bộ" (thu hồi): runner về unpaired và KHÔNG tự xin lại khi cửa sổ đóng
    assert.equal((await call('POST', `/api/agents/${agent.display_id}/revoke`, {})).status, 200);
    runner.auth.tok.expires_at = Date.now() + 1000;
    const again = runner.tick();
    await waitFor(async () => !fs.existsSync(f), 5000, 'xoá token cũ');
    await waitFor(async () => (await call('GET', '/api/runner-status')).json.runner.state === 'unpaired', 5000, 'unpaired sau thu hồi');
    await new Promise(r => setTimeout(r, 400));
    assert.equal(db.get('SELECT COUNT(*) AS n FROM auth_requests').n, 1, 'không tự xin ghép lại');
    // owner mở lại ghép → runner xin mã mới
    assert.equal((await call('POST', '/api/pairing/open', { channel: 'internal' })).status, 200);
    const req2 = await waitFor(async () => (await pendingReqs(call))[0], 5000, 'yêu cầu ghép lại');
    assert.notEqual(req2.id, req.id);
    runner.stop();
    assert.equal(await again, 'error');
  } finally { if (runner) runner.stop(); fs.rmSync(stateDir, { recursive: true, force: true }); await t.clean(); }
});
