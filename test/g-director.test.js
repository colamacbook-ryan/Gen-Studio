// © 2026 Gen Labs — All rights reserved.
// Gói V — đạo diễn (render/engine/direct.js + moods.json, SPEC-0.2.0 §3.6, F1-7): mỗi mood cho dòng thời gian biểu cảm KHÁC nhau, phản xạ theo beat, tính cách (tic, gag ≤ max_per_min),
// PiP khi tutorial, tất định, bảng mood khớp engine, và một khung still thật bằng Chromium cho từng mood (tự bỏ qua khi không có Chromium).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const D = require('../render/engine/direct.js');
const { buildPlan } = require('../render/engine/timeline.js');
const { loadEngine, ENUMS } = require('../render/cast/validate.js');
const chromium = require('../render/chromium');

const HAS_CHROMIUM = chromium.find() ? false : 'không có Chromium';
const A = 'CM-0001', B = 'CM-0002';   // cast mặc định: Anh Gen (trái, host chính) · Bé Hỏi (phải, đồng dẫn)
const SPEC_MOODS = ['neutral', 'explain', 'excited', 'shock', 'think', 'unsure', 'smug', 'sad', 'angry', 'panic', 'greedy', 'beg', 'proud', 'vow', 'bored', 'yell'];

// bài mẫu tất định: mỗi câu `ms` mili-giây, không pause riêng (GAP_MS mặc định của timeline)
function planOf(lines, { beats = [], persona, ms = 3000, cursor, layout } = {}) {
  const clips = {}, ls = lines.map((l, i) => { const id = 'LN-' + (i + 1); clips[id] = { duration_ms: l.ms || ms, word_times: null, envelope: new Array(Math.ceil((l.ms || ms) / 1000 * 30)).fill(0.5) }; return { id, who: l.who, say: l.say || 'Xin chào các bạn nhỏ hôm nay mình học một điều mới', mood: l.mood, terms: l.terms || [] }; });
  const plan = buildPlan({ fps: 30, lesson: { title: 'T', lines: ls, beats }, clips, persona, cursor, actorLayout: layout });
  plan.moods = D.MOODS;   // hook plan.after làm việc này trong pipeline
  return plan;
}
const firstWord = (id) => ({ id: 'B-' + id, block: 'title', anchor: { line: id, word_index: 0 }, params: { text: 'Tiêu đề' } });
const sigOf = (tl) => tl.map((x) => [x.state, x.motion, x.eyes === 'closed' ? null : x.eyes, x.brows, x.fx && x.fx.join('+')].join('|')).join(';');
const runs = (xs) => { const out = []; xs.forEach((x, i) => { if (!i || x !== xs[i - 1]) out.push({ v: x, n: 1 }); else out[out.length - 1].n++; }); return out; };

test('moods.json: đủ 16 mood theo §3.6; mọi state/động tác/hiệu ứng/nét mặt tồn tại trong engine vendor; enum năng lượng/tính khí khớp lược đồ công thức', () => {
  const T = D.MOODS, GC = loadEngine().GC;
  assert.deepEqual(Object.keys(T.moods).sort(), SPEC_MOODS.slice().sort());
  const has = (tbl, k, what) => assert.ok(Object.prototype.hasOwnProperty.call(tbl, k), what + ' "' + k + '" có trong engine');
  for (const [name, m] of Object.entries(T.moods)) {
    has(GC.LIB.states, m.state, name + '.state');
    if (m.eyes) has(GC.LIB.eyePoses, m.eyes, name + '.eyes'); if (m.brows) has(GC.LIB.browPoses, m.brows, name + '.brows');
    ['intro', 'motion'].forEach((k) => { if (m.speak[k]) has(GC.LIB.motions, m.speak[k], name + '.speak.' + k); });
    has(GC.LIB.motions, m.listen.motion, name + '.listen.motion'); if (m.listen.state) has(GC.LIB.states, m.listen.state, name + '.listen.state'); if (m.listen.mouth) has(GC.LIB.mouths, m.listen.mouth, name + '.listen.mouth');
    if (m.settle) { has(GC.LIB.states, m.settle.state, name + '.settle.state'); if (m.settle.eyes) has(GC.LIB.eyePoses, m.settle.eyes, name + '.settle.eyes'); }
    assert.ok(!m.speak.intro || m.speak.intro_ms >= 400, name + ': động tác mở đầu ≥ 400 ms');
    assert.ok(!m.hold_ms || m.hold_ms >= 400, name + ': giữ ≥ 400 ms');
  }
  assert.ok(T.moods.excited.hold_ms <= 1200 && T.moods.proud.hold_ms <= 1000, 'confetti ≤ 1,2 s · crown ≤ 1 s');
  assert.ok(T.moods.sad.speak.intro_ms <= 1500, 'weep ≤ 1,5 s');
  assert.deepEqual(Object.keys(T.energy).sort(), ENUMS.energy.slice().sort());
  assert.deepEqual(Object.keys(T.temperament).sort(), ENUMS.temperament.slice().sort());
  assert.deepEqual(Object.keys(T.laugh).sort(), ENUMS.laugh.slice().sort());
  Object.values(T.laugh).forEach((m) => has(GC.LIB.mouths, m, 'laugh'));
  Object.values(T.temperament).forEach((x) => { if (x.eyes) has(GC.LIB.eyePoses, x.eyes, 'temperament.eyes'); if (x.brows) has(GC.LIB.browPoses, x.brows, 'temperament.brows'); });
  Object.entries(T.aliases).forEach(([k, v]) => assert.ok(T.moods[v], 'alias ' + k + ' → ' + v));
});

test('resolveMood: tên chính · alias (calm/happy của bài mẫu cũ) · id state cũ đi thẳng · mood lạ ⇒ neutral', () => {
  const r = (n) => D.resolveMood(null, n);
  assert.equal(r('excited').name, 'excited'); assert.equal(r('calm').name, 'neutral'); assert.equal(r('happy').name, 'excited');
  const w = r('work'); assert.equal(w.def.state, 'work'); assert.ok(w.passthrough, 'id state cũ của 0.1.x vẫn dùng được');
  const x = r('khong-co-mood-nay'); assert.equal(x.name, 'neutral'); assert.equal(x.known, false);
  assert.equal(r(null).name, 'neutral'); assert.equal(r(undefined).known, true, 'không khai mood = neutral, không phải lỗi');
  assert.deepEqual(D.moodNames().sort(), SPEC_MOODS.slice().sort());
});

test('F1-7: 16 mood ⇒ 16 dòng thời gian biểu cảm KHÁC nhau của người nói (state · động tác · mắt · mày · hiệu ứng)', () => {
  const sigs = {};
  for (const mood of SPEC_MOODS) {
    const plan = planOf([{ who: B, mood: 'neutral' }, { who: A, mood }, { who: B, mood: 'neutral' }]);
    const line = plan.lines[1], tl = D.timelineOf(plan, A, 100).filter((x) => x.t >= line.a_ms && x.t <= line.b_ms);
    sigs[mood] = sigOf(tl);
    assert.ok(tl.every((x) => x.mood === D.resolveMood(null, mood).name), mood + ': nhãn mood đúng');
  }
  const uniq = new Set(Object.values(sigs));
  assert.equal(uniq.size, SPEC_MOODS.length, 'mỗi mood một dòng thời gian riêng: ' + JSON.stringify(Object.entries(sigs).filter(([k, v]) => Object.values(sigs).filter((s) => s === v).length > 1).map(([k]) => k)));
  // đúng bảng §3.6: state, động tác mở đầu
  const first = (m) => { const plan = planOf([{ who: B }, { who: A, mood: m }, { who: B }]); const r = D.makeDirector(plan).act(A, plan.lines[1].a_ms + 100); return { state: r.state, motion: r.director.motion }; };
  assert.deepEqual(first('excited'), { state: 'proud', motion: 'fistPump' });
  assert.deepEqual(first('shock'), { state: 'shock', motion: 'recoil' });
  assert.deepEqual(first('think'), { state: 'think', motion: 'chinHand' });
  assert.deepEqual(first('sad'), { state: 'cry', motion: 'weep' });
  assert.deepEqual(first('yell'), { state: 'rage', motion: 'fury' });
  assert.deepEqual(first('neutral'), { state: 'normal', motion: 'talk' });
});

test('hiệu ứng có thời hạn: excited giữ proud ≤ 1,2 s rồi hạ về normal + mắt cười; proud ≤ 1 s; weep ≤ 1,5 s rồi talk', () => {
  const at = (mood, rel) => { const plan = planOf([{ who: B }, { who: A, mood, ms: 4000 }, { who: B }]); const r = D.makeDirector(plan).act(A, plan.lines[1].a_ms + rel); return { state: r.state, motion: r.director.motion, eyes: r.director.eyes }; };
  assert.equal(at('excited', 1100).state, 'proud'); const ex = at('excited', 1500); assert.equal(ex.state, 'normal'); assert.equal(ex.motion, 'talk');
  assert.equal(at('proud', 900).state, 'proud'); assert.equal(at('proud', 1100).state, 'normal');
  assert.equal(at('sad', 1400).motion, 'weep'); assert.equal(at('sad', 1700).motion, 'talk'); assert.equal(at('sad', 1700).state, 'cry');
  // câu quá ngắn: không hạ giữa chừng (tránh đổi state < 400 ms)
  const plan = planOf([{ who: B }, { who: A, mood: 'excited', ms: 1400 }, { who: B }]);
  assert.equal(D.makeDirector(plan).act(A, plan.lines[1].a_ms + 1300).state, 'proud');
});

test('phản ứng người nghe theo mood của người nói (§3.6) + nét mặt theo energy/temperament/laugh của persona', () => {
  const want = { neutral: 'nod', excited: 'cheer', shock: 'recoil', think: 'chinHand', unsure: 'shrug', smug: 'snicker', sad: 'coverHead', angry: 'recoil', panic: 'scramble', greedy: 'rubHands', beg: 'nod', proud: 'cheer', vow: 'fistPump', bored: 'loaf', yell: 'recoil' };
  for (const [mood, motion] of Object.entries(want)) {
    const plan = planOf([{ who: B }, { who: A, mood }, { who: B }]), r = D.makeDirector(plan).act(B, plan.lines[1].a_ms + 300);
    assert.equal(r.director.motion, motion, mood + ' → người nghe ' + motion);
  }
  const lis = (mood, persona) => { const plan = planOf([{ who: B }, { who: A, mood }, { who: B }], { persona }); return D.makeDirector(plan).act(B, plan.lines[1].a_ms + 300); };
  assert.equal(lis('shock').state, 'shock', 'người nghe giật mình cùng state');
  assert.equal(lis('excited', { [B]: { laugh: 'haha', energy: 'hyper' } }).director.mouth, 'laugh');
  assert.equal(lis('smug', { [B]: { laugh: 'smirk' } }).director.mouth, 'cat');
  // energy co giãn thời gian phản ứng: hyper kéo dài hơn calm (cheer 1200 ms gốc)
  const dur = (energy) => { const plan = planOf([{ who: B }, { who: A, mood: 'excited', ms: 5000 }, { who: B }], { persona: { [B]: { energy } } }), dir = D.makeDirector(plan); let n = 0; for (let t = plan.lines[1].a_ms; t < plan.lines[1].b_ms; t += 20) if (dir.act(B, t).director.motion === 'cheer') n++; return n * 20; };
  assert.ok(dur('hyper') > dur('calm') + 300, 'hyper phản ứng lâu hơn calm: ' + dur('hyper') + ' vs ' + dur('calm'));
  // temperament: tsundere nhìn nửa mắt khi đứng nghe (không phản ứng)
  const idle = (temperament) => { const plan = planOf([{ who: B }, { who: A, ms: 6000 }, { who: B }], { persona: { [B]: { temperament } } }), dir = D.makeDirector(plan); return dir.act(B, plan.lines[1].a_ms + 3000).director; };
  assert.equal(idle('tsundere').eyes, 'half'); assert.equal(idle('curious').brows, 'raised'); assert.equal(idle('earnest').eyes, undefined);
});

test('phản xạ theo beat: stamp ⇒ người nghe shock 1,4 s · beat trong câu ⇒ point quay về vùng beat · end-card ⇒ wave/cheer rồi cả hai bow 0,8 s cuối', () => {
  const stamp = { id: 'ST', block: 'stamp', anchor: { line: 'LN-2', word_index: 0 }, params: { text: 'SAI', sub: 'Máy tự tin nhưng sai' } };
  const plan = planOf([{ who: A, mood: 'explain' }, { who: B, mood: 'neutral' }, { who: A, mood: 'explain' }], { beats: [{ id: 'BT', block: 'concept-chip', anchor: { line: 'LN-1', word_index: 2 }, params: { text: 'T' } }, stamp] });
  const dir = D.makeDirector(plan), st = plan.beats.find((b) => b.block === 'stamp'), bt = plan.beats.find((b) => b.id === 'BT');
  // stamp trúng khi A đang nghe (B nói câu 2) ⇒ A shock đúng cửa sổ 1,4 s
  assert.equal(dir.act(A, st.t_in + 100).state, 'shock'); assert.equal(dir.act(A, st.t_in + 1300).state, 'shock'); assert.notEqual(dir.act(A, st.t_in + 1500).state, 'shock');
  // beat trong câu của A: point, quay 3/4 về phía trang vở (A đứng trái ⇒ right45)
  const p = dir.act(A, bt.t_in + 200); assert.equal(p.director.motion, 'point'); assert.equal(p.director.view, 'right45');
  // end-card
  const end = plan.beats.find((b) => b.block === 'end-card'), t1 = end.t_in + 500, tb = plan.duration_ms - 400;
  assert.equal(dir.act(A, t1).director.activity, 'wave'); assert.equal(dir.act(B, t1).director.activity, 'cheer');
  assert.equal(dir.act(A, tb).director.activity, 'bow'); assert.equal(dir.act(B, tb).director.activity, 'bow');
  assert.ok(plan.duration_ms - 800 > end.t_in, 'bow nằm trong đoạn end-card');
  // point của người đứng phải quay ngược lại
  const planB = planOf([{ who: A }, { who: B, mood: 'neutral' }], { beats: [{ id: 'BT2', block: 'concept-chip', anchor: { line: 'LN-2', word_index: 1 }, params: { text: 'T' } }] });
  const pb = D.makeDirector(planB).act(B, planB.beats.find((b) => b.id === 'BT2').t_in + 200); assert.equal(pb.director.motion, 'point'); assert.equal(pb.director.view, 'left45');
});

test('F1-7 bài mẫu 6 câu: ≥ 6 state, ≥ 8 động tác; state ≥ 400 ms; ≤ 30 lần đổi/phút; gag ≤ max_per_min; tất định', () => {
  const persona = {
    [A]: { role: 'host_lead', energy: 'calm', temperament: 'tsundere', laugh: 'smirk', tic: 'chinHand', running_gag: { id: 'sigh-at-hype', trigger: 'on_partner_mood:excited', motion: 'deflate', fx: 'gloomLines', max_per_min: 2 } },
    [B]: { role: 'host_co', energy: 'hyper', temperament: 'curious', laugh: 'haha', tic: 'shrug', running_gag: { id: 'google-it', trigger: 'once_per_lesson', motion: 'point', max_per_min: 1 } },
  };
  const lines = [{ who: B, mood: 'excited', ms: 4000 }, { who: A, mood: 'explain', ms: 4000 }, { who: B, mood: 'shock', ms: 3500 }, { who: A, mood: 'smug', ms: 4000 }, { who: B, mood: 'unsure', ms: 3500 }, { who: A, mood: 'think', ms: 4500 }];
  const stamp = { id: 'ST', block: 'stamp', anchor: { line: 'LN-3', word_index: 0 }, params: { text: 'Ối', sub: 'x' } };
  const plan = planOf(lines, { persona, beats: [{ id: 'BT', block: 'title', anchor: { line: 'LN-2', word_index: 3 }, params: { text: 'T' } }, stamp] });
  const tls = { [A]: D.timelineOf(plan, A, 40), [B]: D.timelineOf(plan, B, 40) };
  const states = new Set(), motions = new Set();
  for (const who of [A, B]) tls[who].forEach((x) => { states.add(x.state); if (x.motion) motions.add(x.motion); if (x.activity) motions.add(x.activity); });
  assert.ok(states.size >= 6, 'state: ' + [...states]); assert.ok(motions.size >= 8, 'động tác: ' + [...motions]);
  for (const who of [A, B]) {
    // tránh nhấp nháy: mỗi đoạn state liền nhau ≥ 400 ms (bỏ đoạn cuối clip bị cắt); ≤ 30 lần đổi/phút
    const rs = runs(tls[who].map((x) => x.state)), ms = (r) => r.n * 40;
    rs.slice(0, -1).forEach((r) => assert.ok(ms(r) >= 400, who + ': state ' + r.v + ' chỉ ' + ms(r) + ' ms'));
    assert.ok((rs.length - 1) / (plan.duration_ms / 60000) <= 30, who + ' đổi state quá nhiều: ' + (rs.length - 1));
  }
  // gag: B chọc A khi A nói "excited"? — gag của A kích bởi mood excited của B; đếm cửa sổ gag theo lịch và theo hình
  const sch = D.makeDirector(plan).schedule();
  const perMin = (list, max) => list.every((g, i) => list.filter((q) => q.a <= g.a && g.a - q.a < 60000).length <= max);
  assert.ok(sch.gags[A].length >= 1, 'A có gag khi B excited'); assert.ok(perMin(sch.gags[A], 2)); assert.ok(sch.gags[B].length <= 1 && perMin(sch.gags[B], 1), 'once_per_lesson ≤ 1');
  assert.deepEqual(tls[A].filter((x) => x.motion === 'deflate').length > 0, true, 'gag hiện thành hình (deflate)');
  assert.ok(tls[A].some((x) => x.fx && x.fx.includes('gloomLines')));
  // tất định: dựng lại cho cùng kết quả
  assert.deepEqual(D.timelineOf(plan, A, 40), tls[A]); assert.deepEqual(D.timelineOf(JSON.parse(JSON.stringify(plan)), B, 40), tls[B]);
});

test('gag max_per_min: trigger lặp dày vẫn ≤ max_per_min trong mọi cửa sổ 60 s và cách nhau ≥ 2,5 s; các trigger khác chạy đúng lúc', () => {
  const g = (trigger, max = 2) => ({ [A]: { tic: 'chinHand', running_gag: { id: 'g', trigger, motion: 'deflate', fx: 'gloomLines', max_per_min: max } } });
  const many = []; for (let i = 0; i < 10; i++) many.push({ who: i % 2 ? A : B, mood: i % 2 ? 'neutral' : 'excited', ms: 3000 });
  const plan = planOf(many, { persona: g('on_partner_mood:excited', 2) }), list = D.makeDirector(plan).schedule().gags[A];
  assert.ok(list.length >= 2);
  list.forEach((x, i) => { assert.ok(list.filter((q) => q.a <= x.a && x.a - q.a < 60000).length <= 2, 'cửa sổ 60 s'); if (i) assert.ok(x.a - list[i - 1].a >= 2500); });
  // on_term_first_use: thuật ngữ mới xuất hiện ở câu người kia
  const t = planOf([{ who: B, terms: ['token'] }, { who: A }, { who: B, terms: ['token'] }], { persona: g('on_term_first_use') });
  assert.equal(D.makeDirector(t).schedule().gags[A].length, 1, 'chỉ lần đầu của thuật ngữ');
  // on_wrong_answer: con dấu có chữ "SAI"; on_end_card: ở thẻ kết
  const w = planOf([{ who: A }, { who: B }, { who: A }], { persona: g('on_wrong_answer'), beats: [{ id: 'ST', block: 'stamp', anchor: { line: 'LN-2', word_index: 0 }, params: { text: 'SAI', sub: '' } }] });
  assert.equal(D.makeDirector(w).schedule().gags[A].length, 1);
  const e = planOf([{ who: A }, { who: B }], { persona: g('on_end_card') }), ds = D.makeDirector(e), gE = ds.schedule().gags[A][0];
  assert.ok(gE && gE.a > ds.schedule().endT); assert.equal(ds.act(A, gE.a + 100).director.motion, 'deflate');
});

test('tic: đứng không nói > 4 s ⇒ chạy persona.tic đúng một lần cho khoảng lặng, không đè lúc đang nói', () => {
  const persona = { [B]: { role: 'host_co', tic: 'shrug' } };
  const plan = planOf([{ who: B, ms: 2000 }, { who: A, ms: 3000 }, { who: A, ms: 3000 }, { who: A, ms: 3000 }, { who: B, ms: 2000 }], { persona });
  const tl = D.timelineOf(plan, B, 20), tics = tl.filter((x) => x.motion === 'shrug' && !x.talking);
  assert.ok(tics.length > 0, 'tic xuất hiện'); const r = runs(tl.map((x) => (x.motion === 'shrug' && !x.talking ? 1 : 0))).filter((x) => x.v === 1);
  assert.equal(r.length, 1, 'đúng một lần'); assert.ok(r[0].n * 20 <= 1400);
  const gap = D.makeDirector(plan).schedule().tics[B]; assert.equal(gap.length, 1);
  assert.ok(gap[0].a - plan.lines[0].b_ms >= 4000, 'sau ≥ 4 s kể từ khi ngừng nói'); assert.ok(gap[0].b <= plan.lines[4].a_ms);
  // khoảng lặng ngắn ⇒ không tic; không persona ⇒ không tic
  const short = planOf([{ who: B, ms: 2000 }, { who: A, ms: 3000 }, { who: B, ms: 2000 }], { persona });
  assert.equal(D.makeDirector(short).schedule().tics[B].length, 0);
  assert.equal(D.makeDirector(plan).schedule().tics[A].length, 0);
});

test('PiP (tutorial): layout pip + plan.cursor ⇒ typing khi con trỏ gõ, point về phía màn hình khi bấm; hidden không diễn', () => {
  const cursor = { keys: [], clicks: [{ t: 15000, x: 900, y: 500 }], typing: [{ t0: 12000, t1: 13500, target: 'x', text: 'ab' }], moves: [] };
  const layout = { [B]: { mode: 'pip', x: 1500, y: 0, scale: 1 }, [A]: { mode: 'hidden' } };
  const plan = planOf([{ who: A, ms: 9000 }, { who: B, ms: 9000 }], { cursor, layout });
  assert.equal(plan.actors[1].layout.mode, 'pip');
  const dir = D.makeDirector(plan);
  assert.equal(dir.act(B, 12500).director.motion, 'typing'); const c = dir.act(B, 15200); assert.equal(c.director.motion, 'point'); assert.equal(c.director.view, 'left45', 'PiP bên phải ⇒ quay sang trái');
  assert.notEqual(dir.act(B, 16500).director.motion, 'typing');
  assert.equal(dir.act(B, 100).director.activity, undefined, 'PiP không chạy walk vào');
  assert.equal(plan.lines[1].a_ms <= 12000 && plan.lines[1].b_ms >= 15200, true, 'tiền đề: B đang nói');
  assert.deepEqual(dir.act(A, 3000), { state: 'normal', director: {}, talking: false, mood: null });
  // kể cả đang nói, gõ phím vẫn ưu tiên (host vừa gõ vừa nói)
  const talking = dir.act(B, 12500); assert.equal(talking.talking, true); assert.equal(talking.director.motion, 'typing');
  // không có cursor ⇒ PiP diễn như host thường
  const plain = planOf([{ who: A }, { who: B, mood: 'think' }], { layout });
  assert.equal(D.makeDirector(plain).act(B, plain.lines[1].a_ms + 1000).director.motion, 'chinHand');
});

test('tương thích: bài cũ (không persona, mood calm/happy/lạ) vẫn diễn như 0.1.x — nod người nghe, point khi có beat, mood lạ ⇒ neutral', () => {
  const plan = planOf([{ who: B, mood: 'calm' }, { who: A, mood: 'happy', ms: 5000 }, { who: B, mood: 'khong-co' }, { who: A, mood: 'calm' }], { beats: [{ id: 'BT', block: 'concept-chip', anchor: { line: 'LN-3', word_index: 2 }, params: { text: 'T' } }] });
  const dir = D.makeDirector(plan);
  assert.equal(dir.act(B, plan.lines[0].a_ms + 100).state, 'normal'); assert.equal(dir.act(A, plan.lines[0].a_ms + 100).director.motion, undefined, 'câu đầu: người nghe không nod');
  assert.equal(dir.act(B, plan.lines[1].a_ms + 300).director.motion, 'cheer', 'happy ≡ excited');
  assert.equal(dir.act(B, plan.lines[2].a_ms + 100).director.motion, 'talk'); assert.equal(dir.act(B, plan.lines[2].a_ms + 100).state, 'normal');
  const bt = plan.beats.find((b) => b.id === 'BT'); assert.equal(dir.act(B, bt.t_in + 200).director.motion, 'point', 'có beat trong câu ⇒ point như cũ');
  assert.equal(dir.act(A, plan.lines[3].a_ms + 500).director.motion, 'nod', 'câu cuối: gật đầu (như cũ)');
  const raw = planOf([{ who: B }, { who: A, mood: 'work' }, { who: B }]);
  assert.equal(D.makeDirector(raw).act(A, raw.lines[1].a_ms + 100).state, 'work', 'id state thẳng như 0.1.x');
  assert.equal(D.makeDirector(Object.assign({}, raw, { moods: undefined })).act(A, raw.lines[1].a_ms + 100).state, 'work', 'plan không mang bảng mood ⇒ dùng bảng của module');
});

// ---------------------------------------------------------------------------------------------------------------------
// Một khung still thật (Chromium) cho từng mood: đúng đường frame của pipeline (renderStill mode:'frame' → __load/__seek), 0 lỗi console, khung khác nhau theo mood.
test('mỗi mood một khung still thật bằng Chromium: 0 lỗi console, 16 ảnh đều khác nhau (người nói + người nghe)', { skip: HAS_CHROMIUM, timeout: 240000 }, async () => {
  const still = require('../render/still');
  const out = process.env.GS_MOOD_STILLS_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'gs-moods-'));
  fs.mkdirSync(out, { recursive: true });
  const hashes = new Map(), sizes = [];
  try {
    for (const mood of SPEC_MOODS) {
      const plan = planOf([{ who: B, mood: 'neutral', ms: 1800 }, { who: A, mood, ms: 3600 }, { who: B, mood: 'neutral', ms: 1800 }]);
      const t = plan.lines[1].a_ms + 1000, file = path.join(out, mood + '.png');
      const r = await still.renderStill({ mode: 'frame', payload: { plan, t_ms: t }, size: [1920, 1080], format: 'png', outFile: file });
      assert.deepEqual(r.errors, [], mood + ': không lỗi console');
      assert.equal(r.measures.stub, false);
      assert.ok(r.buffer.length > 5000, mood + ': ảnh có nội dung');
      hashes.set(mood, crypto.createHash('sha256').update(r.buffer).digest('hex')); sizes.push(r.buffer.length);
    }
  } finally { await still.closeStill(); }
  assert.equal(new Set(hashes.values()).size, SPEC_MOODS.length, 'mọi mood cho khung hình khác nhau: ' + JSON.stringify([...hashes].filter(([k, h]) => [...hashes.values()].filter((x) => x === h).length > 1).map(([k]) => k)));
  if (!process.env.GS_MOOD_STILLS_DIR) fs.rmSync(out, { recursive: true, force: true });
});
