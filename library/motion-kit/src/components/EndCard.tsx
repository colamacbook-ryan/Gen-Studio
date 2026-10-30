// © 2026 Gen Labs — All rights reserved.
// EndCard — wordmark + one-line promise + CTA button (light sweep, soft pulse) + both hosts rising in and breathing.
import React from "react";
import { Img, useCurrentFrame, useVideoConfig } from "remotion";
import { EASE, SPR, iv, noise1, sp } from "../kit/anim";
import { C, DISPLAY, GOLD_GRAD, Mood, UI, charSrc, gradText } from "../kit/theme";

export type EndCardProps = { brand?: string; title: string; cta: string; handle?: string; start?: number; hosts?: boolean; nhiMood?: Mood; vyMood?: Mood };

export const EndCard: React.FC<EndCardProps> = ({ brand = "Gen Labs", title, cta, handle, start = 0, hosts = true, nhiMood = "proud", vyMood = "excited" }) => {
  const fr = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f = fr - start;
  const S = (s: number) => s * fps;
  const mark = sp(f, fps, 0, SPR.smooth);
  const titleE = iv(f, [S(0.25), S(0.85)], [0, 1], EASE.out);
  const btn = sp(f, fps, S(0.6), SPR.pop);
  const sweep = ((f - S(1.2)) / S(2.2)) % 1;
  const pulse = f > S(1.2) ? 0.5 + 0.5 * Math.sin((f - S(1.2)) / S(0.32)) : 0;
  const host = (who: "nhi" | "vy", mood: Mood, side: -1 | 1, delay: number) => {
    const p = sp(f, fps, S(delay), SPR.smooth);
    const bob = noise1(f / S(0.9), side + 5) * 6;
    return (
      <Img src={charSrc(who, mood)} style={{ position: "absolute", bottom: -40, [side < 0 ? "left" : "right"]: 70, height: 640, transform: `translateY(${(1 - p) * 520 + bob}px) rotate(${side * (1 - p) * 8 + noise1(f / S(1.4), side) * 1.2}deg)`, transformOrigin: "50% 100%", filter: "drop-shadow(0 30px 40px rgba(0,0,0,0.55))" }} />
    );
  };
  return (
    <div style={{ position: "absolute", inset: 0 }}>
      {hosts && host("nhi", nhiMood, -1, 0.35)}
      {hosts && host("vy", vyMood, 1, 0.5)}
      <div style={{ position: "absolute", left: "50%", top: 300, transform: "translateX(-50%)", display: "flex", flexDirection: "column", alignItems: "center", width: 1000 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 22, opacity: mark, transform: `translateY(${(1 - mark) * 30}px) scale(${0.9 + 0.1 * mark})` }}>
          <div style={{ width: 84, height: 84, borderRadius: 24, background: GOLD_GRAD, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 12px 40px -10px ${C.gold}`, transform: `rotate(${(1 - mark) * -30}deg)` }}>
            <span style={{ fontFamily: DISPLAY, fontWeight: 900, fontSize: 50, color: C.ink }}>G</span>
          </div>
          <span style={{ fontFamily: DISPLAY, fontWeight: 900, fontSize: 76, color: C.cream, letterSpacing: "-0.01em" }}>{brand}</span>
        </div>
        <div style={{ marginTop: 34, fontFamily: DISPLAY, fontWeight: 800, fontSize: 58, textAlign: "center", lineHeight: 1.2, opacity: titleE, transform: `translateY(${(1 - titleE) * 18}px)`, filter: titleE < 0.98 ? `blur(${(1 - titleE) * 6}px)` : undefined }}>
          <span style={{ color: C.cream }}>{title.split("*")[0]}</span>
          {title.split("*")[1] && <span style={gradText(GOLD_GRAD)}>{title.split("*")[1]}</span>}
          {title.split("*")[2] && <span style={{ color: C.cream }}>{title.split("*")[2]}</span>}
        </div>
        <div style={{ marginTop: 50, position: "relative", padding: "26px 64px", borderRadius: 60, background: `linear-gradient(160deg, ${C.teal2}, ${C.teal})`, transform: `scale(${btn * (1 + 0.025 * pulse)})`, boxShadow: `0 0 ${30 + 30 * pulse}px ${C.teal}88, 0 24px 40px -18px rgba(0,0,0,0.6)`, overflow: "hidden" }}>
          <span style={{ position: "relative", fontFamily: DISPLAY, fontWeight: 900, fontSize: 44, color: C.ink }}>{cta}</span>
          {f > S(1.2) && <div style={{ position: "absolute", top: -20, bottom: -20, width: 120, left: `${-20 + sweep * 140}%`, background: "linear-gradient(100deg, transparent, rgba(255,255,255,0.75), transparent)", transform: "skewX(-20deg)" }} />}
        </div>
        {handle && <div style={{ marginTop: 30, fontFamily: UI, fontWeight: 500, fontSize: 30, color: C.textDim, opacity: iv(f, [S(0.9), S(1.4)], [0, 1], EASE.out) }}>{handle}</div>}
      </div>
    </div>
  );
};
