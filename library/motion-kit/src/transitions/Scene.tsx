// © 2026 Gen Labs — All rights reserved.
// <Scene>: a Sequence that knows how it enters and exits. Overlap two scenes by the transition length and give the
// outgoing scene `exit={{kind}}` and the incoming one `enter={{kind}}` with the same kind + duration.
// Kinds: cut · crossfade (soft) · whip (directional motion blur + streaks) · zoomThrough (fly through the old shot)
//        · lightLeak (warm film-burn sweep).
import React from "react";
import { AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig } from "remotion";
import { EASE, iv, rnd } from "../kit/anim";
import { TransitionKind } from "../kit/intensity";
import { C, H, W } from "../kit/theme";

export type Tx = { kind: TransitionKind; sec?: number; dir?: 1 | -1 };
export const TX_DEFAULT_SEC: Record<TransitionKind, number> = { cut: 0, crossfade: 0.6, whip: 0.32, zoomThrough: 0.45, lightLeak: 1.0 };
export const txFrames = (t: Tx | undefined, fps: number) => (t && t.kind !== "cut" ? Math.round((t.sec ?? TX_DEFAULT_SEC[t.kind]) * fps) : 0);

/** directional blur via SVG filter (CSS blur() is isotropic). Quantised so only a few filter nodes exist. */
const BlurDefs: React.FC<{ id: string; x: number; y?: number }> = ({ id, x, y = 0 }) => (
  <svg width={0} height={0} style={{ position: "absolute" }}>
    <filter id={id} x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation={`${x.toFixed(1)} ${y.toFixed(1)}`} />
    </filter>
  </svg>
);

const sideStyle = (kind: TransitionKind, p: number, side: "in" | "out", dir: number, id: string): { style: React.CSSProperties; defs?: React.ReactNode } => {
  // p: 0 = fully this scene's normal state; 1 = fully transitioned away (out) / not yet arrived (in)
  if (p <= 0) return { style: {} };
  switch (kind) {
    case "crossfade":
      return { style: { opacity: 1 - p, transform: `scale(${side === "in" ? 1 + 0.025 * p : 1 - 0.015 * p})` } };
    case "lightLeak":
      return { style: { opacity: 1 - p, filter: `brightness(${1 + 0.5 * p}) saturate(${1 + 0.3 * p})`, transform: `scale(${side === "in" ? 1 + 0.03 * p : 1 + 0.02 * p})` } };
    case "whip": {
      // ease so the speed peaks at the cut; blur ∝ speed
      const travel = side === "out" ? -dir * W * 1.05 * p : dir * W * 1.05 * p;
      const blur = 70 * Math.sin(Math.min(1, p) * Math.PI * 0.5) ** 0.7;
      return { style: { transform: `translateX(${travel}px)`, filter: `url(#${id})` }, defs: <BlurDefs id={id} x={blur} /> };
    }
    case "zoomThrough": {
      if (side === "out") {
        const s = Math.exp(p * Math.log(6));
        return { style: { transform: `scale(${s})`, opacity: 1 - iv(p, [0.55, 1], [0, 1]), filter: `blur(${p * 10}px)` } };
      }
      const s = 1 - 0.55 * p;
      return { style: { transform: `scale(${s})`, opacity: 1 - iv(p, [0.6, 1], [0, 1]), filter: `blur(${p * 14}px)` } };
    }
    default:
      return { style: {} };
  }
};

/** overlay effects drawn by the incoming scene during its enter transition */
const Overlay: React.FC<{ kind: TransitionKind; p: number; seed: number; dir: number }> = ({ kind, p, seed, dir }) => {
  // p goes 1 → 0 during the enter; m = 0..1..0 bump centred on the cut
  const m = Math.sin((1 - p) * Math.PI);
  if (m <= 0.001) return null;
  if (kind === "lightLeak") {
    const t = 1 - p;
    const blobs = [
      { c: C.gold2, x: -400 + t * 2600, y: 300, r: 900, o: 0.75 },
      { c: C.coral2, x: -900 + t * 2900, y: 760, r: 800, o: 0.55 },
      { c: "#FFF1D0", x: 2300 - t * 2000, y: 120, r: 600, o: 0.5 },
    ];
    return (
      <AbsoluteFill style={{ mixBlendMode: "screen", pointerEvents: "none" }}>
        {blobs.map((b, i) => (
          <div key={i} style={{ position: "absolute", left: b.x - b.r, top: b.y - b.r, width: b.r * 2, height: b.r * 2, borderRadius: "50%", background: `radial-gradient(circle, ${b.c} 0%, ${b.c}00 70%)`, opacity: b.o * m, filter: "blur(30px)" }} />
        ))}
        <AbsoluteFill style={{ background: "linear-gradient(100deg, rgba(255,214,140,0) 30%, rgba(255,214,140,0.35) 50%, rgba(255,214,140,0) 70%)", opacity: m, transform: `translateX(${(t - 0.5) * 1400}px)` }} />
      </AbsoluteFill>
    );
  }
  if (kind === "whip") {
    return (
      <AbsoluteFill style={{ pointerEvents: "none", mixBlendMode: "screen", opacity: m * 0.8 }}>
        {new Array(16).fill(0).map((_, i) => {
          const y = rnd(seed + i * 3.3) * H;
          const len = 300 + rnd(seed + i * 5.1) * 900;
          const x = (rnd(seed + i * 7.9) * (W + len)) - len + dir * (1 - p) * -400;
          return <div key={i} style={{ position: "absolute", left: x, top: y, width: len, height: 2 + rnd(seed + i) * 5, borderRadius: 4, background: `linear-gradient(90deg, rgba(255,255,255,0), ${i % 3 ? C.teal2 : C.gold2}, rgba(255,255,255,0))`, opacity: 0.6 }} />;
        })}
      </AbsoluteFill>
    );
  }
  if (kind === "zoomThrough") {
    return (
      <AbsoluteFill style={{ pointerEvents: "none", mixBlendMode: "screen" }}>
        <AbsoluteFill style={{ background: `radial-gradient(circle at 50% 50%, rgba(255,244,226,${0.55 * m}) 0%, rgba(255,244,226,0) ${30 + 30 * m}%)` }} />
        {new Array(28).fill(0).map((_, i) => {
          const a = (i / 28) * 360 + rnd(seed + i) * 10;
          const len = 300 + 700 * m;
          return <div key={i} style={{ position: "absolute", left: W / 2, top: H / 2, width: len, height: 3, transformOrigin: "0 50%", transform: `rotate(${a}deg) translateX(${200 + (1 - p) * 500}px)`, background: `linear-gradient(90deg, rgba(255,255,255,0), ${i % 2 ? C.gold2 : C.teal2})`, opacity: 0.55 * m }} />;
        })}
      </AbsoluteFill>
    );
  }
  return null;
};

export const SceneInner: React.FC<{ dur: number; enter?: Tx; exit?: Tx; seed?: number; children: React.ReactNode }> = ({ dur, enter, exit, seed = 1, children }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const ein = txFrames(enter, fps), eout = txFrames(exit, fps);
  // transitions use their own curve: whip & zoom accelerate into the cut and decelerate out of it
  const curve = (k?: TransitionKind) => (k === "whip" || k === "zoomThrough" ? EASE.snap : EASE.inOut);
  const pIn = ein ? 1 - iv(f, [0, ein], [0, 1], curve(enter?.kind)) : 0;
  const pOut = eout ? iv(f, [dur - eout, dur], [0, 1], curve(exit?.kind)) : 0;
  const a = enter && pIn > 0 ? sideStyle(enter.kind, pIn, "in", enter.dir ?? 1, `txin${seed}`) : { style: {} as React.CSSProperties };
  const b = exit && pOut > 0 ? sideStyle(exit.kind, pOut, "out", exit.dir ?? 1, `txout${seed}`) : { style: {} as React.CSSProperties };
  return (
    <AbsoluteFill>
      {a.defs}
      {b.defs}
      <AbsoluteFill style={{ ...b.style, transformOrigin: "50% 50%" }}>
        <AbsoluteFill style={{ ...a.style, transformOrigin: "50% 50%" }}>{children}</AbsoluteFill>
      </AbsoluteFill>
      {enter && pIn > 0 && <Overlay kind={enter.kind} p={pIn} seed={seed} dir={enter.dir ?? 1} />}
    </AbsoluteFill>
  );
};

/** A shot in a timeline. `from`/`dur` in frames. */
export const Scene: React.FC<{ from: number; dur: number; enter?: Tx; exit?: Tx; seed?: number; name?: string; children: React.ReactNode }> = ({ from, dur, enter, exit, seed, name, children }) => (
  <Sequence from={from} durationInFrames={dur} name={name} layout="none">
    <SceneInner dur={dur} enter={enter} exit={exit} seed={seed ?? from}>
      {children}
    </SceneInner>
  </Sequence>
);
