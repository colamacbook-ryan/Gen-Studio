// © 2026 Gen Labs — All rights reserved.
// Sinh 1 clip Veo 3.1 Lite qua OpenRouter: first_frame = last_frame = cùng một ảnh tư thế trung tính (nền chroma).
// Khoá đọc từ ~/.config/gen/openrouter.key (không in, không ghi ra file). Ghi chi phí (credits trước/sau) vào <out>.json.
// Dùng: node veo.mjs <ảnh.png> <out.mp4> "<prompt>"
import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";

const [img, out, prompt] = process.argv.slice(2);
const KEY = readFileSync(`${homedir()}/.config/gen/openrouter.key`, "utf8").trim();
const H = { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const MODEL = "google/veo-3.1-lite";
const credits = async () => (await (await fetch("https://openrouter.ai/api/v1/credits", { headers: H })).json()).data;
const dataUri = `data:image/png;base64,${readFileSync(img).toString("base64")}`;

const c0 = await credits();
const body = {
  model: MODEL,
  prompt,
  frame_images: [
    { type: "image_url", image_url: { url: dataUri }, frame_type: "first_frame" },
    { type: "image_url", image_url: { url: dataUri }, frame_type: "last_frame" },
  ],
  duration: 4,
  resolution: "720p",
  aspect_ratio: "16:9",
  generate_audio: false,
};
const t0 = Date.now();
const r = await fetch("https://openrouter.ai/api/v1/videos", { method: "POST", headers: H, body: JSON.stringify(body) });
const job = await r.json();
if (!r.ok) { console.error("submit failed", r.status, JSON.stringify(job).slice(0, 600)); process.exit(1); }
const poll = job.polling_url;
console.log("submitted", job.id || "", job.status || "");
let st;
for (;;) {
  await new Promise((res) => setTimeout(res, 10000));
  st = await (await fetch(poll, { headers: H })).json();
  process.stdout.write(`${Math.round((Date.now() - t0) / 1000)}s ${st.status}\n`);
  if (["completed", "succeeded", "failed", "error", "cancelled"].includes(st.status)) break;
  if (Date.now() - t0 > 15 * 60 * 1000) { console.error("timeout"); process.exit(1); }
}
if (st.status === "failed" || st.status === "error") { console.error(JSON.stringify(st).slice(0, 800)); process.exit(1); }
const v = await fetch(`${poll}/content?index=0`, { headers: { Authorization: `Bearer ${KEY}` } });
writeFileSync(out, Buffer.from(await v.arrayBuffer()));
await new Promise((res) => setTimeout(res, 5000));
const c1 = await credits();
const meta = { model: MODEL, prompt, duration: 4, resolution: "720p", generate_audio: false, first_last_frame: img.split("/").pop(),
  seconds: Math.round((Date.now() - t0) / 1000), usage_before: c0.total_usage, usage_after: c1.total_usage,
  cost_usd: +(c1.total_usage - c0.total_usage).toFixed(4), job_usage: st.usage || null, date: new Date().toISOString() };
writeFileSync(out.replace(/\.mp4$/, ".json"), JSON.stringify(meta, null, 1));
console.log("done", out, "cost", meta.cost_usd);
