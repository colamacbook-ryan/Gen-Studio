// © 2026 Gen Labs — All rights reserved.
// Gói UI-H1 — tab Nhận diện của Kênh: tương phản phía giao diện khớp render/brand.js, làm sạch bản lưu, gộp đề xuất, hợp đồng móc tab channel-tabs,
// route GET /api/channels/:id/brand; lưu brand (owner) ⇒ version mới; xem trước nháp không ghi DB; Áp dụng SG- chỉ owner UI (agent token ⇒ 403).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const brandMod = require('../render/brand.js');
const { bootDemo, load, request, STUDIO } = require('./e-ui-w2-helpers.js');

test('H1 tương phản: contrastRatio/contrastIssues cho cùng kết quả với render/brand.js check() (mọi preset + bộ màu xấu)', async () => {
  const { contrastRatio, contrastIssues } = await load('views/channel-tabs/brand.js');
  for (const p of Object.values(brandMod.PRESETS)) {
    assert.deepEqual(contrastIssues(p.tokens), [], 'preset đạt');
    assert.ok(Math.abs(contrastRatio(p.tokens.paper, p.tokens.ink) - brandMod.contrast(p.tokens.paper, p.tokens.ink)) < 1e-9);
  }
  const bad = Object.assign({}, brandMod.PRESETS['giay-o-ly'].tokens, { ink: '#9999AA', en: '#BBBBBB', hl: '#3A3A3A' });
  const ui = contrastIssues(bad).map((x) => x.token).sort();
  const srv = brandMod.check({ tokens: bad }).filter((e) => e.ratio != null).map((e) => e.path.replace('tokens.', '')).sort();
  assert.deepEqual(ui, srv);
  assert.equal(contrastRatio('#FFF', '#000'), null, 'HEX sai ⇒ không tính');
});

test('H1 cleanBrand/deepMerge: bản lưu không mang vars/hash/logo.ref; đề xuất gộp sâu không đụng bản gốc', async () => {
  const { cleanBrand, deepMerge } = await load('views/channel-tabs/brand.js');
  const n = brandMod.normalize({ brand: { preset: 'console', logo: { asset: 'AS-0001', corner: 'br' } } });
  n.logo.ref = 'media/x.svg';
  const c = cleanBrand(n);
  assert.ok(!('vars' in c) && !('hash' in c) && !('ref' in c.logo));
  assert.deepEqual(brandMod.check(c), [], 'bản làm sạch qua được kiểm của máy chủ');
  assert.ok(!('logo' in cleanBrand(brandMod.normalize({ brand: {} }))), 'không logo ⇒ bỏ khoá');
  const a = { subtitle: { size: 'm', plate: 'none' }, tokens: { ink: '#111111' } };
  const m = deepMerge(a, { subtitle: { size: 'l' } });
  assert.deepEqual(m.subtitle, { size: 'l', plate: 'none' }); assert.equal(a.subtitle.size, 'm');
});

test('H1 móc tab (CNS-126, hợp đồng lists.js UI-L5R3): tab(env) → {key, label, order, mount(host)} | null; i18n vi = en; nhãn segmented động có đủ', async () => {
  const m = await load('views/channel-tabs/brand.js');
  const i = await load('i18n.js'); i.setLang('vi');
  assert.equal(m.default, m.tab); assert.equal(typeof m.tab, 'function');
  const tb = m.tab({ channel: { display_id: 'CH-0001', name: 'K', version: 1, data: {} }, isOwner: true, reload() {} });
  assert.equal(tb.key, 'brand'); assert.equal(tb.label, 'Nhận diện'); assert.equal(typeof tb.mount, 'function'); assert.equal(typeof tb.order, 'number');
  assert.equal(m.tab({}), null, 'không có kênh ⇒ không gắn tab');
  assert.equal(typeof m.openBrandEditor, 'function');
  const { MODULES } = await load('i18n/index.js');
  const { vi, en } = MODULES.brand;
  assert.deepEqual(Object.keys(vi).sort(), Object.keys(en).sort());
  for (const k of brandMod.TOKEN_KEYS) assert.ok(vi['brand.tok.' + k], k);
  for (const c of ['tl', 'tr', 'bl', 'br']) assert.ok(vi['brand.corner.' + c]);
  for (const k of ['logo-pop', 'title-wipe', 'none']) assert.ok(vi['brand.intro.kind.' + k]);
  for (const k of ['mid', 'card', 'thumb']) assert.ok(vi['brand.pv.' + k]);
  for (const r of m.CONTRAST) assert.ok(vi['brand.cr.' + r[4]]);
  assert.ok(vi['brand.lt_off_vertical'] && vi['brand.sub.top_vertical'], 'ghi chú 9:16 (F7 §5.3)');
  const src = fs.readFileSync(path.join(STUDIO, 'views', 'channel-tabs', 'brand.js'), 'utf8');
  assert.ok(!/innerHTML/.test(src));
  assert.match(src, /'\/api\/preview\/still', \{ method: 'POST'/);
});

test('H1 HTTP: đọc brand, xem trước nháp không ghi, lưu (owner) ⇒ version mới, tương phản sai ⇒ 400 theo token; SG- áp dụng chỉ owner UI', async () => {
  const t = await bootDemo();
  try {
    const b = await t.api('GET', '/api/channels/CH-0001/brand');
    assert.equal(b.status, 200, b.text);
    assert.equal(b.json.channel.display_id, 'CH-0001');
    assert.ok(b.json.normalized && b.json.normalized.tokens.ink);
    assert.equal(b.json.presets.length, Object.keys(brandMod.PRESETS).length);
    assert.ok(Array.isArray(b.json.suggestions) && Array.isArray(b.json.logos));
    const v0 = b.json.channel.version;
    // xem trước nháp có lỗi tương phản ⇒ 400 + errors (UI hiện dưới ô); KHÔNG đổi version
    const pv = await t.api('POST', '/api/preview/still', { mode: 'brand', channel: 'CH-0001', view: 'mid', brand: { tokens: { ink: '#EEEEEE' } }, aspect: '9:16', w: 360 });
    assert.equal(pv.status, 400);
    assert.ok(pv.json.error.detail.errors.some((e) => e.path === 'tokens.ink'));
    // lưu brand hợp lệ (đúng dạng cleanBrand) ⇒ version + 1
    const { cleanBrand } = await load('views/channel-tabs/brand.js');
    const draft = cleanBrand(b.json.normalized); draft.preset = 'console'; draft.tokens = Object.assign({}, brandMod.PRESETS.console.tokens);
    const sv = await t.api('POST', '/api/channels', { id: 'CH-0001', data: { brand: draft } });
    assert.equal(sv.status, 201, sv.text);
    const b2 = await t.api('GET', '/api/channels/CH-0001/brand');
    assert.equal(b2.json.channel.version, v0 + 1);
    assert.equal(b2.json.brand.preset, 'console');
    const badSave = await t.api('POST', '/api/channels', { id: 'CH-0001', data: { brand: Object.assign({}, draft, { tokens: Object.assign({}, draft.tokens, { ink: '#F0F0F0' }) }) } });
    assert.equal(badSave.status, 400);
    // đề xuất SG- (trợ lý tạo) ⇒ hiện trong danh sách ⇒ agent token không áp dụng được ⇒ owner UI áp dụng ⇒ kênh lên version
    const sg = t.write({ type: 'assistant', id: 'tro-ly', entry: 'assistant' }, 'suggestion.create', { target_kind: 'channel_brand', target_id: 'CH-0001', diff: { channel: 'CH-0001', patch: { subtitle: { size: 'l' } } } });
    const b3 = await t.api('GET', '/api/channels/CH-0001/brand');
    assert.ok(b3.json.suggestions.some((s) => s.id === sg.display_id && s.patch.subtitle.size === 'l'));
    const ag = await request(t.base, 'POST', '/api/suggestions/' + sg.display_id + '/apply', { body: {}, token: 'gst_khong_hop_le', origin: t.base });
    assert.equal(ag.status, 403);
    const ap = await t.api('POST', '/api/suggestions/' + sg.display_id + '/apply', {});
    assert.equal(ap.status, 200, ap.text);
    const b4 = await t.api('GET', '/api/channels/CH-0001/brand');
    assert.equal(b4.json.channel.version, v0 + 2);
    assert.equal(b4.json.brand.subtitle.size, 'l');
    assert.equal(b4.json.suggestions.length, 0);
    assert.equal((await t.api('POST', '/api/suggestions/' + sg.display_id + '/apply', {})).status, 409, 'áp dụng 2 lần ⇒ xung đột');
    assert.equal((await t.api('GET', '/api/channels/CH-9999/brand')).status, 404);
  } finally { await t.clean(); }
});
