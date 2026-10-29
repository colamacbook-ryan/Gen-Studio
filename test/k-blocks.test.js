// © 2026 Gen Labs — All rights reserved.
// Gói K — khối cho clip dài (0.2.x): lược đồ + lỗi thân thiện, mốc cue neo chữ (timeline → plan.beats[].cues_ms), âm theo lịch khối (sfxTimed),
// footprint theo tỉ lệ (chữ đủ cỡ sau zoom máy quay 720p/9:16), bộ biểu tượng thuần.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const reg = require('../render/blocks/registry');
const U = require('../render/blocks/util');
const icons = require('../render/blocks/icons');
const { buildPlan, validateAnchors } = require('../render/engine/timeline');
const { clipsOf } = require('../tools/blocks-preview');
const { LONG_BLOCKS } = require('./k-blocks-list');

const lesson = (lines, beats, extra) => Object.assign({ lesson: { title: 'K', lines, beats }, clips: clipsOf(lines), fps: 30 }, extra || {});
const L = (id, who, say) => ({ id, who, say });
const zoomOf = (fp) => Math.min(1.05, Math.max(0.7, Math.min(1340 / fp.w, 660 / fp.h)));   // camera.frameOf (16:9)
const zoom916 = (fp) => Math.min(1.1, Math.max(0.5, Math.min(800 / fp.w, 460 / fp.h)));     // aspects.json 9:16 camera

test('kiểu cue: số giây hoặc neo chữ {line, word|word_index, offset_s}; sai ⇒ lỗi tiếng Việt', () => {
  const S = { type: 'cue' };
  for (const ok of [0, 2.5, { line: 'LN-0001', word: 'Đố' }, { line: 0, word_index: 3 }, { line: 'L1', word: 'x', offset_s: -0.4 }]) assert.deepEqual(U.validate(S, ok), [], JSON.stringify(ok));
  for (const bad of [-1, 700, 'x', [], { line: 'L1' }, { word: 'a' }, { line: 'L1', word: 'a', offset_s: 9 }, { line: 'L1', word: 'a', lạ: 1 }]) {
    const e = U.validate(S, bad); assert.ok(e.length && e.every((x) => /^params/.test(x)), JSON.stringify(bad) + ' → ' + e.join('; '));
  }
});

test('bộ biểu tượng: tên duy nhất, SVG thuần (không script/thuộc tính sự kiện), tên lạ ⇒ rỗng', () => {
  const n = icons.names(); assert.ok(n.length >= 30); assert.equal(new Set(n).size, n.length);
  n.forEach((k) => { const s = icons.svg(k, 80); assert.match(s, /^<svg class="gi" viewBox="0 0 120 120" width="80" height="80"/); assert.ok(!/<script|\son\w+=|href/i.test(s), k); });
  assert.equal(icons.svg('không-có'), ''); assert.equal(icons.has('__proto__'), false);
});

test('mọi khối 0.2.x: có trong sổ (lesson, 16:9 + 9:16), schema object, footprint cả hai tỉ lệ, sfx tĩnh hợp lệ', () => {
  for (const n of LONG_BLOCKS) {
    const d = reg.get(n); assert.ok(d, n); assert.equal(d.schema.type, 'object'); assert.equal(d.schema.additionalProperties, false, n);
    assert.ok(reg.isEnabled(n, 'lesson'), n);
    for (const a of reg.aspectsOf(n)) { const fp = d.footprint(a); assert.ok(fp.w > 0 && fp.h > 0, n + ' ' + a); }
    (d.sfx || []).forEach((s) => assert.ok(['in', 'peak'].includes(s.at) && s.name));
  }
});

// ---------- quiz ----------
const QZ = { question: 'Agent sẽ gửi cho anh Tuấn nào?', options: ['Tuấn Hoàng Long', 'Tuấn Minh Phát', 'Cả hai', 'Không ai'], answer: 1 };
test('quiz: validate đúng/sai (answer ngoài khoảng, guess < 2 ô, comment có answer, tham số lạ)', () => {
  for (const p of [QZ, { question: 'Bạn dặn gì?', mode: 'comment' }, { question: 'Nghĩ?', mode: 'pause', options: ['a', 'b'], answer: 0, countdown: false },
    Object.assign({}, QZ, { count_at: 1.5, reveal_at: { line: 'L1', word: 'Đáp' } })]) { const r = reg.validate('quiz', p); assert.ok(r.ok, r.errors.join(';')); }
  const bad = [[{}, /question: còn thiếu/], [Object.assign({}, QZ, { answer: 4 }), /answer/], [Object.assign({}, QZ, { answer: 3, options: ['a', 'b'] }), /vượt số lựa chọn/],
    [{ question: 'Q', options: ['a'] }, /ít nhất 2 ô/], [{ question: 'Q', mode: 'comment', answer: 0, options: ['a', 'b'] }, /không lật/],
    [Object.assign({}, QZ, { mode: 'lạ' }), /mode/], [Object.assign({}, QZ, { reveal_at: 'sau' }), /reveal_at/], [Object.assign({}, QZ, { x: 1 }), /không có trong khối/]];
  for (const [p, re] of bad) { const r = reg.validate('quiz', p); assert.equal(r.ok, false); assert.match(r.errors.join(' | '), re); }
});
test('quiz: footprint giữ chữ ≥ 44 px@720 (16:9) và ≥ 28 px khung (9:16)', () => {
  const q = reg.get('quiz');
  for (const p of [QZ, Object.assign({}, QZ, { options: QZ.options.slice(0, 3) }), Object.assign({}, QZ, { options: QZ.options.slice(0, 2) }), { question: 'Bạn dặn agent thêm câu gì để nó tự kiểm?', mode: 'comment' }]) {
    const L16 = q.layout(p, '16:9'), z = zoomOf(q.footprint('16:9', p));
    assert.ok(L16.ofs * z * 2 / 3 >= 41 && L16.qfs * z * 2 / 3 >= 37, 'chữ ô/câu hỏi ở 720p: ' + (L16.ofs * z * 2 / 3).toFixed(1));
    const L9 = q.layout(p, '9:16'), z9 = zoom916(q.footprint('9:16', p));
    assert.ok(Math.min(L9.ofs, L9.kfs) * z9 >= 28, '9:16 chữ nhỏ nhất ' + (Math.min(L9.ofs, L9.kfs) * z9).toFixed(1));
  }
});
test('quiz: lịch tất định — đếm theo cue, lật sau countdown; mode pause/comment không đếm; sfx = tick mỗi giây + ding lúc lật', () => {
  const q = reg.get('quiz');
  const P = q.timing(QZ, [2, null]); assert.equal(P.count, 2); assert.equal(P.reveal, 5); assert.equal(P.N, 3);
  assert.equal(q.timing(Object.assign({}, QZ, { countdown: false }), null).N, 0);
  assert.equal(q.timing({ question: 'Q', mode: 'pause', options: ['a', 'b'] }, null).N, 0);
  assert.equal(q.timing({ question: 'Q', mode: 'comment', options: ['a', 'b'] }, null).open, true);
  const s = q.sfxTimed(QZ, [2, 6.5]);
  assert.deepEqual(s.map((x) => [x.t, x.name]), [[0, 'pop'], [2, 'tick'], [3, 'tick'], [4, 'tick'], [6.5, 'ding']]);
  assert.deepEqual(q.sfxTimed(QZ, [2, 6.5]), s, 'gọi lại ra y hệt');
  assert.equal(q.sfxTimed({ question: 'Q', mode: 'comment' }, null).length, 1, 'comment: không tick, không ding');
});

test('timeline: cue neo chữ ⇒ beats[].cues_ms (ms từ lúc khối vào) + âm theo lịch khối; khối cũ không có khoá cues_ms', () => {
  const lines = [L('L1', 'CM-0001', 'Đố bạn nhé: agent gửi cho ai?'), L('L2', 'CM-0002', 'Ba, hai, một.'), L('L3', 'CM-0001', 'Đáp án là anh Minh Phát.')];
  const beats = [{ id: 'B0', block: 'title', anchor: { line: 'L1', word: 'Đố' }, params: { text: 'Câu đố' } },
    { id: 'B1', block: 'quiz', anchor: { line: 'L1', word: 'agent' }, params: Object.assign({}, QZ, { count_at: { line: 'L2', word: 'Ba' }, reveal_at: { line: 2, word: 'Đáp', offset_s: 0.2 } }) }];
  const plan = buildPlan(lesson(lines, beats)), b = plan.beats.find((x) => x.id === 'B1'), w = (l, i) => plan.lines.find((x) => x.id === l).words[i].t0;
  assert.deepEqual(b.cues_ms, [w('L2', 0) - b.t_in, w('L3', 0) + 200 - b.t_in]);
  assert.ok(!('cues_ms' in plan.beats.find((x) => x.id === 'B0')), 'title không khai cues ⇒ không có khoá mới');
  const ticks = plan.cues.filter((c) => c.name === 'tick').map((c) => c.t_ms);
  assert.deepEqual(ticks, [0, 1, 2].map((i) => w('L2', 0) + i * 1000));
  assert.ok(plan.cues.some((c) => c.name === 'ding' && c.t_ms === w('L3', 0) + 200));
  // neo sai: lỗi thân thiện lúc dựng + validateAnchors báo trước
  const bad = [{ id: 'B1', block: 'quiz', anchor: { line: 'L1', word: 'Đố' }, params: Object.assign({}, QZ, { reveal_at: { line: 'L9', word: 'x' } }) }];
  assert.throws(() => buildPlan(lesson(lines, bad)), (e) => e.code === 'anchor_line' && /câu không có/.test(e.text_human));
  const bad2 = [{ id: 'B1', block: 'quiz', anchor: { line: 'L1', word: 'Đố' }, params: Object.assign({}, QZ, { reveal_at: { line: 'L3', word: 'không-có' } }) }];
  assert.match(validateAnchors({ lines, beats: bad2 }).join(' | '), /mốc 2/);
  assert.match(validateAnchors({ lines, beats: bad }).join(' | '), /câu không có \(L9\)/);
});

// ---------- compare-split ----------
const CS = { panels: [{ title: 'Tổng đài viên', art: 'headset', label: 'CHATBOT' }, { title: 'Thư ký', art: 'keys', props: ['door'], label: 'AGENT', tone: 'warm' }],
  steps: [{ panel: 0, text: 'Chỉ tư vấn' }, { panel: 1, text: 'Mở tủ', icon: 'folder', at: 3 }, { panel: 1, text: 'Gọi điện', icon: 'phone' }] };
test('compare-split: validate (panel ngoài khoảng, biểu tượng lạ, thiếu art), lịch nhịp tăng dần + nhãn sau cùng', () => {
  assert.ok(reg.validate('compare-split', CS).ok, reg.validate('compare-split', CS).errors.join(';'));
  assert.ok(reg.validate('compare-split', { panels: [{ art: 'AS-0001' }] }).ok, 'asset ngoài bộ biểu tượng');
  const bad = [[{ panels: [] }, /ít nhất 1/], [{ panels: [{ art: 'key' }], steps: [{ panel: 1, text: 'x' }] }, /chỉ có 1 khung/], [{ panels: [{ title: 'x' }] }, /art: còn thiếu/],
    [{ panels: [{ art: 'key', props: ['rồng'] }] }, /props\[0\]/], [{ panels: [{ art: 'key' }], steps: [{ panel: 0, text: 'x'.repeat(27) }] }, /dài tối đa 26/]];
  for (const [p, re] of bad) { const r = reg.validate('compare-split', p); assert.equal(r.ok, false); assert.match(r.errors.join(' | '), re); }
  const d = reg.get('compare-split'), T = d.timing(CS, d.cues(CS).map((c) => (typeof c === 'number' ? c : null)));
  assert.deepEqual(T.steps, [1.4, 3, 4.6]); assert.equal(T.label, 5.8);
  assert.deepEqual(d.timing(CS, [5, 2, null, null]).steps, [5, 5.3, 5.6], 'cue lùi giờ ⇒ nhịp không chồng (cách ≥ 0,3 s)');
  assert.deepEqual(d.assetsOf({ panels: [{ art: 'key' }, { art: 'media/ab/x.png' }] }), ['media/ab/x.png']);
  assert.equal(d.mapAssets({ panels: [{ art: 'key' }, { art: 'AS-1' }] }, (a) => 'p/' + a).panels[1].art, 'p/AS-1');
  for (const a of ['16:9', '9:16']) { const L0 = d.layout(CS, a), fp = d.footprint(a, CS), z = a === '16:9' ? zoomOf(fp) : zoom916(fp); assert.ok(L0.sfs * z >= (a === '16:9' ? 45 : 28), a + ' chữ nhịp ' + L0.sfs * z); }
});
