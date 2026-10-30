// © 2026 Gen Labs — All rights reserved.
// BigNumberCount — mechanical odometer: each digit is a rolling drum (vertical motion blur when fast),
// count eases out, lands with a pop + glow; label and a synced meter underneath.
import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { EASE, SPR, iv, sp } from "../kit/anim";
import { C, DISPLAY, UI } from "../kit/theme";

export type BigNumberCountProps = { value: number; from?: number; prefix?: string; suffix?: string; label?: string; start?: number; durSec?: number; size?: number; exitAt?: number; sep?: string };

const Drum: React.FC<{ pos: number; size: number; speed: number; id: string }> = ({ pos, size, speed, id }) => {
  const h = size * 1.12;
  const blur = Math.min(16, speed * 5);
  const p = ((pos % 10) + 10) % 10;
  return (
    <span style={{ display: "inline-block", height: h, overflow: "hidden", position: "relative", width: "0.62em", verticalAlign: "top", WebkitMaskImage: "linear-gradient(180deg, transparent 0%, #000 22%, #000 78%, transparent 100%)", maskImage: "linear-gradient(180deg, transparent 0%, #000 22%, #000 78%, transparent 100%)" }}>
      {blur > 0.4 && (
        <svg width={0} height={0} style={{ position: "absolute" }}>
          <filter id={id}><feGaussianBlur stdDeviation={`0 ${blur.toFixed(1)}`} /></filter>
        </svg>
      )}
      <span style={{ position: "absolute", left: 0, right: 0, top: 0, transform: `translateY(${-p * h}px)`, filter: blur > 0.4 ? `url(#${id})` : undefined }}>
        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map((d, i) => (
          <span key={i} style={{ display: "block", height: h, lineHeight: `${h}px`, textAlign: "center" }}>{d}</span>
        ))}
      </span>
    </span>
  );
};

export const BigNumberCount: React.FC<BigNumberCountProps> = ({ value, from = 0, prefix = "", suffix = "", label, start = 0, durSec = 1.8, size = 230, exitAt, sep = "." }) => {
  const fr = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f = fr - start;
  const out = exitAt !== undefined ? iv(fr, [exitAt, exitAt + 0.4 * fps], [0, 1], EASE.in) : 0;
  const t0 = 0.25 * fps, t1 = t0 + durSec * fps;
  const ease = EASE.out;
  const cur = from + (value - from) * iv(f, [t0, t1], [0, 1], ease);
  const prev = from + (value - from) * iv(f - 1, [t0, t1], [0, 1], ease);
  const nDigits = Math.max(String(Math.round(value)).length, String(Math.round(from)).length);
  const inP = sp(f, fps, 0, SPR.smooth);
  const land = sp(f, fps, t1, SPR.bouncy);
  const glow = f >= t1 ? Math.exp(-(f - t1) / (0.35 * fps)) : 0;
  const labelE = iv(f, [t0 + 0.2 * fps, t0 + 0.7 * fps], [0, 1], EASE.out);
  const meter = iv(f, [t0, t1], [0, 1], ease);

  const drums: React.ReactNode[] = [];
  for (let k = nDigits - 1; k >= 0; k--) {
    const div = Math.pow(10, k);
    // lowest drum rolls continuously; higher drums only turn when the one below passes 9→0 (real odometer)
    const raw = cur / div;
    const low = (cur % div) / div;
    const carry = k === 0 ? raw : Math.floor(raw) + Math.max(0, (low - 0.9) * 10);
    const pr = k === 0 ? prev / div : Math.floor(prev / div) + Math.max(0, ((prev % div) / div - 0.9) * 10);
    const speed = Math.abs(carry - pr);
    // hide leading zeros (and their separator) while the number is still small; fade in as the digit arrives
    const lead = k > 0 ? iv(cur, [div * 0.9, div], [0, 1], EASE.linear) : 1;
    if (k < nDigits - 1 && (k + 1) % 3 === 0) drums.push(<span key={`s${k}`} style={{ display: "inline-block", width: "0.28em", textAlign: "center", opacity: iv(cur, [Math.pow(10, k + 1) * 0.9, Math.pow(10, k + 1)], [0, 1], EASE.linear) }}>{sep}</span>);
    drums.push(<span key={k} style={{ opacity: lead }}><Drum pos={carry} size={size} speed={speed} id={`dr${start}_${k}`} /></span>);
  }
  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", opacity: inP * (1 - out), transform: `translateY(${(1 - inP) * 40 - 30 * out}px)` }}>
      <div style={{ position: "absolute", width: 1100, height: 520, background: `radial-gradient(ellipse, ${C.gold}55 0%, transparent 65%)`, opacity: 0.35 + 0.65 * glow }} />
      <div style={{ display: "flex", alignItems: "flex-start", fontFamily: DISPLAY, fontWeight: 900, fontSize: size, lineHeight: 1.12, fontVariantNumeric: "tabular-nums", transform: `scale(${1 + 0.06 * (land > 0 ? 1 - land : 0) + 0.04 * glow})`, filter: `drop-shadow(0 16px 40px rgba(0,0,0,0.5)) drop-shadow(0 0 ${36 * glow}px ${C.gold})` }}>
        {prefix && <span style={{ color: C.cream, marginRight: "0.08em" }}>{prefix}</span>}
        <span style={{ color: C.gold2, display: "inline-flex", textShadow: `0 -0.03em 0 ${C.cream}55` }}>{drums}</span>
        {suffix && <span style={{ color: C.cream, marginLeft: "0.08em", fontSize: "0.5em", alignSelf: "center" }}>{suffix}</span>}
      </div>
      <div style={{ width: 760, height: 10, borderRadius: 5, background: "rgba(255,255,255,0.08)", marginTop: 30, overflow: "hidden" }}>
        <div style={{ width: `${meter * 100}%`, height: "100%", background: `linear-gradient(90deg, ${C.teal}, ${C.gold2})`, boxShadow: `0 0 18px ${C.gold}` }} />
      </div>
      {label && <div style={{ marginTop: 26, fontFamily: UI, fontWeight: 500, fontSize: 40, color: C.textDim, opacity: labelE, transform: `translateY(${(1 - labelE) * 14}px)` }}>{label}</div>}
    </div>
  );
};
