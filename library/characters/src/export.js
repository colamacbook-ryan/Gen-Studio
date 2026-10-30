#!/usr/bin/env node
// © 2026 Gen Labs — All rights reserved.
// Xuất Nhi + Vy: 16 mood PNG nền trong suốt (dựng 1920×1920, crop.py cắt sát ≥1024 px cao) — khung chroma do crop.py ghép.
// Dùng engine Gen-Chibi vendor trong gen-studio qua stagekit của pack Vy (đăng ký pack theo đúng đường renderStill 'cast').
// Chạy: node export.js   (cần /home/user/gen-studio; GS_ROOT để đổi)
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const DESIGN = path.join(__dirname, '..', '..', '..', 'design');
const kit = require(path.join(DESIGN, 'vy-chibi', 'src', 'stagekit.js'));
const OUT = path.join(__dirname, '..');
const moods = JSON.parse(fs.readFileSync(path.join(DESIGN, 'vy-chibi', 'src', 'moods.json'), 'utf8'));
const GS = kit.GS;
const MT = JSON.parse(fs.readFileSync(path.join(GS, 'render/engine/moods.json'), 'utf8')).moods;
const moodFace = {};
Object.keys(MT).forEach((m) => { const f = {}; if (MT[m].eyes) f.eyes = MT[m].eyes; if (MT[m].brows) f.brows = MT[m].brows; if (Object.keys(f).length) moodFace[m] = f; });

const FULL = '-100 -100 400 400';        // khung rộng để không cắt đuôi tóc / hiệu ứng; crop.py cắt sát sau
const LAY = 640, SCALE = 3;               // dựng 640 px CSS × deviceScale 3 = 1920 px (viewport sân khấu chỉ 1920×1080)
const CHARS = [
  { id: 'nhi', pack: path.join(DESIGN, 'gen-chibi', 'gen-chibi-pack.json'), asset: 'gen-host' },
  { id: 'vy', pack: path.join(DESIGN, 'vy-chibi', 'vy-chibi-pack.json'), asset: 'vy-host' },
];

async function render(k, svgExpr, w, h, bg) {
  await k.stage.page.send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: bg ? 1 : 0 } });
  await k.ev(`(function(){ document.documentElement.style.background='${bg || 'transparent'}'; document.body.style.background='${bg || 'transparent'}';
    var root=document.getElementById('stage'); root.innerHTML=''; root.style.background='${bg || 'transparent'}';
    var s=${svgExpr}; var d=document.createElement('div'); d.style.cssText='position:absolute;left:0;top:0;width:${w}px;height:${h}px'; d.innerHTML=s; root.appendChild(d);
    return true; })()`);
  return k.shot(null, { x: 0, y: 0, width: w, height: h, scale: SCALE });
}

const svgFor = (state, director, t, vb, w, h, extraStyle) =>
  `GCK.svg(${JSON.stringify(state)}, ${JSON.stringify(director)}, ${t}).replace(/viewBox="[^"]*"/,'viewBox="${vb}"').replace('<svg ','<svg preserveAspectRatio="xMidYMid meet" style="width:${w}px;height:${h}px;display:block;${extraStyle || ''}" ')`;

(async () => {
  const report = { generated: new Date().toISOString(), engine: fs.readFileSync(path.join(GS, 'vendor/gen-chibi/VERSION'), 'utf8').trim(), files: [] };
  for (const c of CHARS) {
    const dir = path.join(OUT, c.id, 'stills');
    fs.mkdirSync(dir, { recursive: true });
    const k = await kit.open(c.pack, { asset: c.asset, width: 1920, height: 1280 });
    for (const m of moods) {
      const [mood, label, state, motion, t] = m;
      const director = Object.assign({ motion }, moodFace[mood] || {});
      const buf = await render(k, svgFor(state, director, t, FULL, LAY, LAY), LAY, LAY, null);
      const f = path.join(dir, `${c.id}-${mood}.png`);
      fs.writeFileSync(f, buf);
      report.files.push({ file: path.relative(OUT, f), mood, label, state, motion, t });
    }
    console.log(c.id, k.errors.length ? 'LỖI console: ' + k.errors.join(' | ') : '0 lỗi console');
    report[c.id + '_errors'] = k.errors;
    await k.close();
  }
  fs.writeFileSync(path.join(OUT, 'export-report.json'), JSON.stringify(report, null, 1));
})().catch((e) => { console.error(e); process.exit(1); });
