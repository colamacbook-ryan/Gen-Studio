// © 2026 Gen Labs — All rights reserved.
// Bus sự kiện thay đổi dữ liệu + đầu ra SSE cho /api/events + hàm che chuỗi giống khoá khi ghi log.
'use strict';
const { EventEmitter } = require('node:events');

function create() {
  const bus = new EventEmitter();
  bus.setMaxListeners(200);
  return bus;
}

// Mở một luồng SSE: mỗi sự kiện 'change' {entity, id} thành một dòng `event: change`.
function sse(bus, req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('retry: 3000\n\n');
  const send = ev => { res.write('event: change\ndata: ' + JSON.stringify(ev) + '\n\n'); };
  bus.on('change', send);
  const hb = setInterval(() => res.write(': hb\n\n'), 25000);
  hb.unref();
  const off = () => { clearInterval(hb); bus.off('change', send); };
  req.on('close', off);
  res.on('error', off);
}

// Che chuỗi giống khoá/token trước khi ghi log (CLAUDE.md: không ghi secret ra log).
function mask(s) {
  return String(s == null ? '' : s)
    .replace(/gs_[A-Za-z0-9_-]{12,}/g, 'gs_***')
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, 'AIza***')
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]{12,}/g, 'Bearer ***')
    .replace(/[A-Fa-f0-9]{48,}/g, '***');
}

function log(...a) { console.log(mask(a.map(x => (typeof x === 'string' ? x : JSON.stringify(x))).join(' '))); }
function logError(...a) { console.error(mask(a.map(x => (x && x.stack ? x.stack : typeof x === 'string' ? x : JSON.stringify(x))).join(' '))); }

module.exports = { create, sse, mask, log, logError };
