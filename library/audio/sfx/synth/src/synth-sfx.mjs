// © 2026 Gen Labs — All rights reserved.
// Thư viện SFX tổng hợp 100% bằng code (không sample, không asset bên thứ ba).
// Mỗi âm: stereo 48 kHz 16-bit, chuẩn hoá đỉnh −1 dBFS, có fade đầu/cuối chống click.
// Dùng: node src/synth-sfx.mjs [thư mục ra=..]   → ghi <tên>.wav + sfx-list.json
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = process.argv[2] || join(dirname(fileURLToPath(import.meta.url)), "..");
mkdirSync(OUT, { recursive: true });
const SR = 48000;
const TAU = Math.PI * 2;

// ---------- primitives ----------
let seed = 20261030;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
const buf = (sec) => [new Float32Array(Math.ceil(sec * SR)), new Float32Array(Math.ceil(sec * SR))];

/** RBJ biquad; type lp|hp|bp|peak|hs|ls. Coefficients recomputed when set() is called. */
class Biquad {
  constructor(type = "lp", f = 1000, q = 0.707, gainDb = 0) { this.type = type; this.x1 = this.x2 = this.y1 = this.y2 = 0; this.set(f, q, gainDb); }
  set(f, q = this.q, gainDb = this.g || 0) {
    this.q = q; this.g = gainDb;
    f = Math.min(Math.max(f, 10), SR * 0.45);
    const w = (TAU * f) / SR, c = Math.cos(w), s = Math.sin(w), a = s / (2 * q), A = Math.pow(10, gainDb / 40);
    let b0, b1, b2, a0, a1, a2;
    switch (this.type) {
      case "hp": b0 = (1 + c) / 2; b1 = -(1 + c); b2 = b0; a0 = 1 + a; a1 = -2 * c; a2 = 1 - a; break;
      case "bp": b0 = a; b1 = 0; b2 = -a; a0 = 1 + a; a1 = -2 * c; a2 = 1 - a; break;
      case "peak": b0 = 1 + a * A; b1 = -2 * c; b2 = 1 - a * A; a0 = 1 + a / A; a1 = -2 * c; a2 = 1 - a / A; break;
      default: b0 = (1 - c) / 2; b1 = 1 - c; b2 = b0; a0 = 1 + a; a1 = -2 * c; a2 = 1 - a;
    }
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0; this.a1 = a1 / a0; this.a2 = a2 / a0;
  }
  p(x) { const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2; this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y; return y; }
}

/** small stereo FDN reverb (4 lines, Householder) applied in place; mix 0..1 */
function reverb([L, R], { mix = 0.25, size = 1, decay = 0.6, damp = 0.35 } = {}) {
  const lens = [1429, 1777, 2131, 2557].map((n) => Math.round(n * size));
  const lines = lens.map((n) => new Float32Array(n)), idx = [0, 0, 0, 0], lp = [0, 0, 0, 0];
  for (let i = 0; i < L.length; i++) {
    const o = lines.map((d, k) => d[idx[k]]);
    const sum = (o[0] + o[1] + o[2] + o[3]) * 0.5;
    const inp = (L[i] + R[i]) * 0.5;
    for (let k = 0; k < 4; k++) {
      let v = (o[k] - sum) * decay + inp * (k % 2 ? 0.6 : -0.6);
      lp[k] += (1 - damp) * (v - lp[k]);
      lines[k][idx[k]] = lp[k];
      idx[k] = (idx[k] + 1) % lens[k];
    }
    L[i] = L[i] * (1 - mix * 0.5) + (o[0] + o[2]) * mix;
    R[i] = R[i] * (1 - mix * 0.5) + (o[1] + o[3]) * mix;
  }
}

const mixIn = (dst, src, at = 0, g = 1) => { const s = Math.floor(at * SR); for (let c = 0; c < 2; c++) for (let i = 0; i < src[c].length && s + i < dst[c].length; i++) if (s + i >= 0) dst[c][s + i] += src[c][i] * g; return dst; };
const panGains = (p) => [Math.cos(((p + 1) * Math.PI) / 4), Math.sin(((p + 1) * Math.PI) / 4)];

/** generic voice: fn(t, p) -> sample or [l, r] */
function voice(sec, fn) { const b = buf(sec), n = b[0].length; for (let i = 0; i < n; i++) { const v = fn(i / SR, i / n); if (Array.isArray(v)) { b[0][i] = v[0]; b[1][i] = v[1]; } else { b[0][i] = v; b[1][i] = v; } } return b; }

// envelopes
const adsr = (t, a, d, s, rStart, r) => (t < a ? t / a : t < a + d ? 1 - (1 - s) * ((t - a) / d) : t < rStart ? s : s * Math.max(0, 1 - (t - rStart) / r));
const expd = (t, k) => Math.exp(-t * k);

// ---------- sound designs ----------
function whoosh({ sec = 0.7, f0 = 300, f1 = 3200, q = 1.4, pan0 = -0.7, pan1 = 0.7, shape = 0.55, air = 0.25, body = 0 } = {}) {
  const bp = [new Biquad("bp", f0, q), new Biquad("bp", f0, q)], hp = new Biquad("hp", 2500, 0.7), bodyLp = new Biquad("lp", 160, 0.8);
  let ph = 0;
  return voice(sec, (t, p) => {
    const e = Math.pow(Math.sin(Math.PI * Math.pow(p, shape)), 2);
    const fc = f0 * Math.pow(f1 / f0, Math.sin((Math.PI / 2) * p));
    bp[0].set(fc, q); bp[1].set(fc * 1.01, q);
    const n = rnd();
    let v = bp[1].p(bp[0].p(n)) * 2.2 + hp.p(n) * air * e;
    if (body) { ph += (TAU * (60 + 80 * p)) / SR; v += bodyLp.p(Math.sin(ph)) * body; }
    const pan = pan0 + (pan1 - pan0) * p, [gl, gr] = panGains(pan);
    return [v * e * gl, v * e * gr];
  });
}

function pop({ f0 = 520, f1 = 1250, sec = 0.16, bright = 0.3, pan = 0 } = {}) {
  let ph = 0; const lp = new Biquad("lp", 6000);
  const [gl, gr] = panGains(pan);
  const b = voice(sec, (t, p) => {
    const f = f1 + (f0 - f1) * Math.exp(-t * 60);
    ph += (TAU * f) / SR;
    const v = (Math.sin(ph) + bright * Math.sin(2 * ph) * expd(t, 40)) * Math.min(1, t / 0.0015) * expd(t, 26) + lp.p(rnd()) * 0.25 * expd(t, 400);
    return [v * gl, v * gr];
  });
  reverb(b, { mix: 0.12, size: 0.5, decay: 0.45 });
  return b;
}

function click({ f = 3800, sec = 0.06, gain = 1 } = {}) {
  const hp = new Biquad("hp", 1200), bp = new Biquad("bp", f, 3);
  let ph = 0;
  return voice(sec, (t) => { ph += (TAU * 1700) / SR; const n = rnd(); return gain * (bp.p(n) * 3 * expd(t, 260) + hp.p(n) * 0.6 * expd(t, 600) + Math.sin(ph) * 0.35 * expd(t, 120)); });
}

function bell(freq, { sec = 2.4, decay = 2.2, partials = [[1, 1], [2.0, 0.35], [2.76, 0.28], [5.4, 0.12], [8.93, 0.05]], pan = 0, att = 0.002 } = {}) {
  const [gl, gr] = panGains(pan);
  return voice(sec, (t) => {
    let v = 0;
    partials.forEach(([m, a], k) => { v += a * Math.sin(TAU * freq * m * t + k) * expd(t, decay * (1 + k * 0.8)); });
    v *= Math.min(1, t / att);
    return [v * gl, v * gr];
  });
}

function thud({ f0 = 140, f1 = 42, sec = 1.1, k = 4.2, crack = 0.4, drive = 2.4 } = {}) {
  let ph = 0; const lp = new Biquad("lp", 900, 0.9), lp2 = new Biquad("lp", 220, 0.7);
  return voice(sec, (t) => {
    const f = f1 + (f0 - f1) * expd(t, 22);
    ph += (TAU * f) / SR;
    const n = rnd();
    return Math.tanh(Math.sin(ph) * drive) * expd(t, k) * 0.9 + lp.p(n) * crack * expd(t, 30) + lp2.p(n) * crack * 0.6 * expd(t, 7);
  });
}

function noiseBurst({ sec = 0.5, lp = 4000, hp = 200, k = 8 } = {}) {
  const a = new Biquad("lp", lp), b = new Biquad("hp", hp);
  return voice(sec, (t) => b.p(a.p(rnd())) * expd(t, k));
}

function norm([L, R], peakDb = -1, fadeIn = 0.002, fadeOut = 0.08) {
  const n = L.length;
  for (let i = 0; i < n; i++) { const t = i / SR, g = Math.min(1, t / fadeIn) * Math.min(1, (n / SR - t) / fadeOut); L[i] *= g; R[i] *= g; }
  let pk = 1e-9; for (let i = 0; i < n; i++) pk = Math.max(pk, Math.abs(L[i]), Math.abs(R[i]));
  const g = Math.pow(10, peakDb / 20) / pk;
  for (let i = 0; i < n; i++) { L[i] *= g; R[i] *= g; }
  // trần độ to cảm nhận: RMS ≤ −14 dBFS (âm dày như glitch/buzz không lấn át cả bộ)
  let ss = 0; for (let i = 0; i < n; i++) ss += L[i] * L[i] + R[i] * R[i];
  const rmsDb = 10 * Math.log10(ss / (2 * n) + 1e-12);
  if (rmsDb > -14) { const k = Math.pow(10, (-14 - rmsDb) / 20); for (let i = 0; i < n; i++) { L[i] *= k; R[i] *= k; } }
  return [L, R];
}

function wav(file, [L, R]) {
  const n = L.length, o = Buffer.alloc(44 + n * 4);
  o.write("RIFF", 0); o.writeUInt32LE(36 + n * 4, 4); o.write("WAVE", 8); o.write("fmt ", 12);
  o.writeUInt32LE(16, 16); o.writeUInt16LE(1, 20); o.writeUInt16LE(2, 22); o.writeUInt32LE(SR, 24); o.writeUInt32LE(SR * 4, 28); o.writeUInt16LE(4, 32); o.writeUInt16LE(16, 34);
  o.write("data", 36); o.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) { o.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i])) * 32767), 44 + i * 4); o.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i])) * 32767), 46 + i * 4); }
  writeFileSync(join(OUT, file), o);
}

// ---------- catalogue ----------
const list = [];
const make = (name, desc, use, b, opts = {}) => { norm(b, opts.peak ?? -1, opts.fi, opts.fo); wav(`${name}.wav`, b); list.push({ file: `sfx/${name}.wav`, name, desc, use, seconds: +(b[0].length / SR).toFixed(3), loop: !!opts.loop }); };

make("whoosh-soft", "Whoosh mềm, chậm, quét trái→phải", "chuyển cảnh nhẹ, soft crossfade, card trượt vào", (() => { const b = whoosh({ sec: 0.9, f0: 250, f1: 1800, q: 0.9, air: 0.12 }); reverb(b, { mix: 0.18 }); return b; })());
make("whoosh-fast", "Whoosh nhanh sáng", "whip pan, chữ bay vào nhanh", whoosh({ sec: 0.38, f0: 600, f1: 5200, q: 1.6, shape: 0.4, air: 0.35 }));
make("whoosh-heavy", "Whoosh dày có thân trầm, dùng cho zoom-through", "zoom-through, camera lao vào, trước cú climax", (() => { const b = whoosh({ sec: 1.0, f0: 180, f1: 4200, q: 1.1, pan0: 0, pan1: 0, shape: 0.8, air: 0.3, body: 0.9 }); reverb(b, { mix: 0.22, size: 1.3 }); return b; })());
make("pop-1", "Pop tròn, trung", "bong bóng chat, icon xuất hiện", pop({}));
make("pop-2", "Pop cao, nhỏ", "stagger phần tử, checklist", pop({ f0: 900, f1: 1900, sec: 0.12, bright: 0.2 }));
make("pop-3", "Pop trầm có độ nảy", "card lớn, số liệu nảy vào", pop({ f0: 260, f1: 720, sec: 0.22, bright: 0.45 }));
make("click", "Click chuột/phím đơn", "CursorClick, bấm nút", click({}));
make("double-click", "Double click", "mở file, xác nhận", mixIn(mixIn(buf(0.2), click({})), click({ f: 4200 }), 0.085, 0.9));
make("ding", "Ding một nốt trong (A5)", "đúng, bật đèn, điểm thông tin", (() => { const b = bell(880, { sec: 1.8, decay: 2.6 }); reverb(b, { mix: 0.22, size: 1.2 }); return b; })());
make("chime", "Chime ba nốt đi lên (C6-E6-G6)", "reveal, mở khoá, hoàn tất bước", (() => { const b = buf(2.4); [1046.5, 1318.5, 1568].forEach((f, i) => mixIn(b, bell(f, { sec: 2, decay: 2.4, pan: -0.4 + i * 0.4 }), i * 0.09, 0.6)); reverb(b, { mix: 0.3, size: 1.4, decay: 0.7 }); return b; })());
make("thud", "Thud trầm, gọn", "đặt vật xuống, chữ rơi chạm sàn", thud({ f0: 120, f1: 50, sec: 0.6, k: 7, crack: 0.25 }));
make("impact", "Impact điện ảnh: boom sub + crack + đuôi vang", "Stamp, cú climax DUY NHẤT", (() => { const b = mixIn(buf(2.6), thud({ f0: 160, f1: 36, sec: 2.2, k: 2.6, crack: 0.7, drive: 3.2 })); mixIn(b, noiseBurst({ sec: 0.4, lp: 7000, hp: 1500, k: 18 }), 0, 0.5); reverb(b, { mix: 0.3, size: 1.8, decay: 0.75, damp: 0.5 }); return b; })(), { fo: 0.5 });
make("riser", "Riser 2.5 s: noise + sóng lên, dừng gắt", "dồn nén trước climax (cắt nhạc → riser → impact)", (() => {
  const sec = 2.5, bp = new Biquad("bp", 300, 2); let p1 = 0, p2 = 0;
  const b = voice(sec, (t, p) => { const f = 110 * Math.pow(8, p * p); p1 += (TAU * f) / SR; p2 += (TAU * f * 1.503) / SR; bp.set(300 * Math.pow(30, p), 2.5); const e = p * p * (1 - Math.pow(p, 40)); const n = bp.p(rnd()) * 1.4; return [(Math.sin(p1) * 0.3 + Math.sin(p2) * 0.18 + n) * e, (Math.sin(p1 + 0.3) * 0.3 + Math.sin(p2 * 1.003) * 0.18 + n) * e]; });
  reverb(b, { mix: 0.25, size: 1.2 }); return b; })(), { fo: 0.01 });
make("swell", "Swell êm (pad dâng lên rồi lắng)", "mở cảnh, breath sau climax, vào payoff", (() => {
  const sec = 3, lp = [new Biquad("lp", 400, 0.8), new Biquad("lp", 400, 0.8)];
  const fr = [220, 277.2, 329.6, 440];
  const b = voice(sec, (t, p) => { const e = Math.pow(Math.sin(Math.PI * Math.min(1, p * 1.15)), 2); lp[0].set(300 + 2400 * e); lp[1].set(300 + 2400 * e); let l = 0, r = 0; fr.forEach((f, k) => { const saw = (x) => 2 * (x - Math.floor(x + 0.5)); l += saw(f * t * 1.002 + k * 0.1); r += saw(f * t * 0.998 + k * 0.3); }); return [lp[0].p(l) * e * 0.3, lp[1].p(r) * e * 0.3]; });
  reverb(b, { mix: 0.35, size: 1.6, decay: 0.75 }); return b; })());
make("tick", "Tick đồng hồ đơn (gỗ)", "đếm ngược Quiz, BigNumberCount", (() => { const bp = new Biquad("bp", 2400, 6); let ph = 0; return voice(0.08, (t) => { ph += (TAU * 1200) / SR; return bp.p(rnd()) * 4 * expd(t, 160) + Math.sin(ph) * 0.4 * expd(t, 90); }); })());
make("error-buzz", "Buzz báo sai (hai nhịp vuông trầm)", "đáp án sai, cảnh báo", (() => { const lp = new Biquad("lp", 1800, 0.9); return voice(0.5, (t) => { const on = t < 0.18 || (t > 0.24 && t < 0.44) ? 1 : 0; const sq = Math.sign(Math.sin(TAU * 150 * t)) * 0.6 + Math.sign(Math.sin(TAU * 151.5 * t)) * 0.4; return lp.p(sq * on) * 0.6; }); })());
make("success", "Success: arpeggio trưởng + lấp lánh", "đáp án đúng, hoàn thành, CTA", (() => { const b = buf(2.2); [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => mixIn(b, bell(f, { sec: 1.6, decay: 3, partials: [[1, 1], [2, 0.3], [3, 0.12]], pan: -0.3 + i * 0.2 }), i * 0.07, 0.55)); for (let i = 0; i < 6; i++) mixIn(b, bell(2093 * (1 + (i % 3) * 0.26), { sec: 0.6, decay: 9, partials: [[1, 1]], pan: rnd() }), 0.3 + i * 0.045, 0.12); reverb(b, { mix: 0.3, size: 1.2 }); return b; })());
make("glitch", "Glitch số: bitcrush + nhát cắt ngẫu nhiên", "RGB split, lỗi hệ thống (≤1/shot)", (() => { let hold = 0, hv = 0; const segs = []; let t = 0; while (t < 0.45) { const d = 0.01 + Math.abs(rnd()) * 0.05; segs.push([t, d, Math.abs(rnd()) * 900 + 80, Math.abs(rnd())]); t += d; } return voice(0.45, (t) => { const s = segs.find(([a, d]) => t >= a && t < a + d) || segs[0]; const [, , f, kind] = s; if (hold-- <= 0) { hold = 2 + Math.floor(kind * 30); hv = kind > 0.5 ? Math.sign(Math.sin(TAU * f * t)) : rnd(); } return hv * (kind > 0.15 ? 0.7 : 0); }); })());
make("paper", "Lật giấy / trượt giấy", "lật thẻ, ChecklistReveal, đổi trang", (() => { const bp = new Biquad("bp", 3000, 0.8), hp = new Biquad("hp", 900); return voice(0.5, (t, p) => { const e = Math.pow(Math.sin(Math.PI * Math.pow(p, 0.5)), 2); const crackle = Math.abs(rnd()) > 0.985 ? rnd() * 3 : 0; bp.set(2000 + 3000 * p, 0.8); return (bp.p(rnd()) * 1.3 + hp.p(crackle)) * e; }); })());
make("typing-loop", "Gõ phím vòng lặp 2 s (khớp đầu–cuối)", "chữ đang gõ, typewriter; đặt loop", (() => { const b = buf(2); let t = 0.02, k = 0; while (t < 1.95) { const c = click({ f: 2600 + Math.abs(rnd()) * 1800, sec: 0.05, gain: 0.5 + Math.abs(rnd()) * 0.5 }); const [gl, gr] = panGains(rnd() * 0.3); c[0] = c[0].map((x) => x * gl); c[1] = c[1].map((x) => x * gr); mixIn(b, c, t); if (k % 9 === 8) mixIn(b, thud({ f0: 400, f1: 220, sec: 0.08, k: 60, crack: 0.3, drive: 1 }), t, 0.35); t += 0.07 + Math.abs(rnd()) * 0.09 + (k % 7 === 6 ? 0.18 : 0); k++; } return b; })(), { fi: 0.0005, fo: 0.0005, loop: true });
make("hit-soft", "Hit nhẹ (thump + chime ngắn) cho medium beat", "medium accent: số liệu, nhấn từ khoá", (() => { const b = mixIn(buf(1.4), thud({ f0: 200, f1: 80, sec: 0.4, k: 10, crack: 0.15, drive: 1.5 }), 0, 0.8); mixIn(b, bell(1318.5, { sec: 1.2, decay: 4 }), 0.005, 0.25); reverb(b, { mix: 0.2 }); return b; })());

writeFileSync(join(OUT, "sfx-list.json"), JSON.stringify({ generator: "sfx/src/synth-sfx.mjs", sampleRate: SR, format: "WAV PCM16 stereo", peak_dbfs: -1, rms_ceiling_dbfs: -14, license: "© 2026 Gen Labs — tự tổng hợp bằng code, không sample bên thứ ba; dùng thương mại tự do", items: list }, null, 1));
console.log(`wrote ${list.length} sfx to ${OUT}`);
