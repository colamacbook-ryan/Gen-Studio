// © 2026 Gen Labs — All rights reserved.
// Gói P0a — hợp đồng chung 0.2.0: registry khối theo index.json (3 nơi cùng nguồn), stage.html khớp index.json, GATES, plan v2 + plan.cursor, tên tool MCP duy nhất.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const reg = require('../render/blocks/registry');
const gates = require('../media/gates');
const genStage = require('../tools/gen-stage');
const { tmpDb } = require('./a-helpers.js');
const { createMcp } = require('../server/mcp.js');
const { buildPlan } = require('../render/engine/timeline');
const fx = require('./h-fixtures');
const ROOT = path.join(__dirname, '..');
const INDEX = JSON.parse(fs.readFileSync(path.join(ROOT, 'render/blocks/index.json'), 'utf8'));
const NINE = ['title', 'concept-chip', 'token-row', 'prob-card', 'stamp', 'takeaway', 'lesson-map', 'end-card', 'illustration'];
const SIX_TUT = ['screen', 'cursor', 'focus', 'callout', 'keystroke', 'mock-ui'];

test('index.json: 9 khối MVP bật + 6 khối tutorial tắt, mỗi mục có file tồn tại', () => {
  assert.deepEqual(INDEX.filter(e => e.enabled).map(e => e.name), NINE);
  assert.deepEqual(INDEX.filter(e => !e.enabled).map(e => e.name), SIX_TUT);
  INDEX.forEach(e => {
    assert.ok(fs.existsSync(path.join(ROOT, 'render/blocks', e.file)), e.file);
    assert.ok(Array.isArray(e.kinds) && e.kinds.length && typeof e.agent === 'boolean', e.name);
  });
  assert.equal(new Set(INDEX.map(e => e.name)).size, INDEX.length, 'tên khối duy nhất');
  SIX_TUT.forEach(n => assert.deepEqual(INDEX.find(e => e.name === n).kinds, ['tutorial']));
});

test('registry: names/list/validate suy ra từ index.json; khối tắt nạp được nhưng không nhận trong bài', () => {
  assert.deepEqual(reg.names(), NINE);
  assert.deepEqual(reg.list().map(b => b.name), NINE);
  assert.equal(reg.all().length, 15);
  SIX_TUT.forEach(n => {
    assert.ok(reg.get(n), n + ' vẫn nạp được');
    assert.equal(reg.isEnabled(n), false);
    const v = reg.validate(n, {}); assert.equal(v.ok, false); assert.match(v.errors[0], /chưa được bật/);
  });
  // kinds: token-row chỉ cho lesson
  assert.ok(reg.names('lesson').includes('token-row'));
  assert.ok(!reg.names('tutorial').includes('token-row'));
  assert.equal(reg.validate('token-row', { tokens: ['a'], next: 'b' }, 'tutorial').ok, false);
  assert.equal(reg.validate('title', { text: 'Hi' }, 'tutorial').ok, true);
});

test('ba nơi cùng nguồn index.json: registry.js · stage.html · server/write.js MVP_BLOCKS (+ index.browser.js)', () => {
  const enabled = INDEX.filter(e => e.enabled).map(e => e.name);
  // 1. registry
  assert.deepEqual(reg.names(), enabled);
  // 2. stage.html: thẻ <script> của khối đúng thứ tự index.json, không còn tên khối hardcode ngoài vùng sinh
  const html = fs.readFileSync(path.join(ROOT, 'render/stage/stage.html'), 'utf8');
  const region = html.slice(html.indexOf(genStage.BEGIN), html.indexOf(genStage.END));
  const tags = [...region.matchAll(/<script src="\.\.\/blocks\/([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(tags, ['index.browser.js'].concat(INDEX.map(e => e.file)));
  const outside = html.replace(region, '');
  INDEX.forEach(e => assert.ok(!outside.includes('../blocks/' + e.file), e.file + ' không được hardcode ngoài vùng sinh'));
  assert.equal(html, genStage.generate(html, INDEX), 'stage.html khớp gen-stage');
  assert.equal(fs.readFileSync(genStage.BROWSER_INDEX, 'utf8'), genStage.browserIndex(INDEX), 'index.browser.js khớp index.json');
  execFileSync(process.execPath, [path.join(ROOT, 'tools/gen-stage.js'), '--check']);   // lệch ⇒ thoát mã 1 ⇒ ném lỗi
  assert.ok(html.indexOf('registry.js') > html.indexOf(genStage.END), 'registry.js nạp sau các khối');
  // 3. write.js
  const { MVP_BLOCKS } = require('../server/write');
  assert.deepEqual(MVP_BLOCKS, enabled);
  assert.ok(!/MVP_BLOCKS\s*=\s*\[/.test(fs.readFileSync(path.join(ROOT, 'server/write.js'), 'utf8')), 'write.js không hardcode danh sách');
  assert.ok(!/NAMES\s*=\s*\[/.test(fs.readFileSync(path.join(ROOT, 'render/blocks/registry.js'), 'utf8')), 'registry.js không hardcode danh sách');
});

test('gen-stage --check: lệch index.json ⇒ đỏ', () => {
  const html = fs.readFileSync(path.join(ROOT, 'render/stage/stage.html'), 'utf8');
  const bad = html.replace('<script src="../blocks/stamp.js"></script>\n', '');
  assert.notEqual(bad, html);
  assert.notEqual(bad, genStage.generate(bad, INDEX), 'thiếu thẻ ⇒ generate sửa lại ⇒ lệch được phát hiện');
});

test('GATES (§2.5): 8 cổng cũ luôn áp; G-THUMB theo dữ liệu; G-CURSOR chỉ tutorial', () => {
  const ids = gates.GATES.map(g => g.id);
  assert.equal(new Set(ids).size, ids.length);
  const OLD8 = ['G-WAV', 'G-SCRIPT', 'G-PRON', 'G-LOUD', 'G-SYNC', 'G-MOTION', 'G-FRAMES', 'G-MUX'];
  assert.deepEqual(gates.gatesFor('lesson', {}), OLD8, 'bài cũ không có thumbnail ⇒ 8 cổng, hành vi không đổi');
  assert.deepEqual(gates.gatesFor('lesson', { thumbnail: null }), OLD8);
  assert.deepEqual(gates.gatesFor('lesson', { thumbnail: '{"variants":[]}' }), OLD8.concat('G-THUMB'));
  assert.deepEqual(gates.gatesFor('tutorial', {}), OLD8.concat('G-THUMB', 'G-CURSOR'));
  assert.deepEqual(gates.gatesFor(undefined, undefined), OLD8);
});

test('plan v2: bài v1 + mặc định = plan v2 hợp lệ (bài cũ dựng lại như trước)', () => {
  const say = 'Xin chào các bạn nhỏ', toks = say.split(' ');
  const clips = { 'LN-1': { duration_ms: 1400, word_times: toks.map((w, i) => ({ w, t0: i * 300, t1: i * 300 + 280 })), envelope: new Array(42).fill(0.5) } };
  const plan = buildPlan({ fps: 12, lesson: { title: 'T', lines: [{ id: 'LN-1', who: 'CM-0001', say }], beats: [{ id: 'B1', block: 'title', anchor: { line: 'LN-1', word: 'chào' }, params: { text: 'Hi' } }] }, clips, channel: { name: 'K' } });
  const v2 = fx.withV2Defaults(plan);
  assert.equal(v2.kind, 'lesson'); assert.equal(v2.variant, 'full'); assert.equal(v2.cursor, null); assert.equal(v2.screens, null);
  assert.deepEqual(v2.thumbs, []); assert.deepEqual(v2.assetRefs, []); assert.deepEqual(v2.persona, {});
  assert.deepEqual(Object.assign({}, v2, { kind: plan.kind }).beats, plan.beats, 'không đụng phần v1');
  assert.deepEqual(fx.assetRefsErrors([]), []);
  assert.deepEqual(fx.assetRefsErrors(['AS-1', { asset: 'a.png', maxPx: [200, 100], label: 'màn 1' }]), []);
  assert.equal(fx.assetRefsErrors([{ asset: '' }, { asset: 'x', maxPx: [0, 5] }]).length, 2);
});

test('plan.cursor: lược đồ cố định (CNS-113) — fixture hợp lệ, null hợp lệ, ca sai bị bắt', () => {
  assert.deepEqual(fx.cursorSchemaErrors(null), []);
  assert.deepEqual(fx.cursorSchemaErrors(fx.CURSOR_FIXTURE), []);
  const clone = () => JSON.parse(JSON.stringify(fx.CURSOR_FIXTURE));
  let c = clone(); c.keys[1].kind = 'laser'; assert.match(fx.cursorSchemaErrors(c).join(), /kind/);
  c = clone(); c.keys[2].t = 10; assert.match(fx.cursorSchemaErrors(c).join(), /giảm dần/);
  c = clone(); delete c.typing; assert.match(fx.cursorSchemaErrors(c).join(), /typing/);
  c = clone(); c.typing[0].t1 = 0; assert.match(fx.cursorSchemaErrors(c).join(), /t0 ≤ t1/);
  c = clone(); c.extra = 1; assert.match(fx.cursorSchemaErrors(c).join(), /khoá lạ/);
  assert.equal(fx.cursorSchemaErrors([]).length > 0, true);
  // tất định: hai lần JSON hoá trùng byte (F4-7 dựa vào đây)
  assert.equal(JSON.stringify(clone()), JSON.stringify(fx.CURSOR_FIXTURE));
});

test('MCP: tên tool duy nhất (hiện tại và mọi module server/mcp-tools/*.js về sau)', () => {
  const t = tmpDb();
  try {
    const mcp = createMcp({ db: t.db, write: t.write, config: { version: 't' } });
    const names = mcp.tools.slice();
    const dir = path.join(ROOT, 'server', 'mcp-tools');
    if (fs.existsSync(dir)) fs.readdirSync(dir).filter(f => f.endsWith('.js')).forEach(f => {
      const m = require(path.join(dir, f));
      if (typeof m.tools === 'function') m.tools({ db: t.db, write: t.write, config: { version: 't' } }).forEach(x => names.push(x.name));
    });
    const dup = names.filter((n, i) => names.indexOf(n) !== i);
    assert.deepEqual(dup, [], 'tool trùng tên: ' + dup.join(', '));
  } finally { t.clean(); }
});
