// © 2026 Gen Labs — All rights reserved.
// CỔNG GHI DUY NHẤT: whitelist op, kiểm quyền (DATABASE §6 / PRODUCT-SPEC §8.1), audit cùng tx, phát sự kiện.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { WriteError } = require('./db');
const { ulid } = require('./ids');
const state = require('./state');
const queue = require('./queue');
const secrets = require('./secrets');

// Danh sách khối nhận trong bài: lấy từ render/blocks/index.json qua registry (SPEC-0.2.0 §2.3). P0b sẽ bỏ hằng này và lọc theo `kinds` của bài.
const MVP_BLOCKS = require('../render/blocks/registry').names();
// Trường chính sách kênh — chỉ owner sửa (CNS-036)
const POLICY_FIELDS = ['schedule', 'loudness', 'subtitle_langs', 'limits', 'aspect', 'fps', 'publish', 'auto_publish'];
const ACTOR_TYPES = ['user', 'agent', 'assistant', 'system', 'cli', 'runner', 'client'];
const ENTRIES = ['ui', 'http', 'mcp', 'cli', 'runner', 'system', 'assistant', 'oauth'];
const ASSET_KINDS = ['svg', 'image', 'audio', 'video', 'subtitle', 'cover', 'logo', 'manifest'];
const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/svg+xml': 'svg', 'audio/wav': 'wav', 'audio/x-wav': 'wav',
  'video/mp4': 'mp4', 'text/plain': 'srt', 'application/x-subrip': 'srt', 'application/json': 'json' };
const LIMITS = { lines_max: 60, say_max_chars: 2000, beats_max: 400 };   // dùng chung với get_capabilities
const MAX_ASSET_BYTES = 200 * 1024 * 1024;

const err = (code, text, detail) => new WriteError(code, text, detail);

// ---- Duyệt quyền agent (OAuth 2.1 + ghép thiết bị) ----
const SCOPES = ['read', 'compose', 'run'];
const CODE_TTL_MS = 60e3, ACCESS_TTL_MS = 3600e3, REFRESH_TTL_MS = 30 * 86400e3, REQUEST_TTL_MS = 10 * 60e3, DEVICE_TTL_MS = 15 * 60e3, CLIENT_PENDING_MS = 3600e3;
const VENDORS = ['gemini']; // nhà cung cấp có adapter trong media/providers (fake chỉ bật qua config, không lưu DB)
const PAIRING_WINDOW_MS = 10 * 60e3, REFRESH_GRACE_MS = 30e3, PURGE_AFTER_MS = 7 * 86400e3;
// Trần yêu cầu/client đang chờ theo KÊNH VÀO, theo NGUỒN và theo client (CNS-066). Quá trần thì TỪ CHỐI yêu cầu mới (too_many_pending), không bao giờ đẩy bỏ yêu cầu cũ (kẻ flood sẽ xoá mất yêu cầu của chủ xưởng).
const PENDING_CHANNEL = { internal: 3, loopback: 10, public: 10 }, PENDING_SOURCE = { internal: 3, loopback: 10, public: 3 }, PENDING_CLIENT = 2;
const CLIENTS_CHANNEL = { internal: 30, loopback: 30, public: 30 }, CLIENTS_SOURCE = { internal: 30, loopback: 15, public: 5 };
const SELF_DECLARED = ' (tự khai)';
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]']);
const rnd = (prefix, n = 32) => prefix + crypto.randomBytes(n).toString('base64url');
const sha256 = (s) => secrets.hashToken(s);
const cleanName = (s, d) => { const v = String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s*\(tự khai\)\s*$/i, '').trim().slice(0, 80); return v || d; };
// scope "read compose" | mảng → {scopes, ignored}; scope lạ bị bỏ (và ghi vào nhật ký); rỗng → đủ ba (chủ xưởng sẽ hạ nếu muốn)
function parseScopes(v) {
  const a = Array.isArray(v) ? v : String(v == null ? '' : v).split(/[\s,]+/).filter(Boolean);
  const scopes = [...new Set(a.map(String).filter((x) => SCOPES.includes(x)))];
  return { scopes: scopes.length ? scopes : SCOPES.slice(), ignored: [...new Set(a.map(String).filter((x) => !SCOPES.includes(x)))] };
}
// redirect_uri hợp lệ khi đăng ký: https, hoặc http loopback (RFC 8252); không fragment/userinfo
function redirectUriOk(u) {
  let x;
  try { x = new URL(String(u)); } catch { return false; }
  if (x.hash || x.username || x.password || String(u).length > 500) return false;
  return x.protocol === 'https:' || (x.protocol === 'http:' && LOOPBACK.has(x.hostname));
}
// Khớp đúng chuỗi đã đăng ký; riêng loopback http cho phép đổi cổng (RFC 8252 §7.3)
function redirectMatches(registered, requested) {
  if (!Array.isArray(registered)) return false;
  if (registered.includes(requested)) return true;
  let r;
  try { r = new URL(requested); } catch { return false; }
  if (r.protocol !== 'http:' || !LOOPBACK.has(r.hostname)) return false;
  return registered.some((u) => { try { const x = new URL(u); return x.protocol === 'http:' && x.hostname === r.hostname && x.pathname === r.pathname && x.search === r.search; } catch { return false; } });
}
const isLoopbackUri = (u) => { try { const x = new URL(u); return x.protocol === 'http:' && LOOPBACK.has(x.hostname); } catch { return false; } };
const pkceOk = (verifier, challenge) => {
  if (!/^[A-Za-z0-9\-._~]{43,128}$/.test(String(verifier || ''))) return false;
  const h = crypto.createHash('sha256').update(String(verifier)).digest('base64url');
  const a = Buffer.from(h), b = Buffer.from(String(challenge || ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};
// Lỗi kèm mã OAuth (detail.oauth) để server/oauth.js đổi thành {error, error_description}
const oerr = (code, oauth, text) => err(code, text, { oauth });
const inter = (a, b) => (a || []).filter((x) => (b || []).includes(x));

const nonEmpty = (s) => typeof s === 'string' && s.trim().length > 0;

// Vị trí từ (0-based, tách theo khoảng trắng) của chuỗi `word` trong `say`; -1 nếu không là chuỗi con.
function anchorIndex(say, word) {
  if (!nonEmpty(word)) return -1;
  let off = say.indexOf(word);
  if (off < 0) off = say.toLowerCase().indexOf(word.toLowerCase());
  if (off < 0) return -1;
  const re = /\S+/g;
  let m;
  let i = 0;
  while ((m = re.exec(say))) {
    if (off >= m.index && off < m.index + m[0].length) return i;
    i++;
  }
  return -1;
}
const wordCount = (say) => (say.match(/\S+/g) || []).length;

function defaultValidateBlock(name, params) {
  if (!MVP_BLOCKS.includes(name)) return { ok: false, errors: [`Khối "${name}" không có trong danh sách khối MVP.`] };
  if (!params || typeof params !== 'object' || Array.isArray(params)) return { ok: false, errors: ['params phải là object.'] };
  return { ok: true, errors: [] };
}

function actorString(a) {
  return ['user', 'agent', 'runner', 'client'].includes(a.type) && a.id ? `${a.type}:${a.id}` : a.type;
}
function auditEntry(a) { return a.type === 'assistant' ? 'assistant' : a.entry; }

function createWriter(db, opts = {}) {
  const validateBlock = opts.validateBlock || defaultValidateBlock;
  if (opts.events) db.events = opts.events;
  const ws = () => db.ws;

  const byRef = (table, ref, { deleted = false } = {}) => {
    if (!ref) return undefined;
    const cols = db.columns(table);
    const del = !deleted && cols.has('deleted_at') ? ' AND deleted_at IS NULL' : '';
    return db.json(db.get(`SELECT * FROM ${table} WHERE workspace_id=? AND (id=? OR display_id=?)${del}`, ws(), ref, ref));
  };
  const need = (table, ref, what) => {
    const r = byRef(table, ref);
    if (!r) throw err('not_found', `Không tìm thấy ${what}.`, { ref: ref || null });
    return r;
  };

  // ---- Quyền ----
  const userRole = (a) => {
    if (a.role) return a.role;
    const u = db.get('SELECT role FROM users WHERE id=? AND deleted_at IS NULL', a.id);
    return u ? u.role : null;
  };
  const isOwner = (a) => a.type === 'user' && userRole(a) === 'owner';
  const agentHas = (a, scope) => {
    if (a.type !== 'agent' || !Array.isArray(a.scopes) || !a.scopes.includes(scope)) return false;
    const row = byRef('agents', a.id);
    return !(row && row.status === 'revoked');
  };
  const allow = {
    compose: (a) => isOwner(a) || agentHas(a, 'compose'),
    composeOrSystem: (a) => isOwner(a) || agentHas(a, 'compose') || a.type === 'system' || a.type === 'runner',
    run: (a) => isOwner(a) || agentHas(a, 'run') || a.type === 'system',
    owner: (a) => isOwner(a),
    ownerUi: (a) => isOwner(a) && a.entry === 'ui',   // duyệt quyền agent: chỉ phiên UI của chủ xưởng (R2b)
    system: (a) => a.type === 'system',
    oauth: (a) => a.type === 'client' && a.entry === 'oauth',   // /oauth/* không xác thực: chỉ vào được các op auth.register|request|exchange|refresh
    ownerOrCli: (a) => isOwner(a) || (a.type === 'cli' && a.entry === 'cli'),   // cấp token tay; CLI không bao giờ duyệt được (auth.approve là ownerUi)
    ownerOrSystem: (a) => isOwner(a) || a.type === 'system',
    suggest: (a) => isOwner(a) || a.type === 'assistant',
  };

  const checkPolicy = (a, data, top) => {
    if (a.type !== 'agent') return;
    const hit = POLICY_FIELDS.filter((k) => (data && k in data) || (top && k in top));
    if (hit.length) {
      throw err('forbidden', 'Trường chính sách của kênh (lịch, âm lượng, giới hạn…) chỉ chủ xưởng được sửa.', { fields: hit });
    }
  };

  const newVersion = (table, entityId, data, note, createdBy) => {
    const cur = db.get(`SELECT COALESCE(MAX(version),0) AS v FROM ${table} WHERE entity_id=?`, entityId).v;
    db.insertRow(table, { entity_id: entityId, version: cur + 1, data, note: note || null, created_by: createdBy });
    return cur + 1;
  };

  // ---- Các op ----
  const OPS = {};
  const op = (name, who, run) => { OPS[name] = { who, run }; };

  op('channel.create', 'compose', (c) => {
    const p = c.p;
    if (!nonEmpty(p.name)) throw err('invalid', 'Kênh cần có tên.', null);
    const data = p.data || {};
    checkPolicy(c.a, data, p);
    const row = db.insertRow('channels', { name: p.name, lang_primary: p.lang_primary || 'vi', lang_terms: p.lang_terms || 'en',
      current_version: 1, created_by: c.by }, { prefix: 'CH' });
    db.insertRow('channel_versions', { entity_id: row.id, version: 1, data, note: p.note || null, created_by: c.by });
    return { result: { ...row, version: 1 }, entity: ['channel', row.display_id], before: null, after: { name: row.name, data } };
  });

  op('channel.update', 'compose', (c) => {
    const p = c.p;
    const ch = need('channels', p.channel, 'kênh');
    const patch = p.data || {};
    checkPolicy(c.a, patch, p);
    const prev = db.json(db.get('SELECT data FROM channel_versions WHERE entity_id=? AND version=?', ch.id, ch.current_version));
    const data = { ...(prev ? prev.data : {}), ...patch };
    const v = newVersion('channel_versions', ch.id, data, p.note, c.by);
    const f = { current_version: v };
    for (const k of ['name', 'lang_primary', 'lang_terms']) if (p[k] !== undefined) f[k] = p[k];
    db.update('channels', ch.id, f, { rowVersion: p.row_version });
    return { result: { ...byRef('channels', ch.id), version: v }, entity: ['channel', ch.display_id],
      before: { version: ch.current_version, data: prev && prev.data }, after: { version: v, data } };
  });

  op('curriculum.save', 'compose', (c) => {
    const p = c.p;
    const f = {};
    for (const k of ['title', 'principle', 'status', 'ord']) if (p[k] !== undefined) f[k] = p[k];
    if (p.prereq !== undefined) f.prereq_ids = p.prereq;
    if (f.status && !['todo', 'in_progress', 'done'].includes(f.status)) throw err('invalid', 'Trạng thái giáo trình không hợp lệ.', null);
    if (f.status === 'done' && c.a.type === 'agent') throw err('forbidden', 'Agent chỉ đặt được todo/in_progress; đánh dấu done là việc của chủ xưởng.', { status: f.status });
    if (p.parent !== undefined) f.parent_id = p.parent ? need('curriculum_nodes', p.parent, 'mục cha').id : null;
    if (p.id) {
      const cu = need('curriculum_nodes', p.id, 'mục giáo trình');
      db.update('curriculum_nodes', cu.id, f, { rowVersion: p.row_version });
      return { result: byRef('curriculum_nodes', cu.id), entity: ['curriculum_node', cu.display_id], before: cu, after: f };
    }
    const ch = need('channels', p.channel, 'kênh');
    if (!nonEmpty(p.title)) throw err('invalid', 'Mục giáo trình cần có tiêu đề.', null);
    if (f.ord === undefined) f.ord = db.get('SELECT COALESCE(MAX(ord),0)+1 AS n FROM curriculum_nodes WHERE channel_id=?', ch.id).n;
    const row = db.insertRow('curriculum_nodes', { ...f, channel_id: ch.id, created_by: c.by }, { prefix: 'CU' });
    return { result: row, entity: ['curriculum_node', row.display_id], before: null, after: f };
  });

  op('cast.save', 'compose', (c) => {
    const p = c.p;
    if (!p.data || typeof p.data !== 'object') throw err('invalid', 'Nhân vật cần data (công thức Gen-Chibi).', null);
    let m = p.id ? need('cast_members', p.id, 'nhân vật') : null;
    if (!m) {
      const ch = need('channels', p.channel, 'kênh');
      if (!nonEmpty(p.name)) throw err('invalid', 'Nhân vật cần có tên.', null);
      m = db.insertRow('cast_members', { channel_id: ch.id, name: p.name, role_label: p.role_label || null, current_version: 0, created_by: c.by }, { prefix: 'CM' });
    }
    const v = newVersion('cast_versions', m.id, p.data, p.note, c.by);
    const f = { current_version: v };
    if (p.name !== undefined) f.name = p.name;
    if (p.role_label !== undefined) f.role_label = p.role_label;
    db.update('cast_members', m.id, f, { rowVersion: p.id ? p.row_version : undefined });
    return { result: { ...byRef('cast_members', m.id), version: v }, entity: ['cast_member', m.display_id], before: p.id ? { version: m.current_version } : null, after: { version: v } };
  });

  // SVG chỉ nhận theo DANH SÁCH CHO PHÉP (không phải danh sách cấm): thẻ hình học/chữ/gradient tĩnh, thuộc tính trình bày;
  // cấm thực thể (&#, <!ENTITY/<!DOCTYPE), animate/set/use/a/style/foreignObject, mọi on*, mọi href, url() ngoài #id.
  const SVG_TAGS = new Set(['svg', 'g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'text', 'tspan',
    'defs', 'lineargradient', 'radialgradient', 'stop', 'clippath', 'mask', 'title', 'desc']);
  const SVG_ATTRS = new Set(['xmlns', 'viewbox', 'width', 'height', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry',
    'd', 'points', 'transform', 'fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-linecap',
    'stroke-linejoin', 'stroke-dasharray', 'stroke-dashoffset', 'stroke-miterlimit', 'opacity', 'id', 'clip-path', 'clip-rule', 'mask',
    'offset', 'stop-color', 'stop-opacity', 'gradientunits', 'gradienttransform', 'spreadmethod', 'fx', 'fy', 'font-family', 'font-size',
    'font-weight', 'font-style', 'text-anchor', 'dominant-baseline', 'letter-spacing', 'dx', 'dy', 'preserveaspectratio', 'version',
    'aria-hidden', 'role', 'aria-label', 'vector-effect', 'paint-order', 'clippathunits', 'maskunits']);
  const svgOk = (buf) => {
    if (buf.length > 2 * 1024 * 1024) return false;   // SVG tối đa 2 MB — chặn tốn CPU khi quét
    const t = buf.toString('utf8');
    if (/&#|<!|<\?(?!xml\s)|&(?!(amp|lt|gt|quot|apos);)/i.test(t)) return false;
    const tagRe = /<\s{0,8}(\/?)\s{0,8}([a-zA-Z][\w:.-]{0,63})([^<>]{0,4096})>/g;
    let m, seen = 0;
    while ((m = tagRe.exec(t))) {
      seen++;
      if (!SVG_TAGS.has(m[2].toLowerCase())) return false;
      if (m[1]) continue;
      const attrRe = /([^\s=\/<>]{1,64})\s{0,8}=\s{0,8}("([^"]{0,4096})"|'([^']{0,4096})')/g;
      let a;
      const rest = m[3].replace(/\/\s*$/, '');
      const stripped = rest.replace(attrRe, '').trim();
      if (stripped) return false;
      while ((a = attrRe.exec(rest))) {
        const name = a[1].toLowerCase(), val = a[3] !== undefined ? a[3] : a[4];
        if (!SVG_ATTRS.has(name) && !name.startsWith('xmlns')) return false;
        if (/url\(\s*['"]?(?!#)/i.test(val) || /javascript:|data:/i.test(val)) return false;
      }
    }
    const lt = (t.match(/</g) || []).length;
    return seen > 0 && seen === lt;   // mọi '<' phải thuộc một thẻ đã kiểm (thẻ quá dài/không khớp → từ chối)
  };
  op('asset.put', 'composeOrSystem', (c) => {
    const p = c.p;
    if (!ASSET_KINDS.includes(p.kind)) throw err('invalid', 'Loại asset không hợp lệ.', { kind: p.kind });
    if (!Buffer.isBuffer(p.bytes) || !p.bytes.length) throw err('invalid', 'Asset không có dữ liệu.', null);
    if (p.bytes.length > MAX_ASSET_BYTES) throw err('invalid', 'Asset quá lớn.', { bytes: p.bytes.length });
    // Kiểm theo NỘI DUNG thật + mime, không tin `kind`: mọi thứ trông như SVG/XML/HTML phải là kind 'svg' và qua svgOk;
    // ảnh raster phải đúng magic bytes; kind và mime phải khớp nhau.
    const head = p.bytes.subarray(0, 512).toString('utf8').replace(/^\uFEFF/, '').trimStart();
    const looksMarkup = head.startsWith('<') || /svg|xml|html/i.test(String(p.mime || ''));
    const magic = (b) => (b[0] === 0x89 && b[1] === 0x50) ? 'image/png' : (b[0] === 0xff && b[1] === 0xd8) ? 'image/jpeg'
      : (b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP') ? 'image/webp'
      : (b.subarray(0, 3).toString() === 'GIF') ? 'image/gif' : null;
    if (looksMarkup) {
      if (p.kind !== 'svg' || (p.mime && p.mime !== 'image/svg+xml')) throw err('invalid', 'Tệp dạng SVG/XML phải khai kind "svg" và mime image/svg+xml.', { kind: p.kind, mime: p.mime || null });
      if (!svgOk(p.bytes)) throw err('invalid', 'SVG chứa thành phần không được phép (script, sự kiện, tham chiếu ngoài, animate, use, style, thực thể) nên bị từ chối.', null);
      p.mime = 'image/svg+xml';
    } else if (p.kind === 'svg') {
      throw err('invalid', 'Asset khai là SVG nhưng nội dung không phải SVG.', null);
    } else if (p.kind === 'image' || p.kind === 'cover' || p.kind === 'logo') {
      const real = magic(p.bytes);
      if (!real || (p.mime && p.mime !== real)) throw err('invalid', 'Ảnh không đúng định dạng PNG/JPEG/WEBP/GIF hoặc mime không khớp nội dung.', { mime: p.mime || null, detected: real });
      p.mime = real;
    }
    const sha = crypto.createHash('sha256').update(p.bytes).digest('hex');
    const existing = db.json(db.get('SELECT * FROM assets WHERE workspace_id=? AND sha256=?', ws(), sha));
    if (existing) {
      return { result: { ...existing, deduped: true }, entity: ['asset', existing.display_id], before: null, after: { sha256: sha, deduped: true } };
    }
    const ext = EXT[p.mime] || 'bin';
    const rel = path.join('media', sha.slice(0, 2), `${sha}.${ext}`);
    const abs = path.join(db.dataDir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    const tmp = `${abs}.tmp${process.pid}`;
    fs.writeFileSync(tmp, p.bytes);
    fs.renameSync(tmp, abs);
    const row = db.insertRow('assets', { kind: p.kind, sha256: sha, path: rel, bytes: p.bytes.length, mime: p.mime || null,
      meta: p.meta || null, media_present: 1, source: p.source === 'system' ? 'system' : 'upload', created_by: c.by }, { prefix: 'AS' });
    return { result: { ...row, deduped: false }, entity: ['asset', row.display_id], before: null, after: { sha256: sha, bytes: row.bytes, kind: row.kind } };
  });

  // ----- lesson.submit -----
  op('lesson.submit', 'compose', (c) => submitLesson(c));

  function submitLesson(c) {
    const p = c.p;
    const errors = [];
    const E = (path_, text) => errors.push({ path: path_, text });

    let lesson = p.lesson ? need('lessons', p.lesson, 'bài học') : null;
    const channel = lesson ? db.json(db.get('SELECT * FROM channels WHERE id=?', lesson.channel_id)) : byRef('channels', p.channel);
    if (!channel) throw err('not_found', 'Không tìm thấy kênh của bài.', { channel: p.channel || null });
    let node = null;
    if (p.curriculum_node) {
      node = byRef('curriculum_nodes', p.curriculum_node);
      if (!node || node.channel_id !== channel.id) E('curriculum_node', 'Mục giáo trình không tồn tại trong kênh này.');
    }
    if (!nonEmpty(p.title)) E('title', 'Bài cần có tiêu đề.');
    if (!Array.isArray(p.lines) || !p.lines.length) E('lines', 'Bài cần ít nhất một câu.');
    else if (p.lines.length > LIMITS.lines_max) E('lines', `Bài tối đa ${LIMITS.lines_max} câu (đang có ${p.lines.length}).`);
    if (!Array.isArray(p.beats)) E('beats', 'beats phải là mảng (có thể rỗng).');
    else if (p.beats.length > LIMITS.beats_max) E('beats', `Bài tối đa ${LIMITS.beats_max} nhịp (đang có ${p.beats.length}).`);
    if (p.camera_hints != null && typeof p.camera_hints !== 'object') E('camera_hints', 'camera_hints phải là object hoặc null.');
    let wo = null;
    if (p.work_order) {
      wo = byRef('work_orders', p.work_order);
      if (!wo) E('work_order', 'Không tìm thấy lệnh sản xuất.');
      else if (!['open', 'assigned'].includes(wo.state)) E('work_order', `Lệnh sản xuất ${wo.display_id} đã ${wo.state}, không nộp thêm được.`);
      else if (c.a.type === 'agent' && wo.agent_id) {
        // cùng kiểm như work_order.complete: agent chỉ nộp vào lệnh giao cho chính nó
        const ag = byRef('agents', c.a.id);
        if (!ag || ag.id !== wo.agent_id) throw err('forbidden', 'Lệnh này đã giao cho agent khác.', { work_order: wo.display_id });
      }
    }
    if (wo && wo.channel_id && wo.channel_id !== channel.id) E('work_order', `Lệnh ${wo.display_id} thuộc kênh khác.`);
    if (wo && wo.lesson_id && (!lesson || wo.lesson_id !== lesson.id)) E('work_order', `Lệnh ${wo.display_id} dành cho bài khác.`);
    const lines = Array.isArray(p.lines) ? p.lines : [];
    const beats = Array.isArray(p.beats) ? p.beats : [];

    const prev = lesson ? db.get('SELECT * FROM lesson_versions WHERE lesson_id=? ORDER BY version DESC LIMIT 1', lesson.id) : null;
    const taken = (table, id) => db.get(
      `SELECT 1 AS x FROM ${table} t JOIN lesson_versions lv ON lv.id=t.lesson_version_id WHERE t.display_id=? ${lesson ? 'AND lv.lesson_id!=?' : ''} LIMIT 1`,
      ...(lesson ? [id, lesson.id] : [id]));

    // ---- câu ----
    const lineIds = new Set();
    const cast = {};
    lines.forEach((l, i) => {
      const at = `lines[${i}]`;
      if (!l || typeof l !== 'object') { E(at, 'Câu không hợp lệ.'); return; }
      if (!nonEmpty(l.say)) E(`${at}.say`, 'Câu không có lời thoại.');
      else if (l.say.length > LIMITS.say_max_chars) E(`${at}.say`, `Lời thoại quá dài (tối đa ${LIMITS.say_max_chars} ký tự).`);
      if (l.lang !== undefined && !['vi', 'en'].includes(l.lang)) E(`${at}.lang`, 'lang phải là vi hoặc en.');
      if (l.terms !== undefined && !(Array.isArray(l.terms) && l.terms.every((t) => typeof t === 'string'))) E(`${at}.terms`, 'terms phải là mảng chuỗi.');
      if (l.subtitle != null && (typeof l.subtitle !== 'object' || Array.isArray(l.subtitle))) E(`${at}.subtitle`, 'subtitle phải là object.');
      const m = byRef('cast_members', l.who);
      if (!m || m.channel_id !== channel.id) E(`${at}.who`, `Nhân vật "${l.who}" không thuộc kênh này.`);
      else cast[i] = m;
      if (l.id) {
        if (!/^LN-\d{4,}$/.test(l.id)) E(`${at}.id`, 'id câu phải dạng LN-0001.');
        else if (lineIds.has(l.id)) E(`${at}.id`, `id ${l.id} bị trùng trong bài.`);
        else if (taken('lines', l.id)) E(`${at}.id`, `id ${l.id} đang thuộc bài khác.`);
        else lineIds.add(l.id);
      }
    });
    const beatIdsSeen = new Set();
    beats.forEach((b, i) => { if (b && b.id) { if (beatIdsSeen.has(b.id)) E(`beats[${i}].id`, `id ${b.id} bị trùng.`); else if (!/^BT-\d{4,}$/.test(b.id)) E(`beats[${i}].id`, 'id nhịp phải dạng BT-0001.'); else if (taken('beats', b.id)) E(`beats[${i}].id`, `id ${b.id} đang thuộc bài khác.`); else beatIdsSeen.add(b.id); } });

    // cấp id: giữ id đã cho, bỏ trống thì cấp mới (bump bộ đếm trước để không đụng)
    for (const id of lineIds) db.bumpCounter(ws(), id);
    for (const id of beatIdsSeen) db.bumpCounter(ws(), id);
    if (!errors.length) {
      lines.forEach((l) => { if (!l.id) l.id = db.nextDisplayId(ws(), 'LN'); lineIds.add(l.id); });
    }
    const lineByIdx = lines;

    // ---- nhịp ----
    const beatRows = [];
    beats.forEach((b, i) => {
      const at = `beats[${i}]`;
      if (!b || typeof b !== 'object') { E(at, 'Nhịp không hợp lệ.'); return; }
      const res = validateBlock(b.block, b.params);
      if (!res || !res.ok) E(`${at}.block`, `Khối "${b.block}" sai: ${((res && res.errors) || ['không hợp lệ']).join('; ')}`);
      const a = b.anchor;
      if (!a || typeof a !== 'object') { E(`${at}.anchor`, 'Mỗi nhịp bắt buộc có neo (anchor).'); return; }
      let line = null;
      if (typeof a.line === 'number') line = lineByIdx[a.line];
      else if (typeof a.line === 'string') line = lineByIdx.find((l) => l.id === a.line);
      if (!line) { E(`${at}.anchor.line`, 'Neo trỏ tới câu không có trong bài.'); return; }
      let idx = -1;
      if (a.word !== undefined && a.word !== null && a.word !== '') {
        idx = anchorIndex(line.say || '', a.word);
        if (idx < 0) { E(`${at}.anchor.word`, `Từ neo "${a.word}" không nằm trong lời thoại của câu ${line.id}.`); return; }
        if (a.word_index !== undefined && a.word_index !== idx) { E(`${at}.anchor`, 'word và word_index mâu thuẫn nhau.'); return; }
      } else if (Number.isInteger(a.word_index)) {
        idx = a.word_index;
        if (idx < 0 || idx >= wordCount(line.say || '')) { E(`${at}.anchor.word_index`, 'word_index nằm ngoài câu.'); return; }
      } else { E(`${at}.anchor`, 'Neo cần word (chuỗi con của lời thoại) hoặc word_index.'); return; }
      beatRows.push({ b, line, idx, version: (res && res.version) || 1 });
    });

    if (errors.length) {
      const head = errors.slice(0, 3).map((e) => `${e.path}: ${e.text}`).join(' | ');
      throw err('invalid', `Bài nộp có ${errors.length} lỗi. ${head}`, { errors });
    }
    beatRows.forEach((r) => { if (!r.b.id) r.b.id = db.nextDisplayId(ws(), 'BT'); });

    // ---- ghi ----
    const isNew = !lesson;
    if (isNew) {
      lesson = db.insertRow('lessons', { channel_id: channel.id, curriculum_node_id: node ? node.id : null, title: p.title,
        current_version: 1, created_by: c.by }, { prefix: 'LS' });
    }
    const verNo = prev ? prev.version + 1 : 1;
    if (prev) db.run(`UPDATE lesson_versions SET state='superseded', updated_at=? WHERE id=?`, db.now(), prev.id);
    const version = db.insertRow('lesson_versions', { lesson_id: lesson.id, version: verNo, state: 'submitted',
      camera_hints: p.camera_hints || null, note: p.note || null, work_order_id: wo ? wo.id : null, submitted_by: c.by, created_by: c.by });
    lines.forEach((l, i) => db.insertRow('lines', { display_id: l.id, lesson_version_id: version.id, ord: i, cast_member_id: cast[i].id,
      say: l.say, lang: l.lang || 'vi', terms_declared: l.terms || [], subtitle: l.subtitle || null, mood: l.mood || null, created_by: c.by }));
    beatRows.forEach((r, i) => db.insertRow('beats', { display_id: r.b.id, lesson_version_id: version.id, ord: i, block_type: r.b.block,
      block_version: r.version, params: r.b.params, anchor_line_display_id: r.line.id, anchor_word_index: r.idx,
      asset_ids: r.b.asset_ids || null, created_by: c.by }));

    // render cũ chưa duyệt → superseded
    const olds = db.all(`SELECT r.id, r.state, r.display_id FROM renders r JOIN lesson_versions lv ON lv.id=r.lesson_version_id
       WHERE lv.lesson_id=? AND r.state NOT IN ('approved','changes_requested','rejected','superseded')`, lesson.id);
    // agent không được đè lên bản đang chờ chủ xưởng duyệt
    if (c.a.type === 'agent') { const w = olds.find(o => o.state === 'awaiting_review'); if (w) throw err('forbidden', `Bản dựng ${w.display_id} đang chờ chủ xưởng duyệt; agent không nộp đè lên được.`, { render: w.display_id }); }
    for (const o of olds) state.transitionRender(db, o.id, 'superseded', { actor: c.a });

    const render = db.insertRow('renders', { lesson_version_id: version.id, state: 'queued', state_changed_at: db.now(), progress: 0, created_by: c.by }, { prefix: 'RD' });
    const run = queue.enqueue(db, { kind: 'voicing', render_id: render.id, payload: { render_id: render.display_id, lesson_version_id: version.id }, created_by: c.by });
    const lf = { latest_render_id: render.id, current_version: verNo };
    if (!isNew) lf.title = p.title;
    db.update('lessons', lesson.id, lf);
    if (node && node.status === 'todo') db.update('curriculum_nodes', node.id, { status: 'in_progress' });
    else if (!node && lesson.curriculum_node_id) db.run(`UPDATE curriculum_nodes SET status='in_progress', updated_at=? WHERE id=? AND status='todo'`, db.now(), lesson.curriculum_node_id);

    if (wo) {
      if (wo.state === 'open') {
        const ag = c.a.type === 'agent' ? byRef('agents', c.a.id) : null;
        state.transitionWorkOrder(db, wo.id, 'assigned', { agent_id: ag ? ag.id : undefined, actor: c.actor, entry: c.entry });
      }
      state.transitionWorkOrder(db, wo.id, 'fulfilled', { lesson_id: lesson.id, summary: `Đã nộp ${lesson.display_id} v${verNo}`, actor: c.actor, entry: c.entry });
    }
    const outLesson = byRef('lessons', lesson.id);
    return {
      result: { lesson: outLesson, version: { id: version.id, version: verNo, lesson: outLesson.display_id }, render: db.json(db.get('SELECT * FROM renders WHERE id=?', render.id)), run: run.display_id },
      entity: ['lesson', outLesson.display_id], before: prev ? { version: prev.version } : null,
      after: { version: verNo, lines: lines.length, beats: beatRows.length, render: render.display_id },
    };
  }

  // ----- Work order -----
  op('work_order.create', 'ownerOrSystem', (c) => {
    const p = c.p;
    const ch = need('channels', p.channel, 'kênh');
    if (!['new_lesson', 'revise', 'unblock', 'manual'].includes(p.kind || 'manual')) throw err('invalid', 'Loại lệnh không hợp lệ.', null);
    const node = p.curriculum_node ? need('curriculum_nodes', p.curriculum_node, 'mục giáo trình') : null;
    if ((p.kind || 'manual') === 'new_lesson' && !node) throw err('invalid', 'Lệnh bài mới cần mục giáo trình.', null);
    const lesson = p.lesson ? need('lessons', p.lesson, 'bài học') : null;
    const ag = p.agent ? need('agents', p.agent, 'agent') : null;
    const wo = state.createWorkOrder(db, { channel_id: ch.id, kind: p.kind || 'manual', curriculum_node_id: node && node.id,
      lesson_id: lesson && lesson.id, agent_id: ag && ag.id, brief: p.brief, created_by: c.by });
    return { result: wo, entity: ['work_order', wo.display_id], before: null, after: { kind: wo.kind, brief: wo.brief } };
  });
  op('work_order.cancel', 'owner', (c) => {
    const wo = need('work_orders', c.p.work_order, 'lệnh sản xuất');
    const out = state.transitionWorkOrder(db, wo.id, 'cancelled', { actor: c.actor, entry: c.entry });
    return { result: out, entity: ['work_order', wo.display_id], before: { state: wo.state }, after: { state: 'cancelled' } };
  });
  op('work_order.complete', 'run', (c) => {
    const wo = need('work_orders', c.p.work_order, 'lệnh sản xuất');
    if (c.a.type === 'agent' && wo.agent_id) {
      const ag = byRef('agents', c.a.id);
      if (!ag || ag.id !== wo.agent_id) throw err('forbidden', 'Lệnh này đã giao cho agent khác.', { work_order: wo.display_id });
    }
    const out = state.transitionWorkOrder(db, wo.id, 'fulfilled', { summary: c.p.summary || null, actor: c.actor, entry: c.entry });
    return { result: out, entity: ['work_order', wo.display_id], before: { state: wo.state }, after: { state: 'fulfilled', summary: c.p.summary || null } };
  });

  // ----- Agent / provider / settings -----
  op('agent.create', 'ownerOrCli', (c) => {
    const p = c.p;
    const scopes = p.scopes || ['read'];
    if (!nonEmpty(p.name)) throw err('invalid', 'Agent cần có tên.', null);
    if (!Array.isArray(scopes) || scopes.some((s) => !['read', 'compose', 'run'].includes(s))) throw err('invalid', 'Phạm vi (scopes) phải thuộc read, compose, run.', { scopes });
    const kind = p.kind || 'token';
    if (!['internal', 'token', 'oauth'].includes(kind)) throw err('invalid', 'Loại agent không hợp lệ.', null);
    const ag = db.insertRow('agents', { name: p.name, kind, scopes, cli: p.cli || null, wake_limit_per_day: p.wake_limit_per_day ?? null, status: 'active', created_by: c.by }, { prefix: 'AG' });
    const token = `gst_${crypto.randomBytes(24).toString('base64url')}`;
    db.insertRow('agent_tokens', { agent_id: ag.id, token_hash: secrets.hashToken(token), prefix: token.slice(0, 8), kind: 'static' });
    return { result: { agent: ag, token }, entity: ['agent', ag.display_id], before: null, after: { name: ag.name, kind, scopes } };
  });
  // Thu hồi một agent: token (tay + access), client OAuth, mọi grant (code/refresh) — dùng cho agent.revoke, phát hiện refresh bị dùng lại, đăng ký lại cùng client.
  const revokeAgentRows = (agentId) => {
    const t = db.now();
    db.update('agents', agentId, { status: 'revoked', deleted_at: null });
    db.run('UPDATE agent_tokens SET revoked_at=? WHERE agent_id=? AND revoked_at IS NULL', t, agentId);
    db.run('UPDATE oauth_clients SET revoked_at=? WHERE agent_id=? AND revoked_at IS NULL', t, agentId);
    db.run('UPDATE oauth_grants SET revoked_at=? WHERE agent_id=? AND revoked_at IS NULL', t, agentId);
    // yêu cầu quyền còn chờ của các client đó hết hiệu lực; đóng mọi cửa sổ ghép (thu hồi = dừng, không để yêu cầu cũ/cửa sổ cũ cấp lại quyền)
    db.run("UPDATE auth_requests SET status='expired' WHERE status='pending' AND client_id IN (SELECT client_id FROM oauth_clients WHERE agent_id=?)", agentId);
    putSetting('pairing_window', null, 'system');
  };
  const getSetting = (key) => { const r = db.get('SELECT value FROM settings WHERE workspace_id=? AND key=?', ws(), key); if (!r) return null; try { return JSON.parse(r.value); } catch { return null; } };
  const putSetting = (key, value, by) => db.run(`INSERT INTO settings(workspace_id,key,value,updated_at,updated_by) VALUES(?,?,?,?,?)
    ON CONFLICT(workspace_id,key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at, updated_by=excluded.updated_by`, ws(), key, JSON.stringify(value), db.now(), by);
  op('agent.revoke', 'owner', (c) => {
    const ag = need('agents', c.p.agent, 'agent');
    revokeAgentRows(ag.id);
    if (ag.kind === 'internal') putSetting('pairing_window', null, c.by);   // "Tắt agent nội bộ": không tự xin lại cho tới khi chủ xưởng mở cửa sổ ghép (CNS-073)
    return { result: byRef('agents', ag.id), entity: ['agent', ag.display_id], before: { status: ag.status }, after: { status: 'revoked' } };
  });

  // ---- Duyệt quyền MCP (A3, R2b) ----
  // Dọn: hết hạn → expired; xoá token/grant hết hạn quá 7 ngày (chỉ lá của chuỗi xoay vòng)
  const sweepAuth = () => {
    const t = db.now(), old = new Date(Date.now() - PURGE_AFTER_MS).toISOString();
    db.run("UPDATE auth_requests SET status='expired' WHERE status='pending' AND expires_at<?", t);
    db.run("DELETE FROM agent_tokens WHERE kind='access' AND expires_at<?", old);
    db.run('DELETE FROM oauth_grants WHERE expires_at<? AND id NOT IN (SELECT parent_id FROM oauth_grants WHERE parent_id IS NOT NULL)', old);
  };
  const getRequest = (id) => db.json(db.get('SELECT * FROM auth_requests WHERE workspace_id=? AND (id=? OR display_id=?)', ws(), String(id || ''), String(id || '')));
  const getClient = (id) => db.json(db.get('SELECT * FROM oauth_clients WHERE workspace_id=? AND client_id=?', ws(), String(id || '')));
  const clientOk = (cl) => !!cl && !cl.revoked_at && (!cl.expires_at || cl.expires_at >= db.now());   // client chưa có agent hết hạn sau 1 h
  const codeHash = (code) => sha256(String(code || '').trim().toUpperCase());
  const redirectWith = (uri, params) => { const u = new URL(uri); for (const [k, v] of Object.entries(params)) if (v != null && v !== '') u.searchParams.set(k, v); return u.toString(); };
  // Trần theo kênh / nguồn / client: quá trần thì TỪ CHỐI (không đẩy bỏ yêu cầu cũ). source = p.ip (kênh công khai: IP đầu của header proxy)
  const checkPending = (chan, src, clientId) => {
    const now = db.now();
    const n = (sql, ...a) => db.get(`SELECT COUNT(*) AS n FROM auth_requests WHERE workspace_id=? AND status='pending' AND expires_at>=? AND ${sql}`, ws(), now, ...a).n;
    const full = n('channel=?', chan) >= (PENDING_CHANNEL[chan] || 10) || (src && n('channel=? AND source_ip=?', chan, src) >= (PENDING_SOURCE[chan] || 3)) || (clientId && n('client_id=? AND source_ip IS ?', clientId, src || null) >= PENDING_CLIENT);
    if (full) throw oerr('rate_limited', 'too_many_pending', 'Đang có quá nhiều yêu cầu chờ duyệt. Chủ xưởng cần xử lý bớt rồi hãy thử lại.');
  };

  // lần đầu: sinh server_id (định danh ổn định của xưởng, dùng làm audience của access token — không phụ thuộc URL)
  op('auth.init', 'system', () => {
    let id = getSetting('server_id');
    if (!id) { id = 'srv_' + crypto.randomBytes(12).toString('base64url'); putSetting('server_id', id, 'system'); }
    return { result: { server_id: id }, entity: ['setting', 'server_id'], before: null, after: { server_id: id } };
  });
  // chủ xưởng bấm "Bật agent nội bộ"/"Mở lại ghép" (channel internal) hoặc "Ghép CLI" (channel loopback): mở cửa sổ ghép 10 phút cho đúng kênh đó
  op('auth.pairing_open', 'ownerUi', (c) => {
    const channel = c.p.channel === 'loopback' ? 'loopback' : 'internal';
    const w = { channel, open_until: new Date(Date.now() + PAIRING_WINDOW_MS).toISOString() };
    putSetting('pairing_window', w, c.by);
    return { result: w, entity: ['setting', 'pairing_window'], before: null, after: w };
  });
  // runner nội bộ báo trạng thái (unpaired|waiting|paired|error) qua /oauth/pairing-status; ghi khi đổi trạng thái
  op('auth.runner_status', 'oauth', (c) => {
    const v = { state: c.p.state, code: String(c.p.code || '').slice(0, 30), at: db.now() };
    putSetting('runner_status', v, 'runner');
    return { result: v, entity: ['setting', 'runner_status'], before: null, after: v };
  });

  // chỉ để ghi nhật ký: có người gửi X-GS-Pairing sai tới /oauth/*
  op('auth.bad_secret', 'oauth', (c) => ({ result: { ok: false }, entity: ['oauth_endpoint', String(c.p.path || '').slice(0, 40)], before: null, after: { path: String(c.p.path || '').slice(0, 40), ip: c.p.ip || null } }));

  op('auth.register', 'oauth', (c) => {
    const p = c.p;
    sweepAuth();
    const uris = Array.isArray(p.redirect_uris) ? p.redirect_uris : [];
    if (!uris.length || uris.length > 5 || !uris.every(redirectUriOk)) throw oerr('invalid', 'invalid_redirect_uri', 'redirect_uris phải là 1–5 địa chỉ https (hoặc http://127.0.0.1 | localhost cho máy cục bộ).');
    const chan = p.channel || 'public';
    const pc = (sql, ...a) => db.get(`SELECT COUNT(*) AS n FROM oauth_clients WHERE workspace_id=? AND kind='dcr' AND agent_id IS NULL AND revoked_at IS NULL AND expires_at>=? AND created_channel=? ${sql}`, ws(), db.now(), chan, ...a).n;
    if (pc('') >= (CLIENTS_CHANNEL[chan] || 30) || (p.ip && pc('AND created_ip=?', p.ip) >= (CLIENTS_SOURCE[chan] || 5))) throw oerr('rate_limited', 'too_many_pending', 'Đang có quá nhiều client chờ dùng. Thử lại sau.');
    const name = cleanName(p.client_name, 'Agent') + SELF_DECLARED;
    const row = db.insertRow('oauth_clients', { client_id: rnd('cl_', 16), kind: 'dcr', redirect_uris: uris, name, created_channel: chan, created_ip: p.ip || null, expires_at: new Date(Date.now() + CLIENT_PENDING_MS).toISOString() });
    return { result: { client_id: row.client_id, name, redirect_uris: uris }, entity: ['oauth_client', row.client_id], before: null, after: { name, redirect_uris: uris, channel: chan, ip: p.ip || null } };
  });

  // kind 'oauth': {client_id, redirect_uri, scope, state, resource, code_challenge, channel, ip}; kind 'device': {client_name, scope, channel, ip}
  op('auth.request', 'oauth', (c) => {
    const p = c.p;
    sweepAuth();
    const { scopes, ignored } = parseScopes(p.scope);
    const chan = p.channel || 'public';
    if (p.kind === 'device') {
      // ghép thiết bị chỉ theo ý định của chủ xưởng và chỉ trong máy: không phục vụ qua host công khai; ngoài cửa sổ ghép (đúng kênh) thì không tạo hàng
      if (chan === 'public') throw oerr('forbidden', 'access_denied', 'Ghép thiết bị chỉ dùng trong máy chủ. Từ xa hãy dùng OAuth (Claude Code, claude.ai) hoặc token tay.');
      const win = getSetting('pairing_window');
      if (!win || win.channel !== chan || !win.open_until || win.open_until < db.now()) throw oerr('invalid', 'pairing_closed', 'Cửa sổ ghép đang đóng. Chủ xưởng bấm "Bật agent nội bộ" / "Mở lại ghép" (hoặc "Ghép CLI") trên giao diện trước.');
      const internal = chan === 'internal';    // chỉ kênh nội bộ (Host studio:7490 trong mạng Docker) mới là runner; mọi nguồn khác là oauth, tên tự khai
      const name = internal ? 'Agent nội bộ' : cleanName(p.client_name, 'Agent') + SELF_DECLARED;
      checkPending(chan, p.ip, null);
      const device = rnd('gsd_', 32);
      let code, tries = 0;
      do {
        const L = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
        code = Array.from({ length: 4 }, () => L[crypto.randomInt(L.length)]).join('') + '-' + String(crypto.randomInt(10000)).padStart(4, '0');
        if (++tries > 50) throw err('conflict', 'Không sinh được mã ghép, thử lại.', null);
      } while (db.get("SELECT 1 AS x FROM auth_requests WHERE user_code_hash=? AND status='pending'", codeHash(code)));
      const cid = 'dev_' + ulid();
      db.insertRow('oauth_clients', { client_id: cid, kind: 'device', redirect_uris: null, name, created_channel: chan, created_ip: p.ip || null, expires_at: new Date(Date.now() + DEVICE_TTL_MS).toISOString() });
      const row = db.insertRow('auth_requests', { kind: 'device', client_id: cid, client_name: name, user_code_hash: codeHash(code), device_code_hash: sha256(device),
        scopes_requested: scopes, resource: null, channel: chan, source_ip: p.ip || null, expires_at: new Date(Date.now() + DEVICE_TTL_MS).toISOString() }, { prefix: 'AR' });
      return { result: { id: row.display_id, client_id: cid, device_code: device, user_code: code, expires_in: DEVICE_TTL_MS / 1000 }, entity: ['auth_request', row.display_id], before: null,
        after: { kind: 'device', client_name: name, channel: chan, scopes, ignored_scopes: ignored, ip: p.ip || null } };
    }
    const cl = getClient(p.client_id);
    if (!clientOk(cl) || cl.kind !== 'dcr') throw oerr('invalid', 'invalid_client', 'client_id không tồn tại, đã bị thu hồi hoặc hết hạn.');
    if (!redirectMatches(cl.redirect_uris, String(p.redirect_uri || ''))) throw oerr('invalid', 'invalid_redirect_uri', 'redirect_uri không khớp địa chỉ đã đăng ký.');
    if (!nonEmpty(p.code_challenge) || !/^[A-Za-z0-9\-._~]{43,128}$/.test(p.code_challenge)) throw oerr('invalid', 'invalid_request', 'Thiếu code_challenge PKCE hợp lệ.');
    if (p.code_challenge_method !== 'S256') throw oerr('invalid', 'invalid_request', 'Chỉ nhận code_challenge_method=S256.');
    checkPending(chan, p.ip, cl.client_id);
    const row = db.insertRow('auth_requests', { kind: 'oauth', client_id: cl.client_id, client_name: cl.name, scopes_requested: scopes,
      redirect_uri: p.redirect_uri, pkce_challenge: p.code_challenge, state: p.state ? String(p.state).slice(0, 512) : null, resource: p.resource || null,
      channel: chan, source_ip: p.ip || null, expires_at: new Date(Date.now() + REQUEST_TTL_MS).toISOString() }, { prefix: 'AR' });
    return { result: { id: row.display_id }, entity: ['auth_request', row.display_id], before: null,
      after: { kind: 'oauth', client: cl.client_id, client_name: cl.name, channel: chan, scopes, ignored_scopes: ignored, ip: p.ip || null } };
  });

  // p: {id, scopes?, user_code? (bắt buộc với ghép CLI ngoài: chủ xưởng TỰ GÕ mã), confirm? (bắt buộc khi redirect không phải loopback)}
  op('auth.approve', 'ownerUi', (c) => {
    const rq = getRequest(c.p.id);
    if (!rq) throw err('not_found', 'Không tìm thấy yêu cầu cấp quyền.', null);
    if (rq.status !== 'pending' || rq.expires_at < db.now()) throw err('conflict', 'Yêu cầu này đã được xử lý hoặc đã hết hạn. Hãy cho agent xin lại.', { status: rq.status });
    const internal = rq.kind === 'device' && rq.channel === 'internal';   // chỉ runner trong mạng Docker mới là agent nội bộ
    if (rq.kind === 'device' && !internal && codeHash(c.p.user_code) !== rq.user_code_hash) throw err('invalid', 'Hãy gõ đúng mã ghép mà thiết bị đang in ra.', { need: 'user_code' });
    if (rq.kind === 'oauth' && !isLoopbackUri(rq.redirect_uri) && c.p.confirm !== true) throw err('invalid', 'Xác nhận rằng chính bạn vừa tự bấm kết nối này.', { need: 'confirm' });
    const asked = rq.scopes_requested || [];
    const granted = c.p.scopes === undefined ? asked.slice() : c.p.scopes;
    if (!Array.isArray(granted) || !granted.length || granted.some((x) => !SCOPES.includes(x))) throw err('invalid', 'Chọn ít nhất một phạm vi hợp lệ (read, compose, run).', { scopes: granted });
    if (granted.some((x) => !asked.includes(x))) throw err('invalid', 'Chỉ được hạ phạm vi, không nâng quá mức agent xin.', { requested: asked, granted });
    const cl = getClient(rq.client_id);
    if (!clientOk(cl)) throw err('conflict', 'Client đã bị thu hồi hoặc hết hạn.', null);
    // xin lại cùng client: luôn tạo agent MỚI với đúng phạm vi vừa duyệt và thu hồi agent cũ (không bao giờ sửa phạm vi của agent đã ràng buộc)
    const old = cl.agent_id ? byRef('agents', cl.agent_id) : null;
    if (old && old.status !== 'revoked') revokeAgentRows(old.id);
    const ag = db.insertRow('agents', { name: rq.client_name || 'Agent', kind: internal ? 'internal' : 'oauth', scopes: granted, status: 'active', created_by: c.by }, { prefix: 'AG' });
    db.run('UPDATE oauth_clients SET agent_id=?, expires_at=NULL, revoked_at=NULL WHERE client_id=?', ag.id, cl.client_id);
    db.update('auth_requests', rq.id, { status: 'approved', scopes_granted: granted, decided_by: c.a.id, decided_at: db.now(), agent_id: ag.id, replaces_agent_id: old && old.status !== 'revoked' ? old.id : null });
    // cửa sổ ghép của kênh đó đóng ngay khi có yêu cầu ghép được duyệt (một cú bấm mở = một lần ghép)
    const win = rq.kind === 'device' ? getSetting('pairing_window') : null;
    const closedWindow = !!(win && win.channel === rq.channel);
    if (closedWindow) putSetting('pairing_window', null, c.by);
    const out = { id: rq.display_id, kind: rq.kind, agent: { display_id: ag.display_id, name: ag.name, kind: ag.kind, scopes: granted } };
    if (rq.kind === 'oauth') {
      const code = rnd('gsc_', 32);
      db.insertRow('oauth_grants', { kind: 'code', token_hash: sha256(code), client_id: cl.client_id, agent_id: ag.id, auth_request_id: rq.id, scopes: granted,
        pkce_challenge: rq.pkce_challenge, redirect_uri: rq.redirect_uri, resource: rq.resource, expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString() });
      out.redirect = redirectWith(rq.redirect_uri, { code, state: rq.state });   // code dùng 1 lần, 60 s — ngoại lệ duy nhất được nằm trong URL
    }
    return { result: out, entity: ['auth_request', rq.display_id], before: { status: 'pending', scopes_requested: asked },
      after: { status: 'approved', scopes_granted: granted, agent: ag.display_id, replaced_agent: old && old.status !== 'revoked' ? old.display_id : null, closed_window: closedWindow } };
  });
  op('auth.deny', 'ownerUi', (c) => {
    const rq = getRequest(c.p.id);
    if (!rq) throw err('not_found', 'Không tìm thấy yêu cầu cấp quyền.', null);
    if (rq.status !== 'pending' || rq.expires_at < db.now()) throw err('conflict', 'Yêu cầu này đã được xử lý hoặc đã hết hạn.', { status: rq.status });
    db.update('auth_requests', rq.id, { status: 'denied', decided_by: c.a.id, decided_at: db.now() });
    const out = { id: rq.display_id, kind: rq.kind };
    if (rq.kind === 'oauth') out.redirect = redirectWith(rq.redirect_uri, { error: 'access_denied', state: rq.state });
    return { result: out, entity: ['auth_request', rq.display_id], before: { status: 'pending' }, after: { status: 'denied' } };
  });

  // "Từ chối tất cả yêu cầu ngoài": chủ xưởng luôn dọn được một đợt flood (mọi yêu cầu chờ không thuộc kênh nội bộ)
  op('auth.deny_all', 'ownerUi', (c) => {
    const rows = db.all("SELECT id, display_id FROM auth_requests WHERE workspace_id=? AND status='pending' AND channel!='internal'", ws());
    const t = db.now();
    rows.forEach((r) => db.run("UPDATE auth_requests SET status='denied', decided_by=?, decided_at=? WHERE id=?", c.a.id, t, r.id));
    return { result: { denied: rows.length }, entity: ['auth_request', 'deny_all'], before: null, after: { denied: rows.map((r) => r.display_id) } };
  });

  // Cấp cặp token mới: access gsa_ (1 giờ, audience = server_id, scopes đã hạ) + refresh gsr_ (xoay vòng, 30 ngày trượt).
  // scopes của refresh con = base (không bao giờ rộng hơn agents.scopes); access có thể hẹp hơn nếu client xin thu hẹp.
  const issueTokens = (ag, base, narrow, audience, { clientId, requestId, parentId }) => {
    const access = rnd('gsa_', 32), refresh = rnd('gsr_', 32);
    const gid = ulid();
    db.insertRow('agent_tokens', { agent_id: ag.id, token_hash: sha256(access), prefix: access.slice(0, 8), kind: 'access', audience, scopes: narrow, grant_id: gid, expires_at: new Date(Date.now() + ACCESS_TTL_MS).toISOString() });
    const child = db.insertRow('oauth_grants', { id: gid, kind: 'refresh', token_hash: sha256(refresh), client_id: clientId, agent_id: ag.id, auth_request_id: requestId || null,
      scopes: base, parent_id: parentId || null, expires_at: new Date(Date.now() + REFRESH_TTL_MS).toISOString() });
    if (parentId) db.run('UPDATE oauth_grants SET child_id=? WHERE id=?', child.id, parentId);
    db.run('UPDATE oauth_clients SET last_used_at=? WHERE client_id=?', db.now(), clientId);
    return { access_token: access, token_type: 'Bearer', expires_in: ACCESS_TTL_MS / 1000, refresh_token: refresh, scope: narrow.join(' ') };
  };
  const liveAgent = (id) => { const ag = byRef('agents', id); return ag && ag.status !== 'revoked' ? ag : null; };
  // Phạm vi cấp ra: base = grant ∩ agents.scopes (không bao giờ nới); `scope` trong yêu cầu chỉ được thu hẹp
  const scopesFor = (ag, grantScopes, wanted) => {
    const base = inter(grantScopes, ag.scopes);
    if (!wanted) return { base, narrow: base };
    const want = String(wanted).split(/\s+/).filter(Boolean);
    if (!want.length || want.some((x) => !base.includes(x))) throw oerr('invalid', 'invalid_scope', 'scope chỉ được thu hẹp so với quyền đã duyệt, không được nâng.');
    return { base, narrow: [...new Set(want)] };
  };
  // trả {error} (có commit) thay vì ném khi cần giữ lại tác dụng phụ (đốt code, thu hồi)
  const reject = (error, description, extra) => ({ result: { error, error_description: description }, entity: ['oauth_grant', 'reject'], before: null, after: Object.assign({ error }, extra) });

  // {grant:'code', code, client_id, redirect_uri, code_verifier, resource_ok, scope, audience} | {grant:'device', device_code, client_id?, scope, audience}
  op('auth.exchange', 'oauth', (c) => {
    const p = c.p;
    if (p.grant === 'device') {
      const rq = db.json(db.get('SELECT * FROM auth_requests WHERE workspace_id=? AND device_code_hash=?', ws(), sha256(p.device_code || '')));
      if (!rq || rq.kind !== 'device') throw oerr('invalid', 'invalid_grant', 'device_code không hợp lệ.');
      if (p.client_id && p.client_id !== rq.client_id) throw oerr('invalid', 'invalid_grant', 'client_id không khớp.');
      if (rq.consumed_at) throw oerr('invalid', 'invalid_grant', 'device_code đã được dùng.');   // đã đổi token một lần (kể cả khi grant đã bị dọn)
      if (rq.status === 'approved' && rq.expires_at < db.now()) throw oerr('invalid', 'expired_token', 'Yêu cầu đã hết hạn. Hãy xin mã mới.');
      if (rq.status === 'denied') throw oerr('forbidden', 'access_denied', 'Chủ xưởng đã từ chối yêu cầu này.');
      if (rq.status === 'expired' || (rq.status === 'pending' && rq.expires_at < db.now())) throw oerr('invalid', 'expired_token', 'Yêu cầu đã hết hạn. Hãy xin mã mới.');
      if (rq.status === 'pending') throw oerr('conflict', 'authorization_pending', 'Chủ xưởng chưa duyệt.');
      const ag = liveAgent(rq.agent_id);
      if (!ag) throw oerr('invalid', 'invalid_grant', 'Agent đã bị thu hồi.');
      const sc = scopesFor(ag, rq.scopes_granted, p.scope);
      db.update('auth_requests', rq.id, { last_poll_at: db.now(), consumed_at: db.now() });
      db.run('UPDATE oauth_clients SET last_used_at=? WHERE client_id=?', db.now(), rq.client_id);
      const body = issueTokens(ag, sc.base, sc.narrow, p.audience, { clientId: rq.client_id, requestId: rq.id });
      return { result: body, entity: ['agent', ag.display_id], before: null, after: { grant: 'device', agent: ag.display_id, scopes: sc.narrow } };
    }
    const g = db.json(db.get("SELECT * FROM oauth_grants WHERE kind='code' AND token_hash=?", sha256(p.code || '')));
    if (!g) throw oerr('invalid', 'invalid_grant', 'code không hợp lệ.');
    if (g.used_at || g.revoked_at) {
      // dùng lại code ⇒ thu hồi mọi thứ đã cấp từ code đó (OAuth 2.1 §4.1.3)
      const t = db.now();
      db.run(`WITH RECURSIVE chain(id) AS (SELECT id FROM oauth_grants WHERE parent_id=? UNION ALL SELECT g2.id FROM oauth_grants g2 JOIN chain ON g2.parent_id=chain.id)
              UPDATE oauth_grants SET revoked_at=? WHERE id IN (SELECT id FROM chain) AND revoked_at IS NULL`, g.id, t);
      db.run("UPDATE agent_tokens SET revoked_at=? WHERE agent_id=? AND kind='access' AND created_at>=? AND revoked_at IS NULL", t, g.agent_id, g.used_at || g.created_at);
      return reject('invalid_grant', 'code đã được dùng; token đã cấp từ code này bị thu hồi.', { code_reuse: true, agent_id: g.agent_id });
    }
    if (g.expires_at < db.now()) throw oerr('invalid', 'invalid_grant', 'code đã hết hạn (60 giây).');
    const ag0 = liveAgent(g.agent_id);
    const sc = ag0 ? scopesFor(ag0, g.scopes, p.scope) : null;     // nới phạm vi → invalid_scope (code chưa bị đốt)
    db.run('UPDATE oauth_grants SET used_at=? WHERE id=?', db.now(), g.id);   // đốt code ngay, kể cả khi bước sau thất bại
    if (g.client_id !== p.client_id || g.redirect_uri !== p.redirect_uri) return reject('invalid_grant', 'client_id hoặc redirect_uri không khớp lúc xin quyền.', {});
    if (!pkceOk(p.code_verifier, g.pkce_challenge)) return reject('invalid_grant', 'code_verifier (PKCE) không khớp.', {});
    if (p.resource && g.resource && p.resource !== g.resource) return reject('invalid_target', 'resource không khớp lúc xin quyền.', {});
    if (!ag0) return reject('invalid_grant', 'Agent đã bị thu hồi.', {});
    const body = issueTokens(ag0, sc.base, sc.narrow, p.audience, { clientId: g.client_id, requestId: g.auth_request_id, parentId: g.id });
    return { result: body, entity: ['agent', ag0.display_id], before: null, after: { grant: 'authorization_code', agent: ag0.display_id, scopes: sc.narrow } };
  });

  // {refresh_token, client_id, scope?, audience}: xoay vòng. Dùng lại refresh cũ: trong 30 s và con chưa dùng → cấp lại cặp mới (thử lại sau mất phản hồi); ngoài ra thu hồi cả agent.
  op('auth.refresh', 'oauth', (c) => {
    const p = c.p;
    const g = db.json(db.get("SELECT * FROM oauth_grants WHERE kind='refresh' AND token_hash=?", sha256(p.refresh_token || '')));
    if (!g) throw oerr('invalid', 'invalid_grant', 'refresh_token không hợp lệ.');
    const ag = byRef('agents', g.agent_id);
    if (g.client_id !== p.client_id) throw oerr('invalid', 'invalid_grant', 'client_id không khớp.');
    if (!ag || ag.status === 'revoked') throw oerr('invalid', 'invalid_grant', 'refresh_token đã bị thu hồi.');
    const reuse = () => {
      revokeAgentRows(ag.id);
      return { result: { error: 'invalid_grant', error_description: 'refresh_token đã được dùng; agent bị thu hồi vì nghi bị đánh cắp.' },
        entity: ['agent', ag.display_id], before: { status: ag.status }, after: { status: 'revoked', reason: 'refresh_reuse' } };
    };
    if (g.revoked_at) {
      if (g.revoke_reason === 'grace') return reuse();   // cặp con đã bị ân hạn thay mà vẫn có người trình ra ⇒ có bản sao thứ hai của token
      throw oerr('invalid', 'invalid_grant', 'refresh_token đã bị thu hồi.');
    }
    let grace = false;
    if (g.used_at) {
      // ân hạn tối đa MỘT lần cho mỗi refresh cha, trong 30 s, và cặp con hiện tại chưa được dùng; ngoài ra là đánh cắp
      const child = db.get("SELECT id FROM oauth_grants WHERE parent_id=? AND kind='refresh' AND used_at IS NULL AND revoked_at IS NULL ORDER BY created_at DESC LIMIT 1", g.id);
      const graced = db.get("SELECT 1 AS x FROM oauth_grants WHERE parent_id=? AND revoke_reason='grace'", g.id);
      if (!child || graced || Date.now() - Date.parse(g.used_at) > REFRESH_GRACE_MS) return reuse();
      db.run("UPDATE oauth_grants SET revoked_at=?, revoke_reason='grace' WHERE id=?", db.now(), child.id);
      db.run('UPDATE agent_tokens SET revoked_at=? WHERE grant_id=? AND revoked_at IS NULL', db.now(), child.id);   // access token đi kèm cặp con bị thay cũng bị thu hồi   // cặp con chưa dùng bị thay (không lưu được token thô để trả lại đúng cặp cũ)
      grace = true;
    }
    if (g.expires_at < db.now()) throw oerr('invalid', 'invalid_grant', 'refresh_token đã hết hạn.');
    const sc = scopesFor(ag, g.scopes, p.scope);
    if (!grace) db.run('UPDATE oauth_grants SET used_at=? WHERE id=?', db.now(), g.id);
    const body = issueTokens(ag, sc.base, sc.narrow, p.audience, { clientId: g.client_id, requestId: g.auth_request_id, parentId: g.id });
    return { result: body, entity: ['agent', ag.display_id], before: null, after: { grant: 'refresh_token', agent: ag.display_id, scopes: sc.narrow, grace } };
  });
  op('provider.save', 'owner', (c) => {
    const p = c.p;
    let pv = p.provider ? need('providers', p.provider, 'nhà cung cấp') : null;
    const vendor = p.vendor || (pv && pv.vendor);
    if (!nonEmpty(vendor)) throw err('invalid', 'Nhà cung cấp cần vendor.', null);
    if (!VENDORS.includes(vendor)) throw err('invalid', 'Nhà cung cấp chưa được hỗ trợ.', { vendor, supported: VENDORS });
    const kind = p.kind || (pv && pv.kind);
    if (!['tts', 'judge', 'align', 'assistant', 'cli_agent'].includes(kind)) throw err('invalid', 'Loại nhà cung cấp không hợp lệ.', { kind });
    let secretName = pv ? pv.secret_name : null;
    if (p.key) { secretName = `provider:${vendor}`; secrets.put(db, ws(), secretName, p.key); }
    const f = { vendor, kind, model: p.model ?? (pv && pv.model) ?? null, secret_name: secretName, enabled: p.enabled === undefined ? (pv ? pv.enabled : 1) : p.enabled };
    if (pv) db.update('providers', pv.id, f, { rowVersion: p.row_version });
    else pv = db.insertRow('providers', { ...f, created_by: c.by }, { prefix: 'PV' });
    return { result: byRef('providers', pv.id), entity: ['provider', pv.display_id], before: null, after: { ...f, key_set: !!p.key } };
  });
  op('provider.scan_result', 'ownerOrSystem', (c) => {
    const pv = need('providers', c.p.provider, 'nhà cung cấp');
    if (!c.p.scan || typeof c.p.scan !== 'object') throw err('invalid', 'Thiếu kết quả quét.', null);
    db.update('providers', pv.id, { scan: { ...c.p.scan, scanned_at: c.p.scan.scanned_at || db.now() } });
    return { result: byRef('providers', pv.id), entity: ['provider', pv.display_id], before: pv.scan, after: c.p.scan };
  });
  op('settings.set', 'owner', (c) => {
    const { key, value } = c.p;
    if (!nonEmpty(key) || key.length > 100) throw err('invalid', 'Khoá cài đặt không hợp lệ.', null);
    const old = db.get('SELECT value FROM settings WHERE workspace_id=? AND key=?', ws(), key);
    db.run(`INSERT INTO settings(workspace_id,key,value,updated_at,updated_by) VALUES(?,?,?,?,?)
            ON CONFLICT(workspace_id,key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at, updated_by=excluded.updated_by`,
    ws(), key, JSON.stringify(value === undefined ? null : value), db.now(), c.by);
    return { result: { key, value }, entity: ['setting', key], before: old ? JSON.parse(old.value) : null, after: value };
  });
  op('suggestion.create', 'suggest', (c) => {
    const p = c.p;
    if (!nonEmpty(p.target_kind)) throw err('invalid', 'Gợi ý cần target_kind.', null);
    const row = db.insertRow('suggestions', { target_kind: p.target_kind, target_id: p.target_id || null, diff: p.diff || null, state: 'proposed', created_by: c.by }, { prefix: 'SG' });
    return { result: row, entity: ['suggestion', row.display_id], before: null, after: { target: p.target_kind, target_id: p.target_id } };
  });
  op('suggestion.apply', 'owner', (c) => {
    const sg = need('suggestions', c.p.suggestion, 'gợi ý');
    if (sg.state !== 'proposed') throw err('conflict', `Gợi ý đã ở trạng thái "${sg.state}".`, null);
    const u = db.get('SELECT id FROM users WHERE id=?', c.a.id);
    db.update('suggestions', sg.id, { state: 'applied', applied_by: u ? u.id : null, applied_at: db.now() });
    return { result: byRef('suggestions', sg.id), entity: ['suggestion', sg.display_id], before: { state: sg.state }, after: { state: 'applied' } };
  });

  function write(actor, opName, payload = {}) {
    const h = OPS[opName];
    if (!h) throw err('invalid', `Thao tác "${opName}" không được hỗ trợ.`, { op: opName });
    if (!actor || !ACTOR_TYPES.includes(actor.type) || !ENTRIES.includes(actor.entry)) {
      throw err('invalid', 'Thiếu hoặc sai thông tin người thực hiện (actor).', null);
    }
    const out = db.tx(() => {
      if (!allow[h.who](actor)) {
        throw err('forbidden', 'Bạn không có quyền thực hiện thao tác này.', { op: opName, actor: actor.type, entry: actor.entry, need: h.who });
      }
      const c = { a: actor, p: payload || {}, by: actorString(actor), actor, entry: auditEntry(actor) };
      const r = h.run(c);
      db.audit({ actor: c.by, entry: c.entry, action: opName, entity_type: r.entity[0], entity_id: r.entity[1], before: r.before, after: r.after });
      db.emitChange({ entity: r.entity[0], id: r.entity[1], op: opName });
      return r.result;
    });
    return out;
  }
  write.ops = Object.keys(OPS);
  return write;
}

module.exports = { LIMITS, SCOPES, createWriter, redirectUriOk, redirectMatches, isLoopbackUri, parseScopes, CODE_TTL_MS, ACCESS_TTL_MS, DEVICE_TTL_MS, REQUEST_TTL_MS, WriteError, anchorIndex, MVP_BLOCKS, POLICY_FIELDS };
