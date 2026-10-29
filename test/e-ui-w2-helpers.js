// © 2026 Gen Labs — All rights reserved.
// Tiện ích chung cho test giao diện W2 (UI-H1 · UI-R2 · UI-P2 · UI-L1) — không phải file test.
// bootDemo(): máy chủ tạm có dữ liệu demo (GS_SEED_DEMO) + phiên UI của chủ xưởng; load(rel): nạp module ESM của studio trong Node.
'use strict';
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { bootTmp, request } = require('./d-helpers.js');

const STUDIO = path.join(__dirname, '..', 'studio');
const load = (rel) => import(pathToFileURL(path.join(STUDIO, rel)).href);
const PASSWORD = 'mat-khau-demo-w2-rat-dai';

async function bootDemo() {
  const prev = process.env.GS_DEMO_PASSWORD;
  process.env.GS_DEMO_PASSWORD = PASSWORD;   // seed.js đọc mật khẩu demo từ process.env
  let t;
  try { t = await bootTmp({ seed: true, env: { GS_DEMO_PASSWORD: PASSWORD } }); } finally { if (prev === undefined) delete process.env.GS_DEMO_PASSWORD; else process.env.GS_DEMO_PASSWORD = prev; }
  const db = t.app.ctx.db;
  const owner = db.get("SELECT username FROM users WHERE role='owner' LIMIT 1");
  const r = await request(t.base, 'POST', '/api/login', { body: { username: owner.username, password: PASSWORD }, origin: t.base });
  if (r.status !== 200) { await t.clean(); throw new Error('đăng nhập demo lỗi: ' + r.text); }
  const cookie = String(r.headers['set-cookie']).split(';')[0];
  const sess = { cookie, csrf: r.json.csrf };
  const api = (method, p, body, extra = {}) => request(t.base, method, p, Object.assign({ body, cookie: sess.cookie, csrf: sess.csrf, origin: t.base }, extra));
  const ownerActor = () => { const u = db.get("SELECT id FROM users WHERE role='owner' LIMIT 1"); return { type: 'user', id: u.id, role: 'owner', entry: 'ui' }; };
  return Object.assign(t, { db, api, sess, write: t.app.ctx.write, ownerActor });
}

module.exports = { bootDemo, load, request, STUDIO };
