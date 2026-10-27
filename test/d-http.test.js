// © 2026 Gen Labs — All rights reserved.
// Gói D: HTTP — Host/Origin, phiên + CSRF, setup một lần, review chỉ qua UI, /media Range, /mcp.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { bootTmp, request, setupOwner, ui } = require('./d-helpers.js');

test('d-http: health, Host lạ bị chặn, tệp tĩnh, chống path traversal', async () => {
  const t = await bootTmp();
  try {
    const h = await request(t.base, 'GET', '/api/health');
    assert.equal(h.status, 200); assert.equal(h.json.ok, true); assert.ok(h.json.version);
    const bad = await request(t.base, 'GET', '/api/setup/state', { headers: { Host: 'evil.example.com' } });
    assert.equal(bad.status, 403);
    const idx = await request(t.base, 'GET', '/');
    assert.equal(idx.status, 200); assert.match(idx.headers['content-type'], /text\/html/);
    assert.equal(idx.headers['x-content-type-options'], 'nosniff');
    const tr = await request(t.base, 'GET', '/..%2fserver%2fmain.js');
    assert.ok([403, 404].includes(tr.status), 'path traversal phải bị từ chối, nhận ' + tr.status);
    assert.ok(!/boot/.test(tr.text));
  } finally { await t.clean(); }
});

test('d-http: setup owner bằng khoá một lần → cookie HttpOnly/SameSite=Strict, chỉ một lần', async () => {
  const t = await bootTmp();
  try {
    assert.equal((await request(t.base, 'GET', '/api/setup/state')).json.owner, false);
    const keyFile = path.join(t.dir, 'run', 'admin-key');
    assert.ok(fs.existsSync(keyFile));
    const body = { username: 'owner', display_name: 'Chủ', password: 'mat-khau-rat-dai-123', lang: 'vi' };
    assert.equal((await request(t.base, 'POST', '/api/setup/owner?k=sai', { body, origin: t.base })).status, 403);
    assert.equal((await request(t.base, 'POST', '/api/setup/owner?k=' + fs.readFileSync(keyFile, 'utf8').trim(), { body: { ...body, password: 'ngan' }, origin: t.base })).status, 400);
    const r = await request(t.base, 'POST', '/api/setup/owner?k=' + fs.readFileSync(keyFile, 'utf8').trim(), { body, origin: t.base });
    assert.equal(r.status, 201);
    const sc = String(r.headers['set-cookie']);
    assert.match(sc, /gs_sess=/); assert.match(sc, /HttpOnly/); assert.match(sc, /SameSite=Strict/);
    assert.ok(r.json.csrf);
    assert.equal(fs.existsSync(keyFile), false, 'khoá một lần phải bị xoá');
    assert.equal((await request(t.base, 'POST', '/api/setup/owner?k=x', { body, origin: t.base })).status, 409);
    assert.equal((await request(t.base, 'GET', '/api/setup/state')).json.owner, true);
    const me = await request(t.base, 'GET', '/api/me', { cookie: sc.split(';')[0] });
    assert.equal(me.status, 200); assert.equal(me.json.user.role, 'owner'); assert.equal(me.json.user.username, 'owner');
    assert.equal((await request(t.base, 'GET', '/api/me')).status, 401);
    // đăng nhập
    assert.equal((await request(t.base, 'POST', '/api/login', { body: { username: 'owner', password: 'sai-mat-khau-xxx' }, origin: t.base })).status, 401);
    const ok = await request(t.base, 'POST', '/api/login', { body: { username: 'owner', password: body.password }, origin: t.base });
    assert.equal(ok.status, 200);
  } finally { await t.clean(); }
});

test('d-http: ghi từ UI cần CSRF + Origin đúng; review không dùng được token agent (403)', async () => {
  const t = await bootTmp();
  try {
    const s = await setupOwner(t.app, t.base);
    const call = ui(t.base, s);
    // thiếu CSRF
    assert.equal((await request(t.base, 'POST', '/api/channels', { body: { name: 'K' }, cookie: s.cookie, origin: t.base })).status, 403);
    // Origin lạ
    assert.equal((await request(t.base, 'POST', '/api/channels', { body: { name: 'K' }, cookie: s.cookie, csrf: s.csrf, origin: 'http://evil.example.com' })).status, 403);
    const ch = await call('POST', '/api/channels', { name: 'Kênh thử', lang: 'vi', term_lang: 'en', schedule: { time: '06:00', per_run: 1 } });
    assert.equal(ch.status, 201); assert.match(ch.json.display_id, /^CH-/);
    const ag = await call('POST', '/api/agents', { name: 'Agent thử', scopes: ['read', 'compose', 'run'] });
    assert.equal(ag.status, 201); assert.ok(ag.json.token); assert.match(ag.json.display_id, /^AG-/);
    // review bằng token agent → 403, không cần render tồn tại
    const rv = await request(t.base, 'POST', '/api/renders/RD-0001/review', { token: ag.json.token, body: { decision: 'approved' }, origin: t.base });
    assert.equal(rv.status, 403);
    // review bằng phiên UI nhưng thiếu Origin → 403
    const rv2 = await request(t.base, 'POST', '/api/renders/RD-0001/review', { cookie: s.cookie, csrf: s.csrf, body: { decision: 'approved' } });
    assert.equal(rv2.status, 403);
    // phiên hợp lệ nhưng render không tồn tại → 404 (qua được lớp bảo mật)
    assert.equal((await call('POST', '/api/renders/RD-0001/review', { decision: 'approved' })).status, 404);
    // logout đóng phiên
    assert.equal((await call('POST', '/api/logout')).status, 200);
    assert.equal((await request(t.base, 'GET', '/api/me', { cookie: s.cookie })).status, 401);
  } finally { await t.clean(); }
});

test('d-http: /media cần phiên, Range 206, nosniff, SVG có CSP sandbox', async () => {
  const t = await bootTmp();
  try {
    const s = await setupOwner(t.app, t.base);
    const sys = { type: 'system', entry: 'system' };
    const bytes = Buffer.from(JSON.stringify({ x: 'a'.repeat(2000) }));
    const a = t.app.ctx.write(sys, 'asset.put', { kind: 'manifest', bytes, mime: 'application/json', source: 'system' });
    assert.equal((await request(t.base, 'GET', '/media/' + a.display_id)).status, 401);
    const full = await request(t.base, 'GET', '/media/' + a.display_id, { cookie: s.cookie });
    assert.equal(full.status, 200); assert.equal(full.buf.length, bytes.length);
    assert.equal(full.headers['x-content-type-options'], 'nosniff');
    assert.equal(full.headers['content-type'], 'application/json');
    const part = await request(t.base, 'GET', '/media/' + a.display_id, { cookie: s.cookie, headers: { Range: 'bytes=10-19' } });
    assert.equal(part.status, 206); assert.equal(part.buf.length, 10);
    assert.equal(part.headers['content-range'], `bytes 10-19/${bytes.length}`);
    assert.ok(part.buf.equals(bytes.subarray(10, 20)));
    const suffix = await request(t.base, 'GET', '/media/' + a.display_id, { cookie: s.cookie, headers: { Range: 'bytes=-5' } });
    assert.equal(suffix.status, 206); assert.ok(suffix.buf.equals(bytes.subarray(bytes.length - 5)));
    assert.equal((await request(t.base, 'GET', '/media/' + a.display_id, { cookie: s.cookie, headers: { Range: 'bytes=99999-' } })).status, 416);
    const svg = t.app.ctx.write(sys, 'asset.put', { kind: 'svg', bytes: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><rect width="1" height="1"/></svg>'), mime: 'image/svg+xml', source: 'system' });
    const sv = await request(t.base, 'GET', '/media/' + svg.display_id, { cookie: s.cookie });
    assert.equal(sv.status, 200); assert.match(sv.headers['content-security-policy'], /sandbox/);
    assert.equal((await request(t.base, 'GET', '/media/AS-9999', { cookie: s.cookie })).status, 404);
  } finally { await t.clean(); }
});

test('d-http: /mcp — token, initialize, tools/list không có tool duyệt/xoá, ping, phạm vi', async () => {
  const t = await bootTmp();
  try {
    const s = await setupOwner(t.app, t.base);
    const call = ui(t.base, s);
    const full = (await call('POST', '/api/agents', { name: 'Full', scopes: ['read', 'compose', 'run'] })).json;
    const ro = (await call('POST', '/api/agents', { name: 'RO', scopes: ['read'] })).json;
    const rpc = (tok, method, params, id = 1) => request(t.base, 'POST', '/mcp', { token: tok, body: { jsonrpc: '2.0', id, method, params } });
    assert.equal((await rpc(null, 'ping')).status, 401);
    assert.equal((await rpc('gst_khong_ton_tai', 'ping')).status, 401);
    const init = await rpc(full.token, 'initialize', { protocolVersion: '2025-06-18' });
    assert.equal(init.json.result.protocolVersion, '2025-06-18');
    assert.ok(init.json.result.capabilities.tools);
    assert.deepEqual((await rpc(full.token, 'ping')).json.result, {});
    const tl = (await rpc(full.token, 'tools/list')).json.result.tools.map(x => x.name);
    for (const n of ['get_next_task', 'complete_task', 'submit_lesson', 'validate_lesson', 'get_render', 'run_lesson', 'get_export', 'list_review_notes']) assert.ok(tl.includes(n), 'thiếu tool ' + n);
    assert.equal(tl.filter(n => /approve|reject|delete|(^|_)review(_render)?$|remove|revoke/.test(n)).length, 0, 'không được có tool duyệt/xoá: ' + tl.join(','));
    const roList = (await rpc(ro.token, 'tools/list')).json.result.tools.map(x => x.name);
    assert.ok(!roList.includes('submit_lesson') && roList.includes('get_lesson'));
    // gọi tool vượt phạm vi → isError forbidden
    const bad = (await rpc(ro.token, 'tools/call', { name: 'submit_lesson', arguments: { title: 'x', lines: [], beats: [] } })).json.result;
    assert.equal(bad.isError, true); assert.equal(bad.structuredContent.error.code, 'forbidden');
    // tool review không tồn tại
    const unk = (await rpc(full.token, 'tools/call', { name: 'review_render', arguments: {} })).json;
    assert.ok(unk.error && unk.error.code === -32602);
    // token đã thu hồi → 401
    await call('POST', '/api/agents/' + ro.display_id + '/revoke');
    assert.equal((await rpc(ro.token, 'ping')).status, 401);
    // Origin lạ trên /mcp → 403
    assert.equal((await request(t.base, 'POST', '/mcp', { token: full.token, origin: 'http://evil.example.com', body: { jsonrpc: '2.0', id: 1, method: 'ping' } })).status, 403);
  } finally { await t.clean(); }
});

test('d-http: lưới + overview qua REST trả đúng hình dạng', async () => {
  const t = await bootTmp({ seed: true });
  try {
    // seed tạo user ryan với mật khẩu GS_DEMO_PASSWORD hoặc ngẫu nhiên → đặt lại bằng CLI helper
    const auth = require('../server/auth.js');
    const r = auth.resetOwnerPassword(t.app.ctx.db);
    const lg = await request(t.base, 'POST', '/api/login', { body: { username: r.username, password: r.password }, origin: t.base });
    assert.equal(lg.status, 200);
    const cookie = String(lg.headers['set-cookie']).split(';')[0];
    const rq = await request(t.base, 'GET', '/api/grid/review_queue', { cookie });
    assert.equal(rq.status, 200);
    assert.ok(rq.json.columns.some(c => c.key === 'render'));
    assert.ok(rq.json.rows.length >= 1 && /^RD-/.test(rq.json.rows[0].render));
    assert.ok('count' in rq.json.footer);
    const bad = await request(t.base, 'GET', '/api/grid/khong_co', { cookie });
    assert.equal(bad.status, 404);
    const badq = await request(t.base, 'GET', '/api/grid/work_orders?q=' + encodeURIComponent('cot_la:1'), { cookie });
    assert.equal(badq.status, 400);
    const ov = await request(t.base, 'GET', '/api/overview', { cookie });
    assert.equal(ov.status, 200);
    for (const k of ['awaiting_review', 'running', 'stalled_work_orders', 'yesterday', 'providers', 'next_schedule', 'disk']) assert.ok(k in ov.json, 'overview thiếu ' + k);
    const rd = await request(t.base, 'GET', '/api/renders/' + rq.json.rows[0].render, { cookie });
    assert.equal(rd.status, 200); assert.equal(rd.json.gates.length, 8); assert.ok(rd.json.render.lesson_display_id);
    const ls = await request(t.base, 'GET', '/api/lessons/LS-0001', { cookie });
    assert.equal(ls.status, 200); assert.ok(ls.json.lines.length >= 1 && ls.json.versions.length >= 1);
  } finally { await t.clean(); }
});
