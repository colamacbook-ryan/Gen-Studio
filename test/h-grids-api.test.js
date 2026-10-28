// © 2026 Gen Labs — All rights reserved.
// Gói P0b — server/routes/*, server/grids/*, danh sách cổng theo loại bài trong API (SPEC-0.2.0 §2.4, §2.5, §13.2).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const dbm = require('../server/db');
const api = require('../server/api.js');
const state = require('../server/state');
const grids = require('../server/grids.js');
const gatesMod = require('../media/gates/index.js');
const { createWriter } = require('../server/write');
const { basics, lessonBody, owner } = require('./a-helpers');
const { tutorialBody } = require('./g-tutorial-fixtures');

const ROOT = path.join(__dirname, '..');
const EXT_MODULE = `exports.register = (op, ctx) => {
  ctx.ext.lessonExt.register({ name: 'thumbnail', columns: ['thumbnail'] });
};`;   // tutorial: module thật của gói U (server/ops/tutorial.js)
function env(src = EXT_MODULE) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-grid-')), ops = path.join(dir, 'ops'); fs.mkdirSync(ops);
  fs.writeFileSync(path.join(ops, 'x.js'), src);
  const db = dbm.open(path.join(dir, 'data'), { masterKey: 'a'.repeat(64) });
  return { dir, db, write: createWriter(db, { opsDirs: [ops] }), clean: () => { db.close(); fs.rmSync(dir, { recursive: true, force: true }); } };
}
const toAwaiting = (db, id, outputs) => {
  for (const s of ['voicing', 'judging', 'aligning', 'rendering', 'mixing']) state.transitionRender(db, id, s);
  state.transitionRender(db, id, 'gating', { outputs: { mp4: 'x' } });
  state.transitionRender(db, id, 'awaiting_review', { progress: 1, outputs });
};

test('routes/*: /api/overview chỉ còn ở routes/overview.js (không trùng); trùng route bị từ chối lúc khởi động; module route nhận rctx đủ', async () => {
  assert.ok(!/'\/api\/overview'/.test(fs.readFileSync(path.join(ROOT, 'server/api.js'), 'utf8')), 'api.js không còn route overview');
  assert.equal((fs.readFileSync(path.join(ROOT, 'server/routes/overview.js'), 'utf8').match(/'\/api\/overview'/g) || []).length, 1);
  const e = env();
  const routesDirs = [], mk = (name, src) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-routes-')); fs.writeFileSync(path.join(d, name), src); routesDirs.push(d); return d; };
  try {
    const ctx = { db: e.db, write: e.write, config: { dataDir: e.dir, version: 't' }, events: {}, deps: {} };
    assert.doesNotThrow(() => api.create(ctx), 'cấu hình mặc định nạp được');
    const dup = mk('dup.js', "exports.register = (add) => add('GET', '/api/overview', { sess: true }, async () => ({}));");
    assert.throws(() => api.create(Object.assign({}, ctx, { routesDirs: [dup] })), /route trùng GET \/api\/overview/);
    const good = mk('x.js', `exports.register = (add, r) => add('GET', '/api/x/:id', { pub: true }, async (c) => ({ id: c.params.id, keys: ['db', 'write', 'config', 'actorOf', 'userActor', 'fail', 'need', 'J', 'send', 'readJson', 'firstChannel'].filter((k) => typeof r[k] !== 'undefined') }));`);
    const a = api.create(Object.assign({}, ctx, { routesDirs: [good] }));
    const srv = http.createServer((req, res) => a.handle(req, res, new URL(req.url, 'http://x')));
    await new Promise((r) => srv.listen(0, '127.0.0.1', r));
    try {
      const res = await fetch('http://127.0.0.1:' + srv.address().port + '/api/x/AB-1'); const j = await res.json();
      assert.equal(res.status, 200); assert.equal(j.id, 'AB-1'); assert.equal(j.keys.length, 11);
      assert.equal((await fetch('http://127.0.0.1:' + srv.address().port + '/api/overview')).status, 401, 'route overview vẫn cần phiên');
    } finally { srv.close(); }
  } finally { routesDirs.forEach((d) => fs.rmSync(d, { recursive: true, force: true })); e.clean(); }
});

test('grids/*: mỗi lưới một file, tên khớp, không trùng; cột mới (Loại, Ảnh bìa, Nhân vật chưa chốt, Quyền, Vai trò, Trạng thái nhân vật) đã có và lọc được', () => {
  const dir = path.join(ROOT, 'server/grids');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.js') && !f.startsWith('_'));
  assert.deepEqual(files.map((f) => f.slice(0, -3)).sort(), Object.keys(grids.GRIDS).sort());
  for (const f of files) assert.equal(require(path.join(dir, f)).name, f.slice(0, -3));
  assert.deepEqual(['review_queue', 'reviews', 'work_orders', 'lessons', 'runs', 'curriculum', 'cast', 'voice_clips', 'agents', 'auth_requests', 'providers', 'assets', 'channels', 'audit'].filter((n) => !grids.GRIDS[n]), []);
  const e = env();
  try {
    const b = basics(e.write, e.db);
    const l1 = e.write(b.o, 'lesson.submit', lessonBody(b));
    const l2 = e.write(b.o, 'lesson.submit', lessonBody(b, { title: 'Có bìa', thumbnail: { variants: [] } }));
    const l3 = e.write(b.o, 'lesson.submit', tutorialBody(b, { title: 'Hướng dẫn', thumbnail: { variants: [] } }));   // tutorial luôn có ảnh bìa khi tính năng ảnh bìa bật (gói U)
    const L = (q) => grids.runGrid(e.db, 'lessons', { q }).rows.map((r) => r.title).sort();
    assert.deepEqual(L('kind:tutorial'), ['Hướng dẫn']); assert.deepEqual(L('kind:lesson'), ['Bài thử', 'Có bìa']); assert.deepEqual(L('thumbnail:true'), ['Có bìa', 'Hướng dẫn']); assert.deepEqual(L('thumbnail:false'), ['Bài thử']);
    // review_queue: loại, có ảnh bìa, nhân vật chưa chốt
    toAwaiting(e.db, l2.render.id, { thumbs: [{ variant: 0, w1280: 'AS-1', w1920: 'AS-2', pass: true, score: 1 }] });
    toAwaiting(e.db, l1.render.id, undefined);
    const rq = grids.runGrid(e.db, 'review_queue', {});
    const row = (id) => rq.rows.find((r) => r.render === id);
    assert.equal(row(l2.render.display_id).thumbs, 1); assert.equal(row(l1.render.display_id).thumbs, 0); assert.equal(row(l1.render.display_id).kind, 'lesson');
    assert.equal(row(l1.render.display_id).cast_unapproved, 2, 'cả hai nhân vật còn draft');
    const cm = e.db.get('SELECT id FROM cast_members WHERE display_id=?', b.m1.display_id);
    e.db.update('cast_members', cm.id, { status: 'approved', approved_version: 1, approved_by: b.o.id, approved_at: e.db.now() });
    assert.equal(grids.runGrid(e.db, 'review_queue', { q: 'cast_unapproved>0' }).rows.length, 2); assert.equal(grids.runGrid(e.db, 'review_queue', {}).rows.find((r) => r.render === l1.render.display_id).cast_unapproved, 1);
    assert.equal(grids.runGrid(e.db, 'review_queue', { q: 'thumbs:true' }).rows.length, 1);
    // cast: trạng thái
    const g = grids.runGrid(e.db, 'cast', { q: 'status:approved' });
    assert.deepEqual(g.rows.map((r) => [r.display_id, r.status, r.approved_version]), [[b.m1.display_id, 'approved', 1]]);
    assert.equal(grids.runGrid(e.db, 'cast', { q: 'status:draft' }).rows.length, 1);
  } finally { e.clean(); }
});

test('API: danh sách cổng của Render theo loại bài + dữ liệu bài (8 / 9 với thumbnail / 10 với tutorial); cổng đã chạy hiện kết quả', () => {
  const e = env();
  try {
    const b = basics(e.write, e.db);
    const view = (body) => api.renderView(e.db, e.db.json(e.db.get('SELECT * FROM renders WHERE display_id=?', e.write(b.o, 'lesson.submit', body).render.display_id)));
    const v8 = view(lessonBody(b, { title: 'A' })), v9 = view(lessonBody(b, { title: 'B', thumbnail: { variants: [] } })), v10 = view(tutorialBody(b, { title: 'C', thumbnail: { variants: [] } }));
    assert.deepEqual(v8.gates.map((g) => g.gate), gatesMod.gatesFor('lesson', {})); assert.equal(v8.gates.length, 8);
    assert.deepEqual(v9.gates.map((g) => g.gate), gatesMod.gatesFor('lesson', { thumbnail: 'x' })); assert.equal(v9.gates.length, 9);
    assert.equal(v10.gates.length, 10); assert.deepEqual(v10.gates.slice(-2).map((g) => g.gate), ['G-THUMB', 'G-CURSOR']);
    assert.ok(v10.gates.every((g) => g.result === 'pending')); assert.equal(v10.render.kind, 'tutorial'); assert.equal(v8.render.kind, 'lesson');
    const rid = e.db.get("SELECT id FROM renders WHERE display_id=?", v9.render.display_id).id;
    e.db.insertRow('gate_results', { subject_kind: 'render', subject_id: rid, gate: 'G-THUMB', result: 'pass', measure: { variants: [] }, attempt: 1, created_by: 'system' }, { prefix: 'GT' });   // DB không CHECK tên cổng (0003)
    const again = api.renderView(e.db, e.db.json(e.db.get('SELECT * FROM renders WHERE id=?', rid)));
    assert.equal(again.gates.find((g) => g.gate === 'G-THUMB').result, 'pass');
    // lessonDoc trả cột ext
    const l = e.db.json(e.db.get('SELECT * FROM lessons WHERE title=?', 'B'));
    assert.deepEqual(api.lessonDoc(e.db, l).thumbnail, { variants: [] }); assert.equal(api.lessonDoc(e.db, l).kind, 'lesson'); assert.equal(api.lessonDoc(e.db, e.db.json(e.db.get('SELECT * FROM lessons WHERE title=?', 'A'))).thumbnail, undefined);
  } finally { e.clean(); }
});

test('overview: reclaimable không vỡ khi outputs có thumbs (mảng) — assetIdsOf gom đúng mã asset', () => {
  const { assetIdsOf } = require('../server/routes/overview.js');
  assert.deepEqual(assetIdsOf({ mp4: 'A', thumbs: [{ w1280: 'B', w1920: 'C' }, { w1280: 'D' }], junk: 5, x: null }), ['A', 'B', 'C', 'D']);
  assert.deepEqual(assetIdsOf(null), []);
});
