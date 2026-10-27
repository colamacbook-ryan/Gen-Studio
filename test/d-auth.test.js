// © 2026 Gen Labs — All rights reserved.
// Gói D: auth — scrypt, phiên, khoá một lần hết hạn 30 phút, token agent băm, đặt lại mật khẩu.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { tmpDb, basics } = require('./a-helpers.js');
const auth = require('../server/auth.js');

test('d-auth: khoá một lần — sinh khi chưa có owner, hết hạn 30 phút, xoá khi đã có owner', () => {
  const t = tmpDb();
  try {
    fs.mkdirSync(path.join(t.dir, 'run'), { recursive: true });
    const k = auth.ensureAdminKey(t.dir, t.db);
    assert.ok(k && k.length >= 24);
    assert.equal(auth.ensureAdminKey(t.dir, t.db), k, 'còn hạn thì giữ nguyên');
    assert.ok(auth.checkAdminKey(t.dir, k)); assert.ok(!auth.checkAdminKey(t.dir, 'sai')); assert.ok(!auth.checkAdminKey(t.dir, ''));
    const f = path.join(t.dir, 'run', 'admin-key');
    const old = new Date(Date.now() - 31 * 60000); fs.utimesSync(f, old, old);
    assert.ok(!auth.checkAdminKey(t.dir, k), 'hết hạn sau 30 phút');
    const k2 = auth.ensureAdminKey(t.dir, t.db);
    assert.notEqual(k2, k);
    auth.createOwner(t.db, { username: 'chu', display_name: 'Chủ', password: 'mat-khau-dai-123' });
    assert.equal(auth.ensureAdminKey(t.dir, t.db), null); assert.equal(fs.existsSync(f), false);
    assert.throws(() => auth.createOwner(t.db, { username: 'khac', password: 'mat-khau-dai-123' }), e => e.code === 'conflict');
  } finally { t.clean(); }
});

test('d-auth: mật khẩu ≥ 12 ký tự, đăng nhập, phiên hết hạn, đặt lại mật khẩu đóng mọi phiên', () => {
  const t = tmpDb();
  try {
    assert.throws(() => auth.createOwner(t.db, { username: 'chu', password: 'ngan' }), e => e.code === 'invalid');
    const u = auth.createOwner(t.db, { username: 'chu', display_name: 'Chủ', password: 'mat-khau-dai-123' });
    assert.match(u.password_hash, /^scrypt\$/);
    assert.ok(auth.checkLogin(t.db, 'chu', 'mat-khau-dai-123'));
    assert.equal(auth.checkLogin(t.db, 'chu', 'sai'), null); assert.equal(auth.checkLogin(t.db, 'nguoi-la', 'x'), null);
    const s = auth.createSession(t.db, u.id, { ua: 'test' });
    const got = auth.getSession(t.db, s.token);
    assert.equal(got.user.id, u.id); assert.equal(got.csrf, s.csrf);
    assert.ok(t.db.get('SELECT token_hash FROM sessions').token_hash !== s.token, 'chỉ lưu băm của token phiên');
    t.db.run("UPDATE sessions SET expires_at='2000-01-01T00:00:00.000Z'");
    assert.equal(auth.getSession(t.db, s.token), null);
    const s2 = auth.createSession(t.db, u.id);
    const r = auth.resetOwnerPassword(t.db);
    assert.equal(r.username, 'chu'); assert.ok(r.password.length >= 12);
    assert.equal(auth.getSession(t.db, s2.token), null, 'đặt lại mật khẩu đóng mọi phiên');
    assert.ok(auth.checkLogin(t.db, 'chu', r.password)); assert.equal(auth.checkLogin(t.db, 'chu', 'mat-khau-dai-123'), null);
  } finally { t.clean(); }
});

test('d-auth: token agent — băm, thu hồi, scopes', () => {
  const t = tmpDb();
  try {
    const b = basics(t.write, t.db);
    const r = t.write(b.o, 'agent.create', { name: 'A', scopes: ['read', 'run'] });
    assert.equal(t.db.get('SELECT COUNT(*) AS n FROM agent_tokens WHERE token_hash=?', r.token).n, 0, 'không lưu token thô');
    const v = auth.verifyAgentToken(t.db, r.token);
    assert.deepEqual(v.scopes, ['read', 'run']); assert.equal(v.agent.display_id, r.agent.display_id);
    assert.ok(t.db.get('SELECT last_call_at FROM agents WHERE id=?', v.agent.id).last_call_at);
    assert.equal(auth.verifyAgentToken(t.db, r.token + 'x'), null);
    t.write(b.o, 'agent.revoke', { agent: r.agent.display_id });
    assert.equal(auth.verifyAgentToken(t.db, r.token), null);
  } finally { t.clean(); }
});

test('d-auth: chặn dò mật khẩu theo IP', () => {
  for (let i = 0; i < 8; i++) auth.loginFailed('9.9.9.9');
  assert.ok(auth.loginThrottled('9.9.9.9'));
  auth.loginOk('9.9.9.9'); assert.ok(!auth.loginThrottled('9.9.9.9'));
});
