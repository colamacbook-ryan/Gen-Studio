// © 2026 Gen Labs — All rights reserved.
// Duyệt quyền MCP: OAuth 2.1 (register → authorize → duyệt → token → /mcp → refresh → thu hồi), PKCE/redirect/code/refresh/audience/phạm vi,
// ghép thiết bị chỉ theo ý định owner (cửa sổ ghép, kênh vào, tự gõ mã), chỉ owner-UI duyệt, rào kênh vào, migration.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { bootTmp, request, setupOwner, ui } = require('./d-helpers.js');
const events = require('../server/events.js');
const dbm = require('../server/db.js');

const FORM = { 'Content-Type': 'application/x-www-form-urlencoded' };
const INTERNAL = { Host: 'studio:7490' };            // kênh nội bộ: Host của runner trong mạng Docker
const PUBLIC = { 'X-Forwarded-For': '203.0.113.9' };  // dấu vết tunnel/proxy → kênh công khai
const DEV = 'urn:ietf:params:oauth:grant-type:device_code';
const form = o => new URLSearchParams(o).toString();
const b64 = b => Buffer.from(b).toString('base64url');
const pkce = () => { const verifier = b64(crypto.randomBytes(32)); return { verifier, challenge: crypto.createHash('sha256').update(verifier).digest('base64url') }; };
const token = (base, o, headers) => request(base, 'POST', '/oauth/token', { body: form(o), headers: Object.assign({}, FORM, headers) });
const mcp = (base, tok, method = 'tools/list', params) => request(base, 'POST', '/mcp', { token: tok, body: { jsonrpc: '2.0', id: 1, method, params } });
const wait = (ms = 60) => new Promise(r => setTimeout(r, ms));
const dbOf = t => t.app.ctx.db;

async function register(base, uris = ['http://127.0.0.1:53682/callback'], name = 'Claude Code', headers) {
  const r = await request(base, 'POST', '/oauth/register', { body: { client_name: name, redirect_uris: uris, token_endpoint_auth_method: 'client_secret_post' }, headers });
  assert.equal(r.status, 201, r.text);
  return r.json.client_id;
}
async function authorize(base, clientId, redirect, { scope = 'read compose', resource, challenge, state = 'st-123', method = 'S256', headers } = {}) {
  const q = { response_type: 'code', client_id: clientId, redirect_uri: redirect, state };
  if (scope !== null) q.scope = scope;
  if (challenge) { q.code_challenge = challenge; q.code_challenge_method = method; }
  if (resource) q.resource = resource;
  const r = await request(base, 'GET', '/oauth/authorize?' + form(q), { headers });
  return Object.assign(r, { location: r.headers.location });
}
const reqIdOf = loc => new URL(loc, 'http://x').hash.match(/req=([^&]+)/)[1];
// chạy trọn đến khi có code (bước duyệt qua phiên UI)
async function getCode(t, call, { redirect = 'http://127.0.0.1:53682/callback', scopes, scope, resource, confirm, clientId } = {}) {
  clientId = clientId || await register(t.base, [redirect]);
  const { verifier, challenge } = pkce();
  const a = await authorize(t.base, clientId, redirect, { challenge, scope, resource });
  assert.equal(a.status, 302, a.text);
  const id = reqIdOf(a.location);
  const body = Object.assign(scopes ? { scopes } : {}, confirm ? { confirm: true } : {});
  const ap = await call('POST', `/api/auth-requests/${id}/approve`, body);
  assert.equal(ap.status, 200, ap.text);
  const u = new URL(ap.json.redirect);
  assert.equal(u.searchParams.get('state'), 'st-123');
  return { clientId, verifier, redirect, code: u.searchParams.get('code'), id, approve: ap.json };
}
const exchange = (base, g, over = {}) => token(base, Object.assign({ grant_type: 'authorization_code', code: g.code, client_id: g.clientId, redirect_uri: g.redirect, code_verifier: g.verifier }, over));
async function boot(extra) {
  const t = await bootTmp(extra);
  const s = await setupOwner(t.app, t.base);
  return Object.assign(t, { s, call: ui(t.base, s) });
}
const openWindow = async (t, channel = 'internal') => assert.equal((await t.call('POST', '/api/pairing/open', { channel })).status, 200);
const byCode = (t, code) => dbOf(t).get('SELECT * FROM auth_requests WHERE user_code_hash=?', crypto.createHash('sha256').update(code).digest('hex'));
const startDevice = (t, body = {}, headers) => request(t.base, 'POST', '/oauth/device', { body: Object.assign({ client_name: 'Runner' }, body), headers });

test('oauth: metadata (PRM cả hai đường, AS đủ trường) + /mcp 401 trỏ metadata kèm scope; Host lạ không dựng được issuer', async () => {
  const t = await bootTmp();
  try {
    for (const p of ['/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/mcp']) {
      const pr = await request(t.base, 'GET', p);
      assert.equal(pr.status, 200); assert.equal(pr.json.resource, t.base + '/mcp'); assert.deepEqual(pr.json.authorization_servers, [t.base]);
      assert.deepEqual(pr.json.scopes_supported, ['read', 'compose', 'run']); assert.deepEqual(pr.json.bearer_methods_supported, ['header']);
    }
    for (const p of ['/.well-known/oauth-authorization-server', '/.well-known/openid-configuration']) {
      const as = (await request(t.base, 'GET', p)).json;
      assert.equal(as.issuer, t.base);
      assert.deepEqual(as.code_challenge_methods_supported, ['S256']); assert.deepEqual(as.token_endpoint_auth_methods_supported, ['none']); assert.deepEqual(as.response_types_supported, ['code']);
      assert.deepEqual(as.scopes_supported, ['read', 'compose', 'run']); assert.ok(as.grant_types_supported.includes(DEV) && as.grant_types_supported.includes('refresh_token'));
      for (const k of ['authorization_endpoint', 'token_endpoint', 'registration_endpoint', 'device_authorization_endpoint']) assert.ok(as[k].startsWith(t.base + '/oauth/'), k);
    }
    const un = await request(t.base, 'POST', '/mcp', { body: { jsonrpc: '2.0', id: 1, method: 'ping' } });
    assert.equal(un.status, 401);
    assert.equal(un.headers['www-authenticate'], `Bearer realm="gen-studio", resource_metadata="${t.base}/.well-known/oauth-protected-resource", scope="read compose run"`);
    // Host ngoài danh sách cho phép: /oauth/* và /.well-known/* đều bị chặn (không phản chiếu Host vào issuer)
    for (const [m, p] of [['GET', '/.well-known/oauth-protected-resource'], ['GET', '/.well-known/oauth-authorization-server'], ['POST', '/oauth/token'], ['POST', '/oauth/register'], ['GET', '/oauth/pairing-status']]) {
      const r = await request(t.base, m, p, { headers: { Host: 'evil.example.com' }, body: m === 'POST' ? {} : undefined });
      assert.equal(r.status, 403, p); assert.ok(!/evil/.test(r.text.replace('Host không được phép', '')), p);
    }
    assert.ok(!/evil/.test((await request(t.base, 'POST', '/mcp', { headers: { Host: 'evil.example.com' }, body: {} })).headers['www-authenticate'] || ''), '/mcp không dựng metadata từ Host lạ');
    // studio:7490 (runner) nằm trong danh sách; publicUrl khớp Host thì dùng đúng origin của nó
    assert.equal((await request(t.base, 'GET', '/.well-known/oauth-protected-resource', { headers: INTERNAL })).json.resource, 'http://studio:7490/mcp');
    const cfg = await bootTmp({ config: { publicUrl: 'https://studio.example.com' } });
    try { assert.equal((await request(cfg.base, 'GET', '/.well-known/oauth-protected-resource', { headers: { Host: 'studio.example.com' } })).json.resource, 'https://studio.example.com/mcp'); } finally { await cfg.clean(); }
  } finally { await t.clean(); }
});

test('oauth: luồng đầy đủ register → authorize → duyệt → token → /mcp → refresh → thu hồi → 401; nhật ký actor client + entry oauth', async () => {
  const t = await boot();
  try {
    const g = await getCode(t, t.call, { scope: 'read compose run', scopes: ['read', 'compose'] });   // hạ run
    assert.equal(g.approve.agent.kind, 'oauth'); assert.deepEqual(g.approve.agent.scopes, ['read', 'compose']); assert.match(g.approve.agent.name, /\(tự khai\)$/);
    const tk = await exchange(t.base, g);
    assert.equal(tk.status, 200, tk.text);
    assert.match(tk.json.access_token, /^gsa_/); assert.match(tk.json.refresh_token, /^gsr_/);
    assert.equal(tk.json.token_type, 'Bearer'); assert.equal(tk.json.expires_in, 3600); assert.equal(tk.json.scope, 'read compose');
    assert.match(tk.headers['cache-control'], /no-store/);
    const db = dbOf(t);
    const row = db.get("SELECT * FROM agent_tokens WHERE kind='access'");
    assert.equal(row.token_hash.length, 64); assert.equal(row.audience, db.get("SELECT value FROM settings WHERE key='server_id'").value.replace(/"/g, ''), 'audience là server_id, không phải URL');
    assert.ok(!row.audience.includes('http')); assert.ok(row.expires_at > new Date().toISOString()); assert.equal(row.scopes, '["read","compose"]');
    assert.equal(db.get('SELECT COUNT(*) AS n FROM agent_tokens WHERE token_hash=?', tk.json.access_token).n, 0, 'không lưu token thô');
    const l = await mcp(t.base, tk.json.access_token);
    assert.equal(l.status, 200, l.text); assert.ok(l.json.result.tools.length > 0);
    const rf = await token(t.base, { grant_type: 'refresh_token', refresh_token: tk.json.refresh_token, client_id: g.clientId });
    assert.equal(rf.status, 200, rf.text); assert.notEqual(rf.json.refresh_token, tk.json.refresh_token);
    assert.equal((await mcp(t.base, rf.json.access_token)).status, 200);
    const ag = (await t.call('GET', '/api/grid/agents')).json.rows.find(r => r.kind === 'oauth'); assert.ok(ag.expires_at);
    assert.equal((await t.call('POST', `/api/agents/${ag.display_id}/revoke`, {})).status, 200);
    assert.equal((await mcp(t.base, rf.json.access_token)).status, 401);
    const rf2 = await token(t.base, { grant_type: 'refresh_token', refresh_token: rf.json.refresh_token, client_id: g.clientId });
    assert.equal(rf2.status, 400); assert.equal(rf2.json.error, 'invalid_grant');
    const acts = db.all("SELECT action, actor, entry FROM audit_log WHERE action LIKE 'auth.%'");
    for (const a of ['auth.init', 'auth.register', 'auth.request', 'auth.approve', 'auth.exchange', 'auth.refresh']) assert.ok(acts.some(x => x.action === a), a);
    assert.equal(acts.find(x => x.action === 'auth.approve').entry, 'ui');
    const ex = acts.find(x => x.action === 'auth.exchange'); assert.equal(ex.entry, 'oauth'); assert.equal(ex.actor, 'client:' + g.clientId);
    assert.ok(!JSON.stringify(db.all('SELECT before, after FROM audit_log')).match(/gs[acrd]_[A-Za-z0-9_-]{20,}/), 'audit không chứa token/code');
  } finally { await t.clean(); }
});

test('oauth: PKCE sai, redirect_uri lạ, code dùng lại (thu hồi cái đã cấp), code quá 60 s, scope mặc định = cả ba', async () => {
  const t = await boot();
  try {
    let g = await getCode(t, t.call);
    const bad = await exchange(t.base, g, { code_verifier: b64(crypto.randomBytes(32)) });
    assert.equal(bad.status, 400); assert.equal(bad.json.error, 'invalid_grant');
    assert.equal((await exchange(t.base, g)).status, 400, 'code đã bị đốt');
    const cid = await register(t.base);
    const np = await authorize(t.base, cid, 'http://127.0.0.1:53682/callback', {});
    assert.equal(np.status, 302); assert.match(np.location, /^http:\/\/127\.0\.0\.1:53682\/callback\?error=invalid_request/);
    assert.match((await authorize(t.base, cid, 'http://127.0.0.1:53682/callback', { challenge: pkce().challenge, method: 'plain' })).location, /error=invalid_request/);
    const ru = await authorize(t.base, cid, 'https://evil.example.com/cb', { challenge: pkce().challenge });
    assert.equal(ru.status, 400); assert.ok(!ru.location);
    assert.equal((await authorize(t.base, 'cl_khong_co', 'http://127.0.0.1:1/cb', { challenge: pkce().challenge })).status, 400);
    g = await getCode(t, t.call);
    assert.equal((await exchange(t.base, g, { redirect_uri: 'http://127.0.0.1:53682/khac' })).json.error, 'invalid_grant');
    g = await getCode(t, t.call);
    const ok = await exchange(t.base, g); assert.equal(ok.status, 200);
    assert.equal((await mcp(t.base, ok.json.access_token)).status, 200);
    const again = await exchange(t.base, g); assert.equal(again.json.error, 'invalid_grant');
    assert.equal((await mcp(t.base, ok.json.access_token)).status, 401, 'access đã cấp từ code bị thu hồi');
    assert.equal((await token(t.base, { grant_type: 'refresh_token', refresh_token: ok.json.refresh_token, client_id: g.clientId })).status, 400, 'refresh đã cấp từ code bị thu hồi');
    g = await getCode(t, t.call);
    dbOf(t).run("UPDATE oauth_grants SET expires_at='2000-01-01T00:00:00.000Z' WHERE kind='code' AND used_at IS NULL");
    assert.equal((await exchange(t.base, g)).json.error, 'invalid_grant');
    assert.equal((await exchange(t.base, g, { code: 'gsc_khong-co-that' })).status, 400);
    assert.equal((await token(t.base, { grant_type: 'password' })).json.error, 'unsupported_grant_type');
    // client không gửi scope → yêu cầu đủ ba, ghi nhận scope lạ vào nhật ký
    const g3 = await getCode(t, t.call, { scope: null });
    assert.deepEqual(g3.approve.agent.scopes, ['read', 'compose', 'run']);
    const c4 = await register(t.base); const a4 = await authorize(t.base, c4, 'http://127.0.0.1:53682/callback', { challenge: pkce().challenge, scope: 'read offline_access bogus' });
    assert.equal(a4.status, 302);
    const aud = dbOf(t).get("SELECT after FROM audit_log WHERE action='auth.request' ORDER BY rowid DESC").after;
    assert.deepEqual(JSON.parse(aud).ignored_scopes, ['offline_access', 'bogus']);
  } finally { await t.clean(); }
});

test('oauth: đăng ký — redirect_uri https/loopback, DCR ép auth method none + "(tự khai)"; loopback đổi cổng được; giới hạn tần suất; pending hết hạn', async () => {
  const t = await boot();
  try {
    for (const bad of [['http://evil.example.com/cb'], ['ftp://x/cb'], ['https://a.example.com/cb#frag'], [], ['javascript:alert(1)'], ['myapp://cb']]) {
      const r = await request(t.base, 'POST', '/oauth/register', { body: { client_name: 'X', redirect_uris: bad } });
      assert.equal(r.status, 400, JSON.stringify(bad)); assert.equal(r.json.error, 'invalid_redirect_uri');
    }
    const r = await request(t.base, 'POST', '/oauth/register', { body: { client_name: 'Claude (tự khai)', redirect_uris: ['http://127.0.0.1:1111/callback', 'https://claude.ai/api/mcp/auth_callback'], token_endpoint_auth_method: 'client_secret_basic' } });
    assert.equal(r.status, 201); assert.equal(r.json.token_endpoint_auth_method, 'none'); assert.ok(r.json.client_id_issued_at > 1e9); assert.equal(r.json.client_name, 'Claude (tự khai)');
    const cid = r.json.client_id; const { challenge } = pkce();
    assert.equal((await authorize(t.base, cid, 'http://127.0.0.1:54321/callback', { challenge })).status, 302, 'loopback: cổng bất kỳ');
    assert.equal((await authorize(t.base, cid, 'http://127.0.0.1:54321/khac', { challenge })).status, 400);
    assert.equal((await authorize(t.base, cid, 'http://localhost:1111/callback', { challenge })).status, 400);
    assert.equal((await authorize(t.base, cid, 'https://claude.ai/api/mcp/auth_callback', { challenge })).status, 302);
    assert.equal((await authorize(t.base, cid, 'https://claude.ai/api/mcp/auth_callback/', { challenge })).status, 400);
    dbOf(t).run("UPDATE oauth_clients SET expires_at='2000-01-01T00:00:00.000Z' WHERE client_id=?", cid);
    assert.equal((await authorize(t.base, cid, 'http://127.0.0.1:1111/callback', { challenge })).status, 400);
    let last;
    for (let i = 0; i < 25; i++) last = await request(t.base, 'POST', '/oauth/register', { body: { client_name: 'spam', redirect_uris: ['http://127.0.0.1:9/cb'] } });
    assert.equal(last.status, 429);
    // hạn theo KÊNH: kênh nội bộ có hạn riêng, không bị kênh loopback làm cạn
    assert.equal((await request(t.base, 'POST', '/oauth/register', { body: { client_name: 'ok', redirect_uris: ['http://127.0.0.1:9/cb'] }, headers: INTERNAL })).status, 201);
  } finally { await t.clean(); }
});

test('oauth: refresh — ân hạn 30 s (cặp con chưa dùng được thay), dùng lại sau khi con đã dùng hoặc quá ân hạn ⇒ thu hồi cả agent', async () => {
  const t = await boot();
  try {
    const db = dbOf(t);
    const g = await getCode(t, t.call);
    const tk = (await exchange(t.base, g)).json;
    const rf = o => token(t.base, Object.assign({ grant_type: 'refresh_token', client_id: g.clientId }, o));
    const r1 = await rf({ refresh_token: tk.refresh_token }); assert.equal(r1.status, 200);
    // thử lại ngay (mất phản hồi): trong 30 s và con chưa dùng → nhận cặp mới, agent còn sống; cặp con trước bị thay
    const r1b = await rf({ refresh_token: tk.refresh_token }); assert.equal(r1b.status, 200, r1b.text);
    assert.notEqual(r1b.json.refresh_token, r1.json.refresh_token);
    assert.equal((await rf({ refresh_token: r1.json.refresh_token })).status, 400, 'cặp con bị thay không dùng được nữa');
    assert.equal(db.get("SELECT status FROM agents WHERE kind='oauth'").status, 'active');
    // con thật sự được dùng → dùng lại refresh gốc là đánh cắp
    const r2 = await rf({ refresh_token: r1b.json.refresh_token }); assert.equal(r2.status, 200);
    const re = await rf({ refresh_token: tk.refresh_token });
    assert.equal(re.status, 400); assert.equal(re.json.error, 'invalid_grant');
    assert.equal(db.get("SELECT status FROM agents WHERE kind='oauth'").status, 'revoked');
    assert.equal((await mcp(t.base, r2.json.access_token)).status, 401);
    assert.equal((await rf({ refresh_token: r2.json.refresh_token })).status, 400);
    assert.equal(db.get("SELECT COUNT(*) AS n FROM agent_tokens WHERE revoked_at IS NULL").n, 0);
    assert.ok(db.get("SELECT 1 AS x FROM audit_log WHERE action='auth.refresh' AND after LIKE '%refresh_reuse%'"));
    assert.deepEqual((await t.call('GET', '/api/overview')).json.pairing_lost, null, 'agent oauth bị thu hồi không phải "ghép lại" của runner');
    // quá ân hạn 30 s dù con chưa dùng → thu hồi
    const g2 = await getCode(t, t.call); const tk2 = (await exchange(t.base, g2)).json;
    const c2 = (await token(t.base, { grant_type: 'refresh_token', refresh_token: tk2.refresh_token, client_id: g2.clientId })).json;
    db.run("UPDATE oauth_grants SET used_at='2000-01-01T00:00:00.000Z' WHERE kind='refresh' AND used_at IS NOT NULL AND agent_id=(SELECT id FROM agents WHERE status='active' AND kind='oauth')");
    assert.equal((await token(t.base, { grant_type: 'refresh_token', refresh_token: tk2.refresh_token, client_id: g2.clientId })).status, 400);
    assert.equal((await mcp(t.base, c2.access_token)).status, 401);
  } finally { await t.clean(); }
});

test('oauth: phạm vi chỉ hạ — refresh/exchange/device nâng phạm vi ⇒ invalid_scope; refresh hạ thì token không gọi được tool run; token theo giao với agents.scopes', async () => {
  const t = await boot({ config: { deviceIntervalMs: 20 } });
  try {
    const db = dbOf(t);
    // (1) refresh nâng phạm vi
    const g = await getCode(t, t.call, { scope: 'read compose run', scopes: ['read', 'compose'] });
    const tk = (await exchange(t.base, g)).json;
    assert.equal((await token(t.base, { grant_type: 'refresh_token', refresh_token: tk.refresh_token, client_id: g.clientId, scope: 'read compose run' })).json.error, 'invalid_scope');
    // (2) exchange nâng phạm vi (code chưa bị đốt khi từ chối)
    const g2 = await getCode(t, t.call, { scope: 'read', scopes: ['read'] });
    const w = await exchange(t.base, g2, { scope: 'read compose' }); assert.equal(w.json.error, 'invalid_scope');
    assert.equal((await exchange(t.base, g2, { scope: 'read' })).status, 200, 'xin thu hẹp/bằng thì được');
    // (3) device nâng phạm vi
    await openWindow(t);
    const d = (await startDevice(t, { scope: 'read' }, INTERNAL)).json;
    await t.call('POST', `/api/auth-requests/${byCode(t, d.user_code).display_id}/approve`, {});
    await wait();
    assert.equal((await token(t.base, { grant_type: DEV, device_code: d.device_code, client_id: d.client_id, scope: 'read run' }, INTERNAL)).json.error, 'invalid_scope');
    // refresh hạ xuống read: access mới không thấy/không gọi được tool run, dù agent có compose
    const nar = await token(t.base, { grant_type: 'refresh_token', refresh_token: tk.refresh_token, client_id: g.clientId, scope: 'read' });
    assert.equal(nar.status, 200); assert.equal(nar.json.scope, 'read');
    const names = (await mcp(t.base, nar.json.access_token)).json.result.tools.map(x => x.name);
    assert.ok(names.includes('get_channel') && !names.includes('get_next_task') && !names.includes('submit_lesson'));
    const call = await mcp(t.base, nar.json.access_token, 'tools/call', { name: 'get_next_task', arguments: {} });
    assert.ok(call.json.error || (call.json.result && call.json.result.isError), 'tool run bị từ chối');
    // refresh tiếp theo không kèm scope vẫn ≤ phạm vi duyệt (read compose), không rộng hơn
    const again = (await token(t.base, { grant_type: 'refresh_token', refresh_token: nar.json.refresh_token, client_id: g.clientId })).json;
    assert.equal(again.scope, 'read compose');
    // phạm vi hiệu lực = giao với agents.scopes: thu hẹp agent có tác dụng ngay với token đang sống
    db.run("UPDATE agents SET scopes='[\"read\"]' WHERE id=(SELECT agent_id FROM oauth_clients WHERE client_id=?)", g.clientId);
    const names2 = (await mcp(t.base, again.access_token)).json.result.tools.map(x => x.name);
    assert.ok(!names2.includes('submit_lesson'));
  } finally { await t.clean(); }
});

test('oauth: duyệt lại cùng client ⇒ agent MỚI, agent cũ bị thu hồi, phạm vi agent cũ không bị nới', async () => {
  const t = await boot();
  try {
    const db = dbOf(t);
    const g1 = await getCode(t, t.call, { scope: 'read', scopes: ['read'] });
    const tk1 = (await exchange(t.base, g1)).json;
    const old = db.get("SELECT * FROM agents WHERE kind='oauth'");
    // cùng client xin lại với phạm vi rộng hơn
    const g2 = await getCode(t, t.call, { clientId: g1.clientId, scope: 'read compose run' });
    assert.notEqual(g2.approve.agent.display_id, old.display_id);
    const oldNow = db.get('SELECT * FROM agents WHERE id=?', old.id);
    assert.equal(oldNow.status, 'revoked'); assert.equal(oldNow.scopes, '["read"]', 'agent cũ không bị sửa phạm vi');
    assert.equal((await mcp(t.base, tk1.access_token)).status, 401);
    assert.equal((await token(t.base, { grant_type: 'refresh_token', refresh_token: tk1.refresh_token, client_id: g1.clientId })).status, 400);
    const tk2 = (await exchange(t.base, g2)).json; assert.equal(tk2.scope, 'read compose run');
    assert.equal((await mcp(t.base, tk2.access_token)).status, 200);
    assert.equal(db.get("SELECT COUNT(*) AS n FROM agents WHERE kind='oauth' AND status='active'").n, 1);
    assert.ok(db.get("SELECT 1 AS x FROM audit_log WHERE action='auth.approve' AND after LIKE ?", '%"replaced_agent":"' + old.display_id + '"%'));
  } finally { await t.clean(); }
});

test('oauth: audience là server_id — token mang audience khác bị chặn; resource lạ bị từ chối; token hết hạn bị chặn', async () => {
  const t = await boot();
  try {
    const cid = await register(t.base); const { challenge } = pkce();
    const a = await authorize(t.base, cid, 'http://127.0.0.1:53682/callback', { challenge, resource: 'https://other.example.com/mcp' });
    assert.equal(a.status, 302); assert.match(a.location, /error=invalid_target/);
    const g = await getCode(t, t.call, { resource: t.base + '/mcp' });
    const bad = await exchange(t.base, g, { resource: 'https://other.example.com/mcp' });
    assert.equal(bad.status, 400); assert.equal(bad.json.error, 'invalid_target');
    const g2 = await getCode(t, t.call, { resource: t.base + '/mcp' });
    assert.equal((await exchange(t.base, g2, { resource: 'http://localhost:' + new URL(t.base).port + '/mcp' })).json.error, 'invalid_target', 'resource khác resource đã xin lúc authorize');
    const g3 = await getCode(t, t.call);
    const ok = (await exchange(t.base, g3)).json;
    assert.equal((await mcp(t.base, ok.access_token)).status, 200);
    dbOf(t).run("UPDATE agent_tokens SET audience='srv_xxxx' WHERE kind='access'");
    assert.equal((await mcp(t.base, ok.access_token)).status, 401);
    dbOf(t).run("UPDATE agent_tokens SET audience=(SELECT json_extract(value,'$') FROM settings WHERE key='server_id'), expires_at='2000-01-01T00:00:00.000Z' WHERE kind='access'");
    assert.equal((await mcp(t.base, ok.access_token)).status, 401);
  } finally { await t.clean(); }
});

test('oauth: chỉ phiên UI của chủ xưởng duyệt được (Bearer → 403, CLI/agent/http → forbidden); chỉ hạ phạm vi; redirect ngoài loopback cần xác nhận; từ chối → access_denied', async () => {
  const t = await boot();
  try {
    const man = (await t.call('POST', '/api/agents', { name: 'Thủ công', scopes: ['read', 'compose', 'run'] })).json;
    const cid = await register(t.base);
    const a = await authorize(t.base, cid, 'http://127.0.0.1:53682/callback', { challenge: pkce().challenge, scope: 'read compose' });
    const id = reqIdOf(a.location); assert.match(id, /^AR-\d{4}$/);
    for (const act of ['approve', 'deny']) {
      assert.equal((await request(t.base, 'POST', `/api/auth-requests/${id}/${act}`, { token: man.token, body: {}, origin: t.base })).status, 403, act);
      assert.equal((await request(t.base, 'POST', `/api/auth-requests/${id}/${act}`, { body: {}, origin: t.base })).status, 401, act);
    }
    assert.equal((await request(t.base, 'POST', '/api/pairing/open', { token: man.token, body: {}, origin: t.base })).status, 403);
    assert.equal((await request(t.base, 'POST', `/api/auth-requests/${id}/approve`, { cookie: t.s.cookie, csrf: t.s.csrf, body: {} })).status, 403, 'thiếu Origin');
    assert.equal((await request(t.base, 'POST', `/api/auth-requests/${id}/approve`, { cookie: t.s.cookie, body: {}, origin: t.base })).status, 403, 'thiếu CSRF');
    const up = await t.call('POST', `/api/auth-requests/${id}/approve`, { scopes: ['read', 'compose', 'run'] });
    assert.equal(up.status, 400); assert.match(up.json.error.text_human, /hạ phạm vi/);
    assert.equal((await t.call('POST', `/api/auth-requests/${id}/approve`, { scopes: [] })).status, 400);
    assert.equal(dbOf(t).get('SELECT status FROM auth_requests').status, 'pending');
    const w = t.app.ctx.write;
    for (const act of [{ type: 'agent', id: 'x', scopes: ['read', 'compose', 'run'], entry: 'mcp' }, { type: 'user', id: 'x', role: 'owner', entry: 'http' }, { type: 'cli', entry: 'cli' }, { type: 'system', entry: 'system' }, { type: 'client', id: 'x', entry: 'oauth' }]) {
      assert.throws(() => w(act, 'auth.approve', { id }), /quyền/, JSON.stringify(act));
      assert.throws(() => w(act, 'auth.pairing_open', {}), /quyền/, 'mở cửa sổ ghép: ' + JSON.stringify(act));
    }
    // CLI cấp được token tay nhưng không duyệt được
    assert.ok(w({ type: 'cli', entry: 'cli' }, 'agent.create', { name: 'CLI token', scopes: ['read'] }).token.startsWith('gst_'));
    const ok = await t.call('POST', `/api/auth-requests/${id}/approve`, { scopes: ['read'] });
    assert.equal(ok.status, 200); assert.deepEqual(ok.json.agent.scopes, ['read']);
    assert.equal((await t.call('POST', `/api/auth-requests/${id}/approve`, {})).status, 409, 'đã quyết thì không duyệt lại');
    // redirect không phải loopback (kể cả claude.ai): phải xác nhận "vừa tự bấm"
    const cl = await register(t.base, ['https://claude.ai/api/mcp/auth_callback'], 'Claude');
    const ca = await authorize(t.base, cl, 'https://claude.ai/api/mcp/auth_callback', { challenge: pkce().challenge });
    const cid2 = reqIdOf(ca.location);
    const view = (await t.call('GET', `/api/auth-requests/${cid2}`)).json.request;
    assert.equal(view.needs_confirm, true); assert.equal(view.loopback, false); assert.ok(view.registered_at); assert.equal(view.redirect_host, 'claude.ai');
    const nc = await t.call('POST', `/api/auth-requests/${cid2}/approve`, {}); assert.equal(nc.status, 400); assert.match(nc.json.error.text_human, /tự bấm/);
    assert.equal((await t.call('POST', `/api/auth-requests/${cid2}/approve`, { confirm: true })).status, 200);
    // từ chối → redirect error=access_denied + state, client không dùng lại được
    const cid3 = await register(t.base);
    const a2 = await authorize(t.base, cid3, 'http://127.0.0.1:53682/callback', { challenge: pkce().challenge, state: 'abc' });
    const dn = await t.call('POST', `/api/auth-requests/${reqIdOf(a2.location)}/deny`, {});
    const u = new URL(dn.json.redirect); assert.equal(u.searchParams.get('error'), 'access_denied'); assert.equal(u.searchParams.get('state'), 'abc');
    assert.equal((await authorize(t.base, cid3, 'http://127.0.0.1:53682/callback', { challenge: pkce().challenge })).status, 302, 'bị từ chối một lần không khoá vĩnh viễn client');
    // authorize hết hạn sau 10 phút
    const cid4 = await register(t.base); const a4 = await authorize(t.base, cid4, 'http://127.0.0.1:53682/callback', { challenge: pkce().challenge });
    dbOf(t).run("UPDATE auth_requests SET expires_at='2000-01-01T00:00:00.000Z' WHERE display_id=?", reqIdOf(a4.location));
    assert.equal((await t.call('POST', `/api/auth-requests/${reqIdOf(a4.location)}/approve`, {})).status, 409);
  } finally { await t.clean(); }
});

test('ghép thiết bị — rào ý định owner: ngoài cửa sổ → pairing_closed (không tạo hàng); qua host công khai → 403; chỉ owner-UI mở cửa sổ', async () => {
  const t = await boot();
  try {
    const db = dbOf(t);
    const st = await request(t.base, 'GET', '/oauth/pairing-status');
    assert.deepEqual(st.json, { owner_exists: true, window_open: false });
    const closed = await startDevice(t, {}, INTERNAL);
    assert.equal(closed.status, 400); assert.equal(closed.json.error, 'pairing_closed');
    assert.equal(db.get('SELECT COUNT(*) AS n FROM auth_requests').n, 0); assert.equal(db.get('SELECT COUNT(*) AS n FROM oauth_clients').n, 0);
    await openWindow(t, 'loopback');
    assert.equal((await request(t.base, 'GET', '/oauth/pairing-status')).json.window_open, true, 'cửa sổ loopback: chỉ kênh loopback thấy mở');
    assert.equal((await request(t.base, 'GET', '/oauth/pairing-status', { headers: INTERNAL })).json.window_open, false, 'runner nội bộ không thấy cửa sổ của kênh khác');
    assert.equal((await request(t.base, 'GET', '/oauth/pairing-status', { headers: PUBLIC })).json.window_open, false, 'kênh công khai không bao giờ thấy mở');
    assert.equal((await startDevice(t, {}, INTERNAL)).json.error, 'pairing_closed', 'cửa sổ mở cho kênh khác');
    await openWindow(t);
    assert.equal((await request(t.base, 'GET', '/oauth/pairing-status', { headers: INTERNAL })).json.window_open, true);
    const rs = (await t.call('GET', '/api/runner-status')).json; assert.equal(rs.pairing.open, true); assert.equal(rs.runner, null);
    // qua host công khai/tunnel (cửa sổ đang mở) vẫn không phục vụ; không tạo hàng
    for (const h of [PUBLIC, { 'X-Forwarded-Proto': 'https' }, { 'CF-Connecting-IP': '1.2.3.4' }]) {
      const r = await startDevice(t, {}, Object.assign({}, INTERNAL, h)); assert.equal(r.status, 403, JSON.stringify(h)); assert.equal(r.json.error, 'access_denied');
    }
    assert.equal(db.get('SELECT COUNT(*) AS n FROM auth_requests').n, 0);
    // cửa sổ hết hạn → đóng
    db.run("UPDATE settings SET value='{\"channel\":\"internal\",\"open_until\":\"2000-01-01T00:00:00.000Z\"}' WHERE key='pairing_window'");
    assert.equal((await startDevice(t, {}, INTERNAL)).json.error, 'pairing_closed');
    assert.equal((await request(t.base, 'GET', '/oauth/pairing-status', { headers: INTERNAL })).json.window_open, false);
    // chưa có owner: không bao giờ mở
    const bare = await bootTmp();
    try { assert.deepEqual((await request(bare.base, 'GET', '/oauth/pairing-status')).json, { owner_exists: false, window_open: false }); } finally { await bare.clean(); }
  } finally { await t.clean(); }
});

test('ghép thiết bị: runner (kênh nội bộ) → internal, duyệt thẳng; nguồn khác → oauth "(tự khai)", chủ xưởng phải TỰ GÕ mã; trạng thái pending/slow_down/denied/hết hạn/dùng lại', async () => {
  const t = await boot({ config: { deviceIntervalMs: 20 } });
  try {
    const db = dbOf(t);
    const poll = (d, h) => token(t.base, { grant_type: DEV, device_code: d.device_code, client_id: d.client_id }, h);
    await openWindow(t);
    // --- runner nội bộ ---
    const a = (await startDevice(t, { client_name: 'Tên tuỳ ý', scope: 'read compose run' }, INTERNAL)).json;
    assert.match(a.user_code, /^[A-Z]{4}-\d{4}$/); assert.match(a.device_code, /^gsd_/); assert.match(a.client_id, /^dev_/); assert.equal(a.expires_in, 900);
    assert.ok(!('verification_uri_complete' in a)); assert.ok(a.verification_uri.endsWith('/#/pair') && !a.verification_uri.includes('code'));
    assert.ok(!db.get('SELECT * FROM auth_requests').device_code_hash.includes('gsd_'), 'chỉ lưu băm device_code');
    assert.equal(db.get('SELECT client_id FROM oauth_clients WHERE client_id=?', a.client_id).client_id, a.client_id, 'device có hàng oauth_clients dev_<ulid>');
    assert.equal((await poll(a, INTERNAL)).json.error, 'authorization_pending');
    await wait();
    const reqA = byCode(t, a.user_code);
    assert.equal(reqA.channel, 'internal'); assert.equal(reqA.client_name, 'Agent nội bộ', 'kênh nội bộ: tên do server đặt, không theo tên tự khai');
    const view = (await t.call('GET', '/api/auth-requests')).json.requests[0]; assert.equal(view.needs_code, false); assert.equal(view.agent_kind, 'internal'); assert.ok(!JSON.stringify(view).includes(a.user_code));
    const ap = await t.call('POST', `/api/auth-requests/${reqA.display_id}/approve`, {});
    assert.equal(ap.status, 200, ap.text); assert.equal(ap.json.agent.kind, 'internal'); assert.equal(ap.json.redirect, null);
    await wait();
    const ok = await poll(a, INTERNAL); assert.equal(ok.status, 200, ok.text);
    assert.match(ok.json.access_token, /^gsa_/); assert.match(ok.json.refresh_token, /^gsr_/);
    assert.equal((await mcp(t.base, ok.json.access_token)).status, 200);
    await wait();
    assert.equal((await poll(a, INTERNAL)).json.error, 'invalid_grant', 'device_code chỉ đổi được một lần');
    assert.equal((await token(t.base, { grant_type: 'refresh_token', refresh_token: ok.json.refresh_token, client_id: a.client_id })).status, 200);
    // --- ghép CLI từ nguồn khác (loopback): kind oauth, tên tự khai, owner tự gõ mã ---
    await openWindow(t, 'loopback');
    const b = (await startDevice(t, { client_name: 'Agent nội bộ' })).json;
    const reqB = byCode(t, b.user_code);
    assert.equal(reqB.client_name, 'Agent nội bộ (tự khai)'); assert.equal(reqB.channel, 'loopback');
    const list = (await t.call('GET', '/api/auth-requests')).json.requests.find(r => r.id === reqB.display_id);
    assert.equal(list.needs_code, true); assert.ok(!JSON.stringify(list).includes(b.user_code), 'không hiện mã của thiết bị ngoài cho owner chọn');
    assert.ok(!JSON.stringify((await t.call('GET', '/api/grid/auth_requests')).json).includes(b.user_code), 'lưới Chờ duyệt không lộ mã ghép ngoài');
    assert.ok(!JSON.stringify((await t.call('GET', `/api/auth-requests/${reqB.display_id}`)).json).includes(b.user_code));
    assert.equal((await t.call('POST', `/api/auth-requests/${reqB.display_id}/approve`, {})).status, 400, 'không có mã → không duyệt');
    assert.equal((await t.call('POST', `/api/auth-requests/${reqB.display_id}/approve`, { user_code: 'ZZZZ-0000' })).status, 400, 'sai mã');
    assert.equal((await t.call('POST', '/api/auth-requests/lookup', { user_code: 'ZZZZ-0000' })).status, 404);
    const lk = await t.call('POST', '/api/auth-requests/lookup', { user_code: b.user_code.toLowerCase() });
    assert.equal(lk.status, 200); assert.equal(lk.json.request.id, reqB.display_id); assert.ok(!JSON.stringify(lk.json).includes(b.user_code));
    assert.equal((await request(t.base, 'POST', '/api/auth-requests/lookup', { token: 'gst_x', body: { user_code: b.user_code }, origin: t.base })).status, 403);
    const apB = await t.call('POST', `/api/auth-requests/${reqB.display_id}/approve`, { user_code: b.user_code });
    assert.equal(apB.status, 200); assert.equal(apB.json.agent.kind, 'oauth'); assert.match(apB.json.agent.name, /\(tự khai\)$/);
    // --- slow_down, từ chối, hết hạn ---
    await openWindow(t);
    const c = (await startDevice(t, {}, INTERNAL)).json;
    assert.equal((await poll(c, INTERNAL)).json.error, 'authorization_pending');
    assert.equal((await poll(c, INTERNAL)).json.error, 'slow_down', 'poll dồn');
    await wait(120);
    await t.call('POST', `/api/auth-requests/${byCode(t, c.user_code).display_id}/deny`, {});
    await wait(120);
    assert.equal((await poll(c, INTERNAL)).json.error, 'access_denied');
    assert.equal((await poll({ device_code: 'gsd_khong-co', client_id: c.client_id }, INTERNAL)).json.error, 'invalid_grant');
    const e = (await startDevice(t, {}, INTERNAL)).json;
    db.run("UPDATE auth_requests SET expires_at='2000-01-01T00:00:00.000Z' WHERE user_code_hash=?", byCode(t, e.user_code).user_code_hash);
    await wait(120);
    assert.equal((await poll(e, INTERNAL)).json.error, 'expired_token');
    assert.equal((await t.call('POST', `/api/auth-requests/${byCode(t, e.user_code).display_id}/approve`, {})).status, 409);
    // runner tự báo trạng thái: chỉ nhận từ kênh nội bộ
    await request(t.base, 'GET', '/oauth/pairing-status?runner=waiting&msg=cho%20duyet');
    assert.equal((await t.call('GET', '/api/runner-status')).json.runner, null, 'kênh khác không giả được trạng thái runner');
    await request(t.base, 'GET', '/oauth/pairing-status?runner=waiting&msg=cho%20duyet', { headers: INTERNAL });
    const rs = (await t.call('GET', '/api/runner-status')).json.runner; assert.equal(rs.state, 'waiting'); assert.equal(rs.online, true); assert.equal(JSON.parse(db.get("SELECT value FROM settings WHERE key='runner_status'").value).state, 'waiting');
  } finally { await t.clean(); }
});

test('ghép thiết bị: trần pending theo kênh — đẩy bỏ hàng cũ nhất, kênh nội bộ có chỗ riêng; hạn tần suất theo kênh', async () => {
  const t = await boot({ config: { deviceIntervalMs: 20 } });
  try {
    const db = dbOf(t);
    await openWindow(t);
    const first = (await startDevice(t, {}, INTERNAL)).json;
    await openWindow(t, 'loopback');
    for (let i = 0; i < 6; i++) assert.equal((await startDevice(t, { client_name: 'CLI ' + i })).status, 200);
    // 12 yêu cầu OAuth từ loopback không chiếm hết chỗ: quá 10 thì hàng cũ nhất bị đẩy, yêu cầu mới vẫn vào
    const cid = await register(t.base);
    for (let i = 0; i < 12; i++) assert.equal((await authorize(t.base, cid, 'http://127.0.0.1:53682/callback', { challenge: pkce().challenge })).status, 302);
    const pend = db.all("SELECT * FROM auth_requests WHERE status='pending'");
    assert.equal(pend.filter(r => r.channel !== 'internal').length, 10);
    assert.equal(pend.filter(r => r.channel === 'internal').length, 1, 'yêu cầu nội bộ còn nguyên');
    assert.equal((await token(t.base, { grant_type: DEV, device_code: first.device_code, client_id: first.client_id }, INTERNAL)).json.error, 'authorization_pending');
    // nguồn "kênh" hiển thị, không phải IP
    const rows = (await t.call('GET', '/api/grid/auth_requests')).json.rows;
    assert.ok(rows.every(r => /^(trong máy|qua Internet)/.test(r.channel)) && !rows.some(r => /127\.0\.0\.1/.test(r.channel)));
    let last; for (let i = 0; i < 14; i++) last = await startDevice(t, {});
    assert.equal(last.status, 429);
    await openWindow(t);
    assert.equal((await startDevice(t, {}, INTERNAL)).status, 200, 'kênh nội bộ không bị kênh loopback làm cạn hạn');
  } finally { await t.clean(); }
});

test('oauth: thu hồi agent nội bộ đóng cửa sổ ghép (không tự xin lại); thu hồi tự động hiện pairing_lost; dọn token/grant hết hạn quá 7 ngày', async () => {
  const t = await boot({ config: { deviceIntervalMs: 20 } });
  try {
    const db = dbOf(t);
    await openWindow(t);
    const d = (await startDevice(t, {}, INTERNAL)).json;
    const ap = await t.call('POST', `/api/auth-requests/${byCode(t, d.user_code).display_id}/approve`, {});
    await wait();
    const tk = (await token(t.base, { grant_type: DEV, device_code: d.device_code, client_id: d.client_id }, INTERNAL)).json;
    // refresh bị dùng lại (ngoài ân hạn) → thu hồi tự động → Tổng quan báo "ghép lại"
    const c1 = (await token(t.base, { grant_type: 'refresh_token', refresh_token: tk.refresh_token, client_id: d.client_id })).json;
    db.run("UPDATE oauth_grants SET used_at='2000-01-01T00:00:00.000Z' WHERE used_at IS NOT NULL");
    assert.equal((await token(t.base, { grant_type: 'refresh_token', refresh_token: tk.refresh_token, client_id: d.client_id })).status, 400);
    assert.deepEqual((await t.call('GET', '/api/overview')).json.pairing_lost, { agent: ap.json.agent.display_id });
    assert.equal((await mcp(t.base, c1.access_token)).status, 401);
    // owner mở lại ghép → agent mới; rồi "Tắt agent nội bộ" (thu hồi) thì cửa sổ đóng
    await openWindow(t);
    const d2 = (await startDevice(t, {}, INTERNAL)).json;
    const ap2 = await t.call('POST', `/api/auth-requests/${byCode(t, d2.user_code).display_id}/approve`, {});
    assert.equal((await t.call('GET', '/api/overview')).json.pairing_lost, null);
    assert.equal((await t.call('GET', '/api/runner-status')).json.pairing.open, true);
    assert.equal((await t.call('POST', `/api/agents/${ap2.json.agent.display_id}/revoke`, {})).status, 200);
    assert.equal((await t.call('GET', '/api/runner-status')).json.pairing.open, false, 'thu hồi agent nội bộ = tắt: runner không tự xin lại');
    assert.equal((await request(t.base, 'GET', '/oauth/pairing-status')).json.window_open, false);
    // dọn
    db.run("UPDATE agent_tokens SET expires_at='2000-01-01T00:00:00.000Z' WHERE kind='access'");
    db.run("UPDATE oauth_grants SET expires_at='2000-01-01T00:00:00.000Z'");
    await register(t.base);   // sweep chạy trong op
    assert.equal(db.get("SELECT COUNT(*) AS n FROM agent_tokens WHERE kind='access'").n, 0);
    assert.ok(db.get('SELECT COUNT(*) AS n FROM oauth_grants').n < 4, 'grant hết hạn quá 7 ngày bị dọn (lá chuỗi xoay vòng)');
  } finally { await t.clean(); }
});

test('oauth: events.mask che gsa_/gsr_/gsd_/gsc_/gst_', () => {
  const rnd = p => p + crypto.randomBytes(24).toString('base64url');
  for (const p of ['gst_', 'gsa_', 'gsr_', 'gsd_', 'gsc_']) { const tok = rnd(p); const m = events.mask('x ' + tok + ' y'); assert.ok(!m.includes(tok.slice(5)), p); assert.match(m, /gs_\*\*\*/); }
});

test('migration 0002: tiền kiểm oauth_grants rỗng; nâng DB tạo từ 0001 (tắt FK ngoài transaction + foreign_key_check, dựng lại audit_log giữ trigger chỉ-thêm)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-mig-'));
  const key = crypto.randomBytes(32).toString('hex');
  try {
    const raw = new DatabaseSync(path.join(dir, 'studio.db'));
    raw.exec('PRAGMA foreign_keys=ON');
    raw.exec(fs.readFileSync(path.join(__dirname, '..', 'migrations', '0001_init.sql'), 'utf8'));
    raw.exec('CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)');
    raw.exec("INSERT INTO schema_migrations VALUES(1,'2026-01-01T00:00:00.000Z')");
    raw.exec("INSERT INTO workspaces(id,name,locale,timezone,created_at,updated_at) VALUES('w','W','vi','UTC','2026-01-01','2026-01-01')");
    raw.exec("INSERT INTO agents(id,workspace_id,display_id,name,kind,scopes,status,created_at,updated_at) VALUES('a','w','AG-0001','C','oauth','[\"read\"]','active','2026-01-01','2026-01-01')");
    raw.exec("INSERT INTO oauth_clients(client_id,workspace_id,agent_id,redirect_uris,name,created_at) VALUES('demo','w','a','[]','C','2026-01-01')");
    raw.exec("INSERT INTO oauth_grants(id,code_hash,client_id,expires_at,created_at) VALUES('g','h','demo','2026-01-01','2026-01-01')");
    raw.exec("INSERT INTO audit_log(id,workspace_id,display_id,ts,actor,entry,action) VALUES('au','w','AU-0001','2026-01-01','system','system','x')");
    raw.close();
    assert.throws(() => dbm.open(dir, { masterKey: key }), /oauth_grants đang có 1 hàng/, 'có grant → dừng migrate, báo lỗi người đọc được');
    const raw2 = new DatabaseSync(path.join(dir, 'studio.db')); raw2.exec("DELETE FROM oauth_grants"); raw2.close();
    const db = dbm.open(dir, { masterKey: key });
    const cl = db.get("SELECT * FROM oauth_clients WHERE client_id='demo'");
    assert.equal(cl.kind, 'dcr'); assert.equal(cl.created_channel, 'loopback');
    db.run("INSERT INTO oauth_clients(client_id,workspace_id,redirect_uris,name,created_at) VALUES('p','w','[]','P','2026-01-01')");   // agent_id NULL được
    assert.equal(db.get('PRAGMA foreign_keys').foreign_keys, 1, 'FK bật lại sau migration');
    assert.equal(db.all('PRAGMA foreign_key_check').length, 0);
    for (const [tb, cols] of [['auth_requests', ['display_id', 'workspace_id', 'channel', 'user_code_hash', 'last_poll_at', 'replaces_agent_id']], ['oauth_grants', ['workspace_id', 'token_hash', 'child_id', 'revoked_at', 'parent_id']], ['agent_tokens', ['kind', 'expires_at', 'audience', 'scopes']]]) {
      const have = db.all(`PRAGMA table_info(${tb})`).map(c => c.name);
      for (const c of cols) assert.ok(have.includes(c), tb + '.' + c);
    }
    // audit_log: giữ hàng cũ, nhận entry 'oauth', vẫn chỉ-thêm
    assert.equal(db.get("SELECT COUNT(*) AS n FROM audit_log WHERE id='au'").n, 1);
    db.run("INSERT INTO audit_log(id,workspace_id,display_id,ts,actor,entry,action) VALUES('au2','w','AU-0002','2026-01-01','client:x','oauth','x')");
    assert.throws(() => db.run("UPDATE audit_log SET action='y'"), /chỉ thêm/); assert.throws(() => db.run('DELETE FROM audit_log'), /chỉ thêm/);
    assert.equal(db.get('SELECT COUNT(*) AS n FROM schema_migrations').n, 2);
    assert.equal(dbm.migrate(db).length, 0, 'chạy lại không làm gì');
    db.close();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('CLI: `genstudio token create` cấp token tay (actor cli, nhật ký), token dùng được ở /mcp; CLI không duyệt được quyền', async () => {
  const { spawnSync } = require('node:child_process');
  const t = await bootTmp();
  try {
    const r = spawnSync(process.execPath, [path.join(__dirname, '..', 'server', 'main.js'), '--create-token', 'Máy bạn', '--scopes', 'read,compose'],
      { env: Object.assign({}, process.env, { DATA_DIR: t.dir, GS_MASTER_KEY: t.app.ctx.config.masterKey }), encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    const tok = /(gst_[A-Za-z0-9_-]+)/.exec(r.stdout)[1];
    const l = await mcp(t.base, tok); assert.equal(l.status, 200);
    const names = l.json.result.tools.map(x => x.name);
    assert.ok(names.includes('submit_lesson') && !names.includes('get_next_task'), 'phạm vi theo --scopes');
    const au = t.app.ctx.db.get("SELECT actor, entry FROM audit_log WHERE action='agent.create'");
    assert.equal(au.actor, 'cli'); assert.equal(au.entry, 'cli');
    assert.throws(() => t.app.ctx.write({ type: 'cli', entry: 'cli' }, 'auth.pairing_open', {}), /quyền/);
  } finally { await t.clean(); }
});
