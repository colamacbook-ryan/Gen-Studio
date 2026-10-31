// © 2026 Gen Labs — All rights reserved.
// REST /api/* (ARCHITECTURE §5): phiên cookie + CSRF, mọi ghi qua write(), review chỉ qua phiên UI.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const auth = require('./auth.js');
const secrets = require('./secrets.js');
const grids = require('./grids.js');
const events = require('./events.js');
const state = require('./state.js');
const { isLoopbackUri } = require('./write.js');
const aspects = require('../render/aspects.js');

const J = grids.J;
const STATUS = { invalid: 400, unauthorized: 401, forbidden: 403, not_found: 404, conflict: 409, rate_limited: 429, master_key_mismatch: 500, payload_too_large: 413, bad_gateway: 502,
  aspect_unsupported: 400, aspect_kind_unsupported: 400, aspect_mismatch: 409 };   // F7: lỗi tỉ lệ có mã riêng (text_human tiếng Việt)

// Lỗi → {code, text_human, detail} (không stack trace cho người dùng)
function errBody(e) {
  const code = e && e.code && STATUS[e.code] ? e.code : 'internal';
  if (code === 'internal') {
    events.logError('internal error', e);
    return { status: 500, body: { error: { code, text_human: 'Có lỗi nội bộ. Xem nhật ký máy chủ để biết chi tiết.', detail: events.mask(e && e.message) } } };
  }
  return { status: STATUS[code], body: { error: { code, text_human: e.text_human || e.message, detail: e.detail === undefined ? null : e.detail } } };
}
function fail(code, text, detail) { const e = new Error(text); e.code = code; e.text_human = text; e.detail = detail === undefined ? null : detail; return e; }

function send(res, status, obj, headers) {
  const b = Buffer.from(JSON.stringify(obj));
  res.writeHead(status, Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': b.length, 'Cache-Control': 'no-store' }, headers));
  res.end(b);
}
function readBody(req, limit = 2 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = []; let n = 0;
    req.on('data', c => { n += c.length; if (n > limit) { reject(fail('payload_too_large', 'Nội dung gửi lên quá lớn.')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
async function readJson(req, limit) {
  const b = await readBody(req, limit);
  if (!b.length) return {};
  try { const v = JSON.parse(b.toString('utf8')); return v && typeof v === 'object' ? v : {}; } catch { throw fail('invalid', 'Nội dung gửi lên không phải JSON hợp lệ.'); }
}

// ---------- view dùng chung (api + mcp) ----------
function byRef(db, table, ref, extra = '') {
  return db.json(db.get('SELECT * FROM ' + table + ' WHERE workspace_id=? AND (display_id=? OR id=?)' + extra, db.ws, String(ref), String(ref)));
}
function need(db, table, ref, what, extra) {
  const r = byRef(db, table, ref, extra);
  if (!r) throw fail('not_found', 'Không tìm thấy ' + what + ' "' + ref + '".');
  return r;
}
const { gatesFor } = require('../media/gates/index.js');
// Danh sách cổng của một Render = cổng áp cho loại bài + dữ liệu bài (media/gates GATES, SPEC §2.5), theo thứ tự GATES; cổng chưa chạy = 'pending'.
// Cổng đã có kết quả nhưng không còn nằm trong danh sách áp (bài đổi loại) vẫn được hiện ở cuối để không giấu kết quả.
function latestGates(db, render) {
  const lv = db.get('SELECT kind, thumbnail FROM lesson_versions WHERE id=?', render.lesson_version_id) || {};
  const ids = gatesFor(lv.kind, lv);
  const m = {};
  db.all("SELECT * FROM gate_results WHERE subject_kind='render' AND subject_id=? ORDER BY created_at, rowid", render.id)
    .forEach(g => { m[g.gate] = db.json(g); });
  return ids.concat(Object.keys(m).filter(g => !ids.includes(g))).map(g => m[g] ? { gate: g, result: m[g].result, measure: m[g].measure, attempt: m[g].attempt } : { gate: g, result: 'pending', measure: null, attempt: 0 });
}
function assetUrl(db, ref) {
  if (!ref) return null;
  const a = db.get('SELECT id, display_id FROM assets WHERE id=? OR display_id=?', ref, ref);
  return a ? '/media/' + a.display_id : null;
}
function reviewNotes(db, render) {
  return db.all('SELECT rv.display_id AS review, rv.decision, n.pin_kind, n.pin_ref, n.at_ms, n.text FROM review_notes n JOIN reviews rv ON rv.id=n.review_id WHERE rv.render_id=? ORDER BY rv.created_at, n.rowid', render.id);
}
// mã nhân vật trong plan → tên hiển thị (UI không hiện mã thô CM-…)
function castNames(db, plan) {
  const ids = [...new Set(((plan && plan.lines) || []).map(l => l.who).filter(Boolean))];
  const out = {};
  for (const id of ids) { const m = db.get('SELECT name FROM cast_members WHERE display_id=? OR id=?', id, id); if (m) out[id] = m.name; }
  return out;
}
function renderView(db, r) {
  const lv = db.get('SELECT lv.version, lv.work_order_id, lv.kind, lv.aspect, l.display_id AS lesson, l.title FROM lesson_versions lv JOIN lessons l ON l.id=lv.lesson_id WHERE lv.id=?', r.lesson_version_id) || {};
  const outputs = r.outputs || {};
  const media = { asset_id: null };
  Object.keys(outputs).forEach(k => {
    if (k === 'thumbs' && Array.isArray(outputs[k])) {   // 0.2.0: outputs.thumbs = [{variant, w1280, w1920, pass, score}] → URL từng ảnh
      media.thumbs = outputs[k].map(x => ({ variant: x.variant, pass: x.pass, score: x.score, w1280: assetUrl(db, x.w1280), w1920: assetUrl(db, x.w1920) }));
      return;
    }
    if (typeof outputs[k] !== 'string') return;
    const u = assetUrl(db, outputs[k]); media[k] = u; if (k === 'mp4' && u) media.asset_id = u.replace('/media/', '');
  });
  const manifest = r.manifest || null;
  // F7 §3.6: tỉ lệ + cỡ + khung bìa + độ vừa từng nền tảng. Bài cũ (aspect NULL, manifest cũ) = 16:9.
  const aspect = (manifest && manifest.aspect) || lv.aspect || '16:9';
  const ag = aspects.get(aspect);
  const size = (manifest && manifest.size) || (ag && ag.size) || null;
  if (typeof outputs.cover_frame_ms === 'number') media.cover_frame_ms = outputs.cover_frame_ms;
  const durMs = Number.isFinite(r.duration_ms) ? r.duration_ms : (manifest && manifest.plan && manifest.plan.duration_ms);
  return {
    fit: aspects.fit(aspect, Number.isFinite(durMs) ? durMs / 1000 : undefined),
    render: {
      aspect, size,
      display_id: r.display_id, state: r.state, version: lv.version, lesson_display_id: lv.lesson, lesson_title: lv.title,
      state_changed_at: r.state_changed_at, waiting_until: r.waiting_until, blocked_reason: r.blocked_reason || null,
      progress: r.progress, duration_ms: r.duration_ms, frames: r.frames, kind: lv.kind || 'lesson',
      awaiting_review_at: r.awaiting_review_at || null, thumbnail_pick: r.thumbnail_pick || null,
    },
    manifest, plan: manifest && manifest.plan ? manifest.plan : null, cast: castNames(db, manifest && manifest.plan),
    gates: latestGates(db, r), notes: reviewNotes(db, r), outputs, media,
  };
}
function lessonDoc(db, lesson, version) {
  const lv = db.json(db.get('SELECT * FROM lesson_versions WHERE lesson_id=? AND version=?', lesson.id, version || lesson.current_version));
  if (!lv) throw fail('not_found', 'Bài ' + lesson.display_id + ' không có version ' + version + '.');
  const lines = db.all('SELECT ln.*, cm.display_id AS who_display, cm.name AS who_name FROM lines ln LEFT JOIN cast_members cm ON cm.id=ln.cast_member_id WHERE ln.lesson_version_id=? ORDER BY ln.ord', lv.id);
  const beats = db.all('SELECT * FROM beats WHERE lesson_version_id=? ORDER BY ord', lv.id);
  // cột mở rộng 0003 (kind luôn có; thumbnail/variant/screens/host/music chỉ khi khác rỗng) — update_lesson/UI đọc lại đúng bản đã nộp
  const extra = { kind: lv.kind || 'lesson' };
  if (lv.aspect != null) extra.aspect = lv.aspect;   // F7: chỉ khi đã ghi (bài cũ NULL = 16:9)
  for (const k of ['variant', 'thumbnail', 'screens', 'host', 'music']) if (lv[k] != null) extra[k] = J(lv[k]);
  return {
    ...extra, version: lv.version, state: lv.state, note: lv.note, camera_hints: J(lv.camera_hints), work_order_id: lv.work_order_id, submitted_by: lv.submitted_by, created_at: lv.created_at,
    lines: lines.map(l => ({ id: l.display_id, who: l.who_display, who_name: l.who_name, say: l.say, lang: l.lang, terms: J(l.terms_declared) || [], subtitle: J(l.subtitle) || null, mood: l.mood })),
    beats: beats.map(b => ({ id: b.display_id, block: b.block_type, block_version: b.block_version, params: J(b.params), anchor: { line: b.anchor_line_display_id, word_index: b.anchor_word_index }, asset_ids: J(b.asset_ids) || [] })),
  };
}

// Yêu cầu cấp quyền → dạng gửi lên UI (không bao giờ có device_code/code/token). Mã ghép của thiết bị NGOÀI không được hiện cho chủ xưởng:
// chủ xưởng phải tự gõ mã thiết bị đang in ra (needs_code), không chọn từ danh sách.
function authRequestView(db, r) {
  let host = null;
  if (r.redirect_uri) { try { host = new URL(r.redirect_uri).host; } catch { host = null; } }
  const loopback = !!r.redirect_uri && isLoopbackUri(r.redirect_uri);
  const expired = r.status === 'pending' && r.expires_at < new Date().toISOString();
  const cl = r.client_id ? db.get('SELECT created_at FROM oauth_clients WHERE client_id=?', r.client_id) : null;
  const internal = r.kind === 'device' && r.channel === 'internal';
  return {
    id: r.display_id, kind: r.kind, client_name: r.client_name, agent_kind: internal ? 'internal' : 'oauth', needs_code: r.kind === 'device' && !internal,
    scopes_requested: r.scopes_requested || [], scopes_granted: r.scopes_granted || null, redirect_host: host, loopback,
    needs_confirm: r.kind === 'oauth' && !loopback,   // mọi redirect không phải loopback (kể cả claude.ai): hỏi "bạn vừa tự bấm kết nối?"
    channel: r.channel, source_ip: r.source_ip, registered_at: cl ? cl.created_at : null,
    status: expired ? 'expired' : r.status, created_at: r.created_at, expires_at: r.expires_at,
  };
}
const pendingAuth = db => db.all("SELECT * FROM auth_requests WHERE workspace_id=? AND status='pending' AND expires_at>=? ORDER BY created_at DESC", db.ws, new Date().toISOString()).map(r => authRequestView(db, db.json(r)));
const settingVal = (db, key) => { const r = db.get('SELECT value FROM settings WHERE workspace_id=? AND key=?', db.ws, key); try { return r ? JSON.parse(r.value) : null; } catch { return null; } };

// ---------- tuyến ----------
function create(ctx) {
  const { db, write, config } = ctx;
  const routes = [];
  const add = (method, pattern, opts, fn) => {
    const keys = [];
    const re = new RegExp('^' + pattern.replace(/:([a-z_]+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '/?$');
    routes.push({ method, re, keys, opts, fn, src: pattern });
  };
  const secure = (req) => req.socket.encrypted || req.headers['x-forwarded-proto'] === 'https' || /^https:/.test(config.publicUrl || '');
  const cookie = (req, token, maxAge) => 'gs_sess=' + encodeURIComponent(token) + '; HttpOnly; SameSite=Strict; Path=/; Max-Age=' + maxAge + (secure(req) ? '; Secure' : '');
  const userActor = u => ({ type: 'user', id: u.id, role: u.role, entry: 'ui' });
  const actorOf = c => userActor(c.sess.user);

  function session(req) { return auth.getSession(db, auth.parseCookies(req).gs_sess); }
  function sameOrigin(req) {
    const o = req.headers.origin;
    if (!o) return null;
    try { return new URL(o).host.toLowerCase() === String(req.headers.host || '').toLowerCase(); } catch { return false; }
  }

  // ---- thiết lập + đăng nhập ----
  add('GET', '/api/setup/state', { pub: true }, async () => {
    const owner = auth.ownerExists(db);
    if (!owner) {   // link thiết lập chết sau 30 phút → sinh khoá mới và in link ra stdout (cùng khuôn với lúc khởi động)
      const k = auth.renewAdminKey(config.dataDir, db);
      if (k.created) events.log(`Thiết lập lần đầu (link dùng một lần, 30 phút): ${config.publicUrl || `http://localhost:${config.hostPort || ctx.port}`}/?k=${k.key}`);
    }
    const w = db.get('SELECT name, locale FROM workspaces WHERE id=?', db.ws);
    return { owner, needs_owner: !owner, needs_setup: !owner, lang: config.lang, workspace: w };
  });
  add('POST', '/api/setup/owner', { pub: true }, async c => {
    if (auth.ownerExists(db)) throw fail('conflict', 'Đã có chủ xưởng; không thiết lập lại được.');
    if (!auth.checkAdminKey(config.dataDir, c.url.searchParams.get('k'))) throw fail('forbidden', 'Link thiết lập không đúng hoặc đã hết hạn (30 phút). Chạy `genstudio open` hoặc đọc run/admin-key để lấy link mới.');
    const u = auth.createOwner(db, Object.assign({}, c.body, { locale: c.body.lang || c.body.locale }));
    auth.consumeAdminKey(config.dataDir);
    const s = auth.createSession(db, u.id, { ua: c.req.headers['user-agent'], ip: c.req.socket.remoteAddress });
    return { status: 201, headers: { 'Set-Cookie': cookie(c.req, s.token, s.maxAgeSec) }, body: meBody(u, s.csrf) };
  });
  add('POST', '/api/login', { pub: true }, async c => {
    const ip = c.req.socket.remoteAddress || '?';
    const uname = c.body && c.body.username;
    if (auth.loginThrottled(ip, uname)) throw fail('rate_limited', 'Đăng nhập sai quá nhiều lần. Thử lại sau vài phút.');
    const u = auth.checkLogin(db, c.body.username, c.body.password);
    if (!u) { auth.loginFailed(ip, uname); throw fail('unauthorized', 'Sai tên đăng nhập hoặc mật khẩu.'); }
    auth.loginOk(ip, uname);
    const s = auth.createSession(db, u.id, { ua: c.req.headers['user-agent'], ip });
    return { headers: { 'Set-Cookie': cookie(c.req, s.token, s.maxAgeSec) }, body: meBody(u, s.csrf) };
  });
  add('POST', '/api/logout', { sess: true }, async c => {
    auth.destroySession(db, auth.parseCookies(c.req).gs_sess);
    return { headers: { 'Set-Cookie': cookie(c.req, '', 0) }, body: { ok: true } };
  });
  function meBody(u, csrf) {
    const w = db.get('SELECT name, locale, timezone FROM workspaces WHERE id=?', db.ws);
    return { user: { id: u.display_id, username: u.username, display_name: u.display_name, role: u.role, lang: u.locale }, csrf, workspace: w };
  }
  add('GET', '/api/me', { sess: true }, async c => meBody(c.sess.user, c.sess.csrf));
  // Đổi mật khẩu của chính người dùng đang đăng nhập (brief Gen 31/10/2026) — op user.change_password (server/ops/account.js) kiểm mật khẩu hiện tại + mật khẩu mới.
  const pwLimiter = auth.limiter();
  add('POST', '/api/me/password', { sess: true, ui: true, strictOrigin: true }, async c => {
    if (pwLimiter.hit('pw:' + c.sess.tokenHash, 8, 300e3)) throw fail('rate_limited', 'Đổi mật khẩu sai quá nhiều lần. Thử lại sau vài phút.');
    write(actorOf(c), 'user.change_password', Object.assign({}, c.body, { keep_token_hash: c.sess.tokenHash }));
    return { ok: true };
  });

  // ---- lưới (tổng quan: server/routes/overview.js) ----
  add('GET', '/api/grid/:name', { sess: true }, async c => grids.runGrid(db, c.params.name, { q: c.url.searchParams.get('q'), sort: c.url.searchParams.get('sort'), limit: c.url.searchParams.get('limit') }));

  // ---- bài + render ----
  add('GET', '/api/lessons/:id', { sess: true }, async c => {
    const l = need(db, 'lessons', c.params.id, 'bài học');
    const versions = db.all('SELECT version, state, note, work_order_id, submitted_by, created_at FROM lesson_versions WHERE lesson_id=? ORDER BY version', l.id);
    const v = Number(c.url.searchParams.get('version')) || l.current_version;
    const doc = lessonDoc(db, l, v);
    const renders = db.all('SELECT r.display_id, r.state, r.progress, r.duration_ms, r.state_changed_at, lv.version FROM renders r JOIN lesson_versions lv ON lv.id=r.lesson_version_id WHERE lv.lesson_id=? ORDER BY r.created_at', l.id);
    const wos = db.all('SELECT w.display_id, w.kind, w.state, a.display_id AS agent FROM work_orders w LEFT JOIN agents a ON a.id=w.agent_id WHERE w.lesson_id=? OR w.id IN (SELECT work_order_id FROM lesson_versions WHERE lesson_id=?) ORDER BY w.opened_at', l.id, l.id);
    const ch = db.get('SELECT display_id, name FROM channels WHERE id=?', l.channel_id);
    const cu = l.curriculum_node_id ? db.get('SELECT display_id, title FROM curriculum_nodes WHERE id=?', l.curriculum_node_id) : null;
    return { lesson: { display_id: l.display_id, title: l.title, current_version: l.current_version, channel: ch, node: cu }, versions,
      lines: doc.lines, beats: doc.beats, camera_hints: doc.camera_hints, version: v, renders, lineage: { work_orders: wos } };
  });
  add('GET', '/api/renders/:id', { sess: true }, async c => renderView(db, need(db, 'renders', c.params.id, 'bản dựng')));
  add('POST', '/api/renders/:id/review', { sess: true, ui: true, strictOrigin: true }, async c => {
    const r = need(db, 'renders', c.params.id, 'bản dựng');
    const b = c.body;
    if (!['approved', 'changes_requested', 'rejected'].includes(b.decision)) throw fail('invalid', 'Quyết định không hợp lệ (approved | changes_requested | rejected).');
    const notes = Array.isArray(b.notes) ? b.notes : [];
    if (b.decision === 'changes_requested' && !notes.length) throw fail('invalid', 'Yêu cầu sửa cần ít nhất một ghi chú ghim.');
    const secs = b.review_seconds == null ? null : Math.max(0, Math.round(Number(b.review_seconds)));
    const rv = state.review(db, { user: userActor(c.sess.user), renderId: r.id, decision: b.decision, notes, reviewSeconds: Number.isFinite(secs) ? secs : null, entry: 'ui' });
    return { status: 201, body: { review: rv } };
  });
  add('POST', '/api/renders/:id/export', { sess: true }, async c => {
    const r = need(db, 'renders', c.params.id, 'bản dựng');
    const ex = ctx.pipeline.exportRender(ctx, r, { actor: actorOf(c), entry: 'ui' });
    return Object.assign({ path: ex.dir }, ex);
  });
  add('POST', '/api/renders/:id/retry', { sess: true }, async c => {
    const r = need(db, 'renders', c.params.id, 'bản dựng');
    return { render: ctx.pipeline.requeueRender(ctx, r, { actor: 'user' }) };
  });

  // ---- cấu hình ----
  add('POST', '/api/providers', { sess: true }, async c => {
    const b = Object.assign({}, c.body);
    if (b.id && !b.provider) b.provider = b.id;
    const pv = write(actorOf(c), 'provider.save', b);
    return { status: 201, body: { display_id: pv.display_id, provider: pv } };
  });
  add('POST', '/api/providers/:id/scan', { sess: true }, async c => ctx.pipeline.scanProvider(ctx, need(db, 'providers', c.params.id, 'nhà cung cấp'), actorOf(c)));
  // ---- duyệt quyền agent (A3, R2b): chỉ phiên UI của chủ xưởng; token agent → 403 ----
  const lookups = auth.limiter();
  add('GET', '/api/auth-requests', { sess: true }, async () => ({ requests: pendingAuth(db) }));
  // chủ xưởng gõ mã ghép của thiết bị ngoài → tìm yêu cầu tương ứng (không liệt kê, không điền sẵn)
  add('POST', '/api/auth-requests/lookup', { sess: true, ui: true, strictOrigin: true }, async c => {
    if (lookups.hit('lk:' + c.sess.tokenHash, 10, 60e3)) throw fail('rate_limited', 'Tra mã quá nhiều lần. Thử lại sau một phút.');
    const code = String(c.body.user_code || '').trim().toUpperCase();
    const r = db.json(db.get("SELECT * FROM auth_requests WHERE workspace_id=? AND kind='device' AND status='pending' AND expires_at>=? AND user_code_hash=?", db.ws, new Date().toISOString(), secrets.hashToken(code)));
    if (!r) throw fail('not_found', 'Không có yêu cầu ghép nào khớp mã này (có thể đã hết hạn hoặc cửa sổ ghép chưa mở).');
    return { request: authRequestView(db, r) };
  });
  add('GET', '/api/auth-requests/:id', { sess: true }, async c => {
    const r = db.json(db.get('SELECT * FROM auth_requests WHERE workspace_id=? AND (id=? OR display_id=?)', db.ws, c.params.id, c.params.id));
    if (!r) throw fail('not_found', 'Không tìm thấy yêu cầu cấp quyền.');
    return { request: authRequestView(db, r) };
  });
  add('POST', '/api/auth-requests/deny-all', { sess: true, ui: true, strictOrigin: true }, async c => ({ ok: true, denied: write(actorOf(c), 'auth.deny_all', {}).denied }));
  add('POST', '/api/auth-requests/:id/approve', { sess: true, ui: true, strictOrigin: true }, async c => {
    const r = write(actorOf(c), 'auth.approve', { id: c.params.id, scopes: c.body.scopes, user_code: c.body.user_code, confirm: c.body.confirm === true });
    return { ok: true, redirect: r.redirect || null, agent: r.agent };
  });
  add('POST', '/api/auth-requests/:id/deny', { sess: true, ui: true, strictOrigin: true }, async c => {
    const r = write(actorOf(c), 'auth.deny', { id: c.params.id });
    return { ok: true, redirect: r.redirect || null };
  });
  // "Bật agent nội bộ" / "Mở lại ghép": mở cửa sổ ghép 10 phút (runner hỏi /oauth/pairing-status rồi tự xin mã)
  add('POST', '/api/pairing/open', { sess: true, ui: true, strictOrigin: true }, async c => ({ ok: true, open_until: write(actorOf(c), 'auth.pairing_open', { channel: c.body.channel }).open_until }));
  add('GET', '/api/runner-status', { sess: true }, async () => {
    const rs = settingVal(db, 'runner_status'), win = settingVal(db, 'pairing_window');
    return { runner: rs && { state: rs.state, code: rs.code || '', seen_at: rs.at, online: !!ctx.runnerSeenAt && Date.now() - ctx.runnerSeenAt < 90e3 },
      pairing: { open: !!(win && win.open_until > new Date().toISOString()), channel: win ? win.channel : null, open_until: win ? win.open_until : null } };
  });
  add('POST', '/api/agents', { sess: true }, async c => {
    const r = write(actorOf(c), 'agent.create', c.body);
    return { status: 201, body: { display_id: r.agent.display_id, token: r.token, agent: r.agent } };
  });
  add('POST', '/api/agents/:id/revoke', { sess: true }, async c => ({ result: write(actorOf(c), 'agent.revoke', { agent: c.params.id }) }));
  const firstChannel = () => { const ch = db.get('SELECT display_id FROM channels WHERE workspace_id=? AND deleted_at IS NULL ORDER BY created_at LIMIT 1', db.ws); return ch ? ch.display_id : null; };
  add('POST', '/api/work_orders', { sess: true }, async c => {
    const b = Object.assign({ kind: 'manual' }, c.body);
    if (!b.channel) b.channel = firstChannel();
    if (!b.brief) b.brief = b.summary;
    return { status: 201, body: { work_order: write(actorOf(c), 'work_order.create', b) } };
  });
  add('POST', '/api/work_orders/:id/cancel', { sess: true }, async c => ({ work_order: write(actorOf(c), 'work_order.cancel', { work_order: c.params.id }) }));
  add('POST', '/api/curriculum', { sess: true }, async c => {
    const b = Object.assign({}, c.body);
    if (!b.id && !b.channel) b.channel = firstChannel();
    return { status: 201, body: { node: write(actorOf(c), 'curriculum.save', b) } };
  });
  add('POST', '/api/channels', { sess: true }, async c => {
    const b = Object.assign({}, c.body);
    if (b.id && !b.channel) b.channel = b.id;
    if (b.lang && !b.lang_primary) b.lang_primary = b.lang;
    if (b.term_lang && !b.lang_terms) b.lang_terms = b.term_lang;
    if (b.schedule) b.data = Object.assign({}, b.data, { schedule: b.schedule });
    const ch = write(actorOf(c), b.channel ? 'channel.update' : 'channel.create', b);
    return { status: 201, body: { display_id: ch.display_id, channel: ch } };
  });
  add('GET', '/api/events', { sess: true, raw: true }, async c => { events.sse(ctx.events, c.req, c.res); return null; });

  // ---- Nạp route từ server/routes/*.js (SPEC-0.2.0 §2.4): register(add, rctx). Thứ tự theo tên file; module tên bắt đầu `_` không nạp.
  // Mỗi (method, pattern) chỉ được đăng ký MỘT lần — trùng ⇒ ném lỗi lúc khởi động (không có hai route trùng).
  const rctx = { ctx, db, write, config, actorOf, userActor, fail, need: (table, ref, what, extra) => need(db, table, ref, what, extra), J, send, readJson, firstChannel };
  // ctx.routesDirs: thư mục route phụ (test dựng module route tạm); mặc định chỉ server/routes
  for (const routesDir of [path.join(__dirname, 'routes'), ...(ctx.routesDirs || [])]) {
    if (!fs.existsSync(routesDir)) continue;
    for (const f of fs.readdirSync(routesDir).filter((x) => x.endsWith('.js') && !x.startsWith('_')).sort()) {
      const m = require(path.join(routesDir, f));
      if (typeof m.register !== 'function') continue;
      m.register((method, pattern, opts, fn) => {
        if (routes.some((r) => r.method === method && r.src === pattern)) throw new Error(`api: route trùng ${method} ${pattern} (routes/${f})`);
        add(method, pattern, opts, fn);
      }, rctx);
    }
  }

  // ---- bộ xử lý ----
  async function handle(req, res, url) {
    try {
      const route = routes.find(r => r.method === req.method && r.re.test(url.pathname));
      if (!route) {
        if (req.method === 'GET' && url.pathname === '/api/health') return send(res, 200, { ok: true, version: config.version });
        throw fail('not_found', 'Không có đường dẫn API này.');
      }
      const m = route.re.exec(url.pathname);
      const params = {}; route.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
      let sess = null;
      if (route.opts.sess) {
        sess = session(req);
        if (!sess) {
          // token agent không bao giờ thay được phiên UI: gọi review bằng token → 403 rõ ràng
          if (route.opts.ui && auth.bearer(req)) throw fail('forbidden', 'Thao tác này (duyệt bản dựng, duyệt quyền agent) chỉ làm được trên giao diện web bằng phiên đăng nhập của chủ xưởng; token agent không có quyền này.');
          throw fail('unauthorized', 'Cần đăng nhập.');
        }
      }
      const write_ = req.method !== 'GET' && req.method !== 'HEAD';
      if (write_) {
        const so = sameOrigin(req);
        if (so === false) throw fail('forbidden', 'Origin không khớp.');
        if (route.opts.strictOrigin && so !== true) throw fail('forbidden', 'Thiếu Origin hợp lệ.');
        if (sess && !auth.eq(req.headers['x-csrf'] || '', sess.csrf)) throw fail('forbidden', 'Thiếu hoặc sai CSRF token.');
      }
      const body = write_ ? await readJson(req) : {};
      const out = await route.fn({ req, res, url, params, body, sess });
      if (out === null) return;
      if (out && (out.body !== undefined || out.status || out.headers)) send(res, out.status || 200, out.body !== undefined ? out.body : {}, out.headers);
      else send(res, 200, out === undefined ? { ok: true } : out);
    } catch (e) {
      const { status, body } = errBody(e);
      if (!res.headersSent) send(res, status, body); else res.end();
    }
  }
  return { handle, session };
}

module.exports = { create, send, readBody, readJson, errBody, fail, renderView, lessonDoc, latestGates, byRef, need, reviewNotes };
