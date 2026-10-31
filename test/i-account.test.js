// © 2026 Gen Labs — All rights reserved.
// Gói d-account (brief Gen 31/10/2026) — POST /api/me/password: đổi mật khẩu của chính người dùng đang đăng nhập.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { bootTmp, request, setupOwner, ui } = require('./d-helpers.js');

test('i-account: đổi mật khẩu thành công -> đăng nhập lại bằng mật khẩu mới, mật khẩu cũ không còn dùng được', async () => {
  const t = await bootTmp();
  try {
    const s = await setupOwner(t.app, t.base);
    const call = ui(t.base, s);
    const r = await call('POST', '/api/me/password', { current_password: s.password, new_password: 'mat-khau-moi-rat-dai-456' });
    assert.equal(r.status, 200);
    // mật khẩu cũ không còn đăng nhập được
    assert.equal((await request(t.base, 'POST', '/api/login', { body: { username: s.username, password: s.password }, origin: t.base })).status, 401);
    // mật khẩu mới đăng nhập được
    const ok = await request(t.base, 'POST', '/api/login', { body: { username: s.username, password: 'mat-khau-moi-rat-dai-456' }, origin: t.base });
    assert.equal(ok.status, 200);
  } finally { await t.clean(); }
});

test('i-account: sai mật khẩu hiện tại -> 4xx, không đổi được', async () => {
  const t = await bootTmp();
  try {
    const s = await setupOwner(t.app, t.base);
    const call = ui(t.base, s);
    const r = await call('POST', '/api/me/password', { current_password: 'sai-mat-khau-hien-tai', new_password: 'mat-khau-moi-rat-dai-456' });
    assert.ok(r.status >= 400 && r.status < 500, 'phải 4xx, nhận ' + r.status);
    // mật khẩu cũ vẫn còn dùng được (không bị đổi)
    const ok = await request(t.base, 'POST', '/api/login', { body: { username: s.username, password: s.password }, origin: t.base });
    assert.equal(ok.status, 200);
  } finally { await t.clean(); }
});

test('i-account: mật khẩu mới < 12 ký tự -> 4xx', async () => {
  const t = await bootTmp();
  try {
    const s = await setupOwner(t.app, t.base);
    const call = ui(t.base, s);
    const r = await call('POST', '/api/me/password', { current_password: s.password, new_password: 'ngan' });
    assert.ok(r.status >= 400 && r.status < 500, 'phải 4xx, nhận ' + r.status);
  } finally { await t.clean(); }
});

test('i-account: chưa đăng nhập -> 401', async () => {
  const t = await bootTmp();
  try {
    await setupOwner(t.app, t.base);
    const r = await request(t.base, 'POST', '/api/me/password', { body: { current_password: 'x', new_password: 'mat-khau-moi-rat-dai-456' }, origin: t.base });
    assert.equal(r.status, 401);
  } finally { await t.clean(); }
});

test('i-account: cấm đặt trùng mật khẩu cũ -> 4xx', async () => {
  const t = await bootTmp();
  try {
    const s = await setupOwner(t.app, t.base);
    const call = ui(t.base, s);
    const r = await call('POST', '/api/me/password', { current_password: s.password, new_password: s.password });
    assert.ok(r.status >= 400 && r.status < 500, 'phải 4xx, nhận ' + r.status);
  } finally { await t.clean(); }
});
