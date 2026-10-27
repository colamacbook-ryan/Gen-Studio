// © 2026 Gen Labs — All rights reserved.
// Test gói A: máy trạng thái Render/WO, review (R2), trần unblock (CNS-035).
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const state = require('../server/state');
const { tmpDb, basics, lessonBody, agent } = require('./a-helpers');

const code = (c) => (e) => e.name === 'WriteError' && e.code === c;
const walk = (db, id, steps) => steps.forEach((s) => state.transitionRender(db, id, s));
const PIPE = ['voicing', 'judging', 'aligning', 'rendering', 'mixing', 'gating', 'awaiting_review'];

function setup() {
  const t = tmpDb();
  const b = basics(t.write, t.db);
  const r = t.write(b.o, 'lesson.submit', lessonBody(b));
  return { t, b, r };
}

test('pipeline đi đúng cạnh; cạnh sai bị từ chối', () => {
  const { t, r } = setup();
  assert.throws(() => state.transitionRender(t.db, r.render.id, 'gating'), code('conflict'));
  walk(t.db, r.render.id, PIPE);
  const rd = t.db.get('SELECT * FROM renders WHERE id=?', r.render.id);
  assert.equal(rd.state, 'awaiting_review'); assert.equal(rd.progress, 1);
  assert.throws(() => state.transitionRender(t.db, r.render.id, 'voicing'), code('conflict'));
  t.clean();
});

test('transitionRender không cho tự duyệt (approved/changes_requested/rejected từ awaiting_review)', () => {
  const { t, r } = setup();
  walk(t.db, r.render.id, PIPE);
  for (const to of ['approved', 'changes_requested', 'rejected']) {
    assert.throws(() => state.transitionRender(t.db, r.render.id, to), code('forbidden'));
  }
  t.clean();
});

test('waiting_quota cần waiting_until, quay lại bước được; manifest đóng băng một lần', () => {
  const { t, r } = setup();
  state.transitionRender(t.db, r.render.id, 'voicing');
  assert.throws(() => state.transitionRender(t.db, r.render.id, 'waiting_quota'), code('invalid'));
  const until = new Date(Date.now() + 3600e3).toISOString();
  const w = state.transitionRender(t.db, r.render.id, 'waiting_quota', { waiting_until: until });
  assert.equal(w.waiting_until, until);
  const v = state.transitionRender(t.db, r.render.id, 'voicing');
  assert.equal(v.waiting_until, null);
  walk(t.db, r.render.id, ['judging', 'aligning']);
  const m = { lines: { 'LN-0001': 'VC-0001' } };
  const rd = state.transitionRender(t.db, r.render.id, 'rendering', { manifest: m });
  assert.deepEqual(rd.manifest, m);
  assert.throws(() => state.transitionRender(t.db, r.render.id, 'mixing', { manifest: { khac: 1 } }), code('conflict'));
  state.transitionRender(t.db, r.render.id, 'mixing', { manifest: m, outputs: { mix: 'AS-1' } });
  t.clean();
});

test('review: agent / reviewer sai kênh / entry không phải ui đều bị từ chối', () => {
  const { t, b, r } = setup();
  walk(t.db, r.render.id, PIPE);
  const base = { renderId: r.render.display_id, decision: 'approved', notes: [], reviewSeconds: 5 };
  assert.throws(() => state.review(t.db, { ...base, user: agent(['read', 'compose', 'run']), entry: 'mcp' }), code('forbidden'));
  assert.throws(() => state.review(t.db, { ...base, user: { ...agent(['run']), role: 'owner' }, entry: 'ui' }), code('forbidden'));
  assert.throws(() => state.review(t.db, { ...base, user: b.o, entry: 'http' }), code('forbidden'));
  assert.throws(() => state.review(t.db, { ...base, user: b.o, entry: 'mcp' }), code('forbidden'));
  assert.throws(() => state.review(t.db, { ...base, user: { id: b.o.id, role: 'viewer' }, entry: 'ui' }), code('forbidden'));
  assert.equal(t.db.get('SELECT COUNT(*) n FROM reviews').n, 0);
  assert.equal(t.db.get('SELECT state FROM renders').state, 'awaiting_review');
  t.clean();
});

test('review approved: ghi review bất biến, render approved, giáo trình done', () => {
  const { t, b, r } = setup();
  const cu = t.write(b.o, 'curriculum.save', { channel: b.ch.display_id, title: 'C' });
  t.db.run('UPDATE lessons SET curriculum_node_id=?', t.db.get('SELECT id FROM curriculum_nodes').id);
  walk(t.db, r.render.id, PIPE);
  const rv = state.review(t.db, { user: b.o, renderId: r.render.display_id, decision: 'approved', notes: [], reviewSeconds: 42, entry: 'ui' });
  assert.equal(rv.display_id, 'RV-0001');
  assert.equal(t.db.get('SELECT state FROM renders').state, 'approved');
  assert.equal(t.db.get('SELECT status s FROM curriculum_nodes').s, 'done');
  assert.throws(() => t.db.run(`UPDATE reviews SET decision='rejected'`), /bất biến/);
  assert.throws(() => state.review(t.db, { user: b.o, renderId: r.render.display_id, decision: 'approved', entry: 'ui' }), code('conflict'));
  assert.ok(cu);
  t.clean();
});

test('changes_requested tự tạo WO revise có ghi chú ghim', () => {
  const { t, b, r } = setup();
  walk(t.db, r.render.id, PIPE);
  const rv = state.review(t.db, { user: b.o, renderId: r.render.id, decision: 'changes_requested', reviewSeconds: 30, entry: 'ui',
    notes: [{ pin_kind: 'line', pin_ref: 'LN-0001', at_ms: 1200, text: 'đọc chậm lại' }] });
  assert.equal(rv.work_order, 'WO-0001');
  const wo = t.db.get(`SELECT * FROM work_orders WHERE kind='revise'`);
  assert.equal(wo.state, 'open');
  assert.match(wo.brief, /đọc chậm lại/);
  assert.equal(wo.review_id, t.db.get('SELECT id FROM reviews').id);
  assert.equal(t.db.get('SELECT work_order_id w FROM reviews').w, wo.id);
  assert.equal(t.db.get('SELECT COUNT(*) n FROM review_notes').n, 1);
  assert.equal(t.db.get('SELECT state FROM renders').state, 'changes_requested');
  t.clean();
});

test('blocked → WO unblock; trần 2/bài, lần 3 → WO stalled (CNS-035)', () => {
  const { t, b, r } = setup();
  const lessonRef = r.lesson.display_id;
  let cur = r.render;
  const wos = () => t.db.all(`SELECT display_id d, state s FROM work_orders WHERE kind='unblock' ORDER BY display_id`);
  for (let i = 1; i <= 3; i++) {
    walk(t.db, cur.id, ['voicing']);
    state.transitionRender(t.db, cur.id, 'blocked', { blocked_reason: { code: 'gate_fail', text_human: 'G-PRON trượt', detail: { gate: 'G-PRON' } } });
    const rd = t.db.json(t.db.get('SELECT * FROM renders WHERE id=?', cur.id));
    assert.equal(rd.state, 'blocked'); assert.equal(rd.blocked_reason.code, 'gate_fail');
    assert.equal(wos().length, i);
    if (i < 3) {
      assert.equal(wos()[i - 1].s, 'open');
      // agent nộp version mới → render cũ superseded, render mới queued
      cur = t.write(b.o, 'lesson.submit', lessonBody(b, { lesson: lessonRef })).render;
    }
  }
  assert.deepEqual(wos().map((w) => w.s), ['open', 'open', 'stalled']);
  assert.match(t.db.get(`SELECT summary s FROM work_orders WHERE state='stalled'`).s, /trần 2/);
  t.clean();
});

test('state WO: cạnh hợp lệ, sai thì conflict', () => {
  const { t, b } = setup();
  const wo = t.write(b.o, 'work_order.create', { channel: b.ch.display_id, kind: 'manual', brief: 'x' });
  assert.throws(() => state.transitionWorkOrder(t.db, wo.id, 'fulfilled'), code('conflict'));
  state.transitionWorkOrder(t.db, wo.id, 'assigned');
  state.transitionWorkOrder(t.db, wo.id, 'stalled');
  state.transitionWorkOrder(t.db, wo.id, 'cancelled');
  assert.throws(() => state.transitionWorkOrder(t.db, wo.id, 'open'), code('conflict'));
  t.clean();
});

test('blocked lặp lại sau khi đã stalled không tạo thêm WO stalled trùng', () => {
  const { t, b, r } = setup();
  let cur = r.render;
  for (let i = 1; i <= 5; i++) {
    walk(t.db, cur.id, ['voicing']);
    state.transitionRender(t.db, cur.id, 'blocked', { blocked_reason: { code: 'gate_fail', text_human: 'x', detail: null } });
    cur = t.write(b.o, 'lesson.submit', lessonBody(b, { lesson: r.lesson.display_id })).render;
  }
  assert.equal(t.db.get(`SELECT COUNT(*) n FROM work_orders WHERE kind='unblock' AND state='stalled'`).n, 1);
  t.clean();
});
