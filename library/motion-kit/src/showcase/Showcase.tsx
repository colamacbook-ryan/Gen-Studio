// © 2026 Gen Labs — All rights reserved.
// Showcase reel (~41 s, 60 fps): every kit piece, cut to a STD-17 intensity curve.
//   Hook (M) → Setup (L, calm) → Build ×4 (L→M, accelerating cuts) → Quiz tension → ONE heavy climax (stamp)
//   → Breath (near-still, music out) → Payoff (M, pull-out) → CTA (L).
import React from "react";
import { AbsoluteFill, Loop, OffthreadVideo, Sequence, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { Audio } from "@remotion/media";
import { Backdrop, Mood, Post } from "../kit/Backdrop";
import { CamKey, CameraRig, Depth } from "../kit/Camera";
import { EASE, impulse, iv } from "../kit/anim";
import { Phase, PRESETS, checkBudget } from "../kit/intensity";
import { C, UI } from "../kit/theme";
import { Scene, Tx, txFrames } from "../transitions/Scene";
import { KineticTitle } from "../components/KineticTitle";
import { LowerThird } from "../components/LowerThird";
import { ChatBubble } from "../components/ChatBubble";
import { CursorClick } from "../components/CursorClick";
import { ChecklistReveal } from "../components/ChecklistReveal";
import { CompareTwo } from "../components/CompareTwo";
import { BigNumberCount } from "../components/BigNumberCount";
import { Quiz, quizTimes } from "../components/Quiz";
import { Stamp, stampImpact } from "../components/Stamp";
import { EndCard } from "../components/EndCard";

const FPS = 60;
const s = (x: number) => Math.round(x * FPS);

// ---------------- beat sheet (seconds) ----------------
type Beat = { id: string; phase: Phase; at: number; len: number; enter?: Tx; mood: Mood; camera: "static" | "drift" | "pushIn" | "pullOut" | "pan" | "punch" };
const B: Beat[] = [
  { id: "hook", phase: "hook", at: 0, len: 3.6, mood: "warm", camera: "pushIn" },
  { id: "setup", phase: "setup", at: 3.6, len: 6.4, enter: { kind: "crossfade", sec: 0.7 }, mood: "calm", camera: "drift" },
  { id: "click", phase: "build", at: 10.0, len: 4.2, enter: { kind: "whip" }, mood: "calm", camera: "pan" },
  { id: "check", phase: "build", at: 14.2, len: 3.7, enter: { kind: "whip", dir: -1 }, mood: "bright", camera: "pushIn" },
  { id: "compare", phase: "build", at: 17.9, len: 3.3, enter: { kind: "whip" }, mood: "warm", camera: "static" },
  { id: "number", phase: "build", at: 21.2, len: 2.7, enter: { kind: "cut" }, mood: "calm", camera: "punch" },
  { id: "quiz", phase: "climax", at: 23.9, len: 8.6, enter: { kind: "zoomThrough" }, mood: "tense", camera: "pushIn" },
  { id: "payoff", phase: "payoff", at: 32.5, len: 4.2, enter: { kind: "lightLeak", sec: 1.1 }, mood: "bright", camera: "pullOut" },
  { id: "cta", phase: "cta", at: 36.7, len: 4.3, enter: { kind: "crossfade", sec: 0.8 }, mood: "bright", camera: "static" },
];
export const SHOWCASE_SEC = 41;
export const SHOWCASE_FRAMES = s(SHOWCASE_SEC);

// quiz → climax timing
const QUIZ_AT = B[6].at;
const QT = quizTimes(4, 3);
const REVEAL = s(QUIZ_AT + QT.reveal);
const STAMP_START = REVEAL - s(0.32); // stamp touches down exactly on the reveal
const HIT = stampImpact(STAMP_START, FPS);
const BREATH_END = s(B[7].at);

if (typeof window !== "undefined") {
  const warn = checkBudget([...B.map((b) => ({ phase: b.phase, camera: b.camera })).slice(0, 7), { phase: "breath", camera: "pullOut" }, ...B.slice(7).map((b) => ({ phase: b.phase, camera: b.camera }))], SHOWCASE_SEC);
  if (warn.length) console.warn("STD-17 budget:", warn);
}

// ---------------- camera (global frames) ----------------
const CAM: CamKey[] = [
  { t: 0, zoom: 1.0 }, { t: s(3.6), zoom: 1.07, ease: EASE.soft }, // hook push-in
  { t: s(3.61), zoom: 1.0, x: 0 }, { t: s(10), zoom: 1.02, x: 0 }, // setup drift (handheld does the rest)
  { t: s(10.01), x: -40, zoom: 1.02 }, { t: s(14.2), x: 40 }, // pan
  { t: s(14.21), x: 0, zoom: 1.0 }, { t: s(17.9), zoom: 1.06 }, // push-in
  { t: s(17.91), zoom: 1.0 }, { t: s(21.2), zoom: 1.0 }, // static
  { t: s(21.2) + s(2.0), zoom: 1.0 }, { t: s(21.2) + s(2.15), zoom: 1.06, ease: EASE.out }, // punch on landing
  { t: s(23.9), zoom: 1.0 }, { t: REVEAL - s(0.4), zoom: 1.12, ease: EASE.inOut }, // tension push-in through countdown
  { t: HIT + 2, zoom: 1.12 }, { t: BREATH_END, zoom: 1.03, ease: EASE.soft }, // breath: slow pull-out
  { t: BREATH_END + 1, zoom: 1.08 }, { t: s(36.7), zoom: 1.0, ease: EASE.soft }, // payoff pull-out
  { t: s(36.71), zoom: 1.0 },
];

// ---------------- audio cue sheet ----------------
type Cue = { at: number; src: string; vol?: number };
const SFX: Cue[] = [
  { at: 0.05, src: "L:whoosh/whoosh-light-03", vol: 0.5 },
  { at: 1.05, src: "L:pop/pop-03", vol: 0.45 },
  { at: B[1].at - 0.2, src: "L:whoosh/whoosh-light-03", vol: 0.3 },
  { at: 4.1, src: "L:pop/pop-01", vol: 0.3 }, // lower third avatar
  ...[1.5, 3.1, 4.6].map((t) => ({ at: B[1].at + t, src: "L:pop/pop-02", vol: 0.35 })), // chat bubbles
  { at: B[2].at - 0.15, src: "whoosh-fast", vol: 0.55 },
  ...[1.25, 2.05, 2.85].map((t) => ({ at: B[2].at + t, src: "L:click/click-02", vol: 0.6 })),
  { at: B[2].at + 2.9, src: "L:notification/notification-ding-01", vol: 0.25 },
  { at: B[3].at - 0.15, src: "whoosh-fast", vol: 0.55 },
  ...[0.45, 0.95, 1.45, 1.95].map((t) => ({ at: B[3].at + t + 0.15, src: "L:pop/pop-02", vol: 0.4 })),
  { at: B[4].at - 0.15, src: "whoosh-fast", vol: 0.55 },
  { at: B[4].at + 0.9, src: "L:pop/pop-03", vol: 0.4 },
  { at: B[4].at + 2.0, src: "L:notification/notification-positive-01", vol: 0.35 },
  { at: B[5].at, src: "L:impact/impact-medium-01", vol: 0.45 },
  ...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => ({ at: B[5].at + 0.3 + i * 0.2, src: "tick", vol: 0.12 + i * 0.02 })),
  { at: B[5].at + 2.05, src: "L:pop/pop-03", vol: 0.5 },
  { at: B[6].at - 0.35, src: "L:whoosh/whoosh-medium-02", vol: 0.6 },
  ...QT.ticks.map((t) => ({ at: QUIZ_AT + t, src: "tick", vol: 0.55 })),
  { at: HIT / FPS - 2.6, src: "L:riser/riser-01", vol: 0.5 },
  { at: HIT / FPS - 0.01, src: "L:impact/impact-heavy-01", vol: 1.0 }, // the one heavy hit
  { at: HIT / FPS + 0.05, src: "L:success/success-01", vol: 0.3 },
  { at: HIT / FPS + 1.4, src: "swell", vol: 0.35 }, // breath: a soft swell instead of music
  { at: B[8].at + 0.6, src: "L:pop/pop-01", vol: 0.35 },
  { at: B[8].at + 1.2, src: "L:notification/notification-positive-01", vol: 0.3 },
];

// "L:<path>" = curated library file (audio/sfx|music, synced to public/lib/audio); bare name = our synthesized fallback
const sfxSrc = (x: string) => (x.startsWith("L:") ? staticFile(`lib/audio/sfx/${x.slice(2)}.wav`) : staticFile(`sfx/${x}.wav`));
const musicSrc = (x: string) => (x.startsWith("L:") ? staticFile(`lib/audio/music/${x.slice(2)}`) : staticFile(`music/${x}.flac`));
// Music credits (CC BY 4.0, must appear in the video description): "Digital Lemonade", "Furious Freak", "Neon Laser Horizon"
// — Kevin MacLeod (incompetech.com), Licensed under Creative Commons: By Attribution 4.0 License. "Uplift Me" — Mixkit (Mixkit Stock Music Free License).

/** music beds with fades; tension bed is cut 0.35 s before the hit (silence makes the hit land) */
const BEDS = [
  { src: "L:light-explain-01.mp3", from: 0, to: B[2].at + 0.6, vol: (t: number) => iv(t, [0, 0.4, 3.6, 4.2], [0.0, 0.5, 0.5, 0.32], EASE.linear) },
  { src: "L:build-01.mp3", from: B[2].at - 0.4, to: B[6].at + 0.6, vol: (t: number) => iv(t, [0, 0.8], [0, 0.42], EASE.linear) },
  { src: "L:climax-01.mp3", from: B[6].at - 0.2, to: HIT / FPS - 0.35, vol: (t: number) => iv(t, [0, 0.6], [0, 0.48], EASE.linear) },
  { src: "L:happy-outro-02.mp3", from: B[7].at - 0.3, to: SHOWCASE_SEC, vol: (t: number) => iv(t, [0, 1.2, SHOWCASE_SEC - B[7].at - 1.2, SHOWCASE_SEC - B[7].at + 0.3], [0, 0.42, 0.42, 0], EASE.linear) },
];

const SceneBg: React.FC<{ mood: Mood; children: React.ReactNode; energy?: number }> = ({ mood, children, energy }) => (
  <>
    <Backdrop mood={mood} energy={energy} />
    <Depth z={1}>{children}</Depth>
  </>
);

const VyWave: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const inP = iv(f, [0, 0.6 * fps], [0, 1], EASE.out);
  return (
    <div style={{ position: "absolute", left: 40, bottom: -10, width: 900, height: 506, opacity: inP, transform: `translateY(${(1 - inP) * 60}px)`, filter: "drop-shadow(0 30px 40px rgba(0,0,0,0.5))" }}>
      <Loop durationInFrames={Math.round((95 / 24) * fps)}>
        <OffthreadVideo src={staticFile("clips/vy-wave-alpha.webm")} transparent muted style={{ width: 900, height: 506 }} />
      </Loop>
    </div>
  );
};

export const Showcase: React.FC = () => {
  const f = useCurrentFrame();
  const scenes = B.map((b, i) => {
    const next = B[i + 1];
    const exit = next?.enter;
    const tail = txFrames(exit, FPS);
    return { ...b, from: s(b.at), dur: s(b.len) + tail, exit };
  });
  const flash = 0.55 * impulse(f, HIT, 6) + 0.12 * impulse(f, s(B[5].at + 2.05), 6);
  // dim builds before the hit (anticipation) and stays under the stamp through the breath so it reads alone
  const preDim = iv(f, [REVEAL - s(0.6), REVEAL - s(0.05), HIT + s(0.3)], [0, 0.35, 0.62]);
  const behindBlur = iv(f, [HIT, HIT + s(0.6)], [0, 7], EASE.out);
  const breathT = iv(f, [HIT + s(0.5), BREATH_END], [0, 1]);
  const P = PRESETS.climax;

  return (
    <AbsoluteFill style={{ background: C.ink }}>
      <CameraRig keys={CAM} handheld={4} shakes={[{ t: HIT, amp: P.shake, tau: 8 }]}>
        {/* HOOK */}
        <Scene from={scenes[0].from} dur={scenes[0].dur} enter={scenes[0].enter} exit={scenes[0].exit} seed={1} name={scenes[0].id}>
          <SceneBg mood="warm" energy={0.8}>
            <KineticTitle level="medium" start={8} text={"Một thư viện.\n*Vô số* clip."} sub="Bộ công cụ chuyển động của Gen Labs" />
          </SceneBg>
        </Scene>
        {/* SETUP — calm: AI clip of Vy + a short chat, lower third */}
        <Scene from={scenes[1].from} dur={scenes[1].dur} enter={scenes[1].enter} exit={scenes[1].exit} seed={2} name={scenes[1].id}>
          <SceneBg mood="calm" energy={0.3}>
            <VyWave />
            <div style={{ position: "absolute", inset: 0, transform: "translateX(330px)" }}>
              <ChatBubble width={980} messages={[{ who: "vy", text: "Mỗi clip lại gọi AI từ đầu à? Tốn lắm!", at: 1.5, mood: "unsure" }, { who: "nhi", text: "Không cần. Làm tài nguyên một lần, sau chỉ ghép.", at: 3.1, mood: "explain" }, { who: "vy", text: "Cho mình xem với!", at: 4.6, mood: "excited" }]} />
            </div>
            <Sequence from={s(0.5)} layout="none">
              <LowerThird name="Vy" role="Clip AI nền xanh · lặp liền" who="vy" x={1300} y={130} exitAt={s(4.6)} />
            </Sequence>
          </SceneBg>
        </Scene>
        {/* BUILD 1 — cursor clicks */}
        <Scene from={scenes[2].from} dur={scenes[2].dur} enter={scenes[2].enter} exit={scenes[2].exit} seed={3} name={scenes[2].id}>
          <SceneBg mood="calm" energy={0.5}>
            <CursorClick title="Xưởng video — ghép clip" buttons={[{ label: "Nhân vật" }, { label: "Nhạc + SFX" }, { label: "Xuất video" }]} clicks={[{ target: 0, at: 1.25 }, { target: 1, at: 2.05 }, { target: 2, at: 2.85 }]} />
          </SceneBg>
        </Scene>
        {/* BUILD 2 — checklist */}
        <Scene from={scenes[3].from} dur={scenes[3].dur} enter={scenes[3].enter} exit={scenes[3].exit} seed={4} name={scenes[3].id}>
          <SceneBg mood="bright" energy={0.6}>
            <ChecklistReveal title="Trong thư viện có" items={["32 dáng nhân vật Nhi + Vy", "Clip AI khâu nối được", "Nhạc nền + 20 hiệu ứng âm", "Khối chữ, chuyển cảnh, máy quay"]} start={6} stepSec={0.5} firstSec={0.45} />
          </SceneBg>
        </Scene>
        {/* BUILD 3 — compare */}
        <Scene from={scenes[4].from} dur={scenes[4].dur} enter={scenes[4].enter} exit={scenes[4].exit} seed={5} name={scenes[4].id}>
          <SceneBg mood="warm" energy={0.7}>
            <CompareTwo left={{ title: "Gọi AI mỗi clip", items: ["Tốn tiền mỗi lần", "Mỗi lần một kiểu"] }} right={{ title: "Ghép từ thư viện", items: ["0 đồng mỗi clip", "Đúng phong cách"] }} start={4} verdictSec={2.0} />
          </SceneBg>
        </Scene>
        {/* BUILD 4 — number */}
        <Scene from={scenes[5].from} dur={scenes[5].dur} enter={scenes[5].enter} exit={scenes[5].exit} seed={6} name={scenes[5].id}>
          <SceneBg mood="calm" energy={0.8}>
            <BigNumberCount value={1250} label="clip ghép được từ một lần làm" start={0} durSec={1.8} />
          </SceneBg>
        </Scene>
        {/* QUIZ (tension) → CLIMAX (stamp) → BREATH */}
        <Scene from={scenes[6].from} dur={scenes[6].dur} enter={scenes[6].enter} exit={scenes[6].exit} seed={7} name={scenes[6].id}>
          <SceneBg mood="tense" energy={0.9 - 0.7 * breathT}>
            <div style={{ position: "absolute", inset: 0, filter: behindBlur > 0.1 ? `blur(${behindBlur}px)` : undefined }}>
            <Quiz question="Clip thứ 100 tốn bao nhiêu tiền tài nguyên?" options={["3 USD", "0,12 USD", "0 đồng", "Tuỳ ngày"]} correct={2} />
            </div>
            <AbsoluteFill style={{ background: "#07020A", opacity: preDim }} />
            <Sequence from={STAMP_START - s(QUIZ_AT)} layout="none">
              <Stamp text="0 ĐỒNG" sub="MỖI CLIP MỚI" x={960} y={560} size={190} />
            </Sequence>
          </SceneBg>
        </Scene>
        {/* PAYOFF */}
        <Scene from={scenes[7].from} dur={scenes[7].dur} enter={scenes[7].enter} exit={scenes[7].exit} seed={8} name={scenes[7].id}>
          <SceneBg mood="bright" energy={0.4}>
            <KineticTitle level="light" size={124} start={s(0.6)} text={"Làm *một lần*,\ndùng mãi mãi."} sub="Mỗi clip sau: ghép trong vài phút, 0 đồng tài nguyên" exitAt={s(4.2) - 10} />
          </SceneBg>
        </Scene>
        {/* CTA */}
        <Scene from={scenes[8].from} dur={scenes[8].dur} enter={scenes[8].enter} exit={scenes[8].exit} seed={9} name={scenes[8].id}>
          <SceneBg mood="bright" energy={0.3}>
            <EndCard title={"Thư viện tài nguyên *Gen Labs*"} cta="Ghép clip đầu tiên" handle="motion-kit · asset-lib v1" start={6} />
          </SceneBg>
        </Scene>
      </CameraRig>
      <Post flash={flash} vignette={0.5 + 0.2 * preDim} tint={C.coral} tintAmt={0.25 * impulse(f, HIT, 30)} />
      {/* fade out */}
      <AbsoluteFill style={{ background: C.ink, opacity: interpolate(f, [SHOWCASE_FRAMES - 30, SHOWCASE_FRAMES], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }} />
      {/* phase label (small, for the showcase only) */}
      <div style={{ position: "absolute", left: 40, top: 30, fontFamily: UI, fontWeight: 600, fontSize: 20, letterSpacing: "0.16em", color: C.textDim, opacity: 0.55 }}>
        {(() => {
          const t = f / FPS;
          if (f >= HIT && f < BREATH_END) return f < HIT + s(0.8) ? "CLIMAX · HEAVY" : "BREATH · LIGHT";
          const b = [...B].reverse().find((x) => t >= x.at)!;
          return `${b.phase.toUpperCase()} · ${PRESETS[b.phase].level.toUpperCase()}`;
        })()}
      </div>
      {/* audio */}
      {BEDS.map((m, i) => (
        <Sequence key={m.src + i} from={s(m.from)} durationInFrames={s(m.to - m.from)} layout="none">
          <Audio src={musicSrc(m.src)} loop volume={(fr) => m.vol(fr / FPS) * 0.7} />  {/* library tracks are mastered ~5 dB hotter than our beds */}
        </Sequence>
      ))}
      {SFX.map((c, i) => (
        <Sequence key={i} from={Math.max(0, s(c.at))} layout="none">
          <Audio src={sfxSrc(c.src)} volume={c.vol ?? 0.5} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
