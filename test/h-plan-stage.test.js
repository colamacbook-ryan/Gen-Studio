// © 2026 Gen Labs — All rights reserved.
// Gói P0b — plan v2 từ buildPlan (SPEC-0.2.0 §2.1) + sân khấu: place fullbleed/track, PiP, layout actor, GSBrand (SPEC §13.2). Stub: tutorial/cursor-path/brand/thumb.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const chromium = require('../render/chromium');
const { openStage } = require('../render/render');
const reg = require('../render/blocks/registry');
const INDEX = require('../render/blocks/index.json');
const { buildPlan, PlanError } = require('../render/engine/timeline');
const brandMod = require('../render/brand');
const thumbMod = require('../render/thumb');
const cursorPath = require('../render/engine/cursor-path');
const tutorial = require('../render/engine/tutorial');
const cast = require('../render/cast');
const fx = require('./h-fixtures');

const HAS = chromium.find() ? false : 'không có Chromium';
const say = 'Anh Gen ơi, sao A.I. nói sai mà vẫn tự tin thế ạ?', toks = say.split(' ');
const clips = { 'LN-1': { duration_ms: toks.length * 300 + 200, word_times: toks.map((w, i) => ({ w, t0: i * 300, t1: i * 300 + 280 })), envelope: new Array(60).fill(0.5) },
  'LN-2': { duration_ms: 900, word_times: [{ w: 'Ừ', t0: 0, t1: 300 }, { w: 'đúng', t0: 300, t1: 800 }], envelope: new Array(27).fill(0.5) } };
const base = (extra) => Object.assign({ fps: 10, clips, channel: { name: 'K' },
  lesson: { title: 'T', lines: [{ id: 'LN-1', who: 'CM-0002', say }, { id: 'LN-2', who: 'CM-0001', say: 'Ừ đúng' }], beats: [{ id: 'B1', block: 'title', anchor: { line: 'LN-1', word: 'Anh' }, params: { text: 'Vì sao?' } }] } }, extra);

test('buildPlan v2: bài cũ ra đủ trường v2 với mặc định; actors có layout như sân khấu v0.1.x; vẫn là plan v2 hợp lệ', () => {
  const plan = buildPlan(base());
  assert.equal(plan.kind, 'lesson'); assert.equal(plan.variant, 'full'); assert.equal(plan.cursor, null); assert.equal(plan.screens, null);
  assert.deepEqual(plan.thumbs, []); assert.deepEqual(plan.assetRefs, []); assert.deepEqual(plan.persona, {}); assert.equal(plan.style.brand, null);
  assert.deepEqual(plan.actors.map(a => [a.side, a.layout]), [['left', { mode: 'stage', x: -40, y: 0, scale: 1 }], ['right', { mode: 'stage', x: 1500, y: 0, scale: 1 }]]);
  assert.deepEqual(fx.assetRefsErrors(plan.assetRefs), []); assert.deepEqual(fx.cursorSchemaErrors(plan.cursor), []);
  assert.deepEqual(Object.keys(plan.style).sort(), ['brand', 'meta', 'world', 'zones']); assert.deepEqual(fx.withV2Defaults(plan).persona, {});
  // v2 do pipeline/hook cấp qua input
  const p2 = buildPlan(base({ kind: 'lesson', variant: 'trailer', brand: { hash: 'h' }, thumbs: [{ template: 't' }], assetRefs: ['AS-1'], persona: { 'CM-0001': { role: 'host_lead' } },
    actorLayout: { 'CM-0002': { mode: 'pip', x: 10, scale: 0.9 } }, cursor: fx.CURSOR_FIXTURE, screens: [{ id: 'SC-1' }] }));
  assert.equal(p2.variant, 'trailer'); assert.deepEqual(p2.style.brand, { hash: 'h' }); assert.deepEqual(p2.thumbs, [{ template: 't' }]); assert.deepEqual(p2.assetRefs, ['AS-1']);
  assert.deepEqual(p2.persona, { 'CM-0001': { role: 'host_lead' } }); assert.deepEqual(p2.cursor, fx.CURSOR_FIXTURE); assert.deepEqual(p2.screens, [{ id: 'SC-1' }]);
  assert.deepEqual(p2.actors.find(a => a.id === 'CM-0002').layout, { mode: 'pip', x: 10, y: 0, scale: 0.9 });
});

test('buildPlan: kind theo registry — tutorial đi nhánh tutorial.js (stub ném PlanError), kind lạ bị từ chối; cursor-path stub = null hợp lệ', () => {
  assert.throws(() => buildPlan(base({ kind: 'tutorial' })), (e) => e instanceof PlanError && e.code === 'tutorial_unsupported');
  assert.throws(() => buildPlan(base({ lesson: Object.assign({ kind: 'tutorial' }, base().lesson) })), (e) => e.code === 'tutorial_unsupported', 'kind đọc cả từ lesson.kind');
  assert.throws(() => buildPlan(base({ kind: 'podcast' })), (e) => e.name === 'PlanError' && e.code === 'kind_unsupported');
  assert.throws(() => tutorial.buildTutorialPlan({}), (e) => e instanceof PlanError);
  assert.equal(cursorPath.compileCursor({}), null); assert.deepEqual(fx.cursorSchemaErrors(cursorPath.compileCursor({})), []);
});

test('chữ ký cố định: render/brand.js (bản thật của gói B), render/thumb.js thật (gói T), cast.library()/samples()', () => {
  assert.equal(brandMod.normalize({}), null); assert.equal(brandMod.normalize({ brand: [] }), null);
  const b = brandMod.normalize({ brand: { tokens: { ink: '#000000', paper: '#ffffff' } } });
  assert.equal(b.hash, brandMod.hash(Object.assign({}, b)), 'hash không tính hash/vars');
  assert.notEqual(brandMod.normalize({ brand: { preset: 'console' } }).hash, brandMod.normalize({ brand: { preset: 'tron' } }).hash);
  assert.deepEqual(brandMod.check(b), []); assert.ok(Object.keys(brandMod.cssVars(b)).includes('--v-ink')); assert.equal(brandMod.hash(null), null);
  assert.deepEqual(thumbMod.resolveThumbs({ variants: [] }, {}), []); assert.deepEqual(thumbMod.measure([], {}, null), { variants: [], passed: [] });   // gói T: measure thật
  const lib = cast.library(); assert.ok(Array.isArray(lib.parts) && lib.parts.length > 0); assert.match(lib.hash, /^[0-9a-f]{16}$/); assert.equal(cast.samples().length, 2);   // gói K thay stub: hash thật + 2 host mẫu
});

test('buildPlan: khối place fullbleed/track phủ cả khung, không vào vùng/máy quay', () => {
  const saved = INDEX.filter(e => ['screen', 'cursor'].includes(e.name)).map(e => e.enabled);
  const screen = require('../render/blocks/screen.js'), cursor = require('../render/blocks/cursor.js'), pl = [screen.place, cursor.place];
  INDEX.forEach(e => { if (['screen', 'cursor'].includes(e.name)) e.enabled = true; });
  screen.place = 'fullbleed'; cursor.place = 'track';
  try {
    const plan = buildPlan(base({ kind: 'lesson', lesson: { title: 'T', lines: base().lesson.lines, beats: [
      { id: 'B1', block: 'title', anchor: { line: 'LN-1', word: 'Anh' }, params: { text: 'Vì sao?' } },
      { id: 'B2', block: 'screen', anchor: { line: 'LN-1', word: 'sao' }, params: {} }, { id: 'B3', block: 'cursor', anchor: { line: 'LN-1', word: 'nói' }, params: {} }] } }));
    for (const id of ['B2', 'B3']) { const b = plan.beats.find(x => x.id === id); assert.deepEqual(b.slot, { x: 0, y: 0, w: 1920, h: 1080 }, id); assert.equal(b.zone, null, id); }
    assert.ok(plan.style.zones.every(z => !z.beats.includes('B2') && !z.beats.includes('B3')), 'không thuộc vùng nào');
  } finally { INDEX.filter(e => ['screen', 'cursor'].includes(e.name)).forEach((e, i) => { e.enabled = saved[i]; }); [screen.place, cursor.place] = pl; }
  assert.equal(reg.isEnabled('screen'), false, 'đã khôi phục: khối tutorial vẫn tắt');
});

async function withStage(fn) {
  const errors = [];
  const stage = await openStage({ errors });
  try { return await fn(stage, errors); } finally { await stage.close(); }
}
const load = (stage, plan) => stage.ev('window.__load(' + JSON.stringify(plan) + ')');

test('sân khấu: plan cũ (không layout) và layout mặc định đứng đúng chỗ v0.1.x; pip/hidden; 0 lỗi console', { skip: HAS }, async () => {
  await withStage(async (stage, errors) => {
    const plan = buildPlan(base());
    await load(stage, plan);
    const lefts = JSON.parse(await stage.ev('JSON.stringify([].map.call(document.querySelectorAll("#hud > .actor"), function (e) { return e.style.left; }))'));
    assert.deepEqual(lefts, ['-40px', '1500px']);
    assert.equal(await stage.ev('document.getElementById("pip").style.display'), 'none');
    const old = JSON.parse(JSON.stringify(plan)); old.actors.forEach(a => delete a.layout);   // plan v1: không có layout
    await load(stage, old);
    assert.deepEqual(JSON.parse(await stage.ev('JSON.stringify([].map.call(document.querySelectorAll("#hud > .actor"), function (e) { return e.style.left; }))')), ['-40px', '1500px']);
    // pip + hidden
    const p2 = JSON.parse(JSON.stringify(plan)); p2.actors[0].layout = { mode: 'pip', x: 0, y: 0, scale: 1 }; p2.actors[1].layout = { mode: 'hidden' };
    await load(stage, p2); await stage.ev('window.__seek(1500)');
    assert.equal(await stage.ev('document.querySelectorAll("#pip > .actor").length'), 1);
    assert.equal(await stage.ev('document.querySelectorAll("#hud > .actor").length'), 0);
    assert.notEqual(await stage.ev('document.getElementById("pip").style.display'), 'none');
    assert.equal(await stage.ev('window.__stats().actors'), 1, 'hidden không vẽ');
    assert.match(await stage.ev('document.querySelector("#pip > .actor").style.transform'), /^scale\(0\.5/);
    assert.ok((await stage.ev('document.querySelector("#pip > .actor svg") ? 1 : 0')) === 1, 'host PiP có SVG nhân vật');
    // layout stage tuỳ chỉnh: x, y, scale
    const p3 = JSON.parse(JSON.stringify(plan)); p3.actors[0].layout = { mode: 'stage', x: 100, y: 25, scale: 0.5 };
    await load(stage, p3); await stage.ev('window.__seek(3000)');
    assert.equal(await stage.ev('document.querySelector("#hud > .actor").style.left'), '100px');
    assert.match(await stage.ev('document.querySelector("#hud > .actor").style.transform'), /scale\(0\.5/);
    assert.deepEqual(errors, []);
  });
});

test('sân khấu: khối fullbleed/track vào lớp riêng (không chịu máy quay); ctx.layers; stub GSBrand.apply/inkFilter chỉ gọi khi cần', { skip: HAS }, async () => {
  const screen = require('../render/blocks/screen.js'), cursor = require('../render/blocks/cursor.js'), pl = [screen.place, cursor.place];
  const saved = INDEX.filter(e => ['screen', 'cursor'].includes(e.name)).map(e => e.enabled);
  INDEX.forEach(e => { if (['screen', 'cursor'].includes(e.name)) e.enabled = true; });
  screen.place = 'fullbleed'; cursor.place = 'track';
  try {
    const plan = buildPlan(base({ brand: { hash: 'abc' }, lesson: { title: 'T', lines: base().lesson.lines, beats: [
      { id: 'B1', block: 'title', anchor: { line: 'LN-1', word: 'Anh' }, params: { text: 'Vì sao?' } },
      { id: 'B2', block: 'screen', anchor: { line: 'LN-1', word: 'sao' }, params: {} }, { id: 'B3', block: 'cursor', anchor: { line: 'LN-1', word: 'nói' }, params: {} }] } }));
    await withStage(async (stage, errors) => {
      await stage.ev('window.GSBlockDefs.screen.place="fullbleed"; window.GSBlockDefs.cursor.place="track"; window.__applied=0; window.__ink=0;' +
        'window.GSBrand={apply:function(el,b){window.__applied++; window.__brand=b.hash;},inkFilter:function(s,b){window.__ink++; return s;}}');
      await load(stage, plan);
      assert.equal(await stage.ev('document.querySelectorAll("#layerFull > .b-screen").length'), 1, 'screen ở lớp fullbleed');
      assert.equal(await stage.ev('document.getElementById("layerTrack").children.length'), 1, 'cursor ở lớp track');
      assert.equal(await stage.ev('document.querySelectorAll("#world > .b-screen").length'), 0, 'không nằm trong trang vở (không theo máy quay)');
      assert.equal(await stage.ev('window.__applied'), 1); assert.equal(await stage.ev('window.__brand'), 'abc');
      const ink0 = await stage.ev('window.__ink'), redraws0 = await stage.ev('window.__stats().svgRedraws');
      assert.equal(ink0, redraws0, 'inkFilter chỉ chạy khi chuỗi SVG đổi (CNS-088)');
      await stage.ev('window.__seek(0)'); await stage.ev('window.__seek(0)');
      assert.equal(await stage.ev('window.__ink'), ink0, 'seek lại cùng t: không đổi chuỗi ⇒ không gọi lại');
      assert.deepEqual(errors, []);
    });
    // plan không có brand ⇒ không gọi GSBrand
    await withStage(async (stage) => {
      await stage.ev('window.__applied=0; window.GSBrand={apply:function(){window.__applied++;},inkFilter:function(s){window.__applied++;return s;}}');
      await load(stage, buildPlan(base()));
      assert.equal(await stage.ev('window.__applied'), 0);
    });
  } finally {
    INDEX.filter(e => ['screen', 'cursor'].includes(e.name)).forEach((e, i) => { e.enabled = saved[i]; }); [screen.place, cursor.place] = pl;
  }
});

test('sân khấu: GSBrand stub + GSThumb thật (gói T) có mặt; payload ảnh bìa không phải đặc tả ⇒ lỗi rõ (textOff thật: test/g-thumb-render.test.js)', { skip: HAS }, async () => {
  await withStage(async (stage, errors) => {
    assert.equal(await stage.ev('typeof window.GSBrand.apply + typeof window.GSBrand.inkFilter + typeof window.GSThumb.render + typeof window.GSThumb.textOff'), 'functionfunctionfunctionfunction');
    assert.equal(await stage.ev('window.GSThumb.stub'), false);
    await assert.rejects(stage.ev('window.__still("thumb", {label:"x"})'), /đặc tả ảnh bìa/);
    assert.deepEqual(errors, []);
  });
});
