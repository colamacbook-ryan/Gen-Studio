// © 2026 Gen Labs — All rights reserved.
// Đo hình học trên PNG đã giải mã (render/png.js, thuần Node, không npm): kích thước, màu nền 4 góc,
// lẫn màu nền vào nhân vật, chân/vai chạm mép — theo STANDARD-KIT-v1.md §3.4/§4.
'use strict';
const { spawnSync } = require('node:child_process');
const png = require('../../render/png.js');

const BG = [0, 177, 64]; // #00B140

function at(img, x, y) {
  const i = (y * img.w + x) * img.bpp;
  return [img.px[i], img.px[i + 1], img.px[i + 2], img.bpp === 4 ? img.px[i + 3] : 255];
}
function chDiff(px, target) { return Math.max(Math.abs(px[0] - target[0]), Math.abs(px[1] - target[1]), Math.abs(px[2] - target[2])); }
function isBg(px, target, tol) { return px[3] < 10 || chDiff(px, target) <= tol; }

function decodePng(buf) { return png.decode(buf); }

// render/png.js chỉ đọc RGB/RGBA 8-bit không xen kẽ; PNG 16-bit/palette/interlaced ném lỗi. Chuẩn hoá qua
// ffmpeg (8-bit RGBA, không xen kẽ) trước khi thử lại — không thêm dependency npm (CLAUDE.md).
function normalizePng(buf, ffmpegPath) {
  const bin = ffmpegPath || 'ffmpeg';
  const r = spawnSync(bin, ['-v', 'error', '-i', 'pipe:0', '-frames:v', '1', '-f', 'image2pipe', '-c:v', 'png', '-pix_fmt', 'rgba', 'pipe:1'],
    { input: buf, maxBuffer: 1 << 30 });
  if (r.error || r.status !== 0 || !r.stdout || !r.stdout.length) return null;
  return r.stdout;
}

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
// Đệm (letterbox) = CẢ hàng (top/bottom) hoặc CẢ cột (left/right) một màu phẳng duy nhất, khác nền, dày hơn
// padMax — khác với nhân vật/vật chạm mép (chỉ lấp MỘT PHẦN hàng/cột ⇒ hàng/cột không đồng màu ⇒ không
// tính là đệm). Sửa theo review #3: quét 1 scanline giữa cạnh trước đây coi nhầm vai/chân chạm mép là đệm.
function sizePad(img, { w, h, target = BG, tol = 24, padMax = 4, scanDepth = 32 } = {}) {
  const sizeOk = img.w === w && img.h === h;
  // uniform(getPx, len) → màu chung nếu CẢ dòng/cột cùng một màu (trong tol), ngược lại null.
  const uniform = (getPx, len) => {
    const first = getPx(0);
    for (let i = 1; i < len; i++) if (chDiff(getPx(i), first) > tol) return null;
    return first;
  };
  const run = (getLine, lineLen, depthLen) => {
    let depth = 0;
    while (depth < Math.min(scanDepth, depthLen)) {
      const color = uniform((i) => getLine(depth, i), lineLen);
      if (!color) break; // không đồng màu toàn dòng/cột ⇒ vật chạm mép, không phải đệm
      if (isBg(color, target, tol)) break; // đã về nền thật
      depth++;
    }
    return depth;
  };
  const top = run((d, x) => at(img, x, d), img.w, img.h);
  const bottom = run((d, x) => at(img, x, img.h - 1 - d), img.w, img.h);
  const left = run((d, y) => at(img, d, y), img.h, img.w);
  const right = run((d, y) => at(img, img.w - 1 - d, y), img.h, img.w);
  const pad = { top, bottom, left, right };
  const maxPad = Math.max(top, bottom, left, right);
  return { w: img.w, h: img.h, sizeOk, pad, maxPad, pass: sizeOk && maxPad <= padMax };
}

// CH-03 / PR-02 / FX-02: lẫn màu nền vào nhân vật — flood-fill nền từ 4 góc (4 liên thông), phần còn lại
// coi là "mặt nạ nhân vật"; đếm tỉ lệ điểm ảnh trong mặt nạ vẫn có màu gần nền (SUY LUẬN: không có mặt nạ
// thật từ nguồn — xấp xỉ bằng liên thông nền từ biên; lỗ nền kín bên trong nhân vật không bị tính).
// Sửa theo review #4: ảnh không có vật nào (mặt nạ ≈ 0) KHÔNG được coi là đạt — đó là dấu hiệu ảnh trống,
// không phải "không lẫn màu"; yêu cầu mặt nạ chiếm tối thiểu minMaskRatio diện tích khung.
function chromaBleed(img, { target = BG, bgTol = 40, bleedTol = 28, maxRatio = 0.005, minMaskRatio = 0.01 } = {}) {
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
  const maskRatio = maskN / n;
  const ratio = maskN ? bleed / maskN : 0;
  const hasSubject = maskRatio >= minMaskRatio;
  return { maskPx: maskN, maskRatio: Math.round(maskRatio * 10000) / 10000, bleedPx: bleed, ratio: Math.round(ratio * 100000) / 1000, hasSubject, pass: hasSubject && ratio <= maxRatio };
}

// CH-05 (expr): cột ngoài cùng trái/phải phải có điểm khác nền trong 30% dưới ảnh.
function shouldersTouchEdges(img, { target = BG, tol = 40, bottomFrac = 0.3 } = {}) {
  const yFrom = Math.floor(img.h * (1 - bottomFrac));
  const col = (x) => { for (let y = yFrom; y < img.h; y++) if (!isBg(at(img, x, y), target, tol)) return true; return false; };
  const left = col(0), right = col(img.w - 1);
  return { left, right, pass: left && right };
}

// CH-07 (pose): hàng thấp nhất khác nền phải nằm ở groundY ± tol. groundY mặc định cố định theo SUY LUẬN
// của STANDARD-KIT-v1 (y_g = 2400 trên khung 2560), KHÔNG tự suy ra từ chính ảnh đang đo (review #10) — gọi
// phải truyền rõ groundY khi khung khác 2560.
function feetTouchGround(img, { target = BG, tol = 40, groundY = 2400, groundTol = 8 } = {}) {
  let lowest = -1;
  for (let y = img.h - 1; y >= 0 && lowest < 0; y--) {
    for (let x = 0; x < img.w; x++) if (!isBg(at(img, x, y), target, tol)) { lowest = y; break; }
  }
  const pass = lowest >= 0 && Math.abs(lowest - groundY) <= groundTol;
  return { lowestY: lowest, groundY, pass };
}

// PR-01/FX-01: hộp bao vật (điểm khác nền) phải cách mọi mép ≥ marginPx. Trả margin=null nếu không có vật.
function boundingBox(img, { target = BG, tol = 40 } = {}) {
  let minX = -1, maxX = -1, minY = -1, maxY = -1;
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) {
    if (isBg(at(img, x, y), target, tol)) continue;
    if (minX < 0 || x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (minY < 0 || y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const found = minX >= 0;
  const margin = found ? Math.min(minX, img.w - 1 - maxX, minY, img.h - 1 - maxY) : null;
  return { found, minX, maxX, minY, maxY, margin };
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

module.exports = { BG, decodePng, normalizePng, cornerColor, sizePad, chromaBleed, shouldersTouchEdges, feetTouchGround, boundingBox, overlayDiff, alphaRatio };
