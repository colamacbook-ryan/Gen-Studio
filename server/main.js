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
  if (config.kolPack) require('../render/cast/kol-pack.js').bootstrap(ctx);   // GS_KOL_PACK: nạp + kiểm pack, seed `candidate` (không phụ thuộc seed demo); pack sai ⇒ máy chủ không lên
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

// 0.3.0-B: "30d" | "12h" → ms kể từ bây giờ. Sai cú pháp ⇒ null (không đặt hạn, báo lỗi rõ ở gọi).
function parseExpiresIn(s) {
  const m = /^(\d+)(d|h)$/.exec(String(s || '').trim());
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return n * (m[2] === 'd' ? 86400e3 : 3600e3);
}

// `genstudio token create` → node server/main.js --create-token <tên> [--scopes read,compose,run] [--expires 30d]: cấp token tay (nâng cao), in một lần. CLI cấp được token nhưng không bao giờ duyệt được yêu cầu quyền.
function createToken(argv) {
  const i = argv.indexOf('--create-token');
  const name = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : 'Agent token tay';
  const si = argv.indexOf('--scopes');
  const scopes = si >= 0 && argv[si + 1] ? argv[si + 1].split(',').map(x => x.trim()).filter(Boolean) : ['read', 'compose'];
  const ei = argv.indexOf('--expires');
  let tokenExpiresAt = null;
  if (ei >= 0 && argv[ei + 1]) {
    const ms = parseExpiresIn(argv[ei + 1]);
    if (ms === null) { console.error(`✗ --expires sai cú pháp (vd 30d, 12h): "${argv[ei + 1]}"`); process.exitCode = 2; return; }
    tokenExpiresAt = new Date(Date.now() + ms).toISOString();
  }
  const config = configMod.load();
  const db = dbm.open(config.dataDir, { masterKey: config.masterKey });
  try {
    const write = createWriter(db, { events: eventsMod.create() });
    const r = write({ type: 'cli', entry: 'cli' }, 'agent.create', { name, scopes, kind: 'token', token_expires_at: tokenExpiresAt });
    console.log(`Agent ${r.agent.display_id} · phạm vi ${scopes.join(', ')}${tokenExpiresAt ? ' · hết hạn ' + tokenExpiresAt : ' · không hết hạn'}`);
    console.log(`Token id (dùng cho \`token revoke\`): ${r.token_id}`);
    console.log(`Token (chỉ hiện một lần): ${r.token}`);
  } finally { db.close(); }
}

// `genstudio token revoke <id>` → node server/main.js --revoke-token <id>: thu hồi một token tay (id in lúc token create).
function revokeToken(argv) {
  const i = argv.indexOf('--revoke-token');
  const id = argv[i + 1];
  if (!id) { console.error('✗ Dùng: genstudio token revoke <id>'); process.exitCode = 2; return; }
  const config = configMod.load();
  const db = dbm.open(config.dataDir, { masterKey: config.masterKey });
  try {
    const write = createWriter(db, { events: eventsMod.create() });
    const r = write({ type: 'cli', entry: 'cli' }, 'agent_token.revoke', { token: id });
    console.log(`✓ Đã thu hồi token ${r.token_id} (agent ${r.agent}).`);
  } finally { db.close(); }
}

// `genstudio token list` → node server/main.js --list-tokens: liệt kê token tay (gst_…, không in lại chuỗi token thật).
function listTokens() {
  const config = configMod.load();
  const db = dbm.open(config.dataDir, { masterKey: config.masterKey });
  try {
    const rows = db.all(`SELECT t.id, t.prefix, t.kind, t.expires_at, t.revoked_at, t.created_at, ag.display_id AS agent, ag.name, ag.scopes
      FROM agent_tokens t JOIN agents ag ON ag.id = t.agent_id WHERE t.kind='static' ORDER BY t.created_at DESC`);
    if (!rows.length) { console.log('Chưa có token tay nào.'); return; }
    for (const r of rows) {
      let scopes = []; try { scopes = JSON.parse(r.scopes); } catch { /* bỏ qua */ }
      const status = r.revoked_at ? `đã thu hồi ${r.revoked_at}` : (r.expires_at && r.expires_at < new Date().toISOString()) ? `hết hạn ${r.expires_at}` : (r.expires_at ? `hết hạn ${r.expires_at}` : 'không hết hạn');
      console.log(`${r.id}  ${r.prefix}…  ${r.agent} "${r.name}"  [${scopes.join(', ')}]  ${status}`);
    }
  } finally { db.close(); }
}

async function main() {
  if (process.argv.includes('--create-token')) { createToken(process.argv); return; }
  if (process.argv.includes('--revoke-token')) { revokeToken(process.argv); return; }
  if (process.argv.includes('--list-tokens')) { listTokens(); return; }
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
