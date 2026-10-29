#!/usr/bin/env node
// © 2026 Gen Labs — All rights reserved.
// Sinh khối <script> của các khối hình trong render/stage/stage.html từ render/blocks/index.json (nguồn duy nhất, SPEC-0.2.0 §2.3).
// Dùng: `node tools/gen-stage.js` ghi lại stage.html · `--check` thoát mã 1 nếu stage.html lệch index.json. Node thuần, không dependency.
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const INDEX = path.join(ROOT, 'render', 'blocks', 'index.json');
const STAGE = path.join(ROOT, 'render', 'stage', 'stage.html');
// Trình duyệt không require() được index.json và CSP chặn script nội tuyến → sinh thêm file JS gắn window.GSBlockIndex (registry.js đọc)
const BROWSER_INDEX = path.join(ROOT, 'render', 'blocks', 'index.browser.js');
const BEGIN = '<!-- gen-stage:blocks:begin (tools/gen-stage.js sinh từ render/blocks/index.json — đừng sửa tay) -->';
const END = '<!-- gen-stage:blocks:end -->';

// Mọi khối trong index.json đều được nạp vào sân khấu (kể cả enabled:false); đúng thứ tự khai báo.
function blockTags(defs) {
  return ['<script src="../blocks/index.browser.js"></script>'].concat(defs.map((d) => `<script src="../blocks/${d.file}"></script>`)).join('\n');
}
function browserIndex(defs) {
  return '// © 2026 Gen Labs — All rights reserved.\n// SINH TỰ ĐỘNG bởi tools/gen-stage.js từ render/blocks/index.json — đừng sửa tay.\nwindow.GSBlockIndex = ' + JSON.stringify(defs) + ';\n';
}
function generate(html, defs) {
  const re = new RegExp(`${BEGIN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?${END}`);
  if (!re.test(html)) throw new Error('stage.html thiếu cặp dấu gen-stage:blocks:begin/end');
  return html.replace(re, () => `${BEGIN}\n${blockTags(defs)}\n${END}`);
}
function loadIndex() { return JSON.parse(fs.readFileSync(INDEX, 'utf8')); }

if (require.main === module) {
  const defs = loadIndex(), html = fs.readFileSync(STAGE, 'utf8'), next = generate(html, defs), bi = browserIndex(defs);
  const biNow = fs.existsSync(BROWSER_INDEX) ? fs.readFileSync(BROWSER_INDEX, 'utf8') : null;
  const dirty = next !== html || bi !== biNow;
  if (process.argv.includes('--check')) {
    if (dirty) { console.error('stage.html / index.browser.js lệch render/blocks/index.json — chạy `node tools/gen-stage.js`.'); process.exit(1); }
    console.log('stage.html khớp index.json'); process.exit(0);
  }
  if (next !== html) fs.writeFileSync(STAGE, next);
  if (bi !== biNow) fs.writeFileSync(BROWSER_INDEX, bi);
  console.log(dirty ? 'đã cập nhật stage.html + index.browser.js' : 'đã khớp index.json');
}
module.exports = { generate, blockTags, browserIndex, loadIndex, BROWSER_INDEX, BEGIN, END };
