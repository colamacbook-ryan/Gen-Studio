// © 2026 Gen Labs — All rights reserved.
// Search catalog.json.  node tools/find.mjs [type] [words…] [field=value…] [--json] [--paths]
//   type      : first word if it is a catalog type or prefix (sfx, music, char, character-still, icon, lottie…)
//   words     : all must appear in id / title / tags / note (case-insensitive, accents ignored)
//   tier=core|reserve|all : default core (quality A only) — "gom cái xịn": reserve (B) only when asked
//   field=val : exact match; arrays match if they contain val (energy=heavy, tags=quiz, license=CC0-1.0, quality=A)
// e.g.  node tools/find.mjs sfx whoosh energy=heavy
//       node tools/find.mjs character-still vy shock
//       node tools/find.mjs music phase=climax --paths
import { loadCatalog, tierOf } from "./catalog-lib.mjs";

const fold = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();
const argv = process.argv.slice(2);
const flags = new Set(argv.filter((a) => a.startsWith("--")));
const rest = argv.filter((a) => !a.startsWith("--"));
const cat = loadCatalog();
const types = [...new Set(cat.entries.map((e) => e.type))];
let type = null;
if (rest.length && !rest[0].includes("=")) {
  const w = fold(rest[0]);
  const hit = types.filter((t) => t === w || t.startsWith(w));
  if (hit.length) { type = hit; rest.shift(); }
}
let kv = rest.filter((a) => a.includes("=")).map((a) => a.split("=", 2));
const tier = (kv.find(([k]) => k === "tier") || [, "core"])[1];
kv = kv.filter(([k]) => k !== "tier");
const words = rest.filter((a) => !a.includes("=")).map(fold);
const res = cat.entries.filter((e) => {
  if (type && !type.includes(e.type)) return false;
  if (tier !== "all" && tierOf(e) !== tier) return false;
  for (const [k, v] of kv) {
    const x = e[k];
    if (Array.isArray(x) ? !x.map(String).includes(v) : String(x) !== v) return false;
  }
  const hay = fold([e.id, e.title, ...(e.tags || []), e.note, e.source].join(" "));
  return words.every((w) => hay.includes(w));
});
if (flags.has("--json")) { console.log(JSON.stringify(res, null, 1)); process.exit(0); }
if (flags.has("--paths")) { res.forEach((e) => console.log(e.path ?? e.url)); process.exit(0); }
for (const e of res) {
  const d = e.duration_s ? ` ${e.duration_s.toFixed(1)}s` : e.dimensions ? ` ${e.dimensions}` : e.files ? ` ${e.files} files` : "";
  console.log(`${e.quality} ${e.type.padEnd(16)} ${e.id.padEnd(38)} ${(e.energy || []).join("/").padEnd(13)} ${e.license.padEnd(16)}${d}\n    ${e.title}  →  ${e.path ?? e.url}${e.placeholder ? "  [PLACEHOLDER]" : ""}`);
}
const hidden = tier === "core" ? cat.entries.filter((e) => tierOf(e) === "reserve").length : 0;
console.log(`\n${res.length} / ${cat.entries.length} assets (tier=${tier}${hidden ? `; ${hidden} reserve hidden — add tier=reserve or tier=all` : ""})`);
