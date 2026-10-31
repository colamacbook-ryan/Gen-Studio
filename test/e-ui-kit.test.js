// © 2026 Gen Labs — All rights reserved.
// Gói D (0.3.0) — UI Kho song ngữ: A1 Tổng quan · A2 Hàng chờ duyệt · A3 Chi tiết ô · A4 Phiếu/Muse · A5 Nhật ký · A6 Cài đặt.
// i18n kit.*, wiring route/sidebar, và route mỏng server/routes/kit.js (gọi lại các op đã có ở server/ops/kit.js gói A/B/C)
// qua một luồng duyệt giả: nộp → Trả làm lại (từ chối lý do ngắn) → Duyệt → Miễn tiêu chí → Xác nhận ô.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { bootTmp, setupOwner, ui, request } = require('./d-helpers.js');
const { requiredCriteria } = require('../server/kit-criteria.js');

const ROOT = path.join(__dirname, '..');
const STUDIO = path.join(ROOT, 'studio');
const load = (rel) => import(pathToFileURL(path.join(STUDIO, rel)).href);
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const system = { type: 'system', entry: 'system' };
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>');

// ---------- phần thuần: i18n + wiring ----------
test('i18n kit (SHARED, gói D): vi/en cùng bộ khoá, không trùng MODULES/aspect; nav.kho* có mặt', async () => {
  const m = await load('i18n/kit.js');
  const idx = await load('i18n/index.js');
  assert.deepEqual(Object.keys(m.vi).sort(), Object.keys(m.en).sort());
  assert.equal(idx.SHARED.kit, m);
  const core = idx.MODULES.core.vi;
  for (const k of Object.keys(m.vi)) assert.ok(!(k in core) && !(k in idx.SHARED.aspect.vi), 'trùng khoá: ' + k);
  for (const k of ['nav.kho', 'nav.kho_queue', 'nav.kho_tokens', 'nav.kho_audit', 'nav.kho_settings']) { assert.ok(k in m.vi, k); assert.ok(k in m.en, k); }
  idx.setLang('vi'); assert.equal(idx.t('nav.kho_queue'), 'Hàng chờ duyệt'); idx.setLang('en'); assert.equal(idx.t('nav.kho_queue'), 'Review queue'); idx.setLang('vi');
});

test('routing: #/kho-slot/<code> giữ nguyên id; ROUTES có đủ 6 màn kho; sidebar + app.js nối view mới', async () => {
  const u = await load('components/util.js');
  for (const p of ['kho', 'kho-queue', 'kho-slot', 'kho-tokens', 'kho-audit', 'kho-settings']) assert.ok(u.ROUTES.includes(p), p);
  assert.deepEqual(u.parseRoute('#/kho-slot/nhi.expr.08'), { path: 'kho-slot', id: 'nhi.expr.08', query: {} });
  assert.equal(u.parseRoute('#/kho-queue?q=state:blocked').query.q, 'state:blocked');
  const app = read('studio/app.js');
  const viewFile = { kho: 'kho-overview', 'kho-queue': 'kho-queue', 'kho-slot': 'kho-slot', 'kho-tokens': 'kho-tokens', 'kho-audit': 'kho-audit', 'kho-settings': 'kho-settings' };
  for (const [p, f] of Object.entries(viewFile)) assert.match(app, new RegExp(`case '${p}': return \\(await import\\('\\./views/${f}\\.js'\\)\\)\\.mount`));
  const shell = read('studio/components/shell.js');
  for (const label of ['nav.kho', 'nav.kho_queue', 'nav.kho_tokens', 'nav.kho_audit', 'nav.kho_settings']) assert.match(shell, new RegExp(label.replace('.', '\\.')));
  for (const v of ['kho-overview', 'kho-queue', 'kho-slot', 'kho-tokens', 'kho-audit', 'kho-settings']) {
    const mod = await load('views/' + v + '.js');
    assert.equal(typeof mod.mount, 'function', v);
  }
});

test('server/grids/kit_submissions.js nạp được, tên khớp tên file', () => {
  const g = require('../server/grids/kit_submissions.js');
  assert.equal(g.name, 'kit_submissions');
  assert.ok(g.grid.cols.state && g.grid.cols.kit_slot && g.grid.cols.checks_level);
});

// ---------- luồng duyệt giả (L-102): nộp → Trả làm lại (lý do ngắn bị chặn) → Duyệt → Miễn tiêu chí → Xác nhận ô ----------
test('luồng A2/A3 qua route mỏng server/routes/kit.js: decide/waive/certify gọi đúng op, trả lỗi/human đúng', async () => {
  const t = await bootTmp();
  try {
    const s = await setupOwner(t.app, t.base);
    const call = ui(t.base, s);
    const { db, write } = t.app.ctx;
    const ownerActor = { type: 'user', id: db.get("SELECT id FROM users WHERE username=?", s.username).id, role: 'owner', entry: 'ui' };

    // A6: đồng bộ danh mục qua route mỏng
    const sync = await call('POST', '/api/kit/sync', {});
    assert.equal(sync.status, 200); assert.equal(sync.json.result.total, 457);

    // dựng một lần nộp 'submitted' cho ô nhi.id.01 (asset.put + submission.import, ops có sẵn gói A/C)
    const asset = write(ownerActor, 'asset.put', { kind: 'svg', bytes: SVG, mime: 'image/svg+xml', meta: {}, source: 'upload' });
    const sub = write(ownerActor, 'submission.import', { asset: asset.display_id, kit_slot: 'nhi.id.01', state: 'submitted' });
    assert.equal(sub.state, 'submitted');

    // A1 Tổng quan: ô hiện trạng thái 'submitted'
    const ov = await call('GET', '/api/kit/overview');
    assert.equal(ov.status, 200);
    const row = ov.json.slots.find((x) => x.code === 'nhi.id.01');
    assert.equal(row.status, 'submitted');

    // A2 chi tiết lần nộp: required.m khớp kit-criteria.js
    const detail = await call('GET', '/api/kit/submission/' + sub.display_id);
    assert.equal(detail.status, 200);
    assert.deepEqual(detail.json.required.m.sort(), requiredCriteria('nhi.id.01').m.sort());

    // Trả làm lại với lý do quá ngắn -> 400, không đổi state
    const badRework = await call('POST', '/api/kit/submission/' + sub.display_id + '/decide', { verdict: 'rework', reason: 'ngắn' });
    assert.equal(badRework.status, 400);
    assert.equal(db.get('SELECT state FROM asset_submissions WHERE display_id=?', sub.display_id).state, 'submitted');

    // Trả làm lại với lý do đủ dài -> 200, state='rework'
    const rework = await call('POST', '/api/kit/submission/' + sub.display_id + '/decide', { verdict: 'rework', reason: 'Nền chưa đúng #00B140, làm lại.' });
    assert.equal(rework.status, 200);
    assert.equal(db.get('SELECT state FROM asset_submissions WHERE display_id=?', sub.display_id).state, 'rework');

    // Mở lại để tự quyết -> về 'submitted'
    const reopen = await call('POST', '/api/kit/submission/' + sub.display_id + '/decide', { verdict: 'reopen' });
    assert.equal(reopen.status, 200);
    assert.equal(db.get('SELECT state FROM asset_submissions WHERE display_id=?', sub.display_id).state, 'submitted');

    // Ghi kiểm máy cho đủ các tiêu chí M bắt buộc (ok) rồi Duyệt
    const req = requiredCriteria('nhi.id.01');
    write(system, 'submission.record_checks', { submission: sub.display_id, run_id: 'r1', results: req.m.map((criterion) => ({ criterion, level: 'ok' })) });
    const approve = await call('POST', '/api/kit/submission/' + sub.display_id + '/decide', { verdict: 'approve' });
    assert.equal(approve.status, 200);
    assert.equal(db.get('SELECT state, decision_kind FROM asset_submissions WHERE display_id=?', sub.display_id).state, 'approved');

    // Miễn tiêu chí lý do ngắn -> 400; đủ dài -> 200 (ghi 'waived' trên asset — dùng target asset vì submission đã approved, record_checks chặn ghi thêm)
    const badWaive = await call('POST', '/api/kit/waive', { asset: asset.display_id, criterion: 'CH-09', severity: 'H', reason: 'ngắn' });
    assert.equal(badWaive.status, 400);
    const waive = await call('POST', '/api/kit/waive', { asset: asset.display_id, criterion: 'CH-09', severity: 'H', reason: 'Ryan xem bằng mắt, chấp nhận được.' });
    assert.equal(waive.status, 200);

    // Xác nhận ô: ghi M trên asset rồi certify qua route — thiếu tick M*/H -> 400 (invalid, op kit.certify)
    write(system, 'submission.record_checks', { asset: asset.display_id, run_id: 'r2', results: req.m.map((criterion) => ({ criterion, level: 'ok' })) });
    const missingTick = await call('POST', '/api/kit/certify', { asset: asset.display_id, kit_slot: 'nhi.id.01' });
    assert.equal(missingTick.status, 400);
    const certify = await call('POST', '/api/kit/certify', { asset: asset.display_id, kit_slot: 'nhi.id.01', h_ticks: req.mh });
    assert.equal(certify.status, 200, JSON.stringify(certify.json));
    assert.equal(db.get('SELECT COUNT(*) n FROM kit_certs WHERE kit_slot=?', 'nhi.id.01').n, 1);

    // A1 sau khi chứng nhận: ô chuyển 'certified'
    const ov2 = await call('GET', '/api/kit/overview');
    assert.equal(ov2.json.slots.find((x) => x.code === 'nhi.id.01').status, 'certified');

    // A3 chi tiết ô: có lịch sử + chứng nhận
    const slotDetail = await call('GET', '/api/kit/slot/nhi.id.01');
    assert.equal(slotDetail.status, 200);
    assert.ok(slotDetail.json.submissions.length >= 1);
    assert.equal(slotDetail.json.certs.length, 1);

    // chưa đăng nhập -> 401 trên route cần phiên UI
    const anon = await request(t.base, 'GET', '/api/kit/overview', {});
    assert.equal(anon.status, 401);
  } finally { await t.clean(); }
});
