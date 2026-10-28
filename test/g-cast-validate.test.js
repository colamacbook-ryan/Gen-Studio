// © 2026 Gen Labs — All rights reserved.
// Gói V — kiểm công thức nhân vật (render/cast/validate.js) + op cast.save/approve/retire (server/ops/cast.js): F1-8 (≥ 12 ca âm), F1-11 (chỉ owner phiên UI chốt),
// approved_version được pipeline dùng, hook persona/moods vào plan.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const dbm = require('../server/db');
const pipeline = require('../server/pipeline.js');
const events = require('../server/events.js');
const auth = require('../server/auth.js');
const { createWriter } = require('../server/write');
const { createMcp } = require('../server/mcp.js');
const { validateRecipe, catchphraseUses } = require('../render/cast/validate.js');
const castLib = require('../render/cast');
const realGates = require('../media/gates/index.js');
const { tmpDb, basics, lessonBody, owner, agent } = require('./a-helpers');

const lib = castLib.library();
const clone = (x) => JSON.parse(JSON.stringify(x));
const KHOA = {
  id: 'kol-khoa', name: 'Khoa', role: 'Người giải thích',
  persona: { role: 'host_lead', energy: 'calm', temperament: 'tsundere', laugh: 'smirk', tic: 'chinHand' },
  catchphrase: { vi: 'Bình tĩnh, để mình giải thích.', use: 'intro_or_turn' },
  running_gag: { id: 'sigh-at-hype', text: 'Thở dài mỗi khi Vy phóng đại', trigger: 'on_partner_mood:excited', motion: 'deflate', fx: 'gloomLines', prop: null, max_per_min: 2 },
  dynamic: { with: 'kol-vy', type: 'straight_man_funny_man' },
  look: { eyes: 'round', brows: 'normal', parts: { head: 'round', hair: 'troc', outfit: 'gen.khung/khoi-ao', shoes: 'gen.khung/khoi-giay' }, params: {},
    palette: { skin: '#F1C7A1', skinShade: '#DCAE86', hair: '#1E1B22', robe: '#1F7AE0', accent: 'brand:hl' } },
  identity: { p1: 'Áo xanh, tóc đen', must: ['hair:troc', 'outfit:khoi-ao'], source: 'Gen Labs — Gen-Studio' },
  expressions: {}, voice: { provider: 'gemini', model: null, voice: 'Orus', style: 'nam trẻ, điềm tĩnh' }, variant: 'X-1',
};
const VY = Object.assign(clone(KHOA), {
  id: 'kol-vy', name: 'Vy', role: 'Người hỏi',
  persona: { role: 'host_co', energy: 'hyper', temperament: 'curious', laugh: 'haha', tic: 'shrug' },
  catchphrase: { vi: 'Khoan khoan, vậy là sao?!', use: 'any' },
  running_gag: { id: 'google-it', text: 'Lôi tablet ra tra Google', trigger: 'once_per_lesson', motion: 'point', fx: null, prop: null, max_per_min: 1 },
  dynamic: { with: 'kol-khoa', type: 'straight_man_funny_man' },
  voice: { provider: 'gemini', model: null, voice: 'Zephyr' },
});
VY.look = { eyes: 'round', brows: 'thin', parts: { head: 'oval', hat: 'gen.khung/khoi-mu', outfit: 'gen.core/than-tran', shoes: 'gen.khung/khoi-giay' },
  params: {}, palette: { skin: '#F6D9C4', hair: '#3B2A24', robe: '#FF6F59', hat: '#2288AA', accent: '#FF6F59' } };
VY.identity = { p1: 'Mũ xanh ngọc', must: ['head:oval', 'hat:khoi-mu'], source: 'Gen Labs — Gen-Studio' };
const BRAND = { tokens: { hl: '#FFB800' } };
const ok = (d, o = {}) => validateRecipe(d, Object.assign({ library: lib, brand: BRAND }, o));
const codes = (v) => v.errors.map((e) => e.code);

// ---------------------------------------------------------------- validateRecipe ----------------------------------------------------------------
test('chấp nhận cast mặc định hiện tại (Anh Gen, Bé Hỏi — lược đồ cũ, chỉ cảnh báo) và công thức v2 đầy đủ', () => {
  for (const r of Object.values(castLib.defaults().cast)) {
    const v = ok(r); assert.equal(v.ok, true, JSON.stringify(v.errors)); assert.equal(v.mode, 'legacy');
    assert.ok(v.warnings.some((w) => w.code === 'legacy_schema'));
  }
  for (const r of [KHOA, VY]) {
    const v = ok(r); assert.equal(v.ok, true, JSON.stringify(v.errors)); assert.equal(v.mode, 'v2');
    for (const g of ['parts', 'identity', 'states', 'motion', 'poses', 'views8']) assert.equal(v.gates.find((x) => x.id === g).ok, true, g);
  }
  assert.equal(ok(KHOA, { siblings: [{ ref: 'CM-0009', name: 'Vy', data: VY }] }).ok, true, 'Khoa và Vy khác nhau hoàn toàn ⇒ không va chạm');
  assert.equal(ok({ look: {} }).ok, true, 'bản giữ chỗ (chưa có linh kiện) hợp lệ ở chế độ light'); assert.equal(ok({ look: {} }).mode, 'light');
  assert.equal(ok({ look: { archetype: 'mentor' }, voice: { provider: 'gemini', model: 'm', voice: 'Kore' } }).ok, true, 'công thức tối giản của agent giả');
});

test('F1-8: ≥ 12 ca âm — từ chối kèm mã + chữ người đọc được', () => {
  const sibAnh = { ref: 'CM-0001', name: 'Anh Gen', data: castLib.defaults().cast['CM-0001'] };
  const sibVy = { ref: 'CM-0009', name: 'Vy', data: VY };
  const mut = (f) => { const d = clone(KHOA); f(d); return d; };
  const cases = [
    ['linh kiện lạ', mut((d) => { d.look.parts.hair = 'khong-co-toc'; }), {}, 'unknown_part'],
    ['slot lạ', mut((d) => { d.look.parts.wing = 'troc'; }), {}, 'unknown_part'],
    ['HEX sai', mut((d) => { d.look.palette.robe = '#12'; }), {}, 'bad_palette'],
    ['tên màu thay HEX', mut((d) => { d.look.palette.robe = 'red'; }), {}, 'bad_palette'],
    ['markup trong palette', mut((d) => { d.look.palette.hair = '#fff"/><script>'; }), {}, 'markup'],
    ['markup trong catchphrase', mut((d) => { d.catchphrase.vi = '<img src=x onerror=1>'; }), {}, 'markup'],
    ['persona.temperament lạ', mut((d) => { d.persona.temperament = 'grumpy'; }), {}, 'bad_enum'],
    ['persona.tic không phải động tác', mut((d) => { d.persona.tic = 'moonwalk'; }), {}, 'bad_enum'],
    ['status trong data', mut((d) => { d.status = 'approved'; }), {}, 'forbidden_field'],
    ['trường lạ ở gốc', mut((d) => { d.secret = 1; }), {}, 'unknown_field'],
    ['voice trùng nhân vật khác trong kênh', mut((d) => { d.voice.voice = 'Zephyr'; }), { siblings: [sibVy] }, 'voice_collision'],
    ['voice trùng Anh Gen (Charon) dù kênh không có Anh Gen', mut((d) => { d.voice.voice = 'Charon'; }), {}, 'voice_collision'],
    ['voice trùng Bé Hỏi (Leda), không phân biệt hoa thường', mut((d) => { d.voice.voice = 'leda'; }), {}, 'voice_collision'],
    ['Khoa đeo kính của Anh Gen (trùng linh kiện nhận diện)', mut((d) => { d.look.parts.mask = 'local.my/ab-kinh'; }), { siblings: [sibAnh] }, 'trait_collision'],
    ['Khoa đeo kính ngay cả khi không khai vào must (so với cast mặc định)', mut((d) => { d.look.parts.mask = 'ab-kinh'; }), {}, 'trait_collision'],
    ['trùng identity.must với nhân vật khác', mut((d) => { d.identity.must = ['hair:troc', 'head:oval']; d.look.parts.head = 'oval'; }), { siblings: [sibVy] }, 'identity_collision'],
    ['Vy đội mũ vàng của Bé Hỏi', Object.assign(clone(VY), { look: Object.assign(clone(VY.look), { palette: Object.assign(clone(VY.look.palette), { hat: '#ffd84a' }) }) }), {}, 'hat_collision'],
    ['identity.must < 2', mut((d) => { d.identity.must = ['hair:troc']; }), {}, 'identity_must_min'],
    ['thiếu hướng nhìn (tóc Anh Gen không có q90)', mut((d) => { d.look.parts.hair = 'ab-toc-gon'; d.identity.must = ['hair:ab-toc-gon', 'outfit:khoi-ao']; }), {}, 'views_missing'],
    ['tham số ngoài khoảng', mut((d) => { d.look.params = { eyes: { size: 99 } }; }), {}, 'param_out_of_range'],
    ['gag max_per_min quá cao', mut((d) => { d.running_gag.max_per_min = 99; }), {}, 'bad_gag'],
    ['tên kênh trong công thức', mut((d) => { d.identity.source = 'Kênh Lớp A.I. Bình Dân'; }), { channelName: 'Lớp A.I. Bình Dân' }, 'channel_name'],
    ['token brand không có', mut((d) => { d.look.palette.accent = 'brand:khongco'; }), {}, 'brand_token'],
    ['thiếu persona khi đã có linh kiện', mut((d) => { delete d.persona; }), {}, 'missing_field'],
    ['id trùng nhân vật khác', mut((d) => { d.id = 'kol-vy'; }), { siblings: [sibVy] }, 'duplicate_id'],
    ['ghi đè expressions cho state lạ', mut((d) => { d.expressions = { teleport: { eyes: 'happy' } }; }), {}, 'bad_expression'],
  ];
  assert.ok(cases.length >= 12);
  for (const [name, d, o, code] of cases) {
    const v = ok(d, o);
    assert.equal(v.ok, false, name + ' phải bị từ chối');
    assert.ok(codes(v).includes(code), `${name}: cần mã ${code}, có ${codes(v)}`);
    assert.ok(v.errors.every((e) => typeof e.text_human === 'string' && e.text_human.length > 12), name + ': có chữ người đọc được');
  }
  // strict (cast.approve): bản giữ chỗ chưa chốt được
  assert.ok(codes(ok({ look: {} }, { strict: true })).includes('recipe_incomplete'));
  assert.ok(codes(validateRecipe('x')).includes('bad_recipe'));
  assert.ok(codes(validateRecipe({ look: { parts: {} }, big: 'x'.repeat(70000) })).includes('too_large'));
  // cast mặc định cũng bị luật "status lạ" nếu khác draft
  assert.ok(codes(ok(Object.assign(clone(castLib.defaults().cast['CM-0001']), { status: 'approved' }))).includes('forbidden_field'));
});

test('engine cắm được: nạp được checkout Gen-Chibi khác qua root (ở đây: vendor) và dùng cùng một API; catchphrase > 2 lần bị đếm', () => {
  const { loadEngine } = require('../render/cast/validate.js');
  const e = loadEngine({ root: path.join(__dirname, '..', 'vendor', 'gen-chibi') });
  assert.equal(typeof e.GC.gate, 'function'); assert.ok(Object.keys(e.GC.LIB.motions).includes('chinHand'));
  assert.equal(ok(KHOA, { root: path.join(__dirname, '..', 'vendor', 'gen-chibi') }).ok, true);
  assert.equal(validateRecipe(KHOA, { root: '/khong/co/engine' }).errors[0].code, 'engine_unavailable');
  const say = 'Bình tĩnh, để mình giải thích.';
  assert.deepEqual(catchphraseUses([{ say }, { say: 'bình tĩnh để mình giải thích nhé' }, { say: 'khác' }], KHOA), { count: 2, warn: false });
  assert.equal(catchphraseUses([{ say }, { say }, { say }], KHOA).warn, true);
});

// ---------------------------------------------------------------- op cast.* ----------------------------------------------------------------
const code = (c) => (e) => e && e.code === c;
const ACTORS = (db, o) => ({
  'agent compose': agent(['read', 'compose']), 'agent run': agent(['run']), 'agent read': agent(['read']),
  'trợ lý': { type: 'assistant', entry: 'assistant' }, CLI: { type: 'cli', entry: 'cli' }, runner: { type: 'runner', entry: 'runner' }, system: { type: 'system', entry: 'system' },
  'owner qua HTTP': Object.assign({}, o, { entry: 'http' }), 'owner qua MCP': Object.assign({}, o, { entry: 'mcp' }),
});

test('cast.save: công thức sai bị từ chối trước khi ghi (không tạo nhân vật, không tạo version); hợp lệ được lưu; placeholder {look:{}} vẫn được', () => {
  const t = tmpDb(); const b = basics(t.write, t.db), o = b.o, ag = agent(['read', 'compose']);
  const count = () => [t.db.get('SELECT COUNT(*) AS n FROM cast_members').n, t.db.get('SELECT COUNT(*) AS n FROM cast_versions').n];
  const before = count();
  const bad = clone(KHOA); bad.look.parts.hair = 'khong-co';
  for (const actor of [o, ag]) {
    assert.throws(() => t.write(actor, 'cast.save', { channel: b.ch.display_id, name: 'Khoa', data: bad }), (e) => e.code === 'invalid' && /không hợp lệ/.test(e.text_human) && /linh kiện/i.test(e.text_human) && e.detail.errors.length > 0);
  }
  assert.throws(() => t.write(ag, 'cast.save', { id: b.m1.display_id, data: { look: { v: 1 }, status: 'approved' } }), (e) => e.code === 'invalid' && /Trạng thái/.test(e.text_human));
  assert.deepEqual(count(), before, 'lần bị từ chối không để lại hàng nào');
  const good = t.write(ag, 'cast.save', { channel: b.ch.display_id, name: 'Khoa', data: KHOA, status: 'candidate', note: 'v2' });
  assert.equal(good.status, 'candidate'); assert.equal(good.version, 1);
  // Vy trùng giọng Khoa ⇒ từ chối; đổi giọng thì được
  const vy2 = clone(VY); vy2.voice.voice = 'Orus';
  assert.throws(() => t.write(ag, 'cast.save', { channel: b.ch.display_id, name: 'Vy', data: vy2 }), (e) => e.detail.errors.some((x) => x.code === 'voice_collision') && /Giọng "orus"/i.test(e.text_human));
  assert.equal(t.write(ag, 'cast.save', { channel: b.ch.display_id, name: 'Vy', data: VY }).version, 1);
  // sửa chính Khoa (self không là sibling của chính mình) ⇒ version 2
  assert.equal(t.write(ag, 'cast.save', { id: good.display_id, data: KHOA }).version, 2);
  // candidate cần công thức thật
  assert.throws(() => t.write(ag, 'cast.save', { id: b.m1.display_id, data: { look: {} }, status: 'candidate' }), (e) => e.detail.errors.some((x) => x.code === 'recipe_incomplete'));
  assert.equal(t.write(ag, 'cast.save', { id: b.m1.display_id, data: { look: {} }, status: 'draft' }).status, 'draft');
  t.clean();
});

test('F1-11 / ma trận §10: cast.approve · cast.retire chỉ owner phiên UI — agent, trợ lý, CLI, runner, system, owner HTTP/MCP đều 403, không đổi trạng thái; MCP không có tool duyệt', () => {
  const t = tmpDb(); const b = basics(t.write, t.db), o = b.o;
  const m = t.write(agent(['read', 'compose']), 'cast.save', { channel: b.ch.display_id, name: 'Khoa', data: KHOA, status: 'candidate' });
  for (const [name, a] of Object.entries(ACTORS(t.db, o))) {
    for (const opn of ['cast.approve', 'cast.retire']) assert.throws(() => t.write(a, opn, { cast: m.display_id }), code('forbidden'), `${name} ✗ ${opn}`);
  }
  const row = () => t.db.get('SELECT status, approved_version, approved_by FROM cast_members WHERE display_id=?', m.display_id);
  assert.deepEqual([row().status, row().approved_version, row().approved_by], ['candidate', null, null]);
  // owner UI: chốt công thức giữ chỗ bị từ chối; chốt công thức thật được, ghi người chốt
  assert.throws(() => t.write(o, 'cast.approve', { cast: b.m1.display_id }), (e) => e.code === 'invalid' && e.detail.errors.some((x) => x.code === 'recipe_incomplete'));
  assert.throws(() => t.write(o, 'cast.approve', { cast: m.display_id, version: 9 }), code('invalid'));
  const r = t.write(o, 'cast.approve', { cast: m.display_id });
  assert.equal(r.status, 'approved'); assert.equal(row().approved_version, 1); assert.equal(row().approved_by, o.id);
  assert.ok(t.db.get("SELECT 1 AS x FROM audit_log WHERE action='cast.approve'"), 'có audit');
  // MCP: agent gửi status approved ⇒ lỗi; không có tool approve/retire
  const mcp = createMcp({ db: t.db, write: t.write, config: { version: 't', dataDir: t.dir, ffmpegPath: 'ffmpeg', chromiumPath: null } });
  assert.equal(mcp.tools.filter((n) => /approve|retire/.test(n)).length, 0);
  assert.throws(() => t.write(agent(['read', 'compose']), 'cast.save', { id: m.display_id, data: KHOA, status: 'approved' }), code('invalid'));
  // sửa nhân vật đã chốt ⇒ vẫn approved nhưng current_version > approved_version ("có thay đổi chờ chốt")
  const r2 = t.write(agent(['read', 'compose']), 'cast.save', { id: m.display_id, data: KHOA, status: 'draft' });
  assert.equal(r2.status, 'approved'); assert.equal(r2.version, 2); assert.equal(r2.approved_version, 1);
  // retire
  assert.equal(t.write(o, 'cast.retire', { cast: m.display_id }).status, 'retired');
  assert.throws(() => t.write(o, 'cast.approve', { cast: m.display_id }), code('conflict'));
  assert.throws(() => t.write(o, 'cast.retire', { cast: m.display_id }), code('conflict'));
  t.clean();
});

test('save_cast_member / list_cast / get_capabilities qua MCP: validate_only, trạng thái, enum tính cách; lỗi sai trả chữ rõ', async () => {
  const t = tmpDb(); const b = basics(t.write, t.db);
  const mcp = createMcp({ db: t.db, write: t.write, config: { version: 't', dataDir: t.dir, ffmpegPath: 'ffmpeg', chromiumPath: null } });
  const r = t.write(b.o, 'agent.create', { name: 'A', scopes: ['read', 'compose'] }), c = auth.verifyAgentToken(t.db, r.token);
  const call = async (name, args) => (await mcp.handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }, c)).result;
  const bad = clone(KHOA); bad.persona.energy = 'wild';
  const dry = await call('save_cast_member', { channel: b.ch.display_id, data: bad, validate_only: true });
  assert.equal(dry.structuredContent.ok, false); assert.match(dry.content[0].text, /persona\.energy/);
  assert.equal(t.db.get("SELECT COUNT(*) AS n FROM cast_members WHERE name='Khoa'").n, 0, 'validate_only không lưu');
  const miss = await call('save_cast_member', { channel: b.ch.display_id, name: 'Khoa', data: bad });
  assert.ok(miss.isError && /không hợp lệ/.test(miss.content[0].text));
  const saved = await call('save_cast_member', { channel: b.ch.display_id, name: 'Khoa', data: KHOA, status: 'candidate' });
  assert.ok(!saved.isError, saved.content[0].text); assert.equal(saved.structuredContent.status, 'candidate');
  const list = await call('list_cast', { channel: b.ch.display_id });
  assert.ok(list.structuredContent.cast.some((x) => x.name === 'Khoa' && x.status === 'candidate'));
  const cap = await call('get_capabilities', { channel: b.ch.display_id });
  assert.ok(cap.structuredContent.cast_recipe.persona.energy.includes('hyper')); assert.ok(cap.structuredContent.moods.includes('excited'));
  t.clean();
});

// ---------------------------------------------------------------- pipeline: approved_version + hook persona/moods ----------------------------------------------------------------
test('pipeline dùng approved_version của nhân vật đã chốt (cast.approve thật), plan nhận persona từ công thức + bảng mood', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-v-'));
  const db = dbm.open(path.join(dir, 'data'), { masterKey: 'a'.repeat(64) });
  const write = createWriter(db), calls = [];
  const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
  const deps = {
    render: { async renderPlan(o) { calls.push(o.plan); fs.mkdirSync(o.outDir, { recursive: true }); const cover = path.join(o.outDir, 'cover.png'); fs.writeFileSync(cover, PNG);
      return { framesPattern: path.join(o.outDir, 'f%05d.png'), frames: 10, fps: 30, errors: [], sfx: {}, cover, thumbs: [] }; } },
    mix: { async mix({ out }) { fs.writeFileSync(out, 'RIFFfake'); return out; }, async mux({ out }) { fs.writeFileSync(out, 'mp4'); return out; } },
    gates: { gateWavB: async () => ({ gate: 'G-WAV', result: 'pass', measure: { tier: 'b' } }), voiceGates: realGates.voiceGates, tailSig: realGates.tailSig, summarize: realGates.summarize,
      async renderGates() { return ['G-LOUD', 'G-SYNC', 'G-MOTION', 'G-FRAMES', 'G-MUX'].map((g) => ({ gate: g, result: 'pass', measure: {} })).concat([{ gate: 'G-WAV', result: 'pass', measure: { tier: 'b' } }]); } },
  };
  const ctx = { db, write, events: events.create(), config: { dataDir: path.join(dir, 'data'), fakeProviders: true, ffmpegPath: 'ffmpeg-test', chromiumPath: null, version: 'test' }, deps, pipelineOpts: { backoffMs: 1 } };
  try {
    const o = owner(db), ag = agent(['read', 'compose']);
    const ch = write(o, 'channel.create', { name: 'K', data: { schedule: { cron: '0 6 * * *' }, style: { a: 1 } } });
    const khoa = write(ag, 'cast.save', { channel: ch.display_id, name: 'Khoa', data: KHOA, status: 'candidate' });
    const vy = write(ag, 'cast.save', { channel: ch.display_id, name: 'Vy', data: VY, status: 'candidate' });
    const runIt = async (title) => {
      const r = write(o, 'lesson.submit', { channel: ch.display_id, title, lines: [{ who: khoa.display_id, say: 'Xin chào các bạn nhỏ', mood: 'explain' }, { who: vy.display_id, say: 'Hôm nay học về A.I. nhé', mood: 'excited' }], beats: [{ block: 'title', anchor: { line: 0, word: 'chào' }, params: { text: 'Hi' } }] });
      const w = pipeline.startWorkers(ctx, { pollMs: 20 }); try { await w.idle(60000); } finally { w.stop(); }
      return db.json(db.get('SELECT * FROM renders WHERE display_id=?', r.render.display_id));
    };
    write(o, 'cast.approve', { cast: khoa.display_id });   // chốt v1
    write(ag, 'cast.save', { id: khoa.display_id, data: Object.assign(clone(KHOA), { role: 'Bản sửa chưa chốt' }), status: 'draft' });   // v2 chờ chốt
    const r1 = await runIt('B1');
    assert.equal(r1.state, 'awaiting_review', JSON.stringify(r1.blocked_reason));
    assert.equal(r1.manifest.cast[khoa.display_id].version, 1, 'đã chốt v1 ⇒ dựng bằng v1 dù current là v2');
    assert.equal(r1.manifest.cast[vy.display_id].version, 1, 'chưa chốt ⇒ bản hiện hành');
    const plan = calls[calls.length - 1];
    assert.equal(plan.cast[khoa.display_id].role, 'Người giải thích', 'plan dùng nội dung v1');
    assert.equal(plan.persona[khoa.display_id].energy, 'calm'); assert.equal(plan.persona[vy.display_id].running_gag.id, 'google-it'); assert.equal(plan.persona[vy.display_id].catchphrase.vi, 'Khoan khoan, vậy là sao?!');
    assert.ok(plan.moods && plan.moods.moods.excited, 'plan mang bảng mood cho trang sân khấu');
    // chốt lại v2 ⇒ lần dựng sau dùng v2
    write(o, 'cast.approve', { cast: khoa.display_id });
    const r2 = await runIt('B2'); assert.equal(r2.manifest.cast[khoa.display_id].version, 2);
  } finally { db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});
