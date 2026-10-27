// © 2026 Gen Labs — All rights reserved.
// Test gói A: DB, migration, display_id, trigger bất biến, secrets, config, seed.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const dbm = require('../server/db');
const secrets = require('../server/secrets');
const config = require('../server/config');
const { seedDemo } = require('../server/seed');
const { ulid } = require('../server/ids');
const { tmpDb, basics, lessonBody } = require('./a-helpers');

test('migration chạy 2 lần an toàn', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-m-'));
  const a = dbm.open(dir);
  const n = a.get('SELECT COUNT(*) n FROM schema_migrations').n;
  a.close();
  const b = dbm.open(dir);
  assert.equal(b.get('SELECT COUNT(*) n FROM schema_migrations').n, n);
  assert.equal(dbm.migrate(b).length, 0);
  assert.equal(b.all('SELECT id FROM workspaces').length, 1);
  assert.equal(b.get('PRAGMA foreign_keys').foreign_keys, 1);
  assert.equal(b.get('PRAGMA journal_mode').journal_mode, 'wal');
  b.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('display_id tăng dần, ulid đơn điệu', () => {
  const t = tmpDb();
  assert.equal(t.db.nextDisplayId(t.db.ws, 'LS'), 'LS-0001');
  assert.equal(t.db.nextDisplayId(t.db.ws, 'LS'), 'LS-0002');
  assert.equal(t.db.nextDisplayId(t.db.ws, 'RD'), 'RD-0001');
  const ids = Array.from({ length: 50 }, () => ulid());
  assert.deepEqual([...ids].sort(), ids);
  assert.equal(ids[0].length, 26);
  t.clean();
});

test('tx lồng: lỗi bên trong rollback savepoint, ngoài vẫn commit', () => {
  const t = tmpDb();
  t.db.tx(() => {
    t.db.nextDisplayId(t.db.ws, 'ZZ');
    assert.throws(() => t.db.tx(() => { t.db.nextDisplayId(t.db.ws, 'ZZ'); throw new Error('x'); }));
  });
  assert.equal(t.db.get(`SELECT last_seq s FROM id_counters WHERE prefix='ZZ'`).s, 1);
  t.clean();
});

test('trigger bất biến chặn UPDATE/DELETE', () => {
  const t = tmpDb();
  const b = basics(t.write, t.db);
  const r = t.write(b.o, 'lesson.submit', lessonBody(b));
  assert.throws(() => t.db.run(`UPDATE lines SET say='x'`), /bất biến/);
  assert.throws(() => t.db.run(`UPDATE beats SET params='{}'`), /bất biến/);
  assert.throws(() => t.db.run(`UPDATE lesson_versions SET note='x'`), /bất biến/);
  assert.throws(() => t.db.run(`UPDATE audit_log SET actor='x'`), /chỉ thêm/);
  assert.throws(() => t.db.run(`DELETE FROM audit_log`), /chỉ thêm/);
  assert.throws(() => t.db.run(`DELETE FROM lines`), /không xoá/);
  // manifest: gán lần đầu được, sửa lần hai thì không
  t.db.run(`UPDATE renders SET manifest='{"a":1}' WHERE id=?`, r.render.id);
  assert.throws(() => t.db.run(`UPDATE renders SET manifest='{"a":2}' WHERE id=?`, r.render.id), /manifest/);
  // state của lesson_versions được đổi, asset.media_present được đổi
  t.db.run(`UPDATE lesson_versions SET state='superseded'`);
  t.clean();
});

test('secrets AES-256-GCM khứ hồi, không lưu plaintext, sai khoá thì lỗi', () => {
  const t = tmpDb();
  secrets.put(t.db, t.db.ws, 'k', 'AIza-secret-123');
  assert.equal(secrets.get(t.db, t.db.ws, 'k'), 'AIza-secret-123');
  assert.equal(secrets.get(t.db, t.db.ws, 'none'), null);
  const raw = t.db.get('SELECT ciphertext c FROM secrets');
  assert.ok(!Buffer.from(raw.c).toString('latin1').includes('AIza'));
  secrets.put(t.db, t.db.ws, 'k', 'v2');
  assert.equal(secrets.get(t.db, t.db.ws, 'k'), 'v2');
  t.db.masterKey = 'ab'.repeat(32);
  assert.throws(() => secrets.get(t.db, t.db.ws, 'k'));
  const h = secrets.hashPassword('mk');
  assert.ok(secrets.verifyPassword('mk', h) && !secrets.verifyPassword('sai', h));
  t.clean();
});

test('config tự sinh .env, đọc biến môi trường', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-c-'));
  const c = config.load({ dataDir: dir, env: { GS_FAKE_PROVIDERS: '1', GS_CHROMIUM_PATH: '/x/chrome', GS_PUBLIC_URL: 'https://a.b', GS_LANG: 'en' } });
  assert.equal(c.port, 7490);
  assert.match(c.masterKey, /^[0-9a-f]{64}$/);
  assert.equal(c.fakeProviders, true);
  assert.equal(c.chromiumPath, '/x/chrome');
  assert.equal(c.publicUrl, 'https://a.b');
  assert.equal(c.lang, 'en');
  assert.equal(c.host, '127.0.0.1');
  assert.equal(c.ffmpegPath, 'ffmpeg');
  const env = fs.readFileSync(path.join(dir, '.env'), 'utf8');
  assert.match(env, /GS_MASTER_KEY=[0-9a-f]{64}/);
  assert.match(env, /GS_PORT=7490/);
  const c2 = config.load({ dataDir: dir, env: {} });
  assert.equal(c2.masterKey, c.masterKey);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('seedDemo idempotent và khớp BUILD-BRIEF §5', () => {
  const t = tmpDb();
  const prev = process.env.GS_DEMO_PASSWORD;
  process.env.GS_DEMO_PASSWORD = 'demo-pass';
  assert.ok(!seedDemo(t.db).skipped);
  assert.ok(seedDemo(t.db).skipped);
  if (prev === undefined) delete process.env.GS_DEMO_PASSWORD; else process.env.GS_DEMO_PASSWORD = prev;
  const ids = (sql) => t.db.all(sql).map((r) => r.display_id);
  assert.deepEqual(ids('SELECT display_id FROM work_orders ORDER BY display_id'), ['WO-0001', 'WO-0002', 'WO-0003', 'WO-0004', 'WO-0005']);
  assert.deepEqual(ids('SELECT display_id FROM curriculum_nodes ORDER BY display_id'), ['CU-0001', 'CU-0002', 'CU-0003', 'CU-0004']);
  assert.equal(t.db.get(`SELECT COUNT(*) n FROM lines l JOIN lesson_versions v ON v.id=l.lesson_version_id JOIN lessons s ON s.id=v.lesson_id WHERE s.display_id='LS-0001'`).n, 12);
  assert.equal(t.db.get(`SELECT COUNT(*) n FROM beats b JOIN lesson_versions v ON v.id=b.lesson_version_id JOIN lessons s ON s.id=v.lesson_id WHERE s.display_id='LS-0001' AND v.version=2`).n, 8);
  assert.equal(t.db.get(`SELECT state FROM renders WHERE display_id='RD-0003'`).state, 'changes_requested');
  for (const rd of ['RD-0004', 'RD-0005']) {
    assert.equal(t.db.get(`SELECT state FROM renders WHERE display_id=?`, rd).state, 'awaiting_review');
    assert.equal(t.db.get(`SELECT COUNT(*) n FROM gate_results g JOIN renders r ON r.id=g.subject_id WHERE r.display_id=? AND g.result='pass'`, rd).n, 8);
  }
  assert.equal(t.db.get(`SELECT work_order_id w FROM reviews`).w, t.db.get(`SELECT id FROM work_orders WHERE display_id='WO-0003'`).id);
  assert.equal(t.db.get(`SELECT COUNT(*) n FROM review_notes`).n, 1);
  assert.equal(t.db.get(`SELECT COUNT(*) n FROM runs WHERE display_id BETWEEN 'RN-0036' AND 'RN-0044'`).n, 9);
  assert.equal(t.db.get(`SELECT COUNT(*) n FROM providers`).n, 3);
  assert.equal(t.db.get(`SELECT state FROM work_orders WHERE display_id='WO-0005'`).state, 'stalled');
  assert.equal(t.db.nextDisplayId(t.db.ws, 'LS'), 'LS-0004');
  assert.ok(secrets.verifyPassword('demo-pass', t.db.get(`SELECT password_hash h FROM users`).h));
  t.clean();
});
