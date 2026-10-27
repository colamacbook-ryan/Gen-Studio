// © 2026 Gen Labs — All rights reserved.
// HTTP thuần node:http: studio/ tĩnh, /api, /media (Range), /mcp (Bearer token agent). Chống DNS rebinding bằng kiểm Host/Origin.
'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const apiMod = require('./api.js');
const auth = require('./auth.js');
const events = require('./events.js');
const pipeline = require('./pipeline.js');

const STUDIO_DIR = path.join(__dirname, '..', 'studio');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.txt': 'text/plain; charset=utf-8', '.webmanifest': 'application/manifest+json' };
const CSP = "default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";

function allowedHosts(config, port) {
  const s = new Set();
  [`localhost:${port}`, `127.0.0.1:${port}`, `[::1]:${port}`, 'localhost', '127.0.0.1', '[::1]'].forEach(h => s.add(h));
  if (config.publicUrl) { try { s.add(new URL(config.publicUrl).host.toLowerCase()); } catch { /* bỏ qua URL sai */ } }
  String(process.env.GS_ALLOWED_HOSTS || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean).forEach(h => s.add(h));
  return s;
}

async function start(ctx) {
  const { db, config } = ctx;
  const api = apiMod.create(ctx);
  let hosts = null; // cần cổng thật (port 0 trong test)
  const baseHeaders = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY' };

  function text(res, status, body, type = 'text/plain; charset=utf-8', extra) {
    const b = Buffer.from(body);
    res.writeHead(status, Object.assign({ 'Content-Type': type, 'Content-Length': b.length }, extra));
    res.end(b);
  }
  const originOk = (origin, host) => { try { const h = new URL(origin).host.toLowerCase(); return h === String(host || '').toLowerCase() || hosts.has(h); } catch { return false; } };

  async function handleMcp(req, res) {
    if (req.headers.origin && !originOk(req.headers.origin, req.headers.host)) return apiMod.send(res, 403, { error: { code: 'forbidden', text_human: 'Origin không được phép.', detail: null } });
    if (req.method !== 'POST') return text(res, 405, 'Dùng POST.', 'text/plain; charset=utf-8', { Allow: 'POST' });
    const tok = auth.bearer(req);
    const who = tok && auth.verifyAgentToken(db, tok);
    if (!who) return apiMod.send(res, 401, { error: { code: 'unauthorized', text_human: 'Thiếu hoặc sai token agent.', detail: null } }, { 'WWW-Authenticate': 'Bearer realm="gen-studio"' });
    let body;
    try { body = JSON.parse((await apiMod.readBody(req, 30 * 1024 * 1024)).toString('utf8')); }
    catch (e) { if (e && e.code === 'payload_too_large') return apiMod.send(res, 413, { error: { code: 'payload_too_large', text_human: e.text_human, detail: null } }); return apiMod.send(res, 400, { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }); }
    const c = { agent: who.agent, scopes: who.scopes };
    if (Array.isArray(body)) {
      const outs = (await Promise.all(body.map(m => ctx.mcp.handle(m, c)))).filter(Boolean);
      return outs.length ? apiMod.send(res, 200, outs) : (res.writeHead(202), res.end());
    }
    const out = await ctx.mcp.handle(body, c);
    if (!out) { res.writeHead(202); return res.end(); }
    apiMod.send(res, 200, out);
  }

  function handleMedia(req, res, url) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return text(res, 405, 'Method not allowed');
    if (!api.session(req)) return apiMod.send(res, 401, { error: { code: 'unauthorized', text_human: 'Cần đăng nhập.', detail: null } });
    const id = decodeURIComponent(url.pathname.slice('/media/'.length));
    const a = db.get('SELECT * FROM assets WHERE workspace_id=? AND (display_id=? OR id=?)', db.ws, id, id);
    if (!a || !a.media_present) return apiMod.send(res, 404, { error: { code: 'not_found', text_human: 'Không có tệp media này.', detail: null } });
    const file = path.isAbsolute(a.path) ? a.path : path.join(db.dataDir, a.path);
    let st;
    try { st = fs.statSync(file); } catch { return apiMod.send(res, 404, { error: { code: 'not_found', text_human: 'Tệp media đã bị dọn khỏi đĩa.', detail: null } }); }
    const h = { 'Content-Type': a.mime || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff', 'Accept-Ranges': 'bytes', 'Cache-Control': 'private, max-age=3600' };
    if (a.mime === 'image/svg+xml') { h['Content-Security-Policy'] = "sandbox; default-src 'none'; style-src 'unsafe-inline'"; h['Content-Disposition'] = `inline; filename="${a.display_id}.svg"`; }
    let start_ = 0, end = st.size - 1, status = 200;
    const rg = req.headers.range && /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
    if (req.headers.range && !rg) { res.writeHead(416, { 'Content-Range': 'bytes */' + st.size }); return res.end(); }
    if (rg) {
      if (rg[1] === '' && rg[2] === '') { res.writeHead(416, { 'Content-Range': 'bytes */' + st.size }); return res.end(); }
      if (rg[1] === '') { start_ = Math.max(0, st.size - Number(rg[2])); } else { start_ = Number(rg[1]); if (rg[2] !== '') end = Math.min(end, Number(rg[2])); }
      if (start_ > end || start_ >= st.size) { res.writeHead(416, { 'Content-Range': 'bytes */' + st.size }); return res.end(); }
      status = 206; h['Content-Range'] = `bytes ${start_}-${end}/${st.size}`;
    }
    h['Content-Length'] = end - start_ + 1;
    res.writeHead(status, h);
    if (req.method === 'HEAD') return res.end();
    const s = fs.createReadStream(file, { start: start_, end });
    s.on('error', e => { events.logError('media', e); res.destroy(); });
    s.pipe(res);
  }

  function handleStatic(req, res, url) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return text(res, 405, 'Method not allowed');
    let rel = decodeURIComponent(url.pathname);
    if (rel === '/' || rel === '') rel = '/index.html';
    let file = path.normalize(path.join(STUDIO_DIR, rel));
    if (file !== STUDIO_DIR && !file.startsWith(STUDIO_DIR + path.sep)) return text(res, 403, 'Forbidden');
    let st = null;
    try { st = fs.statSync(file); if (st.isDirectory()) { file = path.join(file, 'index.html'); st = fs.statSync(file); } } catch { st = null; }
    if (!st) {
      // đường dẫn của SPA (không có đuôi) → index.html; tệp thiếu → 404
      if (path.extname(rel)) return text(res, 404, 'Không tìm thấy.');
      file = path.join(STUDIO_DIR, 'index.html');
      try { st = fs.statSync(file); } catch { return text(res, 404, 'Giao diện chưa được cài (thiếu studio/index.html).'); }
    }
    const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': st.size, 'Cache-Control': 'no-cache', 'Content-Security-Policy': CSP });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  }

  const server = http.createServer(async (req, res) => {
    try {
      for (const k of Object.keys(baseHeaders)) res.setHeader(k, baseHeaders[k]);
      const url = new URL(req.url, 'http://x');
      if (url.pathname === '/mcp') return await handleMcp(req, res);
      if (url.pathname === '/api/health') return apiMod.send(res, 200, { ok: true, version: config.version });
      // chống DNS rebinding: mọi đường dẫn UI phải có Host đã biết
      if (!hosts.has(String(req.headers.host || '').toLowerCase())) {
        return text(res, 403, 'Host không được phép. Nếu truy cập qua địa chỉ khác, thêm vào GS_ALLOWED_HOSTS (ví dụ 192.168.1.5:7490).');
      }
      if (url.pathname.startsWith('/api/')) return await api.handle(req, res, url);
      if (url.pathname.startsWith('/media/')) return handleMedia(req, res, url);
      return handleStatic(req, res, url);
    } catch (e) {
      events.logError('http', e);
      if (!res.headersSent) { const { status, body } = apiMod.errBody(e); apiMod.send(res, status, body); } else res.destroy();
    }
  });
  server.requestTimeout = 0;
  server.headersTimeout = 30000;
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(config.port, config.host, resolve); });
  const port = server.address().port;
  hosts = allowedHosts(config, port);
  return { server, port, close: () => new Promise(r => { server.closeAllConnections && server.closeAllConnections(); server.close(() => r()); }) };
}

module.exports = { start, allowedHosts };
