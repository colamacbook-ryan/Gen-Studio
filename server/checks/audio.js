// © 2026 Gen Labs — All rights reserved.
// AU-01..04 (STANDARD-KIT-v1.md §4.5) bằng ffmpeg/ffprobe: định dạng, true peak, LUFS, không lặng đầu (SFX).
// Dùng lại media/probe.js (ffprobe JSON) + media/mix.js (ebur128) — không viết lại đo loudness.
'use strict';
const { probe } = require('../../media/probe.js');
const { loudness } = require('../../media/mix.js');
const { run, ffmpegBin } = require('../../media/probe.js');

// AU-01: WAV 48 kHz / 24-bit.
async function formatOk(file, { ffmpegPath, sampleRate = 48000, bitsPerSample = 24 } = {}) {
  const p = await probe(file, { ffmpegPath });
  const a = p.streams.find((s) => s.codec_type === 'audio');
  if (!a) return { ok: false, reason: 'không có luồng âm thanh', measured: {} };
  const sr = Number(a.sample_rate), bits = Number(a.bits_per_raw_sample || a.bits_per_sample);
  const isWav = /pcm/.test(String(a.codec_name || '')) || /wav$/i.test(String(p.format.format_name || ''));
  const ok = isWav && sr === sampleRate && bits === bitsPerSample;
  return { ok, measured: { codec: a.codec_name, sample_rate: sr, bits_per_sample: bits, format_name: p.format.format_name } };
}

// AU-02 (true peak ≤ -1 dBFS) + AU-03 (integrated -16 LUFS ± 1 LU) qua ebur128 (media/mix.js:loudness).
async function loudnessChecks(file, { ffmpegPath, targetLufs = -16, lufsTol = 1, tpMax = -1 } = {}) {
  const { lufs, tp } = await loudness(file, { ffmpegPath });
  return {
    lufs, tp,
    peakOk: Number.isFinite(tp) && tp <= tpMax,
    lufsOk: Number.isFinite(lufs) && Math.abs(lufs - targetLufs) <= lufsTol,
  };
}

// AU-04 (SFX, không lặng đầu 50 ms): silencedetect — khoảng lặng đầu (nếu có) phải ngắn hơn startMaxMs.
async function noLeadSilence(file, { ffmpegPath, startMaxMs = 50, noise = '-50dB' } = {}) {
  const { stderr } = await run(ffmpegBin(ffmpegPath), ['-hide_banner', '-nostats', '-nostdin', '-i', file,
    '-af', `silencedetect=noise=${noise}:d=0.01`, '-f', 'null', '-']);
  const m = stderr.match(/silence_start:\s*([\d.]+)/);
  const startSilence = m && parseFloat(m[1]) <= 0.001;
  let leadMs = 0;
  if (startSilence) {
    const e = stderr.match(/silence_end:\s*([\d.]+)/);
    leadMs = e ? Math.round(parseFloat(e[1]) * 1000) : null;
  }
  const ok = !startSilence || (leadMs != null && leadMs <= startMaxMs);
  return { ok, leadMs };
}

module.exports = { formatOk, loudnessChecks, noLeadSilence };
