// © 2026 Gen Labs — All rights reserved.
// CursorClick — an app window with buttons; a cursor glides on eased arcs, presses, ripples, and flips each button to "done".
import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { EASE, SPR, iv, noise1, sp } from "../kit/anim";
import { C, DISPLAY, UI, glassCard } from "../kit/theme";

export type CursorClickProps = {
  title?: string;
  buttons: { label: string; icon?: string }[];
  clicks: { target: number; at: number }[]; // at = seconds (local)
  start?: number;
  exitAt?: number;
};

type P = { x: number; y: number };
const bez = (a: P, c1: P, c2: P, b: P, t: number): P => {
  const u = 1 - t;
  return { x: u * u * u * a.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * b.x, y: u * u * u * a.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * b.y };
};

const WIN = { x: 960, y: 560, w: 1320, h: 680 };

export const CursorClick: React.FC<CursorClickProps> = ({ title = "Gen Studio", buttons, clicks, start = 0, exitAt }) => {
  const fr = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f = fr - start;
  const winIn = sp(f, fps, 0, SPR.smooth);
  const out = exitAt !== undefined ? iv(fr, [exitAt, exitAt + 0.4 * fps], [0, 1], EASE.in) : 0;

  // button layout (window-local → screen coords)
  const bw = 330, bh = 120, gap = 44;
  const total = buttons.length * bw + (buttons.length - 1) * gap;
  const bx = (i: number) => WIN.x - total / 2 + i * (bw + gap) + bw / 2;
  const by = WIN.y + 90;
  const target = (i: number): P => ({ x: bx(i) + 30, y: by + 18 });

  // cursor path
  const home: P = { x: WIN.x + 420, y: WIN.y + 330 };
  const pts = clicks.map((c) => ({ ...target(c.target), t: c.at * fps }));
  let pos: P = home;
  let speed = 0;
  const travel = 0.6 * fps, settle = 0.1 * fps;
  const at = (ff: number): P => {
    let prev: P = home;
    for (let k = 0; k < pts.length; k++) {
      const t1 = pts[k].t - settle, t0 = t1 - travel;
      if (ff < t0) return prev;
      if (ff <= t1) {
        const p = iv(ff, [t0, t1], [0, 1], EASE.inOut);
        const mid = { x: (prev.x + pts[k].x) / 2, y: Math.min(prev.y, pts[k].y) - 120 };
        return bez(prev, { x: prev.x + (mid.x - prev.x) * 0.6, y: mid.y }, { x: pts[k].x + (mid.x - pts[k].x) * 0.4, y: mid.y }, pts[k], p);
      }
      prev = pts[k];
    }
    // drift away after last click
    const tl = pts.length ? pts[pts.length - 1].t : 0;
    const d = iv(ff, [tl + 0.3 * fps, tl + 1.2 * fps], [0, 1], EASE.inOut);
    return { x: prev.x + 140 * d, y: prev.y + 90 * d };
  };
  pos = at(f);
  const p2 = at(f - 1);
  speed = Math.hypot(pos.x - p2.x, pos.y - p2.y);
  pos = { x: pos.x + noise1(f / 40, 9) * 2, y: pos.y + noise1(f / 45, 10) * 2 };
  const cursorIn = iv(f, [0.3 * fps, 0.6 * fps], [0, 1], EASE.out);
  const press = pts.reduce((a, p) => a + Math.max(0, 1 - Math.abs(f - p.t) / (0.09 * fps)), 0);

  return (
    <div style={{ position: "absolute", inset: 0, opacity: 1 - out, transform: `scale(${1 - 0.04 * out})` }}>
      {/* window */}
      <div style={{ position: "absolute", left: WIN.x - WIN.w / 2, top: WIN.y - WIN.h / 2, width: WIN.w, height: WIN.h, ...glassCard(32), background: "linear-gradient(170deg, rgba(18,46,66,0.92), rgba(8,24,40,0.94))", transform: `perspective(1600px) translateY(${(1 - winIn) * 60}px) rotateX(${(1 - winIn) * 12}deg) scale(${0.94 + 0.06 * winIn})`, opacity: winIn }}>
        <div style={{ height: 70, display: "flex", alignItems: "center", gap: 12, padding: "0 28px", borderBottom: `1.5px solid ${C.glassLine}` }}>
          {["#FF6159", "#FFBD2E", "#28C941"].map((c) => <div key={c} style={{ width: 18, height: 18, borderRadius: 9, background: c, opacity: 0.85 }} />)}
          <div style={{ marginLeft: 22, fontFamily: UI, fontWeight: 600, fontSize: 26, color: C.textDim }}>{title}</div>
        </div>
        {/* faux content lines */}
        <div style={{ position: "absolute", left: 70, top: 120, right: 70 }}>
          <div style={{ width: 520, height: 30, borderRadius: 8, background: "rgba(255,244,226,0.16)" }} />
          <div style={{ width: 860, height: 18, borderRadius: 6, background: "rgba(255,244,226,0.08)", marginTop: 22 }} />
          <div style={{ width: 700, height: 18, borderRadius: 6, background: "rgba(255,244,226,0.08)", marginTop: 14 }} />
        </div>
      </div>
      {/* buttons (screen space so the cursor can target them) */}
      {buttons.map((b, i) => {
        const clickT = pts.find((p, k) => clicks[k].target === i)?.t;
        const inP = sp(f, fps, 0.25 * fps + i * 0.08 * fps, SPR.pop);
        const pressK = clickT !== undefined ? Math.max(0, 1 - Math.abs(f - clickT) / (0.1 * fps)) : 0;
        const done = clickT !== undefined && f >= clickT ? iv(f, [clickT, clickT + 0.25 * fps], [0, 1], EASE.out) : 0;
        const hover = clickT !== undefined ? iv(f, [clickT - 0.25 * fps, clickT - 0.05 * fps], [0, 1], EASE.out) : 0;
        const ring = clickT !== undefined && f >= clickT ? iv(f, [clickT, clickT + 0.5 * fps], [0, 1], EASE.out) : 0;
        const ck = clickT !== undefined ? sp(f, fps, clickT + 0.05 * fps, SPR.bouncy) : 0;
        return (
          <div key={i} style={{ position: "absolute", left: bx(i) - bw / 2, top: by - bh / 2, width: bw, height: bh, opacity: inP * winIn, transform: `translateY(${(1 - inP) * 40}px) scale(${(1 - 0.05 * pressK) * (1 + 0.025 * hover * (1 - done))})` }}>
            <div style={{ position: "absolute", inset: 0, borderRadius: 26, background: done > 0 ? `linear-gradient(160deg, ${C.teal2}, ${C.teal})` : "linear-gradient(160deg, rgba(255,255,255,0.14), rgba(255,255,255,0.05))", border: `2px solid ${done > 0 ? C.teal2 : hover > 0 ? "rgba(255,255,255,0.45)" : C.glassLine}`, boxShadow: done > 0 ? `0 0 ${40 * done}px ${C.teal}88, 0 20px 40px -20px rgba(0,0,0,0.6)` : "0 20px 40px -20px rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", gap: 16 }}>
              <div style={{ width: 44, height: 44, borderRadius: 22, background: done > 0 ? C.ink : "rgba(255,255,255,0.12)", display: "flex", alignItems: "center", justifyContent: "center", transform: `scale(${0.6 + 0.4 * Math.max(ck, done > 0 ? 0 : 1)})` }}>
                {done > 0 ? (
                  <svg width={28} height={28} viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7" fill="none" stroke={C.teal2} strokeWidth={3.4} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={24} strokeDashoffset={24 * (1 - ck)} /></svg>
                ) : (
                  <span style={{ fontFamily: UI, fontSize: 22, color: C.cream }}>{b.icon ?? i + 1}</span>
                )}
              </div>
              <span style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 34, color: done > 0 ? C.ink : C.cream }}>{b.label}</span>
            </div>
            {ring > 0 && ring < 1 && <div style={{ position: "absolute", left: bw / 2 + 30 - 150 * ring, top: bh / 2 + 18 - 150 * ring, width: 300 * ring, height: 300 * ring, borderRadius: "50%", border: `${6 * (1 - ring)}px solid ${C.teal2}`, opacity: 1 - ring }} />}
          </div>
        );
      })}
      {/* cursor with a speed-based trail */}
      {[3, 2, 1, 0].map((k) => {
        if (k > 0 && speed < 6) return null;
        const pp = k === 0 ? pos : at(f - k * 0.6);
        return (
          <svg key={k} width={64} height={64} viewBox="0 0 24 24" style={{ position: "absolute", left: pp.x - 6, top: pp.y - 3, opacity: cursorIn * (k === 0 ? 1 : 0.18 / k), transform: `scale(${1.4 * (1 - 0.15 * Math.min(1, press))})`, transformOrigin: "6px 3px", filter: "drop-shadow(0 6px 10px rgba(0,0,0,0.55))" }}>
            <path d="M4 2.5l15.5 9.2-6.6 1.5 3.7 6.9-2.9 1.6-3.7-7-4.9 4.6z" fill={C.white} stroke={C.ink} strokeWidth={1.3} strokeLinejoin="round" />
          </svg>
        );
      })}
    </div>
  );
};
