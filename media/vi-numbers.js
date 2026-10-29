// © 2026 Gen Labs — All rights reserved.
// Đọc số thành chữ tiếng Việt để so lời chép với kịch bản (G-SCRIPT, giám khảo offline). Thuần, không DOM.
'use strict';
// Whisper chép số bằng chữ số ("92%", "1.000") trong khi kịch bản viết bằng chữ ("chín mươi hai phần trăm") ⇒ G-SCRIPT trượt oan
// (lỗi thật khi cài W3: 2/2 bài agent giả bị chặn). Đọc số thành chữ tiếng Việt ở CẢ HAI phía trước khi so; biến thể (mốt/một, tư/bốn, linh/lẻ, nghìn/ngàn)
// chỉ lệch vài ký tự, nằm trong ngưỡng khoảng cách.
const DIG = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];
function read3(n, full) {
  const h = Math.floor(n / 100), t = Math.floor(n / 10) % 10, u = n % 10, w = [];
  if (full || h) w.push(DIG[h], 'trăm');
  if (t === 0) { if (u) { if (full || h) w.push('linh'); w.push(DIG[u]); } }
  else if (t === 1) { w.push('mười'); if (u) w.push(u === 5 ? 'lăm' : DIG[u]); }
  else { w.push(DIG[t], 'mươi'); if (u) w.push(u === 1 ? 'mốt' : u === 4 ? 'tư' : u === 5 ? 'lăm' : DIG[u]); }
  return w.join(' ');
}
function viInt(digits) {
  const s = String(digits).replace(/^0+(?=\d)/, '');
  if (s.length > 15) return s.split('').map((c) => DIG[+c]).join(' ');   // quá dài: đọc từng chữ số
  let n = Number(s); if (!n) return DIG[0];
  const units = ['', 'nghìn', 'triệu', 'tỷ', 'nghìn tỷ'], parts = [];
  for (let g = 0; n > 0; g++, n = Math.floor(n / 1000)) {
    const v = n % 1000;
    if (v) parts.unshift(read3(v, n >= 1000) + (units[g] ? ' ' + units[g] : ''));
  }
  return parts.join(' ');
}
function viNumbers(text) {
  return String(text || '')
    .replace(/(\d{1,3}(?:[.,]\d{3})+|\d+(?:[.,]\d+)?)(\s*%)?/g, (m, num, pct) => {
      let w;
      if (/^\d{1,3}(?:[.,]\d{3})+$/.test(num) && !/^\d+[.,]\d{1,2}$/.test(num)) w = viInt(num.replace(/[.,]/g, ''));   // 1.000 / 1,000 = nghìn
      else if (/[.,]/.test(num)) { const [a, b] = num.split(/[.,]/); w = viInt(a) + ' phẩy ' + viInt(b); }
      else w = viInt(num);
      return ' ' + w + (pct ? ' phần trăm' : '') + ' ';
    }).replace(/\s+/g, ' ').trim();
}

module.exports = { viNumbers, viInt };
