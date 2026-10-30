// © 2026 Gen Labs — All rights reserved.
// Bộ soạn nhạc thủ tục (procedural): 4 nền nhạc 30 s lặp liền, 100% tổng hợp bằng code — không sample, không model.
// Vòng lặp liền: dựng 2 vòng liên tiếp rồi lấy vòng thứ hai ⇒ đuôi vang/delay của cuối vòng đã chảy sang đầu vòng.
// Dùng: node src/compose.mjs [thư mục ra=..] [tên bài…]
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = process.argv[2] || join(dirname(fileURLToPath(import.meta.url)), "..");
const ONLY = process.argv.slice(3);
mkdirSync(OUT, { recursive: true });
const SR = 48000, TAU = Math.PI * 2, LOOP = 30;

// ---------------- DSP ----------------
let seed = 1;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
class Biquad {
  constructor(type = "lp", f = 1000, q = 0.707, g = 0) { this.t = type; this.x1 = this.x2 = this.y1 = this.y2 = 0; this.set(f, q, g); }
  set(f, q = this.q, g = this.g || 0) {
    this.q = q; this.g = g; f = Math.min(Math.max(f, 15), SR * 0.45);
    const w = (TAU * f) / SR, c = Math.cos(w), s = Math.sin(w), a = s / (2 * q), A = Math.pow(10, g / 40);
    let b0, b1, b2, a0, a1, a2;
    if (this.t === "hp") { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = b0; a0 = 1 + a; a1 = -2 * c; a2 = 1 - a; }
    else if (this.t === "bp") { b0 = a; b1 = 0; b2 = -a; a0 = 1 + a; a1 = -2 * c; a2 = 1 - a; }
    else if (this.t === "peak") { b0 = 1 + a * A; b1 = -2 * c; b2 = 1 - a * A; a0 = 1 + a / A; a1 = -2 * c; a2 = 1 - a / A; }
    else if (this.t === "hs") { const sq = 2 * Math.sqrt(A) * a; b0 = A * (A + 1 + (A - 1) * c + sq); b1 = -2 * A * (A - 1 + (A + 1) * c); b2 = A * (A + 1 + (A - 1) * c - sq); a0 = A + 1 - (A - 1) * c + sq; a1 = 2 * (A - 1 - (A + 1) * c); a2 = A + 1 - (A - 1) * c - sq; }
    else if (this.t === "ls") { const sq = 2 * Math.sqrt(A) * a; b0 = A * (A + 1 - (A - 1) * c + sq); b1 = 2 * A * (A - 1 - (A + 1) * c); b2 = A * (A + 1 - (A - 1) * c - sq); a0 = A + 1 + (A - 1) * c + sq; a1 = -2 * (A - 1 + (A + 1) * c); a2 = A + 1 + (A - 1) * c - sq; }
    else { b0 = (1 - c) / 2; b1 = 1 - c; b2 = b0; a0 = 1 + a; a1 = -2 * c; a2 = 1 - a; }
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0; this.a1 = a1 / a0; this.a2 = a2 / a0;
  }
  p(x) { const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2; this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y; return y; }
}

/** a stereo bus: instruments write into it; bus has send amounts to reverb/delay and a sidechain flag */
class Bus {
  constructor(n, { rev = 0.2, dly = 0, duck = 0, gain = 1 } = {}) { this.L = new Float32Array(n); this.R = new Float32Array(n); Object.assign(this, { rev, dly, duck, gain }); }
  add(i, l, r) { if (i >= 0 && i < this.L.length) { this.L[i] += l; this.R[i] += r; } }
}
const pan = (p) => [Math.cos(((p + 1) * Math.PI) / 4), Math.sin(((p + 1) * Math.PI) / 4)];

function fdnReverb(inL, inR, { size = 1, decay = 0.82, damp = 0.4, pre = 0.02 } = {}) {
  const n = inL.length, L = new Float32Array(n), R = new Float32Array(n);
  const lens = [1931, 2213, 2647, 3001, 3373, 3727, 4093, 4513].map((x) => Math.round(x * size));
  const lines = lens.map((x) => new Float32Array(x)), idx = new Array(8).fill(0), lp = new Array(8).fill(0);
  const pd = Math.round(pre * SR), preL = new Float32Array(pd + 1), preR = new Float32Array(pd + 1); let pi = 0;
  // input diffusion (2 allpass per channel)
  const ap = [[347, 0.6], [113, 0.6]].map(([d, g]) => ({ d, g, bL: new Float32Array(d), bR: new Float32Array(d), i: 0 }));
  for (let i = 0; i < n; i++) {
    let xl = preL[pi], xr = preR[pi]; preL[pi] = inL[i]; preR[pi] = inR[i]; pi = (pi + 1) % (pd + 1);
    for (const a of ap) { const vl = a.bL[a.i], vr = a.bR[a.i]; const ul = xl + a.g * vl, ur = xr + a.g * vr; a.bL[a.i] = ul; a.bR[a.i] = ur; xl = vl - a.g * ul; xr = vr - a.g * ur; a.i = (a.i + 1) % a.d; }
    const o = lines.map((d, k) => d[idx[k]]);
    let s = 0; for (let k = 0; k < 8; k++) s += o[k]; s *= 2 / 8;
    for (let k = 0; k < 8; k++) {
      const v = (o[k] - s) * decay + (k % 2 ? xr : xl) * 0.35;
      lp[k] += (1 - damp) * (v - lp[k]);
      lines[k][idx[k]] = lp[k]; idx[k] = (idx[k] + 1) % lens[k];
    }
    L[i] = o[0] + o[2] + o[4] + o[6]; R[i] = o[1] + o[3] + o[5] + o[7];
  }
  return [L, R];
}
function pingPong(inL, inR, delaySec, fb = 0.35, tone = 3500) {
  const n = inL.length, d = Math.round(delaySec * SR), bL = new Float32Array(d), bR = new Float32Array(d), L = new Float32Array(n), R = new Float32Array(n);
  const fl = new Biquad("lp", tone), fr = new Biquad("lp", tone); let k = 0;
  for (let i = 0; i < n; i++) { const ol = bL[k], or = bR[k]; bL[k] = fl.p((inL[i] + inR[i]) * 0.5 + or * fb); bR[k] = fr.p(ol * fb); k = (k + 1) % d; L[i] = ol; R[i] = or; }
  return [L, R];
}

// ---------------- instruments (write into a bus) ----------------
const I = {
  /** FM electric piano */
  ep(bus, t, dur, midi, vel = 0.5, p = 0) {
    const f = mtof(midi), [gl, gr] = pan(p), s0 = Math.round(t * SR), n = Math.round((dur + 1.2) * SR);
    let pc = 0, pm = 0;
    for (let i = 0; i < n; i++) {
      const tt = i / SR, rel = tt > dur ? Math.exp(-(tt - dur) * 6) : 1;
      const env = Math.min(1, tt / 0.003) * Math.exp(-tt * 1.6) * rel;
      const idx = 1.6 * Math.exp(-tt * 9) + 0.25;
      pm += (TAU * f * 1.0) / SR; pc += (TAU * f) / SR;
      const tine = Math.sin(TAU * f * 14 * tt) * Math.exp(-tt * 40) * 0.08;
      const v = (Math.sin(pc + idx * Math.sin(pm)) + tine) * env * vel * 0.3;
      bus.add(s0 + i, v * gl, v * gr);
    }
  },
  /** Karplus-Strong pluck (pizzicato / ukulele / harp) */
  pluck(bus, t, midi, vel = 0.5, p = 0, { decay = 0.996, bright = 0.5, dur = 1.6 } = {}) {
    const f = mtof(midi), N = Math.max(2, Math.round(SR / f)), b = new Float32Array(N), [gl, gr] = pan(p);
    const lp = new Biquad("lp", 1500 + 6000 * bright);
    for (let k = 0; k < N; k++) b[k] = lp.p(rnd());
    const s0 = Math.round(t * SR), n = Math.round(dur * SR); let k = 0, prev = 0;
    const body = new Biquad("peak", 220, 1, 4);
    for (let i = 0; i < n; i++) { const v = b[k]; const nv = decay * 0.5 * (v + prev); prev = v; b[k] = nv; k = (k + 1) % N; const o = body.p(v) * vel * 0.5 * Math.min(1, (n - i) / 400); bus.add(s0 + i, o * gl, o * gr); }
  },
  /** mallet: marimba / glock by partial set */
  mallet(bus, t, midi, vel = 0.5, p = 0, kind = "marimba") {
    const f = mtof(midi), [gl, gr] = pan(p), s0 = Math.round(t * SR);
    const parts = kind === "glock" ? [[1, 1, 2.2], [2.76, 0.25, 6], [5.4, 0.12, 10], [8.93, 0.05, 14]] : [[1, 1, 3.2], [3.93, 0.35, 12], [9.2, 0.08, 30]];
    const n = Math.round((kind === "glock" ? 2.2 : 1.2) * SR);
    for (let i = 0; i < n; i++) { const tt = i / SR; let v = 0; for (const [m, a, d] of parts) v += a * Math.sin(TAU * f * m * tt) * Math.exp(-tt * d); v *= Math.min(1, tt / 0.0015) * vel * 0.32; bus.add(s0 + i, v * gl, v * gr); }
  },
  /** warm pad: 3 detuned saws per note, slow attack, filter */
  pad(bus, t, dur, notes, vel = 0.3, { cutoff = 1400, att = 0.6, rel = 1.2, open = 0 } = {}) {
    const s0 = Math.round(t * SR), n = Math.round((dur + rel) * SR);
    const fl = new Biquad("lp", cutoff, 0.7), fr = new Biquad("lp", cutoff, 0.7);
    const osc = notes.flatMap((m, j) => [-0.09, 0, 0.11].map((det, q) => ({ f: mtof(m + det), ph: Math.abs(rnd()), side: (q - 1) * 0.6 + (j % 2 ? 0.2 : -0.2) })));
    for (let i = 0; i < n; i++) {
      const tt = i / SR, env = Math.min(1, tt / att) * (tt > dur ? Math.exp(-(tt - dur) * (4 / rel)) : 1);
      if (i % 64 === 0) { const c = cutoff * (1 + open * Math.min(1, tt / Math.max(dur, 0.01))); fl.set(c); fr.set(c); }
      let l = 0, r = 0;
      for (const o of osc) { o.ph += o.f / SR; const sw = 2 * (o.ph - Math.floor(o.ph + 0.5)); l += sw * (1 - o.side) * 0.5; r += sw * (1 + o.side) * 0.5; }
      const g = (env * vel * 0.12) / Math.sqrt(osc.length);
      bus.add(s0 + i, fl.p(l) * g, fr.p(r) * g);
    }
  },
  bass(bus, t, dur, midi, vel = 0.6, { tone = 600, sub = 1 } = {}) {
    const f = mtof(midi), s0 = Math.round(t * SR), n = Math.round((dur + 0.08) * SR), lp = new Biquad("lp", tone, 0.9); let ph = 0;
    for (let i = 0; i < n; i++) { const tt = i / SR; ph += f / SR; const env = Math.min(1, tt / 0.004) * (tt > dur ? Math.max(0, 1 - (tt - dur) / 0.08) : 1) * (0.75 + 0.25 * Math.exp(-tt * 8));
      const saw = 2 * (ph - Math.floor(ph + 0.5)); const v = (lp.p(saw) * 0.6 + Math.sin(TAU * ph) * sub * 0.7) * env * vel * 0.45; bus.add(s0 + i, v, v); }
  },
  kick(bus, t, vel = 0.8) { const s0 = Math.round(t * SR), n = Math.round(0.45 * SR); let ph = 0; for (let i = 0; i < n; i++) { const tt = i / SR, f = 45 + 120 * Math.exp(-tt * 35); ph += (TAU * f) / SR; const v = (Math.sin(ph) * Math.exp(-tt * 7) + (i < 60 ? rnd() * 0.3 * (1 - i / 60) : 0)) * vel * 0.8; bus.add(s0 + i, v, v); } },
  snare(bus, t, vel = 0.5, clap = false) { const s0 = Math.round(t * SR), n = Math.round(0.35 * SR), bp = new Biquad("bp", clap ? 1300 : 2200, clap ? 1.2 : 0.8), hp = new Biquad("hp", 600); let ph = 0;
    for (let i = 0; i < n; i++) { const tt = i / SR; ph += (TAU * 190) / SR; let e = Math.exp(-tt * (clap ? 14 : 18)); if (clap) e *= tt < 0.03 ? 0.6 + 0.4 * Math.sin(tt * 900) ** 2 : 1; const v = (bp.p(hp.p(rnd())) * 1.6 * e + (clap ? 0 : Math.sin(ph) * Math.exp(-tt * 30) * 0.5)) * vel * 0.6; const [gl, gr] = pan(clap ? 0.1 : 0); bus.add(s0 + i, v * gl, v * gr); } },
  hat(bus, t, vel = 0.2, p = 0.2, open = false) { const s0 = Math.round(t * SR), n = Math.round((open ? 0.3 : 0.06) * SR), hp = new Biquad("hp", 7000, 0.8), bp = new Biquad("bp", 10000, 1); const [gl, gr] = pan(p);
    for (let i = 0; i < n; i++) { const tt = i / SR, v = bp.p(hp.p(rnd())) * Math.exp(-tt * (open ? 12 : 70)) * vel * 1.4; bus.add(s0 + i, v * gl, v * gr); } },
  shaker(bus, t, vel = 0.15, p = -0.3) { const s0 = Math.round(t * SR), n = Math.round(0.09 * SR), bp = new Biquad("bp", 6500, 1.5); const [gl, gr] = pan(p);
    for (let i = 0; i < n; i++) { const tt = i / SR, e = Math.min(1, tt / 0.02) * Math.exp(-tt * 40); const v = bp.p(rnd()) * e * vel * 2; bus.add(s0 + i, v * gl, v * gr); } },
  tom(bus, t, midi, vel = 0.6) { const s0 = Math.round(t * SR), n = Math.round(0.6 * SR), f0 = mtof(midi); let ph = 0; for (let i = 0; i < n; i++) { const tt = i / SR, f = f0 * (1 + 0.6 * Math.exp(-tt * 20)); ph += (TAU * f) / SR; const v = Math.tanh(Math.sin(ph) * 1.5) * Math.exp(-tt * 6) * vel * 0.5; bus.add(s0 + i, v, v); } },
  boom(bus, t, vel = 0.9) { const s0 = Math.round(t * SR), n = Math.round(2.5 * SR), lp = new Biquad("lp", 300); let ph = 0; for (let i = 0; i < n; i++) { const tt = i / SR, f = 32 + 60 * Math.exp(-tt * 8); ph += (TAU * f) / SR; const v = (Math.tanh(Math.sin(ph) * 2) * Math.exp(-tt * 1.6) + lp.p(rnd()) * Math.exp(-tt * 3) * 0.6) * vel * 0.7; bus.add(s0 + i, v, v); } },
  /** string-like ostinato: filtered saw, short */
  stab(bus, t, dur, midi, vel = 0.4, p = 0) { const s0 = Math.round(t * SR), n = Math.round((dur + 0.1) * SR), f = mtof(midi), lp = new Biquad("lp", 2200, 1.2); let a = Math.abs(rnd()), b = Math.abs(rnd()); const [gl, gr] = pan(p);
    for (let i = 0; i < n; i++) { const tt = i / SR; a += f / SR; b += (f * 1.004) / SR; const env = Math.min(1, tt / 0.008) * (tt > dur ? Math.max(0, 1 - (tt - dur) / 0.1) : 1) * (0.7 + 0.3 * Math.exp(-tt * 10)); const sw = 2 * (a - Math.floor(a + 0.5)) + 2 * (b - Math.floor(b + 0.5)); const v = lp.p(sw) * env * vel * 0.18; bus.add(s0 + i, v * gl, v * gr); } },
};

// ---------------- arrangement helpers ----------------
const CH = (root, q) => ({ maj7: [0, 4, 7, 11], m7: [0, 3, 7, 10], m9: [0, 3, 7, 10, 14], maj9: [0, 4, 7, 11, 14], add9: [0, 4, 7, 14], sus4: [0, 5, 7, 10], dom7: [0, 4, 7, 10], six: [0, 4, 7, 9], maj: [0, 4, 7], min: [0, 3, 7] }[q].map((x) => x + root));

function render(song) {
  const bpm = song.bpm, beat = 60 / bpm, total = LOOP * 2 + 0.01, n = Math.ceil(total * SR);
  const buses = Object.fromEntries(Object.entries(song.buses).map(([k, o]) => [k, new Bus(n, o)]));
  const kicks = [];
  for (let cyc = 0; cyc < 2; cyc++) {
    seed = 7 + cyc * 1000; // khác nhau chút ít giữa 2 vòng (noise), nốt giống hệt
    const T0 = cyc * LOOP;
    song.write({ I, buses, beat, at: (bar, b = 0) => T0 + (bar * 4 + b) * beat, kick: (t) => kicks.push(t) });
  }
  // sidechain envelope from kicks
  const duckEnv = new Float32Array(n).fill(1);
  for (const t of kicks) { const s = Math.round(t * SR); for (let i = 0; i < 0.32 * SR && s + i < n; i++) { const g = 1 - 0.85 * Math.exp(-i / SR / 0.09) * Math.min(1, i / 60 + 0.2); duckEnv[s + i] = Math.min(duckEnv[s + i], g); } }
  const ML = new Float32Array(n), MR = new Float32Array(n), RL = new Float32Array(n), RR = new Float32Array(n), DL = new Float32Array(n), DR = new Float32Array(n);
  for (const b of Object.values(buses)) for (let i = 0; i < n; i++) {
    const d = b.duck ? 1 - b.duck * (1 - duckEnv[i]) : 1, l = b.L[i] * b.gain * d, r = b.R[i] * b.gain * d;
    ML[i] += l; MR[i] += r; RL[i] += l * b.rev; RR[i] += r * b.rev; DL[i] += l * b.dly; DR[i] += r * b.dly;
  }
  const [dl, dr] = pingPong(DL, DR, beat * 0.75, 0.38);
  for (let i = 0; i < n; i++) { RL[i] += dl[i] * 0.3; RR[i] += dr[i] * 0.3; ML[i] += dl[i]; MR[i] += dr[i]; }
  const [rl, rr] = fdnReverb(RL, RR, song.reverb || {});
  const hpL = new Biquad("hp", 120), hpR = new Biquad("hp", 120); // reverb: no mud
  for (let i = 0; i < n; i++) { ML[i] += hpL.p(rl[i]) * 0.55; MR[i] += hpR.p(rr[i]) * 0.55; }
  // master EQ: cắt sub (nền nằm dưới giọng nói), mở trung–cao cho rõ nhạc cụ
  const eq = [0, 1].map(() => [new Biquad("hp", 32, 0.7), new Biquad("ls", 110, 0.7, -6), new Biquad("peak", 2800, 0.8, 3), new Biquad("hs", 7000, 0.7, 4)]);
  for (let i = 0; i < n; i++) { let l = ML[i], r = MR[i]; for (const f of eq[0]) l = f.p(l); for (const f of eq[1]) r = f.p(r); ML[i] = l; MR[i] = r; }
  // master: low-shelf trim, gentle glue compressor (RMS, slow), soft limiter, loudness target
  const s0 = Math.round(LOOP * SR), m = Math.round(LOOP * SR), L = new Float32Array(m), R = new Float32Array(m);
  let env = 0;
  for (let i = 0; i < m; i++) { const l = ML[s0 + i], r = MR[s0 + i]; const x = Math.max(Math.abs(l), Math.abs(r)); env += (x > env ? 0.01 : 0.0002) * (x - env); const g = env > 0.5 ? Math.pow(0.5 / env, 0.5) : 1; L[i] = l * g; R[i] = r * g; }
  let ss = 0; for (let i = 0; i < m; i++) ss += L[i] * L[i] + R[i] * R[i];
  const rms = Math.sqrt(ss / (2 * m)), target = Math.pow(10, (song.rmsDb ?? -19) / 20), k = target / rms;
  for (let i = 0; i < m; i++) { L[i] = Math.tanh(L[i] * k * 1.1) / 1.1; R[i] = Math.tanh(R[i] * k * 1.1) / 1.1; }
  return [L, R];
}

function wav(file, [L, R]) {
  const n = L.length, o = Buffer.alloc(44 + n * 4);
  o.write("RIFF", 0); o.writeUInt32LE(36 + n * 4, 4); o.write("WAVE", 8); o.write("fmt ", 12); o.writeUInt32LE(16, 16); o.writeUInt16LE(1, 20); o.writeUInt16LE(2, 22); o.writeUInt32LE(SR, 24); o.writeUInt32LE(SR * 4, 28); o.writeUInt16LE(4, 32); o.writeUInt16LE(16, 34); o.write("data", 36); o.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) { o.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i])) * 32767), 44 + i * 4); o.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i])) * 32767), 46 + i * 4); }
  writeFileSync(file, o);
}

// ---------------- the four beds ----------------
const SONGS = {
  // 1) Mở đầu tò mò — 96 bpm, Rê thứ dorian, pizzicato lén lút + glock hỏi + pad mỏng. 12 ô nhịp.
  "curious-intro": {
    bpm: 96, rmsDb: -20, reverb: { size: 1.1, decay: 0.84, damp: 0.45 },
    buses: { pluck: { rev: 0.25, dly: 0.15 }, glock: { rev: 0.45, dly: 0.35, gain: 0.8 }, pad: { rev: 0.5, duck: 0.4, gain: 0.9 }, bass: { rev: 0.05, gain: 0.7 }, drums: { rev: 0.12 } },
    write({ I, buses: B, at, beat, kick }) {
      const prog = [[50, "m9"], [46, "maj7"], [43, "m9"], [45, "sus4"]]; // Dm9 Bbmaj7 Gm9 A7sus4
      for (let bar = 0; bar < 12; bar++) {
        const [root, q] = prog[bar % 4], ch = CH(root, q);
        I.pad(B.pad, at(bar), 4 * beat, ch.slice(0, 4).map((x) => x + 12), 0.5, { cutoff: 900, att: 1.2, rel: 1.6 });
        // bass: staccato tiptoe on 1 and the "and" of 2
        [0, 1.5, 3].forEach((b, j) => I.bass(B.bass, at(bar, b), beat * 0.35, root - 12 + (j === 2 ? 7 : 0), 0.55, { tone: 500 }));
        // pizzicato ostinato in 8ths: chord tones walking up, skipping some
        const pat = [0, 2, 1, 3, 2, 1, 3, 2];
        pat.forEach((k, j) => { if (j === 5 && bar % 2) return; I.pluck(B.pluck, at(bar, j / 2), ch[k % ch.length] + 12, j % 2 ? 0.35 : 0.5, -0.35 + (j % 2) * 0.2, { decay: 0.993, bright: 0.35, dur: 0.6 }); });
        // drums: soft kick 1, rim/shaker 8ths
        if (bar >= 0) { I.kick(B.drums, at(bar), 0.45); kick(at(bar)); if (bar % 2) { I.kick(B.drums, at(bar, 2.5), 0.3); } }
        for (let e = 0; e < 8; e++) I.shaker(B.drums, at(bar, e / 2), e % 2 ? 0.16 : 0.08);
        I.snare(B.drums, at(bar, 3), 0.18, true);
      }
      // glock "question" motif every 2 bars (rising, ends unresolved on 9)
      const motifs = [[[74, 0], [77, 0.5], [81, 1], [79, 2.5]], [[76, 0], [74, 0.5], [72, 1], [76, 1.5], [69, 3]]];
      for (let bar = 0; bar < 12; bar += 2) motifs[(bar / 2) % 2].forEach(([m, b]) => I.mallet(B.glock, at(bar + 1, b), m + (bar % 4 === 2 && m > 75 ? 0 : 0), 0.55, 0.3, "glock"));
    },
  },
  // 2) Giải thích nhẹ — 112 bpm, Đô trưởng, EP offbeat + marimba arpeggio + nhịp nhẹ. 14 ô nhịp (4×3 + 2 quay về).
  "light-explain": {
    bpm: 112, rmsDb: -20, reverb: { size: 1, decay: 0.8, damp: 0.5 },
    buses: { ep: { rev: 0.3, duck: 0.35 }, mar: { rev: 0.25, dly: 0.2, gain: 0.85 }, pad: { rev: 0.5, duck: 0.5, gain: 0.6 }, bass: { rev: 0.04, gain: 0.7 }, drums: { rev: 0.1, gain: 0.85 } },
    write({ I, buses: B, at, beat, kick }) {
      const prog = [[48, "maj9"], [45, "m7"], [41, "maj7"], [43, "six"]];
      const seq = []; for (let i = 0; i < 12; i++) seq.push(prog[i % 4]); seq.push([41, "maj7"], [43, "sus4"]);
      seq.forEach(([root, q], bar) => {
        const ch = CH(root, q);
        [0.5, 1.5, 2.5, 3.5].forEach((b, j) => ch.slice(1, 4).forEach((m, k) => I.ep(B.ep, at(bar, b) + k * 0.006, beat * 0.42, m + 12, j === 0 ? 0.42 : 0.32, -0.15 + k * 0.15)));
        I.pad(B.pad, at(bar), 4 * beat, [ch[0] + 24, ch[2] + 24], 0.35, { cutoff: 1200, att: 0.8 });
        I.bass(B.bass, at(bar), beat * 0.9, root - 12, 0.6); I.bass(B.bass, at(bar, 1.5), beat * 0.4, root - 12, 0.45); I.bass(B.bass, at(bar, 2.5), beat * 0.9, root - 5, 0.5);
        I.kick(B.drums, at(bar), 0.6); kick(at(bar)); I.kick(B.drums, at(bar, 2), 0.5); kick(at(bar, 2));
        I.snare(B.drums, at(bar, 1), 0.28, true); I.snare(B.drums, at(bar, 3), 0.3, true);
        for (let e = 0; e < 8; e++) I.hat(B.drums, at(bar, e / 2), e % 2 ? 0.13 : 0.07, 0.25);
        // marimba arpeggio 16ths only on bars 4-11 (gives the loop an inner arc)
        if (bar >= 4 && bar < 12) { const arp = [0, 1, 2, 3, 2, 1, 2, 3]; arp.forEach((k, j) => I.mallet(B.mar, at(bar, j * 0.5), ch[k] + 24, j % 2 ? 0.35 : 0.5, 0.35)); }
      });
      // marimba hook
      [[72, 0], [76, 0.5], [79, 1], [76, 2], [74, 2.5], [72, 3]].forEach(([m, b]) => { I.mallet(B.mar, at(0, b), m, 0.55, -0.2); I.mallet(B.mar, at(12, b), m, 0.5, -0.2); });
    },
  },
  // 3) Căng thẳng / cao trào — 128 bpm, La thứ, ostinato đàn dây 16 nốt, toms, boom mỗi 4 ô, sub. 16 ô nhịp.
  "tension-climax": {
    bpm: 128, rmsDb: -18, reverb: { size: 1.4, decay: 0.86, damp: 0.4 },
    buses: { str: { rev: 0.3, duck: 0.3 }, pad: { rev: 0.6, duck: 0.6, gain: 0.8 }, bass: { rev: 0.02, duck: 0.3, gain: 0.65 }, drums: { rev: 0.18 }, perc: { rev: 0.35, gain: 0.9 } },
    write({ I, buses: B, at, beat, kick }) {
      const prog = [[45, "min"], [45, "min"], [41, "maj"], [40, "maj"]]; // Am Am F E
      for (let bar = 0; bar < 16; bar++) {
        const [root, q] = prog[bar % 4], ch = CH(root, q), sect = Math.floor(bar / 4);
        // 16th ostinato: root-root-fifth-octave pattern, accent pattern 3-3-2
        for (let s = 0; s < 16; s++) { const acc = [0, 3, 6, 8, 11, 14].includes(s); const m = [0, 0, 7, 12][s % 4] + root + 12; I.stab(B.str, at(bar, s / 4), beat * 0.2, m, acc ? 0.55 : 0.3, s % 2 ? 0.35 : -0.35); }
        I.pad(B.pad, at(bar), 4 * beat, ch.map((x) => x + 12).concat([ch[0] + 24]), 0.45, { cutoff: 700 + sect * 250, att: 0.4, open: 0.5 });
        for (let e = 0; e < 8; e++) I.bass(B.bass, at(bar, e / 2), beat * 0.3, root - 12, e % 2 ? 0.45 : 0.6, { tone: 380 });
        I.kick(B.drums, at(bar), 0.85); kick(at(bar)); I.kick(B.drums, at(bar, 2), 0.75); kick(at(bar, 2)); if (bar % 2) { I.kick(B.drums, at(bar, 2.75), 0.5); }
        I.snare(B.drums, at(bar, 1), 0.45); I.snare(B.drums, at(bar, 3), 0.5);
        for (let s = 0; s < 16; s++) I.hat(B.drums, at(bar, s / 4), s % 4 === 2 ? 0.16 : 0.07, 0.3, s % 8 === 6);
        if (bar % 4 === 3) { [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.25, 3.5, 3.75].forEach((b, j) => I.tom(B.perc, at(bar, b), 45 - Math.floor(j / 3) * 3, 0.35 + j * 0.04)); }
        if (bar % 4 === 0) I.boom(B.perc, at(bar), 0.7);
      }
    },
  },
  // 4) Kết vui — 128 bpm, Son trưởng, ukulele strum (Karplus) + glock giai điệu + clap. 16 ô nhịp.
  "happy-outro": {
    bpm: 128, rmsDb: -19, reverb: { size: 1, decay: 0.8, damp: 0.5 },
    buses: { uke: { rev: 0.2, duck: 0.2 }, glock: { rev: 0.4, dly: 0.25, gain: 0.75 }, pad: { rev: 0.5, duck: 0.55, gain: 0.55 }, bass: { rev: 0.03, gain: 0.7 }, drums: { rev: 0.12, gain: 0.9 } },
    write({ I, buses: B, at, beat, kick }) {
      const prog = [[43, "add9"], [38, "maj"], [40, "m7"], [36, "maj9"]]; // G D Em7 Cmaj9
      const strum = [[0, 1, 0.6], [1, -1, 0.4], [1.5, 1, 0.45], [2.5, -1, 0.4], [3, 1, 0.5], [3.5, -1, 0.35]];
      for (let bar = 0; bar < 16; bar++) {
        const [root, q] = prog[bar % 4], ch = CH(root, q);
        const voicing = [ch[0] + 12, ch[1] + 12, ch[2] + 12, ch[0] + 24].sort((a, b) => a - b);
        strum.forEach(([b, dir, v]) => { const order = dir > 0 ? voicing : [...voicing].reverse(); order.forEach((m, k) => I.pluck(B.uke, at(bar, b) + k * 0.012, m + 12, v * 0.7, -0.4 + k * 0.25, { decay: 0.994, bright: 0.55, dur: 0.9 })); });
        I.pad(B.pad, at(bar), 4 * beat, [ch[0] + 24, ch[1] + 24, ch[2] + 24], 0.35, { cutoff: 1500 });
        I.bass(B.bass, at(bar), beat * 0.8, root - 12 + (root < 40 ? 12 : 0), 0.6); I.bass(B.bass, at(bar, 1.5), beat * 0.4, root - 12 + (root < 40 ? 12 : 0), 0.45); I.bass(B.bass, at(bar, 2.5), beat * 0.8, root - 5 + (root < 40 ? 12 : 0), 0.5);
        I.kick(B.drums, at(bar), 0.7); kick(at(bar)); I.kick(B.drums, at(bar, 2), 0.6); kick(at(bar, 2)); I.kick(B.drums, at(bar, 2.75), 0.35);
        I.snare(B.drums, at(bar, 1), 0.35, true); I.snare(B.drums, at(bar, 3), 0.38, true);
        for (let e = 0; e < 8; e++) { I.hat(B.drums, at(bar, e / 2), e % 2 ? 0.14 : 0.06, 0.3); I.shaker(B.drums, at(bar, e / 2 + 0.25), 0.07, -0.4); }
      }
      // glock tune (8 bars, plays twice)
      const tune = [[79, 0, 0], [83, 0, 1], [86, 0, 2], [83, 0, 3], [81, 1, 0], [78, 1, 1], [74, 1, 2.5], [79, 2, 0], [76, 2, 1], [79, 2, 2], [83, 2, 3], [84, 3, 0], [83, 3, 1], [81, 3, 2], [79, 4, 0], [83, 4, 1], [86, 4, 2], [88, 4, 3], [86, 5, 0], [83, 5, 1.5], [81, 5, 2.5], [79, 6, 0], [81, 6, 1], [83, 6, 2], [79, 7, 0]];
      for (const off of [0, 8]) tune.forEach(([m, bar, b]) => I.mallet(B.glock, at(off + bar, b), m, 0.5, 0.2, "glock"));
    },
  },
};

const meta = [];
for (const [name, song] of Object.entries(SONGS)) {
  if (ONLY.length && !ONLY.includes(name)) continue;
  const t0 = Date.now();
  const out = render(song);
  wav(join(OUT, `${name}.wav`), out); // repo giữ bản .flac (≤5 MB/file): ffmpeg -i x.wav -c:a flac x.flac
  meta.push({ file: `music/${name}.flac`, name, bpm: song.bpm, bars: Math.round((LOOP * song.bpm) / 240), seconds: LOOP, loop: true });
  console.log(`${name}: ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}
if (!ONLY.length) writeFileSync(join(OUT, "music-list.json"), JSON.stringify({ generator: "music/src/compose.mjs", sampleRate: SR, items: meta }, null, 1));
