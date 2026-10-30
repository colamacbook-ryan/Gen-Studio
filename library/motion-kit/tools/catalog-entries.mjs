// © 2026 Gen Labs — All rights reserved.
// Sinh catalog.d/motion-kit.json (mỗi khối Remotion = 1 motion-template). Chạy: node motion-kit/tools/catalog-entries.mjs
import { existsSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const MK = join(dirname(fileURLToPath(import.meta.url)), "..");
const AL = join(MK, "..");
const DAY = "2026-10-30";
const LARGE = "/tmp/claude-0/-home-user/bba20ac0-16bf-5912-8dd5-4d08b20490c6/scratchpad/alib-large";
const T = [
  ["kinetic-title", "components/KineticTitle.tsx", "KineticTitle — tiêu đề chữ động 3 cấp (light: thở vào · medium: trồi khỏi mặt nạ + bút dạ vàng · heavy: đập chữ + rung + RGB tách)", ["title", "text", "hook", "payoff"], ["light", "medium", "heavy"], ["hook", "setup", "payoff", "climax"], "Demo-KineticTitle-Light|Medium|Heavy", '<KineticTitle level="medium" text={"Mỗi clip sau\\nchỉ tốn *0 đồng*"} sub="..." start={10} exitAt={200} />'],
  ["lower-third", "components/LowerThird.tsx", "LowerThird — dải tên: avatar nảy, thanh kính lau ra, tên trồi khỏi mặt nạ, vạch nhấn", ["name-strap", "intro", "character"], ["light"], ["setup"], "Demo-LowerThird", '<LowerThird name="Nhi" role="Người dẫn" who="nhi" mood="explain" start={15} exitAt={200} />'],
  ["chat-bubble", "components/ChatBubble.tsx", "ChatBubble — hội thoại Nhi/Vy: chấm đang gõ → bong bóng bật từ đuôi → tin cũ trôi lên (độ dài chữ tuỳ ý)", ["chat", "dialogue", "character"], ["light"], ["setup", "build"], "Demo-ChatBubble", '<ChatBubble messages={[{ who: "vy", text: "...", at: 0.9 }, { who: "nhi", text: "...", at: 2.6 }]} />'],
  ["cursor-click", "components/CursorClick.tsx", "CursorClick — cửa sổ app, con trỏ lướt cung cong, bấm, gợn sóng, nút chuyển 'xong'", ["ui", "click", "demo", "tutorial"], ["light", "medium"], ["build"], "Demo-CursorClick", '<CursorClick buttons={[{ label: "Kịch bản" }, ...]} clicks={[{ target: 0, at: 1.3 }, ...]} />'],
  ["stamp", "components/Stamp.tsx", "Stamp — cú đóng dấu climax: lơ lửng → đập xuống → nén, sóng xung kích, mảnh vụn, vân mực", ["stamp", "impact", "verdict"], ["heavy"], ["climax"], "Demo-Stamp", '<Stamp text="ĐÃ DUYỆT" start={40} />  // đồng bộ rung/flash/SFX theo stampImpact(start, fps)'],
  ["checklist-reveal", "components/ChecklistReveal.tsx", "ChecklistReveal — thẻ danh sách: hàng trượt vào, ô vẽ viền, dấu tích vẽ nét, quét sáng, thanh tiến độ", ["list", "steps", "checklist"], ["light", "medium"], ["build", "payoff"], "Demo-ChecklistReveal", '<ChecklistReveal title="..." items={["...", "..."]} stepSec={0.7} />'],
  ["compare-two", "components/CompareTwo.tsx", "CompareTwo — hai thẻ cũ/mới, huy hiệu VS, phán quyết: bên thua chìm + mờ, bên thắng nổi + phát sáng + nhãn TỐT HƠN", ["compare", "versus", "before-after"], ["medium"], ["build"], "Demo-CompareTwo", '<CompareTwo left={{ title, items }} right={{ title, items }} verdictSec={2.4} />'],
  ["big-number-count", "components/BigNumberCount.tsx", "BigNumberCount — đồng hồ đếm cơ khí (trống số có nhoè chuyển động), chạm đích nảy + sáng, thanh đo", ["number", "stat", "counter"], ["medium"], ["build", "payoff"], "Demo-BigNumberCount", '<BigNumberCount value={1250} label="..." durSec={1.8} />'],
  ["quiz", "components/Quiz.tsx", "Quiz — câu hỏi → đáp án → vòng đếm ngược 3·2·1 → lặng 0,35 s → lật đáp án đúng", ["quiz", "question", "countdown", "tension"], ["medium", "heavy"], ["build", "climax"], "Demo-Quiz", '<Quiz question="..." options={[...]} correct={2} />  // quizTimes() cho mốc SFX tick/reveal'],
  ["end-card", "components/EndCard.tsx", "EndCard — logo chữ, lời hứa, nút CTA có vệt sáng + nhịp thở, Nhi & Vy trồi lên", ["end-card", "cta", "outro", "character"], ["light"], ["cta"], "Demo-EndCard", '<EndCard title={"Làm một lần, *dùng mãi*"} cta="Bắt đầu ngay" />'],
  ["transitions", "transitions/Scene.tsx", "Chuyển cảnh: soft crossfade · whip (nhoè hướng + vệt) · zoom-through (bay xuyên + tia) · light-leak (vệt sáng phim) — qua <Scene enter/exit>", ["transition", "crossfade", "whip", "zoom-through", "light-leak"], ["light", "medium", "heavy"], ["setup", "build", "climax", "breath", "payoff"], "Demo-Transitions", '<Scene from={0} dur={130} exit={{ kind: "whip" }}>…</Scene><Scene from={110} dur={150} enter={{ kind: "whip" }}>…</Scene>'],
  ["camera-rig", "kit/Camera.tsx", "Camera rig — máy quay ảo khoá khung (x, y, zoom log-space, roll) + rung tay + cú rung, lớp <Depth z> thị sai", ["camera", "parallax", "shake", "push-in", "pull-out"], ["light", "medium", "heavy"], ["hook", "setup", "build", "climax", "breath", "payoff", "cta"], "Demo-CameraRig", '<CameraRig keys={[{ t: 0, zoom: 1 }, { t: 90, zoom: 1.3 }]} shakes={[{ t: 300, amp: 22 }]}><Depth z={0.3}>…</Depth><Depth z={1}>…</Depth></CameraRig>'],
  ["intensity-presets", "kit/intensity.ts", "intensity.ts — preset STD-17 cho 7 giai đoạn (easing, độ mạnh, nhịp cắt, máy quay, chuyển cảnh, mức nhạc) + checkBudget()", ["std-17", "pacing", "presets"], ["light", "medium", "heavy"], ["hook", "setup", "build", "climax", "breath", "payoff", "cta"], "—", 'import { PRESETS, checkBudget } from "./kit/intensity"; const P = PRESETS.build;'],
  ["backdrop", "kit/Backdrop.tsx", "Backdrop + Post — nền có chiều sâu (3 lớp thị sai, sàn lưới phối cảnh, bokeh) theo 4 mood + vignette, hạt phim, flash", ["background", "depth", "bokeh", "grain"], ["light", "medium"], ["hook", "setup", "build", "breath", "payoff", "cta"], "mọi Demo", '<Backdrop mood="calm|warm|tense|bright" energy={0.5} /> … <Post flash={…} />'],
];
const out = T.map(([slug, file, title, tags, energy, phase, demo, reuse]) => {
  const p = join(MK, "src", file);
  return {
    id: `motion.${slug}`, type: "motion-template", title, tags: [...tags, "remotion"], energy, phase,
    path: `motion-kit/src/${file}`, size_bytes: statSync(p).size, format: "tsx", stored: "git",
    source: "Gen Labs — motion-kit (Remotion 4.0.539, React 19)", license: "Gen-Labs-proprietary", commercial_ok: true, redistribution: "in-product-only",
    quality: "A", quality_note: "Đã xem từng khung ở các mốc vào/giữa/ra (tools/stills.sh) và trong showcase.", added: DAY, cost_usd: 0,
    how_made: `Code tay; demo: composition ${demo} (motion-kit/src/demos.tsx)`, reuse,
    note: "Remotion: miễn phí cho cá nhân và công ty ≤3 người; công ty lớn hơn cần Remotion Company License (remotion.pro).",
  };
});
const full = join(LARGE, "showcase.mp4"), prev = join(MK, "showcase-preview-720p.mp4");
const base = {
  type: "motion-template", tags: ["showcase", "reel", "demo", "remotion"], energy: ["light", "medium", "heavy"], phase: ["hook", "setup", "build", "climax", "breath", "payoff", "cta"],
  duration_s: 41, format: "mp4", source: "Gen Labs — npx remotion render (Showcase) + nhạc/SFX từ catalog (audio agent)", license: "Gen-Labs-proprietary", commercial_ok: true, redistribution: "in-product-only",
  quality: "A", quality_note: "Đã xem dải khung toàn phim + cận cảnh climax và whip; âm lượng đỉnh −0,8 dBFS.", added: DAY, cost_usd: 0,
  how_made: "cd motion-kit && npm run sync && npx remotion bundle --out-dir build && npx remotion render build Showcase out/showcase.mp4 --crf=20 (hình) + --codec=wav (tiếng), ghép bằng ffmpeg",
  reuse: "Khuôn cho clip mới: src/showcase/Showcase.tsx (beat sheet B[], camera CAM[], cue sheet SFX[]/BEDS[]).",
  note: "Nhạc CC BY 4.0 phải ghi công khi đăng: \"Digital Lemonade\", \"Furious Freak\", \"Neon Laser Horizon\" — Kevin MacLeod (incompetech.com), Licensed under Creative Commons: By Attribution 4.0 License; \"Uplift Me\" — Mixkit.",
};
if (existsSync(full)) out.push({ ...base, id: "motion.showcase-reel", title: "Showcase reel 41 s 1080p60 — mọi khối motion-kit theo đường cong STD-17 (1 cú heavy)", path: full, size_bytes: statSync(full).size, dimensions: "1920x1080", stored: "local-scratch", note: base.note + " >5 MB nên để scratch (dựng lại bằng how_made); bản xem nhanh 720p ở motion.showcase-preview." });
if (existsSync(prev)) out.push({ ...base, id: "motion.showcase-preview", title: "Showcase reel — bản xem nhanh 720p30 (≤5 MB, trong git)", path: "motion-kit/showcase-preview-720p.mp4", size_bytes: statSync(prev).size, dimensions: "1280x720", stored: "git" });
writeFileSync(join(AL, "catalog.d", "motion-kit.json"), JSON.stringify(out, null, 1) + "\n");
console.log(`catalog.d/motion-kit.json: ${out.length} entries`);
