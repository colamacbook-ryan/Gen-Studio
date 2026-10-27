// © 2026 Gen Labs — All rights reserved.
// Trộn giọng + sfx (48 kHz stereo, alimiter), mux H.264/AAC, đo loudness/freeze/cắt bằng ffmpeg.
'use strict';
const { run, probe, ffmpegBin } = require('./probe');

const BASE = ['-hide_banner', '-nostdin', '-y'];

function mixGraph(inputs, duration_ms, gainDb) {
  const fil = [], labs = [];
  inputs.forEach((x, k) => {
    const vol = x.vol == null ? 1 : x.vol;
    fil.push(`[${k}:a]aresample=48000,pan=stereo|c0=c0|c1=c0,volume=${vol},adelay=${Math.round(x.at_ms)}:all=1[a${k}]`);
    labs.push(`[a${k}]`);
  });
  const sec = (duration_ms / 1000).toFixed(3);
  const gain = gainDb ? `volume=${gainDb.toFixed(2)}dB,` : '';
  fil.push(`${labs.join('')}amix=inputs=${labs.length}:normalize=0:dropout_transition=0,apad=whole_dur=${sec},atrim=0:${sec},${gain}alimiter=limit=0.83:level=disabled[o]`);
  return fil.join(';');
}

// Mặc định đo ebur128 rồi chỉnh gain về targetLufs (-16); targetLufs:null để tắt.
async function mix({ voices = [], sfx = [], duration_ms, out, ffmpegPath, targetLufs = -16 }) {
  const inputs = [...voices.map((v) => ({ ...v, vol: 1 })), ...sfx];
  if (!inputs.length) throw new Error('mix: không có nguồn âm thanh nào');
  const bin = ffmpegBin(ffmpegPath);
  const args = [];
  for (const x of inputs) args.push('-i', x.path);
  const render = (gainDb) => run(bin, [...BASE, '-loglevel', 'error', ...args, '-filter_complex', mixGraph(inputs, duration_ms, gainDb),
    '-map', '[o]', '-ar', '48000', '-ac', '2', ...(/\.wav$/i.test(out) ? ['-c:a', 'pcm_s16le'] : []), out]);
  await render(0);
  if (targetLufs != null) {
    const { lufs } = await loudness(out, { ffmpegPath });
    if (Number.isFinite(lufs) && Math.abs(lufs - targetLufs) > 0.3) await render(targetLufs - lufs);
  }
  return out;
}

// srt: file SRT là sidecar do caller ghi (srt.build); không nhúng vào MP4 để giữ đúng 1 video + 1 audio (G-MUX).
async function mux({ framesPattern, videoPath, fps = 30, audio, out, ffmpegPath }) {
  const vin = framesPattern ? ['-framerate', String(fps), '-i', framesPattern] : ['-i', videoPath];
  if (!framesPattern && !videoPath) throw new Error('mux: thiếu framesPattern/videoPath');
  await run(ffmpegBin(ffmpegPath), [...BASE, '-loglevel', 'error', ...vin, '-i', audio, '-map', '0:v:0', '-map', '1:a:0',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', String(fps), '-crf', '18', '-preset', 'medium',
    '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-movflags', '+faststart', '-shortest', out]);
  return out;
}

const num = (s) => (s === '-inf' ? -Infinity : parseFloat(s));

async function loudness(file, { ffmpegPath } = {}) {
  const { stderr } = await run(ffmpegBin(ffmpegPath), ['-hide_banner', '-nostats', '-nostdin', '-i', file, '-filter_complex', 'ebur128=peak=true', '-f', 'null', '-']);
  const sum = stderr.slice(stderr.lastIndexOf('Summary:'));
  const i = sum.match(/\bI:\s+(-?[\d.]+|-inf)\s+LUFS/);
  const tp = sum.match(/True peak:[\s\S]*?Peak:\s+(-?[\d.]+|-inf)\s+dBFS/);
  if (!i || !tp) throw new Error('Không đọc được kết quả ebur128');
  return { lufs: num(i[1]), tp: num(tp[1]) };
}

// → [{start,end}] (giây). Khoảng freeze chưa đóng ở cuối file được đóng bằng độ dài file.
async function freeze(file, { minSec = 2.5, noise = '-60dB', ffmpegPath } = {}) {
  const { stderr } = await run(ffmpegBin(ffmpegPath), ['-hide_banner', '-nostats', '-nostdin', '-i', file, '-an', '-vf', `freezedetect=n=${noise}:d=${minSec}`, '-f', 'null', '-']);
  const out = [];
  let open = null;
  for (const line of stderr.split('\n')) {
    let m;
    if ((m = line.match(/freeze_start:\s*([\d.]+)/))) open = parseFloat(m[1]);
    else if ((m = line.match(/freeze_end:\s*([\d.]+)/)) && open != null) { out.push({ start: open, end: parseFloat(m[1]) }); open = null; }
  }
  if (open != null) {
    const p = await probe(file, { ffmpegPath });
    out.push({ start: open, end: (p.duration_ms || 0) / 1000 });
  }
  return out;
}

// → [t giây] các khung có điểm cảnh > threshold.
async function cuts(file, { threshold = 0.4, ffmpegPath } = {}) {
  const { stderr } = await run(ffmpegBin(ffmpegPath), ['-hide_banner', '-nostats', '-nostdin', '-i', file, '-an', '-vf', `select='gt(scene,${threshold})',showinfo`, '-f', 'null', '-']);
  const out = [];
  for (const line of stderr.split('\n')) {
    if (!line.includes('Parsed_showinfo')) continue;
    const m = line.match(/pts_time:\s*([\d.]+)/);
    if (m) out.push(parseFloat(m[1]));
  }
  return out;
}

// Giải mã ra PCM mono s16 (dùng cho G-WAV(b)).
async function decodeMono(file, { rate = 48000, ffmpegPath } = {}) {
  const { stdout } = await run(ffmpegBin(ffmpegPath), ['-hide_banner', '-nostdin', '-loglevel', 'error', '-i', file, '-vn', '-ac', '1', '-ar', String(rate), '-f', 's16le', 'pipe:1']);
  const n = stdout.length >> 1;
  const pcm = new Int16Array(n);
  for (let i = 0; i < n; i++) pcm[i] = stdout.readInt16LE(i * 2);
  return { rate, pcm };
}

module.exports = { mix, mux, loudness, probe, freeze, cuts, decodeMono };
