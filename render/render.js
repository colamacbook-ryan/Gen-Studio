// © 2026 Gen Labs — All rights reserved.
// Xuất khung hình: mở trang sân khấu bằng Chromium headless (CDP thuần), __load(plan), lặp __seek(t) + chụp từng khung JPEG, xuất sfx WAV + ảnh bìa.
// renderPlan({plan, outDir, chromiumPath?, assetRoot?, ffmpegPath?, onProgress?(0..1), fontCss?}) → {framesPattern, frames, fps, errors:[chuỗi], sfx:{tên: đường dẫn}, cover, thumbs:[…], render_ms, render_fps}
// openStage(opts) → {page, ev, shot, close} — phần mở Chromium/CDP dùng chung với render/still.js (đường dựng một khung).
// F7 (SPEC-0.2.0-F7 §4.3–4.4): Chromium mở đúng plan.size; plan có `layout` (tỉ lệ không legacy) ⇒ gọi window.__measure() ở aspects.sampleTimes(plan) ngay sau __seek
//   của khung gần nhất (không seek thêm — khung chụp không đổi) và trả `measures` = {duration_s, samples:[{t_ms, t_sample, kind, line?, beat?, zone?, cam, els}]} — đúng đầu vào
//   aspects.safeCheck (G-SAFE). 16:9 không đo, không có khoá `measures`. cover.jpg ở aspects.coverFrameMs(plan); ảnh bìa hạ cỡ theo aspects.thumbSizes (cạnh dài 1280/1920).
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { spawnSync } = require('node:child_process');
const chromium = require('./chromium');
const cdp = require('./cdp');
const aspects = require('./aspects');

const STAGE = path.join(__dirname, 'stage', 'stage.html');
const LOCAL_FONTS = path.join(__dirname, 'stage', 'fonts', 'local.css');   // gói F có thể đặt file này (phông cục bộ); không có thì dùng phông hệ thống
const MAX_ASSET = 8 * 1024 * 1024;

// nhận dạng ảnh bằng magic bytes (L-101: không tin phần mở rộng); SVG nhúng qua <img> data URL nên không chạy được mã
function mimeOf(buf) {
  if (buf.length > 8 && buf[0] === 0x89 && buf.slice(1, 4).toString() === 'PNG') return 'image/png';
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length > 12 && buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') return 'image/webp';
  if (buf.slice(0, 4).toString() === 'GIF8') return 'image/gif';
  // SVG: phần tử GỐC phải là <svg> (cho phép BOM, khai báo <?xml ?> và chú thích đứng trước), không chỉ "có chứa" chuỗi svg
  const head = buf.slice(0, 2048).toString('utf8').replace(/^\uFEFF/, '').replace(/^\s*(<\?xml[^>]{0,200}\?>\s*)?(<!--[\s\S]{0,500}?-->\s*)*/, '');
  if (/^<svg[\s>]/i.test(head)) return 'image/svg+xml';
  return null;
}
// Chỉ đọc file NẰM TRONG assetRoot (kho asset), kiểm sau khi phân giải symlink; không có assetRoot → không đọc file nào.
function insideRoot(file, assetRoot) {
  if (!assetRoot) throw new Error('chưa cấu hình thư mục asset');
  const root = fs.realpathSync(assetRoot);
  const real = fs.realpathSync(path.resolve(root, file));
  if (real !== root && !real.startsWith(root + path.sep)) throw new Error('ngoài thư mục asset');
  return real;
}
// Đọc một tham chiếu asset → data URL. ref = { asset, label?, maxPx?: [w,h] }. Cùng luật cho illustration, màn hình, logo, ảnh mặt...: magic bytes, trong assetRoot, ≤ 8 MB.
// maxPx (CNS-114): ảnh raster lớn hơn thì hạ về vừa khung maxPx bằng ffmpeg (opts.ffmpegPath); không có ffmpeg ⇒ giữ nguyên.
function loadAsset(a, assetRoot, opts) {
  if (/^data:image\/(png|jpeg|webp|gif);base64,/.test(a)) return a;
  const file = insideRoot(a.replace(/^file:\/\//, ''), assetRoot);
  let buf = fs.readFileSync(file);
  if (buf.length > MAX_ASSET) throw new Error('lớn hơn 8 MB');
  let mime = mimeOf(buf); if (!mime) throw new Error('không phải PNG/JPEG/WebP/GIF/SVG');
  if (opts && opts.maxPx && opts.ffmpegPath && mime !== 'image/svg+xml' && mime !== 'image/gif') {
    const r = downscale(buf, mime, opts.maxPx, opts.ffmpegPath); buf = r.buf; mime = r.mime;
  }
  return 'data:' + mime + ';base64,' + buf.toString('base64');
}
// hạ cỡ: chỉ thu nhỏ (không phóng), giữ tỉ lệ; JPEG → JPEG, còn lại → PNG. Lỗi ffmpeg ⇒ giữ bản gốc (ảnh vẫn dùng được, chỉ nặng hơn).
function downscale(buf, mime, maxPx, ffmpegPath) {
  const jpeg = mime === 'image/jpeg', w = Math.max(1, Math.round(maxPx[0])), h = Math.max(1, Math.round(maxPx[1]));
  const vf = `scale='min(iw,${w})':'min(ih,${h})':force_original_aspect_ratio=decrease:force_divisible_by=1`;
  const r = spawnSync(ffmpegPath, ['-v', 'error', '-i', 'pipe:0', '-vf', vf, '-frames:v', '1', '-f', 'image2pipe', '-c:v', jpeg ? 'mjpeg' : 'png', ...(jpeg ? ['-q:v', '3'] : []), 'pipe:1'],
    { input: buf, maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0 || !r.stdout || !r.stdout.length) return { buf, mime };
  return r.stdout.length < buf.length ? { buf: r.stdout, mime: jpeg ? 'image/jpeg' : 'image/png' } : { buf, mime };
}
// Phân giải mọi asset plan tham chiếu → {asset: dataURL}. Nguồn: plan.assetRefs (SPEC-0.2.0 §2.1/§4.5: gồm brand.logo.asset, màn hình, ảnh mặt...)
// cộng param `asset` của khối illustration (đường cũ — bài v1 không có assetRefs vẫn chạy đúng như trước).
function resolveAssets(plan, errors, assetRoot, opts) {
  const data = {};
  const one = (a, label, maxPx) => {
    a = String(a || ''); if (data[a]) return;
    try { data[a] = loadAsset(a, assetRoot, { maxPx, ffmpegPath: opts && opts.ffmpegPath }); } catch (e) { errors.push(label + ': không đọc được asset (' + e.message + ')'); }
  };
  (plan.assetRefs || []).forEach((r, i) => { const o = typeof r === 'string' ? { asset: r } : r || {}; one(o.asset, o.label || 'assetRefs[' + i + ']', o.maxPx); });
  plan.beats.filter(b => b.block === 'illustration').forEach(b => one(b.params.asset, 'illustration ' + b.id));
  return data;
}

// Mở sân khấu: Chromium (mới hoặc dùng chung) + trang stage.html + vài tiện ích. Dùng chung cho renderPlan và renderStill (không còn hai bản sao logic CDP).
// openStage({chromiumPath?, nice?, shared?: {ch, client}, width=1920, height=1080, errors?: [], sendTimeoutMs?, fontCss?, holder?: {}}) → {page, ev, shot(format?, quality?, clip?), errors, ch, client, close()}
// holder: nơi openStage ghi ch/client ngay khi có, để bên gọi đóng cưỡng bức khi quá hạn. shared: dùng lại Chromium đã mở (close() chỉ đóng tab, không đóng trình duyệt).
async function openStage(opts) {
  opts = opts || {};
  const errors = opts.errors || [], holder = opts.holder || {}, shared = opts.shared || null;
  const ch = shared ? shared.ch : await chromium.launch({ path: opts.chromiumPath, nice: opts.nice });
  holder.ch = ch;
  const client = shared ? shared.client : await cdp.connect(ch.wsUrl, undefined, { sendTimeoutMs: opts.sendTimeoutMs });
  holder.client = client;
  let targetId = null;
  const stage = {
    errors, ch, client, page: null,
    async close() {
      try { if (targetId && shared) await client.send('Target.closeTarget', { targetId }); } catch (e) { /* tab đã đóng */ }
      if (!shared) { client.close(); await ch.close(); }
    }
  };
  try {
    const t = await client.send('Target.createTarget', { url: 'about:blank' }); targetId = t.targetId;
    const { sessionId } = await client.send('Target.attachToTarget', { targetId, flatten: true });
    const page = client.session(sessionId); stage.page = page;
    page.on('Runtime.consoleAPICalled', p => { if (p.type === 'error') errors.push('console: ' + p.args.map(a => a.value !== undefined ? a.value : a.description).join(' ')); });
    page.on('Runtime.exceptionThrown', p => errors.push('pageerror: ' + ((p.exceptionDetails.exception && p.exceptionDetails.exception.description) || p.exceptionDetails.text)));
    page.on('Log.entryAdded', p => { if (p.entry.level === 'error') errors.push('log: ' + p.entry.text + (p.entry.url ? ' ' + p.entry.url : '')); });
    await Promise.all([page.send('Page.enable'), page.send('Runtime.enable'), page.send('Log.enable')]);
    await page.send('Emulation.setDeviceMetricsOverride', { width: opts.width || 1920, height: opts.height || 1080, deviceScaleFactor: 1, mobile: false });
    const loaded = page.once('Page.loadEventFired', 30000);
    await page.send('Page.navigate', { url: pathToFileURL(STAGE).href });
    await loaded;
    stage.ev = async (expression) => {
      const r = await page.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error('trang sân khấu lỗi: ' + ((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text));
      return r.result.value;
    };
    stage.shot = async (format, quality, clip) => {
      const p = { format: format === 'png' ? 'png' : 'jpeg' };
      if (p.format === 'jpeg') p.quality = quality || 92;
      if (clip) p.clip = clip;
      return Buffer.from((await page.send('Page.captureScreenshot', p)).data, 'base64');
    };
    if (opts.fontCss) await stage.ev('(function(){var s=document.createElement("style");s.textContent=' + JSON.stringify(opts.fontCss) + ';document.head.appendChild(s);})()');
    return stage;
  } catch (e) { await stage.close().catch(() => {}); throw e; }
}

async function renderPlan(opts) {
  const plan = opts.plan, outDir = opts.outDir, fps = plan.fps || 30, errors = [];
  const framesDir = path.join(outDir, 'frames'), sfxDir = path.join(outDir, 'sfx');
  fs.rmSync(framesDir, { recursive: true, force: true });
  fs.mkdirSync(framesDir, { recursive: true }); fs.mkdirSync(sfxDir, { recursive: true });
  const fontCss = opts.fontCss !== undefined ? opts.fontCss : (fs.existsSync(LOCAL_FONTS) ? fs.readFileSync(LOCAL_FONTS, 'utf8') : '');
  const plan2 = Object.assign({}, plan, { assetData: resolveAssets(plan, errors, opts.assetRoot, { ffmpegPath: opts.ffmpegPath }), fontCss });

  const holder = {};
  let stage = null, deadline = null, stall = null, fail = null;
  // Hai hạn (A-INT, nguyên nhân gốc lỗi render_timeout 120 s khi chạy cả bộ test):
  //  • TREO (stallMs, mặc định 60 s, tính từ khi sân khấu mở): không ra thêm khung/ảnh bìa nào trong 60 s ⇒ treo ⇒ đóng Chromium + render_timeout. Mỗi bước tiến đặt lại đồng hồ.
  //  • TỔNG (deadlineMs, mặc định max(10 phút, 20× độ dài clip)): chặn trên tuyệt đối cho bản dựng chạy rất chậm nhưng vẫn tiến.
  // Hạn cũ max(120 s, 5× độ dài) gần bằng chi phí thật (đo 2026-10-29 trên máy 4 nhân: một mình 4,4× thời lượng ≈ 74 s cho clip 16,7 s; 3 bản dựng song song 6–7× ≈ 105–117 s)
  // nên máy bận là trượt dù không treo. Treo thật vẫn bị bắt trong ≤ 60 s (và từng lệnh CDP vẫn có sendTimeoutMs riêng).
  const limitMs = opts.deadlineMs || Math.max(600000, 20 * plan.duration_ms), stallMs = opts.stallMs || 60000;
  const expired = new Promise((_, reject) => { fail = reject; });
  let dead = null;   // đã quá hạn: execute() dừng ở bước kế tiếp và tự đóng Chromium nếu nó vừa mở xong (trước đây mở muộn hơn hạn ⇒ Chromium mồ côi)
  const kill = (msg) => {
    const e = new Error(msg); e.code = 'render_timeout'; dead = e;
    try { if (holder.client) holder.client.close(); } catch (x) { /* đã đóng */ }
    if (holder.ch) holder.ch.close().catch(() => {}); fail(e);
  };
  const alive = () => { if (dead) return; clearTimeout(stall); stall = setTimeout(() => kill('Dựng khung hình bị treo: ' + Math.round(stallMs / 1000) + ' giây không ra khung mới.'), stallMs); };
  deadline = setTimeout(() => kill('Dựng khung hình quá hạn tổng ' + Math.round(limitMs / 1000) + ' giây.'), limitMs);
  try {
    const run = execute();
    run.catch(() => {});   // sau khi quá hạn, lỗi muộn của execute() (CDP đã đóng, thư mục đã dọn) không thành unhandledRejection
    return await Promise.race([run, expired]);
  } finally {
    clearTimeout(deadline); clearTimeout(stall);
    if (stage) await stage.close(); else { if (holder.client) holder.client.close(); if (holder.ch) await holder.ch.close(); }
  }

  async function execute() {
    const size = Array.isArray(plan.size) ? plan.size : [1920, 1080];
    const st = await openStage({ chromiumPath: opts.chromiumPath, sendTimeoutMs: opts.sendTimeoutMs, errors, holder, width: size[0], height: size[1] });
    if (dead) { await st.close().catch(() => {}); throw dead; }
    stage = st;
    alive();   // đồng hồ treo chạy từ khi sân khấu mở (mở Chromium có hạn riêng GS_CHROMIUM_START_MS, từng lệnh CDP có sendTimeoutMs)
    const { ev, shot } = stage;
    await ev('window.__load(' + JSON.stringify(plan2) + ')');

    const N = Math.ceil(plan.duration_ms / 1000 * fps), writes = [], t0 = Date.now();
    // đo vùng an toàn (L-42: ≤ 240 mốc, mỗi mốc ≤ 5 ms ⇒ ≤ 1 % thời gian dựng); mốc gán cho khung gần nhất, đo SAU khi chụp khung đó
    const marks = plan.layout ? aspects.sampleTimes(plan) : null, samples = [];
    let mi = 0, measureMs = 0;
    for (let i = 0; i < N; i++) {
      if (dead) throw dead;
      const tf = i * 1000 / fps;
      await ev('window.__seek(' + tf + ')');
      const buf = await shot();
      writes.push(fs.promises.writeFile(path.join(framesDir, 'f' + String(i).padStart(5, '0') + '.jpg'), buf));
      if (marks) {
        while (mi < marks.length && (marks[mi].t <= tf + 500 / fps || i === N - 1)) {
          const m0 = Date.now(), mk = marks[mi++], r = await ev('window.__measure()');
          measureMs += Date.now() - m0;
          const smp = { t_ms: r.t_ms, t_sample: mk.t, kind: mk.kind };
          if (mk.line) smp.line = mk.line; if (mk.beat) smp.beat = mk.beat; if (mk.zone) smp.zone = mk.zone;
          samples.push(Object.assign(smp, { cam: r.cam, els: r.els }));
        }
      }
      if (writes.length >= 16) await Promise.all(writes.splice(0));
      alive();
      if (opts.onProgress && i % 10 === 0) opts.onProgress(i / N);
    }
    await Promise.all(writes);
    const renderMs = Date.now() - t0;

    // ảnh bìa: lúc tiêu đề đã dựng xong (≥ 1,5 s sau beat đầu), nằm trong clip — công thức một nguồn ở aspects.coverFrameMs (CNS-337)
    const coverT = aspects.coverFrameMs(plan);
    await ev('window.__seek(' + coverT + ')');
    const cover = path.join(outDir, 'cover.jpg'); fs.writeFileSync(cover, await shot());

    // ảnh bìa theo phương án (plan.thumbs, SPEC-0.2.0 §5.5): ngay trong phiên này, sau vòng khung hình — không mở Chromium lần nữa.
    // Mỗi phương án: __still('thumb', spec) → PNG có chữ; __still('thumb', {...spec, textOff:true}) → PNG không chữ (để cổng đo tương phản); rồi hạ JPEG 1280 q85 (+1920 q85) bằng ffmpeg.
    alive();
    const thumbs = await renderThumbs(plan2.thumbs || [], stage, outDir, Object.assign({}, opts, { thumbSizes: aspects.thumbSizes(plan.aspect || '16:9'), onStep: alive }), errors);
    alive();

    // hiệu ứng âm: dựng offline bằng engine Gen-Chibi (cùng đường với tai nghe)
    const names = [...new Set(plan.cues.map(c => c.name))], sfx = {};
    if (names.length) {
      const b64 = await ev('window.__sfx(' + JSON.stringify(names) + ')');
      for (const [n, v] of Object.entries(b64)) { const p = path.join(sfxDir, n + '.wav'); fs.writeFileSync(p, Buffer.from(v, 'base64')); sfx[n] = p; }
    }
    if (opts.onProgress) opts.onProgress(1);
    const out = { framesPattern: path.join(framesDir, 'f%05d.jpg'), frames: N, fps, errors, sfx, cover, thumbs, render_ms: renderMs, render_fps: +(N / (renderMs / 1000)).toFixed(2) };
    if (marks) { out.measures = { duration_s: +(plan.duration_ms / 1000).toFixed(3), samples }; out.measure_ms = measureMs; out.cover_frame_ms = coverT; }
    return out;
  }
}

// → [{index, spec, measures, png, png_notext, jpg1280, jpg1920}]; không có phương án ⇒ [] (đường cũ, không tốn gì)
async function renderThumbs(specs, stage, outDir, opts, errors) {
  const out = [];
  if (!specs.length) return out;
  const dir = path.join(outDir, 'thumbs'); fs.mkdirSync(dir, { recursive: true });
  for (let i = 0; i < specs.length; i++) {
    if (opts.onStep) opts.onStep();   // đồng hồ treo của renderPlan: mỗi phương án là một bước tiến
    const spec = specs[i], base = path.join(dir, 't' + (i + 1));
    const measures = await stage.ev('window.__still("thumb", ' + JSON.stringify(spec) + ')');
    fs.writeFileSync(base + '.png', await stage.shot('png'));
    await stage.ev('window.__still("thumb", ' + JSON.stringify(Object.assign({}, spec, { textOff: true })) + ')');
    fs.writeFileSync(base + '.notext.png', await stage.shot('png'));
    const t = { index: i, spec, measures, png: base + '.png', png_notext: base + '.notext.png', jpg1280: null, jpg1920: null };
    if (opts.ffmpegPath) {
      // cỡ theo tỉ lệ (aspects.thumbSizes): khoá jpg1280/jpg1920 = CẠNH DÀI 1280/1920 (16:9: rộng 1280/1920 như cũ; 9:16: 720×1280 / 1080×1920)
      const sizes = opts.thumbSizes || [[1280, 720], [1920, 1080]];
      for (const [sw, sh] of sizes) {
        const long = Math.max(sw, sh), key = 'jpg' + long, f = base + '.' + long + '.jpg';
        const r = spawnSync(opts.ffmpegPath, ['-v', 'error', '-y', '-i', t.png, '-vf', 'scale=' + sw + ':-2:flags=lanczos', '-q:v', '3', f], { encoding: 'utf8' });
        if (r.status === 0 && fs.existsSync(f)) t[key] = f; else errors.push('thumb ' + (i + 1) + ': ffmpeg hạ ' + long + ' lỗi (' + String(r.stderr || '').slice(0, 120) + ')');
      }
    } else errors.push('thumb ' + (i + 1) + ': thiếu ffmpegPath nên chưa hạ JPEG');
    out.push(t);
  }
  return out;
}

module.exports = { renderPlan, openStage, resolveAssets, mimeOf, insideRoot };
