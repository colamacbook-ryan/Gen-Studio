// © 2026 Gen Labs — All rights reserved.
// Máy chủ cấp quyền OAuth 2.1 cho /mcp: metadata (RFC 9728/8414), đăng ký client (7591), authorize + PKCE S256, token (code, refresh xoay vòng),
// ghép thiết bị (RFC 8628 rút gọn, chỉ trong máy và chỉ khi chủ xưởng mở cửa sổ ghép). Mọi ghi đi qua write() (auth.*);
// duyệt/từ chối chỉ qua phiên UI của chủ xưởng (xem api.js). issuer/resource chỉ tính từ Host nằm trong danh sách cho phép.
'use strict';
const apiMod = require('./api.js');
const auth = require('./auth.js');
const secrets = require('./secrets.js');
const { redirectMatches, SCOPES } = require('./write.js');

const DEVICE_GRANT = 'urn:ietf:params:oauth:grant-type:device_code';
const PATHS = new Set(['/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/mcp', '/.well-known/oauth-authorization-server', '/.well-known/openid-configuration',
  '/oauth/register', '/oauth/authorize', '/oauth/token', '/oauth/device', '/oauth/pairing-status']);
const STATUS = { invalid_client: 401 };
const FORWARD = ['x-forwarded-for', 'x-forwarded-host', 'x-forwarded-proto', 'forwarded', 'cf-connecting-ip', 'cf-ray', 'x-real-ip'];
const LOOP = new Set(['localhost', '127.0.0.1', '[::1]']);
const RUNNER_STATES = new Set(['unpaired', 'waiting', 'paired', 'error']);

function create(ctx, { hosts }) {
  const { db, config, write } = ctx;
  const lim = auth.limiter();
  const polls = new Map();                                   // device_code (băm) → {t, ms}: chống poll dồn (slow_down), chỉ giữ trong bộ nhớ
  const baseMs = () => Number(config.deviceIntervalMs) || 5000;
  const internalHost = () => String(config.internalHost || 'studio:7490').toLowerCase();
  // [tối đa, cửa sổ ms] theo kênh vào; config.authLimits.<loại> ghi đè cho mọi kênh (dùng trong test)
  const limit = (kind, chan) => {
    const d = { register: { internal: [60, 3600e3], loopback: [20, 3600e3], public: [10, 3600e3] }, device: { internal: [20, 600e3], loopback: [10, 600e3], public: [10, 600e3] },
      token: { internal: [600, 60e3], loopback: [300, 60e3], public: [120, 60e3] }, status: { internal: [600, 60e3], loopback: [120, 60e3], public: [60, 60e3] } };
    return (config.authLimits && config.authLimits[kind]) || d[kind][chan];
  };
  const act = id => ({ type: 'client', id: id || 'anonymous', entry: 'oauth' });
  const sysAct = { type: 'system', entry: 'system' };
  let sid = null;
  const serverId = () => sid || (sid = write(sysAct, 'auth.init', {}).server_id);

  // Kênh vào (CNS-060/066): internal = Host nội bộ của mạng Docker (studio:7490) VÀ header X-GS-Pairing khớp bí mật ghép của bản cài (Host một mình có thể bị giả);
  // loopback = máy chủ (kể cả Host studio:7490 không có bí mật: chủ xưởng phải tự gõ mã); public = mọi thứ còn lại, gồm cả yêu cầu có dấu vết proxy/tunnel.
  // Có header X-GS-Pairing nhưng sai (hoặc studio chưa có bí mật) → 'forbidden'. Trả {chan, forbidden}.
  function ingress(req) {
    const hdr = req.headers['x-gs-pairing'];
    const secret = config.pairingSecret;
    const valid = hdr !== undefined && !!secret && auth.eq(String(hdr), secret);
    if (hdr !== undefined && !valid) return { chan: 'public', forbidden: true };
    if (FORWARD.some(h => req.headers[h])) return 'public';
    const host = String(req.headers.host || '').toLowerCase();
    if (host === internalHost() && valid) return 'internal';
    if (host === internalHost() || LOOP.has(host.replace(/:\d+$/, ''))) return 'loopback';
    return 'public';
  }
  const proto = req => (req.socket.encrypted || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http');
  // URL gốc dựng từ Host của yêu cầu, CHỈ khi Host nằm trong danh sách cho phép (chống Host header injection); không được thì null
  function baseUrl(req) {
    const host = String(req.headers.host || '').toLowerCase();
    if (!host || !hosts().has(host)) return null;
    if (config.publicUrl) { try { const u = new URL(config.publicUrl); if (u.host.toLowerCase() === host) return u.origin; } catch { /* bỏ qua URL sai */ } }
    return proto(req) + '://' + host;
  }
  const normRes = r => String(r || '').replace(/\/+$/, '');
  // các URL tài nguyên /mcp hợp lệ của xưởng; `resource` (RFC 8707) phải nằm trong tập này
  function resourceSet() {
    const s = new Set();
    for (const h of hosts()) { s.add('http://' + h + '/mcp'); s.add('https://' + h + '/mcp'); }
    if (config.publicUrl) { try { s.add(new URL(config.publicUrl).origin + '/mcp'); } catch { /* bỏ qua */ } }
    return s;
  }
  const canonRes = r => [...resourceSet()].find(a => normRes(a) === normRes(r)) || null;
  const metadataUrl = req => { const b = baseUrl(req); return b ? b + '/.well-known/oauth-protected-resource' : null; };
  const ipOf = req => req.socket.remoteAddress || '?';

  const noStore = { 'Cache-Control': 'no-store', Pragma: 'no-cache' };
  const json = (res, status, obj, extra) => apiMod.send(res, status, obj, Object.assign({}, noStore, extra));
  const oerrBody = (error, description) => ({ error, error_description: description });
  const plain = (res, status, text) => { const b = Buffer.from(text); res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Content-Length': b.length, 'Cache-Control': 'no-store' }); res.end(b); };

  // WriteError có detail.oauth → lỗi OAuth chuẩn; còn lại để bộ xử lý chung trả 500
  function mapError(res, e) {
    const o = e && e.detail && e.detail.oauth;
    if (o) return json(res, STATUS[o] || 400, oerrBody(o, e.text_human));
    if (e && e.code === 'rate_limited') return json(res, 429, oerrBody('temporarily_unavailable', e.text_human), { 'Retry-After': '60' });
    throw e;
  }
  async function readParams(req) {
    const raw = (await apiMod.readBody(req, 64 * 1024)).toString('utf8');
    if (/json/i.test(req.headers['content-type'] || '')) { try { const v = JSON.parse(raw || '{}'); return v && typeof v === 'object' ? v : {}; } catch { throw apiMod.fail('invalid', 'Nội dung không phải JSON hợp lệ.'); } }
    return Object.fromEntries(new URLSearchParams(raw));
  }
  const str = (v, max = 2048) => (typeof v === 'string' && v.length <= max ? v : '');

  // ---- metadata ----
  function metadata(req, res, url, base) {
    if (url.pathname === '/.well-known/oauth-authorization-server' || url.pathname === '/.well-known/openid-configuration') {
      return json(res, 200, {
        issuer: base, authorization_endpoint: base + '/oauth/authorize', token_endpoint: base + '/oauth/token', registration_endpoint: base + '/oauth/register',
        device_authorization_endpoint: base + '/oauth/device', response_types_supported: ['code'],
        grant_types_supported: ['authorization_code', 'refresh_token', DEVICE_GRANT], code_challenge_methods_supported: ['S256'],
        token_endpoint_auth_methods_supported: ['none'], scopes_supported: SCOPES,
      }, { 'Cache-Control': 'public, max-age=300' });
    }
    return json(res, 200, { resource: base + '/mcp', authorization_servers: [base], scopes_supported: SCOPES, bearer_methods_supported: ['header'] }, { 'Cache-Control': 'public, max-age=300' });
  }

  // ---- đăng ký client động ----
  async function register(req, res, chan) {
    if (lim.hit('reg:' + chan, ...limit('register', chan))) return json(res, 429, oerrBody('temporarily_unavailable', 'Đăng ký quá nhiều lần. Thử lại sau.'), { 'Retry-After': '300' });
    const b = await readParams(req);
    try {
      const r = write(act(), 'auth.register', { client_name: str(b.client_name, 200), redirect_uris: b.redirect_uris, channel: chan, ip: ipOf(req) });
      return json(res, 201, { client_id: r.client_id, client_id_issued_at: Math.floor(Date.now() / 1000), client_name: r.name, redirect_uris: r.redirect_uris,
        grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], token_endpoint_auth_method: 'none' });
    } catch (e) { return mapError(res, e); }
  }

  // ---- authorize: kiểm tra rồi chuyển sang trang Cấp phép của giao diện ----
  function authorize(req, res, url, chan) {
    const q = url.searchParams;
    const clientId = q.get('client_id') || '', redirectUri = q.get('redirect_uri') || '';
    const cl = db.json(db.get('SELECT * FROM oauth_clients WHERE client_id=?', clientId));
    // client/redirect_uri sai → KHÔNG chuyển hướng (tránh open redirect), báo lỗi ngay tại đây
    if (!cl || cl.revoked_at || cl.kind !== 'dcr' || (cl.expires_at && cl.expires_at < new Date().toISOString())) return plain(res, 400, 'client_id không tồn tại, đã bị thu hồi hoặc hết hạn. Hãy đăng ký lại client.');
    if (!redirectMatches(cl.redirect_uris, redirectUri)) return plain(res, 400, 'redirect_uri không khớp địa chỉ đã đăng ký cho client này.');
    const back = (error, desc) => {
      const u = new URL(redirectUri); u.searchParams.set('error', error); u.searchParams.set('error_description', desc);
      if (q.get('state')) u.searchParams.set('state', q.get('state'));
      res.writeHead(302, { Location: u.toString(), 'Cache-Control': 'no-store' }); res.end();
    };
    if (q.get('response_type') !== 'code') return back('unsupported_response_type', 'Chỉ hỗ trợ response_type=code.');
    if (q.get('code_challenge_method') !== 'S256' || !q.get('code_challenge')) return back('invalid_request', 'PKCE S256 là bắt buộc (code_challenge + code_challenge_method=S256).');
    let resource = q.get('resource');
    if (resource) { resource = canonRes(resource); if (!resource) return back('invalid_target', 'resource không phải tài nguyên /mcp của máy chủ này.'); }
    if (lim.hit('req:' + chan, 60, 600e3)) return back('temporarily_unavailable', 'Quá nhiều yêu cầu. Thử lại sau.');
    let r;
    try { r = write(act(clientId), 'auth.request', { kind: 'oauth', client_id: clientId, redirect_uri: redirectUri, scope: q.get('scope') || '', state: q.get('state') || '', resource, code_challenge: q.get('code_challenge'), code_challenge_method: 'S256', channel: chan, ip: ipOf(req) }); }
    catch (e) { if (e && e.detail && e.detail.oauth) return back(e.detail.oauth, e.text_human); if (e && e.code === 'rate_limited') return back('temporarily_unavailable', e.text_human); throw e; }
    res.writeHead(302, { Location: '/#/authorize?req=' + encodeURIComponent(r.id), 'Cache-Control': 'no-store' }); res.end();
  }

  // ---- ghép thiết bị: xin mã (chỉ trong máy, chỉ khi cửa sổ ghép mở) ----
  async function device(req, res, chan, base) {
    if (chan === 'public') return json(res, 403, oerrBody('access_denied', 'Ghép thiết bị chỉ dùng trong máy chủ. Từ xa hãy dùng OAuth (Claude Code, claude.ai) hoặc token tay.'));
    if (lim.hit('dev:' + chan, ...limit('device', chan))) return json(res, 429, oerrBody('temporarily_unavailable', 'Xin mã ghép quá nhiều lần. Thử lại sau vài phút.'), { 'Retry-After': '120' });
    const b = await readParams(req);
    try {
      const r = write(act(), 'auth.request', { kind: 'device', client_name: str(b.client_name, 200), scope: str(b.scope, 200), channel: chan, ip: ipOf(req) });
      // verification_uri KHÔNG kèm mã: chủ xưởng phải tự gõ mã thiết bị đang in ra (ghép CLI ngoài)
      return json(res, 200, { device_code: r.device_code, user_code: r.user_code, client_id: r.client_id, verification_uri: base + '/#/pair', expires_in: r.expires_in, interval: Math.max(1, Math.ceil(baseMs() / 1000)) });
    } catch (e) { return mapError(res, e); }
  }

  // ---- trạng thái ghép (công khai, không bí mật): runner hỏi định kỳ rồi chỉ xin mã khi cửa sổ mở ----
  function pairingStatus(req, res, url, chan) {
    if (lim.hit('ps:' + chan, ...limit('status', chan))) return json(res, 429, oerrBody('temporarily_unavailable', 'Hỏi quá dày.'), { 'Retry-After': '10' });
    const owner = auth.ownerExists(db);
    const sr = (key) => { const r = db.get('SELECT value FROM settings WHERE workspace_id=? AND key=?', db.ws, key); try { return r ? JSON.parse(r.value) : null; } catch { return null; } };
    const win = sr('pairing_window');
    // runner nội bộ tự báo trạng thái (chỉ nhận từ kênh nội bộ). Ghi vào settings.runner_status khi trạng thái đổi hoặc sau 5 phút; còn lại chỉ nhớ lần thấy gần nhất trong bộ nhớ
    const st = url.searchParams.get('runner');
    if (chan === 'internal' && RUNNER_STATES.has(st)) {
      const msg = String(url.searchParams.get('msg') || '').replace(/[^\w .,:()\-/]/g, '').slice(0, 120), cur = sr('runner_status');
      ctx.runnerSeenAt = Date.now();
      if (!cur || cur.state !== st || cur.message !== msg || Date.now() - Date.parse(cur.at) > 300e3) write(act('runner'), 'auth.runner_status', { state: st, message: msg });
    }
    return json(res, 200, { owner_exists: owner, window_open: !!(owner && chan !== 'public' && win && win.channel === chan && win.open_until > new Date().toISOString()) });
  }

  // ---- token ----
  async function token(req, res, chan) {
    if (lim.hit('tok:' + chan, ...limit('token', chan))) return json(res, 429, oerrBody('temporarily_unavailable', 'Quá nhiều yêu cầu.'), { 'Retry-After': '30' });
    const b = await readParams(req);
    let resource;
    if (b.resource) { resource = canonRes(b.resource); if (!resource) return json(res, 400, oerrBody('invalid_target', 'resource không phải tài nguyên /mcp của máy chủ này.')); }
    const audience = serverId();
    try {
      let r;
      const gt = b.grant_type;
      if (gt === 'authorization_code') r = write(act(str(b.client_id)), 'auth.exchange', { grant: 'code', code: str(b.code), client_id: str(b.client_id), redirect_uri: str(b.redirect_uri), code_verifier: str(b.code_verifier, 200), resource, scope: str(b.scope, 200), audience });
      else if (gt === 'refresh_token') r = write(act(str(b.client_id)), 'auth.refresh', { refresh_token: str(b.refresh_token), client_id: str(b.client_id), scope: str(b.scope, 200), audience });
      else if (gt === DEVICE_GRANT) {
        const dc = str(b.device_code, 300);
        const key = secrets.hashToken(dc), now = Date.now(), prev = polls.get(key);
        if (prev && now - prev.t < prev.ms) { prev.ms += baseMs(); prev.t = now; return json(res, 400, oerrBody('slow_down', 'Hỏi quá dày; hãy tăng khoảng cách giữa các lần hỏi.')); }
        if (polls.size > 2000) polls.delete(polls.keys().next().value);
        polls.set(key, { t: now, ms: prev ? prev.ms : baseMs() });
        r = write(act(str(b.client_id)), 'auth.exchange', { grant: 'device', device_code: dc, client_id: str(b.client_id), scope: str(b.scope, 200), audience });
      } else return json(res, 400, oerrBody('unsupported_grant_type', 'grant_type không được hỗ trợ.'));
      if (r.error) return json(res, 400, oerrBody(r.error, r.error_description));
      return json(res, 200, r);
    } catch (e) { return mapError(res, e); }
  }

  const owns = p => PATHS.has(p);
  async function handle(req, res, url) {
    const p = url.pathname, ing = ingress(req);
    if (typeof ing === 'object') {
      // bí mật ghép sai: từ chối và ghi nhật ký (có giới hạn để không bị spam nhật ký); không bao giờ ghi giá trị header
      if (!lim.hit('badsec', 20, 3600e3)) write(act(), 'auth.bad_secret', { path: p, ip: ipOf(req) });
      return json(res, 403, oerrBody('access_denied', 'Bí mật ghép không đúng.'));
    }
    const chan = ing;
    // Host phải nằm trong danh sách cho phép (gồm studio:7490): issuer/URL chỉ tính từ Host hợp lệ
    const base = baseUrl(req);
    if (!base) { if (req.method === 'GET') return plain(res, 403, 'Host không được phép. Thêm vào GS_ALLOWED_HOSTS nếu truy cập qua địa chỉ khác.'); return json(res, 403, oerrBody('invalid_request', 'Host không được phép.')); }
    if (p.startsWith('/.well-known/')) { if (req.method !== 'GET') return plain(res, 405, 'Dùng GET.'); return metadata(req, res, url, base); }
    if (p === '/oauth/authorize') { if (req.method !== 'GET') return plain(res, 405, 'Dùng GET.'); return authorize(req, res, url, chan); }
    if (p === '/oauth/pairing-status') { if (req.method !== 'GET') return plain(res, 405, 'Dùng GET.'); return pairingStatus(req, res, url, chan); }
    if (req.method !== 'POST') return plain(res, 405, 'Dùng POST.');
    try {
      if (p === '/oauth/register') return await register(req, res, chan);
      if (p === '/oauth/device') return await device(req, res, chan, base);
      return await token(req, res, chan);
    } catch (e) {
      if (e && e.code === 'payload_too_large') return json(res, 413, oerrBody('invalid_request', e.text_human));
      if (e && e.code === 'invalid') return json(res, 400, oerrBody('invalid_request', e.text_human));
      throw e;
    }
  }
  return { owns, handle, baseUrl, serverId, metadataUrl, ingress };
}

module.exports = { create };
