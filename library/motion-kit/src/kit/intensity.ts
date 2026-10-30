// © 2026 Gen Labs — All rights reserved.
// STD-17 intensity presets: map a story phase to motion parameters.
// Rule of thumb from STD-17: ~80% of beats are LIGHT, MEDIUM for emphasis, exactly ONE HEAVY hit per climax.
import { SpringConfig } from "remotion";
import { EASE, EaseFn, SPR } from "./anim";

export type Phase = "hook" | "setup" | "build" | "climax" | "breath" | "payoff" | "cta";
export type Level = "light" | "medium" | "heavy";
export type TransitionKind = "cut" | "crossfade" | "whip" | "zoomThrough" | "lightLeak";
export type CameraMove = "static" | "drift" | "pushIn" | "pullOut" | "pan" | "punch";

export type Preset = {
  phase: Phase;
  level: Level;
  /** 0..1 global effect strength (travel distance, overshoot, glow, blur all scale with it) */
  strength: number;
  /** entrance duration in seconds for a single element */
  enterSec: number;
  /** stagger between sibling elements, seconds */
  staggerSec: number;
  ease: EaseFn;
  spring: Partial<SpringConfig>;
  /** typical shot length in seconds [min, max] → cut rate */
  shotSec: [number, number];
  /** allowed camera moves, first = default; never repeat the same move on two adjacent beats */
  camera: CameraMove[];
  /** preferred transition INTO a shot of this phase */
  transition: TransitionKind;
  /** music bed volume 0..1 (relative) — climax ducks to 0 just before the hit */
  music: number;
  /** max overshoot as fraction (0.1 = 110%) */
  overshoot: number;
  /** element travel in px for slide-ins */
  travel: number;
  /** blur (px) an element starts from */
  blur: number;
  /** camera shake amplitude in px (only heavy) */
  shake: number;
  /** screen flash alpha (only heavy) */
  flash: number;
};

export const PRESETS: Record<Phase, Preset> = {
  hook: {
    phase: "hook", level: "medium", strength: 0.75, enterSec: 0.4, staggerSec: 0.05, ease: EASE.out, spring: SPR.pop,
    shotSec: [1, 2], camera: ["pushIn", "punch"], transition: "cut", music: 0.9, overshoot: 0.12, travel: 90, blur: 10, shake: 0, flash: 0.15,
  },
  setup: {
    phase: "setup", level: "light", strength: 0.35, enterSec: 0.55, staggerSec: 0.06, ease: EASE.out, spring: SPR.smooth,
    shotSec: [4, 6], camera: ["drift", "static", "pan"], transition: "crossfade", music: 0.55, overshoot: 0.02, travel: 24, blur: 6, shake: 0, flash: 0,
  },
  build: {
    phase: "build", level: "medium", strength: 0.6, enterSec: 0.4, staggerSec: 0.08, ease: EASE.out, spring: SPR.pop,
    shotSec: [2, 4], camera: ["pushIn", "pan", "drift"], transition: "whip", music: 0.7, overshoot: 0.1, travel: 80, blur: 8, shake: 0, flash: 0,
  },
  climax: {
    phase: "climax", level: "heavy", strength: 1, enterSec: 0.22, staggerSec: 0.02, ease: EASE.snap, spring: SPR.slam,
    shotSec: [1, 2], camera: ["punch", "static"], transition: "zoomThrough", music: 0, overshoot: 0.18, travel: 160, blur: 18, shake: 22, flash: 0.55,
  },
  breath: {
    phase: "breath", level: "light", strength: 0.15, enterSec: 0.9, staggerSec: 0.1, ease: EASE.soft, spring: SPR.soft,
    shotSec: [2, 4], camera: ["static", "pullOut"], transition: "lightLeak", music: 0.25, overshoot: 0, travel: 12, blur: 4, shake: 0, flash: 0,
  },
  payoff: {
    phase: "payoff", level: "medium", strength: 0.5, enterSec: 0.5, staggerSec: 0.07, ease: EASE.out, spring: SPR.smooth,
    shotSec: [3, 5], camera: ["pullOut", "drift"], transition: "crossfade", music: 0.75, overshoot: 0.06, travel: 50, blur: 6, shake: 0, flash: 0,
  },
  cta: {
    phase: "cta", level: "light", strength: 0.4, enterSec: 0.5, staggerSec: 0.06, ease: EASE.out, spring: SPR.smooth,
    shotSec: [3, 5], camera: ["static"], transition: "crossfade", music: 0.8, overshoot: 0.05, travel: 30, blur: 6, shake: 0, flash: 0,
  },
};

/** Level → preset (for components that only care about light/medium/heavy). */
export const LEVEL: Record<Level, Preset> = { light: PRESETS.setup, medium: PRESETS.build, heavy: PRESETS.climax };

/** Accept either a phase or a level. */
export const preset = (x: Phase | Level = "build"): Preset => (x in PRESETS ? PRESETS[x as Phase] : LEVEL[x as Level]);

/**
 * Budget check (STD-17 §3 "one heavy hit per climax"): pass the beats of a film and get warnings.
 * Used by the showcase as a self-test; call it from any new clip's timeline.
 */
export const checkBudget = (beats: { phase: Phase; camera: CameraMove; level?: Level }[], durationSec: number) => {
  const warn: string[] = [];
  const heavy = beats.filter((b) => (b.level ?? PRESETS[b.phase].level) === "heavy").length;
  const climaxes = beats.filter((b) => b.phase === "climax").length;
  if (heavy > Math.max(1, climaxes) + (durationSec > 60 ? 1 : 0)) warn.push(`too many heavy beats: ${heavy}`);
  for (let i = 1; i < beats.length; i++) if (beats[i].camera === beats[i - 1].camera && beats[i].camera !== "static") warn.push(`beats ${i - 1}/${i} repeat camera ${beats[i].camera}`);
  const ci = beats.findIndex((b) => b.phase === "climax");
  if (ci >= 0 && beats[ci + 1]?.phase !== "breath") warn.push("climax must be followed by a breath");
  return warn;
};
