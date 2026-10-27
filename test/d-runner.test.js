// © 2026 Gen Labs — All rights reserved.
// Gói D: agent runner — chỉ dùng MCP (không require server/, không đọc DATA_DIR), cli_missing, nhận việc → gọi CLI.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { EventEmitter } = require('node:events');
const { createRunner, buildPrompt } = require('../agent/runner.js');

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
