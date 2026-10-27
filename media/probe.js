// © 2026 Gen Labs — All rights reserved.
// Chạy ffmpeg/ffprobe (execFile, không shell) + ffprobe JSON. Dùng chung cho mix.js và gates.
'use strict';
const { execFile } = require('node:child_process');
const path = require('node:path');

function ffmpegBin(p) { return p || 'ffmpeg'; }
function ffprobeBin({ ffprobePath, ffmpegPath } = {}) {
  if (ffprobePath) return ffprobePath;
  if (ffmpegPath) {
    const base = path.basename(ffmpegPath);
    if (base.includes('ffmpeg')) return path.join(path.dirname(ffmpegPath), base.replace('ffmpeg', 'ffprobe'));
  }
  return 'ffprobe';
}

// → {stdout:Buffer, stderr:string}; ném Error{code:'ffmpeg', ...} khi lỗi/không chạy được.
function run(bin, args, { timeout = 600000 } = {}) {
  return new Promise((resolve, reject) => {
    execFile(bin, args, { encoding: 'buffer', maxBuffer: 1 << 30, timeout }, (err, stdout, stderr) => {
      const se = stderr ? stderr.toString('utf8') : '';
      if (err) {
        const e = new Error(`${path.basename(bin)} lỗi: ${err.code === 'ENOENT' ? 'không tìm thấy ' + bin : se.trim().split('\n').slice(-3).join(' | ') || err.message}`);
        e.code = 'ffmpeg'; e.stderr = se;
        return reject(e);
      }
      resolve({ stdout, stderr: se });
    });
  });
}

async function probe(file, opts = {}) {
  const { stdout } = await run(ffprobeBin(opts), ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file]);
  const j = JSON.parse(stdout.toString('utf8'));
  const d = parseFloat(j.format && j.format.duration);
  return { streams: j.streams || [], format: j.format || {}, duration_ms: Number.isFinite(d) ? Math.round(d * 1000) : null };
}

module.exports = { run, probe, ffmpegBin, ffprobeBin };
