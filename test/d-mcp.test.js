// © 2026 Gen Labs — All rights reserved.
// Gói D: MCP tools — vòng việc, validate khô, submit, phạm vi, trường chính sách, không có đường review.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { tmpDb, basics } = require('./a-helpers.js');
const { createMcp } = require('../server/mcp.js');
const auth = require('../server/auth.js');

function setup() {
  const t = tmpDb();
  const b = basics(t.write, t.db);
  const mcp = createMcp({ db: t.db, write: t.write, config: { version: 't' } });
  const mk = (scopes) => { const r = t.write(b.o, 'agent.create', { name: 'A' + scopes.join(''), scopes }); return { r, c: auth.verifyAgentToken(t.db, r.token) }; };
  const call = async (c, name, args) => (await mcp.handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args || {} } }, c)).result;
  return { t, b, mcp, mk, call };
}
const lesson = b => ({
  channel: b.ch.display_id, title: 'Bài thử',
  lines: [{ who: b.m1.display_id, say: 'Xin chào các bạn nhỏ' }, { who: b.m2.display_id, say: 'Hôm nay học về A.I. nhé', terms: ['A.I.'] }],
  beats: [{ block: 'title', anchor: { line: 0, word: 'chào' }, params: { text: 'Hi' } }],
});

test('d-mcp: vòng get_next_task → validate khô → submit → complete_task', async () => {
  const { t, b, mk, call } = setup();
  try {
    const { c } = mk(['read', 'compose', 'run']);
    const none = await call(c, 'get_next_task');
    assert.equal(none.structuredContent.task, null);
    const cu = t.write(b.o, 'curriculum.save', { channel: b.ch.display_id, title: 'Mục 1' });
    t.write(b.o, 'work_order.create', { channel: b.ch.display_id, kind: 'new_lesson', curriculum_node: cu.display_id, brief: 'Soạn bài' });
    const r1 = await call(c, 'get_next_task');
    const task = r1.structuredContent.task;
    assert.match(task.work_order, /^WO-/); assert.match(r1.content[0].text, /WO-/);
    assert.equal(task.curriculum_node.display_id, cu.display_id);
    assert.equal((await call(c, 'get_next_task')).structuredContent.task.work_order, task.work_order, 'việc đang giữ được trả lại, không nhận thêm');

    const bad = await call(c, 'validate_lesson', Object.assign(lesson(b), { beats: [{ block: 'title', anchor: { line: 0, word: 'không-có' }, params: { text: 'Hi' } }] }));
    assert.equal(bad.structuredContent.ok, false); assert.ok(bad.structuredContent.errors.length);
    const ok = await call(c, 'validate_lesson', lesson(b));
    assert.equal(ok.structuredContent.ok, true, ok.content[0].text);
    assert.equal(t.db.get('SELECT COUNT(*) AS n FROM lessons').n, 0, 'validate khô không được ghi gì');
    assert.equal(t.db.get("SELECT state FROM work_orders WHERE display_id=?", task.work_order).state, 'assigned');
    assert.equal(t.db.get("SELECT COUNT(*) AS n FROM audit_log WHERE action='lesson.submit'").n, 0);

    const sub = await call(c, 'submit_lesson', lesson(b));
    assert.ok(!sub.isError, sub.content[0].text);
    assert.match(sub.structuredContent.lesson, /^LS-/); assert.match(sub.structuredContent.render, /^RD-/);
    assert.equal(t.db.get("SELECT state FROM work_orders WHERE display_id=?", task.work_order).state, 'fulfilled', 'submit kèm work_order tự hoàn tất');
    const done = await call(c, 'complete_task', { work_order: task.work_order, summary: 'xong' });
    assert.ok(!done.isError); assert.equal(done.structuredContent.already, true);
    const gr = await call(c, 'get_render', { lesson: sub.structuredContent.lesson });
    assert.equal(gr.structuredContent.render.state, 'queued'); assert.equal(gr.structuredContent.gates.length, 8);
    const gl = await call(c, 'get_lesson', { lesson: sub.structuredContent.lesson });
    assert.equal(gl.structuredContent.doc.lines.length, 2);
    // update_lesson chỉ đổi tiêu đề → version 2, giữ câu
    const up = await call(c, 'update_lesson', { lesson: sub.structuredContent.lesson, title: 'Bài thử v2' });
    assert.ok(!up.isError, up.content[0].text); assert.equal(up.structuredContent.version, 2);
    const g2 = await call(c, 'get_lesson', { lesson: sub.structuredContent.lesson });
    assert.deepEqual(g2.structuredContent.doc.lines.map(l => l.id), gl.structuredContent.doc.lines.map(l => l.id), 'id câu ổn định qua version');
    assert.equal((await call(c, 'list_review_notes', { lesson: sub.structuredContent.lesson })).structuredContent.notes.length, 0);
  } finally { t.clean(); }
});

test('d-mcp: phạm vi + trường chính sách + magic bytes + không có đường review', async () => {
  const { t, b, mcp, mk, call } = setup();
  try {
    const ro = mk(['read']).c, comp = mk(['compose']).c, run = mk(['run']).c;
    const f = await call(ro, 'update_channel', { channel: b.ch.display_id, data: { style: { x: 1 } } });
    assert.equal(f.isError, true); assert.equal(f.structuredContent.error.code, 'forbidden');
    const pol = await call(comp, 'update_channel', { channel: b.ch.display_id, data: { schedule: { time: '01:00' } } });
    assert.equal(pol.isError, true); assert.equal(pol.structuredContent.error.code, 'forbidden');
    const okc = await call(comp, 'update_channel', { channel: b.ch.display_id, data: { style: { vui: true } }, note: 'n' });
    assert.ok(!okc.isError, okc.content[0].text); assert.ok(okc.structuredContent.version >= 2);
    const gc = await call(ro, 'get_channel', {});
    assert.equal(gc.structuredContent.channel.data.style.vui, true);
    // compose không có quyền run: get_next_task bị từ chối
    assert.equal((await call(comp, 'get_next_task')).isError, true);
    assert.equal((await call(run, 'submit_lesson', lesson(b))).isError, true);
    // upload_asset: sai magic bytes
    const up = await call(comp, 'upload_asset', { kind: 'image', mime: 'image/png', data_base64: Buffer.from('không phải png').toString('base64') });
    assert.equal(up.isError, true); assert.match(up.content[0].text, /magic|định dạng/i);
    const svg = await call(comp, 'upload_asset', { kind: 'svg', mime: 'image/svg+xml', text: '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>' });
    assert.equal(svg.isError, true);
    const svgOk = await call(comp, 'upload_asset', { kind: 'svg', mime: 'image/svg+xml', text: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><rect width="1" height="1"/></svg>' });
    assert.ok(!svgOk.isError, svgOk.content[0].text);
    const ga = await call(ro, 'get_asset', { asset: svgOk.structuredContent.asset });
    assert.ok(ga.structuredContent.asset.data_base64);
    // report_problem + heartbeat
    assert.ok(!(await call(run, 'report_problem', { code: 'heartbeat' })).isError);
    const rp = await call(run, 'report_problem', { code: 'x', text: 'lỗi thử' });
    assert.ok(!rp.isError);
    assert.equal(t.db.get("SELECT state FROM runs WHERE kind='agent_wake' AND state='failed'").state, 'failed');
    // capabilities: có khối của gói C
    const cap = await call(ro, 'get_capabilities', {});
    assert.ok(cap.structuredContent.blocks.some(x => x.name === 'title'));
    // không có tool review/xoá
    assert.equal(mcp.tools.filter(n => /approve|reject|delete|^review|remove/.test(n)).length, 0);
    const unk = await mcp.handle({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'approve_render', arguments: {} } }, comp);
    assert.equal(unk.error.code, -32602);
    assert.equal((await mcp.handle({ jsonrpc: '2.0', method: 'notifications/initialized' }, comp)), null);
    assert.equal((await mcp.handle({ jsonrpc: '2.0', id: 3, method: 'nope' }, comp)).error.code, -32601);
  } finally { t.clean(); }
});

test('d-mcp: agent chỉ hoàn tất WO của chính mình (work_order.complete qua write)', async () => {
  const { t, b, mk, call } = setup();
  try {
    const a1 = mk(['read', 'compose', 'run']).c, a2 = mk(['read', 'compose', 'run']).c;
    const cu = t.write(b.o, 'curriculum.save', { channel: b.ch.display_id, title: 'M' });
    t.write(b.o, 'work_order.create', { channel: b.ch.display_id, kind: 'new_lesson', curriculum_node: cu.display_id, brief: 'x' });
    const task = (await call(a1, 'get_next_task')).structuredContent.task;
    const r = await call(a2, 'complete_task', { work_order: task.work_order, summary: 'ăn gian' });
    assert.equal(r.isError, true); assert.equal(r.structuredContent.error.code, 'forbidden');
  } finally { t.clean(); }
});

test('d-mcp: illustration.params.asset chỉ nhận mã AS-… có thật (không nhận đường dẫn)', async () => {
  const { t, b, mk, call } = setup();
  try {
    const { c } = mk(['read', 'compose', 'run']);
    const mkL = asset => Object.assign(lesson(b), { beats: [{ block: 'illustration', anchor: { line: 0, word: 'chào' }, params: { asset } }] });
    for (const bad of ['/etc/passwd', '../../x.png', 'AS-9999']) {
      const r = await call(c, 'validate_lesson', mkL(bad));
      assert.equal(r.structuredContent.ok, false, bad);
      assert.equal((await call(c, 'submit_lesson', mkL(bad))).isError, true, bad);
    }
    assert.equal(t.db.get('SELECT COUNT(*) AS n FROM lessons').n, 0);
  } finally { t.clean(); }
});

test('d-mcp: agent báo lỗi → lệnh không bị trả lại mãi; tối đa 3 lần rồi stalled; lỗi cứng stalled ngay', async () => {
  const { t, b, mk, call } = setup();
  try {
    const { c } = mk(['read', 'compose', 'run']);
    t.write(b.o, 'work_order.create', { channel: b.ch.display_id, kind: 'manual', brief: 'x' });
    const seen = [];
    for (let i = 0; i < 6; i++) {
      const task = (await call(c, 'get_next_task')).structuredContent.task;
      if (!task) break;
      seen.push(task.work_order);
      const r = await call(c, 'report_problem', { work_order: task.work_order, code: 'cli_failed', text: 'thử' });
      assert.ok(['open', 'stalled'].includes(r.structuredContent.work_order_state));
    }
    assert.equal(seen.length, 3, 'chỉ đánh thức tối đa 3 lần cho một lệnh lỗi');
    assert.equal(t.db.get("SELECT state FROM work_orders WHERE display_id=?", seen[0]).state, 'stalled');
    // lỗi cứng: stalled ngay lần đầu
    t.write(b.o, 'work_order.create', { channel: b.ch.display_id, kind: 'manual', brief: 'y' });
    const t2 = (await call(c, 'get_next_task')).structuredContent.task;
    const r2 = await call(c, 'report_problem', { work_order: t2.work_order, code: 'cli_missing', text: 'không có claude' });
    assert.equal(r2.structuredContent.work_order_state, 'stalled');
    assert.equal((await call(c, 'get_next_task')).structuredContent.task, null);
  } finally { t.clean(); }
});

test('d-mcp: agent scope run không rút bản dựng khỏi hàng chờ duyệt; blocked thì chạy lại được, audit ghi agent:<id>', async () => {
  const { t, b, mk, call } = setup();
  try {
    const { c, r } = mk(['read', 'compose', 'run']);
    const sub = await call(c, 'submit_lesson', lesson(b));
    const rd = sub.structuredContent.render;
    const setState = s => t.db.run('UPDATE renders SET state=? WHERE display_id=?', s, rd);
    const stateOf = () => t.db.get('SELECT state FROM renders WHERE display_id=?', rd).state;
    for (const s of ['awaiting_review', 'rejected', 'changes_requested']) {
      setState(s);
      const x = await call(c, 'run_lesson', { lesson: sub.structuredContent.lesson });
      assert.ok(x.isError && /forbidden/.test(x.content[0].text), s);
      assert.equal(stateOf(), s, 'không đổi trạng thái');
      assert.equal(t.db.get('SELECT COUNT(*) AS n FROM renders').n, 1, 'không tạo render mới');
    }
    // blocked → chạy lại được, audit ghi đúng agent
    setState('blocked');
    const ok = await call(c, 'run_lesson', { lesson: sub.structuredContent.lesson });
    assert.ok(!ok.isError, ok.content[0].text);
    assert.equal(stateOf(), 'queued');
    const au = t.db.get("SELECT actor FROM audit_log WHERE action='render.queued' ORDER BY rowid DESC LIMIT 1");
    assert.match(au.actor, /^agent:/);
    // lesson.submit của agent không đè lên bản đang chờ duyệt
    setState('awaiting_review');
    const again = await call(c, 'submit_lesson', Object.assign(lesson(b), { lesson: sub.structuredContent.lesson }));
    assert.ok(again.isError && /forbidden/.test(again.content[0].text), again.content[0].text);
    assert.equal(stateOf(), 'awaiting_review');
  } finally { t.clean(); }
});
