// © 2026 Gen Labs — All rights reserved.
// Tìm và chạy Chromium headless cho render. find(configured?) → đường dẫn | null ; launch({path, nice?}) → {wsUrl, close(), pid}
// nice: số (vd 10) ⇒ chạy qua `nice -n <số>` (ưu tiên thấp cho Chromium still, SPEC-0.2.0 §2.2).
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn, spawnSync } = require('node:child_process');

function isExec(p) { try { fs.accessSync(p, fs.constants.X_OK); return fs.statSync(p).isFile(); } catch (e) { return false; } }
function which(name) {
  const r = spawnSync('sh', ['-c', 'command -v ' + name], { encoding: 'utf8' });
  const p = (r.stdout || '').trim(); return r.status === 0 && p && isExec(p) ? p : null;
}
// thứ tự: tham số/CHROMIUM_PATH → `chromium` → `chromium-browser` → /opt/pw-browsers/chromium-*/chrome-linux*/chrome
function find(configured) {
  const env = configured || process.env.CHROMIUM_PATH;
  if (env) return isExec(env) ? env : null;
  const w = which('chromium') || which('chromium-browser'); if (w) return w;
  const base = '/opt/pw-browsers';
  try {
    for (const d of fs.readdirSync(base).filter(x => /^chromium-\d+$/.test(x)).sort().reverse()) {
      for (const sub of fs.readdirSync(path.join(base, d)).filter(x => /^chrome-linux/.test(x))) {
        const p = path.join(base, d, sub, 'chrome'); if (isExec(p)) return p;
      }
    }
  } catch (e) { /* không có thư mục playwright */ }
  return null;
}

const ARGS = ['--headless=new', '--remote-debugging-port=0', '--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--mute-audio', '--window-size=1920,1080',
  '--force-device-scale-factor=1', '--disable-dev-shm-usage', '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-background-networking',
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--font-render-hinting=none',
  // sân khấu không được ra mạng (spec §8.1): mọi request đi qua proxy chết, chỉ loopback (cổng CDP) được bỏ qua
  '--proxy-server=127.0.0.1:9', '--proxy-bypass-list=<-loopback>'];

// Chromium KHÔNG tự chết khi tiến trình Node thoát (đã thử: node thoát ⇒ chrome còn sống, cha = 1). Mọi tiến trình đã mở còn sống bị SIGKILL ở 'exit'
// (vd Chromium "ấm" của still.js có hẹn giờ unref, tiến trình test/CLI thoát trước khi hết 60 s) — không để Chromium mồ côi ăn CPU của lần chạy sau.
const LIVE = new Set();
process.on('exit', () => { for (const p of LIVE) { try { p.kill('SIGKILL'); } catch (e) { /* đã thoát */ } } });

// Chạy Chromium; URL WebSocket lấy từ stderr dòng "DevTools listening on ws://…".
function launch(opts) {
  const bin = find(opts && opts.path);
  if (!bin) return Promise.reject(Object.assign(new Error('Không tìm thấy Chromium (đặt CHROMIUM_PATH hoặc cài chromium).'), { code: 'chromium_missing' }));
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-chromium-'));
  const args = ARGS.concat(['--user-data-dir=' + dataDir], (opts && opts.args) || []);
  const niceN = opts && Number.isInteger(opts.nice) && opts.nice > 0 && which('nice');
  const proc = niceN ? spawn('nice', ['-n', String(opts.nice), bin].concat(args), { stdio: ['ignore', 'ignore', 'pipe'] }) : spawn(bin, args, { stdio: ['ignore', 'ignore', 'pipe'] });
  LIVE.add(proc); proc.once('exit', () => LIVE.delete(proc));
  let tail = '';
  const close = () => new Promise(res => {
    const done = () => { try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch (e) { /* tạm */ } res(); };
    if (proc.exitCode !== null || proc.signalCode !== null) return done();   // đã thoát (kể cả bị SIGKILL: exitCode null, signalCode đặt) ⇒ 'exit' không phát lại, đừng chờ
    proc.once('exit', done); proc.kill('SIGKILL');
  });
  return new Promise((resolve, reject) => {
    const startMs = Number(process.env.GS_CHROMIUM_START_MS) || 20000;   // máy chậm/quá tải (Docker Desktop, CI) cần chờ lâu hơn
    const timer = setTimeout(() => { close(); reject(new Error('Chromium không báo cổng DevTools sau ' + Math.round(startMs / 1000) + ' s. stderr: ' + tail.slice(-300))); }, startMs);
    proc.stderr.on('data', d => {
      tail = (tail + d).slice(-2000);
      const m = /DevTools listening on (ws:\/\/\S+)/.exec(tail);
      if (m) { clearTimeout(timer); proc.stderr.removeAllListeners('data'); proc.stderr.resume(); resolve({ wsUrl: m[1], close, pid: proc.pid, bin }); }
    });
    proc.once('error', e => { clearTimeout(timer); reject(e); });
    proc.once('exit', code => { clearTimeout(timer); reject(new Error('Chromium thoát sớm (mã ' + code + '). stderr: ' + tail.slice(-300))); });
  });
}

module.exports = { find, launch, ARGS, live: () => LIVE.size };
