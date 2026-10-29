// © 2026 Gen Labs — All rights reserved.
// Cast của Gen-Studio. Dữ liệu thuần, không code riêng cho nhân vật:
//   • default-cast.json — Anh Gen (thầy) + Bé Hỏi (học trò), giữ nguyên (STD-01); parts.json — tóc/kính của hai nhân vật đó.
//   • parts/*.json — linh kiện dùng chung (tóc, áo) của host mẫu trung tính; props.json — gói dữ liệu đạo cụ + hoạt động (laptop + "gõ phím", SPEC §3.4.6).
//   • sample-hosts.json — hai host mẫu trung tính "Host A/B" (SPEC §3.7): ship trong bản phát hành, luôn vào ở `candidate`, không bao giờ `approved`.
//   • Linh kiện chữ ký của KOL Ryan KHÔNG ở đây (CNS-124): chỉ nằm trong pack của Ryan, nạp bằng GS_KOL_PACK (xem kol-pack.js).
// Công thức tham chiếu part dạng `local.my/<id>`; trang sân khấu đăng ký part vào pack `local.my` trước khi nạp công thức.
'use strict';
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const read = f => JSON.parse(fs.readFileSync(path.join(__dirname, f), 'utf8'));
const kolPack = require('./kol-pack');

// defaults() → { cast: { 'CM-0001': công thức Anh Gen, 'CM-0002': công thức Bé Hỏi }, parts: [part…] }
function defaults() {
  const cast = {}; read('default-cast.json').forEach((r, i) => { cast['CM-000' + (i + 1)] = r; });
  return { cast, parts: read('parts.json') };
}
// parts/*.json: mỗi tệp là một part hoặc mảng part; đọc theo thứ tự tên tệp (tất định → hash ổn định)
function sharedParts() {
  const dir = path.join(__dirname, 'parts');
  if (!fs.existsSync(dir)) return [];
  const out = [];
  fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort().forEach(f => { const j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); (Array.isArray(j) ? j : [j]).forEach(p => out.push(p)); });
  return out;
}
// library() → { parts:[part dùng chung → pack local.my], packs:[{ json, outline }], hash }
//   parts = parts.json ∪ parts/*.json; packs = gói dữ liệu gen-chibi.pack/1: props.json (luôn có) + pack KOL của chủ xưởng khi có GS_KOL_PACK
//   (outline = tuỳ chọn viền nướng vào path cho nhân vật của gói đó, null = không viền). hash = sha256 nội dung (manifest.parts_hash).
function library() {
  const parts = defaults().parts.concat(sharedParts());
  const packs = [{ json: read('props.json'), outline: null }];
  const kol = kolPack.current();
  if (kol) packs.push({ json: kol.json, outline: kol.outline });
  const hash = crypto.createHash('sha256').update(JSON.stringify([parts, packs])).digest('hex').slice(0, 16);
  return { parts, packs, hash };
}
// samples() → [công thức host mẫu trung tính] (data cast_versions). sampleEntries() → [{ name, role_label, status:'candidate', data }] để seed vào cast_members.
function samples() { return read('sample-hosts.json'); }
function sampleEntries() { return samples().map(d => ({ name: d.name, role_label: d.role, status: 'candidate', data: d })); }
module.exports = { defaults, library, samples, sampleEntries, sharedParts };
