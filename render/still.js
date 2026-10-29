// © 2026 Gen Labs — All rights reserved.
// Đường dựng MỘT khung (SPEC-0.2.0 §2.2) cho 4 việc: ảnh bìa xem trước (thumb), xem trước nhận diện (brand), xem trước bước hướng dẫn (frame), bảng nhân vật (cast).
// renderStill({ mode, payload, size:[w,h], format:'jpeg'|'png', quality, outFile?, assetRoot?, chromiumPath?, fontCss? }) → Promise<{ file|null, buffer, measures, errors }>
// Trên sân khấu: window.__still(mode, payload) → GSStill[mode](payload) (render/stage/still.js; mỗi gói đăng ký chế độ của mình). Không chạy vòng __seek.
// Tiết chế tài nguyên (CNS-106): tối đa 1 still chạy cùng lúc (song song với Run render, Chromium riêng `nice 10`); hàng đợi FIFO ≤ 8;
// hạn 15 s tính TỪ LÚC BẮT ĐẦU dựng (không tính xếp hàng); Chromium "ấm" giữ 60 s rồi tự đóng. Ngân sách RAM (≤ 600 MB) đo ở S7 — chưa cưỡng chế ở đây.
// Mọi đường dựng ảnh (sheet, preview, ảnh bìa) đi qua đây (CNS-118).
// F7 (SPEC-0.2.0-F7 §4.3, §6.1): opts.aspect (mặc định payload.plan.aspect, không có thì '16:9') ⇒ sân khấu mở đúng `size` của tỉ lệ (render/aspects.json, 9:16 = 1080×1920);
//   `size` yêu cầu phải cùng tỉ lệ (chiều cao quy về sân khấu ≤ cao sân khấu), sai ⇒ still_size; tỉ lệ lạ ⇒ still_aspect.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const chromium = require('./chromium');
const cdp = require('./cdp');
const { openStage, resolveAssets } = require('./render');
const png = require('./png');
const aspects = require('./aspects');

const MODES = ['thumb', 'frame', 'brand', 'cast'];
const QUEUE_MAX = 8, TIMEOUT_MS = 15000, WARM_MS = 60000, NICE = 10;

let warmP = null;         // Promise<{ ch, client, timer }> — Chromium ấm dùng lại giữa các still (Promise để hai still không mở hai trình duyệt)
let queue = [];           // hàng chờ FIFO: { opts, resolve, reject }
let busy = false;
const stats = { launched: 0, done: 0, timeouts: 0, rejectedFull: 0 };

function err(code, text) { return Object.assign(new Error(text), { code }); }
const warmMs = () => Number(process.env.GS_STILL_WARM_MS) || WARM_MS;
// bỏ Chromium ấm (kể cả đang mở dở): đóng ngay khi nó sẵn sàng
function dropWarm() {
  const p = warmP; warmP = null;
  if (!p) return Promise.resolve();
  return p.then((w) => { clearTimeout(w.timer); try { w.client.close(); } catch (e) { /* đã đóng */ } return w.ch.close().catch(() => {}); }, () => {});
}
function getWarm(opts) {
  if (!warmP) {
    const p = (async () => {
      const ch = await chromium.launch({ path: opts.chromiumPath, nice: NICE });
      let client;
      try { client = await cdp.connect(ch.wsUrl, undefined, { sendTimeoutMs: opts.sendTimeoutMs }); } catch (e) { await ch.close().catch(() => {}); throw e; }
      stats.launched++;
      return { ch, client, timer: null };
    })();
    warmP = p;
    p.catch(() => { if (warmP === p) warmP = null; });   // mở lỗi ⇒ lần sau thử lại
  }
  return warmP.then((w) => { clearTimeout(w.timer); return w; });
}
// hết hàng chờ: hẹn đóng Chromium sau 60 s rảnh
function armWarm() {
  const p = warmP; if (!p) return;
  p.then((w) => {
    if (warmP !== p) return;
    clearTimeout(w.timer);
    w.timer = setTimeout(() => { if (warmP === p) dropWarm(); }, warmMs());
    if (w.timer.unref) w.timer.unref();   // Chromium ấm không giữ tiến trình Node sống
  }, () => {});
}

// tỉ lệ của một still: opts.aspect → payload.plan.aspect → (mode thumb) tỉ lệ của mẫu ảnh bìa trong spec (A3: spec.template.aspect) → '16:9'
// A-INT: preview_thumbnail / render_still mode thumb không cần truyền aspect — mẫu dọc tự mở sân khấu 1080×1920.
function aspectOf(o) {
  const p = o.payload || {};
  return o.aspect || (p.plan && typeof p.plan === 'object' && p.plan.aspect) || (o.mode === 'thumb' && p.template && typeof p.template === 'object' && p.template.aspect) || '16:9';
}

async function runOne(o) {
  const errors = [], asp = aspectOf(o), ad = aspects.get(asp);
  if (!ad) throw err('still_aspect', 'Tỉ lệ "' + asp + '" không có trong render/aspects.json.');
  const [SW, SH] = ad.size, size = o.size || [SW, SH];
  if (!MODES.includes(o.mode)) throw err('still_mode', 'Chế độ still không hợp lệ: ' + o.mode + ' (có: ' + MODES.join(', ') + ').');
  if (!Array.isArray(size) || size.length !== 2 || !(size[0] > 0) || !(size[1] > 0) || size[0] > 2 * SW || size[1] > 2 * SH) throw err('still_size', 'size phải là [w,h] trong 1..' + 2 * SW + ' × 1..' + 2 * SH + ' (tỉ lệ ' + asp + ').');
  const scale = size[0] / SW, srcH = size[1] / scale;
  if (srcH > SH + 0.5) throw err('still_size', 'Tỉ lệ khung vượt sân khấu ' + SW + '×' + SH + ' (cao ' + Math.round(srcH) + ' > ' + SH + ').');
  const payload = Object.assign({}, o.payload || {});
  // asset payload tham chiếu (logo, ảnh mặt, màn hình...): cùng luật với renderPlan.resolveAssets
  if (Array.isArray(payload.assetRefs) && payload.assetRefs.length) payload.assetData = Object.assign({}, payload.assetData, resolveAssets({ assetRefs: payload.assetRefs, beats: [] }, errors, o.assetRoot, { ffmpegPath: o.ffmpegPath }));
  if (o.fontCss) payload.fontCss = o.fontCss;

  let timer = null, stage = null, holder = {};
  const started = Date.now();
  const timeoutMs = o.timeoutMs || TIMEOUT_MS;
  const expired = new Promise((_, reject) => {
    timer = setTimeout(() => {
      stats.timeouts++;
      reject(err('still_timeout', 'Dựng khung still quá hạn ' + Math.round(timeoutMs / 1000) + ' giây.'));
      dropWarm();   // trình duyệt có thể đang kẹt → bỏ, lần sau mở mới
    }, timeoutMs);
  });
  try {
    return await Promise.race([(async () => {
      const w = await getWarm(o);
      stage = await openStage({ shared: w, width: SW, height: SH, errors, holder });
      const measures = await stage.ev('window.__still(' + JSON.stringify(o.mode) + ',' + JSON.stringify(payload) + ')');
      const fmt = o.format === 'png' ? 'png' : 'jpeg';
      // PNG nhỏ hơn 1920: chụp 1:1 rồi thu nhỏ bằng Node (render/png.js). clip.scale của Chromium dựng lại lớp "world" ở tỉ lệ lẻ và rơi vài điểm ảnh ở đường nối ô raster tuỳ tải máy
      // (cùng DOM, hai ảnh khác nhau ~1/10 lần) ⇒ khung không còn là hàm thuần của (plan, t). Chụp 1:1 thì ổn định 50/50.
      let buffer;
      if (fmt === 'png' && scale !== 1) {
        const full = png.decode(await stage.shot('png', undefined, { x: 0, y: 0, width: SW, height: srcH, scale: 1 }));
        buffer = png.encode(png.resize(full, Math.round(size[0]), Math.round(size[1])));
      } else buffer = await stage.shot(fmt, o.quality, { x: 0, y: 0, width: SW, height: srcH, scale });
      let file = null;
      if (o.outFile) { fs.mkdirSync(path.dirname(o.outFile), { recursive: true }); fs.writeFileSync(o.outFile, buffer); file = o.outFile; }
      return { file, buffer, measures: measures === undefined ? {} : measures, errors, elapsed_ms: Date.now() - started };
    })(), expired]);
  } finally {
    clearTimeout(timer);
    if (stage) await stage.close().catch(() => {});
    stats.done++;
  }
}

async function pump() {
  if (busy) return;
  busy = true;
  try {
    while (queue.length) {
      const j = queue.shift();
      try { j.resolve(await runOne(j.opts)); } catch (e) { j.reject(e); }
    }
  } finally { busy = false; armWarm(); }
}

// Xếp hàng một still. Đầy hàng (đang chạy 1 + chờ 8) ⇒ từ chối ngay, mã still_queue_full.
function renderStill(opts) {
  if (queue.length >= QUEUE_MAX) { stats.rejectedFull++; return Promise.reject(err('still_queue_full', 'Hàng chờ ảnh still đã đầy (' + QUEUE_MAX + '). Thử lại sau.')); }
  return new Promise((resolve, reject) => { queue.push({ opts, resolve, reject }); pump(); });
}
// Đóng Chromium ấm ngay (test, tắt máy chủ)
function closeStill() { return dropWarm(); }

module.exports = { renderStill, closeStill, MODES, QUEUE_MAX, TIMEOUT_MS, WARM_MS, stats: () => Object.assign({}, stats, { queued: queue.length, warm: !!warmP }) };
