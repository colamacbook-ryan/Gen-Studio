// © 2026 Gen Labs — All rights reserved.
// Hạn chờ Chromium báo cổng DevTools đọc từ GS_CHROMIUM_START_MS (máy chậm/CI quá tải cần lâu hơn 20 s).
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path');
const chromium = require('../render/chromium.js');

test('launch: GS_CHROMIUM_START_MS đặt hạn chờ cổng DevTools; quá hạn ⇒ lỗi nêu đúng số giây, tiến trình bị dọn', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-fakechrome-'));
  const bin = path.join(dir, 'chrome');
  fs.writeFileSync(bin, '#!/bin/sh\nsleep 30\n', { mode: 0o755 });   // Chromium giả: không bao giờ in "DevTools listening"
  const prev = process.env.GS_CHROMIUM_START_MS;
  process.env.GS_CHROMIUM_START_MS = '1500';
  try {
    const t0 = Date.now();
    await assert.rejects(chromium.launch({ path: bin }), /sau 2 s/);
    const ms = Date.now() - t0;
    assert.ok(ms >= 1400 && ms < 10000, 'hạn theo env, không phải 20 s: ' + ms);
  } finally {
    if (prev === undefined) delete process.env.GS_CHROMIUM_START_MS; else process.env.GS_CHROMIUM_START_MS = prev;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
