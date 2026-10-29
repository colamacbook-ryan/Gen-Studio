#!/usr/bin/env node
// © 2026 Gen Labs — All rights reserved.
// Dựng bảng nhân vật 1920×1080 bằng ĐÚNG đường renderStill(mode:'cast') của pipeline (SPEC §3.4.7, §3.9, CNS-088/120) — không harness riêng.
// Dùng: node tools/cast-sheet.js [--pack <ryan-kol.json> | --samples] [--out <thư mục hoặc .png>] [--ink #hex] [--brand-bg #hex] [--title "…"] [--chromium <đường dẫn>]
//   --pack     pack KOL gen-chibi.pack/1 (kiểm bằng render/cast/kol-pack.js; sai ⇒ in lỗi, thoát 1)
//   --samples  hai host mẫu trung tính của repo (mặc định khi không có --pack)
// Ghi cast-sheet.png (+ cast-sheet.html mở lại được trong trình duyệt, cast-sheet.json số đo) và in XOR 64/32 px.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const cast = require('../render/cast');
const kol = require('../render/cast/kol-pack');
const { xorRatio } = require('../render/cast/measure');
const { renderStill, closeStill } = require('../render/still');

function args(argv) {
  const a = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--samples') a.samples = true;
    else if (k.startsWith('--')) a[k.slice(2)] = argv[++i];
    else a._.push(k);
  }
  return a;
}
// payload dựng sẵn cho GSStill.cast: cast + packs + parts (đúng thứ library() cấp cho pipeline) + brand/ink tuỳ chọn
function buildPayload(opt) {
  const lib = cast.library();
  let recipes, packs = lib.packs.filter(p => !(opt.pack && kol.current() && p.json === kol.current().json));
  if (opt.pack) {
    const k = kol.load(opt.pack);
    recipes = k.recipes; packs = packs.concat([{ json: k.json, outline: k.outline }]);
  } else recipes = cast.samples();
  const castMap = {}; recipes.forEach((r, i) => { castMap['CM-000' + (i + 1)] = r; });
  const p = { cast: castMap, packs, parts: lib.parts, title: opt.title || (opt.pack ? 'Bảng nhân vật · KOL' : 'Bảng nhân vật · host mẫu') };
  if (opt.ink) p.ink = opt.ink;
  if (opt['brand-bg']) p.brand = { tokens: { bg: opt['brand-bg'], ink: opt.ink || '#14121A', hl: opt['brand-hl'] || '#FFC800' } };
  return p;
}
// cast-sheet.html: trang sân khấu + payload; script/CSS trỏ tuyệt đối tới render/stage (mở bằng file://), bỏ CSP của sân khấu
function writeHtml(file, payload) {
  const stageDir = path.join(__dirname, '..', 'render', 'stage');
  let html = fs.readFileSync(path.join(stageDir, 'stage.html'), 'utf8');
  html = html.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>\n?/, '')
    .replace(/(src|href)="((?:\.\.\/|[a-z-]+\.(?:js|css))[^"]*)"/g, (m, a, p) => a + '="file://' + path.resolve(stageDir, p) + '"');
  const dataFile = file.replace(/\.html$/, '.payload.js');
  fs.writeFileSync(dataFile, 'window.__castPayload = ' + JSON.stringify(payload) + ';\n');
  html = html.replace('</body>', '<script src="file://' + path.resolve(dataFile) + '"></script>\n<script>window.addEventListener("load", function () { window.__still("cast", window.__castPayload); });</script>\n</body>');
  fs.writeFileSync(file, html);
}
async function main() {
  const a = args(process.argv.slice(2));
  const out = a.out || process.cwd();
  const png = out.endsWith('.png') ? out : path.join(out, 'cast-sheet.png');
  const payload = buildPayload(a);
  const r = await renderStill({ mode: 'cast', payload, size: [1920, 1080], format: 'png', outFile: png, chromiumPath: a.chromium });
  const ids = Object.keys(r.measures.masks['64'].chars), x = {};
  [64, 32].forEach(s => { if (ids.length >= 2) x[s] = xorRatio(r.measures.masks, s, ids[0], ids[1]); });
  writeHtml(png.replace(/\.png$/, '.html'), payload);
  fs.writeFileSync(png.replace(/\.png$/, '.json'), JSON.stringify({ measures: Object.assign({}, r.measures, { masks: undefined }), xor: x, errors: r.errors, elapsed_ms: r.elapsed_ms }, null, 1));
  console.log('đã ghi ' + png + (r.errors.length ? ' — LỖI console: ' + r.errors.join(' | ') : ' — 0 lỗi console') + ' · XOR 64px ' + (x[64] * 100).toFixed(1) + '% · 32px ' + (x[32] * 100).toFixed(1) + '% · ' + r.elapsed_ms + ' ms');
  await closeStill();
  if (r.errors.length) process.exitCode = 1;
}
if (require.main === module) main().catch(e => { console.error(e.code ? e.code + ': ' + e.message : e); process.exit(1); });
module.exports = { buildPayload, writeHtml };
