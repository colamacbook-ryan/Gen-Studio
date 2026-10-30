// © 2026 Gen Labs — All rights reserved.
// Merge asset-lib/catalog.d/*.json → catalog.json (sorted by type, id) after validating every entry.
// Usage: node tools/build-catalog.mjs [--no-files] [--allow-errors]
//   exit 1 when any entry is invalid (unless --allow-errors: invalid entries are skipped and listed).
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, loadParts, strip, validate } from "./catalog-lib.mjs";

const args = new Set(process.argv.slice(2));
const { entries, errors } = loadParts();
const ok = [];
for (const e of entries) {
  const errs = validate(strip(e), { checkFiles: !args.has("--no-files") });
  if (errs.length) errors.push(`${e.__part}#${e.__i} ${e.id ?? "?"}: ${errs.join("; ")}`);
  else ok.push(strip(e));
}
ok.sort((a, b) => a.type.localeCompare(b.type) || a.id.localeCompare(b.id));
const byType = {};
for (const e of ok) byType[e.type] = (byType[e.type] || 0) + 1;
const gitBytes = ok.filter((e) => e.stored === "git").reduce((a, e) => a + (e.size_bytes || 0), 0);
const out = {
  schema: "catalog.schema.json",
  generated: new Date().toISOString(),
  counts: byType,
  total: ok.length,
  git_bytes_listed: gitBytes,
  cost_usd_total: +ok.reduce((a, e) => a + (e.cost_usd || 0), 0).toFixed(4),
  entries: ok,
};
if (errors.length) {
  console.error(`✗ ${errors.length} problem(s):\n  ` + errors.join("\n  "));
  if (!args.has("--allow-errors")) process.exit(1);
}
writeFileSync(join(ROOT, "catalog.json"), JSON.stringify(out, null, 1) + "\n");
console.log(`catalog.json: ${ok.length} entries`, byType, `· git ${(gitBytes / 1048576).toFixed(1)} MB listed · cost $${out.cost_usd_total}`);
