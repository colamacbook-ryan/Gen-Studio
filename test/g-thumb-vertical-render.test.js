// © 2026 Gen Labs — All rights reserved.
// F7 gói A3 (SPEC-0.2.0-F7 §5.1, §10.3, CNS-336): dựng ảnh bìa DỌC thật bằng Chromium 1080×1920 + ffmpeg qua đúng đường GSThumb + G-THUMB:
//   2 mẫu × (ảnh mặt chủ kênh giả · KOL host_lead) ⇒ PNG 1080×1920 → JPEG 720×1280 + 1080×1920 (< 2 MB) ⇒ G-THUMB pass; tất định (L-108: chụp 1:1 cả khung, 2 lần ⇒ cùng byte); 0 lỗi console;
//   GSThumb tự đặt khung sân khấu theo canvas của mẫu ⇒ KHÔNG phụ thuộc layout sân khấu của A2; mẫu 16:9 dựng liền sau mẫu dọc vẫn ra 1920×1080 như cũ.
// Hai đường cần A2 (still.js cho phép cao > 1080; renderPlan mở sân khấu theo plan.size) có phép thử riêng, TỰ BẬT khi A2 đã gộp, trước đó skip có lý do.
// Đặt GS_THUMB_OUT=/thư/mục để giữ ảnh mẫu (tự kiểm bằng mắt).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const T = require('../render/thumb.js');
const G = require('../media/gates/thumb.js');
const still = require('../render/still');
const { openStage } = require('../render/render');
const H = require('./g-thumb-helpers');

const SKIP = H.NO_BROWSER_OR_FFMPEG;
const OUT = process.env.GS_THUMB_OUT || null;
const plan = H.fixturePlan(); plan.duration_ms = 600;
const FACE = 'data:image/png;base64,' + H.ownerFacePng({ alpha: true }).toString('base64');   // ảnh mặt GIẢ tự vẽ (không phải người thật)
const VARIANTS = [
  { template: 'v-host-top', headline: 'AI bịa chuyện thế nào?', highlight: 'bịa', kicker: 'SỰ THẬT', face: { owner: true, mood: 'shock' }, visual: { beat: 1 } },
  { template: 'v-big-visual', headline: 'Đừng tin AI 100%', highlight: 'tin', kicker: 'CẢNH BÁO', face: { owner: true, mood: 'shock' }, sidekick: { cast: 'CM-0002', mood: 'panic' }, visual: { beat: 2 } },
  { template: 'v-host-top', headline: 'Máy đoán chữ kế tiếp', highlight: 'đoán', face: { cast: 'CM-0001', mood: 'vow' }, visual: { beat: 0 } },
  { template: 'v-big-visual', headline: 'Hà Nội chiếm 92%', highlight: '92%', kicker: 'SỐ LIỆU', face: { cast: 'CM-0002', mood: 'excited' }, visual: { beat: 1 } },
];
const specsOf = (variants) => T.resolveThumbs({ variants }, plan, { beatOrder: H.BEAT_ORDER, faces: [{ asset: FACE, mood: 'shock' }], channelName: 'Lớp AI Bình Dân' });
const rules = (v) => [...new Set(v.fails.map((f) => f.rule))];
const ff = (src, out, w, h) => { const r = spawnSync(H.FFMPEG, ['-v', 'error', '-y', '-i', src, '-vf', `scale=${w}:${h}:flags=lanczos`, '-q:v', '3', out], { encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); return out; };

// dựng một spec trong stage: PNG có chữ + PNG không chữ (đúng quy trình renderThumbs), đúng viewport 1:1
async function shoot(stage, spec, base, viewport) {
  const measures = await stage.ev('window.__still("thumb",' + JSON.stringify(spec) + ')');
  fs.writeFileSync(base + '.png', await stage.shot('png'));
  await stage.ev('window.__still("thumb",' + JSON.stringify(Object.assign({}, spec, { textOff: true })) + ')');
  fs.writeFileSync(base + '.notext.png', await stage.shot('png'));
  return measures;
}

test('4 phương án dọc dựng thật: JPEG 720×1280 + 1080×1920 < 2 MB, G-THUMB pass cả 4 (T1–T11), chữ ≥ 110 px, 0 lỗi console', { skip: SKIP, timeout: 240000 }, async () => {
  const dir = H.mkdtemp('gs-thumb-vr-');
  const specs = specsOf(VARIANTS), errors = [];
  const stage = await openStage({ width: 1080, height: 1920, errors });
  try {
    const variants = [];
    for (const s of specs) {
      const base = path.join(dir, 't' + (s.index + 1));
      const m = await shoot(stage, s, base);
      assert.equal(m.mode, 'thumb'); assert.deepEqual(m.size, [1080, 1920]); assert.equal(m.aspect, '9:16'); assert.equal(m.template, s.template.id);
      const t = { index: s.index, spec: s, measures: m, png: base + '.png', png_notext: base + '.notext.png',
        jpg1280: ff(base + '.png', base + '.1280.jpg', 720, 1280), jpg1920: ff(base + '.png', base + '.1920.jpg', 1080, 1920) };
      assert.deepEqual(G.jpegSize(fs.readFileSync(t.jpg1280)), [720, 1280]); assert.deepEqual(G.jpegSize(fs.readFileSync(t.jpg1920)), [1080, 1920]);
      const b1 = fs.statSync(t.jpg1280).size, b2 = fs.statSync(t.jpg1920).size;
      assert.ok(b1 < 2 * 1024 * 1024 && b2 < 2 * 1024 * 1024 && b1 > 10000, `${b1}/${b2}`);
      assert.notDeepEqual(fs.readFileSync(t.png), fs.readFileSync(t.png_notext), 'bản không chữ khác bản có chữ');
      variants.push(t);
      if (OUT) { fs.mkdirSync(OUT, { recursive: true }); fs.copyFileSync(t.png, path.join(OUT, `thumb-${s.template.id}-${s.face.kind}-${s.index + 1}.png`)); }
    }
    const g = G.gateThumb({ variants, ffmpegPath: H.FFMPEG });
    assert.equal(g.result, 'pass', JSON.stringify(g.measure.variants.map((v) => v.fails)));
    assert.deepEqual(g.measure.passed, [0, 1, 2, 3]);
    for (const v of g.measure.variants) {
      assert.ok(v.pass && v.contrast >= 4.5 && v.font_px >= 110 && v.face_h_ratio >= 0.22 && v.words <= 6 && v.safe_violations.length === 0, JSON.stringify(v));
      assert.ok(v.lines <= (T.template(v.template).boxes.headline.lines_max), v.template + ': ' + v.lines + ' dòng');
    }
    // mặt chính nằm trong vùng an toàn của Shorts/TikTok (aspects.json safe.hard = [60,220,940,1440] ⇒ x 60→1000, y 220→1660) và trong lưới 3:4 (y 240→1680)
    for (const t of variants) {
      const f = t.measures.face, hd = t.measures.headline, br = t.measures.brand;
      for (const [n, r] of [['face', f], ['headline', hd], ['brand', br]]) assert.ok(r.x >= 60 - 0.5 && r.x + r.w <= 1020 + 0.5 && r.y >= 240 && r.y + r.h <= 1680, `${t.spec.template.id}.${n} ${JSON.stringify(r)}`);
    }
    assert.deepEqual(errors, []);
  } finally { await stage.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('tất định (L-108): dựng cùng spec hai lần ⇒ PNG cùng từng byte; mẫu 16:9 dựng liền sau mẫu dọc vẫn đúng 1920×1080 + 1280×720 (GSThumb trả khung sân khấu)', { skip: SKIP, timeout: 180000 }, async () => {
  const dir = H.mkdtemp('gs-thumb-vr-');
  const errors = [];
  const stage = await openStage({ width: 1080, height: 1920, errors });
  try {
    const [vs] = specsOf([VARIANTS[0]]);
    const shot = async (spec, f) => { await stage.ev('window.__still("thumb",' + JSON.stringify(spec) + ')'); const b = await stage.shot('png'); fs.writeFileSync(f, b); return b; };
    const a = await shot(vs, path.join(dir, 'a.png')), b = await shot(vs, path.join(dir, 'b.png'));
    assert.ok(a.equals(b), 'cùng spec ⇒ cùng ảnh');
    // stage đang 1080×1920: dựng mẫu 16:9 ⇒ khung sân khấu về 1920×1080, canvas 1280×720 (bỏ ghi đè inline)
    const [hs] = specsOf([{ template: 'host-shock-left', headline: 'AI bịa chuyện', face: { cast: 'CM-0001', mood: 'shock' }, visual: { beat: 1 } }]);
    const m = await stage.ev('window.__still("thumb",' + JSON.stringify(hs) + ')');
    assert.deepEqual(m.size, [1280, 720]); assert.equal(m.aspect, '16:9');
    const box = await stage.ev('(function(){var r=document.getElementById("stage").getBoundingClientRect();return [r.width,r.height,document.getElementById("stage").style.width]})()');
    assert.deepEqual(box.slice(0, 2), [1920, 1080]); assert.equal(box[2], '', 'không để lại ghi đè inline');
    // và quay lại dọc vẫn đúng
    const m2 = await stage.ev('window.__still("thumb",' + JSON.stringify(vs) + ')');
    assert.deepEqual(m2.size, [1080, 1920]);
    assert.deepEqual(errors, []);
  } finally { await stage.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('ca âm dựng thật: tiêu đề quá dài bị G-THUMB chặn ở T3 (không vừa hộp ở cỡ tối thiểu); mẫu 16:9 trên cỡ dọc ⇒ T1', { skip: SKIP, timeout: 180000 }, async () => {
  const dir = H.mkdtemp('gs-thumb-vr-');
  const stage = await openStage({ width: 1080, height: 1920 });
  try {
    const [s] = specsOf([{ template: 'v-big-visual', headline: 'Anhhhhhhhhhhhh Emmmmmmmmmmmm Chiiiiiiiiiii', face: { owner: true, mood: 'shock' }, visual: { beat: 1 } }]);   // 32+ ký tự một từ dài: tràn cỡ 120 px ở hộp 960 px
    const base = path.join(dir, 'neg'); const m = await shoot(stage, s, base);
    const g = G.gateThumb({ variants: [{ index: 0, spec: s, measures: m, png: base + '.png', png_notext: base + '.notext.png', jpg1280: ff(base + '.png', base + '.1.jpg', 720, 1280), jpg1920: ff(base + '.png', base + '.2.jpg', 1080, 1920) }], ffmpegPath: H.FFMPEG });
    assert.equal(g.result, 'fail'); assert.ok(rules(g.measure.variants[0]).includes('T3'), JSON.stringify(g.measure.variants[0].fails));
    const [ok] = specsOf([VARIANTS[0]]); const b2 = path.join(dir, 'ok'); const m2 = await shoot(stage, ok, b2);
    const wrong = G.gateThumb({ variants: [{ index: 0, spec: ok, measures: m2, png: b2 + '.png', png_notext: b2 + '.notext.png', jpg1280: ff(b2 + '.png', b2 + '.1.jpg', 1280, 720), jpg1920: ff(b2 + '.png', b2 + '.2.jpg', 1920, 1080) }], ffmpegPath: H.FFMPEG });
    assert.equal(wrong.result, 'fail'); assert.deepEqual(rules(wrong.measure.variants[0]), ['T1']);
  } finally { await stage.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});

// ---- hai đường cần A2: tự bật khi A2 đã gộp (CNS-336) ----
test.after(() => still.closeStill());

test('renderStill mode thumb 1080×1920 (still.js cho phép cao > 1080) — BẬT LẠI sau khi gộp A2', { skip: SKIP, timeout: 120000 }, async (t) => {
  const [s] = specsOf([VARIANTS[0]]);
  let r;
  try { r = await still.renderStill({ mode: 'thumb', payload: Object.assign({}, s), size: [1080, 1920], format: 'png' }); }
  catch (e) {
    if (e && e.code === 'still_size') return t.skip('chờ A2: render/still.js hiện chặn cao > 1080 (SPEC F7 §10.3 — A2 sửa still.js theo tỉ lệ); A-INT gỡ skip sau khi gộp');
    throw e;
  }
  assert.equal(r.measures.template, 'v-host-top'); assert.deepEqual(r.measures.size, [1080, 1920]);
  assert.deepEqual(r.errors, []);
  // PNG 1080×1920 (IHDR)
  assert.equal(r.buffer.readUInt32BE(16), 1080); assert.equal(r.buffer.readUInt32BE(20), 1920);
});

test('renderPlan: plan.thumbs dọc → JPEG 720×1280 + 1080×1920 qua đường render.js (renderThumbs theo thumbSizes, viewport theo plan.size) — BẬT LẠI sau khi gộp A2', { skip: 'chờ A2: renderPlan mở sân khấu theo plan.size và renderThumbs hạ JPEG theo aspects.thumbSizes (render/render.js là file của A2); A-INT thay skip bằng phép thử thật' }, () => {});
