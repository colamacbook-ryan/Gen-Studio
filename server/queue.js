// © 2026 Gen Labs — All rights reserved.
// Hàng đợi job bền trên bảng runs: lease + chạy bù khi lease hết hạn.
'use strict';
const { WriteError } = require('./db');

const iso = (ms) => new Date(Date.now() + ms).toISOString();
const row = (db, id) => db.json(db.get('SELECT * FROM runs WHERE id=? OR display_id=?', id, id));

function enqueue(db, { kind, render_id = null, work_order_id = null, payload = {}, created_by = 'system' }) {
  return db.tx(() => {
    const r = db.insertRow('runs', {
      kind, render_id, work_order_id, state: 'queued', attempt: 0, progress: 0, payload, created_by,
    }, { prefix: 'RN' });
    db.emitChange({ entity: 'run', id: r.display_id });
    return r;
  });
}

// Nhặt run queued, running hết lease (chạy bù) hoặc waiting_quota đã tới hạn.
function lease(db, kinds, workerId, ms) {
  if (!Array.isArray(kinds) || !kinds.length) throw new WriteError('invalid', 'Thiếu danh sách loại run.', null);
  return db.tx(() => {
    const now = db.now();
    const ph = kinds.map(() => '?').join(',');
    const r = db.get(
      `SELECT id FROM runs WHERE kind IN (${ph}) AND (
         state='queued'
         OR (state='running' AND lease_until IS NOT NULL AND lease_until < ?)
         OR (state='waiting_quota' AND waiting_until IS NOT NULL AND waiting_until <= ?))
       ORDER BY created_at, id LIMIT 1`, ...kinds, now, now);
    if (!r) return null;
    db.run(
      `UPDATE runs SET state='running', attempt=attempt+1, worker_id=?, lease_until=?, waiting_until=NULL,
         started_at=COALESCE(started_at, ?), updated_at=? WHERE id=?`, workerId, iso(ms), now, now, r.id);
    const out = row(db, r.id);
    db.emitChange({ entity: 'run', id: out.display_id });
    return out;
  });
}

function heartbeat(db, runId, ms, progress) {
  const f = { lease_until: iso(ms) };
  if (progress !== undefined) f.progress = progress;
  db.update('runs', runId, f);
  return row(db, runId);
}

function finish(db, runId, fields) {
  return db.tx(() => {
    db.update('runs', runId, { ...fields, finished_at: db.now(), lease_until: null });
    const out = row(db, runId);
    db.emitChange({ entity: 'run', id: out.display_id });
    return out;
  });
}
const done = (db, runId, result) => finish(db, runId, { state: 'done', progress: 1, result: result === undefined ? null : result });
const fail = (db, runId, error) => finish(db, runId, {
  state: 'failed', error: error && error.text_human ? error : { code: 'error', text_human: String((error && error.message) || error), detail: null },
});

function waitQuota(db, runId, untilIso) {
  return db.tx(() => {
    db.update('runs', runId, { state: 'waiting_quota', waiting_until: untilIso, lease_until: null, worker_id: null });
    const out = row(db, runId);
    db.emitChange({ entity: 'run', id: out.display_id });
    return out;
  });
}

// Huỷ mọi run chưa xong của một render (khi render bị superseded).
function cancelByRender(db, renderId) {
  db.run(`UPDATE runs SET state='cancelled', finished_at=?, lease_until=NULL, updated_at=?
          WHERE render_id=? AND state IN ('queued','running','waiting_quota')`, db.now(), db.now(), renderId);
}

// Job 'asset.check' (gói E, 0.3.0 — máy kiểm thường trực): CHỈ chạy máy kiểm + phát sự kiện, KHÔNG ghi DB
// (asset_checks/runs nối ở gói A sau, migration 0006+). Payload: {file, slot, referenceFile?, declaredMime?}.
// Gọi trực tiếp (không qua enqueue/lease bảng runs) vì chưa có cột asset_check trong 'kind' của runs ở nhánh này.
// Review #9: chạy qua tiến trình con (tái dùng cli/check-kit.js) thay vì chạy đồng bộ trên event loop chính
// (máy kiểm PNG 2048×2048 tốn ~0,8s CPU/ảnh — chặn vòng lặp sự kiện của server nếu gọi trực tiếp tại đây).
const { execFile } = require('node:child_process');
const path = require('node:path');
const CHECK_CLI = path.join(__dirname, '..', 'cli', 'check-kit.js');

function runAssetCheck(ctx, { file, slot, referenceFile, declaredMime, ffmpegPath, groundY } = {}) {
  if (!file || !slot) return Promise.reject(new Error("runAssetCheck: thiếu 'file' hoặc 'slot'."));
  const args = [CHECK_CLI, file, '--slot', slot, '--json'];
  if (referenceFile) args.push('--ref', referenceFile);
  if (declaredMime) args.push('--mime', declaredMime);
  if (ffmpegPath) args.push('--ffmpeg', ffmpegPath);
  if (groundY != null) args.push('--ground-y', String(groundY));
  return new Promise((resolve, reject) => {
    execFile(process.execPath, args, { maxBuffer: 1 << 24 }, (err, stdout, stderr) => {
      // cli/check-kit.js thoát mã 1 khi verdict='rework' (có chủ ý) — vẫn có JSON hợp lệ trên stdout; chỉ
      // coi là lỗi thật khi không có stdout để đọc (crash/exception trước khi in).
      if (err && !stdout) return reject(new Error('runAssetCheck: ' + String(stderr || err.message).trim().slice(0, 500)));
      let result;
      try { result = JSON.parse(stdout); } catch (e) { return reject(new Error('runAssetCheck: không đọc được JSON từ cli/check-kit.js: ' + e.message)); }
      if (ctx && ctx.events && ctx.events.log) ctx.events.log('asset.check', slot, result.verdict);
      if (ctx && ctx.bus) ctx.bus.emit('change', { entity: 'asset_check', id: slot, verdict: result.verdict });
      resolve(result);
    });
  });
}

module.exports = { enqueue, lease, heartbeat, done, fail, waitQuota, cancelByRender, runAssetCheck };
