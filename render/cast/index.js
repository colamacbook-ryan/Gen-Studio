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
module.exports = { defaults };
