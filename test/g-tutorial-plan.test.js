// © 2026 Gen Labs — All rights reserved.
// Gói U — plan bài hướng dẫn + cổng ghi (SPEC-0.2.0 §6.4–6.7, §6.10, §10): màn DSL → đích, máy quay theo vùng, PiP, bài mẫu "Tạo kênh đầu tiên" (F4-1) + trailer (F4-2);
// lessonExt tutorial kiểm khô (DSL, đích, host, nhạc, trailer 30–60 s, G-CURSOR khô); quyền asset (F4-4): asset.attest / revoke chỉ owner trên UI (mọi ô ✗ có test),
// raster/audio agent tải lên chưa xác nhận ⇒ rights_missing TRƯỚC khi dựng — kể cả khai role "illustration" hay dùng qua DSL image; owner tải lên qua UI chạy luôn.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const dbm = require('../server/db');
const pipeline = require('../server/pipeline.js');
const events = require('../server/events.js');
const rights = require('../server/rights.js');
const { createWriter } = require('../server/write');
const { tmpDb, basics, owner, agent } = require('./a-helpers');
const { tutorialBody, MINI_MOCK } = require('./g-tutorial-fixtures');
const { buildPlan } = require('../render/engine/timeline');
const T = require('../render/engine/tutorial');
const fx = require('./h-fixtures');
const { checkPlan } = require('../media/gates/cursor');
const fake = require('../agent/fake-agent.js');
const wav = require('../media/wav');

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const WAV = wav.encode({ rate: 24000, channels: 1, pcm: new Int16Array(2400) });

// dựng plan từ mẫu agent giả với thời lượng như TTS giả (≈ 73 ms/ký tự) — giống bản dựng e2e
function samplePlan(id) {
  const spec = fake.loadSample(id);
  const lines = spec.lines.map((l, i) => ({ id: 'LN-' + String(i + 1).padStart(4, '0'), who: 'CM-0001', say: l.say }));
  const clips = {}; lines.forEach(l => { clips[l.id] = { duration_ms: Math.max(4, Math.ceil(l.say.length / 3)) * 220 }; });
  const beats = spec.beats.map((b, i) => ({ id: 'BT-' + String(i + 1).padStart(4, '0'), block: b.block, params: b.params, anchor: { line: lines[b.anchor.line].id, word: b.anchor.word } }));
  return buildPlan({ kind: 'tutorial', variant: spec.extra.variant, clips, cast: { 'CM-0001': { name: 'Vy' } },
    lesson: { title: spec.title, kind: 'tutorial', variant: spec.extra.variant, lines, beats, host: { cast: 'CM-0001', mode: 'pip' }, screens: spec.extra.screens } });
}

test('F4-1 bài mẫu "Tạo kênh đầu tiên" (màn DSL): 60–90 s, ≥ 12 bước đủ move/click/type/scroll/drag/keystroke/focus; G-CURSOR khô đạt; tất định trùng byte', () => {
  const plan = samplePlan('tutorial');
  assert.ok(plan.duration_ms >= 60000 && plan.duration_ms <= 90000, 'độ dài ' + plan.duration_ms);
  const acts = new Set(plan.tutorial.steps.map(s => s.action));
  for (const a of ['move', 'click', 'type', 'scroll', 'drag']) assert.ok(acts.has(a), a);
  assert.ok(plan.beats.some(b => b.block === 'keystroke') && plan.beats.some(b => b.block === 'focus'));
  assert.ok(plan.beats.filter(b => ['cursor', 'focus', 'callout', 'keystroke'].includes(b.block) && !/AUTO/.test(b.id)).length >= 12);
  assert.deepEqual(checkPlan(plan).V, []);
  assert.deepEqual(fx.cursorSchemaErrors(plan.cursor), []); assert.deepEqual(fx.assetRefsErrors(plan.assetRefs), []);
  assert.equal(JSON.stringify(samplePlan('tutorial')), JSON.stringify(plan), 'F4-7: hai lần dựng plan trùng byte');
  // màn: 5 màn DSL, vừa hộp FIT, không lấn PiP, đích có sẵn từ id
  assert.equal(plan.screens.length, 5);
  for (const sc of plan.screens) {
    assert.equal(sc.kind, 'mock');
    assert.ok(sc.device.x >= T.FIT.x0 && sc.device.x + sc.device.w <= T.FIT.x1 && sc.device.y >= T.FIT.y0 && sc.device.y + sc.device.h <= T.FIT.y1 + 1, sc.id);
    assert.ok(sc.device.x > T.PIP.x + T.PIP.w, 'thiết bị không chồng PiP');
    assert.ok(Object.keys(sc.targets).length >= 8);
  }
  // máy quay: focus ⇒ phóng (1 < z ≤ 2,5), giữ, rồi về toàn màn; không cắt cứng (keyframe nội suy)
  for (const f of plan.tutorial.focus) {
    assert.ok(f.z > 1 && f.z <= 2.5, 'zoom ' + f.z);
    const mid = T.camAt(plan, (f.arrive + f.tEnd) / 2); assert.equal(+mid.z.toFixed(3), +f.z.toFixed(3));
    if (f.out) assert.equal(T.camAt(plan, f.out + 1).z, 1);
  }
  // host PiP (Q-16): một người nói, lớp HUD
  assert.deepEqual(plan.actors.map(a => a.layout.mode), ['pip']); assert.deepEqual(plan.tutorial.pip, T.PIP);
  assert.equal(plan.kind, 'tutorial'); assert.equal(plan.variant, 'full'); assert.equal(plan.style.zones.length, 0);
  assert.ok(plan.cues.some(c => c.name === 'tick') && plan.cues.some(c => c.name === 'swish'));
});

test('F4-2 trailer mẫu: 30–60 s, nhịp nhanh (LEAD 400 / GAP 200), thẻ kết CTA; G-CURSOR khô đạt với ngưỡng trailer 2 s', () => {
  const plan = samplePlan('tutorial-trailer');
  assert.equal(plan.variant, 'trailer');
  assert.ok(plan.duration_ms >= 30000 && plan.duration_ms <= 60000, 'độ dài ' + plan.duration_ms);
  assert.equal(plan.lines[0].a_ms, 400); assert.equal(plan.lines[1].a_ms - plan.lines[0].b_ms, 200);
  const end = plan.beats.find(b => b.block === 'end-card'); assert.equal(end.params.title, 'Dùng thử Gen-Studio'); assert.equal(end.params.sub, 'localhost:7490');
  assert.deepEqual(checkPlan(plan).V, []);
  const per10 = Math.min(...[0, 10000, 20000].map(t0 => plan.beats.filter(b => b.t_in >= t0 && b.t_in < t0 + 10000).length));
  assert.ok(per10 >= 3, '≥ 3 beat mỗi 10 s');
});

test('lessonExt tutorial: kiểm khô DSL/đích/host/nhạc/trailer/G-CURSOR; bài mẫu của agent giả hợp lệ với thời lượng ước theo chữ; kế thừa màn khi sửa', () => {
  const t = tmpDb();
  try {
    const b = basics(t.write, t.db), o = b.o;
    const bad = (extra, re) => assert.throws(() => t.write(o, 'lesson.submit', tutorialBody(b, extra)), re);
    bad({ screens: [] }, /cần ít nhất một màn hình/);
    bad({ screens: [{ id: 'SC-1', source: { mock: Object.assign({}, MINI_MOCK, { root: { type: 'window', children: [{ type: 'text', text: 'x', style: 'color:red' }] } }) } }] }, /style: thuộc tính không có/);
    bad({ screens: [{ id: 'SC-1', source: { mock: MINI_MOCK }, targets: { a: { x: 0, y: 0, w: 9, h: 9 } } }] }, /không khai size\/targets/);
    bad({ screens: [{ id: 'SC-1', source: { asset: 'AS-9999' }, size: [1280, 800] }] }, /asset có thật/);
    bad({ beats: [{ block: 'screen', anchor: { line: 0, word: 'các' }, params: { screen: 'SC-1' } }, { block: 'cursor', anchor: { line: 1, word: 'học' }, params: { action: 'click', target: 'khong_co' } }] }, /đích "khong_co" không có trên màn SC-1/);
    bad({ host: { mode: 'intro_outro' } }, /intro_outro.*chưa hỗ trợ/);
    bad({ host: { mode: 'pip', cast: b.m1.display_id } }, /PiP chỉ có 1 người nói/);
    bad({ variant: 'trailer' }, /trailer_length: Trailer ước/);
    bad({ music: { asset: 'AS-0001' } }, /music\.asset/);
    bad({ beats: [{ block: 'cursor', anchor: { line: 1, word: 'học' }, params: { action: 'type', target: 'in_name' } }] }, /gõ \(type\) cần chữ/);
    assert.throws(() => t.write(o, 'lesson.submit', tutorialBody(b, { kind: 'lesson', beats: [] })), /"screens" chỉ dùng cho bài loại tutorial/);
    // G-CURSOR khô: hai bước bấm sát nhau (con trỏ không kịp tới) ⇒ báo C3/C5 kèm BT
    bad({ beats: [{ block: 'screen', anchor: { line: 0, word: 'các' }, params: { screen: 'SC-1' } }, { block: 'cursor', anchor: { line: 0, word: 'bạn' }, params: { action: 'click', target: 'btn_ok' } },
      { block: 'cursor', anchor: { line: 0, word: 'nhỏ' }, params: { action: 'click', target: 'nav_home' } }] }, /G-CURSOR\.C[35].*ước theo chữ/);
    // hợp lệ ⇒ lưu cột; sửa không gửi screens ⇒ kế thừa
    const v1 = t.write(o, 'lesson.submit', tutorialBody(b));
    const lv = () => t.db.json(t.db.get('SELECT * FROM lesson_versions WHERE lesson_id=? ORDER BY version DESC LIMIT 1', v1.lesson.id));
    assert.equal(lv().kind, 'tutorial'); assert.equal(lv().screens[0].id, 'SC-1'); assert.deepEqual(lv().host, { mode: 'none' });
    const body2 = tutorialBody(b, { lesson: v1.lesson.display_id, title: 'Sửa' }); delete body2.screens; delete body2.kind; delete body2.host;
    t.write(o, 'lesson.submit', body2);
    assert.equal(lv().version, 2); assert.equal(lv().kind, 'tutorial'); assert.equal(lv().screens[0].id, 'SC-1', 'kế thừa màn');
    // mẫu của agent giả (Vy, PiP) — hợp lệ với thời lượng ƯỚC theo chữ (validate_lesson khô)
    const vy = t.write(o, 'cast.save', { channel: b.ch.display_id, name: 'Vy', data: { look: {} } });
    for (const id of ['tutorial', 'tutorial-trailer']) {
      const les = fake.sample([{ display_id: vy.display_id, name: 'Vy' }], { channel: b.ch, work_order: undefined }, fake.loadSample(id));
      const r = t.write(o, 'lesson.submit', les);
      assert.equal(t.db.get('SELECT kind, variant FROM lesson_versions WHERE id=?', r.version.id).variant, id === 'tutorial' ? 'full' : 'trailer');
    }
  } finally { t.clean(); }
});

test('asset.attest / asset.revoke_attest: CHỈ owner trên phiên UI (§10 — agent compose/run, owner qua HTTP, CLI, Trợ lý, hệ thống đều ✗); kiểm cơ sở quyền + tick che thông tin', () => {
  const t = tmpDb();
  try {
    const o = owner(t.db), ag = agent(['read', 'compose', 'run']);
    const png = t.write(ag, 'asset.put', { kind: 'image', bytes: PNG, mime: 'image/png', meta: { role: 'illustration' } });
    assert.equal(png.rights, 'pending', 'raster agent tải lên ⇒ chờ xác nhận (role chỉ là gợi ý)');
    const deny = [['agent compose', agent(['compose'])], ['agent run', agent(['run'])], ['owner qua HTTP', Object.assign({}, o, { entry: 'http' })], ['owner qua MCP', Object.assign({}, o, { entry: 'mcp' })],
      ['CLI', { type: 'cli', entry: 'cli' }], ['trợ lý', { type: 'assistant', entry: 'assistant' }], ['hệ thống', { type: 'system', id: 'x', entry: 'system' }], ['runner', { type: 'runner', entry: 'runner' }]];
    for (const opName of ['asset.attest', 'asset.revoke_attest']) for (const [name, a] of deny) {
      assert.throws(() => t.write(a, opName, { asset: png.display_id, basis: 'own_product', pii_redacted: true }), (e) => e.code === 'forbidden', `${opName} · ${name} phải bị từ chối`);
    }
    assert.equal(rights.statusOf(t.db, t.db.get('SELECT * FROM assets WHERE id=?', png.id)), 'pending');
    assert.throws(() => t.write(o, 'asset.attest', { asset: png.display_id, basis: 'owner_upload', pii_redacted: true }), /Cơ sở quyền/);
    assert.throws(() => t.write(o, 'asset.attest', { asset: png.display_id, basis: 'own_product' }), /che email/);
    assert.throws(() => t.write(o, 'asset.revoke_attest', { asset: png.display_id }), (e) => e.code === 'conflict');
    const svg = t.write(ag, 'asset.put', { kind: 'svg', bytes: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 4"><rect width="4" height="4"/></svg>'), mime: 'image/svg+xml' });
    assert.throws(() => t.write(o, 'asset.attest', { asset: svg.display_id, basis: 'own_product', pii_redacted: true }), /SVG và asset hệ thống không cần/);
    const r = t.write(o, 'asset.attest', { asset: png.display_id, basis: 'own_product', pii_redacted: true, note: 'Ảnh Gen-Studio của chính mình' });
    assert.deepEqual(r, { asset: png.display_id, rights: 'attested', basis: 'own_product' });
    const row = t.db.get("SELECT * FROM asset_rights WHERE asset_id=? ORDER BY rowid DESC LIMIT 1", png.id);
    assert.equal(row.action, 'attest'); assert.equal(row.pii_redacted, 1); assert.equal(row.by, o.id);
    const au = t.db.get("SELECT * FROM audit_log WHERE action='asset.attest' ORDER BY ts DESC LIMIT 1"); assert.ok(au && au.entity_id === png.display_id);
    // âm thanh: không cần tick PII
    const au2 = t.write(ag, 'asset.put', { kind: 'audio', bytes: WAV, mime: 'audio/wav' });
    assert.equal(t.write(o, 'asset.attest', { asset: au2.display_id, basis: 'licensed' }).rights, 'attested');
    // thu hồi ⇒ lại "chờ"; lịch sử chỉ thêm hàng
    assert.equal(t.write(o, 'asset.revoke_attest', { asset: png.display_id, note: 'đổi ý' }).rights, 'pending');
    assert.equal(t.db.get('SELECT COUNT(*) AS n FROM asset_rights WHERE asset_id=?', png.id).n, 2);
    assert.throws(() => t.db.run('DELETE FROM asset_rights'), /chỉ thêm/);
  } finally { t.clean(); }
});

// pipeline thật (timeline, hook, quyền), dựng/trộn/cổng là stub — đo cổng chặn trước bước dựng
function env() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-u-'));
  const db = dbm.open(path.join(dir, 'data'), { masterKey: 'a'.repeat(64) });
  const write = createWriter(db), calls = [];
  const deps = {
    render: { async renderPlan(o) { calls.push(o.plan); fs.mkdirSync(o.outDir, { recursive: true }); const c = path.join(o.outDir, 'cover.png'); fs.writeFileSync(c, PNG); return { framesPattern: path.join(o.outDir, 'f%05d.png'), frames: Math.ceil(o.plan.duration_ms / 1000 * 30), fps: 30, errors: [], sfx: {}, cover: c, thumbs: [] }; } },
    mix: { async mix({ out }) { fs.writeFileSync(out, 'RIFF'); return out; }, async mux({ out }) { fs.writeFileSync(out, 'mp4'); return out; } },
    gates: Object.assign({}, require('../media/gates/index.js'), { gateWavB: async () => ({ gate: 'G-WAV', result: 'pass', measure: { tier: 'b' } }),
      async renderGates() { return ['G-LOUD', 'G-SYNC', 'G-MOTION', 'G-FRAMES', 'G-MUX'].map(g => ({ gate: g, result: 'pass', measure: {} })).concat([{ gate: 'G-WAV', result: 'pass', measure: { tier: 'b' } }]); } }),
  };
  const ctx = { db, write, events: events.create(), config: { dataDir: path.join(dir, 'data'), fakeProviders: true, ffmpegPath: 'ffmpeg', chromiumPath: null, version: 'test' }, deps, pipelineOpts: { backoffMs: 1 } };
  return { db, write, ctx, calls, clean: () => { db.close(); fs.rmSync(dir, { recursive: true, force: true }); } };
}
async function run(e, actor, body) {
  const r = e.write(actor, 'lesson.submit', body);
  const w = pipeline.startWorkers(e.ctx, { pollMs: 20 });
  try { await w.idle(60000); } finally { w.stop(); }
  return e.db.json(e.db.get('SELECT * FROM renders WHERE display_id=?', r.render.display_id));
}

test('F4-4 quyền: ảnh màn / ảnh trong DSL (kể cả khai role illustration) / nhạc do agent tải lên chưa xác nhận ⇒ rights_missing TRƯỚC khi dựng; owner xác nhận hoặc tự tải qua UI ⇒ chạy', async () => {
  const e = env();
  try {
    const b = basics(e.write, e.db), o = b.o, ag = agent(['read', 'compose', 'run']);
    const shot = e.write(ag, 'asset.put', { kind: 'image', bytes: PNG, mime: 'image/png', meta: { role: 'screen' } });
    const illu = e.write(ag, 'asset.put', { kind: 'image', bytes: Buffer.concat([PNG, Buffer.from([1])]), mime: 'image/png', meta: { role: 'illustration' } });
    const music = e.write(ag, 'asset.put', { kind: 'audio', bytes: WAV, mime: 'audio/wav' });
    const shotScreen = [{ id: 'SC-1', source: { asset: shot.display_id }, size: [1280, 800], chrome: 'browser', targets: { btn_ok: { x: 1100, y: 40, w: 120, h: 44 }, in_name: { x: 300, y: 200, w: 600, h: 44 }, tg_on: { x: 300, y: 300, w: 52, h: 32 } }, redact: [{ x: 0, y: 0, w: 200, h: 30, style: 'mosaic' }] }];
    let r = await run(e, o, tutorialBody(b, { screens: shotScreen }));
    assert.equal(r.state, 'blocked'); assert.equal(r.blocked_reason.code, 'rights_missing'); assert.deepEqual(r.blocked_reason.detail.assets, [shot.display_id]);
    assert.equal(e.calls.length, 0, 'không đốt công dựng');
    const dslImg = JSON.parse(JSON.stringify(MINI_MOCK)); dslImg.root.children[1].children.push({ type: 'image', asset: illu.display_id, w: 200, h: 120 });
    r = await run(e, o, tutorialBody(b, { screens: [{ id: 'SC-1', source: { mock: dslImg } }] }));
    assert.equal(r.blocked_reason.code, 'rights_missing'); assert.deepEqual(r.blocked_reason.detail.assets, [illu.display_id], 'DSL image, role illustration vẫn cần xác nhận');
    r = await run(e, o, tutorialBody(b, { music: { asset: music.display_id } }));
    assert.equal(r.blocked_reason.code, 'rights_missing'); assert.deepEqual(r.blocked_reason.detail.assets, [music.display_id], 'nhạc nền');
    // owner xác nhận một lần ⇒ dựng được (plan nhận đường dẫn trong kho, màn hạ cỡ ≤ 2× hiển thị)
    for (const a of [shot, illu]) e.write(o, 'asset.attest', { asset: a.display_id, basis: 'own_product', pii_redacted: true });
    e.write(o, 'asset.attest', { asset: music.display_id, basis: 'licensed' });
    r = await run(e, o, tutorialBody(b, { screens: shotScreen, music: { asset: music.display_id, gain_db: -20 } }));
    assert.notEqual(r.blocked_reason && r.blocked_reason.code, 'rights_missing', JSON.stringify(r.blocked_reason));
    const plan = e.calls.at(-1);
    assert.equal(plan.kind, 'tutorial'); assert.match(plan.screens[0].asset, /^media\/[0-9a-f]{2}\/[0-9a-f]{64}\.png$/);
    const ref = plan.assetRefs.find(x => x.asset === plan.screens[0].asset); assert.ok(ref && ref.maxPx[0] <= 3840 && ref.maxPx[0] <= Math.round(plan.screens[0].rect.w * 2));
    assert.match(plan.music.asset, /^media\//); assert.equal(plan.music.gain_db, -20);
    // owner tự tải qua UI (có tick che thông tin) ⇒ owner_upload, không cần xác nhận thêm
    const own = e.write(o, 'asset.put', { kind: 'image', bytes: Buffer.concat([PNG, Buffer.from([2])]), mime: 'image/png', pii_redacted: true });
    assert.equal(own.rights, 'attested');
    r = await run(e, o, tutorialBody(b, { screens: [Object.assign({}, shotScreen[0], { source: { asset: own.display_id } })] }));
    assert.notEqual(r.blocked_reason && r.blocked_reason.code, 'rights_missing');
  } finally { e.clean(); }
});

test('HTTP /api/assets/:id/attest + revoke-attest: chỉ phiên UI của chủ xưởng (cookie + CSRF + Origin); token agent ✗; thiếu Origin ✗', async () => {
  const { bootTmp, setupOwner, ui, request } = require('./d-helpers.js');
  const t = await bootTmp({});
  try {
    const s = await setupOwner(t.app, t.base), call = ui(t.base, s);
    const ag = await call('POST', '/api/agents', { name: 'A', scopes: ['read', 'compose', 'run'] });
    const png = t.app.ctx.write(agent(['compose']), 'asset.put', { kind: 'image', bytes: PNG, mime: 'image/png' });
    const url = '/api/assets/' + png.display_id + '/attest';
    assert.equal((await request(t.base, 'POST', url, { token: ag.json.token, origin: t.base, body: { basis: 'own_product', pii_redacted: true } })).status, 403, 'token agent ✗');
    assert.equal((await request(t.base, 'POST', url, { cookie: s.cookie, csrf: s.csrf, body: { basis: 'own_product', pii_redacted: true } })).status, 403, 'thiếu Origin ✗');
    const ok = await call('POST', url, { basis: 'own_product', pii_redacted: true, note: 'màn Gen-Studio' });
    assert.equal(ok.status, 200, ok.text); assert.equal(ok.json.result.rights, 'attested');
    assert.equal((await call('POST', url, { basis: 'own_product' })).status, 400, 'thiếu tick che thông tin');
    const rv = await call('POST', '/api/assets/' + png.display_id + '/revoke-attest', {});
    assert.equal(rv.status, 200); assert.equal(rv.json.result.rights, 'pending');
  } finally { await t.clean(); }
});

test('MCP preview_tutorial_frame: compose (read ✗), dựng plan từ bài đã lưu, mốc theo beat = khoảnh khắc hành động, ảnh MCP; không có tool xác nhận quyền', async () => {
  const auth = require('../server/auth.js');
  const { createMcp } = require('../server/mcp.js');
  const seen = [];
  const still = { async renderStill(o) { seen.push(o); return { buffer: Buffer.from('\xff\xd8\xffJPEG', 'latin1'), measures: {}, errors: [], elapsed_ms: 5 }; } };
  const t = tmpDb();
  try {
    const b = basics(t.write, t.db);
    const mcp = createMcp({ db: t.db, write: t.write, config: { version: 't', dataDir: t.dir, ffmpegPath: 'ffmpeg', chromiumPath: null }, deps: { still } });
    const mk = (scopes) => { const r = t.write(b.o, 'agent.create', { name: 'A' + scopes.join(''), scopes }); return auth.verifyAgentToken(t.db, r.token); };
    const call = async (c, name, args) => (await mcp.handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }, c)).result;
    assert.ok(!mcp.tools.some(n => /attest/.test(n)), 'không có tool xác nhận quyền (chỉ owner + UI)');
    const sub = t.write(b.o, 'lesson.submit', tutorialBody(b));
    const plain = t.write(b.o, 'lesson.submit', require('./a-helpers').lessonBody(b)).lesson.display_id;
    assert.equal((await call(mk(['read']), 'preview_tutorial_frame', { lesson: sub.lesson.display_id, t_ms: 1000 })).isError, true, 'phạm vi read ✗');
    const comp = mk(['compose']);
    const beat = t.db.get("SELECT display_id FROM beats WHERE block_type='cursor' LIMIT 1").display_id;
    const r = await call(comp, 'preview_tutorial_frame', { lesson: sub.lesson.display_id, beat });
    assert.ok(!r.isError, JSON.stringify(r)); assert.equal(r.content.find(c => c.type === 'image').mimeType, 'image/jpeg');
    const o = seen[0];
    assert.equal(o.mode, 'frame'); assert.deepEqual(o.size, [960, 540]); assert.equal(o.payload.plan.kind, 'tutorial');
    assert.equal(o.payload.t_ms, o.payload.plan.tutorial.steps[0].t + 60, 'mốc = khoảnh khắc bấm');
    assert.deepEqual(o.payload.plan.actors, []);
    assert.equal((await call(comp, 'preview_tutorial_frame', { lesson: plain })).isError, true, 'bài thường ⇒ lỗi rõ');
  } finally { t.clean(); }
});
