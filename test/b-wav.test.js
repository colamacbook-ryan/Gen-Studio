// © 2026 Gen Labs — All rights reserved.
// Test gói B: wav.parse/encode/envelope, provider giả, G-WAV(a), G-SCRIPT, G-PRON, align, srt. Không cần mạng.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const wav = require('../media/wav');
const fake = require('../media/providers/fake');
const providers = require('../media/providers');
const gates = require('../media/gates');
const { align } = require('../media/align');
const srt = require('../media/srt');

test('wav.parse bóc đúng data khi có chunk C2PA đuôi (L-101)', async () => {
  const r = await fake.tts({ voice: 'Kore', text: 'Xin chào các bạn' });
  assert.strictEqual(r.raw.toString('latin1', 0, 4), 'RIFF');
  assert.ok(r.raw.includes(Buffer.from('C2PA')), 'blob thô phải có C2PA');
  assert.ok(r.raw.length > r.wav.length + 6000);
  const p = wav.parse(r.raw);
  const clean = wav.parse(r.wav);
  assert.strictEqual(p.pcm.length, clean.pcm.length);
  assert.deepStrictEqual(Array.from(p.pcm.subarray(-50)), Array.from(clean.pcm.subarray(-50)));
  // đuôi PCM không chứa byte C2PA
  assert.ok(!Buffer.from(p.pcm.buffer).includes(Buffer.from('C2PA')));
  assert.strictEqual(r.wav.length, 44 + p.pcm.length * 2);
  assert.strictEqual(r.duration_ms, Math.round((p.pcm.length / p.rate) * 1000));
});

test('wav.parse: không phải RIFF thì ném, rawRate thì nhận PCM thô', () => {
  assert.throws(() => wav.parse(Buffer.from('not a wav at all')), /RIFF/);
  const pcm = Buffer.alloc(100); pcm.writeInt16LE(1234, 10);
  const p = wav.parse(pcm, { rawRate: 24000 });
  assert.strictEqual(p.pcm.length, 50); assert.strictEqual(p.pcm[5], 1234); assert.strictEqual(p.rate, 24000);
});

test('envelope dao động theo âm tiết; edgePeaks nhỏ ở biên', async () => {
  const r = await fake.tts({ voice: 'Puck', text: 'Hôm nay mình học về mô hình ngôn ngữ lớn' });
  const p = wav.parse(r.wav);
  const env = wav.envelope(p.pcm, p.rate, 30);
  assert.ok(env.length >= 10);
  assert.ok(Math.max(...env) === 1 && Math.min(...env) < 0.3, 'phải có đỉnh và đáy');
  const e = wav.edgePeaks(p.pcm, p.rate, 50);
  assert.ok(e.head < 0.2 && e.tail < 0.2, JSON.stringify(e));
});

test('fake tts → voiceGates: G-WAV pass, G-SCRIPT pass, G-PRON pass', async () => {
  const texts = ['Anh Gen ơi, A.I. là gì vậy?', 'Đó là trí tuệ nhân tạo đó em nhé', 'Ví dụ như ChatGPT chẳng hạn'];
  const clips = [];
  for (const t of texts) clips.push(await fake.tts({ voice: 'Kore', text: t }));
  const sigs = clips.map((c) => gates.tailSig(wav.parse(c.wav).pcm, 24000).sig);
  assert.strictEqual(new Set(sigs).size, 3);
  for (let i = 0; i < clips.length; i++) {
    const j = await fake.judge({ script: texts[i], terms: ['A.I.'] });
    const res = gates.voiceGates({ wav: clips[i].wav, raw: clips[i].raw, judge: j, script: texts[i], termsEffective: ['A.I.'], otherTails: sigs.filter((_, k) => k !== i) });
    assert.deepStrictEqual(res.map((r) => r.result), ['pass', 'pass', 'pass'], JSON.stringify(res));
    assert.deepStrictEqual(res.map((r) => r.gate), ['G-WAV', 'G-SCRIPT', 'G-PRON']);
  }
});

test('WAV ghép kiểu "bọc hai lần" → G-WAV fail', async () => {
  const a = await fake.tts({ voice: 'Kore', text: 'Câu thứ nhất' });
  // Sai lầm L-101: nhét nguyên blob RIFF (kèm C2PA) làm PCM của WAV mới
  const padded = a.raw.length % 2 ? Buffer.concat([a.raw, Buffer.alloc(1)]) : a.raw;
  const pcm = new Int16Array(padded.buffer.slice(padded.byteOffset, padded.byteOffset + padded.length));
  const double = wav.encode({ rate: 24000, channels: 1, pcm });
  const res = gates.voiceGates({ wav: double, raw: a.raw, judge: await fake.judge({ script: 'x' }), termsEffective: [], otherTails: [] });
  assert.strictEqual(res[0].result, 'fail');
  assert.ok(res[0].measure.c2pa_or_extra);
});

test('G-WAV(a) fail khi hai câu có đuôi giống hệt nhau mà không im lặng', async () => {
  const a = wav.parse((await fake.tts({ voice: 'Kore', text: 'Câu A đây' })).wav);
  const b = wav.parse((await fake.tts({ voice: 'Kore', text: 'Câu B khác hẳn' })).wav);
  const junk = new Int16Array(2400); for (let i = 0; i < junk.length; i++) junk[i] = Math.round(Math.sin(i / 3) * 4000);
  const cat = (x) => { const o = new Int16Array(x.pcm.length + junk.length); o.set(x.pcm); o.set(junk, x.pcm.length); return wav.encode({ rate: 24000, channels: 1, pcm: o }); };
  const wa = cat(a), wb = cat(b);
  const sigA = gates.tailSig(wav.parse(wa).pcm, 24000).sig;
  const res = gates.voiceGates({ wav: wb, judge: await fake.judge({ script: 'x' }), termsEffective: [], otherTails: [sigA] });
  assert.strictEqual(res[0].result, 'fail');
  assert.ok(res[0].measure.tail_dup);
  // đuôi im lặng giống nhau thì không phạt
  const sil = (x) => { const o = new Int16Array(x.pcm.length + 2400); o.set(x.pcm); return wav.encode({ rate: 24000, channels: 1, pcm: o }); };
  const s1 = gates.tailSig(wav.parse(sil(a)).pcm, 24000).sig;
  const ok = gates.voiceGates({ wav: sil(b), judge: await fake.judge({ script: 'x' }), termsEffective: [], otherTails: [s1] });
  assert.strictEqual(ok[0].result, 'pass');
});

test('GS_FAKE_FAIL: quota ném ProviderError, pron làm G-PRON fail', async () => {
  const old = process.env.GS_FAKE_FAIL;
  try {
    process.env.GS_FAKE_FAIL = 'quota';
    await assert.rejects(fake.tts({ text: 'x' }), (e) => e instanceof providers.ProviderError && e.code === 'quota' && e.retryAfterSec > 0);
    process.env.GS_FAKE_FAIL = 'pron';
    const t = await fake.tts({ text: 'A.I. rất hay' });
    const j = await fake.judge({ script: 'A.I. rất hay', terms: ['A.I.'] });
    const res = gates.voiceGates({ wav: t.wav, judge: j, termsEffective: ['A.I.'], otherTails: [] });
    assert.strictEqual(res[2].result, 'fail');
  } finally { if (old === undefined) delete process.env.GS_FAKE_FAIL; else process.env.GS_FAKE_FAIL = old; }
});

test('G-SCRIPT/G-PRON: judge lỗi hoặc thiếu → unknown; lệch kịch bản → fail', () => {
  assert.strictEqual(gates.voiceGates({ wav: Buffer.from('xx'), judge: null, termsEffective: ['A.I.'] }).map((r) => r.result).join(), 'unknown,unknown,unknown');
  const j = { transcript: 'hoàn toàn khác', matches: true, extra_speech: false, terms: {}, detected_terms: [] };
  const r = gates.voiceGates({ wav: Buffer.from('xx'), judge: j, script: 'Xin chào các bạn nhé', termsEffective: ['A.I.'] });
  assert.strictEqual(r[1].result, 'fail');
  assert.strictEqual(r[2].result, 'unknown');
});

test('providers.get chọn fake; align + srt', () => {
  assert.strictEqual(providers.get({ fakeProviders: true }), fake);
  const w = align({ say: 'Hà Nội là thủ đô', duration_ms: 2000 });
  assert.strictEqual(w.length, 5); assert.strictEqual(w[0].t0, 0); assert.strictEqual(w[4].t1, 2000);
  const j = align({ say: 'a b', duration_ms: 1000, judgeWordTimes: [{ w: 'a', t0: 100, t1: 400 }, { w: 'b', t0: 450, t1: 900 }] });
  assert.deepStrictEqual(j[1], { w: 'b', t0: 450, t1: 900 });
  const s = srt.build([{ say: 'Xin chào', a_ms: 0, b_ms: 1500 }, { say: 'Tạm biệt', a_ms: 3723004, b_ms: 3725000 }], 'vi');
  assert.match(s, /1\n00:00:00,000 --> 00:00:01,500\nXin chào/);
  assert.match(s, /01:02:03,004/);
  assert.strictEqual(srt.parse(s)[1].a_ms, 3723004);
});
