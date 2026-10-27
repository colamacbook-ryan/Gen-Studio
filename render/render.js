// © 2026 Gen Labs — All rights reserved.
// Xuất khung hình: mở trang sân khấu bằng Chromium headless (CDP thuần), __load(plan), lặp __seek(t) + chụp từng khung JPEG, xuất sfx WAV + ảnh bìa.
// renderPlan({plan, outDir, chromiumPath?, onProgress?(0..1), fontCss?}) → {framesPattern, frames, fps, errors:[chuỗi], sfx:{tên: đường dẫn}, cover, render_ms, render_fps}
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const chromium = require('./chromium');
const cdp = require('./cdp');

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
function resolveAssets(plan, errors, assetRoot) {
  const data = {};
  plan.beats.filter(b => b.block === 'illustration').forEach(b => {
    const a = String(b.params.asset || ''); if (data[a]) return;
    if (/^data:image\/(png|jpeg|webp|gif);base64,/.test(a)) { data[a] = a; return; }
    try {
      const file = insideRoot(a.replace(/^file:\/\//, ''), assetRoot), buf = fs.readFileSync(file);
      if (buf.length > MAX_ASSET) throw new Error('lớn hơn 8 MB');
      const mime = mimeOf(buf); if (!mime) throw new Error('không phải PNG/JPEG/WebP/GIF/SVG');
      data[a] = 'data:' + mime + ';base64,' + buf.toString('base64');
    } catch (e) { errors.push('illustration ' + b.id + ': không đọc được asset (' + e.message + ')'); }
  });
  return data;
}

async function renderPlan(opts) {
  const plan = opts.plan, outDir = opts.outDir, fps = plan.fps || 30, errors = [];
  const framesDir = path.join(outDir, 'frames'), sfxDir = path.join(outDir, 'sfx');
  fs.rmSync(framesDir, { recursive: true, force: true });
  fs.mkdirSync(framesDir, { recursive: true }); fs.mkdirSync(sfxDir, { recursive: true });
  const fontCss = opts.fontCss !== undefined ? opts.fontCss : (fs.existsSync(LOCAL_FONTS) ? fs.readFileSync(LOCAL_FONTS, 'utf8') : '');
  const plan2 = Object.assign({}, plan, { assetData: resolveAssets(plan, errors, opts.assetRoot), fontCss });

  const ch = await chromium.launch({ path: opts.chromiumPath });
  let client = null;
  try {
    client = await cdp.connect(ch.wsUrl);
    const { targetId } = await client.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await client.send('Target.attachToTarget', { targetId, flatten: true });
    const page = client.session(sessionId);
    page.on('Runtime.consoleAPICalled', p => { if (p.type === 'error') errors.push('console: ' + p.args.map(a => a.value !== undefined ? a.value : a.description).join(' ')); });
    page.on('Runtime.exceptionThrown', p => errors.push('pageerror: ' + ((p.exceptionDetails.exception && p.exceptionDetails.exception.description) || p.exceptionDetails.text)));
    page.on('Log.entryAdded', p => { if (p.entry.level === 'error') errors.push('log: ' + p.entry.text + (p.entry.url ? ' ' + p.entry.url : '')); });
    await Promise.all([page.send('Page.enable'), page.send('Runtime.enable'), page.send('Log.enable')]);
    await page.send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
    const loaded = page.once('Page.loadEventFired', 30000);
    await page.send('Page.navigate', { url: pathToFileURL(STAGE).href });
    await loaded;
    const ev = async (expression) => {
      const r = await page.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error('trang sân khấu lỗi: ' + ((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text));
      return r.result.value;
    };
    await ev('window.__load(' + JSON.stringify(plan2) + ')');

    const N = Math.ceil(plan.duration_ms / 1000 * fps), writes = [], t0 = Date.now();
    const shot = async () => Buffer.from((await page.send('Page.captureScreenshot', { format: 'jpeg', quality: 92 })).data, 'base64');
    for (let i = 0; i < N; i++) {
      await ev('window.__seek(' + (i * 1000 / fps) + ')');
      const buf = await shot();
      writes.push(fs.promises.writeFile(path.join(framesDir, 'f' + String(i).padStart(5, '0') + '.jpg'), buf));
      if (writes.length >= 16) await Promise.all(writes.splice(0));
      if (opts.onProgress && i % 10 === 0) opts.onProgress(i / N);
    }
    await Promise.all(writes);
    const renderMs = Date.now() - t0;

    // ảnh bìa: lúc tiêu đề đã dựng xong (≥ 1,5 s sau beat đầu), nằm trong clip
    const first = plan.beats.length ? plan.beats[0].t_in : 0, coverT = Math.min(plan.duration_ms - 1, first + 1500);
    await ev('window.__seek(' + coverT + ')');
    const cover = path.join(outDir, 'cover.jpg'); fs.writeFileSync(cover, await shot());

    // hiệu ứng âm: dựng offline bằng engine Gen-Chibi (cùng đường với tai nghe)
    const names = [...new Set(plan.cues.map(c => c.name))], sfx = {};
    if (names.length) {
      const b64 = await ev('window.__sfx(' + JSON.stringify(names) + ')');
      for (const [n, v] of Object.entries(b64)) { const p = path.join(sfxDir, n + '.wav'); fs.writeFileSync(p, Buffer.from(v, 'base64')); sfx[n] = p; }
    }
    if (opts.onProgress) opts.onProgress(1);
    return { framesPattern: path.join(framesDir, 'f%05d.jpg'), frames: N, fps, errors, sfx, cover, render_ms: renderMs, render_fps: +(N / (renderMs / 1000)).toFixed(2) };
  } finally {
    if (client) client.close();
    await ch.close();
  }
}

module.exports = { renderPlan, mimeOf, insideRoot };
