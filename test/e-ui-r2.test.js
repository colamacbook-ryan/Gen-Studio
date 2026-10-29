// © 2026 Gen Labs — All rights reserved.
// Gói UI-R2 — Phòng chiếu: số đo G-SAFE/G-THUMB/G-CURSOR thành chữ (fixture hợp đồng measure-safe.json), khung theo tỉ lệ, chọn ảnh bìa,
// làn Con trỏ đánh dấu vi phạm G-CURSOR; route /room, thumbnail.pick + Đã đăng chỉ owner trên phiên UI (agent token ⇒ 403).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { bootDemo, load, request, STUDIO } = require('./e-ui-w2-helpers.js');

const SAFE = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'measure-safe.json'), 'utf8'));
const caseOf = (n) => SAFE.cases.find((c) => c.name === n);

test('R2 measureText: G-SAFE (pass/fail/unknown theo fixture), G-THUMB, G-CURSOR theo ngôn ngữ giao diện; không bao giờ ra JSON thô', async () => {
  const i = await load('i18n.js'); i.setLang('vi');
  const { measureText, safeItemText } = await load('views/review-room.js');
  assert.equal(measureText(caseOf('pass').measure, 'G-SAFE'), '0 vi phạm · chữ nhỏ nhất 31 px');
  const f = measureText(caseOf('fail').measure, 'G-SAFE');
  assert.match(f, /^4 vi phạm · chữ nhỏ nhất 20 px · 4 cảnh báo$/);
  assert.match(measureText(caseOf('unknown').measure, 'G-SAFE'), /Không có số đo/);   // không mẫu ⇒ câu của máy chủ
  assert.equal(measureText({ applicable: false }, 'G-SAFE'), 'không áp dụng cho 16:9');
  assert.equal(measureText({ variants: [{ index: 0, pass: true, score: 0.9, font_px: 118, contrast: 8.94 }, { index: 1, pass: false }], passed: [0] }, 'G-THUMB'), '1/2 phương án đạt · chữ 118 px · tương phản 8.9:1');
  assert.equal(measureText({ variants: [{ index: 0, pass: false }], passed: [] }, 'G-THUMB'), 'không phương án nào đạt');
  assert.equal(measureText({ checks: {}, steps: 7, clicks: 3, violation_count: 0 }, 'G-CURSOR'), '7 bước · 3 cú bấm · 0 vi phạm');
  i.setLang('en'); assert.equal(measureText(caseOf('pass').measure, 'G-SAFE'), '0 violations · smallest text 31 px'); i.setLang('vi');
  for (const v of [...caseOf('fail').measure.violations, ...caseOf('fail').measure.warnings]) {
    const s = safeItemText(v);
    assert.ok(s && !/[{}[\]"]/.test(s) && !/undefined|null/.test(s), s);
  }
  assert.match(safeItemText(caseOf('fail').measure.violations[3]), /chữ 20 px < 28 px/);
  assert.match(safeItemText(caseOf('fail').measure.warnings[2]), /191 s > Shorts 180 s/);
});

test('R2 khung theo tỉ lệ + chọn ảnh bìa: frameOf, pickedIndex (mã asset ↔ URL), bestIndex (bằng điểm ⇒ phương án trước)', async () => {
  const { frameOf, pickedIndex, bestIndex } = await load('views/review-room.js');
  assert.deepEqual(frameOf({ size: [1080, 1920] }), [1080, 1920]);
  assert.deepEqual(frameOf({ aspect: '9:16' }), [1080, 1920]);
  assert.deepEqual(frameOf({}), [1920, 1080]);
  const th = [{ variant: 0, pass: true, score: 0.8, w1280: '/media/AS-0010', w1920: '/media/AS-0011' }, { variant: 2, pass: true, score: 0.9, w1280: '/media/AS-0012' }, { variant: 3, pass: true, score: 0.9, w1280: '/media/AS-0013' }];
  assert.equal(pickedIndex(th, 'AS-0012'), 1); assert.equal(pickedIndex(th, 'AS-0011'), 0); assert.equal(pickedIndex(th, null), -1); assert.equal(pickedIndex(th, 'AS-9'), -1);
  assert.equal(bestIndex(th), 1); assert.equal(bestIndex([]), -1); assert.equal(bestIndex([{ pass: false, score: 1 }]), -1);
});

test('R2 làn Con trỏ: chỉ bài có bước con trỏ; bước có vi phạm G-CURSOR được đánh dấu kèm lý do', async () => {
  const { lane, cursorViolations } = await load('views/review-lanes/cursor.js');
  const i = await load('i18n.js'); i.setLang('vi');
  assert.equal(lane({ beats: [{ id: 'BT-1', block: 'title', t_in: 0 }], t: i.t }), null);
  const gates = [{ gate: 'G-CURSOR', measure: { violations: [{ check: 'C2', beat: 'BT-2', text: 'đích quá nhỏ' }] } }];
  assert.deepEqual([...cursorViolations(gates)], [['BT-2', ['C2: đích quá nhỏ']]]);
  const calls = [];
  const env = { beats: [{ id: 'BT-1', block: 'screen', t_in: 0, t_out: 500 }, { id: 'BT-2', block: 'cursor', t_in: 1000, t_out: 1200 }, { id: 'BT-3', block: 'focus', t_in: 2000, t_out: 5000 }], gates, t: i.t,
    total: () => 10000, addBlock: (...a) => calls.push(a) };
  const l = lane(env); assert.equal(l.key, 'cursor'); assert.equal(l.label, 'Con trỏ');
  l.draw(env, {});
  assert.equal(calls.length, 3);
  const bad = calls.find((c) => c[1] === 'U:BT-2');
  assert.match(bad[6], /\bbad\b/); assert.match(bad[5], /G-CURSOR: C2: đích quá nhỏ/);
  assert.match(calls.find((c) => c[1] === 'U:BT-1')[6], /\bpt\b/);
  assert.ok(!/#[0-9A-F]{6}/i.test(fs.readFileSync(path.join(STUDIO, 'views', 'review-lanes', 'cursor.js'), 'utf8')), 'không màu hex cứng trong làn');
});

test('R2 i18n review: vi = en, đủ luật S1–S6 và loại bước con trỏ', async () => {
  const { MODULES } = await load('i18n/index.js');
  const { vi, en } = MODULES.review;
  assert.deepEqual(Object.keys(vi).sort(), Object.keys(en).sort());
  for (let n = 1; n <= 6; n++) assert.ok(vi['rv.safe.rule.S' + n], 'S' + n);
  for (const k of ['cur', 'foc', 'cal', 'key', 'scr']) assert.ok(vi['rv.cur.' + k], k);
});

test('R2 HTTP: /room (nhân vật chưa chốt), chọn ảnh bìa (chỉ phương án đạt, owner UI), Đã đăng (chỉ bản đã duyệt); agent token ⇒ 403', async () => {
  const t = await bootDemo();
  try {
    const room = await t.api('GET', '/api/renders/RD-0004/room');
    assert.equal(room.status, 200, room.text);
    assert.equal(room.json.state, 'awaiting_review');
    assert.ok(Array.isArray(room.json.cast) && room.json.cast.length >= 1);
    assert.ok(room.json.cast.every((c) => c.approved === false && c.version >= 1), 'seed không bao giờ chốt nhân vật (CNS-095)');
    // chưa có ảnh bìa theo phương án ⇒ 400 rõ ràng
    assert.equal((await t.api('POST', '/api/renders/RD-0004/thumbnail', { variant: 0 })).status, 400);
    // gắn 2 phương án (1 đạt, 1 trượt) như pipeline (outputs chỉ ghi được khi Render còn trong pipeline)
    const rid = t.db.get("SELECT id FROM renders WHERE display_id='RD-0004'").id;
    t.db.run("UPDATE renders SET state='gating' WHERE id=?", rid);
    const out = JSON.parse(t.db.get('SELECT outputs FROM renders WHERE id=?', rid).outputs || '{}');
    out.thumbs = [{ variant: 0, w1280: 'AS-7001', w1920: 'AS-7002', pass: true, score: 0.9 }, { variant: 1, w1280: 'AS-7003', w1920: 'AS-7004', pass: false, score: 0.2 }];
    t.db.run('UPDATE renders SET outputs=? WHERE id=?', JSON.stringify(out), rid);
    t.db.run("UPDATE renders SET state='awaiting_review' WHERE id=?", rid);
    const ag = await request(t.base, 'POST', '/api/renders/RD-0004/thumbnail', { body: { variant: 0 }, token: 'gst_khong_hop_le', origin: t.base });
    assert.equal(ag.status, 403, 'agent không chọn ảnh bìa (§10)');
    assert.equal((await t.api('POST', '/api/renders/RD-0004/thumbnail', { variant: 1 })).status, 400, 'phương án trượt không chọn được');
    const ok = await t.api('POST', '/api/renders/RD-0004/thumbnail', { variant: 0 });
    assert.equal(ok.status, 200, ok.text);
    assert.equal((await t.api('GET', '/api/renders/RD-0004/room')).json.thumbnail_pick, 'AS-7001');
    // Đã đăng: chưa duyệt ⇒ 409; giá trị sai ⇒ 400; duyệt rồi ⇒ bật/tắt được
    assert.equal((await t.api('POST', '/api/renders/RD-0004/published', { published: true })).status, 409);
    assert.equal((await t.api('POST', '/api/renders/RD-0004/published', { published: 'yes' })).status, 400);
    assert.equal((await t.api('POST', '/api/renders/RD-0004/review', { decision: 'approved', notes: [], review_seconds: 12 })).status, 201);
    const on = await t.api('POST', '/api/renders/RD-0004/published', { published: true });
    assert.equal(on.status, 200, on.text);
    assert.ok((await t.api('GET', '/api/renders/RD-0004/room')).json.published_at);
    assert.equal((await t.api('POST', '/api/renders/RD-0004/published', { published: false })).status, 200);
    assert.equal((await t.api('GET', '/api/renders/RD-0004/room')).json.published_at, null);
    const agp = await request(t.base, 'POST', '/api/renders/RD-0004/published', { body: { published: true }, token: 'gst_khong_hop_le', origin: t.base });
    assert.equal(agp.status, 403);
    // renderView có tỉ lệ + cỡ để player dựng đúng khung
    const rv = await t.api('GET', '/api/renders/RD-0004');
    assert.equal(rv.json.render.aspect, '16:9');
  } finally { await t.clean(); }
});
