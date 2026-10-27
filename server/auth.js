// © 2026 Gen Labs — All rights reserved.
// Xác thực: owner (scrypt), phiên UI (cookie + CSRF), token agent, khoá một lần cho setup.
'use strict';
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const secrets = require('./secrets.js');

const SESSION_TTL_MS = 12 * 3600e3;
const ADMIN_KEY_TTL_MS = 30 * 60e3;
const sha = s => crypto.createHash('sha256').update(String(s)).digest('hex');
const eq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
function bad(code, text) { const e = new Error(text); e.code = code; e.text_human = text; e.detail = null; return e; }

function ownerExists(db) { return !!db.get("SELECT 1 AS x FROM users WHERE role='owner' AND deleted_at IS NULL"); }

// ---- khoá một lần cho setup ----
const adminKeyPath = dataDir => path.join(dataDir, 'run', 'admin-key');
function readFreshKey(dataDir) {
  const p = adminKeyPath(dataDir);
  try {
    const st = fs.statSync(p);
    if (Date.now() - st.mtimeMs > ADMIN_KEY_TTL_MS) return null;
    return fs.readFileSync(p, 'utf8').trim() || null;
  } catch { return null; }
}
// Chưa có owner: bảo đảm có khoá còn hạn (sinh mới nếu thiếu/hết hạn). Có owner: xoá khoá.
function ensureAdminKey(dataDir, db) {
  const p = adminKeyPath(dataDir);
  if (ownerExists(db)) { try { fs.unlinkSync(p); } catch { /* chưa có tệp */ } return null; }
  const cur = readFreshKey(dataDir);
  if (cur) return cur;
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const k = crypto.randomBytes(24).toString('base64url');
  fs.writeFileSync(p, k + '\n', { mode: 0o600 });
  return k;
}
function checkAdminKey(dataDir, k) {
  const cur = readFreshKey(dataDir);
  return !!(cur && k && eq(cur, k));
}
function consumeAdminKey(dataDir) { try { fs.unlinkSync(adminKeyPath(dataDir)); } catch { /* đã xoá */ } }

// ---- người dùng ----
function validatePassword(pw) {
  if (typeof pw !== 'string' || pw.length < 12) throw bad('invalid', 'Mật khẩu cần ít nhất 12 ký tự.');
}
function createOwner(db, { username, display_name, password, locale }) {
  username = String(username || '').trim();
  if (!/^[A-Za-z0-9._-]{3,40}$/.test(username)) throw bad('invalid', 'Tên đăng nhập 3–40 ký tự (chữ, số, . _ -).');
  validatePassword(password);
  return db.tx(() => {
    if (ownerExists(db)) throw bad('conflict', 'Đã có chủ xưởng; không thiết lập lại được.');
    const u = db.insertRow('users', {
      username, display_name: String(display_name || username).slice(0, 80), password_hash: secrets.hashPassword(password),
      role: 'owner', locale: locale === 'en' ? 'en' : 'vi', created_by: 'system',
    }, { prefix: 'US' });
    db.audit({ actor: 'system', entry: 'http', action: 'user.create_owner', entity_type: 'user', entity_id: u.display_id, after: { username } });
    return u;
  });
}
// Đặt lại mật khẩu owner (CLI `genstudio password`) → mật khẩu mới dạng vài từ dễ đọc.
const WORDS = ['mat', 'troi', 'bien', 'xanh', 'nui', 'cao', 'song', 'dai', 'hoa', 'sen', 'trang', 'sao', 'gio', 'may', 'mua', 'xuan', 'thu', 'ca', 'chim', 'rung', 'dao', 'mai', 'tre', 'lua', 'bep', 'den', 'lam', 'vang', 'bac', 'ngoc'];
function resetOwnerPassword(db) {
  const owner = db.get("SELECT * FROM users WHERE role='owner' AND deleted_at IS NULL ORDER BY created_at LIMIT 1");
  if (!owner) throw bad('not_found', 'Chưa có chủ xưởng. Hãy thiết lập lần đầu trên giao diện.');
  const pw = [0, 1, 2, 3].map(() => WORDS[crypto.randomInt(WORDS.length)]).join('-') + '-' + crypto.randomInt(10, 100);
  db.tx(() => {
    db.update('users', owner.id, { password_hash: secrets.hashPassword(pw) });
    db.run('DELETE FROM sessions WHERE user_id=?', owner.id);
    db.audit({ actor: 'cli', entry: 'cli', action: 'user.reset_password', entity_type: 'user', entity_id: owner.display_id });
  });
  return { username: owner.username, password: pw };
}
function checkLogin(db, username, password) {
  const u = db.get('SELECT * FROM users WHERE username=? AND deleted_at IS NULL', String(username || ''));
  // chạy scrypt cả khi không có user để thời gian phản hồi không lộ tên đăng nhập
  const ok = secrets.verifyPassword(String(password || ''), u ? u.password_hash : 'scrypt$00$00');
  return u && ok ? u : null;
}

// ---- phiên UI ----
function createSession(db, userId, { ua, ip } = {}) {
  const token = crypto.randomBytes(32).toString('base64url');
  const csrf = crypto.randomBytes(24).toString('base64url');
  const now = new Date();
  db.run('INSERT INTO sessions(token_hash, user_id, csrf_secret, expires_at, created_at, ua, ip) VALUES(?,?,?,?,?,?,?)',
    sha(token), userId, csrf, new Date(now.getTime() + SESSION_TTL_MS).toISOString(), now.toISOString(), String(ua || '').slice(0, 200), ip || null);
  db.run('UPDATE users SET last_login_at=? WHERE id=?', now.toISOString(), userId);
  return { token, csrf, maxAgeSec: SESSION_TTL_MS / 1000 };
}
function getSession(db, token) {
  if (!token || String(token).length > 200) return null;
  const s = db.get('SELECT * FROM sessions WHERE token_hash=?', sha(token));
  if (!s) return null;
  if (s.expires_at < new Date().toISOString()) { db.run('DELETE FROM sessions WHERE token_hash=?', s.token_hash); return null; }
  const user = db.get('SELECT * FROM users WHERE id=? AND deleted_at IS NULL', s.user_id);
  if (!user) return null;
  return { user, csrf: s.csrf_secret, tokenHash: s.token_hash };
}
function destroySession(db, token) { if (token) db.run('DELETE FROM sessions WHERE token_hash=?', sha(token)); }

// ---- token agent ----
function verifyAgentToken(db, token) {
  if (!token || String(token).length > 300) return null;
  const ag = db.get(
    `SELECT ag.* FROM agent_tokens t JOIN agents ag ON ag.id=t.agent_id
     WHERE t.token_hash=? AND t.revoked_at IS NULL AND ag.deleted_at IS NULL AND ag.status!='revoked'`, secrets.hashToken(token));
  if (!ag) return null;
  let scopes = [];
  try { scopes = JSON.parse(ag.scopes); } catch { scopes = []; }
  db.run("UPDATE agents SET last_call_at=?, status=CASE WHEN status='stalled' THEN 'active' ELSE status END WHERE id=?", new Date().toISOString(), ag.id);
  return { agent: ag, scopes };
}

// ---- HTTP helpers ----
function parseCookies(req) {
  const out = {};
  String(req.headers.cookie || '').split(';').forEach(p => { const i = p.indexOf('='); if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); });
  return out;
}
function bearer(req) { const m = /^Bearer\s+(\S+)$/i.exec(req.headers.authorization || ''); return m ? m[1] : null; }

// Chặn dò mật khẩu: 8 lần sai / 5 phút / IP.
const fails = new Map();
function loginThrottled(ip) { const f = fails.get(ip); return !!(f && f.n >= 8 && Date.now() < f.until); }
function loginFailed(ip) { const f = fails.get(ip); const t = Date.now(); if (!f || t > f.until) fails.set(ip, { n: 1, until: t + 300e3 }); else f.n++; }
function loginOk(ip) { fails.delete(ip); }

module.exports = {
  ownerExists, ensureAdminKey, checkAdminKey, consumeAdminKey, createOwner, resetOwnerPassword, checkLogin, validatePassword,
  createSession, getSession, destroySession, verifyAgentToken, parseCookies, bearer, eq, loginThrottled, loginFailed, loginOk,
};
