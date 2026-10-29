// © 2026 Gen Labs — All rights reserved.
// Golden 16:9 (SPEC-0.2.0-F7 §3.7, chỉ số M14): khoá plan / manifest / DOM sân khấu của bài 16:9 TRƯỚC khi F7 đổi engine, để mọi gói A giữ 16:9 trùng byte.
//   node tools/golden-16x9.js --check        so với test/fixtures/golden-16x9.json (thoát 1 nếu lệch, in khoá lệch)
//   node tools/golden-16x9.js --write        ghi lại fixture — CHỈ khi đổi 16:9 có chủ đích và đã được duyệt (ghi lý do vào commit)
//   thêm --no-dom (bỏ phần Chromium) · --dump <thư mục> (ghi toàn văn plan/manifest/DOM để diff khi lệch)
// Khoá gì: sha256 của JSON.stringify(plan) cho 3 bài mẫu (bài thường · bài có brand + ảnh bìa · tutorial), mỗi bài dựng 2 lần (không truyền `aspect` và `aspect:'16:9'`)
//   phải ra CÙNG hash; sha256 manifest (bỏ khoá `engine` — môi trường chạy, pipeline cũng bỏ khi so) cho bài thường + bài brand, lv.aspect thiếu/NULL/'16:9' cùng hash;
//   chuỗi `#stage.outerHTML` sau `__seek` ở 3 mốc (Chromium thật) cho bài thường và bài thường có brand, kèm tập quy tắc CSS đang khớp phần tử sân khấu
//   (css_sha256 — chặn sửa quy tắc 16:9 trong style.css/tutorial.css). DOM/CSS là chuỗi, không chụp ảnh ⇒ không phụ thuộc rasterizer (L-108 chỉ cần khi có ảnh);
//   bài DOM không dùng khối đo chữ bằng phông (prob-card đặt `left` theo offsetWidth ⇒ lệch theo phông máy) — prob-card nằm trong golden plan.
// Dữ liệu vào nằm NGAY trong file này (không đọc agent/samples) để mẫu khác đổi không làm trôi golden.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const Module = require('node:module');

const ROOT = path.join(__dirname, '..');
const FIXTURE = path.join(ROOT, 'test', 'fixtures', 'golden-16x9.json');
const { buildPlan } = require('../render/engine/timeline');
const brandMod = require('../render/brand');
const thumbMod = require('../render/thumb');
const castMod = require('../render/cast');
const registry = require('../render/blocks/registry');

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const rec = (s) => ({ sha256: sha(s), bytes: Buffer.byteLength(s) });
const clone = (v) => JSON.parse(JSON.stringify(v));

// ---------- dữ liệu vào ----------
// clip giọng tất định: 280 ms/chữ + 40 ms nghỉ, envelope cố định (không phụ thuộc TTS)
function clipsOf(lines) {
  const out = {};
  lines.forEach((l) => {
    const toks = l.say.split(/\s+/).filter(Boolean), dur = toks.length * 320 + 200;
    out[l.id] = { duration_ms: dur, word_times: toks.map((w, i) => ({ w, t0: i * 320, t1: i * 320 + 280 })), envelope: Array.from({ length: Math.ceil(dur / 1000 * 30) }, (_, i) => +(0.3 + 0.4 * Math.abs(Math.sin(i * 0.7))).toFixed(3)) };
  });
  return out;
}
const LINES = [
  { id: 'LN-0001', who: 'CM-0002', say: 'Anh Gen ơi, sao A.I. nói sai mà vẫn tự tin thế ạ?', terms: ['A.I.'], subtitle: { en: 'Gen, why does A.I. sound so sure when it is wrong?' }, mood: 'unsure' },
  { id: 'LN-0002', who: 'CM-0001', say: 'Vì mô hình chỉ đoán từ tiếp theo, gọi là next token, dựa trên xác suất.', terms: ['next token'], subtitle: { en: 'Because the model only guesses the next token by probability.' }, mood: 'calm' },
  { id: 'LN-0003', who: 'CM-0002', say: 'Vậy câu nào quen thì nó đoán rất chắc ạ?', terms: [], subtitle: { en: 'So familiar sentences get very confident guesses?' } },
  { id: 'LN-0004', who: 'CM-0001', say: 'Đúng rồi, đoán chắc không có nghĩa là biết. Nhớ kiểm tra lại nhé!', terms: [], subtitle: { en: 'Right, a confident guess is not knowing. Always double-check!' }, mood: 'happy' },
];
// bài thường: không prob-card (xem đầu file) — title, concept-chip, token-row (xếp chồng), stamp, takeaway + lesson-map/end-card tự thêm
const BEATS_PLAIN = [
  { id: 'BT-0001', block: 'title', anchor: { line: 'LN-0001', word: 'A.I.' }, params: { text: 'Vì sao A.I. sai mà vẫn tự tin?', highlight: ['A.I.'] } },
  { id: 'BT-0002', block: 'concept-chip', anchor: { line: 'LN-0002', word: 'đoán' }, params: { text: 'next token', sub: 'đoán chữ tiếp theo' } },
  { id: 'BT-0003', block: 'token-row', anchor: { line: 'LN-0002', word: 'xác' }, params: { tokens: ['Thủ', 'đô', 'của', 'Việt', 'Nam', 'là'], next: 'Hà Nội' } },
  { id: 'BT-0004', block: 'stamp', anchor: { line: 'LN-0003', word: 'chắc' }, params: { text: 'Chắc ≠ Đúng', sub: 'quen thì đoán chắc' } },
  { id: 'BT-0005', block: 'takeaway', anchor: { line: 'LN-0004', word: 'Nhớ' }, params: { kind: 'eq', text: 'Đoán ≠ Biết', sub: 'luôn kiểm tra lại' } },
];
// bài có brand + ảnh bìa: thêm prob-card nối tiếp prob-card (morph) + illustration (đường asset) — chỉ golden plan
const BEATS_BRAND = [
  { id: 'BT-0001', block: 'title', anchor: { line: 'LN-0001', word: 'A.I.' }, params: { text: 'Vì sao A.I. sai mà vẫn tự tin?', highlight: ['A.I.'] } },
  { id: 'BT-0002', block: 'prob-card', anchor: { line: 'LN-0002', word: 'đoán' }, params: { prompt: 'Thủ đô của Việt Nam là', options: [['Hà Nội', 92], ['Huế', 5], ['Đà Nẵng', 3]], pick: 0, chip: 'xác suất' } },
  { id: 'BT-0003', block: 'prob-card', anchor: { line: 'LN-0003', word: 'quen' }, params: { prompt: 'Thủ đô của Úc là', options: [['Sydney', 55], ['Canberra', 40], ['Melbourne', 5]], pick: 0 } },
  { id: 'BT-0004', block: 'illustration', anchor: { line: 'LN-0004', word: 'đoán' }, params: { asset: 'media/aa/golden-illustration.svg', caption: 'Bộ não đoán chữ' } },
  { id: 'BT-0005', block: 'takeaway', anchor: { line: 'LN-0004', word: 'Nhớ' }, params: { kind: 'habit', text: 'Hỏi lại nguồn trước khi tin câu trả lời chắc nịch' } },
];
const BRAND_DATA = { brand: { preset: 'console', logo: { asset: 'AS-0007', corner: 'br' }, lower_third: { enabled: true }, intro: { enabled: true, kind: 'title-wipe', duration_ms: 1200 }, subtitle: { plate: 'card' }, end_card: { cta: 'Theo dõi kênh' } } };
const LOGO_REF = 'media/ab/golden-logo.png';   // hook plan.after của gói B (server/ops/brand.js) gắn logo.ref = đường dẫn asset
const LOGO_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const THUMBNAIL = { variants: [
  { template: 'host-shock-left', headline: 'AI sai mà tự tin?', highlight: 'sai', kicker: 'SỰ THẬT', face: { owner: true, mood: 'shock' }, sidekick: { cast: 'CM-0002', mood: 'panic' }, visual: { beat: 1 } },
  { template: 'duo-versus', headline: 'Đoán chứ không biết', highlight: 'Đoán', face: { cast: 'CM-0001', mood: 'smug' }, sidekick: { cast: 'CM-0002', mood: 'shock' }, visual: { beat: 2 } },
  { template: 'big-visual', headline: 'Hà Nội chiếm 92%', highlight: '92%', kicker: 'SỐ LIỆU', face: { cast: 'CM-0002', mood: 'excited' }, visual: { beat: 1 } },
] };
const CHANNEL = { id: 'CH-0001', name: 'Lớp AI Bình Dân' };
const MOCK = { w: 1280, h: 800, theme: 'console-dark', root: { type: 'window', children: [
  { type: 'sidebar', title: 'Gen-Studio', items: [{ id: 'nav_home', label: 'Tổng quan' }, { id: 'nav_channels', label: 'Kênh' }], active: 0 },
  { type: 'col', gap: 16, children: [
    { type: 'topbar', title: 'Kênh mới', children: [{ type: 'button', id: 'btn_ok', label: 'Lưu', variant: 'primary' }] },
    { type: 'input', id: 'in_name', label: 'Tên kênh', placeholder: 'VD: Lớp AI' },
    { type: 'toggle', id: 'tg_on', label: 'Bật lịch' }] }] } };
const TUT_LINES = [
  { id: 'LN-0001', who: 'CM-0001', say: 'Chào các bạn, hôm nay mình tạo một kênh mới trong xưởng.' },
  { id: 'LN-0002', who: 'CM-0001', say: 'Gõ tên kênh rồi bấm Lưu, thế là học xong bước đầu tiên.' },
];

// aspect: undefined ⇒ không truyền khoá (bài cũ) · '16:9' ⇒ truyền rõ (bài mới sau F7)
function inputPlain(aspect) {
  const o = { lesson: { title: 'Vì sao A.I. sai mà vẫn tự tin?', lines: clone(LINES), beats: clone(BEATS_PLAIN), camera_hints: null, kind: 'lesson' }, clips: clipsOf(LINES),
    channel: clone(CHANNEL), fps: 30, kind: 'lesson', brand: null, assetRefs: [] };
  if (aspect !== undefined) o.aspect = aspect;
  return o;
}
function inputBrand(aspect) {
  const o = { lesson: { title: 'Vì sao A.I. sai mà vẫn tự tin?', lines: clone(LINES), beats: clone(BEATS_BRAND), camera_hints: [{ beat: 'BT-0004', zoom: 0.9 }], kind: 'lesson', thumbnail: clone(THUMBNAIL) }, clips: clipsOf(LINES),
    channel: Object.assign(clone(CHANNEL), BRAND_DATA), fps: 30, kind: 'lesson', brand: brandMod.normalize(BRAND_DATA), persona: { 'CM-0001': { role: 'host_lead' } },
    assetRefs: [{ asset: 'media/aa/golden-illustration.svg', label: 'illustration BT-0004' }] };
  if (aspect !== undefined) o.aspect = aspect;
  return o;
}
function inputTutorial(aspect) {
  const o = { kind: 'tutorial', variant: 'full', clips: clipsOf(TUT_LINES), cast: { 'CM-0001': { name: 'Vy' } }, fps: 30,
    lesson: { title: 'Tạo kênh đầu tiên', kind: 'tutorial', variant: 'full', lines: clone(TUT_LINES), host: { cast: 'CM-0001', mode: 'pip' },
      screens: [{ id: 'SC-1', source: { mock: MOCK }, chrome: 'browser', url_label: 'localhost:7490' }],
      beats: [{ id: 'BT-0001', block: 'screen', anchor: { line: 'LN-0001', word: 'các' }, params: { screen: 'SC-1' } },
        { id: 'BT-0002', block: 'cursor', anchor: { line: 'LN-0002', word: 'bấm' }, params: { action: 'click', target: 'btn_ok' } }] } };
  if (aspect !== undefined) o.aspect = aspect;
  return o;
}
// mô phỏng đúng hook plan.after của gói B (logo.ref) và gói T (plan.thumbs = resolveThumbs) như pipeline chạy
function afterBrand(plan) {
  plan.style.brand = Object.assign({}, plan.style.brand, { logo: Object.assign({}, plan.style.brand.logo, { ref: LOGO_REF }) });
  plan.assetRefs = plan.assetRefs.concat([{ asset: LOGO_REF, label: 'logo kênh', maxPx: [512, 512] }]);
  const order = BEATS_BRAND.map((b) => b.id);
  plan.thumbs = thumbMod.resolveThumbs(THUMBNAIL, plan, { beatOrder: order, channelName: CHANNEL.name });
  return plan;
}
const PLANS = {
  lesson: (a) => buildPlan(inputPlain(a)),
  lesson_brand_thumb: (a) => afterBrand(buildPlan(inputBrand(a))),
  tutorial: (a) => buildPlan(inputTutorial(a)),
};

// ---------- manifest: buildManifest thật của server/pipeline.js (hàm nội bộ — biên dịch lại module kèm một dòng export, không sửa pipeline.js) ----------
let _bm = null;
function buildManifestFn() {
  if (_bm) return _bm;
  const file = path.join(ROOT, 'server', 'pipeline.js');
  const m = new Module(file, module); m.filename = file; m.paths = Module._nodeModulePaths(path.dirname(file));
  m._compile(fs.readFileSync(file, 'utf8') + '\n;module.exports.__goldenBuildManifest = buildManifest;\n', file);
  _bm = m.exports.__goldenBuildManifest;
  if (typeof _bm !== 'function') throw new Error('server/pipeline.js không còn hàm buildManifest');
  return _bm;
}
function manifestOf(plan, beatsIn, lvAspect, brand) {
  const B = {
    lesson: { display_id: 'LS-0001', title: 'Vì sao A.I. sai mà vẫn tự tin?' },
    lv: Object.assign({ version: 2, kind: 'lesson' }, lvAspect === undefined ? {} : { aspect: lvAspect }),
    channel: { display_id: CHANNEL.id, name: CHANNEL.name, current_version: 3 },
    lines: LINES.map((l) => ({ display_id: l.id, cast: { display_id: l.who, current_version: l.who === 'CM-0001' ? 4 : 2 }, cast_version: l.who === 'CM-0001' ? 4 : undefined })),
    beats: beatsIn.map((b) => ({ display_id: b.id, block_type: b.block, block_version: registry.get(b.block).version })),
  };
  const items = LINES.map((l, i) => ({ l: { display_id: l.id }, clip: { display_id: 'VC-' + String(i + 11).padStart(4, '0') } }));
  const ctx = { config: { version: '0.0.0-golden', chromiumPath: null, ffmpegPath: 'ffmpeg' }, _ffv: 'ffmpeg golden' };
  const tts = { vendor: 'gemini', model: 'gemini-tts-golden' }, judge = { vendor: 'gemini', model: 'gemini-judge-golden' };
  const man = buildManifestFn()(ctx, B, items, plan, tts, judge, registry, { brand, lib: castMod.library(), brandMod });
  delete man.engine;   // môi trường chạy (phiên bản app, Chromium, ffmpeg) — pipeline cũng bỏ khoá này khi so manifest đóng băng
  return man;
}

// ---------- DOM sân khấu (Chromium thật) ----------
function domPlans() {
  const plain = buildPlan(inputPlain());
  const branded = buildPlan(Object.assign(inputPlain(), { channel: Object.assign(clone(CHANNEL), BRAND_DATA), brand: brandMod.normalize(BRAND_DATA) }));
  branded.style.brand = Object.assign({}, branded.style.brand, { logo: Object.assign({}, branded.style.brand.logo, { ref: LOGO_REF }) });
  return { lesson: { plan: plain, assetData: {} }, lesson_brand: { plan: branded, assetData: { [LOGO_REF]: LOGO_PNG } } };
}
// quy tắc CSS khớp với phần tử của sân khấu (không tính phần tử trong SVG nhân vật), theo thứ tự stylesheet: sửa một quy tắc 16:9 đang áp, hoặc thêm quy tắc mới
// trúng phần tử 16:9 ⇒ chuỗi đổi; quy tắc chỉ cho `.stage.lay …` (F7, §4.3) không khớp phần tử 16:9 ⇒ không đổi. Không dùng getComputedStyle (vị trí tự động phụ thuộc phông máy).
// stylesheet file:// không đọc được cssRules (khác origin) ⇒ đọc chính các tệp CSS mà stage.html nạp, dựng lại bằng CSSStyleSheet trong trang rồi so khớp.
function cssRulesExpr() {
  const html = fs.readFileSync(path.join(ROOT, 'render', 'stage', 'stage.html'), 'utf8');
  const files = [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)].map((m) => m[1]);
  const texts = files.map((f) => ({ f, css: fs.readFileSync(path.join(ROOT, 'render', 'stage', f), 'utf8') }));
  return `(function (texts) {
  var els = [document.documentElement, document.body, document.getElementById('stage')].concat([].slice.call(document.querySelectorAll('#stage *')).filter(function (e) { return !(e instanceof SVGElement); }));
  var out = [];
  var walk = function (rules, pre) {
    [].forEach.call(rules, function (r) {
      if (r.cssRules && !r.selectorText) return walk(r.cssRules, pre + (r.conditionText ? '@' + r.conditionText + ' ' : ''));
      if (!r.selectorText) return;
      var hit = false; try { hit = els.some(function (e) { return e.matches(r.selectorText); }); } catch (x) { hit = false; }
      if (hit) out.push(pre + r.cssText);
    });
  };
  texts.forEach(function (t) { var sh = new CSSStyleSheet(); sh.replaceSync(t.css); walk(sh.cssRules, t.f + ' '); });
  [].forEach.call(document.querySelectorAll('style'), function (st) { if (st.sheet) walk(st.sheet.cssRules, '<style> '); });
  return out.join('\\n');
})(${JSON.stringify(texts)})`;
}
// 3 mốc: khung đầu đã lắng · giữa bài · thẻ kết — suy từ plan (plan trùng byte ⇒ mốc trùng)
const domTimes = (plan) => [Math.round(plan.duration_ms * 0.2), Math.round(plan.duration_ms * 0.55), plan.duration_ms - 200];
async function domOf(opts) {
  const { openStage } = require('../render/render');
  const out = {}, errors = [];
  const stage = await openStage({ chromiumPath: opts && opts.chromiumPath, width: 1920, height: 1080, errors }), cssExpr = cssRulesExpr();
  try {
    const v = await stage.client.send('Browser.getVersion');
    Object.defineProperty(out, '_chromium', { value: String(v.product || '').replace(/^.*\//, ''), enumerable: false });
    for (const [name, d] of Object.entries(domPlans())) {
      await stage.ev('window.__load(' + JSON.stringify(Object.assign({}, d.plan, { assetData: d.assetData, fontCss: '' })) + ')');
      out[name] = [];
      for (const t of domTimes(d.plan)) {
        await stage.ev('window.__seek(' + t + ')');
        out[name].push({ t, html: await stage.ev('document.getElementById("stage").outerHTML'), css: await stage.ev(cssExpr) });
      }
    }
  } finally { await stage.close(); }
  if (errors.length) throw new Error('sân khấu báo lỗi khi dựng golden: ' + errors.join(' | '));
  return out;
}

// ---------- tính toàn bộ ----------
// → {golden (đúng lược đồ fixture), full (toàn văn để dump), problems: [chuỗi] (bất biến nội bộ: aspect thiếu ≡ '16:9')}
async function compute(opts) {
  opts = opts || {};
  const golden = { plans: {}, camera_plan_hash: {}, manifests: {} }, full = { plans: {}, manifests: {}, dom: {} }, problems = [];
  for (const [name, fn] of Object.entries(PLANS)) {
    const a = JSON.stringify(fn()), b = JSON.stringify(fn('16:9'));
    if (a !== b) problems.push(`plan ${name}: truyền aspect:'16:9' ra plan khác bài không truyền aspect`);
    golden.plans[name] = rec(a); full.plans[name] = JSON.parse(a);
    golden.camera_plan_hash[name] = sha(JSON.stringify(JSON.parse(a).camera || []));
  }
  const mans = { lesson: [PLANS.lesson, BEATS_PLAIN, null], lesson_brand_thumb: [PLANS.lesson_brand_thumb, BEATS_BRAND, brandMod.normalize(BRAND_DATA)] };
  for (const [name, [fn, beats, brand]] of Object.entries(mans)) {
    const plan = fn(), s = JSON.stringify(manifestOf(plan, beats, undefined, brand));
    for (const lva of [null, '16:9']) if (JSON.stringify(manifestOf(plan, beats, lva, brand)) !== s) problems.push(`manifest ${name}: lv.aspect=${JSON.stringify(lva)} ra manifest khác bài cũ`);
    golden.manifests[name] = rec(s); full.manifests[name] = JSON.parse(s);
  }
  if (opts.dom !== false) {
    golden.dom = {};
    const dom = await domOf(opts);
    golden._chromium = dom._chromium;   // bản Chromium ghi DOM (thông tin; DOM chỉ so chặt khi cùng bản chính — test/h-aspect-golden.test.js)
    for (const [name, shots] of Object.entries(dom)) {
      golden.dom[name] = shots.map((x) => Object.assign({ t: x.t }, rec(x.html), { css_sha256: sha(x.css), css_rules: x.css ? x.css.split('\n').length : 0 }));
      full.dom[name] = shots;
    }
  }
  return { golden, full, problems };
}

// so khớp → [chuỗi khác biệt]; phần nào `actual` không có (vd --no-dom) thì bỏ qua
function diff(expected, actual) {
  const out = [];
  const walk = (e, a, p) => {
    if (a === undefined) return;
    if (e === null || typeof e !== 'object') { if (JSON.stringify(e) !== JSON.stringify(a)) out.push(`${p}: golden ${JSON.stringify(e)} ≠ hiện tại ${JSON.stringify(a)}`); return; }
    for (const k of Object.keys(e)) if (k[0] !== '_') walk(e[k], a && a[k], p ? p + '.' + k : k);
    if (a && typeof a === 'object') for (const k of Object.keys(a)) if (k[0] !== '_' && !(k in e)) out.push(`${p ? p + '.' : ''}${k}: có ở hiện tại, thiếu trong golden`);
  };
  walk(expected, actual, '');
  return out;
}
function readFixture() { return JSON.parse(fs.readFileSync(FIXTURE, 'utf8')); }

const DOC = 'Golden 16:9 (SPEC-0.2.0-F7 §3.7, M14) do tools/golden-16x9.js --write ghi trên mã CHƯA có F7. Mọi gói F7 phải giữ khớp (test/h-aspect-golden.test.js). Không ghi lại để "cho xanh": chỉ ghi lại khi đổi 16:9 có chủ đích đã được duyệt, nêu lý do trong commit.';
async function main(argv) {
  const has = (f) => argv.includes(f), di = argv.indexOf('--dump');
  const dom = !has('--no-dom');
  const { golden, full, problems } = await compute({ dom });
  if (di >= 0 && argv[di + 1]) {
    const dir = path.resolve(argv[di + 1]); fs.mkdirSync(dir, { recursive: true });
    for (const [k, v] of Object.entries(full.plans)) fs.writeFileSync(path.join(dir, 'plan.' + k + '.json'), JSON.stringify(v, null, 1));
    for (const [k, v] of Object.entries(full.manifests)) fs.writeFileSync(path.join(dir, 'manifest.' + k + '.json'), JSON.stringify(v, null, 1));
    for (const [k, shots] of Object.entries(full.dom)) shots.forEach((s, i) => { fs.writeFileSync(path.join(dir, 'dom.' + k + '.' + i + '.html'), s.html); fs.writeFileSync(path.join(dir, 'css.' + k + '.' + i + '.css'), s.css); });
    console.log('đã ghi toàn văn vào ' + dir);
  }
  if (problems.length) { console.error('✗ bất biến 16:9 hỏng:\n  ' + problems.join('\n  ')); return 1; }
  if (has('--write')) {
    if (!dom) { console.error('--write cần cả phần DOM (bỏ --no-dom)'); return 2; }
    const base = require('node:child_process').spawnSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).stdout.trim() || 'unknown';
    fs.writeFileSync(FIXTURE, JSON.stringify(Object.assign({ _doc: DOC, base }, golden), null, 2) + '\n');
    console.log('đã ghi ' + path.relative(ROOT, FIXTURE) + ' (gốc ' + base + ')');
    return 0;
  }
  const d = diff(readFixture(), golden);
  if (d.length) { console.error('✗ 16:9 lệch golden (M14):\n  ' + d.join('\n  ') + '\n  Soi: node tools/golden-16x9.js --dump /tmp/g (chạy ở nhánh gốc và nhánh này rồi diff).'); return 1; }
  console.log('✓ 16:9 khớp golden' + (dom ? '' : ' (bỏ DOM)'));
  return 0;
}

module.exports = { compute, diff, readFixture, FIXTURE, PLANS, domTimes };
if (require.main === module) main(process.argv.slice(2)).then((c) => process.exit(c), (e) => { console.error(e && e.stack || e); process.exit(1); });
