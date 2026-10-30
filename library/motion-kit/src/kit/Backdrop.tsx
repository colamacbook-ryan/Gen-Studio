// © 2026 Gen Labs — All rights reserved.
// Backdrop with real depth (3 parallax planes + perspective floor + bokeh) and a post layer (vignette, grain, flash, tint).
import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { noise1, rnd } from "./anim";
import { Depth } from "./Camera";
import { C, H, W } from "./theme";

export type Mood = "calm" | "warm" | "tense" | "bright";
const MOOD: Record<Mood, { a: string; b: string; c: string; base: string; floor: number }> = {
  calm: { a: C.teal, b: C.petrol2, c: C.gold, base: C.navy, floor: 0.35 },
  warm: { a: C.gold, b: C.coral, c: C.teal, base: C.navy, floor: 0.45 },
  tense: { a: C.coral, b: "#5B1630", c: C.gold, base: "#0A0B18", floor: 0.5 },
  bright: { a: C.gold2, b: C.teal, c: C.coral2, base: C.petrol, floor: 0.4 },
};

const Blob: React.FC<{ x: number; y: number; r: number; color: string; o: number }> = ({ x, y, r, color, o }) => (
  <div style={{ position: "absolute", left: x - r, top: y - r, width: r * 2, height: r * 2, borderRadius: "50%", background: `radial-gradient(circle, ${color} 0%, ${color}00 68%)`, opacity: o }} />
);

export const Backdrop: React.FC<{ mood?: Mood; floor?: boolean; bokeh?: number; energy?: number }> = ({ mood = "calm", floor = true, bokeh = 26, energy = 0.5 }) => {
  const f = useCurrentFrame();
  const m = MOOD[mood];
  const sp = 0.5 + energy; // drift speed
  return (
    <AbsoluteFill style={{ background: C.ink, overflow: "hidden" }}>
      <Depth z={0.15}>
        <div style={{ position: "absolute", left: -500, top: -500, width: W + 1000, height: H + 1000, background: `radial-gradient(ellipse 80% 75% at 50% 42%, ${m.base} 0%, ${C.navy} 55%, ${C.ink} 100%)` }} />
        <Blob x={380 + noise1((f * sp) / 120, 1) * 180} y={260 + noise1((f * sp) / 110, 2) * 120} r={780} color={m.a} o={0.22} />
        <Blob x={1580 + noise1((f * sp) / 115, 3) * 180} y={840 + noise1((f * sp) / 125, 4) * 120} r={820} color={m.b} o={0.26} />
        <Blob x={1100 + noise1((f * sp) / 95, 5) * 220} y={380 + noise1((f * sp) / 100, 6) * 160} r={620} color={m.c} o={0.1} />
      </Depth>
      {floor && (
        <Depth z={0.45}>
          <div
            style={{
              position: "absolute", left: -W * 0.75, top: H * 0.6, width: W * 2.5, height: H * 1.3,
              transform: "perspective(900px) rotateX(74deg)", transformOrigin: "50% 0%",
              backgroundImage: `linear-gradient(rgba(127,224,216,0.20) 2px, transparent 2px), linear-gradient(90deg, rgba(127,224,216,0.20) 2px, transparent 2px)`,
              backgroundSize: "130px 130px", backgroundPosition: `0px ${(f * 0.8 * sp) % 130}px`,
              WebkitMaskImage: "linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.85) 30%, rgba(0,0,0,0) 95%)",
              maskImage: "linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.85) 30%, rgba(0,0,0,0) 95%)",
              opacity: m.floor,
            }}
          />
          <div style={{ position: "absolute", left: -200, right: -200, top: H * 0.6 - 150, height: 300, background: `radial-gradient(ellipse 55% 50% at 50% 50%, ${m.a}33 0%, ${m.a}00 70%)` }} />
        </Depth>
      )}
      {/* bokeh in 3 depth bands — each its own parallax plane */}
      {[0.3, 0.6, 1.4].map((z, band) => (
        <Depth key={band} z={z}>
          {new Array(Math.round(bokeh / 3)).fill(0).map((_, j) => {
            const i = band * 50 + j;
            const size = (8 + rnd(i * 7.7) * 40) * (band === 2 ? 2.6 : 1 + band * 0.4);
            const bx = rnd(i * 1.3) * (W + 600) - 300;
            const by = rnd(i * 2.9) * (H + 600) - 300;
            let y = by - ((f * (0.2 + z * 0.35) * sp) % (H + 600));
            if (y < -300) y += H + 600;
            const x = bx + noise1(f / 60 + i, i) * 30;
            const col = i % 3 === 0 ? C.coral2 : i % 3 === 1 ? C.gold2 : C.teal2;
            const tw = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(f / 18 + i * 2.1));
            const o = band === 2 ? 0.16 : 0.42 * tw * (0.5 + z);
            return (
              <div key={j} style={{ position: "absolute", left: x - size, top: y - size, width: size * 2, height: size * 2, borderRadius: "50%", background: `radial-gradient(circle, ${col}${band === 2 ? "55" : ""} 0%, ${col}44 38%, ${col}00 70%)`, opacity: o, filter: band === 2 ? "blur(6px)" : undefined }} />
            );
          })}
        </Depth>
      ))}
    </AbsoluteFill>
  );
};

/** Post: vignette + animated film grain + optional flash/tint. Put it last. */
export const Post: React.FC<{ flash?: number; flashColor?: string; vignette?: number; grain?: number; tint?: string; tintAmt?: number }> = ({ flash = 0, flashColor = "#FFF3D6", vignette = 0.55, grain = 0.06, tint, tintAmt = 0 }) => {
  const f = useCurrentFrame();
  const seed = Math.floor(f / 2) % 8;
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <AbsoluteFill style={{ background: `radial-gradient(ellipse 75% 70% at 50% 50%, rgba(0,0,0,0) 55%, rgba(2,6,12,${vignette}) 100%)` }} />
      {tint && tintAmt > 0 && <AbsoluteFill style={{ background: tint, opacity: tintAmt, mixBlendMode: "soft-light" }} />}
      <svg width={W} height={H} style={{ position: "absolute", inset: 0, opacity: grain, mixBlendMode: "overlay" }}>
        <filter id={`grain${seed}`}>
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed={seed} stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width={W} height={H} filter={`url(#grain${seed})`} />
      </svg>
      {flash > 0.001 && <AbsoluteFill style={{ background: flashColor, opacity: flash, mixBlendMode: "screen" }} />}
    </AbsoluteFill>
  );
};
