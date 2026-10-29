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
    for (const a of reg.aspectsOf(n)) { const fp = d.footprint(a); assert.ok(d.place === 'hud' ? fp.w === 0 : fp.w > 0 && fp.h > 0, n + ' ' + a); }
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

// ---------- sticky-tracker ----------
test('sticky-tracker: trạng thái suy từ các beat trước (tua lui/tới tất định), add cần text, review lật không sớm hơn lúc úp xong', () => {
  const d = reg.get('sticky-tracker');
  assert.ok(reg.validate('sticky-tracker', { action: 'add', text: 'RÕ VIỆC', fly_at: { line: 'L1', word: 'rõ' } }).ok);
  for (const [p, re] of [[{ action: 'add' }, /cần cụm chữ/], [{ action: 'show', text: 'x' }, /chỉ dùng với action "add"/], [{ action: 'add', text: 'x', flip_at: [1] }, /chỉ dùng với action "review"/], [{ action: 'bay' }, /action/]]) assert.match(reg.validate('sticky-tracker', p).errors.join(' | '), re);
  const lines = [L('L1', 'CM-0001', 'Một hai ba bốn năm sáu bảy tám chín mười')];
  const beats = [{ id: 'S0', block: 'sticky-tracker', anchor: { line: 'L1', word_index: 0 }, params: { action: 'show', title: 'Nhớ', slots: 3 } },
    { id: 'S1', block: 'sticky-tracker', anchor: { line: 'L1', word_index: 2 }, params: { action: 'add', text: 'RÕ VIỆC' } },
    { id: 'S2', block: 'sticky-tracker', anchor: { line: 'L1', word_index: 5 }, params: { action: 'add', text: 'ĐỦ ĐỒ' } }];
  const plan = buildPlan(lesson(lines, beats)), st = (id) => d.stateOf(plan, plan.beats.find((b) => b.id === id));
  assert.deepEqual(st('S2').lines, ['RÕ VIỆC']); assert.equal(st('S2').title, 'Nhớ'); assert.equal(st('S2').slots, 3); assert.equal(st('S1').next.id, 'S2'); assert.equal(st('S2').next, null);
  assert.ok(plan.beats.filter((b) => b.block === 'sticky-tracker').every((b) => b.zone === null), 'HUD: không chiếm vùng trang vở, máy quay không lia tới');
  const T = d.timing({ action: 'review', flip_at: [0, 0, 0, 0] }, [null, 0.2, 0.3, 5, 5.1]);
  assert.deepEqual(T.flips.slice(0, 4).map((x) => +x.toFixed(2)), [1.6, 1.95, 5, 5.35]);
});

// ---------- agent-steps ----------
const AS = { task: 'Xếp lịch họp', steps: [{ text: 'Đọc email', tool: 'mail.doc' }, { text: 'Tìm giờ rảnh', note: 'T5 14:00' }, { text: 'Gửi thư mời', result: 'await' }], decision: 'reject' };
test('agent-steps: validate (decision cần bước await, chỉ 1 await, decide_at cần decision), lịch + trạng thái chung + âm', () => {
  assert.ok(reg.validate('agent-steps', AS).ok, reg.validate('agent-steps', AS).errors.join(';'));
  for (const [p, re] of [[{ steps: [{ text: 'a' }], decision: 'approve' }, /cần một bước có result "await"/], [{ steps: [{ text: 'a', result: 'await' }, { text: 'b', result: 'await' }] }, /chỉ một bước/],
    [{ steps: [{ text: 'a', result: 'await' }], decide_at: 3 }, /cần khai decision/], [{ steps: [] }, /ít nhất 1/], [{ steps: [{ text: 'a', result: 'xong' }] }, /result/], [{ steps: Array(6).fill({ text: 'a' }) }, /tối đa 5/]]) {
    assert.match(reg.validate('agent-steps', p).errors.join(' | '), re);
  }
  const d = reg.get('agent-steps'), T = d.panel.timing(AS, null);
  assert.deepEqual(T.st, [0.8, 4.3, 7.8]); assert.equal(T.aw, 2); assert.equal(+T.dec.toFixed(2), 11);
  assert.deepEqual(d.panel.statusEvents(AS, T).map((e) => e.k), ['idle', 'run', 'await', 'rejected']);
  assert.deepEqual(d.sfxTimed(AS, null).map((s) => s.name), ['slide-up', 'tick', 'tick', 'ding', 'tick']);
  assert.ok(d.panel.timing(AS, [5, 2, null, null]).st[1] >= 5.6, 'cue lùi giờ ⇒ bước sau không trước bước trước');
  const L9 = d.panel.lay(AS, '9:16'), z9 = zoom916(d.footprint('9:16', AS));
  assert.ok(Math.min(L9.tfs, L9.mfs) * z9 >= 28, '9:16 chữ nhỏ nhất ' + Math.min(L9.tfs, L9.mfs) * z9);
  const L16 = d.panel.lay(AS, '16:9'); assert.ok(Math.min(L16.tfs, L16.mfs) * zoomOf(d.footprint('16:9', AS)) * 2 / 3 >= 22, 'chữ UI ≥ 22 px@720');
});

// ---------- checklist-card ----------
test('checklist-card: chữ ≥ 30 px@720, tick tăng dần theo cue, pipBoost; tick_at thừa ⇒ lỗi', () => {
  const d = reg.get('checklist-card'), p = { num: 1, items: ['Hỏi agent cầm chìa nào', 'Tắt quyền Gửi', 'Mình tự bấm Gửi'] };
  assert.ok(reg.validate('checklist-card', p).ok); assert.equal(d.pipBoost, true);
  assert.match(reg.validate('checklist-card', Object.assign({}, p, { tick_at: [1, 2, 3, 4] })).errors.join(), /3 dòng/);
  assert.deepEqual(d.timing(p, [2, 1, null]).ticks.map((x) => +x.toFixed(2)), [2, 2.35, 3.3]);
  for (const a of ['16:9', '9:16']) { const L0 = d.layout(p, a), fp = d.footprint(a, p); assert.ok(a === '16:9' ? L0.fs * zoomOf(fp) * 2 / 3 >= 30 : L0.fs * zoom916(fp) >= 28, a); }
});

// ---------- morph ----------
test('morph: biểu tượng hoặc asset, lịch theo cue, footprint ≤ khung 16:9 (zoom ≥ 1)', () => {
  const d = reg.get('morph'), p = { items: [{ from: 'key', to: 'envelope', to_label: 'Đọc thư' }, { from: 'media/k.png', to: 'send' }] };
  assert.ok(reg.validate('morph', p).ok); assert.match(reg.validate('morph', { items: [] }).errors.join(), /ít nhất 1/);
  assert.match(reg.validate('morph', { items: [{ from: 'key' }] }).errors.join(), /to: còn thiếu/);
  assert.deepEqual(d.assetsOf(p), ['media/k.png']); assert.deepEqual(d.timing(p, [2.5]), { at: 2.5, dur: 0.6 }); assert.equal(d.timing(p, null).at, 1);
  assert.ok(zoomOf(d.footprint('16:9', { items: [{}, {}, {}] })) >= 1);
});
