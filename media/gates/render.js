// © 2026 Gen Labs — All rights reserved.
// Cổng trên bản dựng: G-WAV(b), G-LOUD, G-SYNC, G-MOTION, G-FRAMES, G-MUX. Lỗi đo → 'unknown'.
'use strict';
const mixmod = require('../mix');
const srtmod = require('../srt');

const G = (gate, result, measure) => ({ gate, result, measure });
const unknown = (gate, e, extra = {}) => G(gate, 'unknown', { error: String((e && e.message) || e), ...extra });

// G-WAV(b): đỉnh sai phân (xung/click) trong ±windowMs quanh mỗi mốc ghép câu so với RMS sai phân vùng lân cận (loại trừ cửa sổ).
async function gateWavB({ mixPath, lines, ffmpegPath, opts = {} }) {
  const o = { windowMs: 50, neighborMs: 500, ratioMax: 12, floorRms: 0.002, ...opts };
  try {
    if (!lines || !lines.length) throw new Error('Không có câu nào để đo mốc ghép');
    const { rate, pcm: x } = await mixmod.decodeMono(mixPath, { ffmpegPath });
    const pcm = new Int32Array(x.length);
    for (let i = 1; i < x.length; i++) pcm[i] = x[i] - x[i - 1];
    const at = (ms) => Math.round((ms * rate) / 1000);
    const w = at(o.windowMs), nb = at(o.neighborMs);
    const marks = [...new Set(lines.flatMap((l) => [l.a_ms, l.b_ms]).filter((x) => Number.isFinite(x)))].sort((a, b) => a - b);
    const worst = { ratio: 0, at_ms: null };
    const bad = [];
    for (const ms of marks) {
      const c = at(ms);
      const s = Math.max(0, c - w), e = Math.min(pcm.length, c + w);
      if (e <= s) continue;
      let peak = 0;
      for (let i = s; i < e; i++) { const v = Math.abs(pcm[i]); if (v > peak) peak = v; }
      let acc = 0, cnt = 0;
      for (const [a, b] of [[Math.max(0, c - nb), s], [e, Math.min(pcm.length, c + nb)]]) for (let i = a; i < b; i++) { acc += pcm[i] * pcm[i]; cnt++; }
      const rms = Math.max(cnt ? Math.sqrt(acc / cnt) / 32768 : 0, o.floorRms);
      const ratio = peak / 32768 / rms;
      if (ratio > worst.ratio) { worst.ratio = ratio; worst.at_ms = ms; }
      if (ratio > o.ratioMax) bad.push(ms);
    }
    return G('G-WAV', bad.length ? 'fail' : 'pass', { tier: 'b', marks: marks.length, worst_ratio: +worst.ratio.toFixed(2), worst_at_ms: worst.at_ms, bad_at_ms: bad });
  } catch (e) { return unknown('G-WAV', e, { tier: 'b' }); }
}

async function gateLoud({ mixPath, ffmpegPath, opts = {} }) {
  const o = { target: -16, tol: 2, tpMax: -1, ...opts };
  try {
    const { lufs, tp } = await mixmod.loudness(mixPath, { ffmpegPath });
    if (!Number.isFinite(lufs) || !Number.isFinite(tp)) return G('G-LOUD', 'unknown', { lufs, tp, error: 'Không đo được (im lặng?)' });
    const ok = Math.abs(lufs - o.target) <= o.tol && tp <= o.tpMax;
    return G('G-LOUD', ok ? 'pass' : 'fail', { lufs, tp, target: o.target, tol: o.tol, tp_max: o.tpMax });
  } catch (e) { return unknown('G-LOUD', e); }
}

function gateSync({ beats, lines }) {
  if (!Array.isArray(beats)) return unknown('G-SYNC', 'Thiếu danh sách beat');
  const bad = beats.map((b, i) => (b && b.anchor_ok === true ? null : i)).filter((x) => x !== null);
  return G('G-SYNC', bad.length ? 'fail' : 'pass', { beats: beats.length, bad_index: bad, lines: (lines || []).length });
}

async function gateMotion({ mp4Path, lines, cutsAllowed = [], ffmpegPath, opts = {} }) {
  const o = { minFreezeSec: 2.5, cutThreshold: 0.4, cutTolSec: 0.1, ...opts };
  try {
    if (!lines) throw new Error('Thiếu danh sách câu');
    const fr = await mixmod.freeze(mp4Path, { minSec: o.minFreezeSec, ffmpegPath });
    const cs = await mixmod.cuts(mp4Path, { threshold: o.cutThreshold, ffmpegPath });
    const voiced = lines.map((l) => [l.a_ms / 1000, l.b_ms / 1000]);
    const badFreeze = fr.filter((f) => voiced.reduce((a, [s, e]) => a + Math.max(0, Math.min(e, f.end) - Math.max(s, f.start)), 0) > o.minFreezeSec);
    const badCuts = cs.filter((t) => !cutsAllowed.some((c) => Math.abs(c - t) <= o.cutTolSec));
    return G('G-MOTION', badFreeze.length || badCuts.length ? 'fail' : 'pass', { freezes: fr, bad_freezes: badFreeze, cuts: cs, bad_cuts: badCuts });
  } catch (e) { return unknown('G-MOTION', e); }
}

function gateFrames({ frames }) {
  if (!frames || !Number.isFinite(frames.expected) || !Number.isFinite(frames.got)) return unknown('G-FRAMES', 'Thiếu số khung');
  const errors = frames.errors || [];
  return G('G-FRAMES', frames.got >= frames.expected && !errors.length ? 'pass' : 'fail', { expected: frames.expected, got: frames.got, errors: errors.slice(0, 5), error_count: errors.length });
}

async function gateMux({ mp4Path, lines, srt, fps = 30, ffmpegPath, opts = {} }) {
  const o = { srtTolMs: 50, ...opts };
  try {
    const p = await mixmod.probe(mp4Path, { ffmpegPath });
    const v = p.streams.filter((s) => s.codec_type === 'video'), a = p.streams.filter((s) => s.codec_type === 'audio');
    const bad = [];
    if (v.length !== 1 || a.length !== 1 || p.streams.length !== 2) bad.push(`luồng: ${v.length} video, ${a.length} audio, tổng ${p.streams.length}`);
    let dv = null, da = null;
    if (v.length === 1 && a.length === 1) {
      if (v[0].codec_name !== 'h264' || v[0].pix_fmt !== 'yuv420p') bad.push('video không phải H.264 yuv420p');
      if (a[0].codec_name !== 'aac') bad.push('audio không phải AAC');
      dv = parseFloat(v[0].duration); da = parseFloat(a[0].duration);
      if (!Number.isFinite(dv) || !Number.isFinite(da)) throw new Error('Không đọc được độ dài luồng');
      if (Math.abs(dv - da) > 1 / fps) bad.push(`audio ${da.toFixed(3)}s lệch video ${dv.toFixed(3)}s`);
    }
    const srtRes = {};
    for (const s of srt || []) {
      const cues = srtmod.parse(s.text);
      const ok = cues.length === (lines || []).length && cues.every((c, i) => Math.abs(c.a_ms - lines[i].a_ms) <= o.srtTolMs && Math.abs(c.b_ms - lines[i].b_ms) <= o.srtTolMs);
      srtRes[s.lang] = ok ? 'ok' : 'lech';
      if (!ok) bad.push(`SRT ${s.lang} không khớp mốc câu`);
    }
    return G('G-MUX', bad.length ? 'fail' : 'pass', { video_s: dv, audio_s: da, streams: p.streams.length, srt: srtRes, problems: bad });
  } catch (e) { return unknown('G-MUX', e); }
}

async function renderGates({ mixPath, mp4Path, lines, beats, frames, cutsAllowed = [], srt, fps = 30, ffmpegPath, opts = {} }) {
  return Promise.all([
    gateWavB({ mixPath, lines, ffmpegPath, opts: opts.wavB }),
    gateLoud({ mixPath, ffmpegPath, opts: opts.loud }),
    gateSync({ beats, lines }),
    gateMotion({ mp4Path, lines, cutsAllowed, ffmpegPath, opts: opts.motion }),
    gateFrames({ frames }),
    gateMux({ mp4Path, lines, srt, fps, ffmpegPath, opts: opts.mux }),
  ]);
}

module.exports = { renderGates, gateWavB, gateLoud, gateSync, gateMotion, gateFrames, gateMux };
