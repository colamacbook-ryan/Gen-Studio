// © 2026 Gen Labs — All rights reserved.
// One demo composition per component (id "Demo-<Name>"), each a self-contained usage example at 60 fps.
import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { DemoFrame } from "./kit/DemoFrame";
import { Backdrop } from "./kit/Backdrop";
import { CameraRig, Depth } from "./kit/Camera";
import { C, DISPLAY, UI } from "./kit/theme";
import { KineticTitle } from "./components/KineticTitle";
import { LowerThird } from "./components/LowerThird";
import { ChatBubble } from "./components/ChatBubble";
import { CursorClick } from "./components/CursorClick";
import { Stamp, stampImpact } from "./components/Stamp";
import { ChecklistReveal } from "./components/ChecklistReveal";
import { CompareTwo } from "./components/CompareTwo";
import { BigNumberCount } from "./components/BigNumberCount";
import { Quiz } from "./components/Quiz";
import { EndCard } from "./components/EndCard";
import { Scene } from "./transitions/Scene";
import { TransitionKind } from "./kit/intensity";
import { Showcase, SHOWCASE_FRAMES } from "./showcase/Showcase";

type Demo = { id: string; sec: number; component: React.FC; frames?: number };
const F = 60;

const StampDemo: React.FC = () => {
  const start = 40;
  return (
    <DemoFrame mood="tense" keys={[{ t: 0, zoom: 1 }, { t: stampImpact(start, F), zoom: 1.08 }]} handheld={3}>
      <Stamp text="ĐÃ DUYỆT" sub="MIỄN PHÍ" start={start} />
    </DemoFrame>
  );
};

const Card: React.FC<{ title: string; tint: string }> = ({ title, tint }) => (
  <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
    <div style={{ width: 1200, height: 560, borderRadius: 40, background: `linear-gradient(160deg, ${tint}, ${C.navy2})`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: DISPLAY, fontWeight: 900, fontSize: 110, color: C.cream, boxShadow: "0 40px 80px -30px rgba(0,0,0,0.7)" }}>{title}</div>
  </AbsoluteFill>
);

/** 4 transitions back to back: A →crossfade→ B →whip→ C →zoomThrough→ D →lightLeak→ E */
const TransitionsDemo: React.FC = () => {
  const kinds: TransitionKind[] = ["crossfade", "whip", "zoomThrough", "lightLeak"];
  const names = ["Soft crossfade", "Whip", "Zoom-through", "Light leak", "Hết"];
  const tints = [C.petrol2, "#3A2A5C", "#5B1630", C.goldDeep, C.petrol];
  const shot = 90;
  const ov = (k: TransitionKind) => ({ crossfade: 36, whip: 20, zoomThrough: 28, lightLeak: 60, cut: 0 })[k];
  let t = 0;
  const scenes = names.map((n, i) => {
    const enter = i > 0 ? { kind: kinds[i - 1] } : undefined;
    const exit = i < kinds.length ? { kind: kinds[i] } : undefined;
    const from = t;
    const dur = shot + (exit ? ov(exit.kind) : 0);
    t += shot;
    return (
      <Scene key={i} from={from} dur={dur + (i === names.length - 1 ? 60 : 0)} enter={enter} exit={exit} seed={i + 1}>
        <Card title={n} tint={tints[i]} />
      </Scene>
    );
  });
  return (
    <AbsoluteFill style={{ background: C.ink }}>
      <CameraRig handheld={3}>
        <Backdrop mood="calm" />
        <Depth z={1}>{scenes}</Depth>
      </CameraRig>
    </AbsoluteFill>
  );
};

const CameraDemo: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: C.ink }}>
      <CameraRig keys={[{ t: 0, zoom: 1 }, { t: 90, zoom: 1.35, x: -220, y: -40 }, { t: 180, zoom: 1.35, x: 260, y: 40 }, { t: 270, zoom: 0.92, x: 0, y: 0 }]} handheld={6} shakes={[{ t: 300, amp: 26 }]}>
        <Backdrop mood="bright" />
        <Depth z={1}>
          <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", fontFamily: DISPLAY, fontWeight: 900, fontSize: 120, color: C.cream }}>Camera rig</AbsoluteFill>
          <div style={{ position: "absolute", left: 160, top: 420, fontFamily: UI, fontSize: 40, color: C.textDim }}>push-in → pan → pull-out → shake</div>
        </Depth>
        <Depth z={1.6}>
          {[0, 1, 2].map((i) => <div key={i} style={{ position: "absolute", left: 200 + i * 700, top: 820 - i * 60, width: 160, height: 160, borderRadius: 80, background: `radial-gradient(circle, ${C.gold2}88, transparent 70%)`, filter: "blur(4px)" }} />)}
        </Depth>
      </CameraRig>
      <div style={{ position: "absolute", right: 40, bottom: 30, fontFamily: UI, fontSize: 24, color: C.textDim }}>frame {f}</div>
    </AbsoluteFill>
  );
};

export const DEMOS: Demo[] = [
  { id: "Showcase", sec: 0, frames: SHOWCASE_FRAMES, component: Showcase },
  { id: "Demo-KineticTitle-Light", sec: 4, component: () => <DemoFrame><KineticTitle level="light" start={10} text={"Làm *một lần*,\ndùng mãi mãi"} sub="Thư viện tài nguyên video của Gen Labs" exitAt={200} /></DemoFrame> },
  { id: "Demo-KineticTitle-Medium", sec: 4, component: () => <DemoFrame mood="warm"><KineticTitle level="medium" start={10} text={"Mỗi clip sau\nchỉ tốn *0 đồng*"} sub="Ghép từ thư viện, không gọi API" exitAt={200} /></DemoFrame> },
  { id: "Demo-KineticTitle-Heavy", sec: 4, component: () => <DemoFrame mood="tense"><KineticTitle level="heavy" start={20} text={"*0 ĐỒNG*"} sub="cho mỗi clip mới" /></DemoFrame> },
  { id: "Demo-LowerThird", sec: 4, component: () => <DemoFrame><LowerThird name="Nhi" role="Người dẫn · Gen Labs" who="nhi" mood="explain" start={15} exitAt={200} /><LowerThird name="Vy" role="Người hỏi thay bạn" who="vy" start={45} x={1170} y={850} exitAt={210} /></DemoFrame> },
  { id: "Demo-ChatBubble", sec: 6, component: () => <DemoFrame><ChatBubble messages={[{ who: "vy", text: "Làm video mà không tốn tiền á? Thật không?", at: 0.9, mood: "unsure" }, { who: "nhi", text: "Thật. Tài nguyên làm một lần, clip sau chỉ ghép lại.", at: 2.6, mood: "explain" }, { who: "vy", text: "Ồ, vậy mình làm luôn!", at: 4.2, mood: "excited" }]} /></DemoFrame> },
  { id: "Demo-CursorClick", sec: 5, component: () => <DemoFrame><CursorClick title="Xưởng video" buttons={[{ label: "Kịch bản" }, { label: "Lồng tiếng" }, { label: "Xuất video" }]} clicks={[{ target: 0, at: 1.3 }, { target: 1, at: 2.2 }, { target: 2, at: 3.1 }]} /></DemoFrame> },
  { id: "Demo-Stamp", sec: 3, component: StampDemo },
  { id: "Demo-ChecklistReveal", sec: 5, component: () => <DemoFrame><ChecklistReveal title="Một clip cần gì?" items={["Nhân vật diễn", "Nhạc nền + hiệu ứng âm", "Khối chữ, chuyển cảnh", "Giọng đọc offline"]} start={10} /></DemoFrame> },
  { id: "Demo-CompareTwo", sec: 5, component: () => <DemoFrame mood="warm"><CompareTwo left={{ title: "Gọi AI mỗi clip", items: ["Tốn tiền mỗi lần", "Mỗi lần một kiểu", "Chờ lâu"] }} right={{ title: "Thư viện dùng lại", items: ["0 đồng / clip", "Đồng bộ phong cách", "Ghép trong vài phút"] }} start={10} /></DemoFrame> },
  { id: "Demo-BigNumberCount", sec: 4, component: () => <DemoFrame><BigNumberCount value={1250} label="clip có thể ghép từ một thư viện" start={10} /></DemoFrame> },
  { id: "Demo-Quiz", sec: 7, component: () => <DemoFrame mood="tense"><Quiz question="Clip thứ 100 tốn bao nhiêu tiền tài nguyên?" options={["3 USD", "0,12 USD", "0 đồng", "Tuỳ ngày"]} correct={2} start={10} /></DemoFrame> },
  { id: "Demo-EndCard", sec: 4, component: () => <DemoFrame mood="bright"><EndCard title={"Làm một lần, *dùng mãi*"} cta="Bắt đầu ngay" handle="genlabs.vn" start={10} /></DemoFrame> },
  { id: "Demo-Transitions", sec: 8.5, component: TransitionsDemo },
  { id: "Demo-CameraRig", sec: 6.5, component: CameraDemo },
];
