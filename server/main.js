// © 2026 Gen Labs — All rights reserved.
// Điểm vào máy chủ: config → DB → (seed demo) → HTTP → pipeline workers → scheduler.  `--reset-password`: đặt lại mật khẩu owner rồi thoát.
'use strict';
const path = require('node:path');
const configMod = require('./config.js');
const dbm = require('./db.js');
const eventsMod = require('./events.js');
const { createWriter } = require('./write.js');
const auth = require('./auth.js');
const pipeline = require('./pipeline.js');
const scheduler = require('./scheduler.js');
const { createMcp } = require('./mcp.js');
const httpMod = require('./http.js');

function blockValidator() {
  let reg = null;
  try { reg = require('../render/blocks/registry.js'); } catch { reg = null; }
  if (!reg) return undefined; // gói C chưa có: write() dùng kiểm mặc định
  return (name, params, kind) => { const r = reg.validate(name, params, kind); const d = reg.get && reg.get(name); return { ok: r.ok, errors: r.errors, version: d ? d.version : 1 }; };
}

// boot({env?, config?, seed?, workers?, scheduler?, deps?, pipeline?}) → {ctx, port, close()} — dùng cho main và test.
async function boot(opts = {}) {
  const config = Object.assign(configMod.load({ env: opts.env ? Object.assign({}, process.env, opts.env) : undefined }), opts.config || {});
  const db = dbm.open(config.dataDir, { masterKey: config.masterKey });
  const events = eventsMod.create();
  const write = createWriter(db, { events, validateBlock: blockValidator() });
  const ctx = { config, db, events, write, pipeline, deps: opts.deps || {} };
  ctx.mcp = createMcp(ctx);
  if (opts.seed !== undefined ? opts.seed : config.seedDemo) require('./seed.js').seedDemo(db);
  const key = auth.ensureAdminKey(config.dataDir, db);
  const server = await httpMod.start(ctx);
  ctx.port = server.port;
  const base = config.publicUrl || `http://localhost:${config.hostPort || server.port}`;
  eventsMod.log(`Gen-Studio ${config.version} nghe tại ${config.host}:${server.port}`);
  if (key) eventsMod.log(`Thiết lập lần đầu (link dùng một lần, 30 phút): ${base}/?k=${key}`);
  const workers = opts.workers === false ? null : pipeline.startWorkers(ctx, opts.pipeline || {});
  const sched = opts.scheduler === false ? null : scheduler.start(ctx, opts.schedulerOpts || {});
  ctx.workers = workers; ctx.scheduler = sched;
  return {
    ctx, port: server.port, url: `http://127.0.0.1:${server.port}`,
    async close() { if (sched) sched.stop(); if (workers) workers.stop(); await server.close(); db.close(); },
  };
}

// `genstudio token create` → node server/main.js --create-token <tên> [--scopes read,compose,run]: cấp token tay (nâng cao), in một lần. CLI cấp được token nhưng không bao giờ duyệt được yêu cầu quyền.
function createToken(argv) {
  const i = argv.indexOf('--create-token');
  const name = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : 'Agent token tay';
  const si = argv.indexOf('--scopes');
  const scopes = si >= 0 && argv[si + 1] ? argv[si + 1].split(',').map(x => x.trim()).filter(Boolean) : ['read', 'compose'];
  const config = configMod.load();
  const db = dbm.open(config.dataDir, { masterKey: config.masterKey });
  try {
    const write = createWriter(db, { events: eventsMod.create() });
    const r = write({ type: 'cli', entry: 'cli' }, 'agent.create', { name, scopes, kind: 'token' });
    console.log(`Agent ${r.agent.display_id} · phạm vi ${scopes.join(', ')}`);
    console.log(`Token (chỉ hiện một lần): ${r.token}`);
  } finally { db.close(); }
}

async function main() {
  if (process.argv.includes('--create-token')) { createToken(process.argv); return; }
  if (process.argv.includes('--reset-password')) {
    const config = configMod.load();
    const db = dbm.open(config.dataDir, { masterKey: config.masterKey });
    try {
      const r = auth.resetOwnerPassword(db);
      console.log(`Mật khẩu mới cho "${r.username}": ${r.password}`);
      console.log('Hãy đăng nhập rồi đổi lại khi cần. Mọi phiên đăng nhập cũ đã bị đóng.');
    } finally { db.close(); }
    return;
  }
  const app = await boot();
  const stop = async () => { await app.close(); process.exit(0); };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}

if (require.main === module) main().catch(e => { eventsMod.logError('khởi động thất bại', e); process.exit(1); });
module.exports = { boot, main };
