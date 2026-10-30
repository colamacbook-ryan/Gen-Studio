// © 2026 Gen Labs — All rights reserved.
// Validate and add ONE entry to catalog.d/<area>.json, then rebuild catalog.json.
//   node tools/add.mjs <area> <entry.json | '{"id":…}'> [--dry-run] [--replace]
// Checks: schema fields + enums, license whitelist (commercial OK only), attribution for CC-BY, source_url for
// third-party, file exists, ≤5 MB when stored=git, unique id. Fills size_bytes / added when missing.
import { existsSync, readFileSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { execFileSync } from "node:child_process";
import { ROOT, loadParts, validate } from "./catalog-lib.mjs";

const [area, src, ...fl] = process.argv.slice(2);
if (!area || !src) { console.error("usage: node tools/add.mjs <area> <entry.json | JSON string> [--dry-run] [--replace]"); process.exit(2); }
const entry = JSON.parse(src.trim().startsWith("{") ? src : readFileSync(src, "utf8"));
if (entry.path && entry.size_bytes === undefined) {
  const p = isAbsolute(entry.path) ? entry.path : join(ROOT, entry.path);
  if (existsSync(p) && statSync(p).isFile()) entry.size_bytes = statSync(p).size;
}
entry.added ??= new Date().toISOString().slice(0, 10);
const errs = validate(entry);
const { entries } = loadParts();
const clash = entries.find((e) => e.id === entry.id);
if (clash && !(fl.includes("--replace") && clash.__part === `${area}.json`)) errs.push(`id "${entry.id}" already exists in ${clash.__part}${clash.__part === `${area}.json` ? " (use --replace)" : ""}`);
if (errs.length) { console.error("✗ rejected:\n  " + errs.join("\n  ")); process.exit(1); }
if (fl.includes("--dry-run")) { console.log("✓ valid (dry run)"); process.exit(0); }
mkdirSync(join(ROOT, "catalog.d"), { recursive: true });
const file = join(ROOT, "catalog.d", `${area}.json`);
const arr = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : [];
const i = arr.findIndex((e) => e.id === entry.id);
if (i >= 0) arr[i] = entry; else arr.push(entry);
writeFileSync(file, JSON.stringify(arr, null, 1) + "\n");
console.log(`✓ ${i >= 0 ? "replaced" : "added"} ${entry.id} → catalog.d/${area}.json`);
execFileSync(process.execPath, [join(ROOT, "tools", "build-catalog.mjs"), "--allow-errors"], { stdio: "inherit" });
