// Pre-fetches the Google Fonts woff2 files (OFL) listed in @remotion/google-fonts
// metadata into public/fonts, so renders are offline + deterministic.
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const want = [
  ["BeVietnamPro", ["600", "800", "900"]],
  ["Lexend", ["400", "500", "600", "700"]],
];
const subsets = ["latin", "latin-ext", "vietnamese"];
mkdirSync("public/fonts", { recursive: true });
const manifest = [];
for (const [mod, weights] of want) {
  const info = require(`@remotion/google-fonts/${mod}`).getInfo();
  for (const w of weights) for (const s of subsets) {
    const url = info.fonts.normal[w][s];
    const file = `${mod}-${w}-${s}.woff2`;
    execFileSync("curl", ["-sSfL", "-o", `public/fonts/${file}`, url]);
    manifest.push({ family: info.fontFamily, weight: w, subset: s, file, unicodeRange: info.unicodeRanges[s] });
  }
}
writeFileSync("src/fonts.json", JSON.stringify(manifest, null, 1));
console.log("fetched", manifest.length, "files");
