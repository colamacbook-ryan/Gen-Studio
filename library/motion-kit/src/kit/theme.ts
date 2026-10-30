// © 2026 Gen Labs — All rights reserved.
// Theme: palette + typography + local font loading (Be Vietnam Pro + Lexend, SIL OFL 1.1, served from public/fonts).
import { continueRender, delayRender, staticFile } from "remotion";
import fonts from "./fonts.json";

if (typeof document !== "undefined") {
  const handle = delayRender("Loading Be Vietnam Pro + Lexend");
  Promise.all(
    (fonts as { family: string; weight: string; file: string; unicodeRange: string }[]).map((ft) => {
      const face = new FontFace(ft.family, `url(${staticFile(`fonts/${ft.file}`)}) format("woff2")`, {
        weight: ft.weight,
        unicodeRange: ft.unicodeRange,
      });
      document.fonts.add(face);
      return face.load();
    }),
  )
    .then(() => continueRender(handle))
    .catch((e) => {
      console.error(e);
      continueRender(handle);
    });
}

export const W = 1920;
export const H = 1080;
export const DISPLAY = "'Be Vietnam Pro', sans-serif";
export const UI = "'Lexend', sans-serif";

/** Gen Labs video palette (same world as the Remotion trailer). */
export const C = {
  ink: "#040D16",
  navy: "#071528",
  navy2: "#0C2038",
  petrol: "#0B3442",
  petrol2: "#11505F",
  teal: "#2FB7B0",
  teal2: "#7FE0D8",
  gold: "#F6B93B",
  gold2: "#FFD978",
  goldDeep: "#C9821A",
  coral: "#FF5E57",
  coral2: "#FF8A6B",
  cream: "#FFF4E2",
  white: "#FFFFFF",
  glass: "rgba(255,255,255,0.06)",
  glassLine: "rgba(255,255,255,0.14)",
  textDim: "rgba(255,244,226,0.62)",
};

export const GOLD_GRAD = `linear-gradient(180deg, ${C.gold2} 0%, ${C.gold} 48%, ${C.goldDeep} 100%)`;
export const TEAL_GRAD = `linear-gradient(180deg, ${C.teal2} 0%, ${C.teal} 100%)`;

/** Gradient text (accent words). */
export const gradText = (grad = GOLD_GRAD): React.CSSProperties => ({
  backgroundImage: grad,
  WebkitBackgroundClip: "text",
  backgroundClip: "text",
  color: "transparent",
});

/** Soft glass card used by every panel-type component. */
export const glassCard = (radius = 28): React.CSSProperties => ({
  borderRadius: radius,
  background: "linear-gradient(160deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.035) 60%, rgba(255,255,255,0.05) 100%)",
  border: `1.5px solid ${C.glassLine}`,
  boxShadow: "0 40px 80px -30px rgba(0,0,0,0.65), 0 18px 30px -18px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.18)",
  backdropFilter: "blur(14px)",
});

/** Character stills exported in ../characters (synced to public/characters). */
export type CharId = "nhi" | "vy";
export type Mood =
  | "neutral" | "explain" | "excited" | "shock" | "think" | "unsure" | "smug" | "sad"
  | "angry" | "panic" | "greedy" | "beg" | "proud" | "vow" | "bored" | "yell";
export const charSrc = (who: CharId, mood: Mood = "neutral") => staticFile(`characters/${who}-${mood}.png`);
export const CHAR_META: Record<CharId, { name: string; color: string; role: string }> = {
  nhi: { name: "Nhi", color: C.teal, role: "Người dẫn" },
  vy: { name: "Vy", color: C.coral2, role: "Người hỏi" },
};
