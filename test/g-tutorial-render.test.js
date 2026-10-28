// © 2026 Gen Labs — All rights reserved.
// Gói U — dựng THẬT bài hướng dẫn qua pipeline (Chromium + ffmpeg + nhà cung cấp giả): awaiting_review với 8 cổng R3 + G-CURSOR đều pass (G-MOTION qua nhờ
// chuyển động thật: con trỏ + máy quay, không phải rung giả — INT-04); C10 dò được gợn sóng trên MP4 thật.
// Mặc định chạy một bài ngắn (~12 s). GS_E2E_TUTORIAL=1 chạy thêm đường đầy đủ: thiết lập → kênh → lệnh sản xuất → runner + agent giả (GS_FAKE_SAMPLE=tutorial
// rồi tutorial-trailer) qua MCP HTTP thật → pipeline → awaiting_review (bài mẫu 60–90 s + trailer 30–60 s); GS_TUTORIAL_OUT=<thư mục> giữ lại MP4.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const chromium = require('../render/chromium');
const dbm = require('../server/db');
const pipeline = require('../server/pipeline.js');
const events = require('../server/events.js');
const { createWriter } = require('../server/write');
const { basics } = require('./a-helpers');
const { MINI_SCREENS } = require('./g-tutorial-fixtures');
const { gatesFor } = require('../media/gates/index.js');

const HAS = chromium.find() ? false : 'không có Chromium';
const OUT = process.env.GS_TUTORIAL_OUT || null;

function keepMp4(db, dataDir, r, name) {
  if (!OUT) return;
  const a = db.get('SELECT path FROM assets WHERE id=? OR display_id=?', r.outputs.mp4, r.outputs.mp4);
  fs.mkdirSync(OUT, { recursive: true }); fs.copyFileSync(path.join(dataDir, a.path), path.join(OUT, name));
}

test('dựng thật bài hướng dẫn ngắn (~15 s): awaiting_review, 8 cổng R3 + G-CURSOR pass (C1–C10), plan tutorial trong manifest', { skip: HAS, timeout: 600000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-u-render-'));
  const dataDir = path.join(dir, 'data');
  const db = dbm.open(dataDir, { masterKey: 'a'.repeat(64) });
  const write = createWriter(db);
  const ctx = { db, write, events: events.create(), config: { dataDir, fakeProviders: true, ffmpegPath: 'ffmpeg', chromiumPath: null, version: 'test' }, pipelineOpts: { backoffMs: 1 } };
  try {
    const b = basics(write, db), who = b.m1.display_id;
    const body = { channel: b.ch.display_id, title: 'Tạo kênh nhanh', kind: 'tutorial', host: { mode: 'pip' }, screens: MINI_SCREENS,
      lines: [{ who, say: 'Đây là màn tạo kênh, mình bấm vào ô tên kênh trước.' }, { who, say: 'Gõ tên kênh vào đây, rồi nhìn nút Lưu ở góc trên.' }, { who, say: 'Bấm Lưu là xong phần tên kênh.' }, { who, say: 'Cuối cùng bật lịch để kênh tự chạy mỗi sáng.' }],
      beats: [
        { block: 'screen', anchor: { line: 0, word: 'màn' }, params: { screen: 'SC-1' } },
        { block: 'cursor', anchor: { line: 0, word: 'bấm' }, params: { action: 'click', target: 'in_name' } },
        { block: 'cursor', anchor: { line: 1, word: 'Gõ' }, params: { action: 'type', target: 'in_name', text: 'Lớp AI', cps: 12 } },
        { block: 'focus', anchor: { line: 1, word: 'nhìn' }, params: { target: 'btn_ok', callout: 'Lưu ở đây', hold_ms: 2000 } },
        { block: 'cursor', anchor: { line: 2, word: 'Bấm' }, params: { action: 'click', target: 'btn_ok' } },
        { block: 'cursor', anchor: { line: 3, word: 'bật' }, params: { action: 'click', target: 'tg_on' } },
      ] };
    const sub = write(b.o, 'lesson.submit', body);
    const w = pipeline.startWorkers(ctx, { pollMs: 50 });
    try { await w.idle(540000); } finally { w.stop(); }
    const r = db.json(db.get('SELECT * FROM renders WHERE display_id=?', sub.render.display_id));
    const gates = db.all("SELECT gate, result, measure FROM gate_results WHERE subject_kind='render' AND subject_id=? ORDER BY rowid", r.id).map(g => db.json(g));
    assert.equal(r.state, 'awaiting_review', JSON.stringify(r.blocked_reason));
    assert.deepEqual(gates.map(g => g.gate), gatesFor('tutorial', {}));
    assert.deepEqual(gates.filter(g => g.result !== 'pass').map(g => g.gate), []);
    const gc = gates.find(g => g.gate === 'G-CURSOR').measure;
    assert.equal(gc.checks.C10.pass, true); assert.equal(gc.checks.C10.n, 3, 'ba lần bấm đều thấy gợn trên MP4');
    assert.equal(r.manifest.kind, 'tutorial');
    keepMp4(db, dataDir, r, 'tutorial-short.mp4');
  } finally { db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('e2e (GS_E2E_TUTORIAL=1): thiết lập → kênh → lệnh sản xuất → runner + agent giả nộp bài mẫu "Tạo kênh đầu tiên" và trailer qua MCP → awaiting_review, mọi cổng pass', { skip: HAS || (process.env.GS_E2E_TUTORIAL === '1' ? false : 'đặt GS_E2E_TUTORIAL=1 để chạy (dựng ~110 s video thật)'), timeout: 3600000 }, async () => {
  const { bootTmp, setupOwner, ui } = require('./d-helpers.js');
  const { createRunner } = require('../agent/runner.js');
  const t = await bootTmp({ workers: true, pipeline: { pollMs: 200 } });
  const { db } = t.app.ctx;
  const saved = process.env.GS_FAKE_SAMPLE;
  try {
    const s = await setupOwner(t.app, t.base);
    const call = ui(t.base, s);
    assert.equal((await call('POST', '/api/channels', { name: 'Lớp AI Bình Dân', lang: 'vi', schedule: { time: '06:00', per_run: 1 } })).status, 201);
    const ag = await call('POST', '/api/agents', { name: 'Agent giả', scopes: ['read', 'compose', 'run'] });
    const runner = createRunner({ url: t.base + '/mcp', token: ag.json.token, fake: true });
    for (const [sample, file, range] of [['tutorial', 'tutorial-full.mp4', [60000, 90000]], ['tutorial-trailer', 'tutorial-trailer.mp4', [30000, 60000]]]) {
      process.env.GS_FAKE_SAMPLE = sample;
      const wo = await call('POST', '/api/work_orders', { brief: 'Dùng Gen-Studio: tạo kênh đầu tiên (' + sample + ')' });
      assert.equal(wo.status, 201);
      assert.equal(await runner.tick(), 'done');
      const lv = db.get('SELECT lv.* FROM lesson_versions lv JOIN work_orders w ON w.id=lv.work_order_id WHERE w.display_id=?', wo.json.work_order.display_id);
      assert.equal(lv.kind, 'tutorial');
      const rd = db.get('SELECT * FROM renders WHERE lesson_version_id=?', lv.id);
      let r;
      for (const t0 = Date.now(); ; await new Promise(res => setTimeout(res, 1000))) {
        r = db.json(db.get('SELECT * FROM renders WHERE id=?', rd.id));
        if (['blocked', 'waiting_quota', 'awaiting_review'].includes(r.state)) break;
        if (Date.now() - t0 > 3000000) throw new Error('quá giờ chờ ' + sample);
      }
      assert.equal(r.state, 'awaiting_review', sample + ': ' + JSON.stringify(r.blocked_reason));
      assert.ok(r.duration_ms >= range[0] && r.duration_ms <= range[1], sample + ' dài ' + r.duration_ms);
      const view = await call('GET', '/api/renders/' + rd.display_id);
      assert.deepEqual(view.json.gates.map(g => g.gate), gatesFor('tutorial', {}));
      assert.deepEqual(view.json.gates.filter(g => g.result !== 'pass').map(g => g.gate), [], sample);
      assert.equal(view.json.render.kind, 'tutorial');
      keepMp4(db, t.app.ctx.config.dataDir, r, file);
    }
  } finally { if (saved === undefined) delete process.env.GS_FAKE_SAMPLE; else process.env.GS_FAKE_SAMPLE = saved; await t.clean(); }
});
