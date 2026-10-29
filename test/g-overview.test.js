// © 2026 Gen Labs — All rights reserved.
// Gói O (SPEC-0.2.0 §7, §10, §16): Tổng quan v2 — mỗi công thức có số kỳ vọng tính tay từ fixture cố định (F5-1), tương thích 0.1.x (F5-3), hạn mức chưa biết ⇒ null (F5-5);
// "đã đăng" tự đặt khi owner xuất từ UI + công tắc owner (ma trận §10, mỗi ô ✗ có test âm).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { tmpDb, basics, owner, agent } = require('./a-helpers.js');
const { buildV2, register, zonedMidnight, isoWeekKey } = require('../server/routes/overview.js');
const pipeline = require('../server/pipeline.js');
const { createMcp } = require('../server/mcp.js');
const auth = require('../server/auth.js');

const code = (c) => (e) => e.name === 'WriteError' && e.code === c;
// Đồng hồ cố định: 2026-10-28 12:00 giờ Hà Nội (UTC+7) — thứ Tư, tuần ISO 2026-W44.
const NOW = new Date('2026-10-28T05:00:00.000Z');
const iso = (s) => new Date(s).toISOString();

// ---------- fixture ----------
function build() {
  const t = tmpDb(), { db, write } = t;
  const b = basics(write, db);                       // CH-0001: lịch 06:00 per_run=1 (cron "0 6 * * *")
  const A = b.ch;
  const B = write(b.o, 'channel.create', { name: 'B', data: { schedule: { time: '07:00', per_run: 3 }, publish: { per_day: 2 } } });   // per_day theo chính sách (2) thắng per_run (3)
  const C = write(b.o, 'channel.create', { name: 'C', data: { schedule: { time: '08:00', per_run: 2 } } });                              // per_day từ lịch (2)
  const D = write(b.o, 'channel.create', { name: 'D', data: { publish: { per_day: 0 } } });                                             // per_day = 0, không lịch ⇒ không chia cho 0
  const chId = (x) => db.get('SELECT id FROM channels WHERE display_id=?', x.display_id).id;
  const user = db.get("SELECT id FROM users WHERE username='owner1'");
  const ag = write(b.o, 'agent.create', { name: 'AG', scopes: ['read', 'compose', 'run'] });
  const agId = db.get('SELECT id FROM agents WHERE display_id=?', ag.agent.display_id).id;

  const wo = (ch, kind, state, opened_at, extra = {}) => db.insertRow('work_orders', Object.assign({ channel_id: chId(ch), kind, state, brief: 'b', opened_at, created_at: opened_at }, extra), { prefix: 'WO' });
  let nl = 0;
  const lesson = (ch, title, created, wrow, state = 'submitted') => {
    nl++;
    const l = db.insertRow('lessons', { channel_id: chId(ch), title, created_at: created }, { prefix: 'LS' });
    const lv = db.insertRow('lesson_versions', { lesson_id: l.id, version: 1, state, work_order_id: wrow ? wrow.id : null, created_at: created });
    return { l, lv };
  };
  const render = (lv, state, created, f = {}) => db.insertRow('renders', Object.assign({ lesson_version_id: lv.id, state, state_changed_at: created, created_at: created }, f), { prefix: 'RD' });
  const review = (r, decision, created, secs) => db.insertRow('reviews', { render_id: r.id, decision, decided_by: user.id, review_seconds: secs, created_at: created }, { prefix: 'RV' });
  const gate = (kind, subject, result, extra = {}) => db.insertRow('gate_results', Object.assign({ subject_kind: kind, subject_id: subject, gate: 'G-WAV', result }, extra), { prefix: 'GT' });
  const run = (kind, state, started, finished, f = {}) => db.insertRow('runs', Object.assign({ kind, state, started_at: started, finished_at: finished, created_at: started }, f), { prefix: 'RN' });

  // --- Render trong kỳ 7 ngày (từ 2026-10-21T17:00Z) ---
  const w1 = wo(A, 'new_lesson', 'fulfilled', iso('2026-10-28T00:00:00Z'));
  const w2 = wo(A, 'new_lesson', 'fulfilled', iso('2026-10-25T15:40:00Z'));
  const w3 = wo(A, 'unblock', 'stalled', iso('2026-10-24T02:10:00Z'));
  const w4 = wo(A, 'new_lesson', 'assigned', iso('2026-10-26T02:00:00Z'), { agent_id: agId });
  const x1 = lesson(A, 'Bài 1', iso('2026-10-28T00:00:00Z'), w1), R1 = render(x1.lv, 'approved', iso('2026-10-28T00:00:00Z'), { awaiting_review_at: iso('2026-10-28T00:30:00Z'),
    outputs: { thumbs: [{ w1280: 'AS-lo', score: 1, pass: true }, { w1280: 'AS-hi', score: 5, pass: true }, { w1280: 'AS-fail', score: 9, pass: false }] } });
  const x2 = lesson(A, 'Bài 2', iso('2026-10-25T15:00:00Z'), w2), R2 = render(x2.lv, 'approved', iso('2026-10-25T15:00:00Z'), { awaiting_review_at: iso('2026-10-25T16:00:00Z'), thumbnail_pick: 'AS-pick' });
  const x3 = lesson(A, 'Bài 3', iso('2026-10-24T02:00:00Z'), w3), R3 = render(x3.lv, 'changes_requested', iso('2026-10-24T02:00:00Z'), { awaiting_review_at: iso('2026-10-24T03:00:00Z') });
  const x4 = lesson(A, 'Bài 4', iso('2026-10-26T02:00:00Z'), w4), R4 = render(x4.lv, 'awaiting_review', iso('2026-10-26T02:00:00Z'), { awaiting_review_at: iso('2026-10-26T02:10:00Z') });
  const x5 = lesson(A, 'Bài 5', iso('2026-10-26T04:00:00Z'), null), R5 = render(x5.lv, 'awaiting_review', iso('2026-10-26T04:00:00Z'), { awaiting_review_at: iso('2026-10-26T04:20:00Z') });
  const x6 = lesson(A, 'Bài 6', iso('2026-10-27T05:00:00Z'), null), R6 = render(x6.lv, 'awaiting_review', iso('2026-10-27T05:00:00Z'), { awaiting_review_at: iso('2026-10-27T05:20:00Z'), outputs: { cover: 'AS-c' } });
  lesson(A, 'Nháp', iso('2026-10-27T00:00:00Z'), null, 'draft');   // draft không tính "submitted"
  // --- ngoài 7 ngày, trong 30 ngày ---
  const x7 = lesson(A, 'Bài 7', iso('2026-10-10T03:00:00Z'), null), R7 = render(x7.lv, 'approved', iso('2026-10-10T03:00:00Z'), { awaiting_review_at: iso('2026-10-10T03:30:00Z'), published_at: iso('2026-10-11T00:00:00Z'), published_by: user.id, published_source: 'manual' });
  // --- cũ (tháng 8): kho clip đã duyệt chưa đăng của các kênh + trạng thái pipeline ---
  const old = iso('2026-08-01T00:00:00Z');
  const approvedOld = (ch, k) => { const x = lesson(ch, 'Kho', old, null); for (let i = 0; i < k; i++) render(x.lv, 'approved', old); return x; };
  approvedOld(B, 7); approvedOld(C, 1); approvedOld(D, 4);
  const xp = lesson(A, 'Pipeline', old, null);
  render(xp.lv, 'rendering', old); render(xp.lv, 'queued', old); render(xp.lv, 'blocked', old); render(xp.lv, 'waiting_quota', old);

  // --- review: R1 hôm nay (01:00Z = 08:00 local), R2 chót 23:59 CN 25/10 local (= 16:59Z, vẫn W43), R3 yêu cầu sửa, R7 (W41) ---
  review(R1, 'approved', iso('2026-10-28T01:00:00Z'), 120);
  review(R2, 'approved', iso('2026-10-25T16:59:00Z'), 300);
  review(R3, 'changes_requested', iso('2026-10-25T01:00:00Z'), 180);
  review(R7, 'approved', iso('2026-10-10T03:40:00Z'), 60);
  // --- cổng: R4 trượt cổng của Render; R5 trượt cổng của Voice clip sinh trong run của R5; R1 có một lần fail ở Voice clip của Render KHÁC (không tính) ---
  gate('render', R4.id, 'fail');
  const vrun = run('voicing', 'done', iso('2026-10-26T04:01:00Z'), iso('2026-10-26T04:05:00Z'), { render_id: R5.id });
  gate('voice_clip', 'VC-x', 'fail', { run_id: vrun.id });
  gate('render', R6.id, 'pass');
  // --- runs render: 200 s + 224 s (trong 7 ngày), 1000 s ngày 10/10 (chỉ trong 30 ngày), 1 failed (loại), tts cost, agent_wake ---
  run('rendering', 'done', iso('2026-10-27T01:00:00Z'), iso('2026-10-27T01:03:20Z'));
  run('render', 'done', iso('2026-10-26T01:00:00Z'), iso('2026-10-26T01:03:44Z'));
  run('rendering', 'done', iso('2026-10-10T01:00:00Z'), iso('2026-10-10T01:16:40Z'));
  run('rendering', 'failed', iso('2026-10-26T05:00:00Z'), iso('2026-10-26T05:09:00Z'));
  run('tts', 'done', iso('2026-10-28T00:01:00Z'), iso('2026-10-28T00:02:00Z'), { render_id: R1.id, cost: { calls: 4 } });
  run('tts', 'done', iso('2026-10-28T00:03:00Z'), iso('2026-10-28T00:04:00Z'), { render_id: R1.id, cost: { calls: 3 } });   // R1 = 7
  run('voicing', 'done', iso('2026-10-25T15:01:00Z'), iso('2026-10-25T15:02:00Z'), { render_id: R2.id, cost: { calls: 5 } });   // R2 = 5
  run('tts', 'done', iso('2026-10-24T02:01:00Z'), iso('2026-10-24T02:02:00Z'), { render_id: R3.id, cost: { calls: 6 } });   // R3 = 6 ⇒ TB 6
  run('tts', 'done', old, old, { render_id: db.get("SELECT id FROM renders WHERE state='queued'").id, cost: { calls: 100 } });   // ngoài 7 Render gần nhất ⇒ bỏ
  run('agent_wake', 'done', iso('2026-10-28T02:00:00Z'), iso('2026-10-28T02:01:00Z'));
  run('agent_wake', 'done', iso('2026-10-28T03:00:00Z'), iso('2026-10-28T03:01:00Z'));
  run('agent_wake', 'done', iso('2026-10-27T10:00:00Z'), iso('2026-10-27T10:01:00Z'));   // hôm qua (địa phương)

  // --- lệnh sản xuất khác: open ×2 (một cái giữ mục giáo trình), cancelled ×1 ---
  const cuRows = {};
  const cu = (key, ch, title, ord, status, parent) => { cuRows[key] = db.insertRow('curriculum_nodes', { channel_id: chId(ch), title, ord, status, parent_id: parent ? cuRows[parent].id : null }, { prefix: 'CU' }); return cuRows[key]; };
  cu('a', A, 'Gốc A', 1, 'in_progress'); cu('a1', A, 'A1', 1, 'done', 'a'); cu('a2', A, 'A2', 2, 'done', 'a'); cu('a3', A, 'A3', 3, 'todo', 'a');
  cu('b', A, 'Gốc B', 2, 'todo'); cu('c', A, 'Gốc C', 5, 'todo'); cu('d', A, 'Gốc D', 6, 'todo'); cu('e', A, 'Gốc E', 7, 'todo');
  const del = cu('x', A, 'Đã xoá', 9, 'done'); db.update('curriculum_nodes', del.id, { deleted_at: iso('2026-10-01T00:00:00Z') });
  wo(A, 'new_lesson', 'open', iso('2026-10-28T04:00:00Z'), { curriculum_node_id: cuRows.b.id });
  wo(A, 'manual', 'open', iso('2026-10-28T04:30:00Z'));
  wo(A, 'manual', 'cancelled', iso('2026-10-20T00:00:00Z'));

  // --- nhân vật, asset, auth ---
  db.update('cast_members', b.m1.id, { status: 'candidate' });
  const asset = (kind, mime, source, n) => db.insertRow('assets', { kind, sha256: 'h' + n, path: 'x/' + n, bytes: 10, mime, source }, { prefix: 'AS' });
  asset('image', 'image/png', 'upload', 1); asset('audio', 'audio/wav', 'upload', 2); asset('svg', 'image/svg+xml', 'upload', 3);
  const att = asset('image', 'image/png', 'upload', 4);
  db.insertRow('asset_rights', { asset_id: att.id, action: 'attest', basis: 'owner_upload', by: user.id, at: iso('2026-10-28T00:00:00Z') });
  db.insertRow('oauth_clients', { client_id: 'c1', name: 'cli', created_at: iso('2026-10-28T00:00:00Z') });
  const areq = (st, exp) => db.insertRow('auth_requests', { kind: 'oauth', channel: 'internal', client_id: 'c1', scopes_requested: 'read', status: st, expires_at: exp, created_at: iso('2026-10-28T00:00:00Z') }, { prefix: 'AR' });
  areq('pending', iso('2026-10-28T06:00:00Z')); areq('pending', iso('2026-10-28T04:00:00Z')); areq('denied', iso('2026-10-28T06:00:00Z'));   // chỉ cái pending chưa hết hạn

  // --- nhà cung cấp giọng + usage (día theo múi giờ workspace) ---
  const pv = (kind, model, enabled, scan) => db.insertRow('providers', { kind, vendor: 'v', model, enabled, scan }, { prefix: 'PV' });
  const P1 = pv('tts', 'm1', 1, { quota: { value: 0, of: 10, source: 'learned_429' } });
  const P2 = pv('tts', 'm2', 1, null);
  const P3 = pv('tts', 'm3', 0, null), PJ = pv('judge', 'j', 1, null);
  const use = (p, day, calls) => db.run('INSERT INTO provider_usage(provider_id, day, calls, errors_429) VALUES(?,?,?,0)', p.id, day, calls);
  use(P1, '2026-10-28', 6); use(P1, '2026-10-27', 20); use(P2, '2026-10-28', 3); use(P3, '2026-10-28', 1); use(PJ, '2026-10-28', 50);
  return { t, db, write, b, ch: { A, B, C, D }, R: { R1, R2, R3, R4, R5, R6, R7 }, P: { P1, P2 }, user };
}

test('F5-1 module cards: mỗi số khớp truy vấn đối chứng viết tay', () => {
  const f = build();
  try {
    const v = buildV2(f.db, { now: NOW });
    const m = Object.fromEntries(v.modules.map((x) => [x.key, x]));
    assert.deepEqual(v.modules.map((x) => x.key), ['review', 'agent_auth', 'work_orders', 'pipeline', 'cast', 'asset_rights']);
    assert.equal(m.review.pending, 3);                                    // R4, R5, R6
    assert.equal(m.agent_auth.pending, 1);                                // pending + chưa hết hạn
    assert.deepEqual([m.work_orders.pending, m.work_orders.assigned, m.work_orders.stalled], [2, 1, 1]);
    assert.deepEqual([m.pipeline.running, m.pipeline.blocked, m.pipeline.waiting_quota], [2, 1, 1]);   // rendering+queued
    assert.equal(m.cast.pending, 1);
    assert.equal(m.asset_rights.pending, 2);                              // png + wav chưa attest; svg exempt, png đã attest
    assert.equal(m.review.href, '#/review'); assert.equal(m.asset_rights.href, '#/assets?q=rights:pending'); assert.equal(m.cast.href, '#/cast?q=status:candidate');
    // đối chiếu SQL độc lập cho thẻ review
    assert.equal(f.db.get("SELECT COUNT(*) AS n FROM renders WHERE state='awaiting_review'").n, m.review.pending);
  } finally { f.t.clean(); }
});

test('F5-1 kpi_period 7d: số kỳ vọng tính tay', () => {
  const f = build();
  try {
    const v = buildV2(f.db, { period: '7d', now: NOW });
    assert.deepEqual(v.period, { key: '7d', from: '2026-10-21T17:00:00.000Z', to: NOW.toISOString(), tz: 'Asia/Ho_Chi_Minh' });
    // submitted: 6 lesson_versions (không tính bản nháp); renders: R1..R6; approved: R1+R2
    // first_pass: awaiting_review_at trong kỳ = R1..R6 (6); loại R3 (WO unblock), R4 (cổng Render fail), R5 (cổng Voice clip fail) ⇒ 3/6
    // order→review: R1 30, R2 20, R3 50, R4 10 phút ⇒ trung vị (20+30)/2 = 25 · render TB (200+224)/2 = 212 · review (2,5,3) trung vị 3
    assert.deepEqual(v.kpi_period, { submitted: 6, renders: 6, approved: 2, first_pass_rate: 0.5, median_order_to_review_min: 25, avg_render_s: 212, median_review_min: 3 });
  } finally { f.t.clean(); }
});

test('F5-1 kpi_period 30d và month: cửa sổ đổi, công thức đúng', () => {
  const f = build();
  try {
    const v = buildV2(f.db, { period: '30d', now: NOW });
    assert.equal(v.period.from, '2026-09-28T17:00:00.000Z');   // 29 ngày trước 00:00 địa phương 28/10 = 29/9 00:00 local
    // thêm R7: submitted 7 · renders 7 · approved 3 · first_pass 4/7 · order→review: không có WO nên vẫn 25 · render (200+224+1000)/3 = 474.7 · review (1,2,3,5) ⇒ 2.5
    assert.deepEqual(v.kpi_period, { submitted: 7, renders: 7, approved: 3, first_pass_rate: 0.57, median_order_to_review_min: 25, avg_render_s: 474.7, median_review_min: 2.5 });
    const mo = buildV2(f.db, { period: 'month', now: NOW });
    assert.equal(mo.period.from, '2026-09-30T17:00:00.000Z');   // 00:00 local 1/10
    assert.equal(mo.kpi_period.renders, 7);                     // cả R7 (10/10) nằm trong tháng 10
    assert.equal(buildV2(f.db, { period: 'month', now: new Date('2026-10-28T05:00:00Z') }).kpi_period.approved, 3);
  } finally { f.t.clean(); }
});

test('F5-1 kpi_today + hạn mức giọng + calls_per_lesson (provider_usage.day theo múi giờ workspace)', () => {
  const f = build();
  try {
    const v = buildV2(f.db, { now: NOW });
    // hôm nay (từ 17:00Z 27/10): render R1 · approved R1 · voice_calls = 6 + 3 + 1 (provider tắt vẫn đếm, judge không) · agent_wake 2 (1 cái là hôm qua) · kẹt = 1 blocked + 1 WO stalled
    assert.deepEqual(v.kpi_today, { renders: 1, approved: 1, voice_calls: 10, voice_limit: null, agent_wakes: 2, stuck: 2 });
    const [q1, q2] = v.risks.voice_quota;
    assert.equal(v.risks.voice_quota.length, 2, 'provider tắt và judge không có mặt');
    // calls_per_lesson = TB(7, 5, 6) = 6 (run 100 calls thuộc Render ngoài 7 gần nhất bị bỏ); remaining 10-6 = 4 ⇒ lessons_left floor(4/6)=0 ⇒ warn
    assert.deepEqual(q1, { provider: 'PV-0001', model: 'm1', used_today: 6, limit: 10, limit_source: 'learned_429', remaining: 4, calls_per_lesson: 6, lessons_left: 0,
      resets_at: '2026-10-28T17:01:00.000Z', level: 'warn' });
    // F5-5: chưa biết hạn mức ⇒ KHÔNG số bịa
    assert.deepEqual(q2, { provider: 'PV-0002', model: 'm2', used_today: 3, limit: null, limit_source: 'unknown', remaining: null, calls_per_lesson: 6, lessons_left: null,
      resets_at: '2026-10-28T17:01:00.000Z', level: 'unknown' });
  } finally { f.t.clean(); }
});

test('F5-1 hạn mức: ranh giới ngày theo múi giờ workspace (22:00 UTC đã là ngày mai ở Hà Nội), hết hạn ⇒ danger, of không có ⇒ value là số còn lại', () => {
  const f = build();
  try {
    const late = new Date('2026-10-27T18:00:00Z');   // 27/10 ở UTC nhưng 01:00 ngày 28/10 ở Hà Nội
    const v = buildV2(f.db, { now: late });
    assert.equal(v.risks.voice_quota[0].used_today, 6, 'đọc usage của ngày 2026-10-28 (giờ workspace), không phải 2026-10-27 (UTC)');
    assert.equal(v.kpi_today.voice_calls, 10);
    assert.equal(v.kpi_today.renders, 0, '"hôm nay" bắt đầu 00:00 địa phương = 17:00Z 27/10; render gần nhất 28/10 00:00Z còn ở tương lai so với now');
    assert.equal(v.risks.voice_quota[0].resets_at, '2026-10-28T17:01:00.000Z');
    // đổi múi giờ workspace sang UTC: ngày hôm nay = 27/10 ⇒ usage 20 của P1
    f.db.run("UPDATE workspaces SET timezone='UTC'");
    const u = buildV2(f.db, { now: late });
    assert.equal(u.risks.voice_quota[0].used_today, 20);
    assert.equal(u.risks.voice_quota[0].remaining, 0); assert.equal(u.risks.voice_quota[0].level, 'danger');
    // value không có `of` ⇒ giống pipeline: value = lượt còn lại, hạn mức tổng chưa biết
    f.db.update('providers', f.P.P2.id, { scan: { quota: { value: 7, source: 'api' } } });
    const w = buildV2(f.db, { now: late });
    assert.deepEqual([w.risks.voice_quota[1].limit, w.risks.voice_quota[1].remaining, w.risks.voice_quota[1].limit_source, w.risks.voice_quota[1].lessons_left], [null, 7, 'api', 1]);
  } finally { f.t.clean(); }
});

test('F5-1 runway: policy per_day thắng lịch, per_day từ lịch, per_day=0 ⇒ null (không chia 0), level theo ngưỡng', () => {
  const f = build();
  try {
    const rw = Object.fromEntries(buildV2(f.db, { now: NOW }).risks.runway.map((x) => [x.channel, x]));
    // A: R1+R2 chưa đăng (R7 đã đăng) = 2, lịch per_run 1 ⇒ 2 ngày ⇒ warn
    assert.deepEqual(rw['CH-0001'], { channel: 'CH-0001', approved_unpublished: 2, per_day: 1, per_day_source: 'schedule', days: 2, level: 'warn' });
    // B: 7 clip, publish.per_day=2 (policy thắng per_run 3) ⇒ floor(3.5)=3 ⇒ ok
    assert.deepEqual(rw['CH-0002'], { channel: 'CH-0002', approved_unpublished: 7, per_day: 2, per_day_source: 'policy', days: 3, level: 'ok' });
    // C: 1 clip, lịch per_run 2 ⇒ 0 ngày ⇒ danger
    assert.deepEqual(rw['CH-0003'], { channel: 'CH-0003', approved_unpublished: 1, per_day: 2, per_day_source: 'schedule', days: 0, level: 'danger' });
    // D: per_day 0 và không lịch ⇒ không xác định
    assert.deepEqual(rw['CH-0004'], { channel: 'CH-0004', approved_unpublished: 4, per_day: null, per_day_source: null, days: null, level: 'unknown' });
    // đánh dấu đã đăng làm runway co lại
    f.write(owner(f.db), 'render.mark_published', { render: f.R.R1.display_id });
    assert.equal(buildV2(f.db, { now: NOW }).risks.runway[0].approved_unpublished, 1);
  } finally { f.t.clean(); }
});

test('F5-1 weekly: 8 tuần ISO (cũ→mới), ranh giới tuần theo giờ địa phương, target = Σ per_run × 7', () => {
  const f = build();
  try {
    const wk = buildV2(f.db, { now: NOW }).weekly;
    assert.deepEqual(wk.map((x) => x.week), ['2026-W37', '2026-W38', '2026-W39', '2026-W40', '2026-W41', '2026-W42', '2026-W43', '2026-W44']);
    assert.deepEqual(wk.map((x) => x.from), ['2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28', '2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26']);
    // approved: R7 10/10 (W41) · R2 lúc 23:59 CN 25/10 giờ Hà Nội = 16:59Z ⇒ W43 (không phải W44) · R1 28/10 ⇒ W44
    assert.deepEqual(wk.map((x) => x.approved), [0, 0, 0, 0, 1, 0, 1, 1]);
    assert.ok(wk.every((x) => x.target === 42), 'per_run: A 1 + B 3 + C 2 = 6, ×7 = 42');   // D không có lịch
    // isoWeekKey nhận NGÀY THỨ HAI của tuần
    assert.equal(isoWeekKey(2025, 12, 29), '2026-W01'); assert.equal(isoWeekKey(2026, 12, 28), '2026-W53'); assert.equal(isoWeekKey(2024, 12, 30), '2025-W01');
  } finally { f.t.clean(); }
});

test('F5-1 orders_by_state, curriculum (cây + next 3 theo luật lịch), recent_renders/orders', () => {
  const f = build();
  try {
    const v = buildV2(f.db, { now: NOW });
    assert.deepEqual(v.orders_by_state, { open: 2, assigned: 1, fulfilled: 2, stalled: 1, cancelled: 1 });
    // 8 mục (mục đã xoá bị loại): done 2 (A1, A2) · in_progress 1 (gốc A) · todo 5 (A3, B, C, D, E)
    assert.deepEqual([v.curriculum.total, v.curriculum.done, v.curriculum.in_progress, v.curriculum.todo], [8, 2, 1, 5]);
    assert.deepEqual(v.curriculum.by_root.map((x) => [x.title, x.done, x.in_progress, x.total]), [['Gốc A', 2, 1, 4], ['Gốc B', 0, 0, 1], ['Gốc C', 0, 0, 1], ['Gốc D', 0, 0, 1], ['Gốc E', 0, 0, 1]]);
    // next: todo theo ord, bỏ "Gốc B" (đã có lệnh open) ⇒ A3 (ord 3), C (5), D (6); E bị cắt ở 3
    assert.deepEqual(v.curriculum.next.map((x) => x.title), ['A3', 'Gốc C', 'Gốc D']);
    const rr = v.recent_renders;
    assert.deepEqual(rr.map((x) => x.id), ['RD-0001', 'RD-0006', 'RD-0005', 'RD-0004', 'RD-0002']);   // created_at giảm dần: R1, R6, R5, R4, R2
    assert.equal(rr[0].lesson, 'LS-0001'); assert.equal(rr[0].title, 'Bài 1'); assert.equal(rr[0].state, 'approved');
    assert.equal(rr[0].thumb, 'AS-hi', 'ảnh bìa tốt nhất, bỏ phương án trượt'); assert.equal(rr[4].thumb, 'AS-pick', 'ảnh đã chọn thắng'); assert.equal(rr[1].thumb, 'AS-c'); assert.equal(rr[2].thumb, null);
    assert.equal(rr[1].href, '#/review/RD-0006');
    assert.deepEqual(v.recent_orders.map((x) => x.id), ['WO-0006', 'WO-0005', 'WO-0001', 'WO-0004', 'WO-0002']);   // opened_at giảm dần, tối đa 5
    assert.deepEqual([v.recent_orders[2].kind, v.recent_orders[2].state, v.recent_orders[3].agent], ['new_lesson', 'fulfilled', 'AG-0001']);
    assert.ok(v.recent_orders[0].href.startsWith('#/work-orders?q='));
  } finally { f.t.clean(); }
});

test('xưởng mới (không Render, không lịch): không số bịa, không chia cho 0, không lỗi', () => {
  const t = tmpDb();
  try {
    const v = buildV2(t.db, { now: NOW });
    assert.deepEqual(v.kpi_period, { submitted: 0, renders: 0, approved: 0, first_pass_rate: null, median_order_to_review_min: null, avg_render_s: null, median_review_min: null });
    assert.deepEqual(v.kpi_today, { renders: 0, approved: 0, voice_calls: 0, voice_limit: null, agent_wakes: 0, stuck: 0 });
    assert.deepEqual(v.risks, { runway: [], voice_quota: [] });
    assert.equal(v.weekly.length, 8); assert.ok(v.weekly.every((w) => w.approved === 0 && w.target === 0));
    assert.deepEqual(v.recent_renders, []); assert.deepEqual(v.recent_orders, []);
    assert.deepEqual(v.curriculum, { total: 0, done: 0, in_progress: 0, todo: 0, by_root: [], next: [] });
    assert.ok(v.modules.every((m) => Object.entries(m).every(([k, x]) => typeof x !== 'number' || x === 0)));
    // kênh có lịch, 0 Render: runway 0 ngày danger (không NaN)
    const b = basics(t.write, t.db);
    assert.deepEqual(buildV2(t.db, { now: NOW }).risks.runway, [{ channel: b.ch.display_id, approved_unpublished: 0, per_day: 1, per_day_source: 'schedule', days: 0, level: 'danger' }]);
    assert.throws(() => buildV2(t.db, { period: '1y' }), (e) => e.code === 'invalid');
  } finally { t.clean(); }
});

test('hàm múi giờ: zonedMidnight đúng ở UTC+7, UTC, UTC-8 (qua ranh giới tháng)', () => {
  const lp = pipeline.localParts;
  assert.equal(zonedMidnight(lp, 2026, 10, 28, 'Asia/Ho_Chi_Minh').toISOString(), '2026-10-27T17:00:00.000Z');
  assert.equal(zonedMidnight(lp, 2026, 10, 28, 'UTC').toISOString(), '2026-10-28T00:00:00.000Z');
  assert.equal(zonedMidnight(lp, 2026, 10, 28, 'America/Los_Angeles').toISOString(), '2026-10-28T07:00:00.000Z');   // PDT = UTC-7
  assert.equal(zonedMidnight(lp, 2026, 10, 0, 'UTC').toISOString(), '2026-09-30T00:00:00.000Z', 'ngày 0 tràn về tháng trước');
});

test('F5-3 tương thích: route trả mọi khoá 0.1.x cùng kiểu + khoá v2; ?period= sai ⇒ invalid', async () => {
  const f = build();
  try {
    let handler;
    register((m, p, o, fn) => { if (p === '/api/overview') handler = fn; }, { db: f.db, config: { dataDir: f.t.dir }, J: (v) => (typeof v === 'string' ? JSON.parse(v) : v), fail: (c, text) => Object.assign(new Error(text), { code: c }) });
    const out = await handler({ url: new URL('http://x/api/overview?period=30d') });
    const old = { awaiting_review: 'number', running: 'number', pending_auth: 'number', internal_agent_off: 'boolean', stalled_work_orders: 'object', yesterday: 'object', providers: 'object', disk: 'object' };
    for (const [k, ty] of Object.entries(old)) assert.equal(typeof out[k], ty, '0.1.x: ' + k);
    for (const k of ['pairing_lost', 'next_schedule']) assert.ok(k in out, k);
    assert.deepEqual(Object.keys(out.yesterday), ['work_orders', 'renders', 'auto_fixed', 'median_minutes']);
    assert.equal(out.awaiting_review, 3); assert.equal(out.stalled_work_orders.length, 1);
    for (const k of ['period', 'modules', 'kpi_period', 'kpi_today', 'risks', 'weekly', 'orders_by_state', 'curriculum', 'recent_renders', 'recent_orders']) assert.ok(k in out, 'v2: ' + k);
    assert.equal(out.period.key, '30d');
    assert.equal((await handler({ url: new URL('http://x/api/overview') })).period.key, '7d', 'mặc định 7 ngày');
    await assert.rejects(handler({ url: new URL('http://x/api/overview?period=1y') }), (e) => e.code === 'invalid');
  } finally { f.t.clean(); }
});

// ---------- đã đăng: hook xuất + công tắc ----------
function approvedWithFiles(f, name) {
  const dir = f.t.dir;
  fs.mkdirSync(path.join(dir, 'media'), { recursive: true });
  const file = path.join(dir, 'media', name + '.mp4'); fs.writeFileSync(file, Buffer.from('xxxx'));
  const a = f.db.insertRow('assets', { kind: 'video', sha256: 's' + name, path: file, bytes: 4, mime: 'video/mp4', source: 'system' }, { prefix: 'AS' });
  const x = f.db.insertRow('lessons', { channel_id: f.db.get('SELECT id FROM channels LIMIT 1').id, title: 'E ' + name }, { prefix: 'LS' });
  const lv = f.db.insertRow('lesson_versions', { lesson_id: x.id, version: 1, state: 'submitted' });
  return f.db.insertRow('renders', { lesson_version_id: lv.id, state: 'approved', state_changed_at: f.db.now(), outputs: { mp4: a.id } }, { prefix: 'RD' });
}
const row = (db, r) => db.get('SELECT exported_at, published_at, published_by, published_source FROM renders WHERE id=?', r.id);

test('owner xuất từ UI ⇒ exported_at + published_at (source export); xuất lại không đè published_at', () => {
  const f = build();
  try {
    const r = approvedWithFiles(f, 'ui1'), o = owner(f.db);
    const ctx = { db: f.db, config: { dataDir: f.t.dir }, write: f.write };
    pipeline.exportRender(ctx, r, { actor: o, entry: 'ui' });
    const a = row(f.db, r);
    assert.ok(a.exported_at && a.published_at); assert.equal(a.published_source, 'export'); assert.equal(a.published_by, o.id);
    const audit = f.db.get("SELECT entry, actor FROM audit_log WHERE action='render.export_stamp' ORDER BY rowid DESC");
    assert.equal(audit.entry, 'ui');
    f.db.run('UPDATE renders SET published_at=? WHERE id=?', '2020-01-01T00:00:00.000Z', r.id);
    pipeline.exportRender(ctx, r, { actor: o, entry: 'ui' });
    assert.equal(row(f.db, r).published_at, '2020-01-01T00:00:00.000Z', 'đã đăng rồi ⇒ giữ nguyên');
  } finally { f.t.clean(); }
});

test('agent gọi get_export (MCP) ⇒ chỉ exported_at, KHÔNG published_at; owner qua http cũng không tự đăng', async () => {
  const f = build();
  try {
    const r = approvedWithFiles(f, 'mcp1');
    const mcp = createMcp({ db: f.db, write: f.write, config: { version: 't', dataDir: f.t.dir } });
    const tok = f.write(owner(f.db), 'agent.create', { name: 'AR', scopes: ['read', 'run'] });
    const c = auth.verifyAgentToken(f.db, tok.token);
    const res = (await mcp.handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_export', arguments: { render: r.display_id } } }, c)).result;
    assert.ok(!res.isError, JSON.stringify(res));
    const a = row(f.db, r);
    assert.ok(a.exported_at); assert.equal(a.published_at, null); assert.equal(a.published_source, null);
    // owner nhưng entry 'http' (không phải phiên UI) ⇒ chỉ exported_at
    const r2 = approvedWithFiles(f, 'http1');
    pipeline.exportRender({ db: f.db, config: { dataDir: f.t.dir }, write: f.write }, r2, { actor: Object.assign({}, owner(f.db), { entry: 'http' }), entry: 'http' });
    assert.equal(row(f.db, r2).published_at, null);
    // hook báo entry 'ui' nhưng actor KHÔNG phải owner UI ⇒ vẫn không đăng (khoá hai lớp)
    const r3 = approvedWithFiles(f, 'spoof');
    f.write.ext.hooks.run('export.after', { ctx: { write: f.write }, render: r3, actor: agent(['run']), entry: 'ui', dir: '', files: [] });
    assert.equal(row(f.db, r3).published_at, null); assert.ok(row(f.db, r3).exported_at);
  } finally { f.t.clean(); }
});

test('render.mark_published / unmark: owner UI ✓ (có audit); mọi diễn viên khác ✗ (ma trận §10); chỉ bản đã duyệt', () => {
  const f = build();
  try {
    const o = owner(f.db), id = f.R.R4.display_id;   // R4 đang awaiting_review
    assert.throws(() => f.write(o, 'render.mark_published', { render: id }), code('conflict'));
    const ok = f.R.R2.display_id;
    const m = f.write(o, 'render.mark_published', { render: ok });
    assert.equal(m.published_source, 'manual'); assert.equal(m.published_by, o.id); assert.ok(m.published_at);
    assert.equal(f.db.get("SELECT COUNT(*) AS n FROM audit_log WHERE action='render.mark_published' AND entity_id=?", ok).n, 1);
    const again = f.write(o, 'render.mark_published', { render: ok });
    assert.equal(again.published_at, m.published_at, 'idempotent');
    const u = f.write(o, 'render.unmark_published', { render: ok });
    assert.deepEqual([u.published_at, u.published_by, u.published_source], [null, null, null]);
    assert.throws(() => f.write(o, 'render.mark_published', { render: 'RD-9999' }), code('not_found'));
    // ô ✗: agent compose/run · trợ lý · CLI · runner · owner không qua UI
    const nope = [['agent compose', agent(['read', 'compose'])], ['agent run', agent(['run'])], ['trợ lý', { type: 'assistant', entry: 'assistant' }],
      ['CLI', { type: 'cli', entry: 'cli' }], ['runner', { type: 'runner', entry: 'runner' }], ['owner qua http', Object.assign({}, o, { entry: 'http' })], ['owner qua mcp', Object.assign({}, o, { entry: 'mcp' })]];
    for (const [name, a] of nope) {
      for (const opn of ['render.mark_published', 'render.unmark_published']) assert.throws(() => f.write(a, opn, { render: ok }), code('forbidden'), name + ' ' + opn);
    }
    assert.equal(f.db.get('SELECT published_at FROM renders WHERE display_id=?', ok).published_at, null, 'không diễn viên bị từ chối nào đổi được dữ liệu');
    // render.export_stamp: trợ lý/CLI/runner ✗
    for (const [name, a] of [['trợ lý', nope[2][1]], ['CLI', nope[3][1]], ['runner', nope[4][1]]]) assert.throws(() => f.write(a, 'render.export_stamp', { render: ok }), code('forbidden'), name);
    assert.ok(f.write.ops.includes('render.mark_published') && f.write.ops.includes('render.unmark_published'));
    assert.equal(f.write.opWho('render.mark_published'), 'ownerUi');
  } finally { f.t.clean(); }
});
