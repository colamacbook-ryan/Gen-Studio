// © 2026 Gen Labs — All rights reserved.
// Gói A2 (SPEC-0.2.0-F7 §6.1–6.2) — cổng G-SAFE: luật S1–S6 ca dương/âm trên số đo giả (vùng cứng/mềm lấy từ aspects.json), khối vùng kề và toàn cảnh KHÔNG làm trượt
// (CNS-331), không số đo ⇒ unknown, GATES chỉ áp cho bài có vùng an toàn (16:9 không thêm cổng — M14), cài đặt qua write.ext.gates (server/ops/safe.js),
// G-MUX kiểm kích thước theo plan.size; Chromium: phụ đề câu 300 ký tự lật trang vẫn trọn trong vùng cứng (S1, CNS-333).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const aspects = require('../render/aspects');
const gates = require('../media/gates/index.js');
const { gateSafe } = require('../media/gates/safe.js');
const { gateMux } = require('../media/gates/render.js');
const { createExt } = require('../server/hooks.js');
const chromium = require('../render/chromium');

const V = aspects.get('9:16'), HARD = V.safe.hard, SOFT = V.safe.soft, MIN = V.min_font_px;
const OLD8 = ['G-WAV', 'G-SCRIPT', 'G-PRON', 'G-LOUD', 'G-SYNC', 'G-MOTION', 'G-FRAMES', 'G-MUX'];
// hộp [x,y,w,h] nằm giữa vùng mềm, cao h
const inSoft = (y, h, w) => [SOFT[0] + 10, y, w || (SOFT[2] - SOFT[0] - 20), h];
const sub = (line, box) => ({ role: 'subtitle', line, box });
const block = (beat, zone, box, font) => Object.assign({ role: 'block', block: 'x', beat, zone, box }, font === undefined ? {} : { font_px_min: font });
// bài mẫu đạt: 1 mốc câu, 1 mốc beat, 1 mốc thẻ kết
function good() {
  return { duration_s: 45, samples: [
    { t_ms: 1150, kind: 'beat', beat: 'B1', zone: 'Z1', line: 'L1', els: [sub('L1', [72, 960, 808, 144]), block('B1', 'Z1', [76, 590, 800, 120], 61), { role: 'logo', box: [816, 300, 72, 72] }, { role: 'actor_head', id: 'A', box: [76, 1228, 360, 170] }] },
    { t_ms: 4300, kind: 'line', line: 'L1', els: [sub('L1', [72, 960, 808, 144]), block('B1', 'Z1', [76, 590, 800, 120], 61)] },
    { t_ms: 21100, kind: 'end', beat: 'END', els: [{ role: 'end_card', beat: 'END', box: [120, 600, 712, 340] }] },
  ] };
}
const run = (m) => gateSafe({ aspect: '9:16', measures: m });
const rules = (r) => r.measure.violations.map((v) => v.rule + ':' + v.role + (v.edge ? ':' + v.edge : ''));

test('đạt: S1–S4 không vi phạm ⇒ pass, measure đúng lược đồ §6.2 (safe_ref, samples, min_font_px, platform_fit, text_human)', () => {
  const r = run(good());
  assert.equal(r.gate, 'G-SAFE'); assert.equal(r.result, 'pass', JSON.stringify(r.measure));
  assert.equal(r.measure.aspect, '9:16'); assert.equal(r.measure.safe_ref, V.safe.ref); assert.equal(r.measure.samples, 3); assert.equal(r.measure.min_font_px, 61);
  assert.deepEqual(r.measure.platform_fit, { yt_shorts: true, fb_reels: true, tiktok: true });
  assert.match(r.measure.text_human, /0 vi phạm/);
});

test('S1: phụ đề tràn mép dưới vùng cứng (xuống vùng caption) ⇒ fail, ghi câu + mép + hộp', () => {
  const m = good(); m.samples[1].els[0] = sub('L1', [72, HARD[3] - 100, 808, 160]);
  const r = run(m);
  assert.equal(r.result, 'fail'); assert.deepEqual(rules(r), ['S1:subtitle:bottom']);
  assert.equal(r.measure.violations[0].line, 'L1'); assert.equal(r.measure.violations[0].t_ms, 4300);
  assert.match(r.measure.text_human, /Phụ đề câu L1.*caption/);
});

test('S2: logo góc br không đổi sang tr ⇒ fail; thẻ kết rộng tràn mép phải ⇒ fail; chữ intro tràn ⇒ fail', () => {
  const m = good(); m.samples[0].els[2] = { role: 'logo', box: [V.size[0] - 136, V.size[1] - 126, 96, 96] };
  assert.deepEqual(rules(run(m)), ['S2:logo:bottom']);
  const e = good(); e.samples[2].els[0].box = [76, 600, HARD[2] - 40, 300];
  assert.deepEqual(rules(run(e)), ['S2:end_card:right']);
  const i = good(); i.samples[1].els.push({ role: 'intro', box: [40, 800, 1000, 140] });
  assert.equal(run(i).result, 'fail');
});

test('S3: khối của beat đang đo rộng 1400 ở z cố định (tràn hai bên) ⇒ fail; cùng khối ở mốc câu (không phải mốc beat) ⇒ không xét', () => {
  const m = good(); m.samples[0].els[1] = block('B1', 'Z1', [-160, 590, 1400, 120], 61);
  const r = run(m); assert.equal(r.result, 'fail'); assert.equal(r.measure.violations[0].rule, 'S3'); assert.equal(r.measure.violations[0].beat, 'B1');
  const n = good(); n.samples[1].els[1] = block('B1', 'Z1', [-160, 590, 1400, 120], 61);
  assert.equal(run(n).result, 'pass', 'mốc câu: khối không xét S3 (máy quay có thể đang lia)');
});

test('CNS-331: khối vùng kề ló ở mép và khối toàn cảnh (lesson-map, không mốc beat) KHÔNG làm trượt; khối cùng vùng với beat đang đo thì có xét', () => {
  const m = good();
  m.samples[0].els.push(block('B0', 'Z0', [76, -300, 800, 360], 20));   // vùng trước ló mép trên, chữ nhỏ — không thuộc beat/vùng đang đo
  m.samples.push({ t_ms: 19000, kind: 'line', line: 'L4', els: [sub('L4', [72, 960, 808, 100]), block('MAP', null, [-200, -400, 1500, 2600], 12)] });   // toàn cảnh
  assert.equal(run(m).result, 'pass', JSON.stringify(run(m).measure.violations));
  const z = good(); z.samples[0].els.push(block('B1b', 'Z1', [76, 100, 800, 200], 50));   // cùng vùng Z1, tràn lên thanh trên
  assert.deepEqual(rules(run(z)), ['S3:block:top']);
});

test('S4: chữ nhỏ nhất của khối đang đo < min_font_px ⇒ fail (ghi font_px); ≥ ngưỡng ⇒ đạt', () => {
  const m = good(); m.samples[0].els[1] = block('B1', 'Z1', [76, 590, 800, 120], MIN - 8);
  const r = run(m); assert.deepEqual(rules(r), ['S4:block']); assert.equal(r.measure.violations[0].font_px, MIN - 8); assert.match(r.measure.text_human, /px/);
  const ok = good(); ok.samples[0].els[1] = block('B1', 'Z1', [76, 590, 800, 120], MIN); assert.equal(run(ok).result, 'pass');
});

test('S5/S6 chỉ cảnh báo: chữ ngoài vùng mềm nhưng trong vùng cứng; đầu nhân vật dưới mép cứng; 191 s vượt Shorts; ngoài target_s', () => {
  const m = good(); m.duration_s = 191;
  m.samples[1].els[0] = sub('L1', [72, SOFT[3] - 20, 808, 100]);   // đáy 1328: ngoài mềm (1248), trong cứng (1440)
  m.samples[0].els[3] = { role: 'actor_head', id: 'A', box: [76, 1300, 360, 200] };
  const r = run(m);
  assert.equal(r.result, 'pass');
  const w = r.measure.warnings.map((x) => x.rule + (x.role ? ':' + x.role : '') + (x.preset ? ':' + x.preset : ''));
  assert.ok(w.includes('S5:subtitle') && w.includes('S5:actor_head') && w.includes('S6:yt_shorts') && w.includes('S6'), w.join(','));
  assert.deepEqual(r.measure.platform_fit, { yt_shorts: false, fb_reels: true, tiktok: true });
});

test('không số đo / số đo hỏng / tỉ lệ khác plan ⇒ unknown (chặn, INT-08); 16:9 không có vùng an toàn ⇒ pass applicable:false', () => {
  assert.equal(run(undefined).result, 'unknown'); assert.equal(run({ samples: [] }).result, 'unknown');
  assert.equal(run({ samples: [{ t_ms: 1, els: [{ role: 'subtitle', box: [1, 2] }] }] }).result, 'unknown');
  const mis = gateSafe({ aspect: '9:16', planAspect: '16:9', measures: good() });
  assert.equal(mis.result, 'unknown'); assert.match(mis.measure.text_human, /16:9/);
  const w = gateSafe({ aspect: '16:9', measures: null }); assert.equal(w.result, 'pass'); assert.equal(w.measure.applicable, false);
});

test('GATES: G-SAFE áp khi tỉ lệ của bài có vùng an toàn (9:16); bài cũ NULL/16:9 giữ đúng danh sách cũ (M14)', () => {
  assert.deepEqual(gates.gatesFor('lesson', {}), OLD8);
  assert.deepEqual(gates.gatesFor('lesson', { aspect: null }), OLD8);
  assert.deepEqual(gates.gatesFor('lesson', { aspect: '16:9' }), OLD8);
  assert.deepEqual(gates.gatesFor('lesson', { aspect: '9:16' }), OLD8.concat('G-SAFE'));
  assert.deepEqual(gates.gatesFor('lesson', { aspect: '9:16', thumbnail: '{"variants":[]}' }), OLD8.concat('G-THUMB', 'G-SAFE'));
  assert.deepEqual(gates.gatesFor('tutorial', {}), OLD8.concat('G-CURSOR'));
});

test('server/ops/safe.js: đăng ký G-SAFE qua ext.gates; đo lv.aspect × rendered.measures; thiếu measures ⇒ unknown', async () => {
  const ext = createExt(), calls = [];
  require('../server/ops/safe.js').register((...a) => calls.push(a), { ext });
  assert.deepEqual(calls, [], 'không thêm op ghi nào'); assert.deepEqual(ext.gates.ids(), ['G-SAFE']);
  const impl = ext.gates.get('G-SAFE');
  const ok = await impl({ B: { lv: { aspect: '9:16' } }, plan: { aspect: '9:16' }, rendered: { measures: good() } });
  assert.equal(ok.result, 'pass');
  assert.equal((await impl({ B: { lv: { aspect: '9:16' } }, plan: { aspect: '9:16' }, rendered: {} })).result, 'unknown');
  assert.equal((await impl({ B: { lv: { aspect: '9:16' } }, plan: { aspect: '16:9' }, rendered: { measures: good() } })).result, 'unknown', 'plan không theo tỉ lệ bài');
});

const FF = spawnSync('ffmpeg', ['-version']).status === 0 ? false : 'không có ffmpeg';
test('G-MUX theo plan.size: video 1080×1920 + size [1080,1920] ⇒ pass; size [1920,1080] ⇒ fail "video 1080×1920, plan 1920×1080"; không size ⇒ không kiểm', { skip: FF }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-gsafe-')), mp4 = path.join(dir, 'v.mp4');
  try {
    const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=white:s=1080x1920:r=30:d=1', '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo', '-t', '1',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', mp4]);
    assert.equal(r.status, 0, String(r.stderr));
    const ok = await gateMux({ mp4Path: mp4, lines: [], srt: [], size: [1080, 1920] });
    assert.equal(ok.result, 'pass', JSON.stringify(ok.measure)); assert.deepEqual(ok.measure.size, [1080, 1920]);
    const bad = await gateMux({ mp4Path: mp4, lines: [], srt: [], size: [1920, 1080] });
    assert.equal(bad.result, 'fail'); assert.ok(bad.measure.problems.includes('video 1080×1920, plan 1920×1080'));
    const legacy = await gateMux({ mp4Path: mp4, lines: [], srt: [] });
    assert.equal(legacy.result, 'pass'); assert.ok(!('size' in legacy.measure), 'bên gọi cũ: measure không đổi');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

const HAS = chromium.find() ? false : 'không có Chromium';
test('Chromium: phụ đề câu 300 ký tự ở 9:16 lật trang theo mốc từ, mỗi trang trọn trong vùng cứng (S1 đạt), ≤ lines_max × chars_per_line ký tự; dòng dịch không đốt vào hình', { skip: HAS, timeout: 120000 }, async () => {
  const { buildPlan } = require('../render/engine/timeline');
  const { openStage } = require('../render/render');
  const words = 'mô hình ngôn ngữ đoán từ tiếp theo bằng xác suất token nào khả năng cao nhất thì được chọn'.split(' ');
  let say = ''; for (let i = 0; say.length < 300; i++) say += (say ? ' ' : '') + words[i % words.length];
  const plan = buildPlan({ aspect: '9:16', fps: 30, channel: { name: 'K' }, lesson: { title: 'T', lines: [
    { id: 'L1', who: 'CM-0001', say, terms: ['token'], subtitle: { en: 'English translation line that must not be burned in' } }],
  beats: [{ id: 'B1', block: 'title', anchor: { line: 'L1', word_index: 0 }, params: { text: 'Lật trang' } }] } });
  const L = plan.layout.subtitle, cap = L.lines_max * L.chars_per_line, line = plan.lines[0];
  const st = await openStage({ width: plan.size[0], height: plan.size[1] });
  try {
    await st.ev('window.__load(' + JSON.stringify(plan) + ')');
    const pages = new Set(), samples = [];
    for (let t = line.a_ms + 100; t < line.b_ms; t += 250) {
      await st.ev('window.__seek(' + t + ')');
      const r = JSON.parse(await st.ev('JSON.stringify({m: window.__measure(), txt: [].map.call(document.querySelectorAll("#sub .c"), function (c) { return c.textContent; }).join(" "), tr: document.querySelectorAll("#sub .tr").length, en: document.querySelectorAll("#sub .c.en").length, on: document.querySelectorAll("#sub .c.on").length})'));
      pages.add(r.txt); assert.ok(r.txt.length <= cap, 'trang ' + r.txt.length + ' ký tự > ' + cap);
      assert.equal(r.tr, 0, 'dòng dịch không đốt vào hình ở 9:16');
      const s = r.m.els.find((e) => e.role === 'subtitle'); assert.ok(s, 'có phụ đề ở ' + t);
      samples.push({ t_ms: t, kind: 'line', line: 'L1', els: [s] });
    }
    assert.ok(pages.size >= 5, 'câu 300 ký tự chia ≥ 5 trang (có ' + pages.size + ')');
    const g = gateSafe({ aspect: '9:16', measures: { samples } });
    assert.equal(g.result, 'pass', JSON.stringify(g.measure.violations));
    assert.deepEqual(st.errors, []);
  } finally { await st.close(); }
});
