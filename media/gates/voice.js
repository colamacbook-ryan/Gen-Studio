// © 2026 Gen Labs — All rights reserved.
// Cổng theo từng câu giọng: G-WAV(a), G-SCRIPT, G-PRON. Lỗi đo → 'unknown', không bao giờ pass.
'use strict';
const crypto = require('node:crypto');
const wav = require('../wav');
const { viNumbers } = require('../vi-numbers');

const DEFAULTS = { edgeMs: 50, edgeMax: 0.3, tailMs: 100, silence: 0.01, scriptMaxDist: 0.15, asrShortWords: 3, asrShortMaxDist: 0.5 };

const G = (gate, result, measure) => ({ gate, result, measure });
const unknown = (gate, e, extra = {}) => G(gate, 'unknown', { error: String((e && e.message) || e), ...extra });

// Chữ ký đuôi: băm 100 ms PCM cuối + có im lặng không.
function tailSig(pcm, rate, ms = DEFAULTS.tailMs) {
  const n = Math.max(1, Math.round((rate * ms) / 1000));
  const tail = pcm.subarray(Math.max(0, pcm.length - n));
  let peak = 0;
  for (let i = 0; i < tail.length; i++) { const v = Math.abs(tail[i]); if (v > peak) peak = v; }
  const sig = crypto.createHash('sha1').update(Buffer.from(tail.buffer, tail.byteOffset, tail.byteLength)).digest('hex');
  return { sig, peak: peak / 32768 };
}

function toSig(x, rate) {
  if (typeof x === 'string') return x;
  if (x && x.sig) return x.sig;
  if (x instanceof Int16Array) return tailSig(x, rate).sig;
  if (Buffer.isBuffer(x)) return tailSig(wav.isRiff(x) ? wav.parse(x).pcm : new Int16Array(x.buffer.slice(x.byteOffset, x.byteOffset + (x.length & ~1))), rate).sig;
  return String(x);
}

function gateWavA({ wav: wavBuf, raw, otherTails = [], opts = {} }) {
  const o = { ...DEFAULTS, ...opts };
  try {
    const p = wav.parse(wavBuf);
    if (!p.pcm.length) return G('G-WAV', 'fail', { tier: 'a', reason: 'Âm thanh rỗng' });
    const edges = wav.edgePeaks(p.pcm, p.rate, o.edgeMs);
    // Byte C2PA/JUMBF lọt vào PCM = bọc hai lần (L-101)
    const polluted = wavBuf.includes(Buffer.from('C2PA', 'latin1')) || wavBuf.length !== 44 + p.pcm.length * 2;
    const t = tailSig(p.pcm, p.rate, o.tailMs);
    const dup = t.peak > o.silence && otherTails.some((x) => toSig(x, p.rate) === t.sig);
    let rawOk = true;
    if (raw && wav.isRiff(raw)) { const r = wav.parse(raw); rawOk = r.pcm.length === p.pcm.length; }
    const bad = [];
    if (edges.head > o.edgeMax) bad.push('đầu câu có xung');
    if (edges.tail > o.edgeMax) bad.push('cuối câu có xung');
    if (polluted) bad.push('WAV chứa byte thừa/C2PA');
    if (dup) bad.push('đuôi giống hệt câu khác');
    if (!rawOk) bad.push('PCM khác blob gốc');
    return G('G-WAV', bad.length ? 'fail' : 'pass', { tier: 'a', head: edges.head, tail: edges.tail, tail_sig: t.sig, c2pa_or_extra: polluted, tail_dup: dup, problems: bad });
  } catch (e) { return unknown('G-WAV', e, { tier: 'a' }); }
}

// Khoảng cách Levenshtein chuẩn hoá theo ký tự (chữ thường, bỏ dấu câu).
function normText(s) { return String(s).toLowerCase().normalize('NFC').replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ').trim(); }
function dist(a, b) {
  const m = a.length, n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n] / Math.max(1, m, n);
}

function gateScript({ judge, script, opts = {} }) {
  const o = { ...DEFAULTS, ...opts };
  if (!judge || judge.error || typeof judge.matches !== 'boolean') return unknown('G-SCRIPT', (judge && judge.error) || 'Không có kết quả giám khảo');
  const bad = [];
  if (judge.extra_speech) bad.push('có lời thừa');
  let d = null, maxDist = o.scriptMaxDist;
  // giám khảo ASR (whisper, judge.asr): câu cực ngắn (≤ asrShortWords từ) thiếu ngữ cảnh nên ASR nghe lệch dù giọng đúng («À, ra vậy!» → «xa vậy»)
  // ⇒ nới ngưỡng ký tự (≈ sai 1 âm tiết); lời nghe khác hẳn («Hẹn gặp lại») vẫn trượt. Giám khảo LLM (Gemini) giữ ngưỡng gốc.
  const shortAsr = judge.asr === true && script && normText(script).split(' ').filter(Boolean).length <= o.asrShortWords;
  if (shortAsr) maxDist = o.asrShortMaxDist;
  if (script && typeof judge.transcript === 'string') {
    d = dist(normText(viNumbers(script)), normText(viNumbers(judge.transcript)));   // "92%" ≡ "chín mươi hai phần trăm" (W3: whisper chép chữ số)
    if (d > maxDist) bad.push('lời chép lệch kịch bản ' + d.toFixed(2));
  }
  if (!judge.matches && !(shortAsr && d !== null && d <= maxDist)) bad.push('giám khảo báo không khớp kịch bản');
  return G('G-SCRIPT', bad.length ? 'fail' : 'pass', { matches: judge.matches, extra_speech: !!judge.extra_speech, char_dist: d, max_dist: maxDist, short_asr: !!shortAsr, problems: bad });
}

function gatePron({ judge, termsEffective = [] }) {
  if (!judge || judge.error || typeof judge.terms !== 'object' || !judge.terms) return unknown('G-PRON', (judge && judge.error) || 'Không có kết quả giám khảo');
  const per = {};
  for (const t of termsEffective) per[t] = judge.terms[t] || 'unknown';
  const vals = Object.values(per);
  const result = vals.includes('vietnamese') ? 'fail' : vals.some((v) => v !== 'english') ? 'unknown' : 'pass';
  return G('G-PRON', result, { terms: per, detected_terms: judge.detected_terms || [] });
}

// otherTails: chữ ký/PCM đuôi của CÁC CÂU KHÁC (không gồm clip dùng chung nội dung với câu này).
function voiceGates({ wav: wavBuf, raw, judge, script, termsEffective = [], otherTails = [], opts = {} }) {
  return [gateWavA({ wav: wavBuf, raw, otherTails, opts }), gateScript({ judge, script, opts }), gatePron({ judge, termsEffective })];
}

module.exports = { voiceGates, gateWavA, gateScript, gatePron, tailSig, normText, dist };   // normText/dist dùng chung với giám khảo offline (một công thức)
