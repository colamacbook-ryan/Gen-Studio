// © 2026 Gen Labs — All rights reserved.
// Gói D: scheduler — lịch HH:MM/cron hằng ngày, per_run, không mở trùng; WO assigned im lặng → mở lại → stalled.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { tmpDb, basics } = require('./a-helpers.js');
const sch = require('../server/scheduler.js');
const { createWriter } = require('../server/write.js');

test('d-scheduler: parseSchedule', () => {
  assert.deepEqual(sch.parseSchedule({ time: '06:00', per_run: 2 }), { h: 6, mi: 0, per_run: 2 });
  assert.deepEqual(sch.parseSchedule('07:30 daily'), { h: 7, mi: 30, per_run: 1 });
  assert.deepEqual(sch.parseSchedule({ cron: '15 6 * * *' }), { h: 6, mi: 15, per_run: 1 });
  assert.equal(sch.parseSchedule({ cron: 'weekly 06:00' }), null);
  assert.equal(sch.parseSchedule({ time: '25:00' }), null);
  assert.equal(sch.parseSchedule(null), null);
});

test('d-scheduler: mở WO new_lesson theo lịch, per_run, không mở trùng trong cùng khung', () => {
  const t = tmpDb();
  try {
    const b = basics(t.write, t.db);
    t.db.update('workspaces', t.db.ws, { timezone: 'Asia/Ho_Chi_Minh' });
    t.write(b.o, 'channel.update', { channel: b.ch.display_id, data: { schedule: { time: '06:00', per_run: 2 } } });
    for (let i = 1; i <= 3; i++) t.write(b.o, 'curriculum.save', { channel: b.ch.display_id, title: 'Mục ' + i, ord: i });
    const ctx = { db: t.db, write: t.write };
    const before = new Date();                       // WO ghi opened_at theo đồng hồ thật nên dùng mốc thật
    const after = new Date(Date.now() + 25 * 3600e3); // khung lịch kế tiếp
    const first = sch.openScheduled(ctx, before);
    assert.equal(first.length, 2, 'per_run = 2');
    assert.equal(sch.openScheduled(ctx, before).length, 0, 'không mở trùng trong cùng khung');
    const second = sch.openScheduled(ctx, after);
    assert.equal(second.length, 1, 'khung mới: còn 1 mục todo chưa có WO');
    const wos = t.db.all("SELECT kind, state, curriculum_node_id FROM work_orders");
    assert.equal(wos.length, 3); assert.ok(wos.every(w => w.kind === 'new_lesson' && w.state === 'open'));
    assert.equal(new Set(wos.map(w => w.curriculum_node_id)).size, 3);
    const ns = sch.nextSlot(t.db, after);
    assert.ok(Date.parse(ns) > after.getTime() && Date.parse(ns) - after.getTime() <= 24 * 3600e3);
    assert.match(ns, /T23:00:00\.000Z$/, '06:00 giờ VN = 23:00 UTC');
  } finally { t.clean(); }
});

test('d-scheduler: WO assigned quá nhịp sống → mở lại, đủ 3 lần → stalled', () => {
  const t = tmpDb();
  try {
    const b = basics(t.write, t.db);
    const cu = t.write(b.o, 'curriculum.save', { channel: b.ch.display_id, title: 'M' });
    const ag = t.write(b.o, 'agent.create', { name: 'A', scopes: ['read', 'compose', 'run'] }).agent;
    const wo = t.write(b.o, 'work_order.create', { channel: b.ch.display_id, kind: 'new_lesson', curriculum_node: cu.display_id, brief: 'x' });
    const state = require('../server/state.js');
    const ctx = { db: t.db, write: t.write };
    const far = d => new Date(Date.now() + d * 3600e3);
    for (let i = 0; i < 3; i++) {
      state.transitionWorkOrder(t.db, wo.id, 'assigned', { agent_id: ag.id });
      assert.deepEqual(sch.sweepStalled(ctx, new Date(), 15), [], 'còn trong hạn nhịp sống');
      const r = sch.sweepStalled(ctx, far(1), 15);
      assert.equal(r.length, 1);
      assert.equal(r[0].to, i < 2 ? 'open' : 'stalled');
    }
    assert.equal(t.db.get('SELECT state FROM work_orders WHERE id=?', wo.id).state, 'stalled');
  } finally { t.clean(); }
});
