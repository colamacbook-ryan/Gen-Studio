// © 2026 Gen Labs — All rights reserved.
// Đo hình học trên PNG đã giải mã (render/png.js, thuần Node, không npm): kích thước, màu nền 4 góc,
// lẫn màu nền vào nhân vật, chân/vai chạm mép — theo STANDARD-KIT-v1.md §3.4/§4.
'use strict';
const png = require('../../render/png.js');

const BG = [0, 177, 64]; // #00B140

function at(img, x, y) {
  const i = (y * img.w + x) * img.bpp;
  return [img.px[i], img.px[i + 1], img.px[i + 2], img.bpp === 4 ? img.px[i + 3] : 255];
}
function chDiff(px, target) { return Math.max(Math.abs(px[0] - target[0]), Math.abs(px[1] - target[1]), Math.abs(px[2] - target[2])); }
function isBg(px, target, tol) { return px[3] < 10 || chDiff(px, target) <= tol; }

function decodePng(buf) { return png.decode(buf); }

// CH-02 / tương tự PR/FX: trung bình + độ lệch chuẩn mỗi kênh trên 4 góc 64×64.
function cornerColor(img, { size = 64, target = BG, meanTol = 6, stdTol = 3 } = {}) {
  const s = Math.min(size, img.w, img.h);
  const corners = [[0, 0], [img.w - s, 0], [0, img.h - s], [img.w - s, img.h - s]];
  const perCorner = corners.map(([ox, oy]) => {
    const sum = [0, 0, 0], sq = [0, 0, 0]; let n = 0;
    for (let y = oy; y < oy + s; y++) for (let x = ox; x < ox + s; x++) {
      const px = at(img, x, y);
      for (let c = 0; c < 3; c++) { sum[c] += px[c]; sq[c] += px[c] * px[c]; }
      n++;
    }
    const mean = sum.map((v) => v / n);
    const std = mean.map((m, c) => Math.sqrt(Math.max(0, sq[c] / n - m * m)));
    const meanErr = Math.max(...mean.map((m, c) => Math.abs(m - target[c])));
    return { mean: mean.map((v) => Math.round(v * 10) / 10), std: std.map((v) => Math.round(v * 10) / 10), meanErr: Math.round(meanErr * 10) / 10 };
  });
  const maxMeanErr = Math.max(...perCorner.map((c) => c.meanErr));
  const maxStd = Math.max(...perCorner.map((c) => Math.max(...c.std)));
  return { corners: perCorner, maxMeanErr, maxStd, pass: maxMeanErr <= meanTol && maxStd <= stdTol };
}

// CH-01 / PR-01 / FX-01: kích thước đúng y hệt + không có dải mép đồng màu khác nền dày > padMax px.
function sizePad(img, { w, h, target = BG, tol = 24, padMax = 4, scanDepth = 32 } = {}) {
  const sizeOk = img.w === w && img.h === h;
  const run = (get, len) => {
    let depth = 0, refOk = true;
    while (depth < Math.min(scanDepth, len)) {
      const px = get(depth);
      if (isBg(px, target, tol)) break; // về lại nền thật ⇒ hết dải đệm
      if (depth === 0) refOk = true;
      else if (chDiff(get(depth), get(0)) > tol) { refOk = false; break; } // dải không đồng màu ⇒ không tính là đệm phẳng
      depth++;
    }
    return refOk ? depth : 0;
  };
  const top = run((d) => at(img, Math.floor(img.w / 2), d), img.h);
  const bottom = run((d) => at(img, Math.floor(img.w / 2), img.h - 1 - d), img.h);
  const left = run((d) => at(img, d, Math.floor(img.h / 2)), img.w);
  const right = run((d) => at(img, img.w - 1 - d, Math.floor(img.h / 2)), img.w);
  const pad = { top, bottom, left, right };
  const maxPad = Math.max(top, bottom, left, right);
  return { w: img.w, h: img.h, sizeOk, pad, maxPad, pass: sizeOk && maxPad <= padMax };
}

// CH-03 / PR-02 / FX-02: lẫn màu nền vào nhân vật — flood-fill nền từ 4 góc (4 liên thông), phần còn lại
// coi là "mặt nạ nhân vật"; đếm tỉ lệ điểm ảnh trong mặt nạ vẫn có màu gần nền (SUY LUẬN: không có mặt nạ
// thật từ nguồn — xấp xỉ bằng liên thông nền từ biên; lỗ nền kín bên trong nhân vật không bị tính).
function chromaBleed(img, { target = BG, bgTol = 40, bleedTol = 28, maxRatio = 0.005 } = {}) {
  const w = img.w, h = img.h, n = w * h;
  const visited = new Uint8Array(n);
  const stack = [];
  const push = (x, y) => { const i = y * w + x; if (!visited[i] && isBg(at(img, x, y), target, bgTol)) { visited[i] = 1; stack.push(i); } };
  push(0, 0); push(w - 1, 0); push(0, h - 1); push(w - 1, h - 1);
  while (stack.length) {
    const i = stack.pop(), x = i % w, y = (i / w) | 0;
    if (x > 0) push(x - 1, y);
    if (x < w - 1) push(x + 1, y);
    if (y > 0) push(x, y - 1);
    if (y < h - 1) push(x, y + 1);
  }
  let maskN = 0, bleed = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (visited[i]) continue; // nền liên thông biên
    maskN++;
    if (isBg(at(img, x, y), target, bleedTol)) bleed++;
  }
  const ratio = maskN ? bleed / maskN : 0;
  return { maskPx: maskN, bleedPx: bleed, ratio: Math.round(ratio * 100000) / 1000, pass: ratio <= maxRatio };
}

// CH-05 (expr): cột ngoài cùng trái/phải phải có điểm khác nền trong 30% dưới ảnh.
function shouldersTouchEdges(img, { target = BG, tol = 40, bottomFrac = 0.3 } = {}) {
  const yFrom = Math.floor(img.h * (1 - bottomFrac));
  const col = (x) => { for (let y = yFrom; y < img.h; y++) if (!isBg(at(img, x, y), target, tol)) return true; return false; };
  const left = col(0), right = col(img.w - 1);
  return { left, right, pass: left && right };
}

// CH-07 (pose): hàng thấp nhất khác nền phải nằm ở groundY ± tol.
function feetTouchGround(img, { target = BG, tol = 40, groundY, groundTol = 8 } = {}) {
  const gy = groundY != null ? groundY : img.h - 160; // SUY LUẬN: y_g = 2400 trên khung 2560 ⇒ cách đáy 160px
  let lowest = -1;
  for (let y = img.h - 1; y >= 0 && lowest < 0; y--) {
    for (let x = 0; x < img.w; x++) if (!isBg(at(img, x, y), target, tol)) { lowest = y; break; }
  }
  const pass = lowest >= 0 && Math.abs(lowest - gy) <= groundTol;
  return { lowestY: lowest, groundY: gy, pass };
}

// CH-04 (M*, tạm H — STANDARD-KIT-v1 §3.4): chưa có dò mốc mặt; so chồng mờ 50% với .expr.00 tham chiếu
// (nếu có) để ra một số đo tham khảo cho Ryan — KHÔNG tự kết luận pass/fail chắc chắn (đó là lý do mức H).
function overlayDiff(img, ref, { tol = 24 } = {}) {
  if (img.w !== ref.w || img.h !== ref.h) return { comparable: false, diffRatio: null };
  let diff = 0;
  const n = img.w * img.h;
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) {
    const a = at(img, x, y), b = at(ref, x, y);
    if (chDiff(a, b) > tol) diff++;
  }
  return { comparable: true, diffRatio: Math.round((diff / n) * 100000) / 1000 };
}

// SC-02: tiền cảnh RGBA, ≥ tỉ lệ cho trước điểm ảnh trong suốt.
function alphaRatio(img, { minAlpha = 10 } = {}) {
  if (img.bpp !== 4) return { hasAlpha: false, ratio: 0 };
  let transparent = 0;
  const n = img.w * img.h;
  for (let i = 0; i < n; i++) if (img.px[i * 4 + 3] < minAlpha) transparent++;
  return { hasAlpha: true, ratio: Math.round((transparent / n) * 1000) / 1000 };
}

module.exports = { BG, decodePng, cornerColor, sizePad, chromaBleed, shouldersTouchEdges, feetTouchGround, overlayDiff, alphaRatio };
