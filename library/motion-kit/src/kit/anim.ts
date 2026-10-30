// © 2026 Gen Labs — All rights reserved.
// Animation helpers: clamped interpolate with easing, springs at any fps, deterministic noise.
import { Easing, interpolate, spring, SpringConfig } from "remotion";

export const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const CL = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

export type EaseFn = (t: number) => number;
export const EASE = {
  out: Easing.bezier(0.16, 1, 0.3, 1), // expo-ish out: fast start, long settle — default for entrances
  inOut: Easing.bezier(0.65, 0, 0.35, 1),
  in: Easing.bezier(0.55, 0, 1, 0.45),
  snap: Easing.bezier(0.85, 0, 0.15, 1),
  soft: Easing.bezier(0.33, 0, 0.2, 1),
  back: Easing.bezier(0.34, 1.56, 0.64, 1), // overshoot ~10%
  linear: (t: number) => t,
};

/** interpolate with clamp + easing */
export const iv = (f: number, input: number[], output: number[], easing: EaseFn = EASE.inOut) =>
  interpolate(f, input, output, { ...CL, easing });

export const SPR = {
  pop: { damping: 11, mass: 0.6, stiffness: 170 } as Partial<SpringConfig>,
  bouncy: { damping: 8, mass: 0.7, stiffness: 160 } as Partial<SpringConfig>,
  smooth: { damping: 18, mass: 0.8, stiffness: 120 } as Partial<SpringConfig>,
  slam: { damping: 20, mass: 1, stiffness: 420 } as Partial<SpringConfig>,
  soft: { damping: 22, mass: 1, stiffness: 90 } as Partial<SpringConfig>,
};

/** spring that starts at frame `start` (0 before) */
export const sp = (f: number, fps: number, start: number, config: Partial<SpringConfig> = SPR.pop, durationInFrames?: number) =>
  f < start ? 0 : spring({ frame: f - start, fps, config, durationInFrames });

/** deterministic pseudo-random in [0,1) */
export const rnd = (seed: number) => {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/** smooth value noise in [-1,1] */
export const noise1 = (t: number, seed = 0) => {
  const i = Math.floor(t);
  const fr = t - i;
  const a = rnd(i + seed * 101) * 2 - 1;
  const b = rnd(i + 1 + seed * 101) * 2 - 1;
  const u = fr * fr * (3 - 2 * fr);
  return a + (b - a) * u;
};

/** split string into grapheme-ish chars (NFC so Vietnamese diacritics stay with their base letter) */
export const chars = (s: string) => Array.from(s.normalize("NFC"));

/** seconds → frames */
export const sec = (s: number, fps: number) => Math.round(s * fps);

/** a decaying impulse: 0 before t0, jumps to 1 and decays with time constant tau (frames) */
export const impulse = (f: number, t0: number, tau: number) => (f < t0 ? 0 : Math.exp(-(f - t0) / tau));
