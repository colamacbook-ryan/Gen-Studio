// © 2026 Gen Labs — All rights reserved.
// F7 gói A3 (SPEC-0.2.0-F7 §5.1, §6.1, §10.3): ảnh bìa DỌC 9:16 — phần THUẦN, chạy độc lập (không cần A1/A2, không Chromium):
//   mẫu dọc là dữ liệu (aspect/canvas), 4 mẫu 16:9 cũ KHÔNG bị ghi khoá mới (golden W2-0), RULES theo tỉ lệ (T1 720×1280 + 1080×1920 · T3 ≤ 3 dòng · T8 ≥ 110 px · T9 lề 60 + phần giữa lưới TikTok 3:4),
//   bộ kiểm T9 lúc nạp mẫu có ca âm, evaluateVariant theo tỉ lệ (số đo giả: mỗi ca âm trượt đúng mục T), mẫu sai tỉ lệ ⇒ thumbnail_aspect, G-THUMB đo trên PNG/JPEG tổng hợp 1080×1920 (ffmpeg).
// Dựng Chromium 1080×1920 thật ở test/g-thumb-vertical-render.test.js.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const T = require('../render/thumb.js');
const G = require('../media/gates/thumb.js');
const A = require('../render/aspects.js');
const H = require('./g-thumb-helpers');

const ROOT = path.join(__dirname, '..');
const clone = (o) => JSON.parse(JSON.stringify(o));
const rules = (v) => [...new Set(v.fails.map((f) => f.rule))];
const raw = () => JSON.parse(fs.readFileSync(path.join(ROOT, 'render/thumbs/templates.json'), 'utf8')).templates;
const VERT = ['v-host-top', 'v-big-visual'];

// ---------------------------------------------------------------- dữ liệu mẫu
test('mẫu dọc là DỮ LIỆU: v-host-top + v-big-visual (aspect 9:16, canvas 1080×1920); 4 mẫu 16:9 cũ KHÔNG ghi khoá aspect/canvas (golden W2-0)', () => {
  const t = raw();
  assert.deepEqual(t.map((x) => x.id), ['host-shock-left', 'host-shock-right', 'duo-versus', 'big-visual', ...VERT]);
  for (const x of t.slice(0, 4)) { assert.equal(x.aspect, undefined, x.id); assert.equal(x.canvas, undefined, x.id); assert.equal(x.ui_scale, undefined, x.id); }
  for (const x of t.slice(4)) { assert.equal(x.aspect, '9:16'); assert.deepEqual(x.canvas, A.get('9:16').size); }
  // suy ra lúc đọc
  for (const x of T.templates()) { assert.equal(T.aspectOf(x), '16:9'); assert.deepEqual(T.canvasOf(x), [1280, 720]); }
  assert.deepEqual(T.templates().map((x) => x.id), ['host-shock-left', 'host-shock-right', 'duo-versus', 'big-visual'], 'templates() không đối số = 16:9 (hợp đồng cũ)');
  assert.deepEqual(T.templatesOf('9:16').map((x) => x.id), VERT);
  assert.equal(T.templatesOf('*').length, 6);
  assert.deepEqual(T.templatesOf('1:1'), []);
});

test('thumbSupported(9:16) = true nhờ mẫu dọc (đóng L-MID); gỡ mẫu dọc ⇒ false', () => {
  assert.equal(A.thumbSupported('9:16'), true);
  assert.equal(A.thumbSupported('16:9'), true);
  assert.equal(A.thumbSupported('9:16', raw().filter((x) => !x.aspect)), false);
  assert.deepEqual(A.catalog({ templatesOf: (id) => T.templatesOf(id).map((x) => x.id) }).aspects.find((a) => a.id === '9:16').thumbnail_templates, VERT);
});

test('RULES theo tỉ lệ: 16:9 = RULES cũ; 9:16 ghi đè đúng T1/T3/T8/T9, còn lại giữ nguyên; MỘT nguồn kích thước + lưới cắt (CNS-337)', () => {
  assert.equal(T.rulesFor('16:9'), T.RULES); assert.equal(T.rulesFor(undefined), T.RULES);
  assert.deepEqual(T.RULES.sizes, [[1280, 720], [1920, 1080]]);
  assert.deepEqual(T.RULES.sizes, A.thumbSizes('16:9'), 'RULES.sizes đọc aspects.thumbSizes');
  const R = T.rulesFor('9:16');
  assert.deepEqual(R.sizes, [[720, 1280], [1080, 1920]]); assert.deepEqual(R.sizes, A.thumbSizes('9:16'));
  assert.equal(R.lines_max, 3); assert.equal(R.font_px_min, 110); assert.equal(R.margin, 60);
  assert.deepEqual([R.W, R.H], [1080, 1920]);
  assert.deepEqual(R.crop, { x: 0, y: 240, w: 1080, h: 1440 }, 'lưới TikTok 3:4 ⇒ 1080×1440, y 240→1680 (từ presets.tiktok.grid_crop)');
  assert.deepEqual(R.no_go, [], 'không có vùng cấm dấu thời lượng ở dọc');
  for (const k of ['words_max', 'chars_max', 'kicker_words_max', 'kicker_chars_max', 'face_h_ratio_min', 'sidekick_head_max', 'contrast_min', 'max_bytes', 'brand_w_max_ratio', 'diff_min', 'variants_min', 'variants_max']) assert.equal(R[k], T.RULES[k], k + ' giữ nguyên');
  assert.throws(() => T.rulesFor('1:1'), /chưa có quy cách/);
  assert.ok(!('crop' in raw()[4].safe), 'tỉ lệ cắt lưới KHÔNG nhắc lại trong mẫu');
});

// ---------------------------------------------------------------- bộ kiểm T9 lúc nạp mẫu
test('mẫu dọc qua checkTemplate; mẫu 16:9 cũ vẫn qua T9 cũ (lề 48 + vùng cấm 260×110)', () => {
  for (const t of T.templatesOf('*')) assert.deepEqual(T.checkTemplate(t), [], t.id);
  for (const t of T.templatesOf('9:16')) {
    const B = t.boxes, R = T.rulesFor('9:16'), s = T.safeBox(60, R);
    assert.deepEqual(s, { x0: 60, y0: 300, x1: 1020, y1: 1620 });
    for (const k of Object.keys(B)) { if (k === 'brand' && false) continue; const r = B[k]; if (r.w) assert.ok(r.x >= s.x0 && r.y >= s.y0 && r.x + r.w <= s.x1 && r.y + r.h <= s.y1, `${t.id}.${k} trong vùng giữa lưới`); }
    assert.ok(B.headline.font_px_min >= 110 && B.headline.lines_max <= 3 && B.brand.w <= 0.12 * 1080 && B.face.head_min_h >= Math.round(0.22 * 1920 - 1), t.id);
    assert.ok(t.ui_scale >= 1.4, 'chữ phụ/logo phóng cho điện thoại');
  }
  const old = clone(T.template('host-shock-left')); old.safe.no_go = [];
  assert.match(T.checkTemplate(old).join(' | '), /thiếu vùng cấm góc phải dưới 260×110/, 'mẫu 16:9 vẫn bắt buộc vùng cấm');
});

test('bộ kiểm T9 mẫu dọc: ca âm — lề 60, vùng giữa lưới 3:4, bleed trên/dưới vô hiệu, T3/T5/T8/T10, canvas/aspect lạ', () => {
  const base = T.template('v-host-top');
  const bad = (mut) => { const t = clone(base); mut(t); return T.checkTemplate(t).join(' | '); };
  assert.equal(bad(() => {}), '');
  assert.match(bad((t) => { t.safe.margin = 48; }), /lề 48 < 60/);
  assert.match(bad((t) => { t.boxes.headline.x = 40; t.boxes.headline.w = 980; }), /headline: ra ngoài vùng giữa lưới 240→1680 thụt lề 60/);
  assert.match(bad((t) => { t.boxes.kicker.y = 250; }), /kicker: ra ngoài vùng giữa lưới/, 'cao hơn y 240 + lề ⇒ TikTok cắt');
  assert.match(bad((t) => { t.boxes.headline.y = 1200; t.boxes.headline.h = 480; }), /headline: ra ngoài vùng giữa lưới/, 'thấp quá y 1680 − lề');
  assert.match(bad((t) => { t.boxes.face.bleed = ['bottom']; }), /bleed trên\/dưới vô hiệu ở khung 9:16/);
  assert.equal(bad((t) => { t.boxes.face.x = 0; t.boxes.face.w = 660; t.boxes.face.bleed = ['left']; }), '', 'bleed trái vẫn được (lưới chỉ cắt trên/dưới)');
  assert.match(bad((t) => { t.boxes.headline.font_px_min = 100; }), /font_px_min 100 < 110 \(T8\)/);
  assert.match(bad((t) => { t.boxes.headline.lines_max = 4; }), /lines_max > 3 \(T3\)/);
  assert.equal(bad((t) => { t.boxes.headline.lines_max = 3; }), '', 'dọc cho 3 dòng');
  assert.match(bad((t) => { t.boxes.brand.w = 140; }), /brand: rộng 140 > 129 px \(T10\)/);
  assert.match(bad((t) => { t.boxes.face.head_min_h = 300; }), /head_min_h < 422 \(T5\)/);
  assert.match(bad((t) => { t.boxes.visual = Object.assign({}, t.boxes.face); }), /giao hộp/);
  assert.match(bad((t) => { t.canvas = [1280, 720]; }), /canvas \[1280,720\] không khớp tỉ lệ 9:16 \(1080×1920\)/);
  assert.match(bad((t) => { t.aspect = '1:1'; }), /tỉ lệ "1:1" chưa có quy cách/);
  assert.match(bad((t) => { t.boxes.face.view = [1, 2, 3]; }), /view phải là/);
  assert.match(bad((t) => { t.ui_scale = 3; }), /ui_scale/);
  assert.match(bad((t) => { t.boxes.brand.corner = 'xx'; }), /corner không hợp lệ/);
});

test('cornerRect theo tỉ lệ: 16:9 như cũ; 9:16 neo vào vùng giữa lưới', () => {
  assert.deepEqual(T.cornerRect('tl', { w: 150, h: 56 }), { x: 48, y: 48, w: 150, h: 56 });
  assert.deepEqual(T.cornerRect('br', { w: 150, h: 56 }), { x: 1082, y: 616, w: 150, h: 56 });
  const R = T.rulesFor('9:16');
  assert.deepEqual(T.cornerRect('tl', { w: 120, h: 72 }, R), { x: 60, y: 300, w: 120, h: 72 });
  assert.deepEqual(T.cornerRect('br', { w: 120, h: 72 }, R), { x: 900, y: 1548, w: 120, h: 72 });
});

// ---------------------------------------------------------------- kiểm khô + checkAspect
const plan = H.fixturePlan();
const V = (o) => Object.assign({ template: 'v-host-top', headline: 'AI bịa chuyện thế nào?', highlight: 'bịa', kicker: 'SỰ THẬT', face: { cast: 'CM-0001', mood: 'shock' }, visual: { beat: 1 } }, o || {});
const specsOf = (variants, ctx) => T.resolveThumbs({ variants }, plan, Object.assign({ beatOrder: H.BEAT_ORDER }, ctx));
const ENV = { beatCount: 3, castOk: () => true };
test('validateThumbnail mẫu dọc: T3 theo từ/ký tự như cũ, ước dòng theo hộp dọc (≤ 3 dòng)', () => {
  const val = (variants) => T.validateThumbnail({ variants }, ENV).map((e) => e.path + ': ' + e.text).join('\n');
  assert.equal(val([V(), V({ template: 'v-big-visual', headline: 'Đừng tin AI 100%', highlight: 'tin' })]), '');
  assert.match(val([V({ headline: 'a b c d e f g' }), V({ template: 'v-big-visual' })]), /7 từ > 6 từ/);
  assert.match(val([V({ headline: 'abcdefghijklmnop abcdefghijklmnop' }), V({ template: 'v-big-visual' })]), /33 ký tự > 32/);
  // 32 ký tự: tràn 3 dòng ở 120 px trong hộp 960 px? (≈ 16 ký tự/dòng) ⇒ vừa; ở hộp v-big-visual (2 dòng) cũng vừa — nên ca dài nhất vẫn hợp lệ
  assert.equal(val([V({ headline: 'aaaaaaaaaaaaaaa bbbbbbbbbbbbbbbb', highlight: null }), V({ template: 'v-big-visual' })]), '');
  assert.equal(T.estimateLines('aaaaaaaaaa bbbbbbbbbb cccccccccc', 960, 120), 3);
  assert.match(val([V({ sidekick: { cast: 'CM-0002', mood: 'think' } }), V({ template: 'v-big-visual' })]), /variants\[0\].sidekick: Mẫu v-host-top không có chỗ cho sidekick/);
  assert.equal(val([V(), V({ template: 'v-big-visual', sidekick: { cast: 'CM-0002', mood: 'think' } })]), '');
});

test('thumbnail_aspect: mẫu khác tỉ lệ của bài bị báo, đúng tỉ lệ thì sạch (SPEC §5.1)', () => {
  const th = (a, b) => ({ variants: [V({ template: a }), V({ template: b })] });
  assert.deepEqual(T.checkAspect(th('v-host-top', 'v-big-visual'), '9:16'), []);
  assert.deepEqual(T.checkAspect(th('host-shock-left', 'big-visual'), '16:9'), []);
  assert.deepEqual(T.checkAspect(th('host-shock-left', 'big-visual'), undefined), [], 'không có tỉ lệ ⇒ 16:9');
  const e = T.checkAspect(th('host-shock-left', 'v-big-visual'), '9:16');
  assert.equal(e.length, 1); assert.equal(e[0].code, 'thumbnail_aspect'); assert.equal(e[0].path, 'thumbnail.variants[0].template');
  assert.match(e[0].text, /host-shock-left.*16:9.*9:16.*v-host-top, v-big-visual/);
  assert.equal(T.checkAspect(th('v-host-top', 'v-big-visual'), '16:9').length, 2);
  assert.deepEqual(T.checkAspect(th('khong-co', 'v-big-visual'), '9:16'), [], 'mẫu lạ: validateThumbnail báo, không trùng lỗi');
  assert.deepEqual(T.checkAspect(null, '9:16'), []);
});

test('resolveThumbs mẫu dọc: góc logo neo vào vùng giữa lưới (không phải góc canvas); spec mang template có canvas; plan 16:9 không đổi', () => {
  const [a, b] = specsOf([V(), V({ template: 'v-big-visual', headline: 'Đừng tin AI 100%', highlight: 'tin' })]);
  assert.equal(a.template.id, 'v-host-top'); assert.deepEqual(a.template.canvas, [1080, 1920]);
  assert.deepEqual(a.brand.box, { corner: 'tl', x: 60, y: 300, w: 120, h: 72 });
  assert.equal(a.brand.corner, 'tl'); assert.equal(b.brand.corner, 'tl');
  // brand.thumb.corner = 'tr' trùng nhãn phụ của mẫu ⇒ giữ góc của mẫu (luật cũ: góc không còn chỗ thì quay về góc mẫu)
  const planTr = Object.assign({}, plan, { style: Object.assign({}, plan.style, { brand: { tokens: {}, thumb: { corner: 'tr' } } }) });
  const [tr] = T.resolveThumbs({ variants: [V(), V({ template: 'v-big-visual' })] }, planTr, { beatOrder: H.BEAT_ORDER });
  assert.equal(tr.brand.corner, 'tl');
  // góc dưới-trái: nằm trong vùng giữa (y 1548), không đè mặt/chữ của v-big-visual? — nếu đè thì cũng về góc mẫu
  const planBl = Object.assign({}, plan, { style: Object.assign({}, plan.style, { brand: { tokens: {}, thumb: { corner: 'bl' } } }) });
  const [bl] = T.resolveThumbs({ variants: [V(), V({ template: 'v-big-visual' })] }, planBl, { beatOrder: H.BEAT_ORDER });
  assert.ok(['tl', 'bl'].includes(bl.brand.corner));
  if (bl.brand.corner === 'bl') assert.deepEqual([bl.brand.box.x, bl.brand.box.y], [60, 1548]);
  // 16:9: hộp brand đúng như trước
  const [o] = specsOf([{ template: 'host-shock-left', headline: 'AI bịa chuyện', face: { cast: 'CM-0001', mood: 'shock' }, visual: { beat: 1 } }]);
  assert.deepEqual([o.brand.box.x, o.brand.box.y, o.brand.box.w, o.brand.box.h], [48, 48, 150, 56]);
});

// ---------------------------------------------------------------- evaluateVariant theo tỉ lệ (số đo giả)
function good(spec) {   // số đo DOM + pixel "đạt" cho một spec dọc
  const b = spec.template.boxes, vert = T.aspectOf(spec.template) === '9:16', R = T.rulesOf(spec.template);
  const dom = { headline: { x: b.headline.x, y: b.headline.y + 4, w: b.headline.w - 40, h: b.headline.h - 20, font_px: vert ? 150 : 120, lines: 2, overflow: false },
    kicker: spec.kicker ? { x: b.kicker.x + 4, y: b.kicker.y + 4, w: 260, h: 66, overflow: false } : null,
    face: { kind: 'cast', x: b.face.x, y: b.face.y, w: b.face.w, h: b.face.h, head_h: Math.ceil(0.25 * R.H), alpha: true },
    sidekick: spec.sidekick ? { x: b.sidekick.x, y: b.sidekick.y, w: b.sidekick.w, h: b.sidekick.h, head_h: 100 } : null,
    visual: { x: b.visual.x + 6, y: b.visual.y + 6, w: b.visual.w - 12, h: b.visual.h - 12 },
    brand: { x: spec.brand.box.x, y: spec.brand.box.y + 2, w: b.brand.w, h: b.brand.h - 6, corner: spec.brand.corner } };
  const px = { dim1280: R.sizes[0], dim1920: R.sizes[1], magic1280: true, magic1920: true, bytes1280: 300000, bytes1920: 500000, contrast: 9, diffs: {} };
  return { dom, px };
}
const one = (mut, v) => {
  const [s] = specsOf([v || V()]); const g = good(s); mut(s, g.dom, g.px);
  return T.measure([s], [g.dom], [g.px]).variants[0];
};

test('G-THUMB dọc: số đo "đạt" ⇒ pass cả hai mẫu; face_h_ratio chia cho CAO 1920', () => {
  for (const v of [V(), V({ template: 'v-big-visual', headline: 'Đừng tin AI 100%', highlight: 'tin', sidekick: { cast: 'CM-0002', mood: 'panic' } })]) {
    const ok = one(() => {}, v); assert.equal(ok.pass, true, JSON.stringify(ok.fails)); assert.deepEqual(ok.fails, []);
    assert.equal(ok.face_h_ratio, 0.25); assert.equal(ok.font_px, 150);
    assert.equal(ok.score, T.score(9, 150, Math.ceil(0.25 * 1920) / 1920));
  }
});

test('G-THUMB dọc — T1: cỡ 720×1280 và 1080×1920 (cạnh dài 1280/1920); cỡ 16:9 trên mẫu dọc ⇒ T1', () => {
  assert.deepEqual(rules(one((s, d, p) => { p.dim1280 = [1280, 720]; p.dim1920 = [1920, 1080]; })), ['T1']);
  const r = one((s, d, p) => { p.dim1920 = [1080, 1919]; });
  assert.deepEqual(rules(r), ['T1']); assert.match(r.fails[0].text, /Ảnh 1080×1920 sai kích thước \(1080×1919\)/);
  assert.deepEqual(rules(one((s, d, p) => { p.dim1280 = null; })), ['T1']);
  assert.deepEqual(rules(one((s, d, p) => { p.dim1280 = [720, 1280]; })), []);
  // ngược lại: mẫu 16:9 đòi 1280×720 + 1920×1080, không nhận cỡ dọc
  const [o] = specsOf([{ template: 'host-shock-left', headline: 'AI bịa', face: { cast: 'CM-0001', mood: 'shock' }, visual: { beat: 1 } }]);
  const g = good(o); assert.equal(T.measure([o], [g.dom], [g.px]).variants[0].pass, true, 'mẫu cũ vẫn qua');
  g.px.dim1280 = [720, 1280]; g.px.dim1920 = [1080, 1920];
  assert.deepEqual(rules(T.measure([o], [g.dom], [g.px]).variants[0]), ['T1']);
});

test('G-THUMB dọc — T3: 3 dòng được (v-host-top), 4 dòng trượt; v-big-visual chỉ 2 dòng; tràn hộp trượt', () => {
  assert.equal(one((s, d) => { d.headline.lines = 3; }).pass, true);
  const r4 = one((s, d) => { d.headline.lines = 4; }); assert.deepEqual(rules(r4), ['T3']); assert.match(r4.fails[0].text, /4 dòng > 3/);
  const v2 = V({ template: 'v-big-visual' });
  assert.equal(one((s, d) => { d.headline.lines = 2; }, v2).pass, true);
  assert.match(one((s, d) => { d.headline.lines = 3; }, v2).fails[0].text, /3 dòng > 2/);
  assert.deepEqual(rules(one((s, d) => { d.headline.overflow = true; })), ['T3']);
});

test('G-THUMB dọc — T8: cỡ chữ ≥ 110 px ở bản 1080×1920 (109 trượt, 110 đạt)', () => {
  assert.equal(one((s, d) => { d.headline.font_px = 110; }).pass, true);
  const r = one((s, d) => { d.headline.font_px = 109; }); assert.deepEqual(rules(r), ['T8']); assert.match(r.fails[0].text, /109 px < 110 px/);
});

test('G-THUMB dọc — T9: lề 60 + phần giữa lưới 3:4 (y 240→1680); không có vùng cấm dấu thời lượng; bleed trái/phải của mặt được', () => {
  const t9 = (mut) => one(mut).fails.find((f) => f.rule === 'T9') || null;
  assert.equal(t9(() => {}), null);
  const top = t9((s, d) => { d.headline.y = 250; }); assert.ok(top); assert.match(top.text, /headline \(ngoài phần giữa lưới 240→1680 \(TikTok cắt\)\)/);   // 250 < 240 + 60
  assert.ok(t9((s, d) => { d.headline.y = 1400; d.headline.h = 300; }), 'chạm đáy vùng giữa (1620)');
  const side = t9((s, d) => { d.brand.x = 40; }); assert.match(side.text, /brand \(ngoài lề 60 px\)/);
  assert.equal(t9((s, d) => { d.headline.y = 1620 - d.headline.h; }), null, 'sát đáy vùng an toàn (y 1620) vẫn đạt');
  assert.ok(t9((s, d) => { d.face.y = 200; d.face.h = 900; }), 'mặt chính kéo ra khỏi vùng giữa lưới');
  assert.ok(t9((s, d) => { d.face.y = 1100; d.face.h = 600; }), 'bleed đáy không được miễn ở dọc');
  assert.equal(t9((s, d) => { d.face.x = -20; s.template = Object.assign({}, s.template, { boxes: Object.assign({}, s.template.boxes, { face: Object.assign({}, s.template.boxes.face, { bleed: ['left'] }) }) }); }), null, 'bleed trái được miễn');
  // dưới-phải 260×110 của YouTube dài KHÔNG áp ở dọc
  assert.equal(t9((s, d) => { d.visual = { x: 800, y: 1500, w: 200, h: 100 }; }), null);
  assert.equal(one((s, d) => { d.visual = { x: 800, y: 1500, w: 200, h: 100 }; }).pass, true);
});

test('G-THUMB dọc — T5/T10/T11 giữ nguyên số nhưng theo khung 1080×1920', () => {
  const r5 = one((s, d) => { d.face.head_h = 400; });   // 400/1920 = 20,8 % < 22 %
  assert.deepEqual(rules(r5), ['T5']); assert.match(r5.fails[0].text, /20,8|20\.8 %/);
  const rh = one((s, d) => { d.face.head_h = 425; });   // ≥ 22 % của 1920 (422,4) nhưng < head_min_h 430 của mẫu
  assert.deepEqual(rules(rh), ['T5']); assert.match(rh.fails[0].text, /425 px < 430 px của mẫu/);
  assert.equal(one((s, d) => { d.face.head_h = 430; }).pass, true);
  const r10 = one((s, d) => { d.brand.w = 140; }); assert.ok(rules(r10).includes('T10')); assert.match(r10.fails.find((f) => f.rule === 'T10').text, /140 px > 129 px/);
  assert.deepEqual(rules(one((s, d, p) => { p.contrast = 4.4; })), ['T7']);
  assert.deepEqual(rules(one((s, d, p) => { p.bytes1920 = 2 * 1024 * 1024; })), ['T2']);
  // T11
  const [s0, s1] = specsOf([V(), V({ template: 'v-big-visual', headline: 'Đừng tin AI 100%', highlight: 'tin' })]);
  const g0 = good(s0), g1 = good(s1); g1.px.diffs = { 0: 0.05 };
  const m = T.measure([s0, s1], [g0.dom, g1.dom], [g0.px, g1.px]);
  assert.deepEqual(m.passed, [0]); assert.deepEqual(rules(m.variants[1]), ['T11']);
});

// ---------------------------------------------------------------- G-THUMB trên ảnh tổng hợp 1080×1920 (ffmpeg thật, không Chromium)
const SKIP_FF = H.FFMPEG ? false : 'không có ffmpeg';
function synth(dir, { w = 1080, h = 1920, textRgb = [255, 255, 255], big = true } = {}) {
  const bg = [29, 42, 110, 255], c1 = H.canvas(w, h, bg), c2 = H.canvas(w, h, bg);
  const tx = (c) => H.rectFill(c, 60, 1124, 800, big ? 320 : 6, [...textRgb, 255]);
  tx(c1);
  const f = { png: path.join(dir, 't.png'), png_notext: path.join(dir, 't.notext.png') };
  fs.writeFileSync(f.png, H.encodePng(c1, { opaque: true })); fs.writeFileSync(f.png_notext, H.encodePng(c2, { opaque: true }));
  return f;
}
const ffjpg = (src, out, w, h) => { const r = spawnSync(H.FFMPEG, ['-v', 'error', '-y', '-i', src, '-vf', `scale=${w}:${h}:flags=lanczos`, '-q:v', '3', out]); assert.equal(r.status, 0, String(r.stderr)); return out; };

test('gateThumb đo ảnh tổng hợp 1080×1920: pass với JPEG 720×1280 + 1080×1920; sai cỡ ⇒ T1; chữ trùng màu nền ⇒ T7; decode theo canvas của mẫu', { skip: SKIP_FF }, () => {
  const dir = H.mkdtemp('gs-thumb-vert-');
  try {
    const [spec] = specsOf([V()]); const g = good(spec);
    const files = synth(dir);
    const jpgs = { jpg1280: ffjpg(files.png, path.join(dir, 'a.1280.jpg'), 720, 1280), jpg1920: ffjpg(files.png, path.join(dir, 'a.1920.jpg'), 1080, 1920) };
    assert.deepEqual(G.jpegSize(fs.readFileSync(jpgs.jpg1280)), [720, 1280]); assert.deepEqual(G.jpegSize(fs.readFileSync(jpgs.jpg1920)), [1080, 1920]);
    const variant = (extra) => Object.assign({ index: 0, spec, measures: g.dom }, files, jpgs, extra);
    const ok = G.gateThumb({ variants: [variant()], ffmpegPath: H.FFMPEG });
    assert.equal(ok.result, 'pass', JSON.stringify(ok.measure.variants.map((v) => v.fails)));
    assert.ok(ok.measure.variants[0].contrast > 4.5 && ok.measure.variants[0].face_h_ratio >= 0.22, JSON.stringify(ok.measure.variants[0]));
    assert.match(ok.measure.text_human, /1 phương án đạt · chữ 150 px/);
    // sai cỡ: JPEG 1280×720 / 1920×1080 cho mẫu dọc
    const wrong = { jpg1280: ffjpg(files.png, path.join(dir, 'w.1280.jpg'), 1280, 720), jpg1920: ffjpg(files.png, path.join(dir, 'w.1920.jpg'), 1920, 1080) };
    const bad1 = G.gateThumb({ variants: [variant(wrong)], ffmpegPath: H.FFMPEG });
    assert.equal(bad1.result, 'fail'); assert.deepEqual(rules(bad1.measure.variants[0]), ['T1']);
    // T7: chữ gần màu nền (tương phản thấp)
    const files2 = synth(dir, { textRgb: [40, 52, 118] });
    const bad2 = G.gateThumb({ variants: [variant(files2)], ffmpegPath: H.FFMPEG });
    assert.equal(bad2.result, 'fail'); assert.deepEqual(rules(bad2.measure.variants[0]), ['T7'], JSON.stringify(bad2.measure.variants[0].fails));
    // không có chữ (hai ảnh y hệt) ⇒ không đo được tương phản ⇒ T7
    const files3 = synth(dir, { big: false, textRgb: [29, 42, 110] });
    assert.deepEqual(rules(G.gateThumb({ variants: [variant(files3)], ffmpegPath: H.FFMPEG }).measure.variants[0]), ['T7']);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('gateThumb: contrastOf/diffRatio nhận canvas; mặc định vẫn 1280×720 (test cũ); T11 bỏ qua cặp khác tỉ lệ', { skip: SKIP_FF }, () => {
  const a = Buffer.alloc(4 * 4 * 3, 0), b = Buffer.alloc(4 * 4 * 3, 0); b[0] = 200;
  assert.equal(G.diffRatio(a, b, undefined, [4, 4]), 1 / 16);
  assert.equal(G.contrastOf(a, a, undefined, [4, 4]).contrast, null);
  assert.ok(G.contrastOf(b, a, undefined, [4, 4]).contrast > 1);
  const dir = H.mkdtemp('gs-thumb-vert-');
  try {
    const f = synth(dir);
    assert.equal(G.decodeRgb(f.png, H.FFMPEG, [1080, 1920]).length, 1080 * 1920 * 3);
    assert.equal(G.decodeRgb(f.png, H.FFMPEG).length, 1280 * 720 * 3, 'mặc định 16:9');
    // hai phương án: 16:9 + 9:16 trong cùng một lời gọi không được nổ vì so cặp khác cỡ
    const [sv] = specsOf([V()]), [sh] = specsOf([{ template: 'host-shock-left', headline: 'AI bịa', face: { cast: 'CM-0001', mood: 'shock' }, visual: { beat: 1 } }]);
    sh.index = 1;
    const gv = good(sv), gh = good(sh);
    const png16 = path.join(dir, 'h.png'); fs.writeFileSync(png16, H.encodePng(H.canvas(1920, 1080, [29, 42, 110, 255]), { opaque: true }));
    const mk = (s, g, files, j1, j2) => ({ index: s.index, spec: s, measures: g.dom, png: files.png, png_notext: files.png_notext, jpg1280: j1, jpg1920: j2 });
    const vv = mk(sv, gv, f, ffjpg(f.png, path.join(dir, 'v1.jpg'), 720, 1280), ffjpg(f.png, path.join(dir, 'v2.jpg'), 1080, 1920));
    const hh = mk(sh, gh, { png: png16, png_notext: png16 }, ffjpg(png16, path.join(dir, 'h1.jpg'), 1280, 720), ffjpg(png16, path.join(dir, 'h2.jpg'), 1920, 1080));
    const r = G.gateThumb({ variants: [vv, hh], ffmpegPath: H.FFMPEG });
    assert.notEqual(r.result, 'unknown', r.measure.text_human);
    assert.equal(r.measure.variants.length, 2);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('capabilities ảnh bìa (MCP): templates giữ 4 mẫu 16:9 (hợp đồng cũ), mẫu dọc ở templates_by_aspect, rules.by_aspect có quy cách dọc', async () => {
  const { templateInfo } = require('../server/mcp-tools/thumb.js');
  const auth = require('../server/auth.js');
  const { createMcp } = require('../server/mcp.js');
  const { tmpDb, basics } = require('./a-helpers');
  const t = tmpDb();
  try {
    const b = basics(t.write, t.db);
    const mcp = createMcp({ db: t.db, write: t.write, config: { version: 't', dataDir: t.dir, ffmpegPath: 'ffmpeg', chromiumPath: null } });
    const c = auth.verifyAgentToken(t.db, t.write(b.o, 'agent.create', { name: 'AV', scopes: ['read', 'compose'] }).token);
    const out = (await mcp.handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_capabilities', arguments: { channel: b.ch.display_id } } }, c)).result.structuredContent.thumbnail;
    assert.deepEqual(out.templates.map((x) => x.id), ['host-shock-left', 'host-shock-right', 'duo-versus', 'big-visual']);
    assert.ok(out.templates.every((x) => x.aspect === '16:9' && x.canvas[0] === 1280));
    assert.deepEqual(out.templates_by_aspect['9:16'].map((x) => x.id), VERT);
    assert.deepEqual(out.templates_by_aspect['9:16'][0].canvas, [1080, 1920]);
    assert.deepEqual(out.rules.by_aspect['9:16'].sizes, [[720, 1280], [1080, 1920]]);
    assert.equal(out.rules.by_aspect['9:16'].lines_max, 3);
    assert.equal(templateInfo(T.template('v-big-visual')).headline.lines_max, 2);
  } finally { t.clean(); }
});
