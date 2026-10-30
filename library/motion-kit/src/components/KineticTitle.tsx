// © 2026 Gen Labs — All rights reserved.
// KineticTitle — one title, three intensities (STD-17):
//   light  : words breathe in (fade + 12 px rise + de-blur). Default for ~80% of beats.
//   medium : words rise out of a mask with a 10% overshoot; *accent* words get a gold marker wipe.
//   heavy  : letters slam in from 2.6× with blur, then one impact (shake + RGB ghost + glow). ONE per climax.
// Syntax: "*word*" = accent, "\n" = line break.
import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { EASE, SPR, chars, iv, noise1, rnd, sp } from "../kit/anim";
import { Level } from "../kit/intensity";
import { C, DISPLAY, GOLD_GRAD, UI, gradText } from "../kit/theme";

export type KineticTitleProps = {
  text: string;
  sub?: string;
  level?: Level;
  /** local frame where the title starts */
  start?: number;
  /** local frame where it starts leaving (omit = stays) */
  exitAt?: number;
  size?: number;
  align?: "center" | "left";
  color?: string;
};

type Tok = { word: string; accent: boolean; line: number; wi: number };
const tokenize = (text: string): Tok[] => {
  // "*" toggles accent (may span several words); whitespace splits words; "\n" breaks lines
  const out: Tok[] = [];
  let acc = false, wi = 0;
  text.split("\n").forEach((line, li) => {
    let cur = "", curAcc = false;
    const push = () => { if (cur) out.push({ word: cur, accent: curAcc, line: li, wi: wi++ }); cur = ""; };
    for (const ch of Array.from(line.normalize("NFC"))) {
      if (ch === "*") { acc = !acc; continue; }
      if (/\s/.test(ch)) { push(); continue; }
      if (!cur) curAcc = acc;
      cur += ch;
    }
    push();
  });
  return out;
};

export const KineticTitle: React.FC<KineticTitleProps> = ({ text, sub, level = "light", start = 0, exitAt, size, align = "center", color = C.cream }) => {
  const fr = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f = fr - start;
  const toks = tokenize(text);
  const lines = Math.max(...toks.map((t) => t.line)) + 1;
  const fs = size ?? (level === "heavy" ? 190 : level === "medium" ? 128 : 96);
  const S = (s: number) => s * fps; // seconds → frames
  const exitP = exitAt !== undefined ? iv(fr, [exitAt, exitAt + S(0.45)], [0, 1], EASE.in) : 0;

  // ---- heavy: impact moment = when the last letter lands
  const nChars = toks.reduce((a, t) => a + chars(t.word).length, 0);
  const stepH = S(0.028);
  const land = S(0.16) + stepH * (nChars - 1);
  const hit = level === "heavy" ? Math.max(0, f - land) : -1;
  const shakeK = level === "heavy" && f >= land ? Math.exp(-hit / S(0.12)) : 0;
  const shake = { x: noise1(f * 0.9, 3) * 26 * shakeK, y: noise1(f * 0.9, 4) * 18 * shakeK, r: noise1(f * 0.7, 5) * 1.2 * shakeK };
  // after landing, the block keeps a slow push (alive, but calm)
  const settle = level === "heavy" ? 1 + 0.03 * iv(f, [land, land + S(3)], [0, 1], EASE.out) : 1;

  // marker of an accent run continues across the space to the next accent word on the same line
  const nextAccent = (t: Tok) => toks.some((u) => u.wi === t.wi + 1 && u.accent && u.line === t.line);
  let ci = 0;
  const renderWord = (t: Tok) => {
    const wStart = t.wi * S(level === "medium" ? 0.08 : 0.065);
    const baseStyle: React.CSSProperties = { display: "inline-block", whiteSpace: "pre", position: "relative" };
    const textStyle: React.CSSProperties = t.accent ? gradText(GOLD_GRAD) : { color };

    if (level === "heavy") {
      const cs = chars(t.word).map((ch) => {
        const i = ci++;
        const s0 = S(0.04) + i * stepH;
        const p = sp(f, fps, s0, SPR.slam);
        const o = iv(f, [s0, s0 + S(0.06)], [0, 1], EASE.linear);
        const sc = 1 + 1.6 * (1 - p);
        const rot = (rnd(i * 3.7) - 0.5) * 16 * (1 - p);
        const blur = 14 * (1 - p);
        return (
          <span key={i} style={{ display: "inline-block", transform: `translateY(${-40 * (1 - p)}px) scale(${sc}) rotate(${rot}deg)`, opacity: o, filter: blur > 0.3 ? `blur(${blur}px)` : undefined, ...textStyle }}>
            {ch}
          </span>
        );
      });
      return (
        <span key={t.wi} style={baseStyle}>
          {cs}
        </span>
      );
    }

    if (level === "medium") {
      const p = sp(f, fps, wStart, SPR.pop);
      const o = iv(f, [wStart, wStart + S(0.12)], [0, 1], EASE.linear);
      const mark = t.accent ? iv(f, [wStart + S(0.25), wStart + S(0.6)], [0, 1], EASE.out) : 0;
      return (
        <span key={t.wi} style={{ ...baseStyle, overflow: "hidden", verticalAlign: "bottom", padding: "0.32em 0.06em 0.14em", margin: "-0.32em -0.06em -0.14em" }}>
          {t.accent && (
            <span style={{ position: "absolute", left: "0.02em", right: nextAccent(t) ? "-0.3em" : "0.02em", top: "0.42em", bottom: "0.16em", background: GOLD_GRAD, borderRadius: "0.12em", transform: `scaleX(${mark})`, transformOrigin: "0 50%", boxShadow: `0 0 ${40 * mark}px ${C.gold}88` }} />
          )}
          <span style={{ display: "inline-block", transform: `translateY(${(1 - p) * 140}%) rotate(${(1 - p) * 5}deg)`, opacity: o, position: "relative", ...(t.accent ? { color: mark > 0.5 ? C.ink : undefined, ...(mark > 0.5 ? {} : gradText(GOLD_GRAD)) } : { color }) }}>
            {t.word}
          </span>
        </span>
      );
    }

    // light
    const e = iv(f, [wStart, wStart + S(0.55)], [0, 1], EASE.out);
    const glow = t.accent ? iv(f, [wStart + S(0.4), wStart + S(1.1)], [0, 1], EASE.out) : 0;
    return (
      <span key={t.wi} style={{ ...baseStyle, opacity: e, transform: `translateY(${(1 - e) * 14}px)`, filter: e < 0.98 ? `blur(${(1 - e) * 8}px)` : undefined }}>
        <span style={textStyle}>{t.word}</span>
        {t.accent && <span style={{ position: "absolute", left: 0, right: nextAccent(t) ? "-0.3em" : 0, bottom: "0.02em", height: "0.07em", borderRadius: 9, background: GOLD_GRAD, transform: `scaleX(${glow})`, transformOrigin: "0 50%", boxShadow: `0 0 18px ${C.gold}` }} />}
      </span>
    );
  };

  const byLine: Tok[][] = new Array(lines).fill(0).map(() => []);
  toks.forEach((t) => byLine[t.line].push(t));
  const lastWordStart = toks.length * S(level === "medium" ? 0.08 : 0.065);
  const subStart = level === "heavy" ? land + S(0.35) : lastWordStart + S(0.3);
  const subE = iv(f, [subStart, subStart + S(0.6)], [0, 1], EASE.out);

  return (
    <div
      style={{
        position: "absolute", inset: 0, display: "flex", flexDirection: "column", justifyContent: "center",
        alignItems: align === "center" ? "center" : "flex-start", padding: align === "left" ? "0 160px" : 0,
        opacity: 1 - exitP, transform: `translateY(${-30 * exitP}px)`, filter: exitP > 0.01 ? `blur(${exitP * 10}px)` : undefined,
      }}
    >
      {level === "heavy" && shakeK > 0.02 && (
        // radial glow burst behind the word on impact
        <div style={{ position: "absolute", left: "50%", top: "50%", width: 1400, height: 700, transform: `translate(-50%,-50%) scale(${1 + (1 - shakeK) * 0.5})`, background: `radial-gradient(ellipse, ${C.gold}66 0%, ${C.coral}22 40%, transparent 70%)`, opacity: shakeK }} />
      )}
      <div style={{ position: "relative", transform: `translate(${shake.x}px, ${shake.y}px) rotate(${shake.r}deg) scale(${settle})`, textAlign: align }}>
        {level === "heavy" && shakeK > 0.05 &&
          // RGB split ghosts, only during the hit
          [["#FF3B6B", -1], ["#3BE8FF", 1]].map(([col, d]) => (
            <div key={col as string} aria-hidden style={{ position: "absolute", inset: 0, transform: `translateX(${(d as number) * 14 * shakeK}px)`, opacity: 0.55 * shakeK, mixBlendMode: "screen", fontFamily: DISPLAY, fontWeight: 900, fontSize: fs, lineHeight: 1.04, letterSpacing: "-0.02em", color: col as string }}>
              {byLine.map((ln, li) => (
                <div key={li}>{ln.map((t) => t.word).join(" ")}</div>
              ))}
            </div>
          ))}
        {byLine.map((ln, li) => (
          <div key={li} style={{ fontFamily: DISPLAY, fontWeight: level === "light" ? 800 : 900, fontSize: fs, lineHeight: level === "medium" ? 1.12 : 1.04, letterSpacing: level === "heavy" ? "-0.02em" : "-0.01em", filter: level === "heavy" ? `drop-shadow(0 12px 40px rgba(0,0,0,0.55)) drop-shadow(0 0 ${30 * shakeK}px ${C.gold})` : "drop-shadow(0 10px 30px rgba(0,0,0,0.45))" }}>
            {ln.map((t, k) => (
              <React.Fragment key={t.wi}>
                {renderWord(t)}
                {k < ln.length - 1 ? " " : ""}
              </React.Fragment>
            ))}
          </div>
        ))}
      </div>
      {sub && (
        <div style={{ marginTop: 34, fontFamily: UI, fontWeight: 500, fontSize: Math.round(fs * (level === "heavy" ? 0.2 : 0.3)), color: C.textDim, letterSpacing: "0.02em", opacity: subE, transform: `translateY(${(1 - subE) * 16}px)` }}>{sub}</div>
      )}
    </div>
  );
};
