// © 2026 Gen Labs — All rights reserved.
// Cast mặc định của Gen-Studio: Anh Gen (thầy) + Bé Hỏi (học trò) dạng công thức Gen-Chibi + hai part (tóc, kính) — dữ liệu, không code riêng.
// Công thức tham chiếu part dạng `local.my/<id>`; trang sân khấu đăng ký part vào pack `local.my` trước khi nạp công thức.
'use strict';
const path = require('node:path');
const fs = require('node:fs');
const read = f => JSON.parse(fs.readFileSync(path.join(__dirname, f), 'utf8'));
// defaults() → { cast: { 'CM-0001': công thức Anh Gen, 'CM-0002': công thức Bé Hỏi }, parts: [part…] }
function defaults() {
  const cast = {}; read('default-cast.json').forEach((r, i) => { cast['CM-000' + (i + 1)] = r; });
  return { cast, parts: read('parts.json') };
}
// library() → { parts:[part dùng chung], hash } — linh kiện Gen-Chibi dùng chung của xưởng (pipeline gọi, SPEC-0.2.0 §13.2 "cast.library()"; manifest.parts_hash = hash khi có).
// samples() → [công thức host mẫu trung tính] (sample-hosts.json). STUB P0b: gói K thay bằng bản thật (render/cast/parts/*.json, sample-hosts.json); stub = bộ part mặc định, không hash, không host mẫu.
function library() { return { parts: defaults().parts, hash: null }; }
function samples() { return []; }
module.exports = { defaults, library, samples };
