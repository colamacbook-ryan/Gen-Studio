// © 2026 Gen Labs — All rights reserved.
// Gói C — kiểm buildPlan: mốc vào theo từ neo, máy quay liền mạch, morph, cues hợp lệ với âm của Gen-Chibi.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { buildPlan, validateAnchors, PlanError } = require('../render/engine/timeline');
const camera = require('../render/engine/camera');

// word_times (ms, tương đối đầu clip) đều 300 ms/chữ cho dễ tính
function clip(say, ms0) { const toks = say.trim().split(/\s+/); return { duration_ms: toks.length * 300 + 200, word_times: toks.map((w, i) => ({ w, t0: i * 300, t1: i * 300 + 280 })), envelope: new Array(Math.ceil((toks.length * 300 + 200) / 1000 * 30)).fill(0.5) }; }
const LINES = [
  { id: 'LN-1', who: 'CM-0002', say: 'Anh Gen ơi, sao A.I. nói sai mà vẫn tự tin thế ạ?', terms: ['A.I.'], mood: 'unsure', subtitle: { en: 'Why so sure?' } },
  { id: 'LN-2', who: 'CM-0001', say: 'Câu quen, như thủ đô Việt Nam là gì, thì Hà Nội chiếm chín mươi hai phần trăm.' },
  { id: 'LN-3', who: 'CM-0001', say: 'Câu lạ thì đó là hallucination.', terms: ['hallucination'] }
];
const CLIPS = {}; LINES.forEach(l => { CLIPS[l.id] = clip(l.say); });
const BEATS = [
  { id: 'BT-1', block: 'title', anchor: { line: 'LN-1', word: 'Anh Gen' }, params: { text: 'Vì sao A.I. sai mà vẫn tự tin?', highlight: ['tự tin?'] } },
  { id: 'BT-2', block: 'prob-card', anchor: { line: 'LN-2', word: 'Hà Nội' }, params: { prompt: 'Thủ đô của Việt Nam là', options: [['Hà Nội', 92], ['Huế', 4]], pick: 0, chip: '✓' } },
  { id: 'BT-3', block: 'prob-card', anchor: { line: 'LN-3', word: 'Câu lạ' }, params: { prompt: 'Ông nội của Ryan tên là', options: [['Minh', 18], ['Hùng', 16]], pick: 0 } },
  { id: 'BT-4', block: 'stamp', anchor: { line: 'LN-3', word_index: 5 }, params: { text: 'HALLUCINATION' } }
];
const plan = () => buildPlan({ lesson: { title: 'Bài thử', lines: LINES, beats: BEATS }, clips: CLIPS, channel: { name: 'Kênh thử' } });

test('lines: nối tiếp, mốc từ tuyệt đối ms', () => {
  const p = plan();
  assert.strictEqual(p.lines[0].a_ms, 1100);
  assert.strictEqual(p.lines[0].words[0].t0, 1100);
  p.lines.forEach((l, i) => { assert.ok(l.b_ms > l.a_ms); if (i) assert.ok(l.a_ms >= p.lines[i - 1].b_ms); assert.ok(l.envelope.length > 0); });
});

test('beat: t_in = t0 của từ neo (title: vào ngay đầu clip nhưng giữ t_anchor)', () => {
  const p = plan(), L2 = p.lines[1], L3 = p.lines[2], by = id => p.beats.find(b => b.id === id);
  const idxHN = LINES[1].say.split(' ').indexOf('Hà');
  assert.strictEqual(by('BT-2').t_in, L2.a_ms + idxHN * 300);
  assert.strictEqual(by('BT-3').t_in, L3.a_ms);
  assert.strictEqual(by('BT-4').t_in, L3.a_ms + 5 * 300);
  assert.strictEqual(by('BT-1').t_anchor, p.lines[0].a_ms);
  assert.strictEqual(by('BT-1').t_in, 150);
  p.beats.forEach(b => assert.ok(b.t_in <= p.duration_ms));
});

test('morph: prob-card liền prob-card cùng slot, t_out = mốc link kế', () => {
  const p = plan(), b2 = p.beats.find(b => b.id === 'BT-2'), b3 = p.beats.find(b => b.id === 'BT-3'), st = p.beats.find(b => b.id === 'BT-4');
  assert.strictEqual(b3.morphFrom, 'BT-2');
  assert.deepStrictEqual(b3.slot, b2.slot);
  assert.strictEqual(b2.t_out, b3.t_in);
  assert.strictEqual(st.zone, b3.zone);   // stamp đè lên thẻ
});

test('tự thêm lesson-map + end-card cuối bài, máy quay lùi toàn cảnh', () => {
  const p = plan(), last = p.lines[p.lines.length - 1];
  const map = p.beats.find(b => b.block === 'lesson-map'), end = p.beats.find(b => b.block === 'end-card');
  assert.ok(map && end && map.t_in >= last.b_ms && end.t_in > map.t_in);
  assert.strictEqual(end.params.title, 'Kênh thử');
  const z = p.camera[p.camera.length - 1].z;
  assert.ok(z < 0.75, 'toàn cảnh phải lùi ra (z=' + z + ')');
  assert.ok(p.duration_ms > end.t_in);
});

test('camera: liên tục, không cắt cứng (bước giữa hai khung ≤ ngưỡng)', () => {
  const p = plan(); let prev = camera.sample(p.camera, 0), maxXY = 0, maxZ = 0, moved = 0;
  for (let t = 1000 / 30; t <= p.duration_ms; t += 1000 / 30) {
    const c = camera.sample(p.camera, t), d = Math.hypot(c.x - prev.x, c.y - prev.y);
    maxXY = Math.max(maxXY, d); maxZ = Math.max(maxZ, Math.abs(c.z - prev.z)); if (d > 1) moved++; prev = c;
  }
  assert.ok(maxXY < 160, 'bước tịnh tiến tối đa ' + maxXY);
  assert.ok(maxZ < 0.04, 'bước zoom tối đa ' + maxZ);
  assert.ok(moved > 10, 'máy quay có lia');
  p.camera.forEach((k, i) => { if (i) assert.ok(k.t > p.camera[i - 1].t, 'keyframe tăng dần'); });
  // mọi beat nằm trong khung nhìn khi nó vào (tâm slot cách tâm máy quay < nửa khung/zoom)
  p.beats.filter(b => b.zone).forEach(b => {
    const c = camera.sample(p.camera, b.t_in + 600), cx = b.slot.x + b.slot.w / 2, cy = b.slot.y + b.slot.h / 2;
    assert.ok(Math.abs(cx - c.x) < 960 / c.z && Math.abs(cy - c.y) < 540 / c.z, b.id + ' phải nằm trong khung');
  });
});

test('cues: tên hợp lệ trong sounds của Gen-Chibi, vol 0..1, đúng thứ tự', () => {
  const R = path.join(__dirname, '..', 'vendor', 'gen-chibi'), ctx = { window: {}, console }; vm.createContext(ctx);
  ['engine/core.js', 'engine/i18n.js', 'engine/voices.js', 'engine/sounds.js'].forEach(f => vm.runInContext(fs.readFileSync(path.join(R, f), 'utf8'), ctx, { filename: f }));
  const names = ctx.window.GenChibi.sounds.names(), p = plan();
  assert.ok(p.cues.length >= 6);
  p.cues.forEach((c, i) => { assert.ok(names.includes(c.name), 'âm không có: ' + c.name); assert.ok(c.vol > 0 && c.vol <= 1); assert.ok(c.t_ms >= 0 && c.t_ms <= p.duration_ms + 1500); if (i) assert.ok(c.t_ms >= p.cues[i - 1].t_ms); });
  assert.ok(p.cues.some(c => c.name === 'whoosh'), 'có tiếng vút khi máy quay lia');
});

test('hợp đồng plan: cast, size, actors, zones', () => {
  const p = plan();
  assert.deepStrictEqual(p.size, [1920, 1080]); assert.strictEqual(p.fps, 30);
  assert.deepStrictEqual(Object.keys(p.cast), ['CM-0001', 'CM-0002']);
  assert.deepStrictEqual(p.actors.map(a => a.side), ['left', 'right']);
  assert.ok(p.style.zones.length >= 2 && p.style.world.w >= 2200);
});

test('lỗi: neo sai, khối sai, thiếu cast, quá nhiều người nói', () => {
  const mk = beats => () => buildPlan({ lesson: { lines: LINES, beats }, clips: CLIPS });
  assert.throws(mk([{ block: 'stamp', anchor: { line: 'LN-1', word: 'không có' }, params: { text: 'x' } }]), e => e instanceof PlanError && e.code === 'anchor_not_found');
  assert.throws(mk([{ block: 'stamp', anchor: { line: 'LN-9', word: 'x' }, params: { text: 'x' } }]), e => e.code === 'anchor_line');
  assert.throws(mk([{ block: 'stamp', anchor: { line: 'LN-1', word_index: 99 }, params: { text: 'x' } }]), e => e.code === 'anchor_range');
  assert.throws(mk([{ block: 'stamp', anchor: { line: 'LN-1', word_index: 0 }, params: {} }]), e => e.code === 'block_invalid');
  assert.throws(() => buildPlan({ lesson: { lines: [{ id: 'a', who: 'CM-9', say: 'x y' }], beats: [] } }), e => e.code === 'cast_missing');
  const three = { 'CM-1': {}, 'CM-2': {}, 'CM-3': {} };
  assert.throws(() => buildPlan({ cast: three, lesson: { lines: [{ id: 'a', who: 'CM-1', say: 'x' }, { id: 'b', who: 'CM-2', say: 'y' }, { id: 'c', who: 'CM-3', say: 'z' }], beats: [] } }), e => e.code === 'cast_limit');
});

test('validateAnchors: báo lỗi khi nộp bài, không cần clip', () => {
  assert.deepStrictEqual(validateAnchors({ lines: LINES, beats: BEATS }), []);
  const errs = validateAnchors({ lines: LINES, beats: [{ id: 'X', block: 'stamp', anchor: { line: 'LN-1', word: 'zzz' } }, { id: 'Y', block: 'stamp' }] });
  assert.strictEqual(errs.length, 2);
});

test('không có clip: ước lượng thời lượng, vẫn dựng được; anchor2 đặt t_peak', () => {
  const p = buildPlan({ lesson: { lines: LINES, beats: [{ id: 'B', block: 'token-row', anchor: { line: 'LN-2', word: 'Câu quen' }, anchor2: { line: 'LN-2', word: 'phần trăm' }, params: { tokens: ['a'], next: 'b' } }] } });
  const b = p.beats.find(x => x.id === 'B'); assert.ok(b.t_peak > b.t_in); assert.strictEqual(b.peak_ms, b.t_peak - b.t_in);
});
