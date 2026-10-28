// © 2026 Gen Labs — All rights reserved.
// Gói B (F2) — dựng hình THẬT bằng Chromium: màu brand được áp, viền nhân vật thay bằng brand.tokens.ink (F2-8), hai brand khác nhau ⇒ ≥ 30 % điểm ảnh khác ở cả 3 mốc,
// cùng brand ⇒ trùng điểm ảnh (F2-2), logo/lower-third/intro, xem trước dùng được khi render_still gửi brand thô, đường renderPlan (video) mang logo + intro, kênh không brand không đổi.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const chromium = require('../render/chromium');
const still = require('../render/still');
const { renderPlan, openStage } = require('../render/render');
const { buildPlan } = require('../render/engine/timeline');
const brand = require('../render/brand');
const { samplePlan } = require('../server/routes/preview.js');

const HAS = chromium.find() ? false : 'không có Chromium';
test.after(() => still.closeStill());

// ---- giải mã PNG (RGB/RGBA 8 bit, không xen kẽ) để đếm điểm ảnh — không phụ thuộc thư viện ----
function decodePng(buf) {
  let p = 8, w = 0, h = 0, ct = 0; const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), type = buf.subarray(p + 4, p + 8).toString(), data = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); ct = data[9]; assert.equal(data[8], 8); assert.equal(data[12], 0, 'không xen kẽ'); }
    if (type === 'IDAT') idat.push(data);
    p += 12 + len;
  }
  const bpp = ct === 6 ? 4 : 3, raw = zlib.inflateSync(Buffer.concat(idat)), stride = w * bpp, out = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[y * stride + x - bpp] : 0, b = y ? out[(y - 1) * stride + x] : 0, c = x >= bpp && y ? out[(y - 1) * stride + x - bpp] : 0;
      let v = src[x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      out[y * stride + x] = v & 255;
    }
  }
  return { w, h, bpp, px: out };
}
const rgbAt = (im, x, y) => { const i = (y * im.w + x) * im.bpp; return [im.px[i], im.px[i + 1], im.px[i + 2]]; };
const hex = (c) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();
const near = (a, b, d = 6) => Math.abs(a[0] - b[0]) <= d && Math.abs(a[1] - b[1]) <= d && Math.abs(a[2] - b[2]) <= d;
function count(im, rgb, box, d) { let n = 0; const [x0, y0, x1, y1] = box || [0, 0, im.w, im.h]; for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (near(rgbAt(im, x, y), rgb, d === undefined ? 6 : d)) n++; return n; }
function diffRatio(a, b) { let n = 0; for (let i = 0; i < a.w * a.h; i++) { const j = i * a.bpp; if (Math.abs(a.px[j] - b.px[j]) + Math.abs(a.px[j + 1] - b.px[j + 1]) + Math.abs(a.px[j + 2] - b.px[j + 2]) > 0) n++; } return n / (a.w * a.h); }
function dominant(im) { const m = new Map(); for (let i = 0; i < im.w * im.h; i += 7) { const k = hex([im.px[i * im.bpp], im.px[i * im.bpp + 1], im.px[i * im.bpp + 2]]); m.set(k, (m.get(k) || 0) + 1); } return [...m.entries()].sort((a, b) => b[1] - a[1])[0][0]; }
const rgbOf = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

const A = { preset: 'giay-o-ly', lower_third: { enabled: true } };
const B = { preset: 'tron', tokens: { paper: '#FFF4DC', ink: '#3B1D0A', ink_soft: '#6B4A33', en: '#8A3200', card: '#FFFFFF', hl: '#9ED8FF', accent2: '#0B7A5C' }, lower_third: { enabled: true, style: 'bar' } };
const norm = (b) => brand.normalize({ brand: b });
const W = 960;   // cỡ xem trước 960×540 (cùng tỉ lệ 16:9)
async function shot(b, view, extra) {
  const nb = norm(b), payload = Object.assign({ view, brand: nb }, extra);
  if (view !== 'thumb') payload.plan = samplePlan(nb, 'Lớp A.I. Bình Dân');
  const r = await still.renderStill({ mode: 'brand', payload, size: [W, 540], format: 'png' });
  assert.deepEqual(r.errors, [], view);
  return { im: decodePng(r.buffer), m: r.measures, buf: r.buffer };
}

test('F2-2/F2-8: hai brand khác nhau ⇒ ≥ 30 % điểm ảnh khác ở 3 mốc; cùng brand ⇒ trùng điểm ảnh; viền nhân vật = brand.tokens.ink; màu nền = token paper', { skip: HAS }, async () => {
  const nA = norm(A), nB = norm(B);
  for (const view of ['mid', 'card', 'thumb']) {
    const a1 = await shot(A, view), a2 = await shot(A, view), b1 = await shot(B, view);
    assert.ok(a1.buf.equals(a2.buf), view + ': cùng brand ⇒ trùng điểm ảnh (tất định)');
    const r = diffRatio(a1.im, b1.im);
    assert.ok(r >= 0.3, `${view}: hai brand khác nhau chỉ lệch ${(r * 100).toFixed(1)} % điểm ảnh (cần ≥ 30 %)`);
    assert.equal(hex(rgbAt(a1.im, 5, 5)) === '#FFFFFF', false);
    assert.equal(dominant(a1.im), nA.tokens.paper, view + ': màu chiếm nhiều nhất = token paper (A)');
    assert.equal(dominant(b1.im), nB.tokens.paper, view + ': màu chiếm nhiều nhất = token paper (B)');
    assert.equal(a1.m.brand_hash, nA.hash); assert.equal(b1.m.brand_hash, nB.hash); assert.equal(a1.m.stub, false);
    if (view === 'thumb') continue;
    // F2-8: SVG nhân vật không còn mực cũ #2b211d, có mực của brand
    for (const [x, nb] of [[a1, nA], [b1, nB]]) { assert.equal(x.m.ink.legacyInk, 0, view); assert.ok(x.m.ink.brandInk > 20, view + ' brandInk=' + x.m.ink.brandInk); assert.equal(x.m.ink.actors, 2); }
    // điểm ảnh thật: viền nhân vật (vùng nhân vật trái) mang màu ink của brand, không còn #2B211D
    const box = [0, 330, 200, 540], legacy = rgbOf('#2B211D');
    assert.ok(count(a1.im, rgbOf(nA.tokens.ink), box, 10) > 150, view + ': viền nhân vật brand A');
    assert.ok(count(b1.im, rgbOf(nB.tokens.ink), box, 10) > 150, view + ': viền nhân vật brand B');
    assert.ok(count(a1.im, legacy, box, 2) <= 5, view + ': không còn mực cũ (A)'); assert.ok(count(b1.im, legacy, box, 2) <= 5, view + ': không còn mực cũ (B)');   // ≤ 5: vài điểm khử răng cưa trùng màu ngẫu nhiên
  }
});

test('lower-third đúng người nói và đúng lúc; tắt thì không có; phụ đề vị trí trên + tấm thẻ', { skip: HAS }, async () => {
  const on = await shot(A, 'mid');
  assert.equal(on.m.lower_third, 'Bé Hỏi · Cô bé hay hỏi', 'câu đầu của người nói đầu tiên: {name} · {role}');
  const off = await shot({ preset: 'giay-o-ly' }, 'mid'); assert.equal(off.m.lower_third, '');
  const nb = norm({ preset: 'console', subtitle: { position: 'top', plate: 'card', size: 'l' } });
  const plan = samplePlan(nb, 'K');
  const st = await openStage({}); // đo bố cục thật
  try {
    await st.ev('window.__load(' + JSON.stringify(plan) + ')'); await st.ev('window.__seek(3000)');
    const r = JSON.parse(await st.ev('JSON.stringify((function(){var s=document.getElementById("sub").getBoundingClientRect(), c=getComputedStyle(document.getElementById("sub")); return {top:s.top, fs:c.fontSize, bg:c.backgroundColor, cls:document.getElementById("stage").className};})())'));
    assert.ok(r.top < 100, 'phụ đề ở trên (top=' + r.top + ')'); assert.equal(r.fs, '44px'); assert.equal(r.bg, 'rgb(255, 255, 255)'); assert.match(r.cls, /sub-top/); assert.match(r.cls, /sub-plate-card/);
    assert.deepEqual(st.errors, []);
  } finally { await st.close(); }
});

test('logo: SVG qua assetRefs hiện đúng góc trên video/ảnh bìa/thẻ kết; không có trong "show" thì ẩn', { skip: HAS }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-brand-')), PINK = '#FF00AA';
  fs.writeFileSync(path.join(dir, 'logo.svg'), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="' + PINK + '"/></svg>');
  try {
    const nb = norm({ preset: 'giay-o-ly', logo: { asset: 'AS-0007', corner: 'tr', size: 'm' }, thumb: { corner: 'tl' }, end_card: { cta: 'Học tiếp' } });
    nb.logo.ref = 'logo.svg';
    const pink = rgbOf(PINK), render = async (view, brandObj, t) => {
      const payload = { view, brand: brandObj, assetRefs: [{ asset: 'logo.svg', label: 'logo' }] };
      if (view !== 'thumb') payload.plan = samplePlan(brandObj, 'K'), payload.t_ms = t;
      const r = await still.renderStill({ mode: 'brand', payload, size: [1920, 1080], format: 'png', assetRoot: dir });
      assert.deepEqual(r.errors, [], view); return { im: decodePng(r.buffer), m: r.measures };
    };
    const mid = await render('mid', nb, 3000);
    assert.equal(mid.m.logo, true);
    assert.ok(count(mid.im, pink, [1720, 20, 1900, 200], 4) > 160 * 160 * 0.8, 'logo cỡ m (160 px) ở góc phải trên');
    assert.equal(count(mid.im, pink, [0, 0, 400, 400], 4), 0, 'không có ở góc trái');
    const th = await render('thumb', nb);
    assert.ok(count(th.im, pink, [20, 20, 220, 220], 4) > 150 * 150 * 0.8 * 0.5, 'ảnh bìa: logo ở góc thumb.corner=tl');
    const card = await render('card', nb); assert.ok(count(card.im, pink, null, 4) > 2000, 'thẻ kết có logo (end_card)');
    const hidden = norm({ preset: 'giay-o-ly', logo: { asset: 'AS-0007', show: ['thumb'] } }); hidden.logo.ref = 'logo.svg';
    const mid2 = await render('mid', hidden, 3000); assert.equal(count(mid2.im, pink, null, 4), 0, 'show không có "video" ⇒ không hiện trên video');
    // chip tiêu đề nhường chỗ logo ở góc trái
    const left = norm({ preset: 'giay-o-ly', logo: { asset: 'AS-0007', corner: 'tl', size: 's' } }); assert.equal(left.vars['--chip-left'], '160px');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('intro: có hình theo thời gian (logo-pop / title-wipe), tắt sau duration_ms; seek tuỳ ý vẫn tất định; còn LEAD để câu đầu không bị đè', { skip: HAS }, async () => {
  const nb = norm({ preset: 'giay-o-ly', intro: { enabled: true, kind: 'title-wipe', duration_ms: 1800 } });
  const plan = samplePlan(nb, 'K');
  assert.equal(plan.lines[0].a_ms, 2100);
  const st = await openStage({});
  try {
    await st.ev('window.__load(' + JSON.stringify(plan) + ')');
    const probe = async (t) => { await st.ev('window.__seek(' + t + ')'); return JSON.parse(await st.ev('JSON.stringify((function(){var i=document.querySelector(".intro");return {vis:getComputedStyle(i).visibility, op:+getComputedStyle(i).opacity};})())')); };
    assert.equal((await probe(0)).vis, 'visible'); const mid = await probe(900); assert.ok(mid.op > 0.99, 'giữa intro: phủ kín');
    const fade = await probe(1700); assert.ok(fade.op < mid.op, 'cuối intro: mờ dần');
    assert.equal((await probe(1800)).vis, 'hidden'); assert.equal((await probe(5000)).vis, 'hidden');
    const again = await probe(900); assert.deepEqual(again, mid, 'seek lùi cho đúng cùng kết quả (hàm thuần của t)');
    assert.deepEqual(st.errors, []);
  } finally { await st.close(); }
  const pop = norm({ preset: 'giay-o-ly', intro: { enabled: true, kind: 'logo-pop', duration_ms: 1500 } });
  const r1 = await still.renderStill({ mode: 'brand', payload: { view: 'mid', brand: pop, plan: samplePlan(pop, 'K'), t_ms: 300 }, size: [640, 360], format: 'png' });
  assert.equal(r1.measures.intro, true); assert.deepEqual(r1.errors, []);
  const r2 = await still.renderStill({ mode: 'brand', payload: { view: 'mid', brand: pop, plan: samplePlan(pop, 'K'), t_ms: 4000 }, size: [640, 360], format: 'png' });
  assert.equal(r2.measures.intro, false);
});

test('xem trước từ render_still: brand thô (chưa chuẩn hoá) và mọi cặp phông dựng được chuỗi đủ dấu tiếng Việt, 0 lỗi console', { skip: HAS }, async () => {
  const title = 'Ăn ơi, ướp lạnh ếch Đồng Tháp ở Huế: ỡ ẹ ỳ ủ ặ ằ ẳ ẵ ê ô ơ ư';
  for (const pair of Object.keys(brand.FONT_PAIRS)) {
    const r = await still.renderStill({ mode: 'brand', payload: { brand: { preset: 'console', fonts: { pair } }, title }, size: [640, 360], format: 'jpeg' });   // không view/plan ⇒ ảnh bìa mẫu
    assert.deepEqual(r.errors, [], pair); assert.equal(r.measures.view, 'thumb'); assert.equal(r.measures.stub, false); assert.ok(r.buffer.length > 3000);
  }
  await assert.rejects(still.renderStill({ mode: 'brand', payload: { view: 'mid', brand: {} }, size: [320, 180] }), /cần payload\.plan/);
  await assert.rejects(still.renderStill({ mode: 'brand', payload: { view: 'x' }, size: [320, 180] }), /view phải là/);
});

test('kênh không brand: sân khấu y như cũ (không lớp/biến/lớp CSS của brand); plan.style.brand=null không gọi GSBrand', { skip: HAS }, async () => {
  const plan = samplePlan(null, 'K');
  assert.equal(plan.style.brand, null);
  const st = await openStage({});
  try {
    await st.ev('window.__load(' + JSON.stringify(plan) + ')'); await st.ev('window.__seek(3000)');
    const r = JSON.parse(await st.ev('JSON.stringify((function(){var s=document.getElementById("stage");return {style:s.getAttribute("style")||"", cls:s.className, extras:document.querySelectorAll(".brand-logo,.lower-third,.intro").length, ink:getComputedStyle(s).getPropertyValue("--v-ink").trim(), act:document.querySelector(".actor").innerHTML.toLowerCase().split("#2b211d").length-1};})())'));
    assert.deepEqual([r.style, r.cls, r.extras, r.ink], ['', 'stage', 0, '#1D2A6E']);
    assert.ok(r.act > 20, 'nhân vật còn viền mực mặc định #2b211d');
    assert.deepEqual(st.errors, []);
  } finally { await st.close(); }
});

test('renderPlan (đường video): brand + logo + intro ⇒ đủ khung, 0 lỗi, logo hiện ở khung giữa, intro phủ khung đầu; hai lần dựng trùng từng khung', { skip: HAS }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-brand-rp-')), PINK = '#FF00AA';
  fs.writeFileSync(path.join(dir, 'logo.svg'), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="' + PINK + '"/></svg>');
  try {
    const nb = norm({ preset: 'console', logo: { asset: 'AS-0007', corner: 'br', size: 's' }, intro: { enabled: true, kind: 'logo-pop', duration_ms: 600 }, lower_third: { enabled: true } });
    nb.logo.ref = 'logo.svg';
    const plan = samplePlan(nb, 'K'); plan.duration_ms = 2000; plan.assetRefs = [{ asset: 'logo.svg', label: 'logo' }];
    const run = async (sub) => { const r = await renderPlan({ plan, outDir: path.join(dir, sub), assetRoot: dir }); assert.deepEqual(r.errors, []); return r; };
    const r1 = await run('a'), r2 = await run('b');
    assert.equal(r1.frames, 24);
    const f = (sub, i) => fs.readFileSync(path.join(dir, sub, 'frames', 'f' + String(i).padStart(5, '0') + '.jpg'));
    for (const i of [0, 12, 23]) assert.ok(f('a', i).equals(f('b', i)), 'khung ' + i + ' trùng giữa hai lần dựng');
    assert.ok(!f('a', 0).equals(f('a', 23)), 'intro phủ khung đầu rồi tan');
    // khung 20 (≈ 1,67 s, hết intro 600 ms): logo hồng góc phải dưới — JPEG nên đo bằng Chromium: chụp lại PNG qua frame still cùng plan
    const s = await still.renderStill({ mode: 'frame', payload: { plan: Object.assign({}, plan, { assetData: { 'logo.svg': 'data:image/svg+xml;base64,' + fs.readFileSync(path.join(dir, 'logo.svg')).toString('base64') } }), t_ms: 1700 }, size: [1920, 1080], format: 'png' });
    assert.deepEqual(s.errors, []); assert.ok(count(decodePng(s.buffer), rgbOf(PINK), [1720, 880, 1900, 1060], 4) > 96 * 96 * 0.8, 'logo cỡ s (96 px) ở góc phải dưới');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ---------- route xem trước /api/preview/still (F2-7, §4.7) ----------
const { bootTmp, request, setupOwner, ui } = require('./d-helpers');
test('route /api/preview/still: chỉ phiên chủ xưởng; GET brand đã lưu, POST brand nháp (không ghi DB); cache theo brand_hash; lỗi theo token', { skip: HAS }, async () => {
  const t = await bootTmp();
  try {
    const s = await setupOwner(t.app, t.base), call = ui(t.base, s);
    const ch = (await call('POST', '/api/channels', { name: 'Lớp A.I.' })).json.display_id;
    const ag = await call('POST', '/api/agents', { name: 'Agent', scopes: ['read', 'compose'] });
    const q = (extra) => '/api/preview/still?mode=brand&channel=' + ch + (extra || '');
    // quyền: không phiên ⇒ 401; token agent không thay được phiên (401/403)
    assert.equal((await request(t.base, 'GET', q('&view=thumb'))).status, 401);
    assert.ok([401, 403].includes((await request(t.base, 'GET', q('&view=thumb'), { token: ag.json.token })).status));
    assert.equal((await request(t.base, 'POST', '/api/preview/still', { cookie: s.cookie, origin: t.base, body: { mode: 'brand', channel: ch } })).status, 403, 'thiếu CSRF');
    // tham số sai
    for (const [url, re] of [[q('&view=zzz'), /view phải là/], [q('&w=100'), /w phải trong/], ['/api/preview/still?mode=thumb&channel=' + ch, /chưa hỗ trợ/]]) {
      const r = await call('GET', url);
      assert.equal(r.status, 400, url); assert.match(r.json.error.text_human, re);
    }
    assert.equal((await call('GET', '/api/preview/still?mode=brand&channel=CH-9999')).status, 404);
    // GET: kênh chưa có brand ⇒ xem trước preset mặc định; trả JPEG thật
    const r1 = await call('GET', q('&view=thumb&w=640'));
    assert.equal(r1.status, 200); assert.equal(r1.headers['content-type'], 'image/jpeg'); assert.equal(r1.buf[0], 0xff); assert.ok(r1.buf.length > 3000);
    const hash = r1.headers['x-brand-hash']; assert.match(hash, /^[0-9a-f]{16}$/);
    const t0 = Date.now(), r1b = await call('GET', q('&view=thumb&w=640'));
    assert.ok(r1b.buf.equals(r1.buf), 'cùng brand_hash ⇒ cache'); assert.ok(Date.now() - t0 < 300, 'trúng cache nhanh (' + (Date.now() - t0) + ' ms)');
    // POST nháp: đổi preset ⇒ hash khác; DB không đổi version
    const v0 = t.app.ctx.db.get('SELECT current_version AS v FROM channels WHERE display_id=?', ch).v;
    const r2 = await call('POST', '/api/preview/still', { mode: 'brand', channel: ch, view: 'mid', w: 640, brand: { preset: 'console', lower_third: { enabled: true } } });
    assert.equal(r2.status, 200); assert.notEqual(r2.headers['x-brand-hash'], hash);
    assert.equal(t.app.ctx.db.get('SELECT current_version AS v FROM channels WHERE display_id=?', ch).v, v0, 'xem trước không ghi gì');
    // nháp sai tương phản ⇒ 400 + errors theo token (UI hiện dưới ô)
    const bad = await call('POST', '/api/preview/still', { mode: 'brand', channel: ch, brand: { tokens: { en: '#9988FF' } } });
    assert.equal(bad.status, 400); assert.deepEqual(bad.json.error.detail.errors.map((e) => e.path), ['tokens.en']);
    // owner lưu (UI) ⇒ GET dùng brand đã lưu; lưu brand sai ⇒ 400 từ cổng ghi
    assert.equal((await call('POST', '/api/channels', { channel: ch, data: { brand: { preset: 'tron' } } })).status, 201);
    const r3 = await call('GET', q('&view=card&w=640')); assert.equal(r3.status, 200); assert.notEqual(r3.headers['x-brand-hash'], hash);
    assert.equal((await call('POST', '/api/channels', { channel: ch, data: { brand: { preset: 'tron', tokens: { ink: '#EEEEEE' } } } })).status, 400);
  } finally { await t.clean(); }
});
