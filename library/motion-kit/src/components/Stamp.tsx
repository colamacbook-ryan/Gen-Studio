// © 2026 Gen Labs — All rights reserved.
// Stamp — the climax hit: anticipation (hovers big + soft) → slam (ease-in) → impact (squash, shockwave, debris, ink texture).
// Heavy effect: use ONCE per climax. Parent can sync shake/flash/SFX to stampImpact(start, fps).
import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { EASE, SPR, iv, rnd, sp } from "../kit/anim";
import { C, DISPLAY, UI } from "../kit/theme";

export type StampProps = { text: string; sub?: string; color?: string; start?: number; rotate?: number; size?: number; exitAt?: number; x?: number; y?: number };

/** frame (in the same time base as `start`) where the stamp touches down */
export const stampImpact = (start: number, fps: number) => start + Math.round(0.32 * fps);

export const Stamp: React.FC<StampProps> = ({ text, sub, color = "#FF5A4E", start = 0, rotate = -8, size = 170, exitAt, x = 960, y = 540 }) => {
  const fr = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f = fr - start;
  const hit = 0.32 * fps;
  if (f < 0) return null;
  const out = exitAt !== undefined ? iv(fr, [exitAt, exitAt + 0.35 * fps], [0, 1], EASE.in) : 0;
  // anticipation: rise in big and soft, hang, then slam (ease-in = accelerating into the surface)
  const appear = iv(f, [0, 0.12 * fps], [0, 1], EASE.out);
  const fall = iv(f, [0.14 * fps, hit], [0, 1], EASE.in);
  const scale = f < hit ? 2.5 - 1.5 * fall : 1;
  const after = Math.max(0, f - hit);
  const squash = f >= hit ? 1 - 0.12 * Math.exp(-after / (0.05 * fps)) * Math.cos(after / (0.035 * fps)) : 1;
  const settle = f >= hit ? sp(f, fps, hit, SPR.slam) : 0;
  const blur = f < hit ? 10 * (1 - fall) + 2 : 0;
  const shadowDist = f < hit ? 80 * (1 - fall) + 6 : 6;
  const ring = f >= hit ? iv(f, [hit, hit + 0.55 * fps], [0, 1], EASE.out) : 0;
  const glow = f >= hit ? Math.exp(-after / (0.18 * fps)) : 0;
  const id = `ink${Math.round(start)}`;
  return (
    <div style={{ position: "absolute", left: x, top: y, width: 0, height: 0, opacity: 1 - out }}>
      {/* shockwave + dust (behind) */}
      {ring > 0 && ring < 1 && (
        <>
          <div style={{ position: "absolute", left: -700 * ring, top: -380 * ring, width: 1400 * ring, height: 760 * ring, borderRadius: "50%", border: `${14 * (1 - ring)}px solid ${color}`, opacity: (1 - ring) * 0.8, boxShadow: `0 0 ${60 * (1 - ring)}px ${color}` }} />
          {new Array(22).fill(0).map((_, i) => {
            const a = (i / 22) * Math.PI * 2 + rnd(i) * 0.3;
            const v = 360 + rnd(i * 3.1) * 420;
            const d = v * (1 - Math.pow(1 - ring, 2.2));
            const s = 6 + rnd(i * 7.3) * 16;
            return <div key={i} style={{ position: "absolute", left: Math.cos(a) * d * 1.3 - s / 2, top: Math.sin(a) * d * 0.7 - s / 2 + ring * ring * 60, width: s, height: s, borderRadius: 3, background: i % 3 ? color : C.cream, transform: `rotate(${a * 57 + ring * 200}deg)`, opacity: 1 - ring }} />;
          })}
        </>
      )}
      <div style={{ position: "absolute", left: 0, top: 0, transform: `translate(-50%,-50%) rotate(${rotate + (1 - settle) * 3 * (f >= hit ? 1 : 0)}deg) scale(${scale * (2 - squash)}, ${scale * squash})`, opacity: appear, filter: `blur(${blur}px) drop-shadow(0 ${shadowDist}px ${shadowDist * 0.9}px rgba(0,0,0,0.55)) drop-shadow(0 0 ${50 * glow}px ${color})` }}>
        <svg width={0} height={0} style={{ position: "absolute" }}>
          <filter id={id} x="-10%" y="-10%" width="120%" height="120%">
            <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed={3} result="n" />
            <feDisplacementMap in="SourceGraphic" in2="n" scale="7" xChannelSelector="R" yChannelSelector="G" result="d" />
            <feTurbulence type="fractalNoise" baseFrequency="1.4" numOctaves="1" seed={8} result="speck" />
            <feColorMatrix in="speck" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1.6 1.75" result="mask" />
            <feComposite in="d" in2="mask" operator="in" />
          </filter>
        </svg>
        <div style={{ filter: `url(#${id})`, padding: "26px 64px 30px", border: `${size * 0.06}px solid ${color}`, borderRadius: size * 0.16, outline: `${size * 0.025}px solid ${color}`, outlineOffset: size * 0.05, color, textAlign: "center", whiteSpace: "nowrap", background: `radial-gradient(ellipse at 50% 50%, ${color}2A, ${color}12)`, textShadow: `0 0 2px ${color}` }}>
          <div style={{ fontFamily: DISPLAY, fontWeight: 900, fontSize: size, lineHeight: 1.05, letterSpacing: "0.02em" }}>{text}</div>
          {sub && <div style={{ fontFamily: UI, fontWeight: 700, fontSize: size * 0.22, letterSpacing: "0.3em", marginTop: 6 }}>{sub}</div>}
        </div>
      </div>
    </div>
  );
};
