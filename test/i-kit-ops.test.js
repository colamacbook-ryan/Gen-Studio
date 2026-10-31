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

    // review #8: CÙNG run_id + criterion nhưng KHÁC level ⇒ conflict (trước đây level nằm trong WHERE dedupe nên lọt
    // qua, ghi thêm hàng thứ hai mâu thuẫn cho cùng một lần kiểm).
    t.write(gen, 'submission.record_checks', { submission: sub.display_id, run_id: 'r6', results: [{ criterion: 'CH-07', level: 'fail' }] });
    assert.throws(() => t.write(gen, 'submission.record_checks', { submission: sub.display_id, run_id: 'r6', results: [{ criterion: 'CH-07', level: 'ok' }] }), /conflict|khác/i);
    assert.equal(t.db.get("SELECT COUNT(*) n FROM asset_checks WHERE run_id='r6' AND criterion='CH-07'").n, 1, 'không ghi thêm hàng thứ hai mâu thuẫn');
    // severity hợp lệ được lưu; severity sai bị từ chối
    t.write(gen, 'submission.record_checks', { submission: sub.display_id, run_id: 'r7', results: [{ criterion: 'CH-08', level: 'ok', severity: 'M*' }] });
    assert.equal(t.db.get("SELECT severity FROM asset_checks WHERE run_id='r7'").severity, 'M*');
    assert.throws(() => t.write(gen, 'submission.record_checks', { submission: sub.display_id, run_id: 'r8', results: [{ criterion: 'CH-09', level: 'ok', severity: 'X' }] }), /severity/);
  } finally { t.clean(); }
});

test('server/checks/to-db.js: adapter đổi {code, level, pass, measured, note_vi} của gói E sang {criterion, severity, level}', () => {
  const { toDbResults, severityOf, levelOf } = require('../server/checks/to-db');
  assert.equal(severityOf('M'), 'M');
  assert.equal(severityOf('M*'), 'M*');
  assert.equal(severityOf('H'), 'H');
  assert.equal(severityOf('M + H'), 'M', 'tiêu chí lai M+H vẫn chặn như M (chưa cài máy đo)');
  assert.equal(levelOf(true), 'ok');
  assert.equal(levelOf(false), 'fail');
  assert.equal(levelOf(null), 'warn', 'chưa đo được ⇒ warn (không ok ngầm, không fail oan)');
  const fake = { checks: [
    { code: 'CH-01', level: 'M', pass: true, measured: { w: 2048 }, note_vi: 'đạt', note_en: 'ok' },
    { code: 'CH-02', level: 'M', pass: false, measured: {}, note_vi: 'trượt', note_en: 'fail' },
    { code: 'CH-04', level: 'M*', pass: null, measured: {}, note_vi: 'chưa đo', note_en: 'n/a' },
    { code: 'CH-09', level: 'H', pass: null, measured: {}, note_vi: 'cần Ryan', note_en: 'n/a' },
  ] };
  const rows = toDbResults(fake);
  assert.deepEqual(rows.map((r) => [r.criterion, r.severity, r.level]), [
    ['CH-01', 'M', 'ok'], ['CH-02', 'M', 'fail'], ['CH-04', 'M*', 'warn'], ['CH-09', 'H', 'warn'],
  ]);
  // kết quả adapter ghi được thẳng qua submission.record_checks (cùng hình dạng {criterion, severity, level, measured, detail})
  const t = tmpDb();
  try {
    const o = owner(t.db);
    t.write(o, 'kit.sync', {});
    const a1 = putAsset(t, o);
    const sub = submissionRow(t, { asset: a1 });
    const gen = agent(['assets.review'], 'AG-GEN');
    const okRows = rows.filter((r) => r.level !== 'fail' || true); // record_checks chỉ nhận ok/warn/fail — rows đã đúng hình dạng
    const out = t.write(gen, 'submission.record_checks', { submission: sub.display_id, run_id: 'adapter-1', results: okRows });
    assert.equal(out.written, rows.length);
    assert.equal(t.db.get("SELECT severity FROM asset_checks WHERE criterion='CH-04'").severity, 'M*');
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
    // review #5: trạng thái bền 'blocked' (không phải 'submitted' bị chặn tạm) + đúng một đề xuất submission_verdict
    assert.equal(t.db.get('SELECT state FROM asset_submissions WHERE id=?', sub3.id).state, 'blocked');
    const sg = t.db.all("SELECT * FROM suggestions WHERE target_kind='submission_verdict'");
    assert.equal(sg.length, 1);
    assert.equal(sg[0].target_id, sub3.display_id);
    // review #5: gọi lại auto_rework trên lần đã 'blocked' ⇒ idempotent, KHÔNG tạo thêm đề xuất thứ hai
    const out3b = t.write(gen, 'submission.auto_rework', { submission: sub3.display_id });
    assert.equal(out3b.blocked, true);
    assert.equal(out3b.suggestion, out3.suggestion);
    assert.equal(t.db.get('SELECT COUNT(*) n FROM suggestions').n, 1, 'không tạo thêm SG- thứ hai');
    // chỉ 'review' (agent scope assets.review hoặc system) gọi được — agent thường bị chặn
    const noScope = agent(['compose'], 'AG-NO2');
    assert.throws(() => t.write(noScope, 'submission.auto_rework', { submission: sub1.display_id }), /quyền/);
  } finally { t.clean(); }
});

test('submission.auto_rework → suggestion.apply: Ryan áp dụng đề xuất rework_blocked thì submission thật sự đổi state', () => {
  const t = tmpDb();
  try {
    const o = owner(t.db);
    t.write(o, 'kit.sync', {});
    const a1 = putAsset(t, o);
    const gen = agent(['assets.review'], 'AG-GEN');
    const fail = (sub, runId) => t.write(gen, 'submission.record_checks', { submission: sub.display_id, run_id: runId, results: [{ criterion: 'CH-02', level: 'fail' }] });
    let prev = null, sub;
    for (let i = 0; i < 3; i++) {
      sub = submissionRow(t, { asset: a1, previous: prev });
      fail(sub, 'run' + i);
      t.write(gen, 'submission.auto_rework', { submission: sub.display_id });
      prev = sub;
    }
    assert.equal(t.db.get('SELECT state FROM asset_submissions WHERE id=?', sub.id).state, 'blocked');
    const sg = t.db.get("SELECT * FROM suggestions WHERE target_kind='submission_verdict' AND target_id=?", sub.display_id);
    t.write(o, 'suggestion.apply', { suggestion: sg.display_id });
    assert.equal(t.db.get('SELECT state, decision_kind FROM asset_submissions WHERE id=?', sub.id).state, 'rework');
    assert.equal(t.db.get('SELECT decision_kind FROM asset_submissions WHERE id=?', sub.id).decision_kind, 'owner');
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

test('kit.certify: review #1 chặn khi THIẾU kết quả kiểm (không chỉ khi có fail) hoặc còn warn; review #2 chặn khi thiếu h_ticks M*/H', () => {
  const t = tmpDb();
  try {
    const o = owner(t.db);
    t.write(o, 'kit.sync', {});
    const a1 = putAsset(t, o);
    t.write(o, 'slot.assign', { asset: a1.display_id, kit_slot: 'nhi.id.01' });
    const gen = agent(['assets.review'], 'AG-GEN');
    const { requiredCriteria } = require('../server/kit-criteria');
    const req = requiredCriteria('nhi.id.01');
    assert.deepEqual(req.m.sort(), ['CH-01', 'CH-02', 'CH-03', 'GEN-FMT'].sort());
    assert.deepEqual(req.mh.sort(), ['CH-08', 'CH-09', 'CH-10'].sort());

    // review #1: CHƯA kiểm gì cả ⇒ chặn (trước đây lọt vì chỉ chặn theo "có fail")
    assert.throws(() => t.write(o, 'kit.certify', { asset: a1.display_id }), /Thiếu kết quả kiểm/);

    // ghi đủ các tiêu chí M nhưng một cái còn 'warn' ⇒ vẫn chặn
    const ok = (criterion) => t.write(gen, 'submission.record_checks', { asset: a1.display_id, run_id: 'r-' + criterion, results: [{ criterion, level: 'ok' }] });
    ok('GEN-FMT'); ok('CH-01'); ok('CH-03');
    t.write(gen, 'submission.record_checks', { asset: a1.display_id, run_id: 'r-CH-02', results: [{ criterion: 'CH-02', level: 'warn' }] });
    assert.throws(() => t.write(o, 'kit.certify', { asset: a1.display_id }), /chưa "ok"/);
    t.write(o, 'check.waive', { asset: a1.display_id, criterion: 'CH-02', reason: 'Đo lại bằng tay, đạt.' });

    // review #2: đủ M nhưng CHƯA tick M*/H ⇒ chặn (trước đây h_ticks không bắt buộc)
    assert.throws(() => t.write(o, 'kit.certify', { asset: a1.display_id }), /h_ticks/);
    assert.throws(() => t.write(o, 'kit.certify', { asset: a1.display_id, h_ticks: ['CH-08', 'CH-09'] }), /h_ticks/, 'thiếu CH-10 vẫn chặn');

    const cert = t.write(o, 'kit.certify', { asset: a1.display_id, h_ticks: ['CH-08', 'CH-09', 'CH-10'] });
    assert.equal(cert.kit_slot, 'nhi.id.01');
    assert.equal(cert.via, 'certify');
    assert.throws(() => t.write(o, 'kit.certify', { asset: a1.display_id, h_ticks: ['CH-08', 'CH-09', 'CH-10'] }), /đã có chứng nhận/);
    assert.throws(() => t.db.run("UPDATE kit_certs SET via='approve' WHERE id=?", cert.id), /chỉ thêm/);
    assert.throws(() => t.db.run('DELETE FROM kit_certs WHERE id=?', cert.id), /chỉ thêm/);
    // Gen không chứng nhận được (INTENT INT-GK-04)
    assert.throws(() => t.write(gen, 'kit.certify', { asset: a1.display_id, h_ticks: ['CH-08', 'CH-09', 'CH-10'] }), /quyền/);
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

test('agent.create: nhận thêm scope assets.submit/assets.review (bọc, không sửa lõi); review #10 KHÔNG fallback read', () => {
  const t = tmpDb();
  try {
    const o = owner(t.db);
    const ag = t.write(o, 'agent.create', { name: 'Muse', scopes: ['assets.submit'] });
    assert.deepEqual(ag.agent.scopes, ['assets.submit'], 'review #10: chỉ gửi scope Gen Kit ⇒ KHÔNG tự thêm "read"');
    const gen = t.write(o, 'agent.create', { name: 'Gen-review', scopes: ['compose', 'assets.review'] });
    assert.deepEqual(gen.agent.scopes.sort(), ['assets.review', 'compose']);
    assert.throws(() => t.write(o, 'agent.create', { name: 'Bad', scopes: ['compose', 'không-hợp-lệ'] }), /read, compose, run/);
  } finally { t.clean(); }
});
