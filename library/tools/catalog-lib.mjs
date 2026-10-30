// © 2026 Gen Labs — All rights reserved.
// Shared catalog helpers: load schema, validate one entry (no npm deps — a small JSON-Schema subset that
// covers exactly what catalog.schema.json uses), extra policy checks (license whitelist, attribution, file
// exists, ≤5 MB in git), and load/merge catalog.d/*.json.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const SCHEMA = JSON.parse(readFileSync(join(ROOT, "catalog.schema.json"), "utf8"));
export const GIT_MAX_BYTES = 5 * 1024 * 1024;
const NEEDS_ATTRIBUTION = /^CC-BY/;

function checkValue(name, v, s, errs) {
  if (s.const !== undefined && v !== s.const) errs.push(`${name}: must be ${JSON.stringify(s.const)}`);
  if (s.enum && !s.enum.includes(v)) errs.push(`${name}: "${v}" not in [${s.enum.join(", ")}]`);
  const t = s.type;
  if (t === "string" && typeof v !== "string") return errs.push(`${name}: must be a string`);
  if ((t === "number" || t === "integer") && typeof v !== "number") return errs.push(`${name}: must be a number`);
  if (t === "integer" && !Number.isInteger(v)) errs.push(`${name}: must be an integer`);
  if (t === "boolean" && typeof v !== "boolean") errs.push(`${name}: must be boolean`);
  if (t === "array") {
    if (!Array.isArray(v)) return errs.push(`${name}: must be an array`);
    if (s.minItems && v.length < s.minItems) errs.push(`${name}: needs ≥${s.minItems} item(s)`);
    if (s.items) v.forEach((x, i) => checkValue(`${name}[${i}]`, x, s.items, errs));
  }
  if (typeof v === "string") {
    if (s.minLength && v.length < s.minLength) errs.push(`${name}: too short`);
    if (s.pattern && !new RegExp(s.pattern).test(v)) errs.push(`${name}: "${v}" does not match ${s.pattern}`);
  }
  if (typeof v === "number" && s.minimum !== undefined && v < s.minimum) errs.push(`${name}: < ${s.minimum}`);
}

/** validate one entry → array of error strings (empty = ok). opts.checkFiles default true */
export function validate(e, opts = {}) {
  const errs = [];
  if (typeof e !== "object" || !e) return ["entry is not an object"];
  for (const k of SCHEMA.required) if (e[k] === undefined) errs.push(`missing required field "${k}"`);
  for (const k of Object.keys(e)) {
    const s = SCHEMA.properties[k];
    if (!s) { errs.push(`unknown field "${k}"`); continue; }
    checkValue(k, e[k], s, errs);
  }
  if (!e.path && !e.url) errs.push("needs path or url");
  // policy
  if (e.license && NEEDS_ATTRIBUTION.test(e.license) && !e.attribution) errs.push(`license ${e.license} requires "attribution" text`);
  if (e.license && e.license !== "Gen-Labs-proprietary" && e.license !== "Veo-Output" && e.license !== "Meta-Muse-Output" && e.license !== "Google-Gemini-Output" && !e.source_url) errs.push("third-party asset needs source_url");
  if (e.quality === "C") errs.push("quality C is rejected — do not catalog it (gom cái xịn, đừng gom rác)");
  const reserve = Array.isArray(e.tags) && e.tags.includes("tier=reserve");
  if (e.quality === "B" && !reserve) errs.push('quality B must carry tag "tier=reserve"');
  if (e.quality === "A" && reserve) errs.push('quality A is core — remove tag "tier=reserve" (or grade it B)');
  if (opts.checkFiles !== false && e.path) {
    const p = isAbsolute(e.path) ? e.path : join(ROOT, e.path);
    if (e.stored === "git") {
      if (isAbsolute(e.path)) errs.push("stored=git needs a path relative to asset-lib/");
      if (!existsSync(p)) errs.push(`file not found: ${e.path}`);
      else if (statSync(p).isFile() && statSync(p).size > GIT_MAX_BYTES) errs.push(`${e.path} is ${(statSync(p).size / 1048576).toFixed(1)} MB > 5 MB — store it as local-scratch`);
    } else if (e.stored === "local-scratch") {
      if (!isAbsolute(e.path)) errs.push("stored=local-scratch needs an absolute path");
      if (!e.note) errs.push("stored=local-scratch needs a note (why it is not in git / where it should move)");
    }
  }
  return errs;
}

/** load catalog.d/*.json → { entries, errors } with duplicate-id detection */
export function loadParts() {
  const dir = join(ROOT, "catalog.d");
  const entries = [], errors = [];
  if (!existsSync(dir)) return { entries, errors };
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".json")).sort()) {
    let arr;
    try { arr = JSON.parse(readFileSync(join(dir, f), "utf8")); } catch (e) { errors.push(`${f}: invalid JSON (${e.message})`); continue; }
    if (!Array.isArray(arr)) { errors.push(`${f}: must be an array of entries`); continue; }
    arr.forEach((e, i) => entries.push({ ...e, __part: f, __i: i }));
  }
  const seen = new Map();
  for (const e of entries) {
    if (seen.has(e.id)) errors.push(`duplicate id "${e.id}" in ${e.__part} and ${seen.get(e.id)}`);
    else seen.set(e.id, e.__part);
  }
  return { entries, errors };
}

/** core = A, reserve = B */
export const tierOf = (e) => (e.quality === "A" ? "core" : "reserve");

export const strip = (e) => { const { __part, __i, ...rest } = e; return rest; };

export function loadCatalog() {
  const p = join(ROOT, "catalog.json");
  if (!existsSync(p)) throw new Error("catalog.json missing — run: node tools/build-catalog.mjs");
  return JSON.parse(readFileSync(p, "utf8"));
}
