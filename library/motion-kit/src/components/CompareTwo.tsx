// © 2026 Gen Labs — All rights reserved.
// CompareTwo — two cards (bad vs good) build in turn, a VS badge pops, then the verdict: loser sinks back, winner lifts and glows.
import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { EASE, SPR, iv, sp } from "../kit/anim";
import { C, DISPLAY, UI, glassCard } from "../kit/theme";

type Side = { title: string; tag?: string; items: string[] };
export type CompareTwoProps = { left: Side; right: Side; start?: number; verdictSec?: number; exitAt?: number };

const Mark: React.FC<{ good: boolean; p: number }> = ({ good, p }) => (
  <svg width={40} height={40} viewBox="0 0 40 40" style={{ flex: "none", transform: `scale(${p})` }}>
    <circle cx={20} cy={20} r={18} fill={good ? C.teal : C.coral} fillOpacity={0.22} stroke={good ? C.teal2 : C.coral2} strokeWidth={2.5} />
    {good ? <path d="M12 20.5l5.5 5.5L28.5 14" fill="none" stroke={C.teal2} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" /> : <path d="M14 14l12 12M26 14L14 26" stroke={C.coral2} strokeWidth={4} strokeLinecap="round" />}
  </svg>
);

export const CompareTwo: React.FC<CompareTwoProps> = ({ left, right, start = 0, verdictSec = 2.4, exitAt }) => {
  const fr = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f = fr - start;
  const out = exitAt !== undefined ? iv(fr, [exitAt, exitAt + 0.4 * fps], [0, 1], EASE.in) : 0;
  const v = iv(f, [verdictSec * fps, (verdictSec + 0.6) * fps], [0, 1], EASE.out);
  const vsPop = sp(f, fps, 0.9 * fps, SPR.bouncy);
  const card = (s: Side, good: boolean) => {
    const t0 = (good ? 0.75 : 0.1) * fps;
    const inP = sp(f, fps, t0, SPR.smooth);
    const lose = !good ? v : 0, win = good ? v : 0;
    return (
      <div style={{ width: 700, ...glassCard(34), padding: "40px 46px 44px", position: "relative", opacity: inP * (1 - 0.45 * lose), transform: `perspective(1800px) translateY(${(1 - inP) * 60 + 26 * lose - 16 * win}px) rotateY(${(good ? -1 : 1) * (1 - inP) * 16}deg) scale(${1 - 0.06 * lose + 0.05 * win})`, filter: `saturate(${1 - 0.7 * lose}) blur(${1.6 * lose}px)`, borderColor: win > 0 ? `rgba(127,224,216,${0.3 + 0.6 * win})` : undefined, boxShadow: win > 0 ? `0 0 ${80 * win}px ${C.teal}55, 0 40px 80px -30px rgba(0,0,0,0.65)` : undefined }}>
        <div style={{ fontFamily: UI, fontWeight: 700, fontSize: 24, letterSpacing: "0.18em", color: good ? C.teal2 : C.coral2 }}>{s.tag ?? (good ? "CÁCH MỚI" : "CÁCH CŨ")}</div>
        <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 54, color: C.cream, margin: "8px 0 26px", lineHeight: 1.1 }}>{s.title}</div>
        {s.items.map((it, i) => {
          const t = t0 + (0.25 + i * 0.16) * fps;
          const e = iv(f, [t, t + 0.35 * fps], [0, 1], EASE.out);
          return (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 20, padding: "12px 0", opacity: e, transform: `translateX(${(1 - e) * (good ? 30 : -30)}px)` }}>
              <Mark good={good} p={sp(f, fps, t + 0.08 * fps, SPR.pop)} />
              <div style={{ fontFamily: UI, fontWeight: 500, fontSize: 36, color: C.cream, opacity: 0.88 }}>{it}</div>
            </div>
          );
        })}
        {good && win > 0 && (
          <div style={{ position: "absolute", top: -26, right: 34, padding: "10px 24px", borderRadius: 30, background: `linear-gradient(160deg, ${C.gold2}, ${C.gold})`, color: C.ink, fontFamily: DISPLAY, fontWeight: 900, fontSize: 28, transform: `scale(${sp(f, fps, verdictSec * fps + 4, SPR.bouncy)}) rotate(4deg)`, boxShadow: `0 10px 30px -8px ${C.gold}` }}>TỐT HƠN</div>
        )}
      </div>
    );
  };
  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 120, opacity: 1 - out, transform: `scale(${1 - 0.04 * out})` }}>
      {card(left, false)}
      <div style={{ position: "absolute", left: "50%", top: "50%", transform: `translate(-50%,-50%) scale(${vsPop * (1 - 0.3 * v)}) rotate(${(1 - vsPop) * -90}deg)`, width: 110, height: 110, borderRadius: 55, background: `linear-gradient(160deg, ${C.gold2}, ${C.goldDeep})`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: DISPLAY, fontWeight: 900, fontSize: 42, color: C.ink, boxShadow: `0 0 0 8px rgba(4,13,22,0.8), 0 0 40px ${C.gold}88`, opacity: 1 - v * 0.6, zIndex: 2 }}>VS</div>
      {card(right, true)}
    </div>
  );
};
