// © 2026 Gen Labs — All rights reserved.
// Client Chrome DevTools Protocol thuần qua WebSocket toàn cục của Node 22 (không Playwright, không npm).
// connect(wsUrl) → Cdp · cdp.send(method, params?, sessionId?) → Promise<result> · cdp.on(event, fn(params, sessionId)) · cdp.session(id) → {send, on} · cdp.close()
'use strict';

class CdpError extends Error {
  constructor(method, err) { super(method + ': ' + (err && err.message || 'lỗi CDP')); this.name = 'CdpError'; this.code = err && err.code; this.method = method; }
}

class Cdp {
  constructor(ws, opts) {
    this.sendTimeoutMs = (opts && opts.sendTimeoutMs) || 30000;   // mỗi lệnh CDP phải có phản hồi trong hạn này, không treo vô hạn
    this.ws = ws; this.nextId = 1; this.pending = new Map(); this.handlers = new Map(); this.closed = false;
    ws.addEventListener('message', ev => this._onMessage(ev.data));
    ws.addEventListener('close', () => this._onClose('kết nối CDP đã đóng'));
    ws.addEventListener('error', () => this._onClose('lỗi WebSocket CDP'));
  }
  _onClose(why) {
    this.closed = true;
    for (const [, p] of this.pending) p.reject(new Error(why));
    this.pending.clear();
  }
  _onMessage(data) {
    const m = JSON.parse(typeof data === 'string' ? data : Buffer.from(data).toString('utf8'));
    if (m.id !== undefined) {
      const p = this.pending.get(m.id); if (!p) return; this.pending.delete(m.id);
      if (m.error) p.reject(new CdpError(p.method, m.error)); else p.resolve(m.result);
    } else if (m.method) {
      (this.handlers.get(m.method) || []).forEach(fn => fn(m.params, m.sessionId));
    }
  }
  send(method, params, sessionId) {
    if (this.closed) return Promise.reject(new Error('kết nối CDP đã đóng'));
    const id = this.nextId++, msg = { id, method, params: params || {} };
    if (sessionId) msg.sessionId = sessionId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        const e = new Error('quá hạn chờ phản hồi CDP: ' + method); e.code = 'cdp_timeout'; reject(e);
      }, this.sendTimeoutMs);
      this.pending.set(id, { resolve: v => { clearTimeout(timer); resolve(v); }, reject: e => { clearTimeout(timer); reject(e); }, method });
      try { this.ws.send(JSON.stringify(msg)); } catch (e) { this.pending.delete(id); clearTimeout(timer); reject(e); }
    });
  }
  on(event, fn) { if (!this.handlers.has(event)) this.handlers.set(event, []); this.handlers.get(event).push(fn); return this; }
  // chờ một sự kiện (tuỳ chọn lọc theo session), có hạn
  once(event, sessionId, ms) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { reject(new Error('quá hạn chờ sự kiện ' + event)); }, ms || 30000);
      const fn = (params, sid) => {
        if (sessionId && sid !== sessionId) return;
        clearTimeout(timer); const hs = this.handlers.get(event); hs.splice(hs.indexOf(fn), 1); resolve(params);
      };
      this.on(event, fn);
    });
  }
  session(sessionId) {
    return {
      id: sessionId,
      send: (method, params) => this.send(method, params, sessionId),
      on: (event, fn) => this.on(event, (p, sid) => { if (sid === sessionId) fn(p); }),
      once: (event, ms) => this.once(event, sessionId, ms)
    };
  }
  close() { try { this.ws.close(); } catch (e) { /* đã đóng */ } }
}

function connect(wsUrl, timeoutMs, opts) {
  if (typeof WebSocket === 'undefined') return Promise.reject(new Error('Node thiếu WebSocket toàn cục (cần Node 22+)'));
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl), timer = setTimeout(() => reject(new Error('quá hạn kết nối CDP')), timeoutMs || 15000);
    ws.addEventListener('open', () => { clearTimeout(timer); resolve(new Cdp(ws, opts)); });
    ws.addEventListener('error', () => { clearTimeout(timer); reject(new Error('không kết nối được CDP ' + wsUrl)); });
  });
}

module.exports = { connect, Cdp, CdpError };
