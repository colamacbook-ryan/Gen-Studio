#!/usr/bin/env node
// © 2026 Gen Labs — All rights reserved.
// Bench F5-2 (SPEC-0.2.0 §7.4): p95 buildV2 ≤ 150 ms ở 10.000 Render / 50.000 Run / 200.000 gate_results (seed tổng hợp). KHÔNG chạy trong CI mặc định.
// Dùng: node tools/bench-overview.js [--renders=10000] [--runs=50000] [--gates=200000] [--iters=30] [--span-days=365]  (--span-days=30 = xấu nhất: mọi dòng nằm trong cửa sổ 30d)
'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const dbm = require('../server/db.js');
const { buildV2 } = require('../server/routes/overview.js');

const arg = (k, d) => { const m = process.argv.find((a) => a.startsWith('--' + k + '=')); return m ? Number(m.split('=')[1]) : d; };
const N_R = arg('renders', 10000), N_RUN = arg('runs', 50000), N_G = arg('gates', 200000), ITERS = arg('iters', 30), SPAN = arg('span-days', 365);   // 10.000 Render ≈ 1 năm sản xuất (~27 bài/ngày)

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-bench-'));
const db = dbm.open(dir, { masterKey: crypto.randomBytes(32).toString('hex') });
try {
  const now = Date.now(), at = (i, span) => new Date(now - ((i * 7919) % span) * 60000).toISOString();   // phân bố giả ngẫu nhiên trong `span` phút
  const ch = db.insertRow('channels', { name: 'B', current_version: 1 }, { prefix: 'CH' });
  db.insertRow('channel_versions', { entity_id: ch.id, version: 1, data: JSON.stringify({ schedule: { time: '06:00', per_run: 2 } }) });
  const user = db.insertRow('users', { display_id: 'US-0001', username: 'b', display_name: 'B', password_hash: 'x', role: 'owner' });
  const l = db.insertRow('lessons', { channel_id: ch.id, title: 'L' }, { prefix: 'LS' });
  const lv = db.insertRow('lesson_versions', { lesson_id: l.id, version: 1, state: 'submitted' });
  const states = ['approved', 'awaiting_review', 'rejected', 'superseded', 'changes_requested'];
  const rids = [];
  const ws = db.ws, iso = (i) => at(i, 60 * 24 * SPAN);
  // seed thô bằng câu lệnh chuẩn bị sẵn (nhanh hơn insertRow cả trăm lần; display_id chỉ cần duy nhất)
  const insR = db.raw.prepare('INSERT INTO renders(id, workspace_id, display_id, lesson_version_id, state, state_changed_at, created_at, updated_at, awaiting_review_at, published_at) VALUES(?,?,?,?,?,?,?,?,?,?)');
  const insV = db.raw.prepare('INSERT INTO reviews(id, workspace_id, display_id, render_id, decision, decided_by, review_seconds, created_at, updated_at) VALUES(?,?,?,?,?,?,?,?,?)');
  const insN = db.raw.prepare('INSERT INTO runs(id, workspace_id, display_id, kind, state, render_id, started_at, finished_at, created_at, updated_at, cost) VALUES(?,?,?,?,?,?,?,?,?,?,?)');
  const insG = db.raw.prepare('INSERT INTO gate_results(id, workspace_id, display_id, subject_kind, subject_id, gate, result, created_at, updated_at) VALUES(?,?,?,?,?,?,?,?,?)');
  db.tx(() => {
    for (let i = 0; i < N_R; i++) {
      const c = iso(i), st = states[i % states.length], id = 'br' + i;
      insR.run(id, ws, 'RD-B' + i, lv.id, st, c, c, c, st === 'superseded' ? null : c, st === 'approved' && i % 2 ? c : null);
      rids.push(id);
      if (st === 'approved') insV.run('bv' + i, ws, 'RV-B' + i, id, 'approved', user.id, 30 + (i % 200), c, c);
    }
    for (let i = 0; i < N_RUN; i++) {
      const s = iso(i);
      insN.run('bn' + i, ws, 'RN-B' + i, i % 3 ? 'rendering' : 'voicing', 'done', rids[i % rids.length], s, new Date(Date.parse(s) + 200000).toISOString(), s, s, '{"calls":3}');
    }
    for (let i = 0; i < N_G; i++) { const c = iso(i); insG.run('bg' + i, ws, 'GT-B' + i, i % 4 ? 'render' : 'voice_clip', rids[i % rids.length], 'G-WAV', i % 17 ? 'pass' : 'fail', c, c); }
  });
  for (let i = 0; i < 3; i++) buildV2(db);   // khởi động (cache trang SQLite, câu lệnh đã biên dịch) — không tính vào số đo
  const ms = [];
  for (let i = 0; i < ITERS; i++) { const t0 = process.hrtime.bigint(); buildV2(db, { period: i % 2 ? '30d' : '7d' }); ms.push(Number(process.hrtime.bigint() - t0) / 1e6); }
  ms.sort((a, b) => a - b);
  const p95 = ms[Math.min(ms.length - 1, Math.ceil(ms.length * 0.95) - 1)];
  console.log(`buildV2 @ ${N_R} Render / ${N_RUN} Run / ${N_G} gate_results: p50 ${ms[ms.length >> 1].toFixed(1)} ms · p95 ${p95.toFixed(1)} ms · max ${ms[ms.length - 1].toFixed(1)} ms (ngưỡng F5-2: p95 ≤ 150 ms)`);
  process.exitCode = p95 <= 150 ? 0 : 1;
} finally { db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
