// © 2026 Gen Labs — All rights reserved.
// Tiện ích dùng chung cho test gói D (không phải file test).
'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const { boot } = require('../server/main.js');

const KEY = crypto.randomBytes(32).toString('hex');
async function bootTmp(opts = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-d-'));
  const app = await boot(Object.assign({ seed: false, workers: false, scheduler: false }, opts, {
    env: Object.assign({ DATA_DIR: dir, GS_MASTER_KEY: KEY, GS_PORT: '7490', GS_FAKE_PROVIDERS: '1', GS_SEED_DEMO: '' }, opts.env),
    config: Object.assign({ port: 0, host: '127.0.0.1' }, opts.config),
  }));
  return { app, dir, base: app.url, clean: async () => { await app.close(); if (process.env.GS_KEEP_DATA === '1') console.log('# giữ DATA_DIR:', dir); else fs.rmSync(dir, { recursive: true, force: true }); } };
}

// request thô qua node:http (cho phép đặt Origin/Host tuỳ ý)
function request(base, method, p, { body, cookie, csrf, headers = {}, token, origin } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(p, base);
    const data = body === undefined ? null : Buffer.from(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
    const h = Object.assign({}, headers);
    if (data) { h['Content-Type'] = h['Content-Type'] || 'application/json'; h['Content-Length'] = data.length; }
    if (cookie) h.Cookie = cookie;
    if (csrf) h['X-CSRF'] = csrf;
    if (token) h.Authorization = 'Bearer ' + token;
    if (origin) h.Origin = origin;
    const req = http.request({ host: u.hostname, port: u.port, path: u.pathname + u.search, method, headers: h }, res => {
      const ch = []; res.on('data', c => ch.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(ch); let json = null;
        try { json = JSON.parse(buf.toString('utf8')); } catch { /* không phải JSON */ }
        resolve({ status: res.statusCode, headers: res.headers, buf, json, text: buf.toString('utf8') });
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}
// Thiết lập owner qua link một lần và trả phiên UI
async function setupOwner(app, base, username = 'owner', password = 'mat-khau-rat-dai-123') {
  const key = fs.readFileSync(path.join(app.ctx.config.dataDir, 'run', 'admin-key'), 'utf8').trim();
  const r = await request(base, 'POST', '/api/setup/owner?k=' + encodeURIComponent(key), { body: { username, display_name: 'Chủ xưởng', password, lang: 'vi' }, origin: base });
  if (r.status !== 201) throw new Error('setup owner lỗi: ' + r.text);
  const cookie = String(r.headers['set-cookie']).split(';')[0];
  return { cookie, csrf: r.json.csrf, username, password };
}
const ui = (base, s) => (method, p, body) => request(base, method, p, { body, cookie: s.cookie, csrf: s.csrf, origin: base });
async function mcpCall(base, token, name, args, id = 1) {
  const r = await request(base, 'POST', '/mcp', { token, body: { jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args || {} } } });
  return r;
}
module.exports = { bootTmp, request, setupOwner, ui, mcpCall, KEY };
