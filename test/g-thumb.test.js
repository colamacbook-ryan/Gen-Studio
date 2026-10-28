// © 2026 Gen Labs — All rights reserved.
// Gói T (SPEC-0.2.0 §5.12): quy cách T1–T11 (mẫu + bộ kiểm T9 lúc nạp, đếm từ tiếng Việt, kiểm khô, ca âm F3-2, đo tương phản F3-3, score), resolveThumbs, cổng G-THUMB không đo được ⇒ unknown,
// và phần máy chủ: lessonExt + luật policy.thumbnail_required, channelDefaults (CNS-123), op thumbnail.pick (ô ✗ §10), tool propose_thumbnail_text. Dựng hình thật ở test/g-thumb-render.test.js.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const T = require('../render/thumb.js');
const G = require('../media/gates/thumb.js');
const state = require('../server/state.js');
const auth = require('../server/auth.js');
const { createMcp } = require('../server/mcp.js');
const { PlanError } = require('../render/engine/plan-error');
const { tmpDb, basics, lessonBody, owner, agent } = require('./a-helpers');
const H = require('./g-thumb-helpers');

const clone = (o) => JSON.parse(JSON.stringify(o));
const rules = (v) => [...new Set(v.fails.map((f) => f.rule))];
const code = (c) => (e) => e.name === 'WriteError' && e.code === c;
const ROOT = path.join(__dirname, '..');

// ---------------------------------------------------------------- mẫu (dữ liệu) + T9 lúc nạp
test('mẫu ảnh bìa: 4 mẫu là DỮ LIỆU, đều qua bộ kiểm T9 lúc nạp (CNS-101); chỉ hộp mặt được bleed', () => {
  assert.deepEqual(T.templates().map((t) => t.id), ['host-shock-left', 'host-shock-right', 'duo-versus', 'big-visual']);
  for (const t of T.templates()) {
    assert.deepEqual(T.checkTemplate(t), [], t.id);
    assert.ok(t.boxes.headline.font_px_min >= 100 && t.boxes.headline.lines_max <= 2, t.id + ': T3/T8');
    assert.ok(t.boxes.brand.w <= 0.12 * 1280, t.id + ': T10');
    for (const k of Object.keys(t.boxes)) if (k !== 'face') assert.equal(t.boxes[k].bleed, undefined, `${t.id}.${k} không được khai bleed`);
  }
  assert.ok(fs.readFileSync(path.join(ROOT, 'render/thumbs/templates.json'), 'utf8').includes('"host-shock-left"'), 'mẫu nằm trong JSON, không trong mã');
});

test('bộ kiểm T9 của mẫu: lề 48, vùng cấm dấu thời lượng 260×110, bleed chỉ cho mặt, hộp chữ không giao mặt, logo ≤ 12 %', () => {
  const base = T.template('host-shock-left');
  const bad = (mut) => { const t = clone(base); mut(t); return T.checkTemplate(t).join(' | '); };
  assert.match(bad((t) => { t.boxes.headline.x = 20; }), /headline: ra ngoài lề 48/);
  assert.match(bad((t) => { t.boxes.kicker.y = 10; }), /kicker: ra ngoài lề/);
  assert.match(bad((t) => { t.boxes.visual = { x: 1000, y: 600, w: 200, h: 100 }; }), /visual: chạm vùng cấm dấu thời lượng/);
  assert.match(bad((t) => { t.boxes.face = { x: 700, y: 300, w: 580, h: 420, bleed: ['bottom', 'right'], head_min_h: 160 }; }), /face: chạm vùng cấm/, 'bleed không miễn vùng cấm');
  assert.match(bad((t) => { t.boxes.headline.bleed = ['left']; }), /chỉ hộp mặt được khai bleed/);
  assert.match(bad((t) => { t.boxes.headline.x = 400; t.boxes.headline.w = 800; }), /ra ngoài lề|giao hộp face/);
  assert.match(bad((t) => { t.boxes.headline = Object.assign({}, t.boxes.headline, { x: 400, w: 500 }); }), /giao hộp face/);
  assert.match(bad((t) => { t.boxes.brand.w = 200; }), /logo|brand: rộng 200/i);
  assert.match(bad((t) => { t.boxes.headline.font_px_min = 90; }), /font_px_min 90 < 100/);
  assert.match(bad((t) => { t.boxes.face.head_min_h = 100; }), /head_min_h/);
  assert.match(bad((t) => { t.safe.no_go = []; }), /thiếu vùng cấm/);
  assert.match(bad((t) => { t.safe.margin = 20; }), /lề 20 < 48/);
  assert.match(bad((t) => { delete t.boxes.visual; }), /thiếu hộp visual/);
});

// ---------------------------------------------------------------- chữ
test('đếm từ theo khoảng trắng (tiếng Việt = âm tiết); ước dòng; nhấn một từ', () => {
  assert.equal(T.wordCount('  AI   bịa chuyện\tthế nào? '), 5);
  assert.equal(T.wordCount(''), 0); assert.equal(T.wordCount(null), 0);
  assert.equal(T.wordCount('Đừng tin AI 100%'), 4);
  assert.equal(T.estimateLines('AI bịa chuyện thế nào?', 700, 100), 2);
  assert.equal(T.estimateLines('Máy đoán chữ kế tiếp sai bét', 400, 100), 4);
});

// ---------------------------------------------------------------- kiểm khô (T3 T4 T5 T6 + T11 sớm)
const V0 = () => ({ template: 'host-shock-left', headline: 'AI sai mà tự tin?', highlight: 'sai', kicker: 'SỰ THẬT', face: { cast: 'CM-0001', mood: 'shock' }, visual: { beat: 0 } });
const V1 = () => ({ template: 'big-visual', headline: 'Đoán chứ không biết', face: { cast: 'CM-0002', mood: 'excited' }, visual: { beat: 1 } });
const ENV = { beatIds: new Set(['BT-0001']), beatCount: 3, castOk: (r) => /^CM-000[12]$/.test(r), assetOk: (r) => (r === 'AS-0009' ? { ok: true } : { ok: false, text: 'Asset ' + r + ' không dùng được.' }) };
const val = (variants) => T.validateThumbnail({ variants }, ENV).map((e) => e.path + ': ' + e.text).join('\n');

test('validateThumbnail: bộ hợp lệ ⇒ không lỗi; mỗi ca âm báo đúng mục T', () => {
  assert.deepEqual(T.validateThumbnail({ variants: [V0(), V1()] }, ENV), []);
  assert.deepEqual(T.validateThumbnail({ variants: [V0(), V1(), Object.assign(V1(), { template: 'duo-versus' })] }, ENV), [], '3 phương án');
  const bad = (mut, re, n = 0) => { const a = V0(); mut(a); const out = val([a, V1()]); assert.match(out, re, out); assert.match(out, new RegExp(`variants\\[${n}\\]`)); };
  assert.match(val([V0()]), /Cần 2–3 phương án/); assert.match(T.validateThumbnail({}, ENV)[0].text, /thumbnail phải là/);
  assert.match(val([V0(), V1(), V1(), V1()]), /Cần 2–3 phương án/);
  bad((v) => { v.headline = 'a b c d e f g'; }, /7 từ > 6 từ/);                                  // T3 từ
  bad((v) => { v.headline = 'abcdefghijklmnop abcdefghijklmnop'; }, /33 ký tự > 32/);                // T3 ký tự
  bad((v) => { v.headline = ''; }, /Thiếu tiêu đề/);
  bad((v) => { v.headline = 'dòng một\ndòng hai'; }, /không xuống dòng tay/);
  bad((v) => { v.headline = 'aaaaaaaaaa bbbbbbbbbb cccccccccc'; }, /quá dài cho mẫu host-shock-left/);   // 32 ký tự nhưng tràn 2 dòng ở 100 px trong hộp 692 px
  bad((v) => { v.highlight = 'sai mà'; }, /tối đa 1 từ/);
  bad((v) => { v.highlight = 'xyz'; }, /không nằm trong tiêu đề/);
  bad((v) => { v.kicker = 'một hai ba'; }, /3 từ > 2/);                                            // T4
  bad((v) => { v.kicker = 'ABCDEFGHIJKLMNOP'; }, /16 ký tự > 14/);
  bad((v) => { v.template = 'khong-co'; }, /Mẫu "khong-co" không có/);
  bad((v) => { delete v.face; }, /Thiếu face/);                                                    // T5
  bad((v) => { v.face.mood = 'bored'; }, /mood phải thuộc/);
  bad((v) => { v.face = { owner: true, cast: 'CM-0001', mood: 'shock' }; }, /chỉ khai MỘT/);
  bad((v) => { v.face = { cast: 'CM-0099', mood: 'shock' }; }, /không thuộc kênh/);
  bad((v) => { v.sidekick = [{ cast: 'CM-0002', mood: 'think' }]; }, /tối đa 1 sidekick/);
  bad((v) => { v.template = 'big-visual'; v.sidekick = { cast: 'CM-0002', mood: 'think' }; }, /không có chỗ cho sidekick/);
  bad((v) => { v.sidekick = { mood: 'think' }; }, /sidekick cần cast/);
  bad((v) => { delete v.visual; }, /Thiếu visual/);                                                // T6
  bad((v) => { v.visual = { beat: 0, asset: 'AS-0009' }; }, /ĐÚNG MỘT/);
  bad((v) => { v.visual = { beat: 7 }; }, /Nhịp số 7 không có/);
  bad((v) => { v.visual = { beat: 'BT-0042' }; }, /BT-0042 không có trong bài/);
  bad((v) => { v.visual = { beat: 'xyz' }; }, /số thứ tự nhịp/);
  bad((v) => { v.visual = { asset: 'AS-0001' }; }, /không dùng được/);
  assert.deepEqual(T.validateThumbnail({ variants: [Object.assign(V0(), { visual: { beat: 'BT-0001' } }), Object.assign(V1(), { visual: { asset: 'AS-0009' } })] }, ENV), [], 'BT-… có trong bài + asset hợp lệ');
  assert.match(val([V0(), V0()]), /variants\[1\]: Phương án trùng phương án 0 \(T11/);            // T11 sớm
});

// ---------------------------------------------------------------- score + đo (ca âm F3-2 trên số đo giả, từng ca đúng một mục T)
test('score (CNS-111) = 0,4·min(contrast/7,1) + 0,3·min(font/140,1) + 0,3·min(mặt/0,35,1)', () => {
  assert.equal(T.score(21, 200, 0.9), 1);
  assert.equal(T.score(3.5, 70, 0.175), 0.5);
  assert.equal(T.score(7, 140, 0.35), 1); assert.equal(T.score(0, 0, 0), 0);
});

const plan = H.fixturePlan();
const specsOf = (variants, ctx) => T.resolveThumbs({ variants }, plan, Object.assign({ beatOrder: H.BEAT_ORDER }, ctx));
function good(spec) {   // số đo DOM + pixel "đạt" cho một spec
  const b = spec.template.boxes;
  const dom = { headline: { x: b.headline.x, y: b.headline.y + 20, w: b.headline.w - 20, h: 200, font_px: 120, lines: 2, overflow: false },
    kicker: spec.kicker ? { x: b.kicker.x + 4, y: b.kicker.y + 5, w: 200, h: 44, overflow: false } : null,
    face: { kind: 'cast', x: b.face.x, y: b.face.y, w: b.face.w, h: b.face.h, head_h: 250, alpha: true },
    sidekick: spec.sidekick ? { x: b.sidekick.x, y: b.sidekick.y, w: b.sidekick.w, h: b.sidekick.h, head_h: 100 } : null,
    visual: { x: b.visual.x + 6, y: b.visual.y + 6, w: b.visual.w - 12, h: b.visual.h - 12 },
    brand: { x: spec.brand.box.x, y: spec.brand.box.y + 4, w: 150, h: 47, corner: spec.brand.corner } };
  const px = { dim1280: [1280, 720], dim1920: [1920, 1080], magic1280: true, magic1920: true, bytes1280: 300000, bytes1920: 500000, contrast: 9, diffs: {} };
  return { dom, px };
}
const one = (mut) => {
  const [s] = specsOf([Object.assign(V0Plan(), {})]); const g = good(s); mut(s, g.dom, g.px);
  return T.measure([s], [g.dom], [g.px]).variants[0];
};
function V0Plan() { return { template: 'host-shock-left', headline: 'AI sai mà tự tin?', highlight: 'sai', kicker: 'SỰ THẬT', face: { cast: 'CM-0001', mood: 'shock' }, sidekick: { cast: 'CM-0002', mood: 'panic' }, visual: { beat: 1 } }; }

test('G-THUMB F3-2: số đo "đạt" ⇒ pass; MỖI ca âm trượt đúng mục T của nó (và chỉ mục đó)', () => {
  const ok = one(() => {}); assert.equal(ok.pass, true, JSON.stringify(ok.fails)); assert.deepEqual(ok.fails, []);
  assert.equal(ok.index, 0); assert.equal(ok.i, 0); assert.equal(ok.score, T.score(9, 120, 250 / 720));
  const cases = {
    'tiêu đề 7 từ': [(s) => { s.headline = 'a b c d e f g'; }, ['T3']],
    'tiêu đề 3 dòng': [(s, d) => { d.headline.lines = 3; }, ['T3']],
    'tiêu đề tràn hộp': [(s, d) => { d.headline.overflow = true; }, ['T3']],
    'kicker 3 từ': [(s) => { s.kicker = 'một hai ba'; }, ['T4']],
    'chữ 80 px': [(s, d) => { d.headline.font_px = 80; }, ['T8']],
    'chữ vàng trên nền vàng (tương phản 1,2)': [(s, d, p) => { p.contrast = 1.2; }, ['T7']],
    'không tìm thấy chữ trong ảnh (contrast null)': [(s, d, p) => { p.contrast = null; }, ['T7']],
    'mặt chính nằm trong vùng thời lượng': [(s, d) => { d.face = Object.assign(d.face, { x: 1030, y: 620, w: 200, h: 90 }); }, ['T9']],
    'chữ đè vùng thời lượng': [(s, d) => { d.headline.x = 1000; d.headline.y = 600; d.headline.w = 200; d.headline.h = 100; }, ['T9']],
    'logo ngoài lề 48': [(s, d) => { d.brand.x = 20; }, ['T9']],
    'sidekick to hơn mặt chính': [(s, d) => { d.sidekick.head_h = 260; }, ['T5']],
    'ảnh owner không có alpha': [(s, d) => { d.face.kind = 'owner'; d.face.alpha = false; }, ['T5']],
    'mặt chính thấp hơn 22 %': [(s, d) => { d.face.head_h = 100; }, ['T5']],
    'khung giữ chỗ (chưa có mặt thật)': [(s, d) => { d.face.kind = 'placeholder'; }, ['T5']],
    'ảnh 2,4 MB': [(s, d, p) => { p.bytes1920 = 2.4e6; }, ['T2']],
    'không phải JPEG': [(s, d, p) => { p.magic1280 = false; }, ['T2']],
    'sai kích thước': [(s, d, p) => { p.dim1280 = [1279, 720]; }, ['T1']],
    'thiếu hình chủ đạo': [(s, d) => { d.visual = null; }, ['T6']],
    'logo rộng > 12 %': [(s, d) => { d.brand.w = 200; }, ['T10']],
    'logo sai góc': [(s, d) => { d.brand.corner = 'br'; }, ['T10']],
  };
  for (const [name, [mut, want]] of Object.entries(cases)) assert.deepEqual(rules(one(mut)), want, name);
});

test('G-THUMB T11: hai phương án khác < 10 % pixel ⇒ phương án SAU trượt; passed chỉ gồm phương án đạt; pass ⇔ ≥ 1 phương án đạt', () => {
  const specs = specsOf([V0Plan(), Object.assign(V0Plan(), { headline: 'AI sai mà tự tin?!' })]);
  const g = specs.map(good);
  g[1].px.diffs = { 0: 0.04 };
  const m = T.measure(specs, g.map((x) => x.dom), g.map((x) => x.px));
  assert.deepEqual(m.passed, [0]); assert.equal(m.variants[0].pass, true); assert.deepEqual(rules(m.variants[1]), ['T11']); assert.equal(m.variants[1].min_diff_other, 0.04);
  g[1].px.diffs = { 0: 0.5 };
  assert.deepEqual(T.measure(specs, g.map((x) => x.dom), g.map((x) => x.px)).passed, [0, 1]);
  // phương án trước trượt ⇒ phương án sau giống nó không bị phạt T11
  g[0].px.contrast = 1; g[1].px.diffs = { 0: 0.01 };
  const m2 = T.measure(specs, g.map((x) => x.dom), g.map((x) => x.px));
  assert.deepEqual(m2.passed, [1]);
  assert.deepEqual(T.measure([], [], []), { variants: [], passed: [] });
});

// ---------------------------------------------------------------- đo tương phản bằng pixel (F3-3) — ffmpeg thật
test('đo tương phản F3-3: đen/trắng 21:1 và #777/trắng 4,48:1, sai số ≤ 0,2 (mặt nạ chữ = hiệu hai ảnh)', { skip: H.FFMPEG ? false : 'không có ffmpeg' }, () => {
  const dir = H.mkdtemp();
  try {
    const none = H.flatPng(path.join(dir, 'none.png'), { bg: 'white' });
    const black = H.flatPng(path.join(dir, 'black.png'), { bg: 'white', box: { x: 300, y: 200, w: 400, h: 120, color: 'black' } });
    const grey = H.flatPng(path.join(dir, 'grey.png'), { bg: 'white', box: { x: 300, y: 200, w: 400, h: 120, color: '0x777777' } });
    const base = G.decodeRgb(none, H.FFMPEG);
    const c1 = G.contrastOf(G.decodeRgb(black, H.FFMPEG), base), c2 = G.contrastOf(G.decodeRgb(grey, H.FFMPEG), base);
    assert.ok(Math.abs(c1.contrast - 21) <= 0.2, 'đen/trắng ' + c1.contrast);
    assert.ok(Math.abs(c2.contrast - 4.48) <= 0.2, '#777/trắng ' + c2.contrast);
    assert.equal(c1.text_px, 400 * 120);
    assert.equal(G.contrastOf(base, base).contrast, null, 'không có pixel chữ ⇒ null (T7 trượt)');
    assert.equal(G.diffRatio(base, G.decodeRgb(black, H.FFMPEG)), (400 * 120) / (1280 * 720));
    assert.equal(G.diffRatio(base, base), 0);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('jpegSize đọc SOF; không phải JPEG ⇒ null', () => {
  const JPG = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', 'base64');
  assert.deepEqual(G.jpegSize(JPG), [1, 1]); assert.equal(G.jpegSize(Buffer.from('not a jpeg')), null);
});

test('gateThumb: không đo được ⇒ unknown (chặn như mọi cổng, INT-08) — không có phương án / thiếu ffmpeg / thiếu tệp / thiếu số đo DOM', () => {
  assert.equal(G.gateThumb({ variants: [], ffmpegPath: 'ffmpeg' }).result, 'unknown');
  const spec = specsOf([V0Plan()])[0];
  assert.match(G.gateThumb({ variants: [{ index: 0, spec, measures: {} }] }).measure.text_human, /Thiếu ffmpeg/);
  assert.match(G.gateThumb({ variants: [{ index: 0, spec, measures: {} }], ffmpegPath: 'ffmpeg' }).measure.text_human, /thiếu tệp png/);
  assert.match(G.gateThumb({ variants: [{ index: 0, spec }], ffmpegPath: 'ffmpeg' }).measure.text_human, /thiếu spec\/số đo DOM/);
  assert.equal(G.gateThumb({ variants: [{ index: 0, spec, measures: {}, png: '/không/có', png_notext: '/x', jpg1280: '/x', jpg1920: '/x' }], ffmpegPath: 'ffmpeg' }).result, 'unknown');
});

// ---------------------------------------------------------------- resolveThumbs
test('resolveThumbs: ảnh mặt chủ kênh khớp mood (không khớp ⇒ ảnh đầu), rơi về KOL host_lead + cảnh báo, rồi khung giữ chỗ có nhãn', () => {
  const faces = [{ asset: 'media/aa/1.png', mood: 'smug' }, { asset: 'media/bb/2.png', mood: 'shock' }];
  const th = [{ template: 'host-shock-left', headline: 'Chào bạn', face: { owner: true, mood: 'shock' }, visual: { beat: 0 } }, { template: 'big-visual', headline: 'Chào bạn', face: { owner: true, mood: 'vow' }, visual: { beat: 0 } }];
  const [a, b] = specsOf(th, { faces });
  assert.deepEqual([a.face.kind, a.face.asset, a.face.pick_mood], ['owner', 'media/bb/2.png', 'shock']);
  assert.deepEqual([b.face.kind, b.face.asset], ['owner', 'media/aa/1.png'], 'không có mood khớp ⇒ ảnh đầu tiên');
  const [c] = specsOf(th.slice(0, 1), {});
  assert.equal(c.face.kind, 'cast'); assert.equal(c.face.fallback, 'host_lead'); assert.match(c.warnings[0], /chưa có ảnh mặt chủ kênh/); assert.equal(c.face.state, 'shock');
  const noCast = Object.assign({}, plan, { cast: {}, persona: {} });
  const [d] = T.resolveThumbs({ variants: th.slice(0, 1) }, noCast, { beatOrder: H.BEAT_ORDER });
  assert.deepEqual([d.face.kind, d.face.label], ['placeholder', 'ẢNH MẶT CHỦ KÊNH']);
});

test('resolveThumbs: hình chủ đạo theo số thứ tự/BT-…/asset; thiếu dữ liệu ⇒ PlanError có mã; assetRefsOf gom đúng; góc logo theo brand', () => {
  const mk = (visual, extra) => ({ template: 'big-visual', headline: 'Chào bạn', face: { cast: 'CM-0001', mood: 'shock' }, visual, ...extra });
  const [a, b, c] = specsOf([mk({ beat: 1 }), mk({ beat: 'BT-0003' }), mk({ asset: 'AS-0005' })], { assetPath: (r) => (r === 'AS-0005' ? 'media/cc/5.png' : null) });
  assert.deepEqual([a.visual.kind, a.visual.block, a.visual.beat], ['block', 'prob-card', 'BT-0002']);
  assert.equal(b.visual.block, 'stamp'); assert.deepEqual([c.visual.kind, c.visual.asset], ['asset', 'media/cc/5.png']);
  assert.throws(() => specsOf([mk({ beat: 9 })]), (e) => e instanceof PlanError && e.code === 'thumb_visual_missing');
  assert.throws(() => specsOf([mk({ asset: 'AS-0006' })], { assetPath: () => null }), (e) => e.code === 'thumb_asset_missing');
  assert.throws(() => specsOf([mk({ beat: 0 }, { face: { cast: 'CM-0777', mood: 'shock' } })]), (e) => e.code === 'thumb_cast_missing');
  assert.deepEqual(T.assetRefsOf(specsOf([mk({ asset: 'AS-0005' })], { assetPath: () => 'media/cc/5.png', logoPath: 'media/dd/logo.png', faces: [] })).map((r) => r.asset), ['media/cc/5.png', 'media/dd/logo.png']);
  const withCorner = (corner) => T.resolveThumbs({ variants: [mk({ beat: 0 })] }, Object.assign({}, plan, { style: Object.assign({}, plan.style, { brand: { thumb: { corner } } }) }), { beatOrder: H.BEAT_ORDER })[0];
  assert.equal(withCorner('bl').brand.corner, 'tr', 'big-visual: góc dưới-trái đè hộp chữ ⇒ giữ góc của mẫu');
  assert.equal(withCorner('tl').brand.corner, 'tr', 'big-visual: góc trên-trái (mặc định brand) đè nhãn phụ ⇒ giữ góc của mẫu');
  assert.equal(withCorner('br').brand.corner, 'tr', 'góc dưới-phải là vùng thời lượng ⇒ rơi về góc của mẫu');
  const left = T.resolveThumbs({ variants: [mk({ beat: 0 }, { template: 'host-shock-left' })] }, Object.assign({}, plan, { style: Object.assign({}, plan.style, { brand: { thumb: { corner: 'tl' } } }) }), { beatOrder: H.BEAT_ORDER })[0];
  assert.deepEqual([left.brand.corner, left.brand.box.x, left.brand.box.y], ['tl', 48, 48]);
  // màu: chữ luôn tương phản cao với nền; nền vàng ⇒ nhấn dạng "tấm" đảo màu
  const s = specsOf([mk({ beat: 0 }, { template: 'host-shock-right' })])[0];
  assert.ok(T.contrast(s.palette.text, s.palette.bg) >= 4.5); assert.equal(s.palette.hlMode, 'plate');
  assert.ok(T.contrast(specsOf([mk({ beat: 0 })])[0].palette.hl, '#1D2A6E') >= 4.5, 'nền mực ⇒ nhấn bằng màu');
});

test('proposeText: tất định từ dữ liệu bài (thuật ngữ + 3 khuôn câu + đếm từ), không gọi LLM', () => {
  const lesson = { title: 'Vì sao A.I. sai?', lines: [{ say: 'x', terms: ['A.I.', 'token'] }, { say: 'y', terms: ['A.I.'] }], beats: [{ block: 'stamp', params: { text: 'Đoán' } }, { block: 'title', params: { text: 'bỏ qua' } }] };
  const r = T.proposeText(lesson);
  assert.deepEqual(r, T.proposeText(clone(lesson)), 'tất định');
  assert.equal(r.terms[0], 'A.I.');
  assert.deepEqual(r.frames.map((f) => f.pattern), ['X là gì?', 'Sự thật về X', 'Đừng … nếu chưa biết X']);
  assert.equal(r.frames[0].text, 'A.I. là gì?'); assert.equal(r.frames[0].words, 3); assert.equal(r.frames[0].ok, true);
  assert.equal(r.frames[2].free_words, 1, '"Đừng … nếu chưa biết A.I." đã 6 từ kể cả chỗ trống ⇒ phần … chỉ còn 1 từ'); assert.equal(r.limits.words_max, 6);
  assert.deepEqual(T.proposeText({ title: '', lines: [], beats: [] }).frames, []);
});

// ---------------------------------------------------------------- máy chủ: lessonExt, channelDefaults, thumbnail.pick, MCP
const thumbFor = (b) => ({ variants: [
  { template: 'host-shock-left', headline: 'AI sai mà tự tin?', face: { cast: b.m1.display_id, mood: 'shock' }, sidekick: { cast: b.m2.display_id, mood: 'panic' }, visual: { beat: 0 } },
  { template: 'big-visual', headline: 'Đoán chứ không biết', face: { cast: b.m2.display_id, mood: 'excited' }, visual: { beat: 0 } }] });

test('channelDefaults (CNS-123): kênh TẠO MỚI (write) mặc định policy.thumbnail_required = true; owner gửi false thì thắng; agent vẫn không tự đặt', () => {
  const t = tmpDb();
  try {
    const o = owner(t.db), pol = (ch) => t.db.json(t.db.get('SELECT data FROM channel_versions WHERE entity_id=?', ch.id)).data.policy;
    const a = t.write(o, 'channel.create', { name: 'Mới' });
    assert.deepEqual(pol(a), { thumbnail_required: true });
    assert.equal(pol(t.write(o, 'channel.create', { name: 'Cũ', data: { policy: { thumbnail_required: false } } })).thumbnail_required, false);
    assert.equal(pol(t.write(agent(['compose']), 'channel.create', { name: 'Của agent' })).thumbnail_required, true);
    assert.throws(() => t.write(agent(['compose']), 'channel.create', { name: 'X', data: { policy: { thumbnail_required: false } } }), code('forbidden'));
    // channel.update không áp lại mặc định: kênh cũ (không có policy) vẫn không bắt buộc, kênh đã tắt vẫn tắt
    const off = t.write(o, 'channel.create', { name: 'Tắt', data: { policy: { thumbnail_required: false } } });
    t.write(o, 'channel.update', { channel: off.display_id, data: { glossary: ['A'] } });
    assert.equal(t.db.json(t.db.get('SELECT data FROM channel_versions WHERE entity_id=? AND version=2', off.id)).data.policy.thumbnail_required, false);
  } finally { t.clean(); }
});

test('lessonExt thumbnail: kênh bắt buộc ⇒ thiếu bị chặn kèm ví dụ; kênh cũ không; kiểm khô qua lesson.submit; kế thừa; null xoá; cast kênh khác bị từ chối', () => {
  const t = tmpDb();
  try {
    const b = basics(t.write, t.db);   // basics tắt policy (bộ test cũ) — bật lại như kênh mới
    const submit = (extra, who = b.o) => t.write(who, 'lesson.submit', lessonBody(b, extra));
    submit({});   // kênh tắt luật ⇒ không cần ảnh bìa (bài cũ y hệt)
    t.write(b.o, 'channel.update', { channel: b.ch.display_id, data: { policy: { thumbnail_required: true } } });
    assert.throws(() => submit({}), /thumbnail_required: Kênh này bắt buộc có ảnh bìa.*host-shock-left/s);
    assert.throws(() => submit({ thumbnail: null }), /thumbnail_required/);
    assert.throws(() => submit({ thumbnail: { variants: [{ template: 'x' }, { template: 'y' }] } }), /thumbnail\.variants\[0\]/);
    const v = submit({ thumbnail: thumbFor(b) });
    const row = (n) => t.db.json(t.db.get('SELECT * FROM lesson_versions WHERE lesson_id=(SELECT id FROM lessons WHERE display_id=?) AND version=?', v.lesson.display_id, n));
    assert.equal(row(1).thumbnail.variants.length, 2);
    t.write(b.o, 'lesson.submit', lessonBody(b, { lesson: v.lesson.display_id, title: 'Sửa' }));   // KHÔNG gửi thumbnail ⇒ kế thừa
    assert.equal(row(2).thumbnail.variants.length, 2);
    assert.throws(() => t.write(b.o, 'lesson.submit', lessonBody(b, { lesson: v.lesson.display_id, thumbnail: null })), /thumbnail_required/);
    // nhân vật của kênh khác
    const ch2 = t.write(b.o, 'channel.create', { name: 'K2', data: { policy: { thumbnail_required: false } } });
    const other = t.write(b.o, 'cast.save', { channel: ch2.display_id, name: 'Lạ', data: { look: {} } });
    const bad = thumbFor(b); bad.variants[0].face.cast = other.display_id;
    assert.throws(() => submit({ thumbnail: bad }), /không thuộc kênh này/);
    // bài hướng dẫn luôn cần ảnh bìa dù kênh không bật (luật nằm ở lessonExt của T)
    const ext = t.write.ext.lessonExt.list().find((x) => x.name === 'thumbnail');
    const dry = (lv) => ext.validate(Object.assign({ kind: 'lesson', values: {}, channelData: {}, beats: [], channel: b.ch }, lv), { byRef: () => null });
    assert.match(dry({ kind: 'tutorial' })[0].text, /Bài hướng dẫn bắt buộc có ảnh bìa/); assert.deepEqual(dry({ kind: 'lesson' }), []);
  } finally { t.clean(); }
});

test('thumbnail.pick: CHỈ owner + phiên UI (mọi ô ✗ §10 bị từ chối); chọn phương án ĐẠT của chính Render; đổi được tới khi xuất; audit', () => {
  const t = tmpDb();
  try {
    const b = basics(t.write, t.db);
    const r = t.write(b.o, 'lesson.submit', lessonBody(b));
    const rd = t.db.get('SELECT * FROM renders WHERE display_id=?', r.render.display_id);
    const outputs = { thumbs: [{ variant: 0, w1280: 'AS-0101', w1920: 'AS-0102', pass: true, score: 0.8 }, { variant: 2, w1280: 'AS-0105', w1920: 'AS-0106', pass: true, score: 0.9 }] };
    const pick = (a, p) => t.write(a, 'thumbnail.pick', Object.assign({ render: rd.display_id }, p));
    assert.throws(() => pick(b.o, { asset: 'AS-0101' }), code('invalid'), 'Render chưa có outputs.thumbs');
    for (const s of ['voicing', 'judging', 'aligning', 'rendering', 'mixing']) state.transitionRender(t.db, rd.id, s);
    state.transitionRender(t.db, rd.id, 'gating', { outputs: { mp4: 'x' } });
    state.transitionRender(t.db, rd.id, 'awaiting_review', { progress: 1, outputs });
    const NON = [['agent compose', agent(['read', 'compose', 'run'])], ['agent run', agent(['run'])], ['trợ lý', { type: 'assistant', entry: 'assistant' }], ['CLI', { type: 'cli', entry: 'cli' }],
      ['runner', { type: 'runner', entry: 'runner' }], ['reviewer', { type: 'user', id: 'u', role: 'reviewer', entry: 'ui' }], ['owner qua http (không phải phiên UI)', Object.assign({}, b.o, { entry: 'http' })], ['hệ thống', { type: 'system', entry: 'system' }]];
    for (const [name, a] of NON) assert.throws(() => pick(a, { asset: 'AS-0101' }), code('forbidden'), name + ' ✗ chọn ảnh bìa');
    assert.equal(t.db.get('SELECT thumbnail_pick FROM renders WHERE id=?', rd.id).thumbnail_pick, null, 'không ai chọn được ngoài owner UI');
    assert.throws(() => pick(b.o, { asset: 'AS-0999' }), code('invalid'), 'asset không thuộc outputs.thumbs');
    assert.throws(() => pick(b.o, {}), code('invalid'));
    pick(b.o, { asset: 'AS-0101' });
    let x = t.db.get('SELECT * FROM renders WHERE id=?', rd.id); assert.equal(x.thumbnail_pick, 'AS-0101'); assert.ok(x.thumbnail_picked_at && x.thumbnail_picked_by);
    pick(b.o, { variant: 2 });   // đổi bằng chỉ số phương án; lưu mã asset 1280
    x = t.db.get('SELECT * FROM renders WHERE id=?', rd.id); assert.equal(x.thumbnail_pick, 'AS-0105');
    assert.equal(t.db.all("SELECT * FROM audit_log WHERE action='thumbnail.pick'").length, 2, 'mỗi lần chọn có audit');
    const au = t.db.all("SELECT * FROM audit_log WHERE action='thumbnail.pick' ORDER BY rowid DESC LIMIT 1")[0]; assert.match(au.after, /AS-0105/); assert.match(au.before, /AS-0101/);
    // outputs vẫn bất biến (CNS-119); đã xuất ⇒ không đổi nữa
    assert.throws(() => t.db.run('UPDATE renders SET outputs=? WHERE id=?', JSON.stringify({}), rd.id), /bất biến/);
    t.db.run('UPDATE renders SET exported_at=? WHERE id=?', t.db.now(), rd.id);
    assert.throws(() => pick(b.o, { asset: 'AS-0101' }), code('conflict'));
  } finally { t.clean(); }
});

test('MCP: propose_thumbnail_text (phạm vi compose, tất định, từ bài đã nộp hoặc dữ liệu thô) + get_capabilities.thumbnail; không có tool chọn ảnh bìa', async () => {
  const t = tmpDb();
  try {
    const b = basics(t.write, t.db);
    const sub = t.write(b.o, 'lesson.submit', lessonBody(b, { lines: [{ who: b.m1.display_id, say: 'Chào các bạn nhỏ', terms: ['A.I.'] }, { who: b.m2.display_id, say: 'Hôm nay học A.I.' }] }));
    const mcp = createMcp({ db: t.db, write: t.write, config: { version: 't', dataDir: t.dir, ffmpegPath: 'ffmpeg', chromiumPath: null } });
    const mk = (scopes) => auth.verifyAgentToken(t.db, t.write(b.o, 'agent.create', { name: 'A' + scopes.join(''), scopes }).token);
    const call = async (c, name, args) => (await mcp.handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args || {} } }, c)).result;
    const compose = mk(['read', 'compose']), ro = mk(['read']);
    assert.equal((await call(ro, 'propose_thumbnail_text', { lesson: sub.lesson.display_id })).isError, true, 'chỉ đọc ✗');
    const r = await call(compose, 'propose_thumbnail_text', { lesson: sub.lesson.display_id });
    assert.ok(!r.isError, r.content[0].text);
    assert.equal(r.structuredContent.frames[0].text, 'A.I. là gì?'); assert.match(r.content[0].text, /Sự thật về A\.I\./); assert.deepEqual(r.structuredContent, (await call(compose, 'propose_thumbnail_text', { lesson: sub.lesson.display_id })).structuredContent);
    const raw = await call(compose, 'propose_thumbnail_text', { title: 'T', lines: [{ say: 'x', terms: ['token'] }], beats: [] });
    assert.equal(raw.structuredContent.frames[0].text, 'token là gì?');
    assert.equal((await call(compose, 'propose_thumbnail_text', {})).isError, true, 'thiếu cả lesson lẫn lines');
    assert.equal((await call(compose, 'propose_thumbnail_text', { lesson: 'LS-9999' })).isError, true);
    const caps = (await call(compose, 'get_capabilities', { channel: b.ch.display_id })).structuredContent.thumbnail;
    assert.deepEqual(caps.templates.map((x) => x.id), T.templates().map((x) => x.id)); assert.equal(caps.rules.words_max, 6); assert.deepEqual(caps.rules.moods, T.MOODS);
    assert.equal(caps.owner_faces, 0); assert.equal(caps.required, false);
    t.write(b.o, 'channel.update', { channel: b.ch.display_id, data: { policy: { thumbnail_required: true }, brand: { thumb: { faces: [{ asset: 'AS-0001', mood: 'shock' }] } } } });
    const caps2 = (await call(compose, 'get_capabilities', { channel: b.ch.display_id })).structuredContent.thumbnail; assert.equal(caps2.required, true); assert.equal(caps2.owner_faces, 1);
    assert.ok(!mcp.tools.some((n) => /pick/.test(n)), 'chọn ảnh bìa chỉ qua UI (§10)');
    const props = (await mcp.handle({ jsonrpc: '2.0', id: 2, method: 'tools/list' }, compose)).result.tools.find((x) => x.name === 'submit_lesson').inputSchema.properties;
    assert.ok(props.thumbnail && props.thumbnail.description.includes('2–3 phương án'), 'thumbnail có trong inputSchema của agent');
  } finally { t.clean(); }
});

test('agent giả: kênh bắt buộc ảnh bìa ⇒ nộp mẫu có thumbnail hợp lệ (3 phương án, 3 mẫu khác nhau); mẫu lesson-thumb qua kiểm khô', () => {
  const fake = require('../agent/fake-agent.js');
  const spec = fake.loadSample('lesson-thumb');
  const cast = [{ display_id: 'CM-0001', name: 'Anh Gen' }, { display_id: 'CM-0002', name: 'Bé Hỏi' }];
  const les = fake.sample(cast, { channel: { display_id: 'CH-1' }, work_order: 'WO-1' }, spec);
  assert.equal(les.thumbnail.variants.length, 3); assert.equal(new Set(les.thumbnail.variants.map((v) => v.template)).size, 3);
  assert.deepEqual(T.validateThumbnail(les.thumbnail, { beatCount: les.beats.length, castOk: (r) => /^CM-000[12]$/.test(r) }), []);
  assert.equal(les.thumbnail.variants[0].sidekick.cast, 'CM-0002');
});

// hợp đồng T × U: ảnh bìa lấy hình từ nhịp màn hình (khối screen) ⇒ spec mang đúng màn đó (sân khấu ảnh bìa tra plan.screens) + asset của màn vào assetRefs
test('resolveThumbs: visual là nhịp screen ⇒ visual.screens = đúng màn của nhịp; assetRefsOf gồm ảnh màn', () => {
  const p2 = JSON.parse(JSON.stringify(plan));
  const sb = { id: 'BT-0009', block: 'screen', params: { screen: 'SC-2' }, slot: { x: 0, y: 0, w: 1920, h: 1080 } };
  p2.beats = p2.beats.concat([sb]);
  p2.screens = [{ id: 'SC-1', asset: 'media/aa/1.png' }, { id: 'SC-2', asset: 'media/bb/2.png' }];
  const v = H.fourVariants().variants.slice(0, 1).map(x => Object.assign({}, x, { visual: { beat: 'BT-0009' } }));
  const [s] = T.resolveThumbs({ variants: v }, p2, { beatOrder: H.BEAT_ORDER.concat(['BT-0009']) });
  assert.equal(s.visual.block, 'screen'); assert.deepEqual(s.visual.screens, [{ id: 'SC-2', asset: 'media/bb/2.png' }]);
  assert.ok(T.assetRefsOf([s]).some(r => r.asset === 'media/bb/2.png'));
});
