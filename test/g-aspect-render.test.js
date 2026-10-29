// © 2026 Gen Labs — All rights reserved.
// Gói A2 (SPEC-0.2.0-F7 §4.3–4.4, §5.3, §8) — dựng THẬT bằng Chromium một clip 9:16 ~8 s: khung 1080×1920, sân khấu có lớp `lay` + biến --lay-*, logo br → tr,
// không lower-third/chip, renderPlan trả `measures` đủ vai (subtitle, block, end_card, actor_head, logo) ở mốc aspects.sampleTimes và G-SAFE đạt, khung bìa = coverFrameMs,
// ngân sách đo L-42; 16:9 không đo (không khoá `measures`). Xem trước nhận diện (GSStill.brand) dựng được 9:16.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const chromium = require('../render/chromium');
const still = require('../render/still');
const { renderPlan, openStage } = require('../render/render');
const { buildPlan } = require('../render/engine/timeline');
const brand = require('../render/brand');
const aspects = require('../render/aspects');
const { gateSafe } = require('../media/gates/safe.js');
const { samplePlan } = require('../server/routes/preview.js');

const HAS = chromium.find() ? false : 'không có Chromium';
test.after(() => still.closeStill());
const LOGO = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#FF2D95"/></svg>';

// kích thước JPEG từ marker SOF (không thư viện)
function jpegSize(buf) {
  let p = 2;
  while (p < buf.length) {
    if (buf[p] !== 0xff) { p++; continue; }
    const m = buf[p + 1], len = buf.readUInt16BE(p + 2);
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return [buf.readUInt16BE(p + 7), buf.readUInt16BE(p + 5)];
    p += 2 + len;
  }
  return null;
}
function vertical(nb) {
  return buildPlan({ aspect: '9:16', fps: 12, brand: nb, channel: { name: 'Gen Labs' }, lesson: { title: 'Xác suất', lines: [
    { id: 'L1', who: 'CM-0001', say: 'Chào các bạn, hôm nay mình học về xác suất trong mô hình ngôn ngữ.' },
    { id: 'L2', who: 'CM-0002', say: 'Mô hình đoán từ tiếp theo dựa trên xác suất của từng token.', terms: ['token'] }],
  beats: [
    { id: 'B1', block: 'title', anchor: { line: 'L1', word: 'Chào' }, params: { text: 'Xác suất trong LLM', highlight: ['LLM'] } },
    { id: 'B2', block: 'token-row', anchor: { line: 'L2', word: 'Mô' }, params: { tokens: ['Trời', 'hôm', 'nay'], next: 'đẹp' } }] } });
}

test('renderPlan 9:16: khung 1080×1920, measures đủ vai ở mốc sampleTimes, G-SAFE đạt, khung bìa = coverFrameMs, ngân sách đo L-42', { skip: HAS, timeout: 300000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-a2-'));
  fs.writeFileSync(path.join(dir, 'logo.svg'), LOGO);
  try {
    const nb = brand.normalize({ brand: { preset: 'giay-o-ly', logo: { asset: 'AS-0007', corner: 'br', size: 'm' }, lower_third: { enabled: true } } });
    nb.logo.ref = 'logo.svg';
    const plan = vertical(nb); plan.assetRefs = [{ asset: 'logo.svg', label: 'logo' }];
    assert.ok(plan.duration_ms >= 7000 && plan.duration_ms <= 20000, 'clip ngắn (' + plan.duration_ms + ' ms)');
    const r = await renderPlan({ plan, outDir: path.join(dir, 'out'), assetRoot: dir });
    assert.deepEqual(r.errors, []);
    assert.equal(r.frames, Math.ceil(plan.duration_ms / 1000 * 12));
    for (const i of [0, Math.floor(r.frames / 2), r.frames - 1]) assert.deepEqual(jpegSize(fs.readFileSync(r.framesPattern.replace('%05d', String(i).padStart(5, '0')))), [1080, 1920], 'khung ' + i);
    assert.deepEqual(jpegSize(fs.readFileSync(r.cover)), [1080, 1920]);
    assert.equal(r.cover_frame_ms, aspects.coverFrameMs(plan));
    // measures: một mẫu mỗi mốc sampleTimes, đúng đầu vào safeCheck
    const marks = aspects.sampleTimes(plan), S = r.measures.samples;
    assert.equal(S.length, marks.length); assert.equal(r.measures.duration_s, plan.duration_ms / 1000);
    S.forEach((s, i) => { assert.equal(s.kind, marks[i].kind); assert.ok(Math.abs(s.t_ms - marks[i].t) <= 1000 / 12 / 2 + 1, 'mốc gần khung ' + s.t_ms + '~' + marks[i].t); });
    const roles = new Set(S.flatMap((s) => s.els.map((e) => e.role)));
    for (const ro of ['subtitle', 'block', 'end_card', 'actor_head', 'logo']) assert.ok(roles.has(ro), 'thiếu vai ' + ro);
    const blk = S.find((s) => s.kind === 'beat').els.find((e) => e.role === 'block');
    assert.ok(blk.beat && blk.zone && blk.font_px_min >= aspects.get('9:16').min_font_px, JSON.stringify(blk));
    const g = gateSafe({ aspect: '9:16', planAspect: plan.aspect, measures: r.measures });
    assert.equal(g.result, 'pass', JSON.stringify(g.measure.violations));
    assert.ok(r.measure_ms / S.length < 40, 'đo ' + r.measure_ms + ' ms / ' + S.length + ' mốc');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('sân khấu 9:16: lớp lay + a-9x16, cỡ 1080×1920, biến --lay-* từ layoutVars, logo br ⇒ tr ở vị trí layout, không lower-third/chip, phụ đề ở layout.subtitle', { skip: HAS, timeout: 120000 }, async () => {
  const nb = brand.normalize({ brand: { preset: 'giay-o-ly', logo: { asset: 'AS-0007', corner: 'br', size: 'm' }, lower_third: { enabled: true }, subtitle: { position: 'top' } } });
  nb.logo.ref = 'logo.svg';
  const plan = vertical(nb); plan.assetData = { 'logo.svg': 'data:image/svg+xml;base64,' + Buffer.from(LOGO).toString('base64') };
  const st = await openStage({ width: 1080, height: 1920 });
  try {
    await st.ev('window.__load(' + JSON.stringify(plan) + ')');
    await st.ev('window.__seek(' + (plan.lines[0].a_ms + 600) + ')');
    const d = JSON.parse(await st.ev(`JSON.stringify((function(){var s=document.getElementById('stage'),cs=getComputedStyle(s),lg=document.querySelector('.brand-logo'),sb=document.getElementById('sub').getBoundingClientRect(),lr=lg&&lg.getBoundingClientRect();
      return {cls:s.className,w:s.offsetWidth,h:s.offsetHeight,top:cs.getPropertyValue('--lay-sub-top').trim(),logo:lg&&lg.className,lr:lr&&[lr.left,lr.top,lr.width],lt:document.querySelectorAll('.lower-third').length,chip:getComputedStyle(document.getElementById('chipTop')).display,sub:[sb.left,sb.top,sb.right]};})())`));
    const L = plan.layout;
    assert.match(d.cls, /\blay\b/); assert.match(d.cls, /\ba-9x16\b/); assert.deepEqual([d.w, d.h], [1080, 1920]);
    assert.equal(d.top, L.subtitle.top + 'px');
    assert.equal(d.logo, 'brand-logo tr', 'br đổi thành tr (layout.logo.remap)');
    assert.deepEqual(d.lr, [L.logo.tr[0], L.logo.tr[1], plan.layout.safe.soft[2] - L.logo.tr[0]], 'logo ở layout.logo.tr, cỡ ≤ phần còn lại tới mép mềm');
    assert.equal(d.lt, 0, 'không lower-third ở 9:16'); assert.equal(d.chip, 'none');
    assert.equal(d.sub[1], L.subtitle.top, 'brand subtitle.position=top bị bỏ qua ở 9:16');
    assert.ok(d.sub[0] >= L.subtitle.left - 0.5 && d.sub[2] <= L.subtitle.left + L.subtitle.max_w + 0.5, 'phụ đề trong [left, left+max_w]: ' + d.sub);
    assert.deepEqual(st.errors, []);
  } finally { await st.close(); }
});

test('16:9 không đổi đường dựng: renderPlan không đo, không có khoá measures/cover_frame_ms; khung 1920×1080', { skip: HAS, timeout: 120000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-a2-'));
  try {
    const plan = samplePlan(null, 'K'); plan.duration_ms = 600;
    const r = await renderPlan({ plan, outDir: dir });
    assert.deepEqual(r.errors, []);
    assert.ok(!('measures' in r) && !('cover_frame_ms' in r) && !('measure_ms' in r));
    assert.deepEqual(jpegSize(fs.readFileSync(r.cover)), [1920, 1080]);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('xem trước nhận diện 9:16 (GSStill.brand): view mid/card từ bài mẫu dọc và view thumb khung dọc — ảnh 540×960, 0 lỗi', { skip: HAS, timeout: 120000 }, async () => {
  const nb = brand.normalize({ brand: { preset: 'giay-o-ly', lower_third: { enabled: true } } }), V = aspects.get('9:16');
  for (const view of ['mid', 'card', 'thumb']) {
    const payload = { view, brand: nb };
    if (view !== 'thumb') payload.plan = samplePlan(nb, 'Kênh', '9:16');
    else Object.assign(payload, { aspect: '9:16', size: V.size, layout: Object.assign({}, V.layout, { safe: V.safe }) });
    const r = await still.renderStill({ mode: 'brand', payload, size: [540, 960], aspect: '9:16', format: 'jpeg' });
    assert.deepEqual(r.errors, [], view); assert.deepEqual(jpegSize(r.buffer), [540, 960], view);
    if (view === 'mid') assert.equal(r.measures.lower_third, '', 'không lower-third ở 9:16');
  }
  await assert.rejects(still.renderStill({ mode: 'brand', payload: { view: 'thumb', brand: nb }, size: [1080, 2000], aspect: '9:16' }), { code: 'still_size' }, 'cao quá khung tỉ lệ');
  await assert.rejects(still.renderStill({ mode: 'brand', payload: {}, aspect: '1:1' }), { code: 'still_aspect' });
});
