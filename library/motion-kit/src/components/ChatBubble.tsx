// © 2026 Gen Labs — All rights reserved.
// ChatBubble — a two-character chat: typing dots → bubble springs out of its tail → older messages glide up.
// Layout is natural (no text measuring): each row grows with the CSS grid 0fr→1fr trick, so any text length works.
import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { EASE, SPR, iv, sp } from "../kit/anim";
import { C, CHAR_META, CharId, Mood, UI } from "../kit/theme";
import { Avatar } from "./LowerThird";

export type ChatMsg = { who: CharId; text: string; at: number; mood?: Mood };
export type ChatBubbleProps = { messages: ChatMsg[]; start?: number; width?: number; typingSec?: number; exitAt?: number };

const Dots: React.FC<{ f: number; fps: number }> = ({ f, fps }) => (
  <div style={{ display: "flex", gap: 10, padding: "22px 26px" }}>
    {[0, 1, 2].map((i) => {
      const ph = ((f / fps) * 2.4 - i * 0.18) % 1;
      const b = Math.max(0, Math.sin(ph * Math.PI * 2));
      return <div key={i} style={{ width: 14, height: 14, borderRadius: 7, background: C.cream, opacity: 0.45 + 0.55 * b, transform: `translateY(${-8 * b}px)` }} />;
    })}
  </div>
);

export const ChatBubble: React.FC<ChatBubbleProps> = ({ messages, start = 0, width = 1100, typingSec = 0.7, exitAt }) => {
  const fr = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f = fr - start;
  const out = exitAt !== undefined ? iv(fr, [exitAt, exitAt + 0.45 * fps], [0, 1], EASE.in) : 0;
  return (
    <div style={{ position: "absolute", left: "50%", top: 0, bottom: 150, width, transform: `translateX(-50%) translateY(${-40 * out}px)`, opacity: 1 - out, display: "flex", flexDirection: "column", justifyContent: "flex-end", gap: 0 }}>
      {messages.map((m, i) => {
        const at = m.at * fps;
        const tStart = at - typingSec * fps;
        if (f < tStart) return null;
        const left = m.who === "nhi";
        const typing = f < at;
        const grow = iv(f, [tStart, tStart + 0.28 * fps], [0, 1], EASE.out); // row height
        const pop = typing ? sp(f, fps, tStart, SPR.pop) : sp(f, fps, at, SPR.pop);
        const txt = iv(f, [at + 0.06 * fps, at + 0.35 * fps], [0, 1], EASE.out);
        const col = CHAR_META[m.who].color;
        const bg = left ? "linear-gradient(160deg, rgba(47,183,176,0.28), rgba(17,80,95,0.55))" : "linear-gradient(160deg, #FF8A6B, #E8584E)";
        // older bubbles dim slightly so the newest reads first
        const newer = messages.filter((x, j) => j > i && f >= x.at * fps - typingSec * fps).length;
        const dim = 1 - Math.min(0.35, newer * 0.18);
        return (
          <div key={i} style={{ display: "grid", gridTemplateRows: `${grow}fr`, opacity: dim }}>
            <div style={{ overflow: "visible", minHeight: 0 }}>
              <div style={{ display: "flex", flexDirection: left ? "row" : "row-reverse", alignItems: "flex-end", gap: 22, padding: "14px 0" }}>
                <div style={{ transform: `scale(${sp(f, fps, tStart, SPR.pop)})`, flex: "none" }}>
                  <Avatar who={m.who} mood={m.mood} size={92} ring={col} />
                </div>
                <div
                  style={{
                    maxWidth: width - 260, transformOrigin: left ? "0% 100%" : "100% 100%", transform: `scale(${0.55 + 0.45 * pop}) translateY(${(1 - pop) * 20}px)`,
                    background: bg, borderRadius: left ? "30px 30px 30px 8px" : "30px 30px 8px 30px",
                    border: left ? `1.5px solid rgba(127,224,216,0.35)` : "1.5px solid rgba(255,255,255,0.25)",
                    boxShadow: "0 24px 50px -20px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.2)",
                  }}
                >
                  {typing ? (
                    <Dots f={f} fps={fps} />
                  ) : (
                    <div style={{ padding: "22px 30px 24px", fontFamily: UI, fontWeight: 500, fontSize: 38, lineHeight: 1.32, color: left ? C.cream : "#2A0E0B", opacity: txt, transform: `translateY(${(1 - txt) * 8}px)` }}>
                      <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: "0.06em", opacity: 0.7, marginBottom: 4, color: left ? C.teal2 : "#5A1A12" }}>{CHAR_META[m.who].name.toUpperCase()}</div>
                      {m.text}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
