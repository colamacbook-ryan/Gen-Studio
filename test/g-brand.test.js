// © 2026 Gen Labs — All rights reserved.
// Gói B (F2 nhận diện kênh) — phần không cần Chromium: normalize/check/cssVars/hash, F2-1 (không còn màu cứng), F2-3 (tương phản), F2-4 (quyền), F2-9 (đề xuất → owner áp dụng),
// MCP (get_channel/capabilities/propose_brand_change), timeline (intro/outro), hook plan.after (logo), khối end-card v2. Dựng hình thật: g-brand-render.test.js.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const brand = require('../render/brand.js');
const auth = require('../server/auth.js');
const { createMcp } = require('../server/mcp.js');
const { buildPlan } = require('../render/engine/timeline.js');
const registry = require('../render/blocks/registry.js');
const { tmpDb, basics, owner, agent } = require('./a-helpers');

const ROOT = path.join(__dirname, '..');
const code = (c) => (e) => e.name === 'WriteError' && e.code === c;
const NON_OWNER_UI = (db) => [
  ['agent compose', agent(['read', 'compose', 'run'])], ['agent run', agent(['run'])], ['trợ lý', { type: 'assistant', entry: 'assistant' }],
  ['CLI', { type: 'cli', entry: 'cli' }], ['runner', { type: 'runner', entry: 'runner' }], ['owner qua http (không phải phiên UI)', Object.assign({}, owner(db), { entry: 'http' })],
];
const png = (w, h, tag = 0) => { const b = Buffer.alloc(40 + tag, 7); Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]).copy(b, 0); b.write('IHDR', 12); b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20); return b; };
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#FF00AA"/></svg>');

// ---------- render/brand.js ----------
test('normalize: kênh chưa có brand (kể cả style.palette cũ) ⇒ null — bản dựng cũ giữ nguyên từng điểm ảnh', () => {
  assert.equal(brand.normalize(null), null); assert.equal(brand.normalize({}), null); assert.equal(brand.normalize({ style: { palette: 'paper' } }), null);
  assert.equal(brand.normalize({ brand: [] }), null); assert.equal(brand.normalize({ brand: 'x' }), null);
});

test('preset giay-o-ly = đúng bảng màu :root của style.css (giao diện v0.1.x); mọi preset qua check()', () => {
  const css = fs.readFileSync(path.join(ROOT, 'render/stage/style.css'), 'utf8').split('\n').slice(0, 14).join('\n');
  for (const [k, v] of Object.entries(brand.PRESETS['giay-o-ly'].tokens)) assert.match(css, new RegExp('--v-' + k.replace(/_/g, '-') + ': ' + v + ';', 'i'), 'token ' + k);
  for (const p of Object.keys(brand.PRESETS)) {
    assert.deepEqual(brand.check({ preset: p }), [], p);
    assert.deepEqual(brand.check(brand.normalize({ brand: { preset: p } })), [], p + ' (đã chuẩn hoá)');
    assert.ok(brand.FONT_PAIRS[brand.PRESETS[p].fonts], p + ' dùng cặp phông có thật');
  }
});

test('normalize: gộp preset + mặc định, làm sạch giá trị sai, idempotent; hash không tính hash/vars và đổi theo nội dung', () => {
  const n = brand.normalize({ brand: { preset: 'console', tokens: { hl: '#abcdef', ink: 'đỏ', zzz: '#000000' }, intro: { enabled: true, kind: 'logo-pop', duration_ms: 99999 } }, lower_third_text: '{name}', end_card: { cta: 'Học tiếp' } });
  assert.equal(n.preset, 'console'); assert.equal(n.tokens.hl, '#ABCDEF', 'HEX hợp lệ được giữ (chuẩn hoá hoa)'); assert.equal(n.tokens.ink, brand.PRESETS.console.tokens.ink, 'giá trị sai ⇒ rơi về preset');
  assert.equal(n.tokens.zzz, undefined); assert.equal(n.intro.duration_ms, 1800, 'vượt 3000 ms ⇒ mặc định'); assert.equal(n.lower_third.text, '{name}'); assert.equal(n.end_card.cta, 'Học tiếp');
  assert.deepEqual([n.logo, n.lower_third.enabled, n.subtitle.plate, n.outro.hold_ms, n.fonts.pair], [null, false, 'none', 2100, 'plex-sans+plex-mono']);
  assert.match(n.hash, /^[0-9a-f]{16}$/); assert.ok(n.vars['--v-ink']);
  const again = brand.normalize({ brand: n });
  assert.equal(again.hash, n.hash, 'chuẩn hoá lại bản đã chuẩn hoá ⇒ cùng hash'); assert.deepEqual(again.tokens, n.tokens);
  assert.equal(brand.hash(Object.assign({}, n, { hash: 'x', vars: {} })), n.hash);
  assert.notEqual(brand.normalize({ brand: { preset: 'console', tokens: { hl: '#ABCDEE' } } }).hash, brand.normalize({ brand: { preset: 'console', tokens: { hl: '#ABCDEF' } } }).hash);
  const a = brand.normalize({ brand: { tokens: { hl: '#ABCDEF', leaf: '#112233' } } }), b = brand.normalize({ brand: { tokens: { leaf: '#112233', hl: '#ABCDEF' } } });
  assert.equal(a.hash, b.hash, 'không phụ thuộc thứ tự khoá');
  assert.equal(brand.hash(null), null);
});

test('F2-3 check: mọi lỗi báo đúng token; lược đồ (khoá lạ, enum, giới hạn intro ≤ 3000 ms, logo)', () => {
  const only = (b) => brand.check(b).map((e) => e.path);
  assert.ok(only({ tokens: { ink: '#CCCCCC' } }).includes('tokens.ink'));
  assert.deepEqual(only({ tokens: { ink_soft: '#DDDDDD' } }), ['tokens.ink_soft']);
  assert.deepEqual(only({ tokens: { en: '#AAAAFF' } }), ['tokens.en']);
  assert.deepEqual(only({ tokens: { hl: '#1D2A6E' } }), ['tokens.hl'], 'mực trên nhấn vàng');
  assert.deepEqual(only({ tokens: { card: '#1D2A8E' } }), ['tokens.card'], 'mực trên thẻ');
  const e = brand.check({ tokens: { en: '#9988FF' } })[0];
  assert.match(e.text, /Chữ thuật ngữ trên nền giấy chỉ \d,\d:1 — cần ≥ 4,5:1/); assert.ok(e.ratio < 4.5 && e.need === 4.5);
  assert.deepEqual(only({ tokens: { ink: 'red', paper: '#FFF' } }), ['tokens.ink', 'tokens.paper']);
  assert.deepEqual(only({ foo: 1 }), ['foo']); assert.deepEqual(only({ preset: 'x' }), ['preset']); assert.deepEqual(only({ fonts: { pair: 'comic-sans' } }), ['fonts.pair']);
  assert.deepEqual(only({ intro: { duration_ms: 3001 } }), ['intro.duration_ms']); assert.deepEqual(only({ intro: { duration_ms: 3000, enabled: true, kind: 'logo-pop' } }), []);
  assert.deepEqual(only({ intro: { enabled: true, kind: 'none' } }), ['intro.kind']);
  assert.deepEqual(only({ logo: { asset: 'logo.png' } }), ['logo.asset']); assert.deepEqual(only({ logo: { asset: 'AS-0007', corner: 'x' } }), ['logo.corner']);
  assert.deepEqual(only({ logo: { asset: 'AS-0007', show: ['video', 'đâu'] } }), ['logo.show']); assert.deepEqual(only({ logo: null }), []);
  assert.deepEqual(only({ subtitle: { size: 'xl', position: 'left' } }), ['subtitle.size', 'subtitle.position']);
  assert.deepEqual(only({ lower_third: { style: 'chip', evil: 1 } }), ['lower_third.evil']); assert.deepEqual(only('x'), ['brand']); assert.deepEqual(only([]), ['brand']);
  assert.ok(brand.contrast('#000000', '#FFFFFF') > 20.9);
});

test('cssVars: đủ token + phông + biến dẫn xuất; đổi token ⇒ đổi biến; logo chiếm chỗ chip góc trái', () => {
  const v = brand.cssVars(brand.normalize({ brand: { preset: 'console', logo: { asset: 'AS-0007', corner: 'tl', size: 'm' }, subtitle: { size: 'l', max_chars_line: 30 } } }));
  for (const k of brand.TOKEN_KEYS) assert.equal(v['--v-' + k.replace(/_/g, '-')], brand.PRESETS.console.tokens[k]);
  assert.equal(v['--v-coral'], v['--v-accent2'], 'bí danh cũ'); assert.match(v['--f-display'], /IBM Plex Sans/); assert.match(v['--f-hand'], /IBM Plex Mono/);
  assert.equal(v['--sub-size'], '44px'); assert.equal(v['--logo-px'], '160px'); assert.equal(v['--chip-left'], '224px'); assert.match(v['--v-sub-bg'], /^rgba\(16,24,32,0\.93\)$/);
  assert.equal(brand.cssVars({})['--v-ink'], '#1D2A6E', 'cssVars nhận bản thô/rỗng');
  assert.equal(brand.cssVars({ preset: 'console', logo: { asset: 'AS-1', corner: 'tl', show: ['thumb'] } })['--chip-left'], '40px', 'logo không hiện trên video ⇒ chip không nhường chỗ');
});

test('F2-1: khối hình không còn màu cứng (HEX/rgb) — #fff cũng đi qua token', () => {
  const dir = path.join(ROOT, 'render/blocks'), bad = [];
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.js'))) {
    fs.readFileSync(path.join(dir, f), 'utf8').split('\n').forEach((ln, i) => { if (/#[0-9A-Fa-f]{3,8}\b|rgba?\(/.test(ln)) bad.push(`${f}:${i + 1}`); });
  }
  assert.deepEqual(bad, []);
  const css = fs.readFileSync(path.join(ROOT, 'render/stage/style.css'), 'utf8');
  assert.ok(!/var\(--v-coral\)/.test(css), 'CSS dùng --v-accent2 (--v-coral chỉ còn là bí danh)');
});

// ---------- end-card v2 ----------
test('end-card v2: cta/url_label hợp lệ, thừa trường vẫn bị từ chối, version 2', () => {
  assert.equal(registry.get('end-card').version, 2);
  assert.ok(registry.validate('end-card', { title: 'K' }).ok, 'bài cũ (v1) vẫn hợp lệ');
  assert.ok(registry.validate('end-card', { title: 'K', cta: 'Đăng ký để học tiếp', url_label: 'genlabs.vn/hoc' }).ok);
  assert.ok(!registry.validate('end-card', { title: 'K', cta: 'x'.repeat(41) }).ok); assert.ok(!registry.validate('end-card', { title: 'K', url_label: 'x'.repeat(41) }).ok);
  assert.ok(!registry.validate('end-card', { title: 'K', link: 'https://x' }).ok);
});

// ---------- timeline ----------
test('F2-5 timeline: intro bật ⇒ LEAD = max(1100, intro+300), mọi mốc dời đều; ≤ 3000; outro.hold_ms; không brand ⇒ y như cũ', () => {
  const L = [{ id: 'LN-1', who: 'CM-0002', say: 'Chào bạn nhỏ' }, { id: 'LN-2', who: 'CM-0001', say: 'Chào bạn' }];
  const lesson = { title: 'T', lines: L, beats: [{ id: 'B1', block: 'title', anchor: { line: 'LN-1', word: 'Chào' }, params: { text: 'Xin chào' } }] };
  const base = buildPlan({ fps: 12, lesson });
  assert.equal(base.lines[0].a_ms, 1100); assert.equal(base.style.brand, null);
  const noIntro = buildPlan({ fps: 12, lesson, brand: brand.normalize({ brand: { preset: 'console' } }) });
  assert.equal(noIntro.lines[0].a_ms, 1100); assert.equal(noIntro.duration_ms, base.duration_ms, 'brand không intro/outro tuỳ chỉnh ⇒ cùng thời lượng');
  const withIntro = buildPlan({ fps: 12, lesson, brand: brand.normalize({ brand: { intro: { enabled: true, kind: 'logo-pop', duration_ms: 1800 } } }) });
  assert.equal(withIntro.lines[0].a_ms, 2100); assert.equal(withIntro.lines[1].a_ms - withIntro.lines[0].a_ms, base.lines[1].a_ms - base.lines[0].a_ms);
  assert.equal(withIntro.duration_ms - base.duration_ms, 1000, 'mọi mốc dời đúng 1000 ms');
  assert.equal(withIntro.beats[0].t_in, 1800, 'khối mở đầu vào đúng lúc intro tan');
  const short = buildPlan({ fps: 12, lesson, brand: brand.normalize({ brand: { intro: { enabled: true, kind: 'title-wipe', duration_ms: 500 } } }) });
  assert.equal(short.lines[0].a_ms, 1100, 'intro ngắn không kéo LEAD dưới 1100');
  const off = buildPlan({ fps: 12, lesson, brand: brand.normalize({ brand: { intro: { enabled: false, kind: 'logo-pop' } } }) });
  assert.equal(off.lines[0].a_ms, 1100, 'enabled=false ⇒ không intro');
  const hold = buildPlan({ fps: 12, lesson, brand: brand.normalize({ brand: { outro: { hold_ms: 3100 } } }) });
  assert.equal(hold.duration_ms - base.duration_ms, 1000, 'outro.hold_ms 3100 thay 2100');
});

// ---------- cổng ghi: quyền + đề xuất ----------
test('F2-4 quyền: agent/trợ lý/CLI/runner/owner-http ✗ sửa brand trực tiếp; owner UI ✓ (version mới + audit); lược đồ/tương phản sai ⇒ lỗi từng token, không ghi', () => {
  const t = tmpDb(); const b = basics(t.write, t.db);
  try {
    const v0 = t.db.get('SELECT current_version AS v FROM channels WHERE display_id=?', b.ch.display_id).v;
    for (const [name, a] of NON_OWNER_UI(t.db).filter(([n]) => !/owner/.test(n))) {
      assert.throws(() => t.write(a, 'channel.update', { channel: b.ch.display_id, data: { brand: { preset: 'tron' } } }), code('forbidden'), name + ' update');
      assert.throws(() => t.write(a, 'channel.create', { name: 'Z', data: { brand: { preset: 'tron' } } }), code('forbidden'), name + ' create');
    }
    assert.throws(() => t.write(agent(['compose']), 'channel.update', { channel: b.ch.display_id, data: { brand: { tokens: { ink: 'rác' } } } }), code('forbidden'), 'agent gửi brand sai vẫn là forbidden, không lộ lược đồ');
    assert.equal(t.db.get('SELECT current_version AS v FROM channels WHERE display_id=?', b.ch.display_id).v, v0);
    // lỗi theo token
    try { t.write(b.o, 'channel.update', { channel: b.ch.display_id, data: { brand: { tokens: { en: '#9988FF' } } } }); assert.fail('phải lỗi'); } catch (e) {
      assert.equal(e.code, 'invalid'); assert.deepEqual(e.detail.errors.map((x) => x.path), ['tokens.en']); assert.match(e.text_human, /tokens\.en: Chữ thuật ngữ trên nền giấy chỉ/);
    }
    assert.equal(t.db.get('SELECT current_version AS v FROM channels WHERE display_id=?', b.ch.display_id).v, v0, 'sai ⇒ không ghi version');
    const out = t.write(b.o, 'channel.update', { channel: b.ch.display_id, data: { brand: { preset: 'console' } } });
    assert.equal(out.version, v0 + 1);
    assert.equal(t.db.get("SELECT COUNT(*) AS n FROM audit_log WHERE action='channel.update' AND entity_id=?", b.ch.display_id).n, 1);
    // owner đặt null ⇒ gỡ brand (quay về giao diện mặc định)
    t.write(b.o, 'channel.update', { channel: b.ch.display_id, data: { brand: null } });
    // create có brand sai ⇒ invalid
    assert.throws(() => t.write(b.o, 'channel.create', { name: 'Z', data: { brand: { intro: { duration_ms: 5000 } } } }), code('invalid'));
    // trường nội dung (tone, lower_third_text, end_card) agent vẫn sửa được (A4)
    t.write(agent(['compose']), 'channel.update', { channel: b.ch.display_id, data: { style: { tone: 'vui' }, lower_third_text: '{name}', end_card: { cta: 'Học tiếp' } } });
  } finally { t.clean(); }
});

test('F2-9 brand.propose: agent compose tạo SG- (diff patch); chỉ owner UI áp dụng; ô ✗ cho mọi diễn viên khác; apply ⇒ version mới + audit', () => {
  const t = tmpDb(); const b = basics(t.write, t.db);
  try {
    const ag = agent(['compose']), ch = b.ch.display_id;
    for (const [name, a] of [['agent chỉ đọc', agent(['read'])], ['agent run', agent(['run'])], ['trợ lý', { type: 'assistant', entry: 'assistant' }], ['CLI', { type: 'cli', entry: 'cli' }], ['runner', { type: 'runner', entry: 'runner' }]]) {
      assert.throws(() => t.write(a, 'brand.propose', { channel: ch, brand_patch: { preset: 'tron' } }), code('forbidden'), name + ' ✗ propose');
    }
    assert.equal(t.db.get('SELECT COUNT(*) AS n FROM suggestions').n, 0);
    // patch xấu bị chặn ngay khi đề xuất (không để owner mới phát hiện)
    assert.throws(() => t.write(ag, 'brand.propose', { channel: ch, brand_patch: { tokens: { en: '#9988FF' } } }), code('invalid'));
    assert.throws(() => t.write(ag, 'brand.propose', { channel: ch, brand_patch: {} }), code('invalid')); assert.throws(() => t.write(ag, 'brand.propose', { channel: ch, brand_patch: [1] }), code('invalid'));
    assert.throws(() => t.write(ag, 'brand.propose', { channel: ch, brand_patch: { tokens: { paper: '#FFFFFF' }, note: 'x'.repeat(20000) } }), code('invalid'), 'patch ≤ 16 KB');
    assert.throws(() => t.write(ag, 'brand.propose', { channel: 'CH-9999', brand_patch: { preset: 'tron' } }), (e) => e.code === 'not_found' || e.code === 'invalid');
    const sg = t.write(ag, 'brand.propose', { channel: ch, brand_patch: { preset: 'console', tokens: { hl: '#FFE066' } }, note: 'đổi sang tông console' });
    assert.match(sg.display_id, /^SG-/); assert.equal(sg.target_kind, 'channel_brand'); assert.equal(sg.state, 'proposed');
    assert.deepEqual(sg.diff.patch, { preset: 'console', tokens: { hl: '#FFE066' } }); assert.equal(sg.diff.after.preset, 'console'); assert.equal(sg.diff.channel, ch);
    assert.equal(t.db.get("SELECT COUNT(*) AS n FROM audit_log WHERE action='brand.propose'").n, 1);
    const v0 = t.db.get('SELECT current_version AS v FROM channels WHERE display_id=?', ch).v;
    // ✗ áp dụng: mọi diễn viên không phải owner-UI
    for (const [name, a] of NON_OWNER_UI(t.db)) assert.throws(() => t.write(a, 'suggestion.apply', { suggestion: sg.display_id }), code('forbidden'), name + ' ✗ apply');
    assert.equal(t.db.get('SELECT current_version AS v FROM channels WHERE display_id=?', ch).v, v0); assert.equal(t.db.get('SELECT state FROM suggestions WHERE display_id=?', sg.display_id).state, 'proposed');
    // ✓ owner UI
    const r = t.write(b.o, 'suggestion.apply', { suggestion: sg.display_id });
    assert.equal(r.state, 'applied');
    assert.equal(t.db.get('SELECT current_version AS v FROM channels WHERE display_id=?', ch).v, v0 + 1);
    const data = t.db.json(t.db.get('SELECT data FROM channel_versions WHERE version=? AND entity_id=(SELECT id FROM channels WHERE display_id=?)', v0 + 1, ch)).data;
    assert.equal(data.brand.preset, 'console'); assert.equal(data.brand.tokens.hl, '#FFE066'); assert.equal(data.style.a, 1, 'giữ nguyên phần còn lại của kênh');
    const au = t.db.get("SELECT after FROM audit_log WHERE action='suggestion.apply'").after;
    assert.match(au, /channel_version/); assert.match(au, new RegExp(brand.normalize({ brand: data.brand }).hash));
    assert.throws(() => t.write(b.o, 'suggestion.apply', { suggestion: sg.display_id }), code('conflict'), 'không áp dụng hai lần');
    // gộp sâu: đề xuất thứ hai chỉ đổi 1 token, giữ phần trước
    const sg2 = t.write(ag, 'brand.propose', { channel: ch, brand_patch: { tokens: { accent: '#C0392B' }, lower_third: { enabled: true } } });
    t.write(b.o, 'suggestion.apply', { suggestion: sg2.display_id });
    const d2 = t.db.json(t.db.get('SELECT data FROM channel_versions WHERE version=? AND entity_id=(SELECT id FROM channels WHERE display_id=?)', v0 + 2, ch)).data;
    assert.deepEqual([d2.brand.preset, d2.brand.tokens.hl, d2.brand.tokens.accent, d2.brand.lower_third.enabled], ['console', '#FFE066', '#C0392B', true]);
    // trợ lý đề xuất qua suggestion.create: validate diff khi tạo; agent không tạo SG- bằng op chung
    const asst = { type: 'assistant', entry: 'assistant' };
    assert.throws(() => t.write(asst, 'suggestion.create', { target_kind: 'channel_brand', target_id: ch, diff: {} }), code('invalid'));
    assert.throws(() => t.write(asst, 'suggestion.create', { target_kind: 'channel_brand', target_id: ch, diff: { patch: { tokens: { en: '#9988FF' } } } }), code('invalid'));
    assert.throws(() => t.write(ag, 'suggestion.create', { target_kind: 'channel_brand', target_id: ch, diff: { patch: { preset: 'tron' } } }), code('forbidden'));
    const sg3 = t.write(asst, 'suggestion.create', { target_kind: 'channel_brand', target_id: ch, diff: { patch: { preset: 'tron' } } });
    t.write(b.o, 'suggestion.apply', { suggestion: sg3.display_id });
    assert.equal(brand.normalize(t.db.json(t.db.get('SELECT data FROM channel_versions WHERE version=? AND entity_id=(SELECT id FROM channels WHERE display_id=?)', v0 + 3, ch)).data).preset, 'tron');
  } finally { t.clean(); }
});

test('brand.propose: trần đề xuất chờ duyệt mỗi kênh (chống tràn)', () => {
  const t = tmpDb(); const b = basics(t.write, t.db);
  try {
    for (let i = 0; i < 20; i++) t.write(agent(['compose']), 'brand.propose', { channel: b.ch.display_id, brand_patch: { tokens: { hl: '#FFE0' + (10 + i) } } });
    assert.throws(() => t.write(agent(['compose']), 'brand.propose', { channel: b.ch.display_id, brand_patch: { preset: 'tron' } }), code('conflict'));
  } finally { t.clean(); }
});

test('logo: asset phải có thật, SVG/PNG/WebP ≤ 512 KB, ≤ 1024 px; lỗi theo logo.asset', () => {
  const t = tmpDb(); const b = basics(t.write, t.db);
  try {
    const ch = b.ch.display_id, ag = agent(['compose']);
    const put = (kind, mime, bytes) => t.write(b.o, 'asset.put', { kind, mime, bytes, pii_redacted: true }).display_id;
    const errOf = (id) => { try { t.write(ag, 'brand.propose', { channel: ch, brand_patch: { logo: { asset: id } } }); return null; } catch (e) { assert.equal(e.code, 'invalid'); return e.detail.errors[0]; } };
    assert.equal(errOf('AS-9999').path, 'logo.asset');
    assert.equal(errOf(put('svg', 'image/svg+xml', SVG)), null, 'SVG qua lọc ✓');
    assert.equal(errOf(put('image', 'image/png', png(200, 100, 1))), null, 'PNG 200×100 ✓');
    assert.match(errOf(put('image', 'image/png', png(2000, 100, 2))).text, /cạnh dài 2000 px, tối đa 1024 px/);
    assert.match(errOf(put('image', 'image/png', Buffer.concat([png(100, 100, 3), Buffer.alloc(513 * 1024)]))).text, /SVG\/PNG\/WebP ≤ 512 KB/);
    assert.match(errOf(put('image', 'image/jpeg', Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 6, 7, 8]))).text, /SVG\/PNG\/WebP/, 'JPEG không nhận làm logo');
    // asset hợp lệ được đề xuất ⇒ owner áp dụng ⇒ brand.logo.asset lưu đúng
    const id = put('svg', 'image/svg+xml', Buffer.from(SVG.toString().replace('FF00AA', '00AAFF')));
    const sg = t.write(ag, 'brand.propose', { channel: ch, brand_patch: { logo: { asset: id, corner: 'br', size: 'm' } } });
    t.write(b.o, 'suggestion.apply', { suggestion: sg.display_id });
    const cur = t.db.json(t.db.get('SELECT data FROM channel_versions v JOIN channels c ON c.id=v.entity_id AND v.version=c.current_version WHERE c.display_id=?', ch)).data;
    assert.deepEqual([cur.brand.logo.asset, cur.brand.logo.corner], [id, 'br']);
  } finally { t.clean(); }
});

// ---------- hook plan.after (logo → asset đã phân giải, cue intro) ----------
test('hook plan.after: logo AS-… → plan.style.brand.logo.ref + assetRefs (hash giữ nguyên), cue intro; asset mất ⇒ PlanError brand_logo_missing; không brand ⇒ không đụng', () => {
  const t = tmpDb(); const b = basics(t.write, t.db);
  try {
    const id = t.write(b.o, 'asset.put', { kind: 'svg', mime: 'image/svg+xml', bytes: SVG }).display_id, apath = t.db.get('SELECT path FROM assets WHERE display_id=?', id).path;
    const n = brand.normalize({ brand: { logo: { asset: id }, intro: { enabled: true, kind: 'logo-pop', duration_ms: 1500, sfx: 'chime' } } });
    const plan = { style: { brand: n }, cues: [{ t_ms: 50, name: 'pop', vol: 0.4 }, { t_ms: 9000, name: 'rimshot', vol: 0.4 }], assetRefs: [{ asset: 'x.svg' }] };
    t.write.ext.hooks.run('plan.after', { B: {}, plan, ctx: {} });
    assert.equal(plan.style.brand.logo.ref, apath); assert.equal(plan.style.brand.hash, n.hash); assert.equal(n.logo.ref, undefined, 'không sửa đối tượng gốc');
    assert.deepEqual(plan.assetRefs.map((x) => x.asset), ['x.svg', apath]); assert.deepEqual(plan.cues.map((c) => c.name), ['pop', 'chime', 'rimshot'], 'cue intro chen đúng thứ tự thời gian');
    const none = { style: { brand: null }, cues: [], assetRefs: [] }; t.write.ext.hooks.run('plan.after', { B: {}, plan: none, ctx: {} }); delete none.moods;   /* moods: bảng tâm trạng của gói V, không thuộc brand */ assert.deepEqual(none, { style: { brand: null }, cues: [], assetRefs: [] });
    t.db.run("UPDATE assets SET media_present=0 WHERE display_id=?", id);
    assert.throws(() => t.write.ext.hooks.run('plan.after', { B: {}, plan: { style: { brand: n }, cues: [] }, ctx: {} }), (e) => e.name === 'PlanError' && e.code === 'brand_logo_missing');
  } finally { t.clean(); }
});

// ---------- MCP ----------
test('MCP: get_channel trả brand chuẩn hoá (không vars) + brand_errors; update_channel(brand) ⇒ forbidden kèm gợi ý; propose_brand_change; capabilities; read ✗ propose', async () => {
  const t = tmpDb(); const b = basics(t.write, t.db);
  try {
    const mcp = createMcp({ db: t.db, write: t.write, config: { version: 't', dataDir: t.dir, ffmpegPath: 'ffmpeg', chromiumPath: null } });
    const mk = (scopes) => { const r = t.write(b.o, 'agent.create', { name: 'A' + scopes.join(''), scopes }); return auth.verifyAgentToken(t.db, r.token); };
    const call = async (c, name, args) => (await mcp.handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args || {} } }, c)).result;
    const compose = mk(['read', 'compose']), ro = mk(['read']);
    let r = await call(ro, 'get_channel', {}); assert.equal(r.structuredContent.channel.brand, null); assert.deepEqual(r.structuredContent.channel.brand_errors, []);
    t.write(b.o, 'channel.update', { channel: b.ch.display_id, data: { brand: { preset: 'console' } } });
    r = await call(ro, 'get_channel', {}); const br = r.structuredContent.channel.brand;
    assert.equal(br.preset, 'console'); assert.match(br.hash, /^[0-9a-f]{16}$/); assert.equal(br.vars, undefined, 'bỏ vars'); assert.deepEqual(r.structuredContent.channel.brand_errors, []);
    r = await call(compose, 'update_channel', { channel: b.ch.display_id, data: { brand: { preset: 'tron' } } });
    assert.ok(r.isError); assert.match(r.content[0].text, /forbidden/); assert.match(r.content[0].text, /propose_brand_change/);
    r = await call(ro, 'propose_brand_change', { channel: b.ch.display_id, brand_patch: { preset: 'tron' } }); assert.ok(r.isError && /forbidden/.test(r.content[0].text), 'read ✗');
    assert.ok(!(await mcp.handle({ jsonrpc: '2.0', id: 2, method: 'tools/list' }, ro)).result.tools.some((x) => x.name === 'propose_brand_change'), 'read không thấy tool');
    r = await call(compose, 'propose_brand_change', { channel: b.ch.display_id, brand_patch: { tokens: { en: '#9988FF' } } });
    assert.ok(r.isError && /invalid/.test(r.content[0].text) && /tokens\.en/.test(r.content[0].text), 'patch sai ⇒ lỗi theo token');
    r = await call(compose, 'propose_brand_change', { channel: b.ch.display_id, brand_patch: { preset: 'tron' }, note: 'thử' });
    assert.ok(!r.isError, r.content[0].text); assert.match(r.structuredContent.suggestion, /^SG-/); assert.equal(r.structuredContent.state, 'proposed');
    assert.equal(t.db.get("SELECT created_by FROM suggestions").created_by.startsWith('agent:'), true, 'ghi nhận agent đề xuất');
    assert.equal(brand.normalize(t.db.json(t.db.get('SELECT data FROM channel_versions v JOIN channels c ON c.id=v.entity_id AND v.version=c.current_version WHERE c.display_id=?', b.ch.display_id)).data).preset, 'console', 'đề xuất chưa áp dụng ⇒ brand chưa đổi');
    r = await call(ro, 'get_capabilities', {});
    assert.deepEqual(r.structuredContent.brand_presets.map((p) => p.id), ['giay-o-ly', 'console', 'tron']);
    assert.deepEqual(r.structuredContent.font_pairs.map((p) => p.id), ['be-vietnam+patrick-hand', 'be-vietnam+plex-mono', 'plex-sans+plex-mono', 'be-vietnam+be-vietnam']);
  } finally { t.clean(); }
});
