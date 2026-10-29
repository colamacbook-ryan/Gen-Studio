// © 2026 Gen Labs — All rights reserved.
// UI-0 (SPEC-0.2.0-F7 §10.5): thành phần tỉ lệ dùng chung — phần thuần (Node, không DOM): khoá i18n, mô hình bộ chọn, preset theo hợp đồng
// test/fixtures/api-aspects.json, lịch trộn; và luật "không hardcode" (dữ liệu chỉ từ GET /api/aspects).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.join(__dirname, '..');
const STUDIO = path.join(ROOT, 'studio');
const load = (rel) => import(pathToFileURL(path.join(STUDIO, rel)).href);
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const FIX = JSON.parse(read('test/fixtures/api-aspects.json'));

const SPEC_KEYS = ['aspect.label', 'aspect.16x9', 'aspect.9x16', 'aspect.inherit', 'aspect.preset.yt_long', 'aspect.preset.yt_shorts', 'aspect.preset.fb_reels',
  'aspect.preset.tiktok', 'aspect.max_s', 'aspect.unverified', 'aspect.fit.ok', 'aspect.fit.over', 'aspect.safe_overlay', 'aspect.safe.hard', 'aspect.safe.soft',
  'aspect.tutorial_blocked', 'aspect.make_other', 'aspect.cover_frame', 'aspect.lt_off_vertical', 'aspect.mix', 'aspect.mix_sum', 'aspect.err_load'];

test('i18n aspect: đủ khoá hợp đồng §10.5, vi/en cùng bộ khoá, không trùng module gói UI, đã gộp vào VI/EN', async () => {
  const idx = await load('i18n/index.js');
  const m = await load('i18n/aspect.js');
  assert.deepEqual(Object.keys(m.vi).sort(), Object.keys(m.en).sort());
  for (const k of SPEC_KEYS) assert.ok(k in m.vi, k);
  for (const k of Object.keys(m.vi)) assert.ok(k.startsWith('aspect.'), 'khoá UI-0 chỉ trong không gian aspect.*: ' + k);
  for (const [name, mod] of Object.entries(idx.MODULES)) for (const k of Object.keys(mod.vi)) assert.ok(!(k in m.vi), `khoá "${k}" trùng giữa aspect và ${name}`);
  assert.equal(idx.SHARED.aspect, m);
  for (const k of SPEC_KEYS) { assert.equal(idx.VI[k], m.vi[k]); assert.equal(idx.EN[k], m.en[k]); }
  for (const v of [...Object.values(m.vi), ...Object.values(m.en)]) assert.ok(typeof v === 'string' && v.length > 0);
  // lời chặn tutorial = đúng lời §5.2 của render/aspects.js (một nguồn cho MCP và UI; UI bỏ dấu ` quanh lesson)
  const A = require('../render/aspects.js');
  assert.equal(m.vi['aspect.tutorial_blocked'], A.TUTORIAL_BLOCKED.replace(/`/g, ''));
});

test('hàm thuần: tỉ lệ, nhãn, mặc định, preset theo thứ tự hợp đồng, thời lượng', async () => {
  const a = await load('components/aspect.js');
  const { setLang } = await load('i18n.js');
  setLang('vi');
  assert.deepEqual(a.ratioOf('9:16'), [9, 16]); assert.equal(a.ratioOf('x'), null); assert.equal(a.ratioOf(null), null);
  assert.equal(a.aspectRatioCss('9:16'), '9 / 16'); assert.equal(a.aspectRatioCss('lạ'), '16 / 9');
  assert.equal(a.aspectToken('9:16'), '9x16');
  assert.equal(a.aspectLabel('9:16'), '9:16 · Clip ngắn'); assert.equal(a.aspectLabel('1:1'), '1:1', 'tỉ lệ thêm sau bằng dữ liệu vẫn có nhãn');
  assert.ok(a.isVertical('9:16') && !a.isVertical('16:9'));
  assert.deepEqual(a.enabledAspects(FIX).map((x) => x.id), ['16:9', '9:16']);
  assert.equal(a.defaultAspect(FIX), '16:9');
  assert.deepEqual(a.presetsFor(FIX, '9:16').map((p) => [p.id, p.max_s, p.verified]), [['yt_shorts', 180, true], ['fb_reels', null, false], ['tiktok', 1800, false]]);
  assert.deepEqual(a.presetsFor(FIX, '16:9').map((p) => p.id), ['yt_long']);
  assert.equal(a.fmtSeconds(180), '3:00'); assert.equal(a.fmtSeconds(1800), '30:00'); assert.equal(a.fmtSeconds(null), '0:00');
  assert.equal(a.presetLabel('tiktok'), 'TikTok'); assert.equal(a.presetLabel('fb_feed_1x1'), 'fb_feed_1x1');
});

test('pickerModel: theo kênh, tutorial chặn 9:16 kèm lời §5.2, chỉ một tỉ lệ bật ⇒ nhãn tĩnh, giá trị không hợp lệ ⇒ lựa chọn bật đầu tiên', async () => {
  const a = await load('components/aspect.js');
  const { t } = await load('i18n.js');
  const m = a.pickerModel({ aspects: FIX, value: null, inherit: { value: '9:16' } });
  assert.equal(m.static, false);
  assert.deepEqual(m.options.map((o) => o.value), ['', '16:9', '9:16']);
  assert.equal(m.value, '', 'mặc định = Theo kênh (không gửi aspect)');
  assert.equal(m.options[0].label, t('aspect.inherit', { v: '9:16' }));
  const tut = a.pickerModel({ aspects: FIX, value: '9:16', kind: 'tutorial' });
  const v = tut.options.find((o) => o.value === '9:16');
  assert.ok(v.disabled); assert.equal(v.reason, t('aspect.tutorial_blocked'));
  assert.equal(tut.value, '16:9', 'đang chọn lựa chọn bị chặn ⇒ rơi về lựa chọn bật đầu tiên');
  const tutInh = a.pickerModel({ aspects: FIX, value: null, inherit: { value: '9:16' }, kind: 'tutorial' });
  assert.ok(tutInh.options[0].disabled, 'kênh dọc + tutorial: "Theo kênh" cũng bị chặn');
  assert.equal(tutInh.value, '16:9');
  const one = { default: '16:9', aspects: FIX.aspects.map((x) => (x.id === '9:16' ? Object.assign({}, x, { enabled: false }) : x)), presets: FIX.presets };
  assert.equal(a.pickerModel({ aspects: one }).static, true, 'cắt L-MIN (9:16 tắt) ⇒ không control');
  assert.equal(a.pickerModel({ aspects: FIX, value: '4:5' }).value, '16:9');
  assert.equal(a.pickerModel({ aspects: [] }).static, true);
});

test('mixModel: Σn = per_run (1…20), bỏ tỉ lệ n=0, giữ thứ tự tỉ lệ', async () => {
  const a = await load('components/aspect.js');
  assert.deepEqual(a.mixModel({ '9:16': 1, '16:9': 1 }, 2, ['16:9', '9:16']), { mix: [{ aspect: '16:9', n: 1 }, { aspect: '9:16', n: 1 }], sum: 2, per_run: 2, ok: true });
  assert.equal(a.mixModel({ '16:9': 1, '9:16': 0 }, 2, ['16:9', '9:16']).ok, false);
  assert.deepEqual(a.mixModel({ '16:9': 0, '9:16': 3 }, 3, ['16:9', '9:16']).mix, [{ aspect: '9:16', n: 3 }]);
  assert.equal(a.mixModel({ '16:9': 21 }, 21).ok, false, 'per_run tối đa 20 (scheduler)');
  assert.equal(a.mixModel({ '16:9': -2, '9:16': 'x' }, 0).ok, false);
});

test('không hardcode: aspect.js đọc GET /api/aspects (cache phiên), không chứa mã preset/kích thước; CSS nối trong index.html', () => {
  const src = read('studio/components/aspect.js').replace(/\/\/.*$/gm, '');   // bỏ chú thích
  assert.match(src, /get\('\/api\/aspects'\)/);
  for (const bad of ['yt_shorts', 'fb_reels', 'tiktok', '1080', '1920', "'9:16'", '"9:16"']) assert.ok(!src.includes(bad), 'aspect.js không hardcode ' + bad);
  assert.ok(read('studio/index.html').includes('./css/aspect.css'));
  assert.ok(fs.existsSync(path.join(STUDIO, 'css', 'aspect.css')));
  // hợp đồng export cho các gói UI khác (UI-B dùng)
  return load('components/aspect.js').then((a) => {
    for (const f of ['loadAspects', 'aspectPicker', 'aspectBadge', 'aspectRatioCss', 'safeOverlay', 'fitChips', 'aspectFrame', 'aspectThumb', 'presetList', 'aspectGlyph']) assert.equal(typeof a[f], 'function', f);
  });
});
