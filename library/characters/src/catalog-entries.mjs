// © 2026 Gen Labs — All rights reserved.
// Sinh catalog.d/characters.json từ file thật trong characters/ (stills + clips). Chạy: node characters/src/catalog-entries.mjs
import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const AL = join(HERE, "..", "..");
const rel = (p) => p.slice(AL.length + 1);
const DAY = "2026-10-30";
const moods = JSON.parse(readFileSync(join(AL, "..", "design", "vy-chibi", "src", "moods.json"), "utf8"));
const ENERGY = { neutral: "light", explain: "light", think: "light", unsure: "light", bored: "light", sad: "light", excited: "medium", smug: "medium", proud: "medium", greedy: "medium", beg: "medium", vow: "medium", shock: "heavy", panic: "heavy", angry: "heavy", yell: "heavy" };
const PHASE = { light: ["setup", "build", "breath"], medium: ["hook", "build", "payoff", "cta"], heavy: ["hook", "climax"] };
const NAME = { nhi: "Nhi (người dẫn, hoodie teal)", vy: "Vy (người hỏi, cardigan san hô)" };
const crop = JSON.parse(readFileSync(join(AL, "characters", "crop-report.json"), "utf8"));
const out = [];

for (const who of ["nhi", "vy"]) {
  const dir = join(AL, "characters", who, "stills");
  const [w, h] = crop[who].size;
  for (const [mood, label, state, motion] of moods) {
    const p = join(dir, `${who}-${mood}.png`);
    const en = ENERGY[mood];
    out.push({
      id: `char.${who}.still.${mood}`, type: "character-still", title: `${NAME[who]} — ${label} (${mood})`,
      tags: [who, mood, "chibi", "transparent", "png"], energy: [en], phase: PHASE[en],
      path: rel(p), size_bytes: statSync(p).size, dimensions: `${w}x${h}`, format: "png", stored: "git",
      source: "Gen Labs — Gen-Chibi engine 0.26 (gen-studio/vendor/gen-chibi) + pack " + (who === "nhi" ? "design/gen-chibi" : "design/vy-chibi"),
      license: "Gen-Labs-proprietary", commercial_ok: true, redistribution: "in-product-only", quality: "A",
      quality_note: "Đã xem lưới 16 mood; khung chung cho cả 16 mood (đổi mood không nhảy cỡ); nền trong suốt.",
      added: DAY, cost_usd: 0,
      how_made: `node characters/src/export.js && python3 characters/src/crop.py  (state=${state}, motion=${motion}, mặt theo render/engine/moods.json)`,
      reuse: `Remotion: <Img src={staticFile('characters/${who}-${mood}.png')}/> (sync bằng motion-kit/tools/sync-assets.sh) hoặc charSrc('${who}','${mood}').`,
    });
  }
  const g = join(dir, `${who}-neutral-chroma-1280x720.png`);
  out.push({
    id: `char.${who}.still.neutral-chroma`, type: "character-still", title: `${NAME[who]} — tư thế trung tính trên nền chroma #00B140 (keyframe AI video)`,
    tags: [who, "neutral", "chroma-key", "keyframe", "first-last-frame"], energy: ["light"],
    path: rel(g), size_bytes: statSync(g).size, dimensions: "1280x720", format: "png", stored: "git",
    source: "Gen Labs — ghép từ still neutral", license: "Gen-Labs-proprietary", commercial_ok: true, redistribution: "in-product-only",
    quality: "A", quality_note: "Đã xem; Veo giữ đúng nét khi dùng làm first=last frame.", added: DAY, cost_usd: 0,
    how_made: "python3 characters/src/crop.py (nhân vật cao 600 px, đáy cách 48 px, nền #00B140)",
    reuse: "Làm first_frame = last_frame khi gọi model video (loop-test/src/veo.mjs) để clip khâu nối được.",
  });
}

for (const f of readdirSync(join(AL, "characters", "vy", "clips")).filter((x) => x.endsWith(".mp4"))) {
  const p = join(AL, "characters", "vy", "clips", f);
  const meta = JSON.parse(readFileSync(p.replace(/\.mp4$/, ".json"), "utf8"));
  const act = f.includes("wave") ? "wave" : "shocked";
  out.push({
    id: `char.vy.clip.${act}`, type: "character-clip", title: act === "wave" ? "Vy vẫy tay cười, về đúng tư thế đầu — nền chroma, lặp được" : "Vy giật mình (tay ôm má) rồi bình tĩnh lại — nền chroma, lặp được",
    tags: ["vy", act === "wave" ? "greeting" : "shock", act, "chroma-key", "seamless-loop", "ai-video", ...(act === "wave" ? [] : ["tier=reserve"])], energy: [act === "wave" ? "light" : "heavy"],
    phase: act === "wave" ? ["hook", "setup", "cta"] : ["hook", "climax"],
    path: rel(p), size_bytes: statSync(p).size, duration_s: 4, dimensions: "1280x720", format: "mp4", loop: true, stored: "git",
    source: "OpenRouter google/veo-3.1-lite (first_frame = last_frame = char.vy.still.neutral-chroma)", source_url: "https://openrouter.ai/google/veo-3.1-lite",
    license: "Veo-Output", commercial_ok: true, redistribution: "in-product-only",
    quality: act === "wave" ? "A" : "B",
    quality_note: act === "wave" ? "Đã xem từng khung: đúng nét, đúng màu, khung đầu ≈ khung cuối (sai khác TB 1,2/255)." : "Đã xem: biểu cảm tốt nhưng giữa clip mắt đổi sang kiểu chấm (lệch model sheet) — dùng được cho cú sốc ngắn.",
    added: DAY, cost_usd: meta.cost_usd, how_made: `node loop-test/src/veo.mjs characters/vy/stills/vy-neutral-chroma-1280x720.png <out> "<prompt>" — prompt: ${meta.prompt}`,
    reuse: "Tách nền: ffmpeg chromakey=0x01B141:similarity=0.13:blend=0.05 (KHÔNG despill — làm nơ vàng ngả cam); bỏ khung cuối khi nối; xem loop-test/src/loop.sh.",
    note: "24 fps, 96 khung, không tiếng.",
  });
}
{
  const p = join(AL, "characters", "vy", "clips", "vy-wave-alpha.webm");
  if (existsSync(p)) out.push({
    id: "char.vy.clip.wave-alpha", type: "character-clip", title: "Vy vẫy tay — đã tách nền, WebM VP9 có kênh alpha (dùng thẳng trong Remotion)",
    tags: ["vy", "greeting", "wave", "transparent", "alpha", "seamless-loop", "ai-video"], energy: ["light"], phase: ["hook", "setup", "cta"],
    path: rel(p), size_bytes: statSync(p).size, duration_s: 95 / 24, dimensions: "1280x720", format: "webm", loop: true, stored: "git",
    source: "Gen Labs — ffmpeg chromakey từ char.vy.clip.wave (Veo 3.1 Lite)", source_url: "https://openrouter.ai/google/veo-3.1-lite",
    license: "Veo-Output", commercial_ok: true, redistribution: "in-product-only", quality: "A",
    quality_note: "Đã xem trong showcase: viền sạch, nơ giữ đúng màu vàng; tay vẫy có nhoè nhẹ (từ model).", added: DAY, cost_usd: 0,
    how_made: "ffmpeg -i vy-wave.mp4 -vf trim=end_frame=95,format=yuva420p,chromakey=0x01B141:similarity=0.13:blend=0.05 -c:v libvpx-vp9 -pix_fmt yuva420p -auto-alt-ref 0 vy-wave-alpha.webm",
    reuse: "<Loop durationInFrames={Math.round(95/24*fps)}><OffthreadVideo src={staticFile('clips/vy-wave-alpha.webm')} transparent muted/></Loop>",
  });
}
writeFileSync(join(AL, "catalog.d", "characters.json"), JSON.stringify(out, null, 1) + "\n");
console.log(`catalog.d/characters.json: ${out.length} entries`);
