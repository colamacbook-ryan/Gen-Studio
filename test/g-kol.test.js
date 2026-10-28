// © 2026 Gen Labs — All rights reserved.
// Gói K (F1 — KOL, SPEC-0.2.0 §3): vendor Gen-Chibi 0.26.0 không làm đổi cast cũ · host mẫu trung tính · nạp/kiểm pack (GS_KOL_PACK) · GSStill.cast bằng Chromium thật ·
// F1-1…F1-6, F1-9, F1-10 trên host mẫu VÀ trên pack của chủ xưởng khi GS_KOL_PACK trỏ tới tệp có thật (CNS-124; thiếu tệp ⇒ bỏ qua kèm thông báo rõ).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const chromium = require('../render/chromium');
const cdp = require('../render/cdp');
const { openStage } = require('../render/render');
const still = require('../render/still');
const { buildPlan } = require('../render/engine/timeline');
const Dir = require('../render/engine/direct');
const cast = require('../render/cast');
const kol = require('../render/cast/kol-pack');
const { xorRatio, area } = require('../render/cast/measure');
const { bootTmp } = require('./d-helpers');

const ROOT = path.join(__dirname, '..');
const HAS = chromium.find() ? false : 'không có Chromium';
const PACK = process.env.GS_KOL_PACK && fs.existsSync(process.env.GS_KOL_PACK) ? process.env.GS_KOL_PACK : null;
if (!PACK) console.log('# bỏ qua kiểm pack KOL: không có GS_KOL_PACK (đặt GS_KOL_PACK=<ryan-kol.json> để chạy F1 trên pack của chủ xưởng)');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'gs-g-kol-'));
const readJ = f => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
const OLD_CAST = readJ('render/cast/default-cast.json');     // Anh Gen (kính ab-kinh, giọng Charon) + Bé Hỏi (búi tó, giọng Leda)
const MOTIONS_OF = GC => GC.LIB.motions;

// ---------- harness engine Node (vm, vendor) ----------
// subject = { label, recipes (dạng lưu trong cast_versions.data, tham chiếu đủ tiền tố), packs:[{json,outline}], outline }
function samplesSubject() { const lib = cast.library(); return { label: 'host mẫu', recipes: cast.samples(), packs: lib.packs, outline: null, parts: lib.parts }; }
function packSubject(file) {
  const k = kol.load(file), lib = cast.library();
  return { label: 'pack KOL', recipes: k.recipes, packs: lib.packs, outline: k.outline, parts: lib.parts, hosts: k.recipes };
}
function engineFor(subject) {
  const GC = kol.loadEngine();
  GC.pack({ id: 'local.my', name: 'x', owner: 'Gen Labs', group: 'mine', visibility: 'private', license: '© 2026 Gen Labs' }, function () {});
  subject.parts.forEach(p => { const r = GC.registerDataPart('local.my', p); assert.equal(r.errors.length, 0, 'part ' + p.id + r.errors.join()); });
  subject.packs.forEach(p => { const r = GC.registerDataPack(p.json); assert.equal(r.errors.length, 0, 'pack ' + p.json.id + r.errors.join()); });
  const assets = {};
  subject.recipes.concat(OLD_CAST).forEach(r => {
    GC.registerAsset('local.my', Object.assign({ kind: 'character', version: 1, status: 'draft', expressions: {}, lines: {} }, JSON.parse(JSON.stringify(r))));
    assets[r.id] = GC.ASSETS['local.my/' + r.id]; assert.ok(assets[r.id], r.id);
  });
  return { GC, assets };
}
function subjects() { const s = [samplesSubject()]; if (PACK) s.push(packSubject(PACK)); return s; }
test.after(() => { kol.unload(); return still.closeStill(); });

// ---------- 1. vendor 0.26.0 + hồi quy cast cũ ----------
test('vendor Gen-Chibi 0.26.0: VERSION khớp ASSET_MANIFEST + sync script; engine có gói dữ liệu', () => {
  const v = fs.readFileSync(path.join(ROOT, 'vendor/gen-chibi/VERSION'), 'utf8').trim();
  assert.equal(v, '0.26.0');
  assert.match(fs.readFileSync(path.join(ROOT, 'ASSET_MANIFEST.md'), 'utf8'), /Engine Gen-Chibi[^\n]*\| 0\.26\.0 \(khoá khi vendor\)/);
  assert.match(fs.readFileSync(path.join(ROOT, 'tools/sync-gen-chibi.sh'), 'utf8'), /want="\$\{2:-0\.26\.0\}"/);
  const GC = kol.loadEngine();
  for (const f of ['registerDataPack', 'checkDataPack', 'unregisterPack', 'normalizeOutline']) assert.equal(typeof GC[f], 'function', f);
});
// băm svgString của Anh Gen + Bé Hỏi (18 trạng thái × 2 hướng × 5 góc + 32 hoạt động) — GIỐNG HỆT giá trị đo trên engine 0.25.1 trước khi vendor (29ef6db)
const GOLDEN_OLD_CAST = { 'ab-gen': '6ef5347549376f5b', 'ab-be-hoi': '2327324ad7869e43' };
test('hồi quy: cast cũ (Anh Gen, Bé Hỏi) dựng giống hệt trước khi nâng engine lên 0.26.0', () => {
  const GC = kol.loadEngine();
  GC.pack({ id: 'local.my', name: 'x', owner: 'Gen Labs', group: 'mine', visibility: 'private', license: '© 2026 Gen Labs' }, function () {});
  readJ('render/cast/parts.json').forEach(p => assert.equal(GC.registerDataPart('local.my', p).errors.length, 0));
  for (const r of OLD_CAST) {
    GC.registerAsset('local.my', Object.assign({ kind: 'character', version: 1, status: 'draft', expressions: {}, lines: {} }, JSON.parse(JSON.stringify(r))));
    const a = GC.ASSETS['local.my/' + r.id], h = crypto.createHash('sha256');
    for (const st of GC.LIB.stateOrder) for (const f of ['left', 'right']) for (const v of [null, 'left45', 'left90', 'left135', 'back']) { const d = { facing: f }; if (v) d.view = v; h.update(GC.svgString(a, st, { t: 0.37, director: d })); }
    for (const act of GC.LIB.activityOrder.slice(0, 32)) h.update(GC.svgString(a, 'normal', { t: 0.2, director: { activity: act } }));
    assert.equal(h.digest('hex').slice(0, 16), GOLDEN_OLD_CAST[r.id], r.id + ' đổi so với engine 0.25.1');
  }
});

// ---------- 2. host mẫu trung tính ----------
test('host mẫu: có 2 người "Host A/B", trung tính, candidate (không bao giờ approved), không chứa dấu hiệu Khoa/Vy hay tên kênh', () => {
  const s = cast.samples();
  assert.equal(s.length, 2);
  assert.deepEqual(s.map(x => x.name), ['Host A', 'Host B']);
  const entries = cast.sampleEntries();
  assert.deepEqual(entries.map(e => e.status), ['candidate', 'candidate']);
  s.forEach(r => { assert.ok(!('status' in r), 'status không nằm trong data (CNS-102)'); assert.equal(r.identity.source, 'Gen Labs — Gen-Studio'); });
  let text = '';
  for (const f of ['render/cast/sample-hosts.json', 'render/cast/props.json'].concat(fs.readdirSync(path.join(ROOT, 'render/cast/parts')).map(x => 'render/cast/parts/' + x))) text += fs.readFileSync(path.join(ROOT, f), 'utf8');
  assert.doesNotMatch(text, /Lớp AI Bình Dân|ky-toc|vy-toc|robot Bít|kol2-/i);
  assert.doesNotMatch(text, /\bKhoa\b|\bVy\b/);
  const lib = cast.library();
  const ids = lib.parts.map(p => p.id);
  for (const id of ['host-toc-bob', 'host-toc-hat', 'host-ao-khoac', 'host-ao-len', 'ab-toc-gon', 'ab-kinh']) assert.ok(ids.includes(id), id);
  assert.ok(lib.packs.some(p => p.json.id === 'gen.studio' && p.json.activities.some(a => a.id === 'host-typing')), 'props.json: laptop + gõ phím');
  assert.match(lib.hash, /^[0-9a-f]{16}$/);
  assert.equal(cast.library().hash, lib.hash, 'hash tất định');
});

// ---------- 3. kiểm pack: pack hợp lệ nạp được, pack xấu bị từ chối ----------
// pack thử thuần dữ liệu, dựng từ linh kiện host mẫu (đổi id/màu/giọng để không trùng cast cũ); KHÔNG phải linh kiện Khoa/Vy
function fixturePack() {
  const rn = id => id.replace('host-', 'tk-');
  const parts = cast.sharedParts().filter(p => /^host-/.test(p.id)).map(p => Object.assign(JSON.parse(JSON.stringify(p)), { id: rn(p.id) }));
  parts.forEach(p => { delete p.license; delete p.source; });
  const mk = (id, name, hair, outfit, voice) => ({ id, name, role: 'Thử', persona: { role: 'host_lead', energy: 'calm', temperament: 'earnest', laugh: 'smirk', tic: 'chinHand' },
    catchphrase: { vi: 'Thử nhé.', use: 'intro_or_turn' }, running_gag: { id: 'g-' + id, text: 'gag', trigger: 'once_per_lesson', motion: 'nod', fx: null, prop: null, max_per_min: 1 },
    dynamic: { with: 'x', type: 'rivals' }, look: { eyes: 'calm', brows: 'normal', parts: { hair, outfit, legwear: 'gen.core/chan-tran', shoes: 'gen.khung/khoi-giay' }, params: {}, palette: { robe: '#7B3FF2', skin: '#F0C8A0' } },
    identity: { p1: 'thử', must: ['hair:' + hair, 'outfit:' + outfit], source: 'Gen Labs — Gen-Studio' }, expressions: {}, voice: { provider: 'gemini', model: null, voice, style: 'thử' }, variant: 't' });
  return { format: 'gen-chibi.pack/1', id: 'test.kol', name: 'Pack thử', owner: 'Gen Labs', license: '© 2026 Gen Labs — All rights reserved', version: '0.0.1', parts,
    assets: [mk('tk-a', 'Thử A', 'tk-toc-bob', 'tk-ao-khoac', 'Fenrir'), mk('tk-b', 'Thử B', 'tk-toc-hat', 'tk-ao-len', 'Aoede')] };
}
const writePack = (obj, name = 'pack.json') => { const d = tmp(), f = path.join(d, name); fs.writeFileSync(f, typeof obj === 'string' ? obj : JSON.stringify(obj)); return f; };
const codes = r => r.errors.map(e => e.code);

test('kiểm pack: pack hợp lệ qua checkDataPack + cổng engine; công thức được gắn tiền tố pack; 0 dòng chặn', () => {
  const r = kol.checkPack(fixturePack());
  assert.equal(r.errors.length, 0, JSON.stringify(r.errors)); assert.equal(r.ok, true);
  assert.equal(r.recipes.length, 2);
  assert.equal(r.recipes[0].look.parts.hair, 'test.kol/tk-toc-bob');
  assert.ok(!('status' in r.recipes[0]));
  for (const id of ['tk-a', 'tk-b']) {
    assert.equal(r.gates[id].filter(g => !g.ok && !g.info).length, 0, id);
    assert.match(r.gates[id].find(g => g.id === 'views8').detail, /^đủ/);
  }
});
test('kiểm pack: pack xấu bị từ chối với mã rõ (không đăng ký gì)', () => {
  const bad = (mut, code) => { const p = fixturePack(); mut(p); const r = kol.checkPack(p); assert.equal(r.ok, false, code); assert.ok(codes(r).includes(code), code + ' ← ' + codes(r).join(',')); return r; };
  assert.ok(codes(kol.checkPack(null)).includes('pack_invalid'));
  assert.ok(codes(kol.checkPack([])).includes('pack_invalid'));
  bad(p => { p.format = 'x'; }, 'pack_invalid');
  bad(p => { p.id = 'gen.studio'; }, 'pack_id_taken');          // trùng pack có sẵn của xưởng
  bad(p => { p.id = 'local.my'; }, 'pack_id_taken');
  bad(p => { p.parts[0].layers.hairFront = '<script>alert(1)</script>'; }, 'pack_invalid');   // SVG ngoài danh sách cho phép
  bad(p => { p.parts[0].layers.hairFront = '<path d="M0,0" fill="url(#x)"/>'; }, 'pack_invalid');
  bad(p => { delete p.assets[0].look.parts.hair; }, 'identity_must');            // must trỏ linh kiện không còn
  bad(p => { p.assets[0].identity.must = ['hair:tk-toc-bob']; }, 'identity_must');
  bad(p => { delete p.parts[0].views.q90; }, 'views_missing');                   // thiếu hướng nhìn
  bad(p => { p.assets[0].persona.temperament = 'angsty'; }, 'persona_invalid');  // enum đóng
  bad(p => { p.assets[0].persona.tic = 'moonwalk'; }, 'persona_invalid');
  bad(p => { p.assets[0].voice.voice = 'Charon'; }, 'voice_shared');             // giọng Anh Gen
  bad(p => { p.assets[1].voice.voice = 'Leda'; }, 'voice_shared');               // giọng Bé Hỏi
  bad(p => { p.assets[1].voice.voice = p.assets[0].voice.voice; }, 'voice_shared');   // trùng nhau trong pack
  bad(p => { p.assets[0].identity.must = ['hair:ab-buoi-toc', 'outfit:tk-ao-khoac']; }, 'must_shared');   // dấu nhận diện Bé Hỏi
  bad(p => { p.assets[0].identity.must = ['mask:ab-kinh', 'outfit:tk-ao-khoac']; }, 'must_shared');       // kính Anh Gen
  bad(p => { p.assets[0].id = 'ab-gen'; }, 'cast_id_taken');                      // va chạm id cast cũ
  bad(p => { p.assets[1].id = p.assets[0].id; }, 'pack_invalid');                 // va chạm id trong pack: engine chặn từ đầu
  bad(p => { p.assets[0].id = 'host-a'; }, 'cast_id_taken');                      // va chạm host mẫu
  bad(p => { p.assets[0].status = 'approved'; }, 'forbidden_field');              // status không nằm trong công thức
  bad(p => { delete p.assets[0].catchphrase; }, 'catchphrase_missing');
  bad(p => { p.assets[0].voice = { ai: 'Orus' }; }, 'voice_invalid');
  bad(p => { p.description = 'x'.repeat(2.2 * 1024 * 1024); }, 'pack_too_big');
  // linh kiện dùng ngoài pack không có ⇒ cổng engine chặn
  bad(p => { p.assets[0].look.parts.hair = 'local.my/khong-co'; }, 'pack_invalid');
});
test('nạp pack từ tệp: không đọc được / JSON hỏng / pack sai ⇒ ném mã rõ; pack đúng ⇒ library() có pack + outline', () => {
  assert.throws(() => kol.load('/khong/co/tep.json'), { code: 'kol_pack_unreadable' });
  assert.throws(() => kol.load(writePack('{không phải json')), { code: 'kol_pack_invalid' });
  const bad = fixturePack(); bad.assets[0].voice.voice = 'Charon';
  assert.throws(() => kol.load(writePack(bad)), e => e.code === 'kol_pack_invalid' && e.errors.some(x => x.code === 'voice_shared') && /voice_shared/.test(e.message));
  assert.equal(kol.current(), null, 'pack sai không để lại trạng thái');
  const f = writePack(fixturePack());
  const k = kol.load(f);
  assert.equal(k.recipes.length, 2); assert.deepEqual(k.outline, { width: 3, sticker: true });
  const lib = cast.library();
  assert.ok(lib.packs.some(p => p.json.id === 'test.kol' && p.outline && p.outline.sticker), 'pack vào library().packs');
  assert.ok(!cast.library().parts.some(p => /^tk-/.test(p.id)), 'linh kiện chữ ký không lẫn vào parts dùng chung');
  const h1 = lib.hash; kol.unload();
  assert.notEqual(cast.library().hash, h1, 'hash đổi khi có pack');
});

// ---------- 4. GS_KOL_PACK độc lập GS_SEED_DEMO ----------
const castOf = (db) => db.all('SELECT m.display_id, m.name, m.status, m.channel_id, v.data FROM cast_members m JOIN cast_versions v ON v.entity_id=m.id AND v.version=m.current_version ORDER BY m.display_id').map(r => Object.assign({}, r, { data: JSON.parse(r.data) }));
const owner = (db) => { let u = db.get(`SELECT * FROM users WHERE username='owner1'`); if (!u) u = db.insertRow('users', { display_id: db.nextDisplayId(db.ws, 'US'), username: 'owner1', display_name: 'O', password_hash: 'x', role: 'owner' }); return { type: 'user', id: u.id, role: 'owner', entry: 'ui' }; };
test('GS_KOL_PACK độc lập GS_SEED_DEMO: chỉ nạp pack — chưa có kênh thì chưa seed; tạo kênh đầu tiên ⇒ 2 nhân vật candidate; không có dữ liệu demo', async () => {
  const f = writePack(fixturePack());
  const t = await bootTmp({ env: { GS_KOL_PACK: f } });
  try {
    const db = t.app.ctx.db;
    assert.equal(t.app.ctx.config.kolPack, f);
    assert.ok(kol.current(), 'pack đã nạp lúc khởi động');
    assert.equal(db.get('SELECT COUNT(*) n FROM channels').n, 0, 'không seed demo');
    assert.equal(castOf(db).length, 0);
    const ch = t.app.ctx.write(owner(db), 'channel.create', { name: 'Kênh đầu' });
    await new Promise(r => setImmediate(r)); await new Promise(r => setImmediate(r));
    const rows = castOf(db);
    assert.equal(rows.length, 2);
    rows.forEach(r => { assert.equal(r.status, 'candidate'); assert.notEqual(r.status, 'approved'); assert.ok(r.data.look.parts.hair.startsWith('test.kol/')); assert.ok(!('status' in r.data)); });
    assert.deepEqual(rows.map(r => r.data.id), ['tk-a', 'tk-b']);
    assert.equal(db.get('SELECT COUNT(*) n FROM lessons').n, 0, 'không có bài demo');
    assert.equal(db.get('SELECT COUNT(*) n FROM audit_log WHERE action=?', 'cast.seed_pack').n, 2);
    // kênh thứ hai không nhận thêm (chỉ kênh đầu tiên)
    t.app.ctx.write(owner(db), 'channel.create', { name: 'Kênh hai' }); await new Promise(r => setImmediate(r));
    assert.equal(castOf(db).length, 2);
    assert.deepEqual(kol.seed(db), { seeded: [], skipped: ['tk-a', 'tk-b'] }, 'chạy lại ⇒ không trùng');
    assert.equal(ch.display_id, db.get('SELECT display_id FROM channels ORDER BY created_at LIMIT 1').display_id);
  } finally { kol.unload(); await t.clean(); }
});
test('GS_KOL_PACK + GS_SEED_DEMO cùng bật: nhân vật pack vào kênh demo ở candidate, bên cạnh Anh Gen/Bé Hỏi; khởi động lại không trùng', async () => {
  const f = writePack(fixturePack());
  const t = await bootTmp({ seed: true, env: { GS_KOL_PACK: f, GS_DEMO_PASSWORD: 'mat-khau-demo-123' } });
  try {
    const rows = castOf(t.app.ctx.db);
    assert.ok(rows.length >= 4, 'demo (2) + pack (2)');
    assert.deepEqual(rows.filter(r => /^tk-/.test(r.data.id || '')).map(r => r.status), ['candidate', 'candidate']);
    assert.ok(!rows.some(r => r.status === 'approved' && /^tk-/.test(r.data.id || '')));
    assert.equal(kol.seed(t.app.ctx.db).seeded.length, 0);
  } finally { kol.unload(); await t.clean(); }
});
test('GS_KOL_PACK trỏ pack sai ⇒ máy chủ không lên, lỗi nêu rõ mã', async () => {
  const bad = fixturePack(); bad.assets[0].id = 'ab-gen';
  await assert.rejects(bootTmp({ env: { GS_KOL_PACK: writePack(bad) } }), e => e.code === 'kol_pack_invalid' && /cast_id_taken/.test(e.message));
  await assert.rejects(bootTmp({ env: { GS_KOL_PACK: '/khong/co.json' } }), { code: 'kol_pack_unreadable' });
  kol.unload();
});

// ---------- 5. F1-x trên host mẫu + pack ----------
const HEX = /^#[0-9a-fA-F]{6}$/;
const PARTS_OF = (GC, asset) => Object.keys(GC.LIB.slots).map(slot => ({ slot, ref: GC.partRef(asset, slot) })).filter(x => x.ref && x.ref !== 'none').map(x => Object.assign(x, { part: GC.getPart(x.slot, x.ref, asset.pack) }));
const VIEWS8 = [null, 'left45', 'right45', 'left90', 'right90', 'left135', 'right135', 'back'];

test('F1-1: GC.gate(asset,{poses:true}) — 0 dòng chặn; identity + views8 ok', () => {
  for (const S of subjects()) {
    const { GC, assets } = engineFor(S);
    for (const r of S.recipes) {
      const g = GC.gate(assets[r.id], { poses: true });
      assert.equal(GC.blockingGates(g).length, 0, S.label + ' ' + r.id);
      assert.equal(g.find(x => x.id === 'identity').ok, true, S.label + ' identity ' + r.id);
      const v8 = g.find(x => x.id === 'views8'); assert.equal(v8.ok, true); assert.match(v8.detail, /^đủ/, S.label + ' ' + r.id + ': ' + v8.detail);
    }
  }
});
test('F1-2: dựng đủ 18 state × mọi hoạt động × 2 facing × 8 hướng — 0 exception; SVG mỗi state ≤ 35.000 ký tự; svgString ≤ 4 ms', () => {
  for (const S of subjects()) {
    const { GC, assets } = engineFor(S);
    assert.equal(GC.LIB.stateOrder.length, 18);
    assert.ok(GC.LIB.activityOrder.length >= 32, 'đủ ≥ 32 hoạt động');
    for (const r of S.recipes) {
      const a = assets[r.id]; let max = 0, n = 0; const t0 = process.hrtime.bigint();
      for (const f of ['left', 'right']) for (const v of VIEWS8) {
        const d = { facing: f }; if (v) d.view = v;
        for (const st of GC.LIB.stateOrder) { const s = GC.svgString(a, st, { t: 0.3, director: d }); max = Math.max(max, s.length); n++; assert.ok(/^<svg /.test(s)); }
        for (const act of GC.LIB.activityOrder) { const s = GC.svgString(a, 'normal', { t: 0.3, director: Object.assign({ activity: act }, d) }); max = Math.max(max, s.length); n++; }
      }
      const ms = Number(process.hrtime.bigint() - t0) / 1e6 / n;
      assert.ok(max <= 35000, S.label + ' ' + r.id + ' SVG ' + max + ' ký tự');
      assert.ok(ms < 4, S.label + ' ' + r.id + ' svgString ' + ms.toFixed(2) + ' ms/khung');
    }
  }
});
test('F1-3: mọi linh kiện được công thức tham chiếu có đủ trước/q45/q90/q135/q180 — N/N, 0 mượn hướng', () => {
  for (const S of subjects()) {
    const { GC, assets } = engineFor(S);
    for (const r of S.recipes) {
      const ps = PARTS_OF(GC, assets[r.id]); assert.ok(ps.length >= 5, 'ít nhất đầu, tóc, áo, quần, giày');
      for (const { slot, ref, part } of ps) for (const k of ['q45', 'q90', 'q135', 'q180']) assert.ok(part.views && part.views[k], S.label + ' ' + r.id + ' ' + slot + ':' + ref + ' thiếu ' + k);
    }
  }
});
test('F1-5 (phần dữ liệu): 0 dấu must chung, 0 giọng chung với Anh Gen / Bé Hỏi; Khoa/host không đeo kính', () => {
  const oldMust = new Set(OLD_CAST.flatMap(r => r.identity.must)), oldVoice = new Set(OLD_CAST.map(r => r.voice.ai));
  assert.deepEqual([...oldVoice].sort(), ['Charon', 'Leda']);
  for (const S of subjects()) {
    const seenV = new Set();
    for (const r of S.recipes) {
      r.identity.must.forEach(m => assert.ok(!oldMust.has(m), S.label + ' ' + r.id + ' trùng dấu ' + m));
      assert.ok(r.identity.must.length >= 2);
      assert.ok(!oldVoice.has(r.voice.voice), S.label + ' ' + r.id + ' giọng ' + r.voice.voice);
      assert.equal(r.voice.provider, 'gemini'); assert.ok(!seenV.has(r.voice.voice)); seenV.add(r.voice.voice);
      assert.ok(!r.look.parts.mask, 'không đeo kính/mặt nạ');
    }
  }
  if (PACK) { const r = packSubject(PACK).recipes; assert.deepEqual(r.map(x => x.voice.voice), ['Orus', 'Zephyr'], 'Khoa = Orus, Vy = Zephyr (§3.4.1)'); kol.unload(); }
});
test('F1-6: 16 mood + biến chuyển động; mặt bắt buộc STD-09 (khóc, cười đê tiện, giận, tham tiền, van xin) + bổ sung (quyết tâm, suy tư, phân vân, lười, sốc) khác nhau', () => {
  const MOODS = ['neutral', 'explain', 'excited', 'shock', 'think', 'unsure', 'smug', 'sad', 'angry', 'panic', 'greedy', 'beg', 'proud', 'vow', 'bored', 'yell'];
  const TAB = { neutral: ['normal', 'talk'], explain: ['normal', 'point'], excited: ['proud', 'fistPump'], shock: ['shock', 'recoil'], think: ['think', 'chinHand'], unsure: ['unsure', 'shrug'], smug: ['smug', 'gloat'], sad: ['cry', 'weep'],
    angry: ['rage', 'stomp'], panic: ['panic', 'flail'], greedy: ['greedy', 'rubHands'], beg: ['beg', 'plead'], proud: ['proud', 'chestOut'], vow: ['vow', 'resolve'], bored: ['lazy', 'slouch'], yell: ['rage', 'fury'] };
  for (const S of subjects()) {
    const { GC, assets } = engineFor(S);
    for (const r of S.recipes) {
      const a = assets[r.id], faces = new Set(), looks = new Set();
      for (const m of MOODS) {
        const [st, mo] = TAB[m]; assert.ok(GC.LIB.states[st], st); assert.ok(GC.LIB.motions[mo], mo);
        const r0 = GC.resolveState(a, st, { motion: mo }); faces.add([r0.eyes, r0.brows, r0.mouth, r0.fx.join('+')].join('|'));
        const s1 = GC.svgString(a, st, { t: 0.05, director: { motion: mo } }), s2 = GC.svgString(a, st, { t: 0.55, director: { motion: mo } });
        assert.notEqual(s1, s2, S.label + ' ' + r.id + ' ' + m + ' có chuyển động'); looks.add(s2);
      }
      assert.ok(faces.size >= 13, S.label + ' ' + r.id + ' số mặt khác nhau: ' + faces.size);
      assert.ok(looks.size >= 14, 'ảnh khác nhau: ' + looks.size);
      for (const st of ['cry', 'smug', 'rage', 'greedy', 'beg', 'vow', 'think', 'unsure', 'lazy', 'sleep', 'shock', 'work']) assert.doesNotThrow(() => GC.svgString(a, st, { t: 0.2 }), st);
    }
  }
});
const hexToHsl = h => { const n = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255), mx = Math.max(...n), mn = Math.min(...n), l = (mx + mn) / 2, d = mx - mn; let hue = 0;
  if (d) { hue = mx === n[0] ? ((n[1] - n[2]) / d) % 6 : mx === n[1] ? (n[2] - n[0]) / d + 2 : (n[0] - n[1]) / d + 4; hue *= 60; if (hue < 0) hue += 360; } return { h: hue, l }; };
const lstar = h => { const lin = c => (c /= 255) <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); const [r, g, b] = [1, 3, 5].map(i => lin(parseInt(h.slice(i, i + 2), 16)));
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b; return y > 0.008856 ? 116 * Math.cbrt(y) - 16 : 903.3 * y; };
test('F1-9(a)(b)(d) + F1-10: nét linh kiện đúng thang; cùng rig.size; viền = brand ink, không `filter`; sắc nhận diện cách ≥ 60° hue và ΔL ≥ 15', () => {
  for (const S of subjects()) {
    const { GC, assets } = engineFor(S);
    // (a) viền ngoài 2,6–3,2; chi tiết trong 1,4–2,0 (đọc stroke-width của linh kiện của chính nhân vật, không đọc kho chung)
    const own = new Set(); S.recipes.forEach(r => Object.values(r.look.parts).forEach(v => own.add(v.replace(/^.*\//, ''))));
    const srcParts = S.packs.map(p => p.json.parts || []).flat().concat(S.parts).filter(p => own.has(p.id) && !/^ab-/.test(p.id));
    assert.ok(srcParts.length >= 4, S.label + ': tìm thấy linh kiện của nhân vật');
    const bad = [];
    for (const p of srcParts) {
      const layers = [p.layers].concat(Object.values(p.views || {}).map(v => v.layers || {}));
      layers.forEach(L => Object.values(L).forEach(svg => { for (const m of svg.matchAll(/stroke-width="([\d.]+)"/g)) { const w = +m[1]; if (!((w >= 2.6 && w <= 3.2) || (w >= 1.4 && w <= 2.0))) bad.push(p.id + ':' + w); } }));
    }
    assert.deepEqual([...new Set(bad)], [], S.label + ' nét ngoài thang');
    // (b) cùng rig.size
    const sizes = new Set(S.recipes.map(r => String((r.look.params && r.look.params.rig && r.look.params.rig.size) || 1))); assert.equal(sizes.size, 1, S.label + ' rig.size ' + [...sizes]);
    // (d) viền theo ink của brand: opts.ink thay hết màu mực mặc định #2b211d, kể cả viền nướng
    const INK = '#123456';
    for (const r of S.recipes) {
      const a = assets[r.id];
      for (const opts of [{ ink: INK }, { ink: INK, outline: { width: 3, sticker: true } }]) {
        const s = GC.svgString(a, 'normal', Object.assign({ t: 0.1 }, opts));
        assert.ok(!/#2b211d/i.test(s), S.label + ' ' + r.id + ' còn mực mặc định'); assert.ok(s.includes(INK), 'có mực brand');
        assert.ok(!/<filter|feMorphology|filter=/i.test(s), 'không filter trong SVG nhân vật');
      }
      // viền dán là path: bản có outline dài hơn, vẫn chỉ gồm path/g/ellipse… (không filter)
      assert.ok(GC.svgString(a, 'normal', { outline: { width: 3, sticker: true } }).length > GC.svgString(a, 'normal', {}).length);
    }
    // F1-10: sắc nhận diện (robe) của hai host
    const [A, B] = S.recipes.map(r => r.look.palette.robe); assert.match(A, HEX); assert.match(B, HEX);
    const dh = Math.abs(hexToHsl(A).h - hexToHsl(B).h), hueD = Math.min(dh, 360 - dh), dL = Math.abs(lstar(A) - lstar(B));
    assert.ok(hueD >= 60, S.label + ' cách hue ' + hueD.toFixed(0)); assert.ok(dL >= 15, S.label + ' ΔL ' + dL.toFixed(1));
  }
});

// ---------- 6. GSStill.cast bằng Chromium thật (F1-4, F1-5 XOR, F1-9e) ----------
const castPayload = (S, extra) => {
  const cm = {}; S.recipes.forEach((r, i) => { cm['CM-000' + (i + 1)] = r; });
  const refs = {}; OLD_CAST.forEach(r => { refs[r.id] = r; });
  return Object.assign({ cast: cm, refs, packs: S.packs, parts: S.parts, title: 'Bảng thử ' + S.label, ink: S.outline ? '#14121A' : undefined }, extra);
};
test('GSStill.cast: bảng 1920×1080 dựng bằng renderStill thật — 0 lỗi console, không còn stub, đủ 5 hướng × 16 mood, mặt nạ + XOR; F1-4 ≥ 12 % @64px; F1-5 ≥ 8 % @32px so với cast cũ', { skip: HAS }, async () => {
  for (const S of subjects()) {
    const out = path.join(tmp(), 'sheet.png');
    const r = await still.renderStill({ mode: 'cast', payload: castPayload(S), size: [1920, 1080], format: 'png', outFile: out });
    assert.deepEqual(r.errors, [], S.label);
    const m = r.measures;
    assert.equal(m.mode, 'cast'); assert.equal(m.stub, false); assert.equal(m.chars.length, 2);
    m.chars.forEach(c => { assert.equal(c.views, 5); assert.equal(c.moods, 16); });
    assert.deepEqual(m.views, ['front', 'q45', 'q90', 'q135', 'q180']); assert.equal(m.moods.length, 16);
    assert.deepEqual(m.crop, { w: 168, h: 94 });
    assert.ok(m.svg_nodes >= 2 * (5 + 16) + 6, 'đủ ô: ' + m.svg_nodes);
    const png = fs.readFileSync(out); assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [1920, 1080]);
    const ids = S.recipes.map(x => x.id);
    for (const s of [64, 32]) { assert.equal(m.masks[s].h, s); ids.concat(OLD_CAST.map(x => x.id)).forEach(id => assert.ok(area(m.masks, s, id) > 0.15 * m.masks[s].w * s, s + 'px bóng ' + id + ' không rỗng')); }
    const x64 = xorRatio(m.masks, 64, ids[0], ids[1]), x32 = xorRatio(m.masks, 32, ids[0], ids[1]);
    assert.ok(Math.abs(x64 - m.xor['64']) < 1e-9 && Math.abs(x32 - m.xor['32']) < 1e-9, 'số XOR đo ở Node khớp số trong trang');
    assert.ok(x64 >= 0.12, S.label + ' F1-4: XOR 64px ' + (x64 * 100).toFixed(1) + ' %');
    for (const id of ids) for (const old of OLD_CAST) { const x = xorRatio(m.masks, 32, id, old.id); assert.ok(x >= 0.08, S.label + ' F1-5: ' + id + ' vs ' + old.id + ' XOR 32px ' + (x * 100).toFixed(1) + ' %'); }
  }
});
test('GSStill.cast: không có nhân vật ⇒ bản giữ chỗ (stub) như P0a', { skip: HAS }, async () => {
  const r = await still.renderStill({ mode: 'cast', payload: { label: 'thử' }, size: [320, 180], format: 'jpeg' });
  assert.deepEqual(r.errors, []); assert.equal(r.measures.stub, true);
});
test('GSStill.cast: lỗi pack/nhân vật trong payload ⇒ ném lỗi rõ, không vẽ bảng dở', { skip: HAS }, async () => {
  const S = samplesSubject(), p = castPayload(S);
  p.packs = [{ json: { format: 'gen-chibi.pack/1', id: 'bad.pack' }, outline: null }];
  await assert.rejects(still.renderStill({ mode: 'cast', payload: p, size: [1920, 1080], format: 'png' }), /pack bad\.pack/);
});

// F1-9(e): cùng t, nhân vật do renderStill(mode:'cast', layout:'solo') và khung sân khấu cho PIXEL GIỐNG HỆT (chênh = 0)
async function withStage(fn) {
  const ch = await chromium.launch({}), client = await cdp.connect(ch.wsUrl), errors = [];
  const st = await openStage({ shared: { ch, client }, errors });
  try { return await fn(st, errors); } finally { await st.close(); client.close(); await ch.close(); }
}
test('F1-9(e): cast solo và khung sân khấu cùng t — pixel giống hệt (viền nướng + mực brand), cả host mẫu lẫn pack', { skip: HAS }, async () => {
  for (const S of (PACK ? [packSubject(PACK), fixtureSubject()] : [fixtureSubject()])) {
    const ids = S.recipes.map(r => r.id), recipes = {}; S.recipes.forEach((r, i) => { recipes['CM-000' + (i + 1)] = r; });
    const say = 'Xin chào các bạn nhỏ', toks = say.split(' ');
    const clips = { 'LN-1': { duration_ms: toks.length * 300 + 200, word_times: toks.map((w, i) => ({ w, t0: i * 300, t1: i * 300 + 280 })), envelope: new Array(60).fill(0.5) } };
    const brand = { tokens: { ink: '#14121A' } };
    const plan = buildPlan({ fps: 12, lesson: { title: 'T', lines: [{ id: 'LN-1', who: 'CM-0002', say }], beats: [{ id: 'B1', block: 'title', anchor: { line: 'LN-1', word: 'Xin' }, params: { text: 'Thử' } }] }, clips, channel: { name: 'K' },
      cast: recipes, parts: S.parts, packs: S.packs, brand });
    assert.equal(plan.packs.length, S.packs.length, 'plan.packs có gói');
    const T = 3000, A0 = plan.actors[0].id, act = Dir.makeDirector(plan).act(A0, T);    // nhân vật đứng bên trái, không nói ở T ⇒ zoom 1
    await withStage(async (st, errors) => {
      await st.ev('window.__load(' + JSON.stringify(plan) + ')'); await st.ev('window.__seek(' + T + ')');
      await st.ev('(function(){var s=document.createElement("style");s.textContent="#world,#layerFull,#layerTrack,.chip-top,.sub,.hud .actor + .actor{visibility:hidden!important}.stage,html,body{background:#fff!important}";document.head.appendChild(s);})()');
      const stageSvg = await st.ev('document.querySelector(".hud .actor").innerHTML');
      const clip = { x: 0, y: 574, width: 410, height: 506, scale: 1 };
      const A = await st.shot('png', null, clip);
      const meas = await st.ev('window.__still("cast",' + JSON.stringify({ cast: { [A0]: recipes[A0] }, packs: S.packs, parts: S.parts, ink: '#14121A', layout: 'solo', solo: { id: A0, state: act.state, director: act.director, t: T / 1000, x: -40, scale: 1 } }) + ')');
      const B = await st.shot('png', null, clip);
      assert.equal(meas.stub, false); assert.deepEqual(errors, [], S.label);
      { let i = 0; while (i < stageSvg.length && stageSvg[i] === meas.svg[i]) i++; assert.equal(meas.svg, stageSvg, S.label + ': chuỗi SVG khác ở ' + i + ' …' + stageSvg.slice(i - 80, i + 80) + ' ≠ ' + meas.svg.slice(i - 80, i + 80)); }
      assert.ok(A.length > 2000 && !A.equals(Buffer.alloc(0)));
      if (process.env.GS_KOL_DUMP) { fs.writeFileSync(process.env.GS_KOL_DUMP + '-A.png', A); fs.writeFileSync(process.env.GS_KOL_DUMP + '-B.png', B); }
      assert.equal(Buffer.compare(A, B), 0, S.label + ': PNG cast-solo ≠ PNG sân khấu');
      if (S.outline) assert.ok(stageSvg.length > 30000, 'nhân vật pack có viền nướng ở sân khấu');
      assert.ok(!/#2b211d/i.test(stageSvg) || !S.outline, 'mực brand');
    });
  }
});
function fixtureSubject() {   // pack thử thuần dữ liệu (không cần GS_KOL_PACK): chạy đường pack + outline + ink trên sân khấu thật
  const pack = fixturePack(), res = kol.checkPack(pack); assert.equal(res.ok, true);
  return { label: 'pack thử', recipes: res.recipes, packs: cast.library().packs.concat([{ json: pack, outline: kol.OUTLINE }]), outline: kol.OUTLINE, parts: cast.library().parts };
}
test('sân khấu: nhân vật của pack được viền nướng vào path + mực brand; cast cũ trong cùng plan KHÔNG viền (render không đổi)', { skip: HAS }, async () => {
  const S = fixtureSubject(), recipes = { 'CM-0001': S.recipes[0], 'CM-0002': OLD_CAST[1] };
  const say = 'Xin chào các bạn nhỏ', toks = say.split(' ');
  const clips = { 'LN-1': { duration_ms: 1700, word_times: toks.map((w, i) => ({ w, t0: i * 300, t1: i * 300 + 280 })), envelope: new Array(60).fill(0.5) } };
  const plan = buildPlan({ fps: 12, lesson: { title: 'T', lines: [{ id: 'LN-1', who: 'CM-0001', say }, { id: 'LN-2', who: 'CM-0002', say }], beats: [{ id: 'B1', block: 'title', anchor: { line: 'LN-1', word: 'Xin' }, params: { text: 'Thử' } }] }, clips: Object.assign({}, clips, { 'LN-2': clips['LN-1'] }), channel: { name: 'K' },
    cast: recipes, parts: S.parts, packs: S.packs, brand: { tokens: { ink: '#14121A' } } });
  await withStage(async (st, errors) => {
    await st.ev('window.__load(' + JSON.stringify(plan) + ')'); await st.ev('window.__seek(3000)');
    const svgs = await st.ev('[].map.call(document.querySelectorAll(".hud .actor"),function(a){return a.innerHTML})');
    assert.equal(svgs.length, 2); assert.deepEqual(errors, []);
    assert.ok(svgs[0].includes('#14121A') && !/#2b211d/i.test(svgs[0]) && !/<filter/.test(svgs[0]), 'pack: mực brand, không filter');
    assert.ok(svgs[0].length > 30000, 'pack: có viền nướng');
    assert.ok(svgs[1].length < 30000 && !svgs[1].includes('#14121A'), 'cast cũ: không viền, không đổi mực');
  });
});
