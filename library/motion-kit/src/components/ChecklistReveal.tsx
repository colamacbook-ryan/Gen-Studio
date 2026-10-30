// © 2026 Gen Labs — All rights reserved.
// ChecklistReveal — card with rows; each row slides in, its box draws, the tick strokes in, a light sweep passes, text brightens.
import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { EASE, SPR, iv, sp } from "../kit/anim";
import { C, DISPLAY, UI, glassCard } from "../kit/theme";

export type ChecklistRevealProps = { title?: string; items: string[]; start?: number; stepSec?: number; firstSec?: number; exitAt?: number; width?: number; accent?: string };

export const ChecklistReveal: React.FC<ChecklistRevealProps> = ({ title, items, start = 0, stepSec = 0.7, firstSec = 0.5, exitAt, width = 1100, accent = C.teal }) => {
  const fr = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f = fr - start;
  const cardIn = sp(f, fps, 0, SPR.smooth);
  const out = exitAt !== undefined ? iv(fr, [exitAt, exitAt + 0.4 * fps], [0, 1], EASE.in) : 0;
  const done = items.filter((_, i) => f >= (firstSec + i * stepSec + 0.25) * fps).length;
  return (
    <div style={{ position: "absolute", left: "50%", top: "50%", width, transform: `translate(-50%,-50%) translateY(${(1 - cardIn) * 50 - 30 * out}px) scale(${0.96 + 0.04 * cardIn})`, opacity: cardIn * (1 - out), ...glassCard(34), padding: "46px 56px 40px" }}>
      {title && (
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 24 }}>
          <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 50, color: C.cream }}>{title}</div>
          <div style={{ fontFamily: UI, fontWeight: 600, fontSize: 30, color: accent, fontVariantNumeric: "tabular-nums" }}>{done}/{items.length}</div>
        </div>
      )}
      {/* progress rail */}
      <div style={{ height: 6, borderRadius: 3, background: "rgba(255,255,255,0.08)", marginBottom: 18, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${iv(f, [firstSec * fps, (firstSec + (items.length - 1) * stepSec + 0.4) * fps], [0, 100], EASE.inOut)}%`, background: `linear-gradient(90deg, ${accent}, ${C.gold2})`, boxShadow: `0 0 16px ${accent}` }} />
      </div>
      {items.map((it, i) => {
        const t0 = (firstSec + i * stepSec) * fps;
        const rowIn = iv(f, [t0 - 0.25 * fps, t0 + 0.2 * fps], [0, 1], EASE.out);
        const box = iv(f, [t0, t0 + 0.2 * fps], [0, 1], EASE.out);
        const tick = iv(f, [t0 + 0.15 * fps, t0 + 0.4 * fps], [0, 1], EASE.out);
        const pop = sp(f, fps, t0 + 0.15 * fps, SPR.bouncy);
        const sweep = iv(f, [t0 + 0.2 * fps, t0 + 0.75 * fps], [0, 1], EASE.inOut);
        return (
          <div key={i} style={{ position: "relative", display: "flex", alignItems: "center", gap: 30, padding: "20px 14px", borderBottom: i < items.length - 1 ? `1px solid rgba(255,255,255,0.07)` : undefined, opacity: rowIn, transform: `translateX(${(1 - rowIn) * -50}px)`, overflow: "hidden", borderRadius: 14 }}>
            <div style={{ position: "absolute", inset: 0, background: `linear-gradient(90deg, transparent, ${accent}33, transparent)`, transform: `translateX(${(sweep * 2 - 1) * 110}%)`, opacity: sweep > 0 && sweep < 1 ? 1 : 0 }} />
            <svg width={58} height={58} viewBox="0 0 58 58" style={{ flex: "none", transform: `scale(${0.8 + 0.2 * pop})` }}>
              <rect x={4} y={4} width={50} height={50} rx={14} fill={tick > 0 ? accent : "transparent"} fillOpacity={0.9 * tick} stroke={tick > 0 ? accent : "rgba(255,244,226,0.5)"} strokeWidth={3.5} strokeDasharray={190} strokeDashoffset={190 * (1 - box)} />
              <path d="M16 30.5l8.5 8.5L42 21" fill="none" stroke={C.ink} strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={40} strokeDashoffset={40 * (1 - tick)} />
            </svg>
            <div style={{ fontFamily: UI, fontWeight: 500, fontSize: 40, color: C.cream, opacity: 0.55 + 0.45 * tick }}>{it}</div>
          </div>
        );
      })}
    </div>
  );
};
