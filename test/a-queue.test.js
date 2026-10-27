// © 2026 Gen Labs — All rights reserved.
// Test gói A: hàng đợi bền — lease, chạy bù, heartbeat, quota.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const queue = require('../server/queue');
const { tmpDb } = require('./a-helpers');

test('enqueue → lease → done; không cấp trùng run đang giữ lease', () => {
  const t = tmpDb();
  const r1 = queue.enqueue(t.db, { kind: 'voicing', payload: { x: 1 } });
  assert.equal(r1.display_id, 'RN-0001'); assert.deepEqual(r1.payload, { x: 1 });
  const got = queue.lease(t.db, ['voicing'], 'w1', 60000);
  assert.equal(got.id, r1.id); assert.equal(got.state, 'running'); assert.equal(got.attempt, 1); assert.equal(got.worker_id, 'w1');
  assert.equal(queue.lease(t.db, ['voicing'], 'w2', 60000), null);
  assert.equal(queue.lease(t.db, ['judging'], 'w2', 60000), null);
  const d = queue.done(t.db, r1.id, { ok: true });
  assert.equal(d.state, 'done'); assert.deepEqual(d.result, { ok: true }); assert.equal(d.lease_until, null);
  assert.equal(queue.lease(t.db, ['voicing'], 'w2', 60000), null);
  t.clean();
});

test('lease nhặt run hết hạn (chạy bù sau khi máy tắt giữa chừng)', () => {
  const t = tmpDb();
  const r = queue.enqueue(t.db, { kind: 'rendering' });
  queue.lease(t.db, ['rendering'], 'w1', -1000); // tiến trình chết: lease đã quá hạn
  const again = queue.lease(t.db, ['rendering'], 'w2', 60000);
  assert.equal(again.id, r.id); assert.equal(again.worker_id, 'w2'); assert.equal(again.attempt, 2);
  // heartbeat giữ lease: không bị nhặt
  queue.heartbeat(t.db, r.id, 60000, 0.5);
  assert.equal(queue.lease(t.db, ['rendering'], 'w3', 1000), null);
  assert.equal(t.db.get('SELECT progress p FROM runs').p, 0.5);
  t.clean();
});

test('thứ tự FIFO; fail ghi lỗi dạng {code,text_human}', () => {
  const t = tmpDb();
  const a = queue.enqueue(t.db, { kind: 'tts' });
  const b = queue.enqueue(t.db, { kind: 'tts' });
  assert.equal(queue.lease(t.db, ['tts'], 'w', 1000).id, a.id);
  assert.equal(queue.lease(t.db, ['tts'], 'w', 1000).id, b.id);
  const f = queue.fail(t.db, b.id, new Error('hỏng'));
  assert.equal(f.state, 'failed'); assert.equal(f.error.text_human, 'hỏng');
  t.clean();
});

test('waitQuota: chỉ được nhặt lại khi tới hạn', () => {
  const t = tmpDb();
  const r = queue.enqueue(t.db, { kind: 'voicing' });
  queue.lease(t.db, ['voicing'], 'w', 1000);
  queue.waitQuota(t.db, r.id, new Date(Date.now() + 3600e3).toISOString());
  assert.equal(queue.lease(t.db, ['voicing'], 'w', 1000), null);
  queue.waitQuota(t.db, r.id, new Date(Date.now() - 1000).toISOString());
  const got = queue.lease(t.db, ['voicing'], 'w', 1000);
  assert.equal(got.id, r.id); assert.equal(got.waiting_until, null);
  t.clean();
});

test('lease khi hai kết nối cùng mở file: chỉ một bên thắng', () => {
  const t = tmpDb();
  const dbm = require('../server/db');
  const second = dbm.open(t.dir);
  const r = queue.enqueue(t.db, { kind: 'mixing' });
  const a = queue.lease(t.db, ['mixing'], 'A', 60000);
  const b = queue.lease(second, ['mixing'], 'B', 60000);
  assert.equal(a.id, r.id); assert.equal(b, null);
  second.close();
  t.clean();
});
