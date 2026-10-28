// © 2026 Gen Labs — All rights reserved.
// Gói T (SPEC-0.2.0 §5.12): dựng ảnh bìa THẬT bằng Chromium + ffmpeg — 4 mẫu ra JPEG 1280×720 + 1920×1080 qua G-THUMB; ca âm dựng thật bị cổng chặn; GSStill.thumb hiểu textOff; ảnh mặt chủ kênh
// (PNG có alpha) và khung giữ chỗ; tất định (F3-5); renderStill preview. Hàng loạt ca âm gộp trong MỘT phiên Chromium (renderPlan.thumbs) cho nhanh.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const T = require('../render/thumb.js');
const G = require('../media/gates/thumb.js');
const still = require('../render/still');
const { renderPlan, openStage } = require('../render/render');
const auth = require('../server/auth.js');
const cast = require('../render/cast');
const { createMcp } = require('../server/mcp.js');
const { tmpDb, owner } = require('./a-helpers');
const H = require('./g-thumb-helpers');

const SKIP = H.NO_BROWSER_OR_FFMPEG;
const clone = (o) => JSON.parse(JSON.stringify(o));
const rules = (v) => [...new Set(v.fails.map((f) => f.rule))];
const plan = H.fixturePlan(); plan.duration_ms = 600;   // vòng khung hình ngắn nhất; ảnh bìa dựng sau vòng đó trong cùng phiên Chromium

// thư mục kho asset giả: media/xx/<tên>.png (đường dẫn tương đối như kho thật)
function assetRoot() {
  const root = H.mkdtemp('gs-thumb-assets-');
  fs.mkdirSync(path.join(root, 'media', 'aa'), { recursive: true });
  fs.writeFileSync(path.join(root, 'media/aa/face.png'), H.ownerFacePng({ alpha: true }));
  fs.writeFileSync(path.join(root, 'media/aa/face-opaque.png'), H.ownerFacePng({ alpha: false }));
  return root;
}
const FACES = [{ asset: 'media/aa/face.png', mood: 'shock' }];
const specsOf = (variants, ctx) => T.resolveThumbs({ variants }, plan, Object.assign({ beatOrder: H.BEAT_ORDER, faces: FACES, channelName: 'Lớp AI Bình Dân' }, ctx));
async function renderSpecs(specs, root, dir) {
  const p = Object.assign({}, plan, { thumbs: specs, assetRefs: (plan.assetRefs || []).concat(T.assetRefsOf(specs)) });
  const r = await renderPlan({ plan: p, outDir: dir, assetRoot: root, ffmpegPath: H.FFMPEG });
  return r;
}
test.after(() => still.closeStill());

test('4 mẫu dựng thật: JPEG 1280×720 + 1920×1080 < 2 MB, G-THUMB pass cả 4 (T1–T11), mặt chủ kênh dùng ảnh PNG có alpha, 0 lỗi console', { skip: SKIP, timeout: 240000 }, async () => {
  const root = assetRoot(), dir = H.mkdtemp();
  try {
    const specs = specsOf(H.fourVariants().variants);
    assert.equal(specs[0].face.kind, 'owner');
    const r = await renderSpecs(specs, root, dir);
    assert.deepEqual(r.errors, []);
    assert.equal(r.thumbs.length, 4);
    for (const t of r.thumbs) {
      const j1 = fs.readFileSync(t.jpg1280), j2 = fs.readFileSync(t.jpg1920);
      assert.deepEqual(G.jpegSize(j1), [1280, 720]); assert.deepEqual(G.jpegSize(j2), [1920, 1080]);
      assert.ok(j1.length < 2 * 1024 * 1024 && j2.length < 2 * 1024 * 1024 && j1.length > 20000, `${j1.length}/${j2.length}`);
      assert.equal(t.measures.mode, 'thumb'); assert.equal(t.measures.stub, false); assert.equal(t.measures.template, specs[t.index].template.id);
      assert.notDeepEqual(fs.readFileSync(t.png), fs.readFileSync(t.png_notext), 'bản không chữ khác bản có chữ');
    }
    const g = G.gateThumb({ variants: r.thumbs, ffmpegPath: H.FFMPEG });
    assert.equal(g.result, 'pass', JSON.stringify(g.measure.variants.map((v) => v.fails)));
    assert.deepEqual(g.measure.passed, [0, 1, 2, 3]);
    for (const v of g.measure.variants) {
      assert.ok(v.pass && v.contrast >= 4.5 && v.font_px >= 100 && v.face_h_ratio >= 0.22 && v.words <= 6 && v.lines <= 2 && v.safe_violations.length === 0, JSON.stringify(v));
      assert.ok(v.score > 0.6 && v.score <= 1);
    }
    assert.equal(g.measure.variants[0].face, 'owner'); assert.equal(r.thumbs[0].measures.face.alpha, true, 'ảnh mặt có kênh alpha');
    assert.equal(g.measure.variants[1].min_diff_other >= 0.1, true);
    assert.match(g.measure.text_human, /^4\/4 phương án đạt · chữ \d+ px · tương phản [\d,]+:1$/);
    // F3-5: cùng đầu vào ⇒ ảnh bìa trùng byte
    const dir2 = H.mkdtemp();
    try {
      const r2 = await renderSpecs(specsOf(H.fourVariants().variants), root, dir2);
      r.thumbs.forEach((t, i) => { assert.ok(fs.readFileSync(t.jpg1280).equals(fs.readFileSync(r2.thumbs[i].jpg1280)), 'jpg1280 #' + i); assert.ok(fs.readFileSync(t.jpg1920).equals(fs.readFileSync(r2.thumbs[i].jpg1920)), 'jpg1920 #' + i); });
    } finally { fs.rmSync(dir2, { recursive: true, force: true }); }
  } finally { fs.rmSync(root, { recursive: true, force: true }); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('ca âm dựng thật (F3-2): mỗi phương án xấu bị G-THUMB chặn đúng mục T; bộ chỉ toàn xấu ⇒ fail', { skip: SKIP, timeout: 240000 }, async () => {
  const root = assetRoot(), dir = H.mkdtemp();
  try {
    const base = (extra) => Object.assign({ template: 'duo-versus', headline: 'Máy đoán chữ kế tiếp', face: { cast: 'CM-0001', mood: 'vow' }, sidekick: { cast: 'CM-0002', mood: 'panic' }, visual: { beat: 0 } }, extra);
    const specs = [];
    const add = (name, variant, mut) => { const s = specsOf([variant])[0]; if (mut) mut(s); specs.push(Object.assign(s, { _name: name })); };
    add('7 từ', base({ headline: 'a b c d e f g' }));
    add('chữ 80 px', base(), (s) => { s.template = clone(s.template); s.template.boxes.headline.font_px_min = 60; s.template.boxes.headline.font_px_max = 80; });
    add('vàng trên vàng', base(), (s) => { s.palette.text = '#FFE066'; s.palette.bg = '#FFD84A'; s.palette.hl = '#FFE066'; });
    add('mặt trong vùng thời lượng', base({ template: 'host-shock-left', face: { cast: 'CM-0001', mood: 'shock' } }), (s) => { s.template = clone(s.template); s.template.boxes.face = { x: 1010, y: 540, w: 222, h: 132, anchor: 'bottom', head_min_h: 160 }; });
    add('sidekick to hơn mặt chính', base(), (s) => { s.template = clone(s.template); s.template.boxes.face = { x: 0, y: 440, w: 280, h: 280, anchor: 'bottom', bleed: ['bottom', 'left'], head_min_h: 160 }; s.template.boxes.sidekick = { x: 420, y: 330, w: 420, h: 380, anchor: 'bottom', optional: true }; });
    add('ảnh owner không có alpha', base({ template: 'host-shock-left', face: { owner: true, mood: 'shock' }, sidekick: undefined }), (s) => { s.face.asset = 'media/aa/face-opaque.png'; });
    add('khung giữ chỗ (chưa có ảnh mặt)', base({ template: 'host-shock-left', face: { owner: true, mood: 'shock' } }), (s) => { s.face = { kind: 'placeholder', mood: 'shock', label: 'ẢNH MẶT CHỦ KÊNH' }; });
    specs.forEach((s, i) => { s.index = i; });
    const r = await renderSpecs(specs, root, dir);
    assert.deepEqual(r.errors, []);
    const g = G.gateThumb({ variants: r.thumbs, ffmpegPath: H.FFMPEG });
    const v = g.measure.variants;
    const want = { '7 từ': 'T3', 'chữ 80 px': 'T8', 'vàng trên vàng': 'T7', 'mặt trong vùng thời lượng': 'T9', 'sidekick to hơn mặt chính': 'T5', 'ảnh owner không có alpha': 'T5', 'khung giữ chỗ (chưa có ảnh mặt)': 'T5' };
    specs.forEach((s, i) => { assert.equal(v[i].pass, false, s._name); assert.ok(rules(v[i]).includes(want[s._name]), `${s._name}: ${rules(v[i])} ${JSON.stringify(v[i].fails)}`); });
    assert.equal(g.result, 'fail'); assert.deepEqual(g.measure.passed, []);
    assert.match(g.measure.text_human, /^Không phương án nào đạt: #1 T3/);
    assert.equal(r.thumbs[5].measures.face.alpha, false); assert.equal(r.thumbs[6].measures.face.kind, 'placeholder');
    assert.equal(v[1].font_px, 80); assert.ok(v[2].contrast < 1.5);
    // phương án trùng nhau ⇒ cái sau trượt T11, cái trước vẫn đạt (bộ có 1 phương án đạt ⇒ pass)
    const dup = specsOf([base(), base()]);
    const r2 = await renderSpecs(dup, root, H.mkdtemp());
    const g2 = G.gateThumb({ variants: r2.thumbs, ffmpegPath: H.FFMPEG });
    assert.equal(g2.result, 'pass'); assert.deepEqual(g2.measure.passed, [0]); assert.deepEqual(rules(g2.measure.variants[1]), ['T11']); assert.ok(g2.measure.variants[1].min_diff_other < 0.001);
  } finally { fs.rmSync(root, { recursive: true, force: true }); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('GSStill.thumb(textOff): bố cục giữ nguyên, chỉ lớp chữ (tiêu đề + nhãn phụ) biến mất; renderStill preview 640×360 JPEG ≤ 200 KB kèm số đo; ảnh mặt qua payload.assetRefs', { skip: SKIP, timeout: 120000 }, async () => {
  const root = assetRoot();
  try {
    const spec = specsOf([{ template: 'host-shock-left', headline: 'AI bịa chuyện thế nào?', highlight: 'bịa', kicker: 'SỰ THẬT', face: { owner: true, mood: 'shock' }, sidekick: { cast: 'CM-0002', mood: 'panic' }, visual: { beat: 1 } }])[0];
    const payload = Object.assign({}, spec, { assetRefs: T.assetRefsOf([spec]), fontCss: '' });
    const a = await still.renderStill({ mode: 'thumb', payload, size: [1280, 720], format: 'png', assetRoot: root });
    const b = await still.renderStill({ mode: 'thumb', payload: Object.assign({}, payload, { textOff: true }), size: [1280, 720], format: 'png', assetRoot: root });
    assert.deepEqual(a.errors, []); assert.deepEqual(b.errors, []);
    assert.equal(a.measures.face.kind, 'owner'); assert.equal(a.measures.face.alpha, true, 'asset qua assetRefs → assetData');
    assert.deepEqual(a.measures.headline, b.measures.headline, 'đo giống nhau dù ẩn chữ');
    const fa = fs.writeFileSync(path.join(root, 'a.png'), a.buffer) || path.join(root, 'a.png'), fb = fs.writeFileSync(path.join(root, 'b.png'), b.buffer) || path.join(root, 'b.png');
    const A = G.decodeRgb(fa, H.FFMPEG), B = G.decodeRgb(fb, H.FFMPEG);
    let minX = 1e9, minY = 1e9, maxX = -1, maxY = -1, n = 0;
    for (let i = 0; i < 1280 * 720; i++) { const o = i * 3; if (Math.abs(A[o] - B[o]) > 24 || Math.abs(A[o + 1] - B[o + 1]) > 24 || Math.abs(A[o + 2] - B[o + 2]) > 24) { n++; const x = i % 1280, y = (i / 1280) | 0; minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); } }
    assert.ok(n > 5000, 'có chữ để mất đi');
    const hb = spec.template.boxes.headline, kb = spec.template.boxes.kicker;
    assert.ok(minX >= kb.x - 6 && minY >= kb.y - 8 && maxX <= hb.x + hb.w + 12 && maxY <= hb.y + hb.h + 14, `chỉ vùng chữ khác: ${minX},${minY}-${maxX},${maxY}`);
    // preview 640×360 JPEG (kích thước tool render_still) — gọn ≤ 200 KB
    const pv = await still.renderStill({ mode: 'thumb', payload, size: [640, 360], format: 'jpeg', quality: 80, assetRoot: root });
    assert.deepEqual(G.jpegSize(pv.buffer), [640, 360]); assert.ok(pv.buffer.length <= 200 * 1024, String(pv.buffer.length));
    assert.equal(pv.measures.headline.font_px >= 100, true);
    // payload không phải đặc tả ⇒ lỗi rõ (không vẽ khung giả)
    await assert.rejects(still.renderStill({ mode: 'thumb', payload: { label: 'x' }, size: [320, 180] }), /đặc tả ảnh bìa/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('khung giữ chỗ khi chưa có mặt thật; ngân sách L-42: ≤ 2 nhân vật + 1 khối trong DOM ảnh bìa; chữ tự co nhưng không dưới font_px_min, vượt thì báo tràn', { skip: SKIP, timeout: 120000 }, async () => {
  const noCast = Object.assign({}, plan, { cast: {}, persona: {} });
  const ph = T.resolveThumbs({ variants: [{ template: 'host-shock-left', headline: 'Chào bạn', face: { owner: true, mood: 'shock' }, visual: { beat: 0 } }] }, noCast, { beatOrder: H.BEAT_ORDER })[0];
  assert.equal(ph.face.kind, 'placeholder');
  const stage = await openStage({});
  try {
    await stage.ev('window.__load(' + JSON.stringify(Object.assign({}, plan, { assetData: {}, fontCss: '' })) + ')');
    const m = await stage.ev('window.__still("thumb", ' + JSON.stringify(ph) + ')');
    assert.equal(m.face.kind, 'placeholder'); assert.match(await stage.ev('document.querySelector(".th-ph").textContent'), /ẢNH MẶT CHỦ KÊNH/);
    const spec = specsOf([{ template: 'host-shock-left', headline: 'AI bịa chuyện thế nào?', face: { cast: 'CM-0001', mood: 'shock' }, sidekick: { cast: 'CM-0002', mood: 'panic' }, visual: { beat: 1 } }])[0];
    const m2 = await stage.ev('window.__still("thumb", ' + JSON.stringify(spec) + ')');
    assert.equal(await stage.ev('document.querySelectorAll(".th-fig > svg").length'), 2, '1 mặt chính + 1 sidekick');
    assert.equal(await stage.ev('document.querySelectorAll(".th-card").length'), 1, '1 hình chủ đạo');
    assert.ok(m2.headline.font_px >= 100 && m2.headline.font_px <= 156 && m2.headline.overflow === false);
    // tiêu đề quá dài cho hộp ⇒ không co dưới font_px_min mà báo tràn (G-THUMB T3 chặn)
    const long = Object.assign({}, spec, { headline: 'aaaaaaaaaa bbbbbbbbbb cccccccccc dddddddddd' });
    const m3 = await stage.ev('window.__still("thumb", ' + JSON.stringify(long) + ')');
    assert.equal(m3.headline.font_px, 100); assert.equal(m3.headline.overflow, true);
    assert.deepEqual(stage.errors, []);
  } finally { await stage.close(); }
});

// ---- tool MCP preview_thumbnail: phân giải phương án từ bài + kênh rồi dựng qua renderStill (SPEC §5.6) ----
function previewSetup(deps) {
  const t = tmpDb(), o = owner(t.db), defs = cast.defaults().cast;
  const ch = t.write(o, 'channel.create', { name: 'Kênh xem trước' });   // kênh mới: bắt buộc ảnh bìa, chưa có ảnh mặt chủ kênh ⇒ face.owner rơi về KOL
  const m1 = t.write(o, 'cast.save', { channel: ch.display_id, name: 'Anh Gen', data: defs['CM-0001'] }), m2 = t.write(o, 'cast.save', { channel: ch.display_id, name: 'Bé Hỏi', data: defs['CM-0002'] });
  const th = { variants: [
    { template: 'host-shock-left', headline: 'AI bịa chuyện thế nào?', highlight: 'bịa', kicker: 'SỰ THẬT', face: { owner: true, mood: 'shock' }, sidekick: { cast: m2.display_id, mood: 'panic' }, visual: { beat: 1 } },
    { template: 'duo-versus', headline: 'Máy đoán chữ kế tiếp', face: { cast: m1.display_id, mood: 'vow' }, sidekick: { cast: m2.display_id, mood: 'panic' }, visual: { beat: 0 } }] };
  const sub = t.write(o, 'lesson.submit', { channel: ch.display_id, title: 'Vì sao A.I. sai?', thumbnail: th,
    lines: [{ who: m2.display_id, say: 'Sao máy sai ạ?' }, { who: m1.display_id, say: 'Vì máy chỉ đoán.' }],
    beats: [{ block: 'title', anchor: { line: 0, word: 'Sao' }, params: { text: 'Vì sao A.I. sai?' } }, { block: 'stamp', anchor: { line: 1, word: 'đoán' }, params: { text: 'ĐOÁN ≠ BIẾT', sub: '' } }] });
  const mcp = createMcp({ db: t.db, write: t.write, config: { version: 't', dataDir: t.dir, ffmpegPath: H.FFMPEG || 'ffmpeg', chromiumPath: null }, deps });
  const mk = (scopes) => auth.verifyAgentToken(t.db, t.write(o, 'agent.create', { name: 'A' + scopes.join(''), scopes }).token);
  const call = async (c, name, args) => (await mcp.handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args || {} } }, c)).result;
  return { t, lesson: sub.lesson.display_id, mk, call };
}

test('preview_thumbnail: phân giải phương án từ bài + kênh, JPEG 640×360 ≤ 200 KB + số đo G-THUMB; KOL host_lead thay ảnh mặt chủ kênh khi chưa có (kèm lưu ý); tham số sai ⇒ lỗi', { skip: SKIP, timeout: 180000 }, async () => {
  const s = previewSetup();
  try {
    const c = s.mk(['read', 'compose']);
    const r = await s.call(c, 'preview_thumbnail', { lesson: s.lesson, variant: 0 });
    assert.ok(!r.isError, r.content[0].text);
    const img = r.content.find((x) => x.type === 'image'); assert.ok(img, 'ảnh trả về dạng MCP image');
    const buf = Buffer.from(img.data, 'base64');
    assert.deepEqual(G.jpegSize(buf), [640, 360]); assert.ok(buf.length <= 200 * 1024 && buf.length > 5000, String(buf.length));
    assert.equal(r.structuredContent.result, 'pass', JSON.stringify(r.structuredContent.measure && r.structuredContent.measure.fails));
    assert.equal(r.structuredContent.measure.index, 0); assert.equal(r.structuredContent.measure.face, 'cast'); assert.match(r.content[0].text, /Phương án đạt G-THUMB/);
    assert.match(r.content[0].text, /Kênh chưa có ảnh mặt chủ kênh/);
    const r2 = await s.call(c, 'preview_thumbnail', { lesson: s.lesson, spec: { template: 'big-visual', headline: 'a b c d e f g', face: { cast: 'CM-0001', mood: 'shock' }, visual: { beat: 1 } } });
    assert.ok(!r2.isError); assert.equal(r2.structuredContent.result, 'fail'); assert.match(r2.content[0].text, /TRƯỢT G-THUMB: T3/);
    for (const bad of [{ lesson: s.lesson, variant: 5 }, { lesson: s.lesson, variant: -1 }, { lesson: 'LS-9999' }, { lesson: s.lesson, version: 9 }, { lesson: s.lesson, spec: [] },
      { lesson: s.lesson, spec: { template: 'big-visual', headline: 'Chào', face: { cast: 'CM-0777', mood: 'shock' }, visual: { beat: 0 } } },
      { lesson: s.lesson, spec: { template: 'big-visual', headline: 'Chào', face: { cast: 'CM-0001', mood: 'shock' }, visual: { beat: 9 } } }]) {
      assert.equal((await s.call(c, 'preview_thumbnail', bad)).isError, true, JSON.stringify(bad));
    }
    assert.equal((await s.call(s.mk(['read']), 'preview_thumbnail', { lesson: s.lesson })).isError, true, 'chỉ đọc ✗');
  } finally { await still.closeStill(); s.t.clean(); }
});

test('preview_thumbnail: giới hạn 6 lần/phút/agent (hàng đợi still dùng chung); lỗi từ hàng đợi đổi thành mã rõ', { skip: H.FFMPEG ? false : 'không có ffmpeg', timeout: 60000 }, async () => {
  const png = H.encodePng(H.canvas(64, 36, [30, 40, 90, 255]), { opaque: true });
  let n = 0;
  const stub = { async renderStill(o) { n++; fs.writeFileSync(o.outFile, png); return { file: o.outFile, buffer: png, measures: {}, errors: [], elapsed_ms: 1 }; } };
  const s = previewSetup({ still: stub });
  try {
    const c = s.mk(['read', 'compose']);
    for (let i = 0; i < 6; i++) { const r = await s.call(c, 'preview_thumbnail', { lesson: s.lesson, variant: 1 }); assert.ok(!r.isError, r.content[0].text); }
    const r7 = await s.call(c, 'preview_thumbnail', { lesson: s.lesson, variant: 1 });
    assert.equal(r7.isError, true); assert.match(r7.content[0].text, /rate_limited/); assert.equal(n, 12, '2 still mỗi lần, lần thứ 7 không dựng gì');
    const other = s.mk(['read', 'compose']);   // agent khác có hạn mức riêng
    assert.ok(!(await s.call(other, 'preview_thumbnail', { lesson: s.lesson, variant: 1 })).isError);
    const full = { async renderStill() { throw Object.assign(new Error('đầy'), { code: 'still_queue_full' }); } };
    const s2 = previewSetup({ still: full });
    try { const r = await s2.call(s2.mk(['read', 'compose']), 'preview_thumbnail', { lesson: s2.lesson }); assert.equal(r.isError, true); assert.match(r.content[0].text, /rate_limited/); } finally { s2.t.clean(); }
  } finally { s.t.clean(); }
});
