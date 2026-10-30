// © 2026 Gen Labs — All rights reserved.
// LowerThird — name strap: avatar pops, glass bar wipes out of it, name rises from a mask, role fades, accent line draws.
import React from "react";
import { Img, useCurrentFrame, useVideoConfig } from "remotion";
import { EASE, SPR, iv, sp } from "../kit/anim";
import { C, CHAR_META, CharId, DISPLAY, Mood, UI, charSrc } from "../kit/theme";

export type LowerThirdProps = {
  name: string;
  role: string;
  who?: CharId;
  mood?: Mood;
  color?: string;
  start?: number;
  exitAt?: number;
  /** position of the avatar centre */
  x?: number;
  y?: number;
};

/** where the face sits in each exported still (fractions of image width/height; hw = head width / image width) */
const FACE: Record<CharId, { cx: number; cy: number; hw: number; ar: number }> = {
  nhi: { cx: 0.5, cy: 0.52, hw: 0.5, ar: 1491 / 1252 },
  vy: { cx: 0.4, cy: 0.52, hw: 0.39, ar: 1572 / 1543 },
};

/** Round bust crop of a character still. */
export const Avatar: React.FC<{ who: CharId; mood?: Mood; size: number; ring?: string; style?: React.CSSProperties }> = ({ who, mood = "neutral", size, ring, style }) => (
  <div style={{ width: size, height: size, borderRadius: "50%", overflow: "hidden", position: "relative", background: `radial-gradient(circle at 50% 35%, ${C.cream} 0%, #F3DCC0 70%)`, boxShadow: `0 0 0 ${Math.max(4, size * 0.04)}px ${ring ?? CHAR_META[who].color}, 0 20px 40px -10px rgba(0,0,0,0.6)`, ...style }}>
    {(() => {
      const fc = FACE[who], w = (size * 1.0) / fc.hw, h = w * fc.ar;
      return <Img src={charSrc(who, mood)} style={{ position: "absolute", width: w, left: size / 2 - fc.cx * w, top: size * 0.56 - fc.cy * h }} />;
    })()}
  </div>
);

export const LowerThird: React.FC<LowerThirdProps> = ({ name, role, who = "nhi", mood = "neutral", color, start = 0, exitAt, x = 250, y = 850 }) => {
  const fr = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f = fr - start;
  const col = color ?? CHAR_META[who].color;
  const out = exitAt !== undefined ? iv(fr, [exitAt, exitAt + 0.4 * fps], [0, 1], EASE.in) : 0;
  const pop = sp(f, fps, 0, SPR.pop);
  const bar = iv(f, [0.12 * fps, 0.62 * fps], [0, 1], EASE.out) * (1 - out);
  const nameP = sp(f, fps, 0.3 * fps, SPR.smooth);
  const roleE = iv(f, [0.45 * fps, 0.9 * fps], [0, 1], EASE.out);
  const line = iv(f, [0.55 * fps, 1.2 * fps], [0, 1], EASE.out);
  const av = 150;
  const barW = 640;
  return (
    <div style={{ position: "absolute", left: x - av / 2, top: y - av / 2, height: av, display: "flex", alignItems: "center", opacity: 1 - out * 0.2 }}>
      {/* bar (behind avatar), wipes from avatar centre to the right */}
      <div style={{ position: "absolute", left: av / 2, top: 18, height: av - 36, width: barW, clipPath: `inset(0 ${(1 - bar) * 100}% 0 0 round 0 22px 22px 0)`, background: "linear-gradient(100deg, rgba(10,32,52,0.92) 0%, rgba(12,40,60,0.78) 100%)", borderRadius: "0 22px 22px 0", boxShadow: "0 30px 60px -25px rgba(0,0,0,0.7)", border: `1.5px solid ${C.glassLine}` }}>
        <div style={{ position: "absolute", left: av / 2 + 34, top: 14, overflow: "hidden", padding: "6px 0 2px" }}>
          <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 52, color: C.cream, lineHeight: 1.12, transform: `translateY(${(1 - nameP) * 110}%)` }}>{name}</div>
        </div>
        <div style={{ position: "absolute", left: av / 2 + 36, top: 80, fontFamily: UI, fontWeight: 500, fontSize: 26, color: C.textDim, letterSpacing: "0.04em", opacity: roleE, transform: `translateX(${(1 - roleE) * 16}px)` }}>{role}</div>
        <div style={{ position: "absolute", left: av / 2 + 36, bottom: 0, height: 4, width: (barW - av / 2 - 70) * line, background: `linear-gradient(90deg, ${col}, ${col}00)`, borderRadius: 4, boxShadow: `0 0 14px ${col}` }} />
      </div>
      <div style={{ transform: `scale(${pop * (1 - out)}) rotate(${(1 - pop) * -20}deg)` }}>
        <Avatar who={who} mood={mood} size={av} ring={col} />
      </div>
    </div>
  );
};
