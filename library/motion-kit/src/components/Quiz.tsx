// © 2026 Gen Labs — All rights reserved.
// Quiz — question → options → countdown ring (3·2·1, tension) → a beat of silence → reveal (wrong ones sink, right one glows).
// quizTimes() gives the frames to sync tick / reveal SFX and to drop the music before the answer.
import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { EASE, SPR, iv, sp } from "../kit/anim";
import { C, DISPLAY, UI, glassCard } from "../kit/theme";

export type QuizProps = { question: string; options: string[]; correct: number; start?: number; countdown?: number; exitAt?: number; label?: string };

/** local-time (seconds) schedule; add `start` frames yourself */
export const quizTimes = (nOptions: number, countdown = 3) => {
  const optsIn = 0.9;
  const cdStart = optsIn + nOptions * 0.15 + 0.5;
  const ticks = new Array(countdown).fill(0).map((_, i) => cdStart + i);
  const reveal = cdStart + countdown + 0.35; // 0.35 s of held breath before the answer
  return { optsIn, cdStart, ticks, reveal };
};

export const Quiz: React.FC<QuizProps> = ({ question, options, correct, start = 0, countdown = 3, exitAt, label = "ĐỐ VUI" }) => {
  const fr = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f = fr - start;
  const T = quizTimes(options.length, countdown);
  const out = exitAt !== undefined ? iv(fr, [exitAt, exitAt + 0.4 * fps], [0, 1], EASE.in) : 0;
  const qIn = sp(f, fps, 0, SPR.smooth);
  const rev = iv(f, [T.reveal * fps, (T.reveal + 0.45) * fps], [0, 1], EASE.out);
  const cdT = f / fps - T.cdStart;
  const cdOn = cdT >= 0 && f / fps < T.reveal + 0.2;
  const n = Math.max(1, countdown - Math.floor(Math.max(0, cdT)));
  const inSec = cdT - Math.floor(cdT);
  const numPop = cdOn ? sp(f, fps, (T.cdStart + Math.floor(Math.max(0, cdT))) * fps, SPR.pop) : 0;
  const ringFrac = cdOn ? 1 - Math.min(1, cdT / countdown) : 0;
  const urgency = cdOn ? Math.min(1, cdT / countdown) : 0;
  const R = 70, L = 2 * Math.PI * R;
  const cols = options.length > 3 ? 2 : options.length;
  return (
    <div style={{ position: "absolute", inset: 0, opacity: 1 - out, transform: `translateY(${-30 * out}px)` }}>
      {/* question */}
      <div style={{ position: "absolute", left: "50%", top: 120, width: 1400, transform: `translate(-50%, ${(1 - qIn) * 40}px)`, opacity: qIn, textAlign: "center" }}>
        <div style={{ display: "inline-block", padding: "8px 22px", borderRadius: 30, background: `${C.gold}22`, border: `1.5px solid ${C.gold}88`, fontFamily: UI, fontWeight: 700, fontSize: 24, letterSpacing: "0.2em", color: C.gold2 }}>{label}</div>
        <div style={{ marginTop: 22, fontFamily: DISPLAY, fontWeight: 800, fontSize: 66, lineHeight: 1.18, color: C.cream }}>{question}</div>
      </div>
      {/* options */}
      <div style={{ position: "absolute", left: "50%", top: 470, transform: "translateX(-50%)", display: "grid", gridTemplateColumns: `repeat(${cols}, 560px)`, gap: 34 }}>
        {options.map((o, i) => {
          const t = (T.optsIn + i * 0.15) * fps;
          const e = sp(f, fps, t, SPR.pop);
          const ok = i === correct;
          const pk = ok ? sp(f, fps, T.reveal * fps, SPR.bouncy) : 0;
          return (
            <div key={i} style={{ ...glassCard(26), padding: "30px 34px", display: "flex", alignItems: "center", gap: 24, opacity: e * (ok ? 1 : 1 - 0.6 * rev), transform: `translateY(${(1 - e) * 40}px) scale(${(0.9 + 0.1 * e) * (ok ? 1 + 0.05 * rev : 1 - 0.04 * rev)})`, filter: ok ? undefined : `saturate(${1 - rev})`, background: ok && rev > 0 ? `linear-gradient(160deg, rgba(127,224,216,${0.25 + 0.35 * rev}), rgba(47,183,176,${0.15 + 0.3 * rev}))` : undefined, borderColor: ok && rev > 0 ? C.teal2 : undefined, boxShadow: ok && rev > 0 ? `0 0 ${70 * rev}px ${C.teal}88, 0 30px 60px -30px rgba(0,0,0,0.7)` : undefined, position: "relative" }}>
              <div style={{ width: 64, height: 64, flex: "none", borderRadius: 18, display: "flex", alignItems: "center", justifyContent: "center", background: ok && rev > 0 ? C.teal2 : "rgba(255,255,255,0.1)", fontFamily: DISPLAY, fontWeight: 900, fontSize: 32, color: ok && rev > 0 ? C.ink : C.cream }}>{String.fromCharCode(65 + i)}</div>
              <div style={{ fontFamily: UI, fontWeight: 600, fontSize: 38, color: C.cream }}>{o}</div>
              {ok && rev > 0 && (
                <svg width={66} height={66} viewBox="0 0 24 24" style={{ position: "absolute", right: -22, top: -22, transform: `scale(${pk})`, filter: `drop-shadow(0 6px 14px rgba(0,0,0,0.5))` }}>
                  <circle cx={12} cy={12} r={11} fill={C.gold} />
                  <path d="M6.5 12.5l3.5 3.5 7.5-8" fill="none" stroke={C.ink} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </div>
          );
        })}
      </div>
      {/* countdown ring */}
      {cdOn && (
        <div style={{ position: "absolute", left: "50%", bottom: 70, transform: `translateX(-50%) scale(${1 - 0.3 * rev})`, opacity: 1 - rev, width: 2 * R + 30, height: 2 * R + 30 }}>
          <svg width={2 * R + 30} height={2 * R + 30} style={{ position: "absolute", inset: 0, transform: "rotate(-90deg)" }}>
            <circle cx={R + 15} cy={R + 15} r={R} fill="rgba(4,13,22,0.6)" stroke="rgba(255,255,255,0.1)" strokeWidth={10} />
            <circle cx={R + 15} cy={R + 15} r={R} fill="none" stroke={urgency > 0.66 ? C.coral : C.gold} strokeWidth={10} strokeLinecap="round" strokeDasharray={L} strokeDashoffset={L * (1 - ringFrac)} style={{ filter: `drop-shadow(0 0 ${10 + 14 * urgency}px ${urgency > 0.66 ? C.coral : C.gold})` }} />
          </svg>
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: DISPLAY, fontWeight: 900, fontSize: 84, color: C.cream, transform: `scale(${(0.6 + 0.4 * numPop) * (1 + 0.06 * Math.max(0, 1 - inSec * 4))})`, opacity: f / fps < T.cdStart + countdown ? 1 : 0 }}>{n}</div>
        </div>
      )}
    </div>
  );
};
