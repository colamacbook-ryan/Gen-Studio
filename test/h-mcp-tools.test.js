// © 2026 Gen Labs — All rights reserved.
// Gói P0b — mcp-tools/*: tool cũ giữ nguyên tên, render_still (phạm vi, tần suất, assetRefs chỉ AS-…, ảnh thật), capabilities gộp từ module, lessonExt → inputSchema, lưới/route mới.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const dbm = require('../server/db');
const auth = require('../server/auth.js');
const chromium = require('../render/chromium');
const { createMcp } = require('../server/mcp.js');
const { createWriter } = require('../server/write');
const grids = require('../server/grids.js');
const { tmpDb, basics, owner } = require('./a-helpers');

const HAS = chromium.find() ? false : 'không có Chromium';
// 25 tool của 0.1.1 — tên KHÔNG đổi (chỉ chuyển module nội bộ)
const OLD_TOOLS = ['get_next_task', 'get_task', 'complete_task', 'report_problem', 'get_capabilities', 'get_channel', 'update_channel', 'list_cast', 'save_cast_member', 'render_cast_preview',
  'list_curriculum', 'save_curriculum_node', 'upload_asset', 'get_asset', 'validate_lesson', 'submit_lesson', 'update_lesson', 'get_lesson', 'list_lessons', 'get_render', 'run_lesson', 'get_run',
  'retry_run', 'list_review_notes', 'get_export'];
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32, 1)]);

function setup(deps, write) {
  const t = tmpDb(); if (write) t.write = write(t.db);
  const b = basics(t.write, t.db);
  const mcp = createMcp({ db: t.db, write: t.write, config: { version: 't', dataDir: t.dir, ffmpegPath: 'ffmpeg', chromiumPath: null }, deps });
  const mk = (scopes) => { const r = t.write(b.o, 'agent.create', { name: 'A' + scopes.join(''), scopes }); return auth.verifyAgentToken(t.db, r.token); };
  const rpc = async (c, method, params) => (await mcp.handle({ jsonrpc: '2.0', id: 1, method, params }, c)).result;
  const call = (c, name, args) => rpc(c, 'tools/call', { name, arguments: args || {} });
  return { t, b, mcp, mk, rpc, call };
}

test('mcp-tools: mọi tool 0.1.1 còn nguyên tên; thêm render_still; không có tool duyệt/xoá', () => {
  const { t, mcp } = setup();
  try {
    for (const n of OLD_TOOLS) assert.ok(mcp.tools.includes(n), n);
    assert.ok(mcp.tools.includes('render_still'));
    assert.ok(mcp.tools.includes('preview_tutorial_frame'), 'gói U: xem trước khung bài hướng dẫn');
    assert.equal(mcp.tools.length, OLD_TOOLS.length + 2);
    assert.equal(mcp.tools.filter(n => /approve|reject|delete|^review|remove|attest|pick|publish/.test(n)).length, 0, 'lớp quyết định của owner (§10) không có tool');
  } finally { t.clean(); }
});

test('render_still: phạm vi compose (read/run ✗), kiểm tham số, assetRefs chỉ AS-…, ảnh trả về dạng MCP image', async () => {
  const seen = [];
  const still = { async renderStill(o) { seen.push(o); return { buffer: Buffer.from('\xff\xd8\xffJPEGDATA', 'latin1'), measures: { mode: o.mode, stub: true }, errors: [], elapsed_ms: 12 }; } };
  const { t, b, mk, call, rpc } = setup({ still });
  try {
    const ro = mk(['read']), run = mk(['run']), compose = mk(['read', 'compose']);
    for (const [n, c] of [['read', ro], ['run', run]]) {
      const r = await call(c, 'render_still', { mode: 'cast' });
      assert.ok(r.isError && /forbidden/.test(r.content[0].text), n + ' ✗');
      assert.ok(!(await rpc(c, 'tools/list')).tools.some(x => x.name === 'render_still'), n + ' không thấy tool');
    }
    const ok = await call(compose, 'render_still', { mode: 'thumb', payload: { template: 'x', assetData: { x: 'data:evil' }, fontCss: 'body{}' }, size: [640, 360] });
    assert.ok(!ok.isError, ok.content[0].text);
    assert.equal(ok.content[1].type, 'image'); assert.equal(ok.content[1].mimeType, 'image/jpeg');
    assert.equal(Buffer.from(ok.content[1].data, 'base64').subarray(0, 3).toString('latin1'), '\xff\xd8\xff');
    assert.deepEqual([ok.structuredContent.mode, ok.structuredContent.size, ok.structuredContent.measures.stub], ['thumb', [640, 360], true]);
    assert.equal(seen[0].payload.assetData, undefined); assert.equal(seen[0].payload.fontCss, undefined, 'agent không tự nhét dữ liệu đã phân giải/CSS');
    assert.equal(seen[0].assetRoot, t.dir);
    await call(compose, 'render_still', { mode: 'frame', payload: { plan: { duration_ms: 1, fontCss: 'x{}', assetData: { a: 'data:evil' } }, t_ms: 0 } });
    assert.deepEqual(Object.keys(seen.at(-1).payload.plan), ['duration_ms'], 'frame: cũng gỡ assetData/fontCss trong plan');
    // tham số sai
    const bad = async (args, re) => { const r = await call(compose, 'render_still', args); assert.ok(r.isError && re.test(r.content[0].text), JSON.stringify(args) + ' → ' + r.content[0].text); };
    await bad({ mode: 'xyz' }, /mode phải là/);
    await bad({ mode: 'cast', size: [4000, 100] }, /size phải là/);
    await bad({ mode: 'cast', payload: [] }, /payload phải là object/);
    await bad({ mode: 'cast', payload: { blob: 'x'.repeat(300 * 1024) } }, /quá lớn/);
    await bad({ mode: 'thumb', payload: { assetRefs: ['media/ab/x.png'] } }, /mã asset AS-/);
    await bad({ mode: 'thumb', payload: { assetRefs: ['/etc/passwd'] } }, /mã asset AS-/);
    await bad({ mode: 'thumb', payload: { assetRefs: ['AS-9999'] } }, /Không có asset/);
    // AS-… hợp lệ được đổi sang đường dẫn kho (resolveAssets đọc), kèm maxPx
    const a = t.write(b.o, 'asset.put', { kind: 'image', mime: 'image/png', bytes: PNG });
    const r2 = await call(compose, 'render_still', { mode: 'brand', payload: { assetRefs: [{ asset: a.display_id, maxPx: [100, 50] }] }, format: 'png' });
    assert.ok(!r2.isError, r2.content[0].text); assert.equal(r2.content[1].mimeType, 'image/png');
    assert.match(seen.at(-1).payload.assetRefs[0].asset, /^media\/[0-9a-f]{2}\/[0-9a-f]{64}\.png$/); assert.deepEqual(seen.at(-1).payload.assetRefs[0].maxPx, [100, 50]);
  } finally { t.clean(); }
});

test('render_still: giới hạn 10 ảnh/phút/agent (agent khác không bị ảnh hưởng); still đầy hàng ⇒ rate_limited', async () => {
  let n = 0;
  const still = { async renderStill() { n++; return { buffer: Buffer.from('x'), measures: {}, errors: [] }; } };
  const { t, mk, call } = setup({ still });
  try {
    const a1 = mk(['compose']), a2 = mk(['compose']);
    for (let i = 0; i < 10; i++) assert.ok(!(await call(a1, 'render_still', { mode: 'cast' })).isError);
    const r = await call(a1, 'render_still', { mode: 'cast' });
    assert.ok(r.isError && /rate_limited/.test(r.content[0].text)); assert.equal(n, 10, 'lần thứ 11 không chạm still');
    assert.ok(!(await call(a2, 'render_still', { mode: 'cast' })).isError, 'agent khác có hạn mức riêng');
  } finally { t.clean(); }
  const full = { async renderStill() { throw Object.assign(new Error('đầy'), { code: 'still_queue_full' }); } };
  const s = setup({ still: full });
  try { const r = await s.call(s.mk(['compose']), 'render_still', { mode: 'cast' }); assert.ok(r.isError && /rate_limited/.test(r.content[0].text)); } finally { s.t.clean(); }
});

test('render_still: dựng thật bằng Chromium (mode cast ⇒ stub P0a) trả JPEG hợp lệ qua tool', { skip: HAS }, async () => {
  const { t, mk, call } = setup();
  try {
    const r = await call(mk(['compose']), 'render_still', { mode: 'cast', size: [640, 360] });
    assert.ok(!r.isError, r.content[0].text);
    const buf = Buffer.from(r.content[1].data, 'base64');
    assert.ok(buf[0] === 0xff && buf[1] === 0xd8 && buf.length > 1000);
    assert.deepEqual(r.structuredContent.errors, []);
  } finally { await require('../render/still').closeStill(); t.clean(); }
});

test('get_capabilities: gộp capabilities() của module; blocks_by_kind/gates_by_kind/kinds; không đè khoá lõi', async () => {
  const { t, mk, call } = setup();
  try {
    const r = await call(mk(['read']), 'get_capabilities', {});
    const d = r.structuredContent;
    assert.deepEqual(d.kinds, ['lesson', 'tutorial'], 'gói U khai kind tutorial');
    assert.deepEqual(d.blocks_by_kind.lesson.map(x => x.name), d.blocks.map(x => x.name));
    assert.ok(!d.blocks_by_kind.lesson.some(x => ['screen', 'cursor', 'focus', 'callout', 'keystroke', 'mock-ui'].includes(x.name)), 'khối tutorial không dùng cho bài thường');
    assert.ok(['screen', 'cursor', 'focus', 'callout', 'keystroke'].every(n => d.blocks_by_kind.tutorial.some(x => x.name === n)));
    assert.equal(d.gates_by_kind.lesson.length, 8); assert.equal(d.gates_by_kind.tutorial.at(-1), 'G-CURSOR');
    assert.ok(d.tutorial && d.tutorial.dsl.types.length === 16 && d.tutorial.keys.includes('Ctrl'), 'capabilities() của mcp-tools/tutorial.js');
    assert.ok(d.policy_fields_owner_only.includes('brand') && d.policy_fields_owner_only.includes('policy'));
  } finally { t.clean(); }
  // module capabilities tuỳ ý (qua cấu trúc mcp-tools) — kiểm bằng ctx.caps trực tiếp
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-cap-'));
  const db = dbm.open(dir, { masterKey: 'a'.repeat(64) });
  const write = createWriter(db);
  const o = owner(db); write(o, 'channel.create', { name: 'K' });
  const mcp = createMcp({ db, write, config: { version: 't' } });
  const caps = require('../server/mcp-tools/capabilities.js');
  const ctx = { db, write, config: { version: 't' }, caps: [() => ({ brand_presets: ['a'], app_version: 'ĐÈ?' }), () => { throw new Error('module hỏng'); }, caps.capabilities] };
  const tool = caps.tools(ctx)[0];
  const out = tool.handler({}, {});
  assert.deepEqual(out.data.brand_presets, ['a']);
  assert.notEqual(out.data.app_version, 'ĐÈ?', 'khoá lõi không bị module đè'); assert.ok(out.data.kinds, 'module hỏng không làm sập, module khác vẫn gộp');
  assert.ok(mcp.tools.length > 0); db.close(); fs.rmSync(dir, { recursive: true, force: true });
});

test('lessonExt → inputSchema của validate/submit/update_lesson; trường ext đi thẳng vào lesson.submit và update_lesson kế thừa', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-ops-'));
  fs.writeFileSync(path.join(dir, 'x.js'), `exports.register = (op, ctx) => ctx.ext.lessonExt.register({ name: 'thumbnail', columns: ['thumbnail'], schema: { properties: { thumbnail: { type: 'object' } } } });`);
  const { t, b, mk, call, rpc } = setup(undefined, (db) => createWriter(db, { opsDirs: [dir] }));
  try {
    const c = mk(['read', 'compose', 'run']);
    const list = (await rpc(c, 'tools/list')).tools;
    for (const n of ['validate_lesson', 'submit_lesson', 'update_lesson']) assert.ok(list.find(x => x.name === n).inputSchema.properties.thumbnail, n + ' có thumbnail');
    assert.ok(!list.find(x => x.name === 'get_lesson').inputSchema.properties.thumbnail);
    const body = { channel: b.ch.display_id, title: 'T', lines: [{ who: b.m1.display_id, say: 'Xin chào các bạn' }], beats: [{ block: 'title', anchor: { line: 0, word: 'chào' }, params: { text: 'Hi' } }], thumbnail: { variants: [] } };
    assert.ok((await call(c, 'validate_lesson', body)).structuredContent.ok);
    const s = await call(c, 'submit_lesson', body); assert.ok(!s.isError, s.content[0].text);
    assert.deepEqual(t.db.json(t.db.get('SELECT thumbnail FROM lesson_versions WHERE version=1')).thumbnail, { variants: [] });
    const u = await call(c, 'update_lesson', { lesson: s.structuredContent.lesson, title: 'T2' });   // KHÔNG gửi thumbnail
    assert.ok(!u.isError, u.content[0].text);
    assert.deepEqual(t.db.json(t.db.get('SELECT thumbnail FROM lesson_versions WHERE version=2')).thumbnail, { variants: [] }, 'update kế thừa');
    const g = await call(c, 'get_lesson', { lesson: s.structuredContent.lesson });
    assert.deepEqual(g.structuredContent.doc.thumbnail, { variants: [] }); assert.equal(g.structuredContent.doc.kind, 'lesson');
  } finally { t.clean(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('upload_asset: kết quả báo quyền (agent raster ⇒ pending, SVG ⇒ exempt); lưới assets có cột Quyền/Vai trò và lọc rights:pending', async () => {
  const { t, mk, call } = setup();
  try {
    const c = mk(['compose', 'read']);
    const png = await call(c, 'upload_asset', { kind: 'image', mime: 'image/png', data_base64: PNG.toString('base64'), meta: { role: 'screen' } });
    assert.equal(png.structuredContent.rights, 'pending'); assert.match(png.content[0].text, /CHỜ chủ xưởng xác nhận quyền/);
    const svg = await call(c, 'upload_asset', { kind: 'svg', mime: 'image/svg+xml', text: '<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></svg>' });
    assert.equal(svg.structuredContent.rights, 'exempt');
    const g = grids.runGrid(t.db, 'assets', { q: 'rights:pending' });
    assert.deepEqual(g.rows.map(r => r.display_id), [png.structuredContent.asset]);
    assert.equal(g.rows[0].role, 'screen'); assert.deepEqual(g.columns.map(x => x.key).slice(-2), ['role', 'rights']);
    assert.equal(grids.runGrid(t.db, 'assets', { q: 'rights:exempt' }).rows.length, 1);
    assert.equal(grids.runGrid(t.db, 'assets', { q: 'role:screen' }).rows.length, 1);
  } finally { t.clean(); }
});
