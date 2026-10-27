// © 2026 Gen Labs — All rights reserved.
// Test gói A: cổng write() — quyền, lược đồ bài, version, superseded, audit, sự kiện.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createWriter, anchorIndex } = require('../server/write');
const { tmpDb, basics, lessonBody, agent, owner } = require('./a-helpers');

const rejects = (fn, code) => assert.throws(fn, (e) => e.name === 'WriteError' && e.code === code && typeof e.text_human === 'string');

test('op lạ và actor sai bị từ chối', () => {
  const t = tmpDb();
  const o = owner(t.db);
  rejects(() => t.write(o, 'review.create', {}), 'invalid');
  rejects(() => t.write({ type: 'user', id: 'x' }, 'settings.set', {}), 'invalid');
  t.clean();
});

test('agent compose không sửa trường chính sách kênh (CNS-036) nhưng sửa được phần khác', () => {
  const t = tmpDb();
  const b = basics(t.write, t.db);
  const ag = agent(['read', 'compose']);
  rejects(() => t.write(ag, 'channel.update', { channel: b.ch.display_id, data: { schedule: { cron: '* * * * *' } } }), 'forbidden');
  rejects(() => t.write(ag, 'channel.create', { name: 'Z', data: { loudness: { lufs: -5 } } }), 'forbidden');
  const u = t.write(ag, 'channel.update', { channel: b.ch.display_id, data: { style: { b: 2 } } });
  assert.equal(u.version, 2);
  const data = JSON.parse(t.db.get('SELECT data FROM channel_versions WHERE entity_id=? AND version=2', b.ch.id).data);
  assert.deepEqual(data.schedule, { cron: '0 6 * * *' }); // giữ nguyên chính sách cũ
  assert.deepEqual(data.style, { b: 2 });
  // owner sửa được
  t.write(b.o, 'channel.update', { channel: b.ch.display_id, data: { schedule: { cron: '0 7 * * *' } } });
  t.clean();
});

test('ma trận quyền: agent read/assistant/cli không soạn; agent không có op chạm provider/agent/settings', () => {
  const t = tmpDb();
  const b = basics(t.write, t.db);
  rejects(() => t.write(agent(['read']), 'lesson.submit', lessonBody(b)), 'forbidden');
  rejects(() => t.write({ type: 'assistant', entry: 'assistant' }, 'lesson.submit', lessonBody(b)), 'forbidden');
  rejects(() => t.write({ type: 'cli', entry: 'cli' }, 'channel.create', { name: 'x' }), 'forbidden');
  const ag = agent(['read', 'compose', 'run']);
  for (const [opn, p] of [['agent.create', { name: 'x' }], ['provider.save', { vendor: 'g', kind: 'tts' }], ['settings.set', { key: 'a', value: 1 }],
    ['work_order.create', { channel: b.ch.display_id, kind: 'manual' }], ['suggestion.apply', { suggestion: 'SG-0001' }]]) {
    rejects(() => t.write(ag, opn, p), 'forbidden');
  }
  // trợ lý chỉ tạo gợi ý
  const sg = t.write({ type: 'assistant', entry: 'assistant' }, 'suggestion.create', { target_kind: 'lesson', target_id: 'LS-0001', diff: { a: 1 } });
  assert.equal(sg.display_id, 'SG-0001');
  rejects(() => t.write({ type: 'user', id: 'u', role: 'reviewer', entry: 'ui' }, 'channel.create', { name: 'x' }), 'forbidden');
  t.clean();
});

test('agent.create trả token một lần, chỉ lưu băm; audit không chứa token', () => {
  const t = tmpDb();
  const o = owner(t.db);
  const r = t.write(o, 'agent.create', { name: 'Bot', kind: 'token', scopes: ['read', 'compose'] });
  assert.match(r.token, /^gst_/);
  assert.equal(r.agent.display_id, 'AG-0001');
  const row = t.db.get('SELECT * FROM agent_tokens');
  assert.notEqual(row.token_hash, r.token);
  assert.equal(row.prefix, r.token.slice(0, 8));
  assert.ok(!JSON.stringify(t.db.all('SELECT * FROM audit_log')).includes(r.token));
  rejects(() => t.write(o, 'agent.create', { name: 'Bad', scopes: ['root'] }), 'invalid');
  t.write(o, 'agent.revoke', { agent: 'AG-0001' });
  rejects(() => t.write({ type: 'agent', id: 'AG-0001', scopes: ['compose'], entry: 'mcp' }, 'channel.create', { name: 'x' }), 'forbidden');
  t.clean();
});

test('provider.save mã hoá key, không trả key', () => {
  const t = tmpDb();
  const o = owner(t.db);
  const pv = t.write(o, 'provider.save', { vendor: 'gemini', kind: 'tts', model: 'm', key: 'AIza-TOPSECRET' });
  assert.equal(pv.display_id, 'PV-0001');
  assert.ok(!JSON.stringify(pv).includes('TOPSECRET'));
  assert.ok(!JSON.stringify(t.db.all('SELECT * FROM audit_log')).includes('TOPSECRET'));
  assert.equal(require('../server/secrets').get(t.db, t.db.ws, pv.secret_name), 'AIza-TOPSECRET');
  t.clean();
});

test('anchorIndex quy ra vị trí từ', () => {
  assert.equal(anchorIndex('Anh Gen ơi, sao A.I. nói sai', 'A.I.'), 4);
  assert.equal(anchorIndex('Thì Hà Nội chiếm', 'Hà Nội'), 1);
  assert.equal(anchorIndex('Thì Hà Nội chiếm', 'xyz'), -1);
  assert.equal(anchorIndex('Đó là hallucination.', 'hallucination'), 2);
});

test('lesson.submit: thiếu neo / neo sai bị từ chối, kèm danh sách lỗi', () => {
  const t = tmpDb();
  const b = basics(t.write, t.db);
  const noAnchor = lessonBody(b, { beats: [{ block: 'title', params: { text: 'x' } }] });
  assert.throws(() => t.write(b.o, 'lesson.submit', noAnchor), (e) => e.code === 'invalid' && /neo/.test(e.text_human) && e.detail.errors.length === 1);
  const badWord = lessonBody(b, { beats: [{ block: 'title', anchor: { line: 0, word: 'không có' }, params: {} }] });
  rejects(() => t.write(b.o, 'lesson.submit', badWord), 'invalid');
  const otherLine = lessonBody(b, { beats: [{ block: 'title', anchor: { line: 0, word: 'A.I.' }, params: {} }] }); // 'A.I.' ở câu 2, không ở câu 1
  rejects(() => t.write(b.o, 'lesson.submit', otherLine), 'invalid');
  rejects(() => t.write(b.o, 'lesson.submit', lessonBody(b, { beats: [{ block: 'khong-co', anchor: { line: 0, word: 'chào' }, params: {} }] })), 'invalid');
  rejects(() => t.write(b.o, 'lesson.submit', lessonBody(b, { lines: [{ who: 'CM-9999', say: 'x' }] })), 'invalid');
  assert.equal(t.db.get('SELECT COUNT(*) n FROM lessons').n, 0); // rollback sạch
  assert.equal(t.db.get(`SELECT COUNT(*) n FROM id_counters WHERE prefix IN ('LS','LN','BT')`).n, 0);
  t.clean();
});

test('lesson.submit dùng validateBlock truyền vào', () => {
  const t = tmpDb();
  const w = createWriter(t.db, { validateBlock: (n) => ({ ok: false, errors: [`chặn ${n}`] }) });
  const b = basics(t.write, t.db);
  assert.throws(() => w(b.o, 'lesson.submit', lessonBody(b)), (e) => /chặn title/.test(e.text_human));
  t.clean();
});

test('lesson.submit tạo lesson/version/lines/beats/render queued/run voicing, id ổn định qua version', () => {
  const t = tmpDb();
  const b = basics(t.write, t.db);
  const r1 = t.write(b.o, 'lesson.submit', lessonBody(b));
  assert.equal(r1.lesson.display_id, 'LS-0001');
  assert.equal(r1.version.version, 1);
  assert.equal(r1.render.display_id, 'RD-0001');
  assert.equal(r1.render.state, 'queued');
  const run = t.db.get(`SELECT * FROM runs WHERE render_id=?`, r1.render.id);
  assert.equal(run.kind, 'voicing'); assert.equal(run.state, 'queued');
  const beat = t.db.get('SELECT * FROM beats');
  assert.equal(beat.display_id, 'BT-0001'); assert.equal(beat.anchor_line_display_id, 'LN-0001'); assert.equal(beat.anchor_word_index, 1);
  // version 2: giữ LN-0001 (sửa), câu mới cấp LN-0003
  const body2 = lessonBody(b, { lesson: 'LS-0001', title: 'Bài thử v2' });
  body2.lines = [{ id: 'LN-0001', who: b.m1.display_id, say: 'Chào các bạn thật nhiều' }, { who: b.m2.display_id, say: 'Câu mới hoàn toàn' }];
  body2.beats = [{ id: 'BT-0001', block: 'title', anchor: { line: 'LN-0001', word: 'thật' }, params: { text: 'v2' } }];
  const r2 = t.write(b.o, 'lesson.submit', body2);
  assert.equal(r2.version.version, 2);
  assert.equal(r2.lesson.display_id, 'LS-0001');
  assert.equal(r2.lesson.current_version, 2);
  assert.equal(r2.render.display_id, 'RD-0002');
  const ids = t.db.all(`SELECT l.display_id d, v.version v FROM lines l JOIN lesson_versions v ON v.id=l.lesson_version_id ORDER BY v.version, l.ord`);
  assert.deepEqual(ids.map((x) => `${x.v}:${x.d}`), ['1:LN-0001', '1:LN-0002', '2:LN-0001', '2:LN-0003']);
  assert.equal(t.db.get('SELECT state FROM lesson_versions WHERE version=1').state, 'superseded');
  t.clean();
});

test('render cũ chưa duyệt chuyển superseded, run cũ bị huỷ; render đã duyệt giữ nguyên', () => {
  const t = tmpDb();
  const b = basics(t.write, t.db);
  const r1 = t.write(b.o, 'lesson.submit', lessonBody(b));
  const r2 = t.write(b.o, 'lesson.submit', lessonBody(b, { lesson: r1.lesson.display_id }));
  assert.equal(t.db.get('SELECT state FROM renders WHERE id=?', r1.render.id).state, 'superseded');
  assert.equal(t.db.get('SELECT state FROM runs WHERE render_id=?', r1.render.id).state, 'cancelled');
  assert.equal(t.db.get('SELECT state FROM renders WHERE id=?', r2.render.id).state, 'queued');
  assert.equal(t.db.get('SELECT latest_render_id l FROM lessons').l, r2.render.id);
  // render đã approved không bị đụng
  t.db.run(`UPDATE renders SET state='approved' WHERE id=?`, r2.render.id);
  t.write(b.o, 'lesson.submit', lessonBody(b, { lesson: r1.lesson.display_id }));
  assert.equal(t.db.get('SELECT state FROM renders WHERE id=?', r2.render.id).state, 'approved');
  t.clean();
});

test('submit gắn work_order: assigned → fulfilled; WO đã đóng thì từ chối', () => {
  const t = tmpDb();
  const b = basics(t.write, t.db);
  const cu = t.write(b.o, 'curriculum.save', { channel: b.ch.display_id, title: 'Bài 1' });
  const wo = t.write(b.o, 'work_order.create', { channel: b.ch.display_id, kind: 'new_lesson', curriculum_node: cu.display_id });
  rejects(() => t.write(b.o, 'work_order.create', { channel: b.ch.display_id, kind: 'new_lesson', curriculum_node: cu.display_id }), 'conflict');
  const ag = t.write(b.o, 'agent.create', { name: 'A', scopes: ['read', 'compose', 'run'] }).agent;
  const a = agent(['read', 'compose', 'run'], ag.display_id);
  const r = t.write(a, 'lesson.submit', lessonBody(b, { curriculum_node: cu.display_id, work_order: wo.display_id }));
  const w = t.db.get('SELECT * FROM work_orders WHERE id=?', wo.id);
  assert.equal(w.state, 'fulfilled'); assert.equal(w.agent_id, ag.id); assert.equal(w.lesson_id, r.lesson.id);
  assert.equal(t.db.get('SELECT status s FROM curriculum_nodes').s, 'in_progress');
  rejects(() => t.write(a, 'lesson.submit', lessonBody(b, { work_order: wo.display_id })), 'invalid');
  t.clean();
});

test('work_order.complete: chỉ agent run & đúng agent; cancel chỉ owner', () => {
  const t = tmpDb();
  const b = basics(t.write, t.db);
  const a1 = t.write(b.o, 'agent.create', { name: 'A1', scopes: ['run'] }).agent;
  const a2 = t.write(b.o, 'agent.create', { name: 'A2', scopes: ['run'] }).agent;
  const wo = t.write(b.o, 'work_order.create', { channel: b.ch.display_id, kind: 'manual', agent: a1.display_id });
  require('../server/state').transitionWorkOrder(t.db, wo.id, 'assigned');
  rejects(() => t.write(agent(['run'], a2.display_id), 'work_order.complete', { work_order: wo.display_id }), 'forbidden');
  rejects(() => t.write(agent(['compose'], a1.display_id), 'work_order.complete', { work_order: wo.display_id }), 'forbidden');
  rejects(() => t.write(agent(['run'], a1.display_id), 'work_order.cancel', { work_order: wo.display_id }), 'forbidden');
  const done = t.write(agent(['run'], a1.display_id), 'work_order.complete', { work_order: wo.display_id, summary: 'xong' });
  assert.equal(done.state, 'fulfilled'); assert.equal(done.summary, 'xong');
  t.clean();
});

test('asset.put: dedupe theo sha256, ghi đĩa, từ chối SVG có script', () => {
  const t = tmpDb();
  const b = basics(t.write, t.db);
  const png = Buffer.from('89504e470d0a1a0a0000', 'hex');
  const a1 = t.write(b.o, 'asset.put', { kind: 'image', bytes: png, mime: 'image/png', meta: { w: 1 } });
  const a2 = t.write(agent(['compose']), 'asset.put', { kind: 'image', bytes: png, mime: 'image/png' });
  assert.equal(a1.display_id, a2.display_id); assert.equal(a2.deduped, true);
  assert.ok(require('node:fs').existsSync(require('node:path').join(t.dir, a1.path)));
  rejects(() => t.write(b.o, 'asset.put', { kind: 'svg', bytes: Buffer.from('<svg><script>alert(1)</script></svg>'), mime: 'image/svg+xml' }), 'invalid');
  t.write(b.o, 'asset.put', { kind: 'svg', bytes: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>'), mime: 'image/svg+xml' });
  t.clean();
});

test('mọi op ghi 1 dòng audit và phát change sau commit; lỗi thì không phát và không audit', () => {
  const t = tmpDb();
  const ev = new EventEmitter();
  const got = [];
  ev.on('change', (e) => got.push(e));
  const w = createWriter(t.db, { events: ev });
  const o = owner(t.db);
  const before = t.db.get('SELECT COUNT(*) n FROM audit_log').n;
  w(o, 'settings.set', { key: 'default_channel', value: 'CH-0001' });
  assert.equal(t.db.get('SELECT COUNT(*) n FROM audit_log').n, before + 1);
  assert.deepEqual(got.map((e) => e.entity), ['setting']);
  const au = t.db.json(t.db.get('SELECT * FROM audit_log ORDER BY ts DESC, id DESC LIMIT 1'));
  assert.equal(au.action, 'settings.set'); assert.match(au.actor, /^user:/); assert.equal(au.entry, 'ui');
  assert.throws(() => w(agent(['read']), 'settings.set', { key: 'a', value: 1 }));
  assert.equal(got.length, 1);
  assert.equal(t.db.get('SELECT COUNT(*) n FROM audit_log').n, before + 1);
  t.clean();
});

test('sửa đồng thời: row_version lệch → conflict', () => {
  const t = tmpDb();
  const b = basics(t.write, t.db);
  const cu = t.write(b.o, 'curriculum.save', { channel: b.ch.display_id, title: 'A' });
  t.write(b.o, 'curriculum.save', { id: cu.display_id, title: 'B', row_version: 1 });
  rejects(() => t.write(b.o, 'curriculum.save', { id: cu.display_id, title: 'C', row_version: 1 }), 'conflict');
  t.clean();
});
