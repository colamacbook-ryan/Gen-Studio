// © 2026 Gen Labs — All rights reserved.
// Kho bí mật AES-256-GCM (masterKey hex 32 byte) + băm mật khẩu/token dùng chung.
'use strict';
const crypto = require('node:crypto');

function keyOf(db) {
  const hex = db.masterKey || process.env.GS_MASTER_KEY;
  if (!/^[0-9a-fA-F]{64}$/.test(hex || '')) throw new Error('Thiếu hoặc sai GS_MASTER_KEY (cần hex 32 byte).');
  return Buffer.from(hex, 'hex');
}

function put(db, ws, name, plaintext) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', keyOf(db), iv);
  c.setAAD(Buffer.from(`${ws}:${name}`));
  const ct = Buffer.concat([c.update(String(plaintext), 'utf8'), c.final(), c.getAuthTag()]);
  db.run(
    `INSERT INTO secrets(workspace_id, name, ciphertext, nonce, updated_at) VALUES(?,?,?,?,?)
     ON CONFLICT(workspace_id, name) DO UPDATE SET ciphertext=excluded.ciphertext, nonce=excluded.nonce, updated_at=excluded.updated_at`,
    ws, name, ct, iv, new Date().toISOString(),
  );
}

function get(db, ws, name) {
  const r = db.get('SELECT ciphertext, nonce FROM secrets WHERE workspace_id=? AND name=?', ws, name);
  if (!r) return null;
  const buf = Buffer.from(r.ciphertext);
  const d = crypto.createDecipheriv('aes-256-gcm', keyOf(db), Buffer.from(r.nonce));
  d.setAAD(Buffer.from(`${ws}:${name}`));
  d.setAuthTag(buf.subarray(buf.length - 16));
  return Buffer.concat([d.update(buf.subarray(0, buf.length - 16)), d.final()]).toString('utf8');
}

// Mật khẩu: scrypt$<saltHex>$<hashHex> (N=16384, r=8, p=1, 64 byte)
function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const h = crypto.scryptSync(String(pw), salt, 64);
  return `scrypt$${salt.toString('hex')}$${h.toString('hex')}`;
}
function verifyPassword(pw, stored) {
  const [alg, s, h] = String(stored || '').split('$');
  if (alg !== 'scrypt' || !s || !h) return false;
  const got = crypto.scryptSync(String(pw), Buffer.from(s, 'hex'), 64);
  const want = Buffer.from(h, 'hex');
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}
const hashToken = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');

module.exports = { put, get, hashPassword, verifyPassword, hashToken };
