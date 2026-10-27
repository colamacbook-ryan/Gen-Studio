// © 2026 Gen Labs — All rights reserved.
// SQLite (node:sqlite) — WAL, migration forward-only, tx lồng (savepoint), display_id, audit.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { ulid } = require('./ids');

// Tắt riêng cảnh báo ExperimentalWarning của SQLite; cảnh báo khác vẫn hiện bình thường.
const origEmit = process.emitWarning;
process.emitWarning = function (w, ...args) {
  const type = typeof args[0] === 'string' ? args[0] : args[0] && args[0].type;
  const msg = String((w && w.message) || w);
  if ((type === 'ExperimentalWarning' || (w && w.name === 'ExperimentalWarning')) && /sqlite/i.test(msg)) return undefined;
  return origEmit.call(process, w, ...args);
};
let DatabaseSync;
try { ({ DatabaseSync } = require('node:sqlite')); } finally { process.emitWarning = origEmit; }

class WriteError extends Error {
  constructor(code, text_human, detail) {
    super(text_human);
    this.name = 'WriteError';
    this.code = code; // forbidden | invalid | conflict | not_found
    this.text_human = text_human;
    this.detail = detail === undefined ? null : detail;
  }
  toJSON() { return { code: this.code, text_human: this.text_human, detail: this.detail }; }
}

const JSON_COLS = new Set([
  'scopes', 'prereq_ids', 'scan', 'data', 'camera_hints', 'terms_declared', 'subtitle', 'params', 'asset_ids', 'meta',
  'word_times', 'envelope', 'terms_detected', 'manifest', 'outputs', 'blocked_reason', 'measure', 'cost', 'error',
  'result', 'scopes_requested', 'scopes_granted', 'payload', 'diff', 'before', 'after', 'value', 'sort', 'columns', 'redirect_uris',
]);

const bind = (p) => p.map((v) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v));
const enc = (v) => (v !== null && typeof v === 'object' && !(v instanceof Uint8Array) ? JSON.stringify(v) : typeof v === 'boolean' ? (v ? 1 : 0) : v);

class Db {
  constructor(raw, { dataDir, masterKey, file }) {
    this.raw = raw;
    this.dataDir = dataDir;
    this.masterKey = masterKey || null;
    this.file = file;
    this.events = null; // EventEmitter, gắn bởi createWriter hoặc bên ngoài
    this.ws = null;
    this._depth = 0;
    this._sp = 0;
    this._pending = [];
    this._cols = new Map();
  }

  now() { return new Date().toISOString(); }
  get(sql, ...p) { return this.raw.prepare(sql).get(...bind(p)); }
  all(sql, ...p) { return this.raw.prepare(sql).all(...bind(p)); }
  run(sql, ...p) { return this.raw.prepare(sql).run(...bind(p)); }

  json(row) {
    if (!row) return row;
    const out = { ...row };
    for (const k of Object.keys(out)) {
      if ((JSON_COLS.has(k) || k.endsWith('_json')) && typeof out[k] === 'string') {
        try { out[k] = JSON.parse(out[k]); } catch { /* giữ nguyên chuỗi */ }
      }
    }
    return out;
  }

  tx(fn) {
    const check = (r) => { if (r && typeof r.then === 'function') throw new Error('Db.tx không nhận hàm async'); return r; };
    if (this._depth > 0) {
      const sp = `sp${++this._sp}`;
      this.raw.exec(`SAVEPOINT ${sp}`);
      this._depth++;
      try {
        const r = check(fn(this));
        this.raw.exec(`RELEASE ${sp}`);
        return r;
      } catch (e) {
        this.raw.exec(`ROLLBACK TO ${sp}`);
        this.raw.exec(`RELEASE ${sp}`);
        throw e;
      } finally { this._depth--; }
    }
    this.raw.exec('BEGIN IMMEDIATE');
    this._depth = 1;
    this._pending = [];
    let r;
    try {
      r = check(fn(this));
      this.raw.exec('COMMIT');
    } catch (e) {
      try { this.raw.exec('ROLLBACK'); } catch { /* đã rollback */ }
      this._pending = [];
      throw e;
    } finally { this._depth = 0; }
    const pending = this._pending;
    this._pending = [];
    for (const ev of pending) this._emit(ev);
    return r;
  }

  _emit(ev) { if (this.events) this.events.emit('change', ev); }
  // Phát sự kiện 'change' sau khi tx ngoài cùng commit (hoặc ngay nếu không trong tx).
  emitChange(ev) { if (this._depth > 0) this._pending.push(ev); else this._emit(ev); }

  nextDisplayId(ws, prefix) {
    const r = this.get(
      `INSERT INTO id_counters(workspace_id, prefix, last_seq) VALUES(?,?,1)
       ON CONFLICT(workspace_id, prefix) DO UPDATE SET last_seq = last_seq + 1 RETURNING last_seq`, ws, prefix);
    return fmtId(prefix, r.last_seq);
  }

  // Đảm bảo bộ đếm >= số của display_id được cấp tay (seed, id do agent đặt).
  bumpCounter(ws, displayId) {
    const m = /^([A-Z]+)-(\d+)$/.exec(displayId || '');
    if (!m) return;
    this.run(
      `INSERT INTO id_counters(workspace_id, prefix, last_seq) VALUES(?,?,?)
       ON CONFLICT(workspace_id, prefix) DO UPDATE SET last_seq = MAX(last_seq, excluded.last_seq)`, ws, m[1], parseInt(m[2], 10));
  }

  columns(table) {
    if (!this._cols.has(table)) {
      const cols = this.all(`PRAGMA table_info(${table})`).map((c) => c.name);
      if (!cols.length) throw new Error(`Bảng không tồn tại: ${table}`);
      this._cols.set(table, new Set(cols));
    }
    return this._cols.get(table);
  }

  // insertRow(table, fields, {prefix}) — tự điền id/workspace_id/thời gian/display_id; JSON hoá object.
  insertRow(table, fields, opts = {}) {
    const cols = this.columns(table);
    const now = this.now();
    const row = { ...fields };
    if (cols.has('id') && !row.id) row.id = ulid();
    if (cols.has('workspace_id') && !row.workspace_id) row.workspace_id = this.ws;
    if (cols.has('created_at') && !row.created_at) row.created_at = now;
    if (cols.has('updated_at') && !row.updated_at) row.updated_at = now;
    if (cols.has('display_id')) {
      if (row.display_id) this.bumpCounter(row.workspace_id, row.display_id);
      else if (opts.prefix) row.display_id = this.nextDisplayId(row.workspace_id, opts.prefix);
    }
    const keys = Object.keys(row).filter((k) => row[k] !== undefined);
    for (const k of keys) if (!cols.has(k)) throw new Error(`Cột không tồn tại: ${table}.${k}`);
    this.run(`INSERT INTO ${table}(${keys.join(',')}) VALUES(${keys.map(() => '?').join(',')})`, ...keys.map((k) => enc(row[k])));
    return cols.has('id') ? this.json(this.get(`SELECT * FROM ${table} WHERE id=?`, row.id)) : row;
  }

  // update(table, id, fields, {rowVersion}) → số hàng đổi; rowVersion lệch → WriteError conflict.
  update(table, id, fields, opts = {}) {
    const cols = this.columns(table);
    const f = { ...fields };
    if (cols.has('updated_at') && !f.updated_at) f.updated_at = this.now();
    const keys = Object.keys(f).filter((k) => f[k] !== undefined);
    for (const k of keys) if (!cols.has(k)) throw new Error(`Cột không tồn tại: ${table}.${k}`);
    const sets = keys.map((k) => `${k}=?`);
    if (cols.has('row_version')) sets.push('row_version=row_version+1');
    let sql = `UPDATE ${table} SET ${sets.join(',')} WHERE id=?`;
    const params = [...keys.map((k) => enc(f[k])), id];
    if (opts.rowVersion != null && cols.has('row_version')) { sql += ' AND row_version=?'; params.push(opts.rowVersion); }
    const r = this.run(sql, ...params);
    if (r.changes === 0 && opts.rowVersion != null) {
      throw new WriteError('conflict', 'Dữ liệu đã bị người khác sửa. Hãy tải lại rồi sửa tiếp.', { table, id });
    }
    return r.changes;
  }

  audit({ actor, entry, action, entity_type, entity_id, before, after, request_id }) {
    this.insertRow('audit_log', {
      ts: this.now(), actor, entry, action, entity_type: entity_type || null, entity_id: entity_id || null,
      before: before === undefined ? null : before, after: after === undefined ? null : after, request_id: request_id || null,
    }, { prefix: 'AU' });
  }

  close() { this.raw.close(); }
}

function fmtId(prefix, n) { return `${prefix}-${String(n).padStart(4, '0')}`; }

function migrate(db) {
  db.raw.exec('CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)');
  const applied = new Set(db.all('SELECT version FROM schema_migrations').map((r) => r.version));
  const dir = path.join(__dirname, '..', 'migrations');
  const files = fs.readdirSync(dir).filter((f) => /^\d{4}_.+\.sql$/.test(f)).sort();
  const pending = files.filter((f) => !applied.has(parseInt(f.slice(0, 4), 10)));
  if (pending.length && applied.size > 0 && db.file) {
    // backup trước khi migrate (DATABASE §2)
    const bdir = path.join(db.dataDir, 'backups');
    fs.mkdirSync(bdir, { recursive: true });
    const dest = path.join(bdir, `pre-migrate-${Date.now()}.db`).replace(/'/g, "''");
    db.raw.exec(`VACUUM INTO '${dest}'`);
  }
  for (const f of pending) {
    const sql = fs.readFileSync(path.join(dir, f), 'utf8');
    // `-- fk-off` ở dòng đầu: dựng lại bảng cần tắt foreign_keys NGOÀI transaction, rồi kiểm foreign_key_check sau khi commit
    const fkOff = /^--\s*fk-off\s*$/m.test(sql.split('\n', 3).join('\n'));
    for (const m of sql.matchAll(/^--\s*require-empty:\s*(\w+)\s*$/gm)) {   // tiền kiểm: bảng sắp bị dựng lại phải rỗng
      const n = db.get(`SELECT COUNT(*) AS n FROM ${m[1]}`).n;
      if (n) throw new Error(`Migration ${f}: bảng ${m[1]} đang có ${n} hàng nên không dựng lại được. Hãy sao lưu và xử lý dữ liệu này trước khi nâng cấp.`);
    }
    if (fkOff) db.raw.exec('PRAGMA foreign_keys=OFF');
    try {
      db.tx(() => {
        db.raw.exec(sql);
        db.run('INSERT INTO schema_migrations(version, applied_at) VALUES(?,?)', parseInt(f.slice(0, 4), 10), db.now());
      });
      if (fkOff) {
        const bad = db.all('PRAGMA foreign_key_check');
        if (bad.length) throw new Error(`Migration ${f}: foreign_key_check báo ${bad.length} vi phạm (${bad[0].table} → ${bad[0].parent}).`);
      }
    } finally { if (fkOff) db.raw.exec('PRAGMA foreign_keys=ON'); }
  }
  return pending;
}

// open(dataDir, {masterKey, memory}) → Db
function open(dataDir, opts = {}) {
  fs.mkdirSync(dataDir, { recursive: true });
  const file = opts.memory ? null : path.join(dataDir, 'studio.db');
  const raw = new DatabaseSync(file || ':memory:');
  raw.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; PRAGMA synchronous=NORMAL;');
  const db = new Db(raw, { dataDir, masterKey: opts.masterKey, file });
  migrate(db);
  let w = db.get('SELECT id FROM workspaces ORDER BY created_at LIMIT 1');
  if (!w) {
    const now = db.now();
    w = { id: ulid() };
    db.run('INSERT INTO workspaces(id,name,locale,timezone,created_at,updated_at) VALUES(?,?,?,?,?,?)',
      w.id, opts.workspaceName || 'Gen Studio', 'vi', process.env.TZ || 'Asia/Ho_Chi_Minh', now, now);
  }
  db.ws = w.id;
  return db;
}

module.exports = { open, migrate, Db, WriteError, fmtId };
