// © 2026 Gen Labs — All rights reserved.
// Provider giả cho test/e2e (GS_FAKE_PROVIDERS=1): giọng tổng hợp có âm tiết, bọc RIFF + chunk C2PA rác ở đuôi.
// GS_FAKE_FAIL=quota|pron để giả lỗi.
'use strict';
const wav = require('../wav');
const { ProviderError } = require('./index');

const RATE = 24000;
const SYL_MS = 220;
const VOICES = ['Kore', 'Puck', 'Charon', 'Zephyr'];

function hashStr(s) { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0; return h; }

function synth(text, voice) {
  const syl = Math.max(4, Math.ceil(String(text).length / 3)); // ~3 ký tự / âm tiết
  const n = Math.round((syl * SYL_MS * RATE) / 1000);
  const f0 = 110 + (hashStr(voice) % 110);
  const per = (SYL_MS * RATE) / 1000;
  const phi = ((hashStr(text) % 1000) / 1000) * 2 * Math.PI; // lệch pha theo nội dung: câu khác nhau không trùng đuôi
  const pcm = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    const ph = (i % per) / per; // 0..1 trong âm tiết; đầu/cuối âm tiết = 0 nên biên câu im
    const env = Math.pow(Math.sin(Math.PI * ph), 2);
    const t = i / RATE;
    const w = 2 * Math.PI * f0 * t + phi;
    const s = Math.sin(w) + 0.4 * Math.sin(2 * w) + 0.2 * Math.sin(3 * w);
    pcm[i] = Math.round((s / 1.6) * env * 0.5 * 32767);
  }
  return pcm;
}

// RIFF: fmt, data, rồi chunk 'C2PA' 6 KB rác ở đuôi (giống blob thật).
function wrapWithC2pa(pcm, seed) {
  const clean = wav.encode({ rate: RATE, channels: 1, pcm });
  const junk = Buffer.alloc(6144);
  let x = hashStr(seed) || 1;
  for (let i = 0; i < junk.length; i++) { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; junk[i] = x >>> 24; }
  const head = Buffer.alloc(8); head.write('C2PA', 0, 'latin1'); head.writeUInt32LE(junk.length, 4);
  const out = Buffer.concat([clean, head, junk]);
  out.writeUInt32LE(out.length - 8, 4);
  return out;
}

async function probe() {
  const quota = { value: null, source: 'unknown' };
  return { models: [{ kind: 'tts', model: 'fake-tts', available: true, quota: { ...quota } }, { kind: 'judge', model: 'fake-judge', available: true, quota: { ...quota } }],
    voices: VOICES.slice(), voices_source: 'builtin_list' };
}

async function tts({ voice = 'Kore', text = '' }) {
  if (process.env.GS_FAKE_FAIL === 'quota') throw new ProviderError('quota', 'Giả lập hết lượt.', { retryAfterSec: 5 });
  const raw = wrapWithC2pa(synth(text, voice), voice + '|' + text);
  const p = wav.parse(raw);
  return { raw, wav: wav.encode(p), duration_ms: Math.round((p.pcm.length / p.rate) * 1000) };
}

async function judge({ script = '', terms = [] }) {
  const bad = process.env.GS_FAKE_FAIL === 'pron';
  const tm = {};
  for (const t of terms) tm[t] = bad ? 'vietnamese' : 'english';
  return { transcript: script, matches: true, extra_speech: false, terms: tm, detected_terms: [], word_times: null };
}

module.exports = { tts, judge, probe, wrapWithC2pa, synth, RATE };
