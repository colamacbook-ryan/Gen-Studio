// © 2026 Gen Labs — All rights reserved.
// Gói UI-P2 (= UI-TUT) — Bài học: tỉ lệ qua UI-0 (theo fixture hợp đồng api-aspects.json), "Tạo lệnh bản {v}" (tutorial ⇒ tắt + lời §5.2),
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

test('P2 dùng UI-0 thật (components/aspect.js): không còn adapter, khoá lsn.asp.* đã bỏ, chữ "Tạo lệnh bản" + lý do tutorial ở aspect.*', async () => {
  const { MODULES, SHARED } = await load('i18n/index.js');
  assert.deepEqual(Object.keys(MODULES.lessons.vi).sort(), Object.keys(MODULES.lessons.en).sort());
  for (const lang of ['vi', 'en']) {
    for (const k of Object.keys(MODULES.lessons[lang])) assert.ok(!k.startsWith('lsn.asp.'), 'khoá adapter còn sót: ' + k);
    for (const k of ['lsn.make_other', 'lsn.tutorial_blocked']) assert.equal(MODULES.lessons[lang][k], undefined, k + ' đã chuyển sang aspect.*');
    for (const k of ['aspect.make_other', 'aspect.tutorial_blocked']) assert.ok(SHARED.aspect[lang][k], k);
  }
  for (const k of ['lesson', 'tutorial']) assert.ok(MODULES.lessons.vi['kind.' + k]);
  for (const f of ['views/lessons.js', 'views/review-room.js', 'views/channel-tabs/brand.js']) {
    const src = fs.readFileSync(path.join(STUDIO, f), 'utf8');
    assert.match(src, /import \* as A from '(\.\.\/)+components\/aspect\.js';/, f + ' nạp UI-0');
    assert.ok(!/AspectUI|ADAPTER UI-0|lsn\.asp\./.test(src), f + ' không còn adapter');
  }
  const css = fs.readFileSync(path.join(STUDIO, 'css', 'lessons.css'), 'utf8');
  assert.ok(!/\.asp-badge|\.asp-seg|\.fit-chip/.test(css), 'CSS adapter đã bỏ (css/aspect.css thay)');
  const src = fs.readFileSync(path.join(STUDIO, 'views', 'lessons.js'), 'utf8');
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
    assert.deepEqual(g.json.columns.map((c) => c.key).slice(0, 4), ['display_id', 'title', 'kind', 'aspect'], 'Loại + Tỉ lệ ngay sau Tiêu đề (1440 không cuộn ngang)');
  } finally { await t.clean(); }
});
