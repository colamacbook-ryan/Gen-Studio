// © 2026 Gen Labs — All rights reserved.
// Gói UI-P2 (= UI-TUT) — Bài học: adapter tỉ lệ (theo fixture hợp đồng api-aspects.json), "Tạo lệnh bản {v}" (tutorial ⇒ tắt + lời §5.2),
// lời giao việc mặc định, route GET /api/lessons/:id/ext, POST /api/work_orders có aspect (owner) ⇒ lệnh 9:16.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { bootDemo, load, STUDIO } = require('./e-ui-w2-helpers.js');

const CAT = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'api-aspects.json'), 'utf8'));

test('P2 otherAspects: bài thường 16:9 ⇒ được tạo lệnh 9:16; tutorial ⇒ tắt kèm lời aspect_kind_unsupported; bài 9:16 ⇒ được tạo bản 16:9', async () => {
  const { otherAspects } = await load('views/lessons.js');
  const i = await load('i18n.js'); i.setLang('vi');
  const a = otherAspects(CAT, '16:9', 'lesson');
  assert.deepEqual(a.map((x) => [x.id, x.ok]), [['9:16', true]]);
  const tu = otherAspects(CAT, '16:9', 'tutorial');
  assert.equal(tu[0].ok, false);
  assert.match(tu[0].reason, /chỉ dựng được khung 16:9/);
  assert.deepEqual(otherAspects(CAT, '9:16', 'lesson').map((x) => [x.id, x.ok]), [['16:9', true]]);
  // tỉ lệ đã tắt không hiện
  const off = JSON.parse(JSON.stringify(CAT)); off.aspects[1].enabled = false;
  assert.deepEqual(otherAspects(off, '16:9', 'lesson'), []);
  assert.deepEqual(otherAspects(null, '16:9', 'lesson'), []);
});

test('P2 lời giao việc mặc định nêu bài, tỉ lệ và khoảng thời lượng mục tiêu của 9:16 (vi/en)', async () => {
  const { makeOrderBrief } = await load('views/lessons.js');
  const i = await load('i18n.js');
  i.setLang('vi');
  const s = makeOrderBrief({ id: 'LS-0001', title: 'Vì sao A.I. sai?', aspect: '9:16', def: CAT.aspects[1] });
  assert.match(s, /LS-0001/); assert.match(s, /9:16/); assert.match(s, /30–60 giây/);
  assert.ok(!/30–60/.test(makeOrderBrief({ id: 'LS-1', title: 'x', aspect: '16:9', def: CAT.aspects[0] })), '16:9 không có target_s');
  i.setLang('en'); assert.match(makeOrderBrief({ id: 'LS-1', title: 'x', aspect: '9:16', def: CAT.aspects[1] }), /Aim for 30–60 seconds/); i.setLang('vi');
});

test('P2 adapter UI-0: nhãn, tỉ lệ CSS, dọc/ngang; i18n lessons đủ khoá và vi = en', async () => {
  const { AspectUI } = await load('views/lessons.js');
  const { MODULES } = await load('i18n/index.js');
  assert.equal(AspectUI.ratioCss('9:16'), '9 / 16'); assert.equal(AspectUI.ratioCss('16:9'), '16 / 9');
  assert.equal(AspectUI.portrait('9:16'), true); assert.equal(AspectUI.portrait('16:9'), false);
  assert.equal(AspectUI.label('9:16'), MODULES.lessons.vi['lsn.asp.9x16']);
  assert.equal(AspectUI.def(CAT, '9:16').size[1], 1920);
  assert.deepEqual(Object.keys(MODULES.lessons.vi).sort(), Object.keys(MODULES.lessons.en).sort());
  for (const p of CAT.presets) assert.ok(MODULES.lessons.vi['lsn.asp.preset.' + p.id], p.id);
  for (const a of CAT.aspects) assert.ok(MODULES.lessons.vi['lsn.asp.' + a.token], a.token);
  for (const k of ['lesson', 'tutorial']) assert.ok(MODULES.lessons.vi['kind.' + k]);
  const src = fs.readFileSync(path.join(STUDIO, 'views', 'lessons.js'), 'utf8');
  assert.match(src, /ADAPTER UI-0/, 'chỗ nối UI-0 được đánh dấu');
  assert.match(src, /'\/api\/work_orders', \{ kind: 'manual', channel: [^}]*lesson: id, aspect: opt\.id, brief/, 'đúng hợp đồng F7 §10.5');
});

test('P2 HTTP: /api/lessons/:id/ext trả loại + tỉ lệ (+ kênh); owner tạo lệnh bản 9:16 ⇒ work_order.aspect = 9:16; tỉ lệ lạ ⇒ 400', async () => {
  const t = await bootDemo();
  try {
    const x = await t.api('GET', '/api/lessons/LS-0001/ext');
    assert.equal(x.status, 200, x.text);
    assert.equal(x.json.lesson, 'LS-0001');
    assert.ok(['lesson', 'tutorial'].includes(x.json.kind));
    assert.equal(x.json.aspect, '16:9');
    assert.equal(x.json.channel.display_id, 'CH-0001');
    assert.equal((await t.api('GET', '/api/lessons/LS-9999/ext')).status, 404);
    const wo = await t.api('POST', '/api/work_orders', { kind: 'manual', channel: 'CH-0001', lesson: 'LS-0001', aspect: '9:16', brief: 'Làm bản 9:16 của LS-0001' });
    assert.equal(wo.status, 201, wo.text);
    assert.equal(wo.json.work_order.aspect, '9:16');
    const bad = await t.api('POST', '/api/work_orders', { kind: 'manual', channel: 'CH-0001', lesson: 'LS-0001', aspect: '4:3', brief: 'x' });
    assert.equal(bad.status, 400);
    const g = await t.api('GET', '/api/grid/lessons?q=' + encodeURIComponent('aspect:16:9'));
    assert.equal(g.status, 200);
    assert.ok(g.json.columns.some((c) => c.key === 'aspect') && g.json.columns.some((c) => c.key === 'kind'), 'lưới có cột Tỉ lệ + Loại');
  } finally { await t.clean(); }
});
