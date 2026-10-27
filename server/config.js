// © 2026 Gen Labs — All rights reserved.
// Nạp cấu hình từ môi trường + DATA_DIR/.env (tự sinh lần đầu).
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function parseEnv(text) {
  const out = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i < 1) continue;
    let v = line.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[line.slice(0, i).trim()] = v;
  }
  return out;
}

const truthy = (v) => v === '1' || v === 'true' || v === 'yes';

function readVersion() {
  try { return fs.readFileSync(path.join(__dirname, '..', 'VERSION'), 'utf8').trim(); } catch { return '0.0.0'; }
}

// load({env?, dataDir?}) → cấu hình. Không sửa process.env.
function load(opts = {}) {
  const env = opts.env || process.env;
  const dataDir = path.resolve(opts.dataDir || env.DATA_DIR || './data');
  for (const d of ['', 'media', 'exports', 'backups', 'run']) fs.mkdirSync(path.join(dataDir, d), { recursive: true });

  const envFile = path.join(dataDir, '.env');
  let file = {};
  if (fs.existsSync(envFile)) file = parseEnv(fs.readFileSync(envFile, 'utf8'));
  const get = (k) => (env[k] !== undefined && env[k] !== '' ? env[k] : file[k]);

  const add = [];
  if (!get('GS_MASTER_KEY')) { const k = crypto.randomBytes(32).toString('hex'); file.GS_MASTER_KEY = k; add.push(`GS_MASTER_KEY=${k}`); }
  if (!get('GS_PORT')) { file.GS_PORT = '7490'; add.push('GS_PORT=7490'); }
  if (add.length) {
    const head = fs.existsSync(envFile) ? '' : '# Gen-Studio — tự sinh lần đầu. KHÔNG commit file này.\n';
    fs.appendFileSync(envFile, head + add.join('\n') + '\n', { mode: 0o600 });
    try { fs.chmodSync(envFile, 0o600); } catch { /* hệ tệp không hỗ trợ chmod */ }
  }

  const masterKey = get('GS_MASTER_KEY');
  if (!/^[0-9a-fA-F]{64}$/.test(masterKey)) {
    throw new Error('GS_MASTER_KEY phải là chuỗi hex 64 ký tự (32 byte).');
  }
  const port = parseInt(get('GS_PORT'), 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('GS_PORT không hợp lệ.');

  return {
    dataDir,
    port,
    host: get('GS_HOST') || '127.0.0.1',
    masterKey,
    fakeProviders: truthy(get('GS_FAKE_PROVIDERS')),
    seedDemo: truthy(get('GS_SEED_DEMO')),
    chromiumPath: get('GS_CHROMIUM_PATH') || get('CHROMIUM_PATH') || null,
    ffmpegPath: get('GS_FFMPEG_PATH') || get('FFMPEG_PATH') || 'ffmpeg',
    lang: ['vi', 'en'].includes(get('GS_LANG')) ? get('GS_LANG') : 'vi',
    publicUrl: get('GS_PUBLIC_URL') || null,
    version: readVersion(),
  };
}

module.exports = { load, parseEnv };
