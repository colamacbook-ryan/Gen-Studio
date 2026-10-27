// © 2026 Gen Labs — All rights reserved.
// Gói D: agent runner — chỉ dùng MCP (không require server/, không đọc DATA_DIR), cli_missing, nhận việc → gọi CLI.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { EventEmitter } = require('node:events');
const { createRunner, buildPrompt, cliSpawnOptions, needsRefreshBeforeSpawn } = require('../agent/runner.js');

test('d-runner: không đụng store — không require server/, không nhắc DATA_DIR/studio.db', () => {
  for (const f of ['runner.js', 'fake-agent.js']) {
    const src = fs.readFileSync(path.join(__dirname, '..', 'agent', f), 'utf8');
    assert.ok(!/require\(['"]\.\.\/server/.test(src), f + ' không được require server/');
    assert.ok(!/DATA_DIR|studio\.db|GS_MASTER_KEY/.test(src.replace(/^\/\/.*$/gm, '')), f + ' không được đụng DATA_DIR/studio.db/khoá');
  }
});

function stubServer(task) {
  const calls = []; let given = false;
  const srv = http.createServer((req, res) => {
    const ch = []; req.on('data', c => ch.push(c));
    req.on('end', () => {
      const m = JSON.parse(Buffer.concat(ch)); calls.push({ m, auth: req.headers.authorization });
      if (m.id === undefined) { res.writeHead(202); return res.end(); }
      let result = {};
      if (m.method === 'tools/call') {
        const n = m.params.name;
        let data = {};
        if (n === 'get_next_task') { data = { task: given ? null : task }; given = true; }
        if (n === 'get_task') data = { task: Object.assign({}, task, { state: 'assigned' }) };
        result = { content: [{ type: 'text', text: 'ok' }], structuredContent: data };
      }
      res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ jsonrpc: '2.0', id: m.id, result }));
    });
  });
  return new Promise(r => srv.listen(0, '127.0.0.1', () => r({ srv, calls, url: 'http://127.0.0.1:' + srv.address().port + '/mcp' })));
}
const TASK = { work_order: 'WO-0001', kind: 'new_lesson', brief: 'Soạn bài', channel: { display_id: 'CH-0001' }, review_notes: [] };

test('d-runner: không có CLI → report_problem cli_missing; chỉ gửi Bearer token', async () => {
  const s = await stubServer(TASK);
  try {
    const spawn = () => { const c = new EventEmitter(); c.stdout = new EventEmitter(); c.stderr = new EventEmitter(); setImmediate(() => c.emit('error', Object.assign(new Error('spawn claude ENOENT'), { code: 'ENOENT' }))); return c; };
    const r = createRunner({ url: s.url, token: 'gst_abc', fake: false, spawn });
    assert.equal(await r.tick(), 'cli_missing');
    const rp = s.calls.filter(c => c.m.method === 'tools/call' && c.m.params.name === 'report_problem');
    assert.equal(rp.length, 1); assert.equal(rp[0].m.params.arguments.code, 'cli_missing');
    assert.ok(s.calls.every(c => c.auth === 'Bearer gst_abc'));
  } finally { s.srv.close(); }
});

test('d-runner: có việc → spawn claude -p với mcp-config + allowedTools; xong mà WO chưa fulfilled → not_completed', async () => {
  const s = await stubServer(TASK);
  try {
    let seen = null, cfgText = null;
    const spawn = (cmd, args) => {
      seen = { cmd, args }; cfgText = fs.readFileSync(args[args.indexOf('--mcp-config') + 1], 'utf8');
      const c = new EventEmitter(); c.stdout = new EventEmitter(); c.stderr = new EventEmitter(); setImmediate(() => c.emit('close', 0)); return c;
    };
    const r = createRunner({ url: s.url, token: 'gst_abc', fake: false, spawn });
    assert.equal(await r.tick(), 'not_completed');
    assert.equal(seen.cmd, 'claude');
    assert.ok(seen.args.includes('-p') && seen.args.includes('--output-format') && seen.args[seen.args.indexOf('--allowedTools') + 1] === 'mcp__gen-studio__*');
    assert.equal(JSON.parse(cfgText).mcpServers['gen-studio'].url, s.url);
    assert.match(seen.args[seen.args.indexOf('-p') + 1], /WO-0001/);
    assert.equal(await r.tick(), 'idle');
  } finally { s.srv.close(); }
});

test('d-runner: prompt coi nội dung là dữ liệu', () => {
  assert.match(buildPrompt(TASK), /DỮ LIỆU/);
  assert.throws(() => createRunner({}), /GS_MCP_URL/);
});

test('d-runner (CNS-068): CLI con chạy uid khác và không nhận biến GS_*; chỉ hạ quyền khi runner là root; refresh trước spawn nếu access sắp hết hạn', () => {
  const env = { PATH: '/usr/bin', GS_CLI_UID: '1000', GS_CLI_GID: '1000', GS_AGENT_STATE: '/agent-state', GS_MCP_URL: 'http://studio:7490/mcp', ANTHROPIC_FOO: 'x' };
  const root = cliSpawnOptions(env, () => 0);
  assert.equal(root.drop, true); assert.equal(root.uid, 1000); assert.equal(root.gid, 1000); assert.equal(root.env.HOME, '/home/node');
  assert.ok(!Object.keys(root.env).some(k => k.startsWith('GS_')), 'GS_* (kể cả GS_AGENT_STATE) không sang CLI'); assert.equal(root.env.ANTHROPIC_FOO, 'x'); assert.equal(root.env.PATH, '/usr/bin');
  assert.equal(cliSpawnOptions(env, () => 1000).drop, false, 'không phải root thì không đặt uid');
  assert.equal(cliSpawnOptions({ PATH: '/x' }, () => 0).drop, false, 'không cấu hình GS_CLI_UID thì không hạ quyền');
  assert.equal(cliSpawnOptions(Object.assign({}, env, { GS_CLI_UID: '0' }), () => 0).drop, false, 'không bao giờ "hạ" xuống uid 0');
  const now = 1e12, to = 30 * 60000;
  assert.equal(needsRefreshBeforeSpawn(now + 34 * 60000, now, to), true);    // còn 34 phút < 30 + 5
  assert.equal(needsRefreshBeforeSpawn(now + 36 * 60000, now, to), false);
});

test('d-runner (CNS-061): runner không đọc GS_AGENT_TOKEN từ môi trường — luôn đi đường ghép thiết bị', () => {
  const old = process.env.GS_AGENT_TOKEN; process.env.GS_AGENT_TOKEN = 'gst_tu_moi_truong_khong_duoc_dung';
  try { const r = createRunner({ url: 'http://127.0.0.1:1/mcp' }); assert.ok(r.auth, 'phải ở chế độ ghép thiết bị'); r.stop(); }
  finally { if (old === undefined) delete process.env.GS_AGENT_TOKEN; else process.env.GS_AGENT_TOKEN = old; }
  const src = fs.readFileSync(path.join(__dirname, '..', 'agent', 'runner.js'), 'utf8').replace(/^\s*\/\/.*$/gm, '');
  assert.ok(!/process\.env\.GS_AGENT_TOKEN/.test(src));
});
