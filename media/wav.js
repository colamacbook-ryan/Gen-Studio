// © 2026 Gen Labs — All rights reserved.
// Đọc/ghi WAV PCM 16-bit: duyệt chunk RIFF, chỉ lấy 'data' (bỏ C2PA đuôi — L-101); envelope và đỉnh biên.
'use strict';

function isRiff(buf) {
  return buf.length >= 12 && buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WAVE';
}

// parse(buf, {rawRate}) — RIFF: chỉ lấy chunk 'data'. Không phải RIFF: ném lỗi,
// trừ khi truyền rawRate (PCM thô 16-bit LE mono, vd mime audio/L16;rate=24000).
function parse(buf, opts = {}) {
  if (!Buffer.isBuffer(buf)) buf = Buffer.from(buf);
  if (!isRiff(buf)) {
    if (opts.rawRate) {
      const n = buf.length >> 1;
      const pcm = new Int16Array(n);
      for (let i = 0; i < n; i++) pcm[i] = buf.readInt16LE(i * 2);
      return { rate: opts.rawRate, channels: 1, bits: 16, pcm };
    }
    throw new Error('Không phải RIFF/WAVE (magic bytes sai)');
  }
  let pos = 12, fmt = null;
  while (pos + 8 <= buf.length) {
    const id = buf.toString('latin1', pos, pos + 4);
    const size = buf.readUInt32LE(pos + 4);
    const body = pos + 8;
    if (id === 'fmt ') {
      if (body + 16 > buf.length) throw new Error('Chunk fmt bị cắt cụt');
      let tag = buf.readUInt16LE(body);
      if (tag === 0xfffe && size >= 26) tag = buf.readUInt16LE(body + 24);
      fmt = { tag, channels: buf.readUInt16LE(body + 2), rate: buf.readUInt32LE(body + 4), bits: buf.readUInt16LE(body + 14) };
    } else if (id === 'data') {
      if (!fmt) throw new Error('Chunk data đứng trước fmt');
      if (fmt.tag !== 1 || fmt.bits !== 16) throw new Error('Chỉ hỗ trợ PCM 16-bit (tag=' + fmt.tag + ', bits=' + fmt.bits + ')');
      if (!fmt.channels) throw new Error('fmt channels = 0');
      const end = Math.min(body + size, buf.length);
      let n = (end - body) >> 1;
      n -= n % fmt.channels;
      const pcm = new Int16Array(n);
      for (let i = 0; i < n; i++) pcm[i] = buf.readInt16LE(body + i * 2);
      return { rate: fmt.rate, channels: fmt.channels, bits: 16, pcm };
    }
    pos = body + size + (size & 1);
  }
  throw new Error('Không tìm thấy chunk data trong WAV');
}

function encode({ rate, channels = 1, pcm }) {
  const bytes = pcm.length * 2;
  const buf = Buffer.alloc(44 + bytes);
  buf.write('RIFF', 0, 'latin1'); buf.writeUInt32LE(36 + bytes, 4); buf.write('WAVE', 8, 'latin1');
  buf.write('fmt ', 12, 'latin1'); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(channels, 22);
  buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * channels * 2, 28); buf.writeUInt16LE(channels * 2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36, 'latin1'); buf.writeUInt32LE(bytes, 40);
  for (let i = 0; i < pcm.length; i++) buf.writeInt16LE(pcm[i], 44 + i * 2);
  return buf;
}

// RMS từng khung 1/fps giây, chuẩn hoá theo khung lớn nhất → 0..1 (coi pcm là mono/đã trộn).
function envelope(pcm, rate, fps = 30) {
  const hop = Math.max(1, Math.floor(rate / fps));
  const out = [];
  let max = 0;
  for (let s = 0; s < pcm.length; s += hop) {
    const e = Math.min(pcm.length, s + hop);
    let acc = 0;
    for (let i = s; i < e; i++) acc += pcm[i] * pcm[i];
    const rms = Math.sqrt(acc / (e - s));
    out.push(rms);
    if (rms > max) max = rms;
  }
  return max > 0 ? out.map((v) => v / max) : out.map(() => 0);
}

// Đỉnh |mẫu| (0..1 so với full-scale) của `ms` đầu và `ms` cuối.
function edgePeaks(pcm, rate, ms = 50) {
  const n = Math.max(1, Math.round((rate * ms) / 1000));
  const peak = (a, b) => { let m = 0; for (let i = a; i < b; i++) { const v = Math.abs(pcm[i]); if (v > m) m = v; } return m / 32768; };
  return { head: peak(0, Math.min(n, pcm.length)), tail: peak(Math.max(0, pcm.length - n), pcm.length) };
}

module.exports = { parse, encode, envelope, edgePeaks, isRiff };
