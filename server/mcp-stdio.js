#!/usr/bin/env node
// © 2026 Gen Labs — All rights reserved.
// Cầu stdio cho MCP: agent nói JSON-RPC qua stdin/stdout, cầu chuyển từng thông điệp tới POST /mcp của bản đang chạy.
// Dùng: node server/mcp-stdio.js --token <gst_...> [--url http://127.0.0.1:7490/mcp]  (hoặc env GS_AGENT_TOKEN / GS_MCP_URL)
'use strict';
const http = require('node:http');
const readline = require('node:readline');

const arg = n => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : undefined; };
const TOKEN = arg('token') || process.env.GS_AGENT_TOKEN || '';
const URL_ = new URL(arg('url') || process.env.GS_MCP_URL || 'http://127.0.0.1:' + (process.env.GS_PORT || 7490) + '/mcp');
if (!TOKEN) { process.stderr.write('Thiếu token: dùng --token <token> hoặc GS_AGENT_TOKEN.\n'); process.exit(2); }

function post(line) {
  return new Promise(resolve => {
    const data = Buffer.from(line);
    const req = http.request({ host: URL_.hostname, port: URL_.port, path: URL_.pathname, method: 'POST', timeout: 600000,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'Content-Length': data.length, Authorization: 'Bearer ' + TOKEN } }, res => {
      let s = '';
      res.on('data', c => (s += c));
      res.on('end', () => resolve(res.statusCode === 202 ? '' : s));
    });
    req.on('error', e => {
      let id = null; try { id = JSON.parse(line).id; } catch { /* dòng không phải JSON */ }
      resolve(id === null || id === undefined ? '' : JSON.stringify({ jsonrpc: '2.0', id, error: { code: -32000, message: 'gen-studio is not reachable at ' + URL_.origin + ' (' + e.message + ')' } }));
    });
    req.write(data);
    req.end();
  });
}
const rl = readline.createInterface({ input: process.stdin });
let chain = Promise.resolve();
rl.on('line', line => { if (!line.trim()) return; chain = chain.then(() => post(line)).then(out => { if (out) process.stdout.write(out.replace(/\n/g, '') + '\n'); }); });
rl.on('close', () => chain.then(() => process.exit(0)));
