#!/usr/bin/env node
// © 2026 Gen Labs — All rights reserved.
// Agent runner (container riêng): mỗi 60 s hỏi MCP get_next_task; có việc thì đánh thức CLI agent (Claude Code) làm CHỈ qua MCP.
// Chỉ dùng GS_MCP_URL (+ GS_AGENT_TOKEN tay, tuỳ chọn). Không có token: tự ghép thiết bị (xin mã → chủ xưởng Duyệt trên giao diện) rồi lưu
// access + refresh token vào GS_AGENT_STATE/token.json (mode 0600) và tự refresh. KHÔNG đọc dữ liệu của studio, KHÔNG require file nào của server/.
'use strict';
const http = require('node:http');
const https = require('node:https');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const mask = s => String(s == null ? '' : s).replace(/gs[tardcp]?_[A-Za-z0-9_-]{8,}/g, 'gs_***').replace(/Bearer\s+\S+/g, 'Bearer ***');
const log = (...a) => console.log('[runner]', mask(a.join(' ')));
const sleep = ms => new Promise(r => setTimeout(r, ms));

const DEVICE_GRANT = 'urn:ietf:params:oauth:grant-type:device_code';

// POST form tới endpoint OAuth → {status, json}
function postForm(urlStr, params, extra) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const data = Buffer.from(new URLSearchParams(params).toString());
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.request({ host: u.hostname, port: u.port || (u.protocol === 'https:' ? 443 : 80), path: u.pathname, method: 'POST', timeout: 30000,
      headers: Object.assign({ 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json', 'Content-Length': data.length }, extra) }, res => {
      const ch = []; res.on('data', c => ch.push(c));
      res.on('end', () => { let json = null; try { json = JSON.parse(Buffer.concat(ch).toString('utf8')); } catch { /* không phải JSON */ } resolve({ status: res.statusCode, json: json || {} }); });
    });
    req.on('timeout', () => req.destroy(new Error('quá thời gian')));
    req.on('error', reject);
    req.end(data);
  });
}

// GET JSON (trạng thái ghép công khai)
function getJson(urlStr, headers) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.request({ host: u.hostname, port: u.port || (u.protocol === 'https:' ? 443 : 80), path: u.pathname + u.search, method: 'GET', timeout: 15000, headers: Object.assign({ Accept: 'application/json' }, headers) }, res => {
      const ch = []; res.on('data', c => ch.push(c));
      res.on('end', () => { let json = null; try { json = JSON.parse(Buffer.concat(ch).toString('utf8')); } catch { /* không phải JSON */ } if (res.statusCode !== 200 || !json) return reject(new Error('HTTP ' + res.statusCode)); resolve(json); });
    });
    req.on('timeout', () => req.destroy(new Error('quá thời gian')));
    req.on('error', reject);
    req.end();
  });
}

// Quyền MCP của runner: ghép thiết bị (RFC 8628) CHỈ khi chủ xưởng mở cửa sổ ghép → token lưu trong volume riêng của runner → tự refresh (một lần tại một thời điểm).
// Trạng thái: unpaired (chưa có quyền / chờ chủ xưởng) · waiting (đã xin mã, chờ Duyệt) · paired · error. Runner báo trạng thái qua /oauth/pairing-status.
class TokenAuth {
  constructor({ base, stateDir, clientName, scope, pollMs, statusMs, hostHeader, pairingSecret, isStopped }) {
    this.base = base; this.file = stateDir ? path.join(stateDir, 'token.json') : null; this.clientName = clientName || 'Agent nội bộ';
    this.scope = scope || 'read compose run'; this.pollMs = pollMs || 0; this.statusMs = statusMs || pollMs || 10000;
    this.headers = hostHeader ? { Host: hostHeader } : {};
    // bí mật ghép: gửi CHỈ tới /oauth/device và /oauth/pairing-status (chứng minh runner thật khi chủ xưởng mở cửa sổ ghép); không bao giờ log, không gửi tới /mcp hay token
    this.pairHeaders = Object.assign({}, this.headers, pairingSecret ? { 'X-GS-Pairing': pairingSecret } : {});
    this.isStopped = isStopped || (() => false);
    this.tok = null; this.loaded = false; this.pending = null; this.state = 'unpaired'; this.code = ''; this.lastBeat = 0;
    if (!this.file) log('GS_AGENT_STATE chưa đặt: token chỉ giữ trong bộ nhớ, khởi động lại sẽ phải ghép lại.');
  }
  load() {
    this.loaded = true;
    if (!this.file) return null;
    try { const t = JSON.parse(fs.readFileSync(this.file, 'utf8')); if (t.base === this.base && t.access_token && t.refresh_token && t.client_id) return t; } catch { /* chưa có hoặc hỏng → ghép lại */ }
    return null;
  }
  save(r, clientId) {
    this.tok = { base: this.base, client_id: clientId, access_token: r.access_token, refresh_token: r.refresh_token, expires_at: Date.now() + Number(r.expires_in || 3600) * 1000 };
    if (!this.file) return;
    fs.mkdirSync(path.dirname(this.file), { recursive: true, mode: 0o700 });
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.tok), { mode: 0o600 });
    fs.renameSync(tmp, this.file);   // ghi nguyên tử: mất điện giữa chừng không để lại refresh token đã xoay mà chưa lưu
  }
  clear() { this.tok = null; if (this.file) { try { fs.unlinkSync(this.file); } catch { /* chưa có */ } } }
  // state ∈ unpaired|waiting_window|requested|paired|error; code = mã ngắn (revoked, denied, expired, no_owner, studio_unreachable, request_failed, cli_missing) để giao diện tự dịch
  setState(state, code) { this.state = state; this.code = code || ''; }
  // báo trạng thái cho studio (kênh nội bộ) và nhận {owner_exists, window_open}
  status() {
    const q = '?runner=' + encodeURIComponent(this.state) + '&code=' + encodeURIComponent(this.code);
    return getJson(this.base + '/oauth/pairing-status' + q, this.pairHeaders);
  }
  // nhịp sống khi đã ghép (tối đa mỗi 60 s), không để lỗi mạng làm hỏng việc chính
  beat() { if (Date.now() - this.lastBeat < 60000) return; this.lastBeat = Date.now(); this.status().catch(() => {}); }
  // access token còn hạn ít nhất minValidMs (mặc định 60 s); chưa có token thì chờ cửa sổ ghép
  async get(minValidMs = 60000) {
    if (!this.loaded) { this.tok = this.load(); if (this.tok) this.setState('paired'); }
    if (!this.tok) await this.pair();
    if (this.tok.expires_at - Date.now() < minValidMs) await this.refresh();
    return this.tok.access_token;
  }
  refresh() { return (this.pending = this.pending || this._refresh().finally(() => { this.pending = null; })); }   // single-flight: refresh song song sẽ bị coi là dùng lại token cũ
  async _refresh() {
    if (!this.tok) return this.pair();
    const r = await postForm(this.base + '/oauth/token', { grant_type: 'refresh_token', refresh_token: this.tok.refresh_token, client_id: this.tok.client_id }, this.headers);
    if (r.status === 200) return this.save(r.json, this.tok.client_id);
    if (r.json.error === 'invalid_grant') {
      // bị thu hồi ("Tắt agent nội bộ") hoặc token hết hạn: về unpaired, KHÔNG tự xin lại cho tới khi chủ xưởng mở cửa sổ ghép
      log('quyền đã bị thu hồi hoặc hết hạn — chờ chủ xưởng mở ghép.'); this.clear(); this.setState('unpaired', 'revoked'); return this.pair();
    }
    throw new Error('refresh token lỗi (HTTP ' + r.status + (r.json.error ? ' ' + r.json.error : '') + ')');
  }
  async pair() {
    let every = this.statusMs, denied = false, noted = '';
    const note = (m) => { if (noted !== m) { noted = m; log(m); } };
    for (;;) {
      if (this.isStopped()) throw new Error('đã dừng');
      let st;
      try { st = await this.status(); every = this.statusMs; }
      catch (e) { this.setState('error', 'studio_unreachable'); note('không gọi được studio: ' + e.message); every = Math.min(every * 2, 60000); await sleep(every); continue; }   // lùi dần khi lỗi
      if (!st.owner_exists) { this.setState('unpaired', 'no_owner'); note('chờ chủ xưởng thiết lập xưởng.'); await sleep(every); continue; }
      if (!st.window_open) { denied = false; if (this.code !== 'denied' && this.code !== 'expired' && this.code !== 'revoked') this.setState('waiting_window', ''); else this.setState('waiting_window', this.code); note('chờ chủ xưởng bấm "Bật agent nội bộ" / "Mở lại ghép" trên giao diện.'); await sleep(every); continue; }
      if (denied) { await sleep(every); continue; }   // đã bị từ chối trong cửa sổ này: đợi cửa sổ đóng rồi mở lại mới xin tiếp
      const d = await postForm(this.base + '/oauth/device', { client_name: this.clientName, scope: this.scope }, this.pairHeaders);
      if (d.status !== 200) { if (d.json.error === 'pairing_closed') { await sleep(every); continue; } this.setState('error', 'request_failed'); await sleep(every); continue; }
      this.setState('requested', ''); noted = ''; this.status().catch(() => {});   // báo ngay để giao diện thấy 'requested'
      log(`Mã ghép: ${d.json.user_code} — chờ chủ xưởng Duyệt trên giao diện (Agent & MCP › Chờ duyệt).`);
      let wait = this.pollMs || Math.max(1, Number(d.json.interval) || 5) * 1000;
      const deadline = Date.now() + Number(d.json.expires_in || 900) * 1000;
      while (Date.now() < deadline) {
        await sleep(wait);
        if (this.isStopped()) throw new Error('đã dừng');
        const r = await postForm(this.base + '/oauth/token', { grant_type: DEVICE_GRANT, device_code: d.json.device_code, client_id: d.json.client_id }, this.headers);
        if (r.status === 200) { this.save(r.json, d.json.client_id); this.setState('paired'); this.lastBeat = 0; log('đã được duyệt — đã lưu token.'); return; }
        const e = r.json.error;
        if (e === 'authorization_pending') continue;
        if (e === 'slow_down') { wait += this.pollMs || 5000; continue; }
        if (e === 'access_denied') { log('chủ xưởng đã từ chối yêu cầu ghép.'); denied = true; this.setState('waiting_window', 'denied'); break; }
        if (e === 'expired_token') { log('mã ghép đã hết hạn.'); this.setState('waiting_window', 'expired'); break; }
        throw new Error('ghép thiết bị lỗi: ' + (e || 'HTTP ' + r.status));
      }
    }
  }
}

// Máy khách MCP tối thiểu (JSON-RPC 2.0 qua POST). `auth` là chuỗi token tay hoặc TokenAuth (tự refresh, gặp 401 thì refresh rồi thử lại một lần).
class McpClient {
  constructor(url, auth, extraHeaders) { this.url = new URL(url); this.auth = auth; this.extra = extraHeaders || {}; this.id = 0; this.ready = false; }
  bearer() { return typeof this.auth === 'string' ? this.auth : this.auth.get(); }
  async post(body) {
    try { return await this.send(body, await this.bearer()); }
    catch (e) {
      if (e.status !== 401 || typeof this.auth === 'string') throw e;
      await this.auth.refresh();
      return this.send(body, await this.bearer());
    }
  }
  send(body, token) {
    return new Promise((resolve, reject) => {
      const data = Buffer.from(JSON.stringify(body));
      const lib = this.url.protocol === 'https:' ? https : http;
      const req = lib.request({ host: this.url.hostname, port: this.url.port || (this.url.protocol === 'https:' ? 443 : 80), path: this.url.pathname, method: 'POST', timeout: 120000,
        headers: Object.assign({ 'Content-Type': 'application/json', Accept: 'application/json', 'Content-Length': data.length, Authorization: 'Bearer ' + token }, this.extra) }, res => {
        const ch = []; res.on('data', c => ch.push(c));
        res.on('end', () => {
          const s = Buffer.concat(ch).toString('utf8');
          if (res.statusCode === 202) return resolve(null);
          let j; try { j = JSON.parse(s); } catch { return reject(new Error('MCP trả dữ liệu không phải JSON (HTTP ' + res.statusCode + ')')); }
          if (res.statusCode >= 400 && !j.jsonrpc) return reject(Object.assign(new Error('MCP HTTP ' + res.statusCode + ': ' + ((j.error && j.error.text_human) || s.slice(0, 200))), { status: res.statusCode }));
          resolve(j);
        });
      });
      req.on('timeout', () => req.destroy(new Error('MCP quá thời gian')));
      req.on('error', reject);
      req.end(data);
    });
  }
  async rpc(method, params) {
    const r = await this.post({ jsonrpc: '2.0', id: ++this.id, method, params });
    if (r && r.error) throw new Error('MCP ' + method + ': ' + r.error.message);
    return r && r.result;
  }
  async init() {
    if (this.ready) return;
    await this.rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'gen-studio-runner', version: '1' } });
    await this.post({ jsonrpc: '2.0', method: 'notifications/initialized' });
    this.ready = true;
  }
  // Gọi tool → {isError, text, data}
  async call(name, args) {
    await this.init();
    const r = await this.rpc('tools/call', { name, arguments: args || {} });
    return { isError: !!r.isError, text: ((r.content || [])[0] || {}).text || '', data: r.structuredContent };
  }
}

// Prompt ghép từ agent/prompt/*.md (theo tên file; SPEC-0.2.0 §13.2): 00-base.md là khung việc, các file sau (gói T: thumbnail.md, gói U: tutorial.md…) nối tiếp.
// Đoạn = khối cách nhau dòng trống; {{task}} {{brief}} {{notes}} {{blocked}} {{work_order}} {{kind}} được thay, đoạn rỗng sau khi thay thì bỏ. Thư mục nằm TRONG agent/ nên image agent (COPY agent/) mang theo.
const PROMPT_DIR = path.join(__dirname, 'prompt');
function promptVars(task) {
  const notes = (task.review_notes || []).length ? 'Ghi chú duyệt cần xử lý:\n' + task.review_notes.map(n => `- ${n.pin_ref}: ${n.text}`).join('\n') : '';
  return { work_order: task.work_order, kind: task.kind,
    task: `Việc cần làm: Work order ${task.work_order} (${task.kind}).`,
    brief: task.brief ? 'Lời giao việc:\n' + task.brief : '', notes,
    blocked: task.blocked ? 'Bản dựng bị chặn: ' + JSON.stringify(task.blocked.reason) : '' };
}
function buildPrompt(task, dir = PROMPT_DIR) {
  const vars = promptVars(task);
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.md')).sort();
  const paras = files.flatMap(f => fs.readFileSync(path.join(dir, f), 'utf8').split(/\n{2,}/));
  return paras.map(p => p.trim().replace(/\{\{(\w+)\}\}/g, (m, k) => (vars[k] === undefined ? m : String(vars[k])))).filter(p => p.trim()).join('\n\n');
}

// CNS-068: Claude CLI con KHÔNG được đọc refresh token của runner. Runner chạy root trong container (cap_drop ALL + SETUID/SETGID/CHOWN), token.json là của root 0600;
// CLI con chạy uid khác (GS_CLI_UID/GS_CLI_GID) và chỉ nhận access token qua mcp.json tạm của uid đó. Thuần để test được.
function cliSpawnOptions(env, getuid) {
  const uid = Number(env.GS_CLI_UID), gid = Number(env.GS_CLI_GID || env.GS_CLI_UID);
  const drop = !!(getuid && getuid() === 0 && Number.isInteger(uid) && uid > 0 && Number.isInteger(gid) && gid > 0);
  const childEnv = {};
  for (const [k, v] of Object.entries(env)) if (!k.startsWith('GS_')) childEnv[k] = v;   // không chuyển biến của runner (GS_*) sang CLI
  if (drop) childEnv.HOME = env.GS_CLI_HOME || '/home/node';
  return { drop, uid: drop ? uid : undefined, gid: drop ? gid : undefined, env: childEnv };
}
// access token phải còn sống suốt lần chạy CLI + 5 phút dự phòng, nếu không refresh trước khi spawn
const CLI_MARGIN_MS = 5 * 60000;
const needsRefreshBeforeSpawn = (expiresAtMs, nowMs, cliTimeoutMs) => expiresAtMs - nowMs < cliTimeoutMs + CLI_MARGIN_MS;

function createRunner(opts = {}) {
  const url = opts.url || process.env.GS_MCP_URL, token = opts.token || '';   // token tay chỉ cho thử nghiệm: runner thật luôn ghép thiết bị (không đọc token từ môi trường)
  if (!url) throw new Error('Thiếu GS_MCP_URL.');
  let stopped = false;
  // không có token tay → tự ghép thiết bị
  const tokenAuth = token ? null : (opts.tokenAuth || new TokenAuth({ base: new URL(url).origin, stateDir: opts.stateDir || process.env.GS_AGENT_STATE, clientName: opts.clientName || process.env.GS_AGENT_NAME, pollMs: opts.pollMs, statusMs: opts.statusMs || Number(process.env.GS_RUNNER_STATUS_MS) || 0, hostHeader: opts.hostHeader, pairingSecret: opts.pairingSecret || process.env.GS_PAIRING_SECRET, isStopped: () => stopped }));
  const client = opts.client || new McpClient(url, token || tokenAuth, opts.hostHeader ? { Host: opts.hostHeader } : {});
  const fake = opts.fake !== undefined ? opts.fake : process.env.GS_FAKE_AGENT === '1';
  const intervalMs = opts.intervalMs || Number(process.env.GS_RUNNER_INTERVAL_MS) || 60000;
  const cliTimeoutMs = opts.cliTimeoutMs || 30 * 60000;
  const spawnFn = opts.spawn || spawn;
  let timer = null, busy = false;

  // Chạy CLI agent (Claude Code) cho một việc; gửi nhịp sống mỗi 60 s.
  async function runCli(task) {
    const cfgDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-agent-'));
    const cfg = path.join(cfgDir, 'mcp.json');
    const bearer = tokenAuth ? await tokenAuth.get(cliTimeoutMs + CLI_MARGIN_MS) : token;   // refresh trước khi spawn nếu access sắp hết hạn
    fs.writeFileSync(cfg, JSON.stringify({ mcpServers: { 'gen-studio': { type: 'http', url, headers: { Authorization: 'Bearer ' + bearer } } } }), { mode: 0o600 });
    const so = cliSpawnOptions(process.env, process.getuid && process.getuid.bind(process));
    if (so.drop) { fs.chownSync(cfgDir, so.uid, so.gid); fs.chmodSync(cfgDir, 0o700); fs.chownSync(cfg, so.uid, so.gid); }   // chỉ uid của CLI đọc được mcp.json (chỉ có access token)
    let hb;
    try {
      const child = spawnFn('claude', ['-p', buildPrompt(task), '--mcp-config', cfg, '--output-format', 'json', '--allowedTools', 'mcp__gen-studio__*'], Object.assign({ stdio: ['ignore', 'pipe', 'pipe'], env: so.env }, so.drop ? { uid: so.uid, gid: so.gid } : {}));
      let err = '', out = '';
      child.stdout && child.stdout.on('data', d => { out += d; if (out.length > 200000) out = out.slice(-100000); });
      child.stderr && child.stderr.on('data', d => { err += d; if (err.length > 20000) err = err.slice(-10000); });
      hb = setInterval(() => { client.call('report_problem', { work_order: task.work_order, code: 'heartbeat' }).catch(e => log('heartbeat lỗi:', e.message)); }, 60000);
      const kill = setTimeout(() => { try { child.kill('SIGTERM'); } catch { /* đã thoát */ } }, cliTimeoutMs);
      const code = await new Promise(resolve => {
        child.on('error', e => resolve(e.code === 'ENOENT' ? 'ENOENT' : 'ERR:' + e.message));
        child.on('close', c => resolve(c));
      });
      clearTimeout(kill);
      if (code === 'ENOENT') { await client.call('report_problem', { work_order: task.work_order, code: 'cli_missing', text: 'Không tìm thấy Claude Code CLI (lệnh "claude") trong container agent.' }); if (tokenAuth) { tokenAuth.setState('error', 'cli_missing'); tokenAuth.lastBeat = 0; } return 'cli_missing'; }
      if (code !== 0) { await client.call('report_problem', { work_order: task.work_order, code: 'cli_failed', text: mask('CLI thoát với mã ' + code + ': ' + err.slice(-800)) }); return 'cli_failed'; }
      const t = await client.call('get_task', { work_order: task.work_order });
      if (t.data && t.data.task && t.data.task.state !== 'fulfilled') {
        await client.call('report_problem', { work_order: task.work_order, code: 'not_completed', text: 'CLI đã chạy xong nhưng lệnh chưa hoàn tất.' });
        return 'not_completed';
      }
      if (tokenAuth && tokenAuth.state === 'error') tokenAuth.setState('paired');
      return 'done';
    } finally { clearInterval(hb); fs.rmSync(cfgDir, { recursive: true, force: true }); }
  }

  // Một nhịp: hỏi việc, có thì làm. Trả 'idle' | kết quả xử lý.
  async function tick() {
    if (busy) return 'busy';
    busy = true;
    try {
      const r = await client.call('get_next_task', {});
      if (tokenAuth) tokenAuth.beat();   // nhịp sống: studio hiện trạng thái runner
      if (r.isError) { log('get_next_task lỗi:', r.text); return 'error'; }
      const task = r.data && r.data.task;
      if (!task) return 'idle';
      log('nhận việc', task.work_order, task.kind);
      if (fake) return await require('./fake-agent.js').handleTask(client, task);
      return await runCli(task);
    } catch (e) { log('tick lỗi:', e.message); return 'error'; }
    finally { busy = false; }
  }
  function start() {
    const loop = async () => { if (stopped) return; await tick(); if (!stopped) timer = setTimeout(loop, intervalMs); };
    loop();
  }
  function stop() { stopped = true; clearTimeout(timer); }
  return { tick, start, stop, client, auth: tokenAuth };
}

if (require.main === module) {
  try { const r = createRunner(); log('chạy, hỏi việc mỗi', (Number(process.env.GS_RUNNER_INTERVAL_MS) || 60000) / 1000, 's', r.auth ? '(quyền MCP: ghép thiết bị)' : '(quyền MCP: token tay)'); r.start(); }
  catch (e) { console.error('[runner]', e.message); process.exit(2); }
}
module.exports = { createRunner, McpClient, TokenAuth, buildPrompt, cliSpawnOptions, needsRefreshBeforeSpawn };
