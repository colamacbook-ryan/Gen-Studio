// © 2026 Gen Labs — All rights reserved.
// CỔNG GHI DUY NHẤT: whitelist op, kiểm quyền (DATABASE §6 / PRODUCT-SPEC §8.1), audit cùng tx, phát sự kiện.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { WriteError } = require('./db');
const state = require('./state');
const queue = require('./queue');
const secrets = require('./secrets');

const MVP_BLOCKS = ['title', 'concept-chip', 'token-row', 'prob-card', 'stamp', 'takeaway', 'lesson-map', 'end-card', 'illustration'];
// Trường chính sách kênh — chỉ owner sửa (CNS-036)
const POLICY_FIELDS = ['schedule', 'loudness', 'subtitle_langs', 'limits', 'aspect', 'fps', 'publish', 'auto_publish'];
const ACTOR_TYPES = ['user', 'agent', 'assistant', 'system', 'cli', 'runner'];
const ENTRIES = ['ui', 'http', 'mcp', 'cli', 'runner', 'system', 'assistant'];
const ASSET_KINDS = ['svg', 'image', 'audio', 'video', 'subtitle', 'cover', 'logo', 'manifest'];
const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/svg+xml': 'svg', 'audio/wav': 'wav', 'audio/x-wav': 'wav',
  'video/mp4': 'mp4', 'text/plain': 'srt', 'application/x-subrip': 'srt', 'application/json': 'json' };
const MAX_ASSET_BYTES = 200 * 1024 * 1024;

const err = (code, text, detail) => new WriteError(code, text, detail);
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
  return ['user', 'agent', 'runner'].includes(a.type) && a.id ? `${a.type}:${a.id}` : a.type;
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
    if (!Array.isArray(p.beats)) E('beats', 'beats phải là mảng (có thể rỗng).');
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
      else if (l.say.length > 2000) E(`${at}.say`, 'Lời thoại quá dài (tối đa 2000 ký tự).');
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
  op('agent.create', 'owner', (c) => {
    const p = c.p;
    const scopes = p.scopes || ['read'];
    if (!nonEmpty(p.name)) throw err('invalid', 'Agent cần có tên.', null);
    if (!Array.isArray(scopes) || scopes.some((s) => !['read', 'compose', 'run'].includes(s))) throw err('invalid', 'Phạm vi (scopes) phải thuộc read, compose, run.', { scopes });
    const kind = p.kind || 'token';
    if (!['internal', 'token', 'oauth'].includes(kind)) throw err('invalid', 'Loại agent không hợp lệ.', null);
    const ag = db.insertRow('agents', { name: p.name, kind, scopes, cli: p.cli || null, wake_limit_per_day: p.wake_limit_per_day ?? null, status: 'active', created_by: c.by }, { prefix: 'AG' });
    const token = `gst_${crypto.randomBytes(24).toString('base64url')}`;
    db.insertRow('agent_tokens', { agent_id: ag.id, token_hash: secrets.hashToken(token), prefix: token.slice(0, 8) });
    return { result: { agent: ag, token }, entity: ['agent', ag.display_id], before: null, after: { name: ag.name, kind, scopes } };
  });
  op('agent.revoke', 'owner', (c) => {
    const ag = need('agents', c.p.agent, 'agent');
    db.update('agents', ag.id, { status: 'revoked', deleted_at: null });
    db.run('UPDATE agent_tokens SET revoked_at=? WHERE agent_id=? AND revoked_at IS NULL', db.now(), ag.id);
    db.run('UPDATE oauth_clients SET revoked_at=? WHERE agent_id=? AND revoked_at IS NULL', db.now(), ag.id);
    return { result: byRef('agents', ag.id), entity: ['agent', ag.display_id], before: { status: ag.status }, after: { status: 'revoked' } };
  });
  op('provider.save', 'owner', (c) => {
    const p = c.p;
    let pv = p.provider ? need('providers', p.provider, 'nhà cung cấp') : null;
    const vendor = p.vendor || (pv && pv.vendor);
    if (!nonEmpty(vendor)) throw err('invalid', 'Nhà cung cấp cần vendor.', null);
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

module.exports = { createWriter, WriteError, anchorIndex, MVP_BLOCKS, POLICY_FIELDS };
