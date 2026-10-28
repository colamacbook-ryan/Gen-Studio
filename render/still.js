// © 2026 Gen Labs — All rights reserved.
// Đường dựng MỘT khung (SPEC-0.2.0 §2.2) cho 4 việc: ảnh bìa xem trước (thumb), xem trước nhận diện (brand), xem trước bước hướng dẫn (frame), bảng nhân vật (cast).
// renderStill({ mode, payload, size:[w,h], format:'jpeg'|'png', quality, outFile?, assetRoot?, chromiumPath?, fontCss? }) → Promise<{ file|null, buffer, measures, errors }>
// Trên sân khấu: window.__still(mode, payload) → GSStill[mode](payload) (render/stage/still.js; mỗi gói đăng ký chế độ của mình). Không chạy vòng __seek.
// Tiết chế tài nguyên (CNS-106): tối đa 1 still chạy cùng lúc (song song với Run render, Chromium riêng `nice 10`); hàng đợi FIFO ≤ 8;
// hạn 15 s tính TỪ LÚC BẮT ĐẦU dựng (không tính xếp hàng); Chromium "ấm" giữ 60 s rồi tự đóng. Ngân sách RAM (≤ 600 MB) đo ở S7 — chưa cưỡng chế ở đây.
// Mọi đường dựng ảnh (sheet, preview, ảnh bìa) đi qua đây (CNS-118).
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const chromium = require('./chromium');
const cdp = require('./cdp');
const { openStage, resolveAssets } = require('./render');

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

async function runOne(o) {
  const errors = [], size = o.size || [1920, 1080];
  if (!MODES.includes(o.mode)) throw err('still_mode', 'Chế độ still không hợp lệ: ' + o.mode + ' (có: ' + MODES.join(', ') + ').');
  if (!Array.isArray(size) || size.length !== 2 || !(size[0] > 0) || !(size[1] > 0) || size[0] > 3840 || size[1] > 2160) throw err('still_size', 'size phải là [w,h] trong 1..3840 × 1..2160.');
  const scale = size[0] / 1920, srcH = size[1] / scale;
  if (srcH > 1080.5) throw err('still_size', 'Tỉ lệ khung vượt sân khấu 1920×1080 (cao ' + Math.round(srcH) + ' > 1080).');
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
      stage = await openStage({ shared: w, width: 1920, height: 1080, errors, holder });
      const measures = await stage.ev('window.__still(' + JSON.stringify(o.mode) + ',' + JSON.stringify(payload) + ')');
      const fmt = o.format === 'png' ? 'png' : 'jpeg';
      const buffer = await stage.shot(fmt, o.quality, { x: 0, y: 0, width: 1920, height: srcH, scale });
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
