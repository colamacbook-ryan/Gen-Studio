// © 2026 Gen Labs — All rights reserved.
// Gói D: lưới — whitelist cột, parser ô truy vấn tham số hoá, footer.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { tmpDb } = require('./a-helpers.js');
const grids = require('../server/grids.js');
const { seedDemo } = require('../server/seed.js');

test('d-grids: parseQuery — cột:giá_trị, -loại trừ, so sánh số, cụm từ', () => {
  const g = grids.GRIDS.work_orders;
  const q = grids.parseQuery(g, 'state:open -kind:manual attempts>1 "bài mới"');
  assert.equal(q.conds.length, 4);
  assert.deepEqual(q.params.slice(0, 2), ['open', 'manual']);
  assert.equal(q.params[2], 1);
  assert.match(q.conds[3], /LIKE/);
  assert.ok(!/open|manual/.test(q.conds.join(' ')), 'giá trị không được nối vào SQL');
});
test('d-grids: cột lạ và toán tử sai bị từ chối; injection không thành SQL', () => {
  const g = grids.GRIDS.work_orders;
  assert.throws(() => grids.parseQuery(g, 'password:1'), e => e.code === 'invalid');
  assert.throws(() => grids.parseQuery(g, 'state>3'), e => e.code === 'invalid');
  assert.throws(() => grids.parseQuery(g, 'attempts:abc'), e => e.code === 'invalid');
  const q = grids.parseQuery(g, `brief:"x'; DROP TABLE work_orders; --"`);
  assert.equal(q.params.length, 1); assert.ok(!/DROP/.test(q.conds[0]));
});
test('d-grids: mọi lưới chạy được trên DB seed demo, có footer và cột', () => {
  const t = tmpDb();
  try {
    seedDemo(t.db);
    for (const name of Object.keys(grids.GRIDS)) {
      const r = grids.runGrid(t.db, name, {});
      assert.ok(Array.isArray(r.columns) && r.columns.length, name + ': thiếu cột');
      assert.ok(Array.isArray(r.rows), name);
      assert.ok(r.footer && 'matched' in r.footer, name + ': thiếu footer');
    }
    const rq = grids.runGrid(t.db, 'review_queue', {});
    assert.ok(rq.rows.length >= 2); assert.ok(rq.rows.every(x => /^RD-/.test(x.render)));
    const wo = grids.runGrid(t.db, 'work_orders', { q: 'state:stalled' });
    assert.ok(wo.rows.length >= 1 && wo.rows.every(r => r.state === 'stalled'));
    const not = grids.runGrid(t.db, 'work_orders', { q: '-state:fulfilled' });
    assert.ok(not.rows.every(r => r.state !== 'fulfilled'));
    const sorted = grids.runGrid(t.db, 'curriculum', { sort: '-ord' });
    assert.ok(sorted.rows[0].ord >= sorted.rows[sorted.rows.length - 1].ord);
    assert.throws(() => grids.runGrid(t.db, 'curriculum', { sort: 'drop_table' }), e => e.code === 'invalid');
    assert.throws(() => grids.runGrid(t.db, 'nope', {}), e => e.code === 'not_found');
    const cu = grids.runGrid(t.db, 'curriculum', {});
    assert.ok(cu.footer.total >= 4 && cu.footer.done >= 1);
  } finally { t.clean(); }
});
