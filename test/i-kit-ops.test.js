// © 2026 Gen Labs — All rights reserved.
// Gói 0.3.0-A — server/ops/kit.js: kit.sync, slot.assign, submission.record_checks, submission.auto_rework (≤2 lần, lần 3 chờ Ryan),
// submission.propose, check.waive, kit.certify, fetch_log.prune. Xem ghi chú phạm vi ở đầu migrations/0006_kit_library.sql.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { tmpDb, owner, agent } = require('./a-helpers');

const system = { type: 'system', entry: 'system' };
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>');

function putAsset(t, o, extra = {}) {
  return t.write(o, 'asset.put', { kind: 'svg', bytes: SVG, mime: 'image/svg+xml', meta: {}, source: 'upload', ...extra });
}
function submissionRow(t, { asset, kitSlot = 'nhi.id.01', previous = null, agentId = null } = {}) {
  return t.db.insertRow('asset_submissions', {
    agent_id: agentId, kit_slot: kitSlot, asset_id: asset.id, previous_id: previous ? previous.id : null,
    attempt: previous ? previous.attempt + 1 : 1, state: 'submitted',
  }, { prefix: 'SB' });
}

test('kit.sync: nạp đủ 457 ô, mỗi ô có title_vi/title_en; nạp lại = no-op', () => {
  const t = tmpDb();
  try {
    const o = owner(t.db);
    const r1 = t.write(o, 'kit.sync', {});
    assert.equal(r1.total, 457);
    assert.equal(r1.created, 457);
    assert.equal(t.db.get('SELECT COUNT(*) n FROM kit_slots').n, 457);
    assert.equal(t.db.all("SELECT 1 FROM kit_slots WHERE title_vi IS NULL OR title_en IS NULL").length, 0);
    const r2 = t.write(o, 'kit.sync', {});
    assert.equal(r2.created, 0);
    assert.equal(r2.updated, 0);
    // mã ô bất biến, không xoá
    const row = t.db.get('SELECT * FROM kit_slots LIMIT 1');
    assert.throws(() => t.db.run("UPDATE kit_slots SET code='x.y' WHERE code=?", row.code), /bất biến/);
    assert.throws(() => t.db.run('DELETE FROM kit_slots WHERE code=?', row.code), /không xoá/);
  } finally { t.clean(); }
});

test('slot.assign: gắn ô suy ra subject theo tiền tố; agent compose không gắn được vào tài sản', () => {
  const t = tmpDb();
  try {
    const o = owner(t.db);
    t.write(o, 'kit.sync', {});
    const a1 = putAsset(t, o);
    const r1 = t.write(o, 'slot.assign', { asset: a1.display_id, kit_slot: 'nhi.id.01' });
    assert.equal(r1.kit_slot, 'nhi.id.01');
    assert.equal(r1.subject, 'nhi');
    const a2 = putAsset(t, o, { bytes: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><g/></svg>') });
    const r2 = t.write(o, 'slot.assign', { asset: a2.display_id, kit_slot: 'audio.voice.ryan' });
    assert.equal(r2.subject, 'ryan');
    // gỡ ô: kit_slot về NULL, không đổi subject
    const r3 = t.write(o, 'slot.assign', { asset: a1.display_id, kit_slot: null });
    assert.equal(r3.kit_slot, null);
    assert.equal(r3.subject, 'nhi');
    // agent (dù compose) không được gọi slot.assign — op chỉ 'owner'
    const ag = agent(['compose']);
    assert.throws(() => t.write(ag, 'slot.assign', { asset: a1.display_id, kit_slot: 'nhi.id.02' }), /quyền/);
    // ô retired / không tồn tại
    assert.throws(() => t.write(o, 'slot.assign', { asset: a1.display_id, kit_slot: 'khong.ton.tai' }), /Không tìm thấy/);
  } finally { t.clean(); }
});

test('submission.record_checks: idempotent theo (run_id, tệp, tiêu chí); cập nhật checks_level; không nhận level=waived', () => {
  const t = tmpDb();
  try {
    const o = owner(t.db);
    t.write(o, 'kit.sync', {});
    const a1 = putAsset(t, o);
    const sub = submissionRow(t, { asset: a1 });
    const gen = agent(['assets.review'], 'AG-GEN');
    const r1 = t.write(gen, 'submission.record_checks', { submission: sub.display_id, run_id: 'r1', results: [{ criterion: 'CH-02', level: 'ok' }] });
    assert.equal(r1.checks_level, 'ok');
    assert.equal(t.db.get('SELECT COUNT(*) n FROM asset_checks WHERE submission_id=?', sub.id).n, 1);
    // gửi lại cùng run_id/criterion/level: idempotent, không thêm hàng mới
    t.write(gen, 'submission.record_checks', { submission: sub.display_id, run_id: 'r1', results: [{ criterion: 'CH-02', level: 'ok' }] });
    assert.equal(t.db.get('SELECT COUNT(*) n FROM asset_checks WHERE submission_id=?', sub.id).n, 1);
    // thêm một tiêu chí fail: checks_level chuyển fail (ưu tiên cao nhất)
    const r2 = t.write(gen, 'submission.record_checks', { submission: sub.display_id, run_id: 'r2', results: [{ criterion: 'CH-05', level: 'fail', detail: 'vai không chạm mép' }] });
    assert.equal(r2.checks_level, 'fail');
    // level=waived bị chặn ở op này
    assert.throws(() => t.write(gen, 'submission.record_checks', { submission: sub.display_id, run_id: 'r3', results: [{ criterion: 'CH-02', level: 'waived' }] }), /waived/);
    // không có scope assets.review ⇒ forbidden
    const noScope = agent(['compose'], 'AG-NO');
    assert.throws(() => t.write(noScope, 'submission.record_checks', { submission: sub.display_id, run_id: 'r4', results: [{ criterion: 'CH-02', level: 'ok' }] }), /quyền/);
    // system cũng gọi được (checks.run)
    t.write(system, 'submission.record_checks', { submission: sub.display_id, run_id: 'r5', results: [{ criterion: 'CH-06', level: 'ok' }] });
  } finally { t.clean(); }
});

test('submission.auto_rework: cần còn tiêu chí M fail; đếm chuỗi liên tiếp; lần 3 bị chặn + tạo đề xuất chờ Ryan', () => {
  const t = tmpDb();
  try {
    const o = owner(t.db);
    t.write(o, 'kit.sync', {});
    const a1 = putAsset(t, o);
    const gen = agent(['assets.review'], 'AG-GEN');

    const fail = (sub, runId) => t.write(gen, 'submission.record_checks', { submission: sub.display_id, run_id: runId, results: [{ criterion: 'CH-02', level: 'fail', detail: 'nền sai màu' }] });

    const sub1 = submissionRow(t, { asset: a1 });
    // chưa có kết quả fail ⇒ từ chối
    assert.throws(() => t.write(gen, 'submission.auto_rework', { submission: sub1.display_id }), /không có tiêu chí/i);
    fail(sub1, 'run1');
    const out1 = t.write(gen, 'submission.auto_rework', { submission: sub1.display_id });
    assert.equal(out1.state, 'rework');
    assert.equal(out1.decision_kind, 'auto');
    assert.ok(out1.decision_reason.includes('CH-02'));
    // SB không còn 'submitted' ⇒ auto_rework lần nữa bị từ chối
    assert.throws(() => t.write(gen, 'submission.auto_rework', { submission: sub1.display_id }), /không trả về làm lại được/);

    const sub2 = submissionRow(t, { asset: a1, previous: sub1 });
    fail(sub2, 'run2');
    const out2 = t.write(gen, 'submission.auto_rework', { submission: sub2.display_id });
    assert.equal(out2.state, 'rework');

    const sub3 = submissionRow(t, { asset: a1, previous: sub2 });
    fail(sub3, 'run3');
    assert.equal(t.db.get('SELECT COUNT(*) n FROM suggestions').n, 0);
    const out3 = t.write(gen, 'submission.auto_rework', { submission: sub3.display_id });
    assert.equal(out3.blocked, true);
    assert.ok(out3.text_human.includes('chờ Ryan'));
    // vẫn 'submitted' (op bị chặn không đổi trạng thái) và đã tạo đúng một đề xuất submission_verdict
    assert.equal(t.db.get('SELECT state FROM asset_submissions WHERE id=?', sub3.id).state, 'submitted');
    const sg = t.db.all("SELECT * FROM suggestions WHERE target_kind='submission_verdict'");
    assert.equal(sg.length, 1);
    assert.equal(sg[0].target_id, sub3.display_id);
    // chỉ 'review' (agent scope assets.review hoặc system) gọi được — agent thường bị chặn
    const noScope = agent(['compose'], 'AG-NO2');
    assert.throws(() => t.write(noScope, 'submission.auto_rework', { submission: sub1.display_id }), /quyền/);
  } finally { t.clean(); }
});

test('submission.propose: tạo đề xuất SG-, không tự đổi trạng thái', () => {
  const t = tmpDb();
  try {
    const o = owner(t.db);
    t.write(o, 'kit.sync', {});
    const a1 = putAsset(t, o);
    const sub = submissionRow(t, { asset: a1 });
    const gen = agent(['assets.review'], 'AG-GEN');
    const sg = t.write(gen, 'submission.propose', { submission: sub.display_id, verdict: 'approve', reason: 'Đủ tiêu chí M, đề xuất duyệt.' });
    assert.equal(sg.diff.verdict, 'approve');
    assert.equal(t.db.get('SELECT state FROM asset_submissions WHERE id=?', sub.id).state, 'submitted', 'propose không tự đổi trạng thái');
    assert.throws(() => t.write(gen, 'submission.propose', { submission: sub.display_id, verdict: 'approve' }), /lý do/i);
    // Gen không có quyền duyệt/từ chối — không có op nào cho agent tự đổi state (xem ghi chú phạm vi gói A)
    assert.ok(!t.write.ops.includes('submission.approve'));
  } finally { t.clean(); }
});

test('check.waive: chỉ ownerUi, lý do ≥ 10 ký tự, chỉ thêm hàng', () => {
  const t = tmpDb();
  try {
    const o = owner(t.db);
    t.write(o, 'kit.sync', {});
    const a1 = putAsset(t, o);
    const sub = submissionRow(t, { asset: a1 });
    const gen = agent(['assets.review'], 'AG-GEN');
    t.write(gen, 'submission.record_checks', { submission: sub.display_id, run_id: 'r1', results: [{ criterion: 'CH-04', level: 'fail' }] });
    assert.throws(() => t.write(o, 'check.waive', { submission: sub.display_id, criterion: 'CH-04', reason: 'ngắn' }), /10 ký tự/);
    assert.throws(() => t.write(gen, 'check.waive', { submission: sub.display_id, criterion: 'CH-04', reason: 'Ryan xem tay, đạt yêu cầu' }), /quyền/, 'Gen không miễn được');
    const r = t.write(o, 'check.waive', { submission: sub.display_id, criterion: 'CH-04', reason: 'Ryan xem tay, đạt yêu cầu' });
    assert.equal(r.level, 'waived');
    assert.equal(r.reason, 'Ryan xem tay, đạt yêu cầu');
    assert.equal(t.db.get('SELECT checks_level FROM asset_submissions WHERE id=?', sub.id).checks_level, 'ok', 'waived không còn tính là fail');
    // owner qua HTTP (không UI) bị chặn (ownerUi)
    const ownerHttp = { ...o, entry: 'http' };
    assert.throws(() => t.write(ownerHttp, 'check.waive', { submission: sub.display_id, criterion: 'CH-04', reason: 'Ryan xem tay, đạt yêu cầu' }), /quyền/);
  } finally { t.clean(); }
});

test('kit.certify: chặn khi còn M fail; ghi kit_certs chỉ-thêm; không chứng nhận trùng (asset, ô, major, subject_rev)', () => {
  const t = tmpDb();
  try {
    const o = owner(t.db);
    t.write(o, 'kit.sync', {});
    const a1 = putAsset(t, o);
    t.write(o, 'slot.assign', { asset: a1.display_id, kit_slot: 'nhi.id.01' });
    const gen = agent(['assets.review'], 'AG-GEN');
    t.write(gen, 'submission.record_checks', { asset: a1.display_id, run_id: 'r1', results: [{ criterion: 'CH-01', level: 'fail' }] });
    assert.throws(() => t.write(o, 'kit.certify', { asset: a1.display_id }), /fail/);
    t.write(o, 'check.waive', { asset: a1.display_id, criterion: 'CH-01', reason: 'Đo lại bằng tay, đạt.' });
    const cert = t.write(o, 'kit.certify', { asset: a1.display_id });
    assert.equal(cert.kit_slot, 'nhi.id.01');
    assert.equal(cert.via, 'certify');
    assert.throws(() => t.write(o, 'kit.certify', { asset: a1.display_id }), /đã có chứng nhận/);
    assert.throws(() => t.db.run("UPDATE kit_certs SET via='approve' WHERE id=?", cert.id), /chỉ thêm/);
    assert.throws(() => t.db.run('DELETE FROM kit_certs WHERE id=?', cert.id), /chỉ thêm/);
    // Gen không chứng nhận được (INTENT INT-GK-04)
    assert.throws(() => t.write(gen, 'kit.certify', { asset: a1.display_id }), /quyền/);
  } finally { t.clean(); }
});

test('fetch_log.prune: chỉ xoá hàng quá hạn giữ 180 ngày; chỉ system gọi được', () => {
  const t = tmpDb();
  try {
    const o = owner(t.db);
    const old = new Date(Date.now() - 200 * 86400e3).toISOString();
    const recent = new Date().toISOString();
    t.db.insertRow('asset_fetch_log', { token_id: 'AG-X', at: old, result: 'ok' });
    t.db.insertRow('asset_fetch_log', { token_id: 'AG-X', at: recent, result: 'ok' });
    assert.throws(() => t.write(o, 'fetch_log.prune', {}), /quyền/, 'owner không gọi được — chỉ system');
    const r = t.write(system, 'fetch_log.prune', {});
    assert.equal(r.deleted, 1);
    assert.equal(t.db.get('SELECT COUNT(*) n FROM asset_fetch_log').n, 1);
    // chỉ thêm — không sửa
    const row = t.db.get('SELECT * FROM asset_fetch_log LIMIT 1');
    assert.throws(() => t.db.run("UPDATE asset_fetch_log SET result='quota' WHERE id=?", row.id), /chỉ thêm/);
  } finally { t.clean(); }
});

test('agent.create: nhận thêm scope assets.submit/assets.review (bọc, không sửa lõi); scope lõi vẫn bị chặn như cũ', () => {
  const t = tmpDb();
  try {
    const o = owner(t.db);
    const ag = t.write(o, 'agent.create', { name: 'Muse', scopes: ['assets.submit'] });
    assert.ok(ag.agent.scopes.includes('assets.submit'));
    assert.ok(ag.agent.scopes.includes('read'), 'không gửi scope lõi nào ⇒ mặc định read');
    const gen = t.write(o, 'agent.create', { name: 'Gen-review', scopes: ['compose', 'assets.review'] });
    assert.deepEqual(gen.agent.scopes.sort(), ['assets.review', 'compose']);
    assert.throws(() => t.write(o, 'agent.create', { name: 'Bad', scopes: ['compose', 'không-hợp-lệ'] }), /read, compose, run/);
  } finally { t.clean(); }
});
