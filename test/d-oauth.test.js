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
const SECRET = 'gsp_' + crypto.randomBytes(32).toString('base64url');   // bí mật ghép của bản cài (chỉ studio + runner biết)
const SPOOF = { Host: 'studio:7490' };                                     // chỉ giả Host: KHÔNG phải kênh nội bộ
const INTERNAL = { Host: 'studio:7490', 'X-GS-Pairing': SECRET };          // kênh nội bộ: Host của runner trong mạng Docker + bí mật ghép
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
  const t = await bootTmp(Object.assign({}, extra, { config: Object.assign({ pairingSecret: SECRET }, extra && extra.config) }));
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
    assert.equal((await request(t.base, 'GET', '/.well-known/oauth-protected-resource', { headers: SPOOF })).json.resource, 'http://studio:7490/mcp');
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
    assert.equal(db.get("SELECT status FROM agents WHERE kind='oauth'").status, 'active');
    assert.equal(db.get("SELECT COUNT(*) AS n FROM oauth_grants WHERE revoke_reason='grace'").n, 1, 'cặp con bị ân hạn thay được đánh dấu riêng');
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
    // (a) ân hạn tối đa MỘT lần cho mỗi cha: lần dùng lại thứ hai của cùng refresh cha ⇒ thu hồi agent
    const ga = await getCode(t, t.call); const tka = (await exchange(t.base, ga)).json;
    const rfa = o => token(t.base, Object.assign({ grant_type: 'refresh_token', client_id: ga.clientId }, o));
    assert.equal((await rfa({ refresh_token: tka.refresh_token })).status, 200);
    const graceA = await rfa({ refresh_token: tka.refresh_token }); assert.equal(graceA.status, 200, 'lần đầu dùng lại trong ân hạn được thay');
    const secondA = await rfa({ refresh_token: tka.refresh_token });
    assert.equal(secondA.status, 400); assert.equal(secondA.json.error, 'invalid_grant');
    assert.equal(db.get("SELECT status FROM agents WHERE id=(SELECT agent_id FROM oauth_clients WHERE client_id=?)", ga.clientId).status, 'revoked', 'ân hạn lần hai ⇒ thu hồi');
    assert.equal((await mcp(t.base, graceA.json.access_token)).status, 401);
    assert.ok(db.get("SELECT 1 AS x FROM audit_log WHERE action='auth.refresh' AND after LIKE '%refresh_reuse%' ORDER BY rowid DESC"));
    // (b) trình ra cặp con đã bị ân hạn thay (revoke_reason=grace) ⇒ có bản sao thứ hai của token ⇒ thu hồi agent
    const gb = await getCode(t, t.call); const tkb = (await exchange(t.base, gb)).json;
    const rfb = o => token(t.base, Object.assign({ grant_type: 'refresh_token', client_id: gb.clientId }, o));
    const childB = (await rfb({ refresh_token: tkb.refresh_token })).json;           // con ban đầu (bị coi là "mất phản hồi")
    assert.equal((await rfb({ refresh_token: tkb.refresh_token })).status, 200);     // ân hạn: con ban đầu bị thay
    const replay = await rfb({ refresh_token: childB.refresh_token });
    assert.equal(replay.status, 400); assert.equal(replay.json.error, 'invalid_grant');
    assert.equal(db.get("SELECT status FROM agents WHERE id=(SELECT agent_id FROM oauth_clients WHERE client_id=?)", gb.clientId).status, 'revoked');
    assert.ok(db.get("SELECT 1 AS x FROM audit_log WHERE action='auth.refresh' AND after LIKE '%refresh_reuse%' ORDER BY rowid DESC"));
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
    await request(t.base, 'GET', '/oauth/pairing-status?runner=requested&code=cho_duyet');
    assert.equal((await t.call('GET', '/api/runner-status')).json.runner, null, 'kênh khác không giả được trạng thái runner');
    await request(t.base, 'GET', '/oauth/pairing-status?runner=requested&code=cho_duyet', { headers: INTERNAL });
    const rs = (await t.call('GET', '/api/runner-status')).json.runner; assert.equal(rs.state, 'requested'); assert.equal(rs.code, 'cho_duyet'); assert.equal(rs.online, true); assert.equal(JSON.parse(db.get("SELECT value FROM settings WHERE key='runner_status'").value).state, 'requested');
  } finally { await t.clean(); }
});

test('trần pending: theo kênh/nguồn/client, quá trần thì TỪ CHỐI (không đẩy bỏ yêu cầu cũ); kênh nội bộ có chỗ riêng; "Nguồn" hiện kênh', async () => {
  const t = await boot({ config: { deviceIntervalMs: 20 } });
  try {
    const db = dbOf(t);
    await openWindow(t);
    const first = (await startDevice(t, {}, INTERNAL)).json;
    await openWindow(t, 'loopback');
    for (let i = 0; i < 6; i++) assert.equal((await startDevice(t, { client_name: 'CLI ' + i })).status, 200);
    // một client chỉ có tối đa 2 yêu cầu chờ; yêu cầu thứ 3 bị từ chối bằng redirect lỗi, hai yêu cầu cũ còn nguyên
    const cid = await register(t.base);
    const ok = [];
    for (let i = 0; i < 2; i++) { const a = await authorize(t.base, cid, 'http://127.0.0.1:53682/callback', { challenge: pkce().challenge }); assert.equal(a.status, 302); ok.push(reqIdOf(a.location)); }
    const third = await authorize(t.base, cid, 'http://127.0.0.1:53682/callback', { challenge: pkce().challenge });
    assert.match(third.location, /^http:\/\/127\.0\.0\.1:53682\/callback\?error=temporarily_unavailable/);
    assert.equal(db.all("SELECT * FROM auth_requests WHERE status='pending' AND client_id=?", cid).length, 2);
    assert.ok(ok.every(id => db.get('SELECT status FROM auth_requests WHERE display_id=?', id).status === 'pending'), 'không đẩy bỏ yêu cầu cũ');
    // trần kênh loopback (10): nhiều client cũng không vượt; yêu cầu nội bộ vẫn còn
    for (let i = 0; i < 8; i++) { const c = await register(t.base); await authorize(t.base, c, 'http://127.0.0.1:53682/callback', { challenge: pkce().challenge }); }
    const pend = db.all("SELECT * FROM auth_requests WHERE status='pending'");
    assert.ok(pend.filter(r => r.channel === 'loopback').length <= 10, 'không vượt trần kênh loopback');
    assert.equal(pend.filter(r => r.channel === 'internal').length, 1, 'yêu cầu nội bộ còn nguyên');
    assert.equal((await token(t.base, { grant_type: DEV, device_code: first.device_code, client_id: first.client_id }, INTERNAL)).json.error, 'authorization_pending');
    const rows = (await t.call('GET', '/api/grid/auth_requests')).json.rows;
    assert.ok(rows.every(r => /^(trong máy|qua Internet)/.test(r.channel)) && !rows.some(r => /127\.0\.0\.1/.test(r.channel)));
    let last; for (let i = 0; i < 14; i++) last = await startDevice(t, {});
    assert.ok([429].includes(last.status)); assert.ok(['temporarily_unavailable', 'too_many_pending'].includes(last.json.error));
    await openWindow(t);
    assert.equal((await startDevice(t, {}, INTERNAL)).status, 200, 'kênh nội bộ không bị kênh loopback làm cạn hạn');
  } finally { await t.clean(); }
});

test('PoC P1: hạn tần suất theo nguồn — một kẻ tấn công (IP công khai) không khoá client khác; /oauth/token chỉ chặn theo nguồn lỗi', async () => {
  const t = await boot({ config: { trustProxy: true } });
  try {
    const pubIp = ip => ({ 'X-Forwarded-For': 'ke-gia-mao, ' + ip });   // GS_TRUST_PROXY=1: bước nhảy PHẢI NHẤT là do proxy của mình thêm vào
    const reg = (ip) => request(t.base, 'POST', '/oauth/register', { body: { client_name: 'X', redirect_uris: ['https://claude.ai/api/mcp/auth_callback'] }, headers: pubIp(ip) });
    for (let i = 0; i < 5; i++) assert.equal((await reg('198.51.100.1')).status, 201);
    assert.equal((await reg('198.51.100.1')).status, 429, 'nguồn tấn công bị giới hạn nhỏ');
    assert.equal((await reg('160.79.104.10')).status, 201, 'nguồn khác (claude.ai) vẫn đăng ký được');
    // /oauth/token: kẻ dò mã bị 429 sau 20 lần LỖI, client hợp lệ ở nguồn khác không bị ảnh hưởng
    const g = await getCode(t, t.call); const tk = (await exchange(t.base, g)).json;
    let last; for (let i = 0; i < 25; i++) last = await token(t.base, { grant_type: 'refresh_token', refresh_token: 'gsr_sai', client_id: 'cl_khac' }, pubIp('198.51.100.7'));
    assert.equal(last.status, 429);
    assert.equal((await token(t.base, { grant_type: 'refresh_token', refresh_token: 'gsr_sai2', client_id: 'cl_khac2' }, pubIp('198.51.100.7'))).status, 429, 'cùng nguồn vẫn bị chặn');
    // thành công không tiêu hạn mức: 30 lần refresh hợp lệ liên tiếp từ một nguồn công khai đều 200
    let cur = tk.refresh_token;
    for (let i = 0; i < 30; i++) { const r = await token(t.base, { grant_type: 'refresh_token', refresh_token: cur, client_id: g.clientId }, pubIp('160.79.104.10')); assert.equal(r.status, 200, 'lần ' + i); cur = r.json.refresh_token; }
    // KHÔNG chặn theo client_id (do kẻ tấn công chọn): 40 lỗi từ 40 nguồn vào đúng client_id của nạn nhân, refresh hợp lệ của nạn nhân vẫn chạy
    for (let i = 0; i < 40; i++) await token(t.base, { grant_type: 'refresh_token', refresh_token: 'gsr_x' + i, client_id: g.clientId }, pubIp('203.0.113.' + i));
    const victim = await token(t.base, { grant_type: 'refresh_token', refresh_token: cur, client_id: g.clientId }, pubIp('160.79.104.10'));
    assert.equal(victim.status, 200, 'nạn nhân không bị chặn bởi lỗi của người khác dùng client_id của mình');
    // bộ đếm lỗi theo kênh chỉ để cảnh báo, không chặn: nguồn mới sạch vẫn dùng được
    assert.equal((await token(t.base, { grant_type: 'refresh_token', refresh_token: victim.json.refresh_token, client_id: g.clientId }, pubIp('203.0.113.250'))).status, 200);
  } finally { await t.clean(); }
});

test('PoC P2: flood authorize không đẩy bỏ yêu cầu của chủ xưởng và không làm ngập Chờ duyệt', async () => {
  const t = await boot({ config: { trustProxy: true } });
  try {
    const pubIp = ip => ({ 'X-Forwarded-For': ip });
    const claude = 'https://claude.ai/api/mcp/auth_callback';
    const legit = (await request(t.base, 'POST', '/oauth/register', { body: { client_name: 'Claude', redirect_uris: [claude] }, headers: pubIp('160.79.104.10') })).json.client_id;
    const a = await authorize(t.base, legit, claude, { challenge: pkce().challenge, headers: pubIp('160.79.104.10') });
    const id = reqIdOf(a.location);
    const evil = (await request(t.base, 'POST', '/oauth/register', { body: { client_name: 'E', redirect_uris: ['https://evil.example/cb'] }, headers: pubIp('198.51.100.1') })).json.client_id;
    const codes = [];
    for (let i = 0; i < 12; i++) codes.push((await authorize(t.base, evil, 'https://evil.example/cb', { challenge: pkce().challenge, headers: pubIp('198.51.100.1') })).location);
    assert.equal(codes.filter(l => /^\/#\/authorize/.test(l)).length, 2, 'tối đa 2 yêu cầu chờ cho mỗi client');
    assert.ok(codes.some(l => /error=temporarily_unavailable/.test(l)));
    const pend = (await t.call('GET', '/api/auth-requests')).json.requests;
    assert.ok(pend.length <= 3 && pend.some(r => r.id === id), 'yêu cầu của chủ xưởng còn nguyên, danh sách không bị ngập');
    const ap = await t.call('POST', `/api/auth-requests/${id}/approve`, { confirm: true });
    assert.equal(ap.status, 200, ap.text);
    // nhiều client từ cùng nguồn công khai: trần theo nguồn (3)
    for (let i = 0; i < 4; i++) { const c = (await request(t.base, 'POST', '/oauth/register', { body: { client_name: 'E' + i, redirect_uris: ['https://evil.example/cb'] }, headers: pubIp('198.51.100.2') })).json.client_id; if (c) await authorize(t.base, c, 'https://evil.example/cb', { challenge: pkce().challenge, headers: pubIp('198.51.100.9') }); }
    assert.ok(dbOf(t).get("SELECT COUNT(*) AS n FROM auth_requests WHERE status='pending' AND source_ip='198.51.100.9'").n <= 3);
  } finally { await t.clean(); }
});

test('PoC P3: device_code đã đổi token không dùng lại được kể cả khi grant bị dọn; approved quá hạn ⇒ expired_token', async () => {
  const t = await boot({ config: { deviceIntervalMs: 20 } });
  try {
    const db = dbOf(t);
    await openWindow(t, 'loopback');
    const d = (await startDevice(t, { client_name: 'cli' })).json;
    const rq = byCode(t, d.user_code);
    assert.equal((await t.call('POST', `/api/auth-requests/${rq.display_id}/approve`, { user_code: d.user_code })).status, 200);
    const poll = () => token(t.base, { grant_type: DEV, device_code: d.device_code, client_id: d.client_id });
    await wait(); assert.equal((await poll()).status, 200);
    assert.ok(db.get('SELECT consumed_at FROM auth_requests WHERE id=?', rq.id).consumed_at);
    db.raw.exec('PRAGMA foreign_keys=OFF'); db.run('DELETE FROM oauth_grants'); db.raw.exec('PRAGMA foreign_keys=ON');   // mô phỏng sweep đã dọn chuỗi refresh
    db.run("UPDATE auth_requests SET expires_at='2000-01-01T00:00:00.000Z' WHERE id=?", rq.id);
    await wait(); assert.notEqual((await poll()).status, 200);
    db.run("UPDATE auth_requests SET expires_at='2099-01-01T00:00:00.000Z' WHERE id=?", rq.id);
    await wait(); const again = await poll(); assert.equal(again.status, 400); assert.equal(again.json.error, 'invalid_grant', 'consumed_at chặn dùng lại dù không còn grant');
    // approved nhưng chưa đổi và đã quá hạn ⇒ expired_token
    await openWindow(t, 'loopback');
    const e = (await startDevice(t, {})).json;
    await t.call('POST', `/api/auth-requests/${byCode(t, e.user_code).display_id}/approve`, { user_code: e.user_code });
    db.run("UPDATE auth_requests SET expires_at='2000-01-01T00:00:00.000Z' WHERE user_code_hash=?", byCode(t, e.user_code).user_code_hash);
    await wait(); assert.equal((await token(t.base, { grant_type: DEV, device_code: e.device_code, client_id: e.client_id })).json.error, 'expired_token');
  } finally { await t.clean(); }
});

test('Content-Type chỉ json/form (không đoán theo /json/i); register/device từ chối Origin lạ; token chỉ nhận form', async () => {
  const t = await boot();
  try {
    const body = JSON.stringify({ client_name: 'X', redirect_uris: ['http://127.0.0.1:9/cb'] });
    for (const ct of ['text/plain; charset=json', 'text/json', 'application/jsonx', 'multipart/form-data']) {
      const r = await request(t.base, 'POST', '/oauth/register', { body, headers: { 'Content-Type': ct } });
      assert.equal(r.status, 400, ct); assert.equal(r.json.error, 'invalid_request');
    }
    assert.equal((await request(t.base, 'POST', '/oauth/register', { body, headers: { 'Content-Type': 'Application/JSON; charset=utf-8' } })).status, 201);
    const fm = await request(t.base, 'POST', '/oauth/register', { body: 'client_name=F&redirect_uris=http%3A%2F%2F127.0.0.1%3A9%2Fcb', headers: FORM });
    assert.equal(fm.json.error, 'invalid_redirect_uri', 'form được nhận và phân tích (redirect_uris dạng chuỗi đơn không phải mảng → bị từ chối đúng lý do)');
    // JSON ở /oauth/token bị từ chối (RFC 6749: form)
    assert.equal((await request(t.base, 'POST', '/oauth/token', { body: { grant_type: 'refresh_token', refresh_token: 'x' } })).status, 400);
    // Origin lạ (trình duyệt của trang khác) bị từ chối ở register/device; Origin của chính xưởng thì được
    const evil = { Origin: 'https://evil.example.com' };
    assert.equal((await request(t.base, 'POST', '/oauth/register', { body, headers: evil })).status, 403);
    assert.equal((await request(t.base, 'POST', '/oauth/device', { body: { client_name: 'x' }, headers: evil })).status, 403);
    assert.equal((await request(t.base, 'POST', '/oauth/register', { body, origin: t.base })).status, 201);
  } finally { await t.clean(); }
});

test('thu hồi: hết hiệu lực yêu cầu chờ của client, đóng mọi cửa sổ ghép, ân hạn thu hồi access token của cặp con bị thay', async () => {
  const t = await boot();
  try {
    const db = dbOf(t);
    // (1) thu hồi agent oauth: yêu cầu chờ khác của cùng client hết hiệu lực; cửa sổ ghép đóng
    const g = await getCode(t, t.call);
    const tk = (await exchange(t.base, g)).json;
    const a2 = await authorize(t.base, g.clientId, g.redirect, { challenge: pkce().challenge });
    const id2 = reqIdOf(a2.location);
    await openWindow(t, 'loopback');
    const ag = db.get("SELECT display_id FROM agents WHERE kind='oauth'");
    assert.equal((await t.call('POST', `/api/agents/${ag.display_id}/revoke`, {})).status, 200);
    assert.equal(db.get('SELECT status FROM auth_requests WHERE display_id=?', id2).status, 'expired');
    assert.equal((await t.call('POST', `/api/auth-requests/${id2}/approve`, {})).status, 409, 'không duyệt lại yêu cầu cũ của client đã thu hồi');
    assert.equal((await t.call('GET', '/api/runner-status')).json.pairing.open, false, 'thu hồi bất kỳ agent nào đóng cửa sổ ghép');
    void tk;
    // (2) ân hạn: access token đi kèm cặp con bị thay cũng bị thu hồi
    const g2 = await getCode(t, t.call); const t2 = (await exchange(t.base, g2)).json;
    const rf = o => token(t.base, Object.assign({ grant_type: 'refresh_token', client_id: g2.clientId }, o));
    const c1 = (await rf({ refresh_token: t2.refresh_token })).json;
    assert.equal((await mcp(t.base, c1.access_token)).status, 200);
    const c2 = await rf({ refresh_token: t2.refresh_token });   // ân hạn: c1 bị thay
    assert.equal(c2.status, 200);
    assert.equal((await mcp(t.base, c1.access_token)).status, 401, 'access token của cặp bị thay đã bị thu hồi');
    assert.equal((await mcp(t.base, c2.json.access_token)).status, 200);
  } finally { await t.clean(); }
});

test('GS_TRUST_PROXY: không tin cậy ⇒ nguồn là socket (header giả không tạo bucket mới); tin cậy ⇒ cf-connecting-ip, nếu không thì bước nhảy phải nhất của X-Forwarded-For', async () => {
  const reg = (t, h) => request(t.base, 'POST', '/oauth/register', { body: { client_name: 'X', redirect_uris: ['https://claude.ai/api/mcp/auth_callback'] }, headers: h });
  const t = await boot();   // mặc định: không tin cậy
  try {
    let last; for (let i = 0; i < 6; i++) last = await reg(t, { 'X-Forwarded-For': '198.51.100.' + i });
    assert.equal(last.status, 429, 'đổi X-Forwarded-For mỗi lần không né được hạn theo nguồn (nguồn = socket)');
  } finally { await t.clean(); }
  const t2 = await boot({ config: { trustProxy: true } });
  try {
    for (let i = 0; i < 5; i++) assert.equal((await reg(t2, { 'X-Forwarded-For': 'gia-' + i + ', 198.51.100.1' })).status, 201, 'hop phải nhất cố định ⇒ cùng một nguồn');
    assert.equal((await reg(t2, { 'X-Forwarded-For': 'gia-x, 198.51.100.1' })).status, 429);
    assert.equal((await reg(t2, { 'X-Forwarded-For': 'gia-x, 198.51.100.2' })).status, 201, 'nguồn khác không bị ảnh hưởng');
    assert.equal((await reg(t2, { 'CF-Connecting-IP': '198.51.100.77', 'X-Forwarded-For': 'a, 198.51.100.1' })).status, 201, 'cf-connecting-ip được ưu tiên');
  } finally { await t2.clean(); }
});

test('trần pending theo (client_id, nguồn); "Từ chối tất cả yêu cầu ngoài" chỉ owner-UI, không đụng yêu cầu nội bộ', async () => {
  const t = await boot({ config: { trustProxy: true, deviceIntervalMs: 20 } });
  try {
    const db = dbOf(t);
    const pubIp = ip => ({ 'X-Forwarded-For': ip });
    const claude = 'https://claude.ai/api/mcp/auth_callback';
    const cid = (await request(t.base, 'POST', '/oauth/register', { body: { client_name: 'C', redirect_uris: [claude] }, headers: pubIp('160.79.104.10') })).json.client_id;
    const go = ip => authorize(t.base, cid, claude, { challenge: pkce().challenge, headers: pubIp(ip) });
    assert.equal((await go('1.1.1.1')).status, 302); assert.equal((await go('1.1.1.1')).status, 302);
    assert.match((await go('1.1.1.1')).location, /error=temporarily_unavailable/, 'cùng (client, nguồn) tối đa 2');
    assert.match((await go('2.2.2.2')).location, /^\/#\/authorize/, 'nguồn khác dùng cùng client_id không bị chặn bởi nguồn tấn công');
    // yêu cầu nội bộ + yêu cầu ngoài
    await openWindow(t);
    const dv = (await startDevice(t, {}, INTERNAL)).json;
    const before = (await t.call('GET', '/api/auth-requests')).json.requests.length; assert.ok(before >= 4);
    // chỉ owner qua UI
    assert.equal((await request(t.base, 'POST', '/api/auth-requests/deny-all', { token: 'gst_x', body: {}, origin: t.base })).status, 403);
    assert.equal((await request(t.base, 'POST', '/api/auth-requests/deny-all', { body: {}, origin: t.base })).status, 401);
    assert.throws(() => t.app.ctx.write({ type: 'cli', entry: 'cli' }, 'auth.deny_all', {}), /quyền/);
    const r = await t.call('POST', '/api/auth-requests/deny-all', {});
    assert.equal(r.status, 200); assert.equal(r.json.denied, 3);
    const left = (await t.call('GET', '/api/auth-requests')).json.requests;
    assert.equal(left.length, 1); assert.equal(left[0].channel, 'internal', 'yêu cầu nội bộ còn nguyên');
    assert.ok(db.get("SELECT 1 AS x FROM audit_log WHERE action='auth.deny_all' AND entry='ui'"));
    assert.equal((await token(t.base, { grant_type: DEV, device_code: dv.device_code, client_id: dv.client_id }, INTERNAL)).json.error, 'authorization_pending');
  } finally { await t.clean(); }
});

test('duyệt ghép thiết bị đóng cửa sổ ghép của kênh đó (ghi nhật ký); Tổng quan: 24 giờ cuốn chiếu và internal_agent_off', async () => {
  const t = await boot({ config: { deviceIntervalMs: 20 } });
  try {
    const db = dbOf(t);
    await openWindow(t);
    const d = (await startDevice(t, {}, INTERNAL)).json;
    assert.equal((await t.call('GET', '/api/runner-status')).json.pairing.open, true);
    const ap = await t.call('POST', `/api/auth-requests/${byCode(t, d.user_code).display_id}/approve`, {});
    assert.equal(ap.status, 200);
    assert.equal((await t.call('GET', '/api/runner-status')).json.pairing.open, false, 'cửa sổ đóng sau khi duyệt');
    assert.ok(db.get("SELECT 1 AS x FROM audit_log WHERE action='auth.approve' AND after LIKE '%\"closed_window\":true%'"));
    // cửa sổ của kênh khác không bị đóng khi duyệt yêu cầu internal
    await openWindow(t, 'loopback'); const d2 = (await startDevice(t, {})).json;
    await t.call('POST', `/api/auth-requests/${byCode(t, d2.user_code).display_id}/approve`, { user_code: d2.user_code });
    assert.equal((await t.call('GET', '/api/runner-status')).json.pairing.open, false);
    // internal_agent_off: có agent internal nhưng đã thu hồi hết
    assert.equal((await t.call('GET', '/api/overview')).json.internal_agent_off, false);
    await t.call('POST', `/api/agents/${ap.json.agent.display_id}/revoke`, {});
    assert.equal((await t.call('GET', '/api/overview')).json.internal_agent_off, true);
    // 24 giờ cuốn chiếu: WO đóng cách đây 1 giờ tính, cách đây 30 giờ không tính (bất kể "hôm qua" theo lịch)
    const ch = (await t.call('POST', '/api/channels', { name: 'K' })).json;
    const mk = (hoursAgo) => { const id = require('../server/ids.js').ulid(); const closed = new Date(Date.now() - hoursAgo * 3600e3).toISOString(); db.run("INSERT INTO work_orders(id,workspace_id,display_id,channel_id,kind,state,brief,attempts,opened_at,closed_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)", id, db.ws, 'WO-9' + hoursAgo, db.get('SELECT id FROM channels WHERE display_id=?', ch.display_id).id, 'manual', 'fulfilled', 'x', 0, closed, closed, closed, closed); };
    mk(1); mk(30);
    assert.equal((await t.call('GET', '/api/overview')).json.yesterday.work_orders, 1);
  } finally { await t.clean(); }
});

test('kênh loopback đòi cả socket loopback; Host studio:7490 từ mạng Docker không có bí mật ⇒ công khai; có bí mật ⇒ internal', async () => {
  const t = await boot();
  try {
    const ing = t.app.ctx.oauth.ingress;
    const mk = (host, addr, extra) => ({ headers: Object.assign({ host }, extra), socket: { remoteAddress: addr } });
    for (const a of ['127.0.0.1', '127.9.9.9', '::1', '::ffff:127.0.0.1']) assert.equal(ing(mk('localhost:7490', a)), 'loopback', a);
    for (const a of ['172.18.0.5', '10.0.0.2', '::ffff:192.168.1.5', '2001:db8::1']) assert.equal(ing(mk('localhost:7490', a)), 'public', 'Host loopback nhưng socket ngoài: ' + a);
    assert.equal(ing(mk('studio:7490', '172.18.0.5')), 'public', 'Docker không có bí mật');
    assert.equal(ing(mk('studio:7490', '172.18.0.5', { 'x-gs-pairing': SECRET })), 'internal');
    assert.equal(ing(mk('studio:7490', '127.0.0.1')), 'loopback');
    assert.equal(ing(mk('studio:7490', '172.18.0.5', { 'x-gs-pairing': 'sai' })).forbidden, true);
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
    assert.equal((await t.call('GET', '/api/runner-status')).json.pairing.open, false, 'duyệt xong thì cửa sổ đã đóng');
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

test('ghép nội bộ cần bí mật ghép: chỉ giả Host ⇒ không phải internal (phải gõ mã); bí mật sai ⇒ 403 + nhật ký; đúng ⇒ internal', async () => {
  const t = await boot({ config: { deviceIntervalMs: 20 } });
  try {
    const db = dbOf(t);
    // cửa sổ nội bộ mở: kẻ chỉ giả Host studio:7490 (không có bí mật) không xin được mã
    await openWindow(t);
    const spoofed = await startDevice(t, {}, SPOOF);
    assert.equal(spoofed.json.error, 'pairing_closed', 'Host giả không có bí mật rơi vào luật loopback, cửa sổ nội bộ không áp dụng');
    assert.equal(db.get('SELECT COUNT(*) AS n FROM auth_requests').n, 0);
    assert.equal((await request(t.base, 'GET', '/oauth/pairing-status', { headers: SPOOF })).json.window_open, false);
    await request(t.base, 'GET', '/oauth/pairing-status?runner=paired', { headers: SPOOF });
    assert.equal((await t.call('GET', '/api/runner-status')).json.runner, null, 'Host giả không giả được trạng thái runner');
    // cửa sổ CLI (loopback) mở: Host giả vẫn chỉ là loopback → kind oauth, tên tự khai, phải tự gõ mã
    await openWindow(t, 'loopback');
    const d = (await startDevice(t, { client_name: 'Agent nội bộ' }, SPOOF)).json;
    const r = byCode(t, d.user_code);
    assert.equal(r.channel, 'loopback'); assert.equal(r.client_name, 'Agent nội bộ (tự khai)');
    const v = (await t.call('GET', `/api/auth-requests/${r.display_id}`)).json.request; assert.equal(v.needs_code, true); assert.equal(v.agent_kind, 'oauth');
    assert.equal((await t.call('POST', `/api/auth-requests/${r.display_id}/approve`, {})).status, 400, 'không có mã gõ tay thì không duyệt');
    // bí mật sai (hoặc rỗng) ⇒ 403 + nhật ký (không ghi giá trị header)
    for (const bad of ['gsp_sai-bi-mat', '', SECRET + 'x']) {
      for (const [m, p] of [['POST', '/oauth/device'], ['GET', '/oauth/pairing-status']]) {
        const x = await request(t.base, m, p, { headers: { Host: 'studio:7490', 'X-GS-Pairing': bad }, body: m === 'POST' ? { client_name: 'x' } : undefined });
        assert.equal(x.status, 403, p + ' / ' + bad); assert.equal(x.json.error, 'access_denied');
      }
    }
    assert.equal((await request(t.base, 'POST', '/oauth/device', { headers: { 'X-GS-Pairing': 'sai' }, body: {} })).status, 403, 'sai bí mật bị từ chối kể cả khi Host là loopback');
    assert.ok(db.get("SELECT 1 AS x FROM audit_log WHERE action='auth.bad_secret' AND entry='oauth'"));
    assert.ok(!JSON.stringify(db.all('SELECT before, after FROM audit_log')).includes('gsp_'), 'nhật ký không chứa bí mật');
    // đúng bí mật + Host nội bộ ⇒ internal (cần cửa sổ internal)
    await openWindow(t);
    const ok = (await startDevice(t, { client_name: 'Tên tuỳ ý' }, INTERNAL)).json;
    const ri = byCode(t, ok.user_code); assert.equal(ri.channel, 'internal'); assert.equal(ri.client_name, 'Agent nội bộ');
    assert.equal((await t.call('GET', `/api/auth-requests/${ri.display_id}`)).json.request.needs_code, false);
    // bí mật đúng nhưng đi kèm dấu vết tunnel ⇒ vẫn là công khai (403 ở /oauth/device)
    assert.equal((await startDevice(t, {}, Object.assign({}, INTERNAL, PUBLIC))).status, 403);
    // studio chưa có bí mật ⇒ không có kênh internal nào (header gửi lên bị coi là sai)
    t.app.ctx.config.pairingSecret = null;
    assert.equal((await startDevice(t, {}, INTERNAL)).status, 403);
  } finally { await t.clean(); }
});

test('config: GS_PAIRING_SECRET tự sinh như GS_MASTER_KEY; compose chỉ truyền cho studio + agent; mask che gsp_', () => {
  const cfg = require('../server/config.js').load({ env: { DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'gs-cfg-')), GS_MASTER_KEY: crypto.randomBytes(32).toString('hex') }, dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'gs-cfg-')) });
  assert.match(cfg.pairingSecret, /^gsp_[A-Za-z0-9_-]{43}$/);
  const m = events.mask('header ' + cfg.pairingSecret + ' xong'); assert.ok(!m.includes(cfg.pairingSecret.slice(6)));
  const compose = fs.readFileSync(path.join(__dirname, '..', 'docker-compose.yml'), 'utf8');
  assert.equal((compose.replace(/^\s*#.*$/gm, '').match(/^\s*GS_PAIRING_SECRET:/gm) || []).length, 2, 'đúng hai service (studio, agent) nhận bí mật');
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
    assert.equal(db.get('SELECT COUNT(*) AS n FROM schema_migrations').n, 7);   // 0001 + 0002 + 0003 (v0.2.0) + 0004 (gói V: cast_members.origin) + 0005 (F7: aspect) + 0006/0007 (0.3.0-A: Gen Kit)
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
