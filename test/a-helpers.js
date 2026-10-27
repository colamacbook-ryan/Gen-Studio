// © 2026 Gen Labs — All rights reserved.
// Tiện ích dùng chung cho test gói A (không phải file test).
'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const dbm = require('../server/db');
const { createWriter } = require('../server/write');

const KEY = crypto.randomBytes(32).toString('hex');
function tmpDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-a-'));
  const db = dbm.open(dir, { masterKey: KEY });
  return { db, dir, write: createWriter(db), clean: () => { db.close(); fs.rmSync(dir, { recursive: true, force: true }); } };
}
const owner = (db) => {
  let u = db.get(`SELECT * FROM users WHERE username='owner1'`);
  if (!u) u = db.insertRow('users', { display_id: db.nextDisplayId(db.ws, 'US'), username: 'owner1', display_name: 'Owner', password_hash: 'x', role: 'owner' });
  return { type: 'user', id: u.id, role: 'owner', entry: 'ui' };
};
const agent = (scopes, id = 'AG-X') => ({ type: 'agent', id, scopes, entry: 'mcp' });

// Dựng kênh + 2 nhân vật; trả về display_id
function basics(write, db) {
  const o = owner(db);
  const ch = write(o, 'channel.create', { name: 'K', data: { schedule: { cron: '0 6 * * *' }, style: { a: 1 } } });
  const m1 = write(o, 'cast.save', { channel: ch.display_id, name: 'A', data: { look: {} } });
  const m2 = write(o, 'cast.save', { channel: ch.display_id, name: 'B', data: { look: {} } });
  return { o, ch, m1, m2 };
}
const lessonBody = (b, extra = {}) => ({
  channel: b.ch.display_id, title: 'Bài thử',
  lines: [
    { who: b.m1.display_id, say: 'Xin chào các bạn nhỏ', terms: [] },
    { who: b.m2.display_id, say: 'Hôm nay học về A.I. nhé' },
  ],
  beats: [{ block: 'title', anchor: { line: 0, word: 'chào' }, params: { text: 'Hi' } }],
  ...extra,
});
module.exports = { tmpDb, owner, agent, basics, lessonBody };
