// © 2026 Gen Labs — All rights reserved.
// Tool MCP về việc (Work order): get_next_task · get_task · complete_task · report_problem. Chuyển NGUYÊN TRẠNG từ server/mcp.js (P0b, SPEC-0.2.0 §2.4).
'use strict';
const state = require('../state.js');
const queue = require('../queue.js');
const { kit } = require('./_kit.js');

const MAX_PROBLEM_ATTEMPTS = 3;   // agent báo lỗi quá 3 lần → stalled, chủ xưởng xử lý

function tools(ctx) {
  const { db, write, S, O, need, actorOf, assigned } = kit(ctx);

  function taskView(wo) {
    const ch = db.get('SELECT display_id, name FROM channels WHERE id=?', wo.channel_id);
    const cu = wo.curriculum_node_id ? db.get('SELECT display_id, title, principle FROM curriculum_nodes WHERE id=?', wo.curriculum_node_id) : null;
    const ls = wo.lesson_id ? db.get('SELECT display_id, title, current_version FROM lessons WHERE id=?', wo.lesson_id) : null;
    const t = { work_order: wo.display_id, kind: wo.kind, state: wo.state, brief: wo.brief, attempts: wo.attempts, channel: ch, curriculum_node: cu, lesson: ls, review_notes: [], blocked: null };
    if (wo.review_id) t.review_notes = db.all('SELECT pin_kind, pin_ref, at_ms, text FROM review_notes WHERE review_id=? ORDER BY rowid', wo.review_id);
    if (wo.render_id) { const r = db.json(db.get('SELECT display_id, state, blocked_reason FROM renders WHERE id=?', wo.render_id)); if (r && r.blocked_reason) t.blocked = { render: r.display_id, reason: r.blocked_reason }; }
    t.how_to = wo.kind === 'new_lesson' ? 'Soạn bài mới và nộp bằng submit_lesson (work_order = ' + wo.display_id + ').'
      : 'Sửa bài ' + (ls ? ls.display_id : '') + ' bằng update_lesson (work_order = ' + wo.display_id + '), theo ghi chú/lý do chặn.';
    return t;
  }
  const taskText = (t) => `Việc ${t.work_order} (${t.kind}, ${t.state}) — kênh ${t.channel && t.channel.display_id}${t.curriculum_node ? ', mục ' + t.curriculum_node.display_id + ' "' + t.curriculum_node.title + '"' : ''}${t.lesson ? ', bài ' + t.lesson.display_id : ''}.\n${t.brief || ''}\n${t.review_notes.map((n) => `- ghi chú ${n.pin_ref}: ${n.text}`).join('\n')}${t.blocked ? '\nLý do chặn: ' + (t.blocked.reason.text_human || t.blocked.reason.code) : ''}\n${t.how_to}`;

  return [
    { name: 'get_next_task', scope: 'run', description: 'Lấy việc kế tiếp (Work order) được giao cho bạn; trả task=null nếu chưa có việc.', schema: {}, required: [], handler: (a, c) => {
      const ag = c.agent;
      let wo = assigned(c);
      if (!wo) {
        if (ag.wake_limit_per_day) {
          const day = new Date().toISOString().slice(0, 10);
          const n = db.get("SELECT COUNT(*) AS n FROM runs WHERE kind='agent_wake' AND created_by=? AND created_at>=?", 'agent:' + ag.id, day).n;
          if (n >= ag.wake_limit_per_day) return { text: 'Đã hết giới hạn lượt đánh thức hôm nay.', data: { task: null, reason: 'wake_limit' } };
        }
        wo = db.get("SELECT * FROM work_orders WHERE workspace_id=? AND state='open' AND (agent_id IS NULL OR agent_id=?) ORDER BY opened_at, display_id LIMIT 1", db.ws, ag.id);
        if (!wo) return { text: 'Hiện không có việc mới.', data: { task: null } };
        wo = state.transitionWorkOrder(db, wo.id, 'assigned', { agent_id: ag.id, actor: { type: 'agent', id: ag.id }, entry: 'mcp' });
        const run = queue.enqueue(db, { kind: 'agent_wake', work_order_id: wo.id, payload: { agent: ag.display_id }, created_by: 'agent:' + ag.id });
        queue.done(db, run.id, { assigned_to: ag.display_id });
      }
      const t = taskView(wo);
      return { text: taskText(t), data: { task: t } };
    } },
    { name: 'get_task', scope: 'run', description: 'Xem chi tiết một Work order.', schema: { work_order: S }, required: ['work_order'], handler: (a) => {
      const t = taskView(need('work_orders', a.work_order, 'lệnh sản xuất'));
      return { text: taskText(t), data: { task: t } };
    } },
    { name: 'complete_task', scope: 'run', description: 'Báo hoàn tất Work order kèm tóm tắt. (Nộp bài bằng submit_lesson với work_order đã tự hoàn tất lệnh.)', schema: { work_order: S, summary: S }, required: ['work_order'], handler: (a, c) => {
      const wo = need('work_orders', a.work_order, 'lệnh sản xuất');
      if (wo.state === 'fulfilled') return { text: `Lệnh ${wo.display_id} đã hoàn tất trước đó: ${wo.summary || ''}`, data: { work_order: wo.display_id, state: 'fulfilled', already: true } };
      const out = write(actorOf(c), 'work_order.complete', { work_order: wo.display_id, summary: a.summary || null });
      return { text: `Đã hoàn tất lệnh ${out.display_id}.`, data: { work_order: out.display_id, state: out.state } };
    } },
    { name: 'report_problem', scope: 'run', description: 'Báo vấn đề (code, text) hoặc nhịp sống (code="heartbeat").', schema: { work_order: S, code: S, text: S, detail: O }, required: ['code'], handler: (a, c) => {
      if (a.code === 'heartbeat') return { text: 'Đã ghi nhịp sống.', data: { ok: true } };
      const wo = a.work_order ? need('work_orders', a.work_order, 'lệnh sản xuất') : assigned(c);
      const run = queue.enqueue(db, { kind: 'agent_wake', work_order_id: wo ? wo.id : null, payload: { agent: c.agent.display_id, problem: a.code }, created_by: 'agent:' + c.agent.id });
      queue.fail(db, run.id, { code: String(a.code).slice(0, 60), text_human: String(a.text || a.code).slice(0, 500), detail: a.detail || null });
      // Lệnh đang giao cho chính agent này: trả về hàng chờ (đếm lần thử) hoặc stalled — KHÔNG để get_next_task trả lại
      // đúng lệnh đó mãi (mỗi lần là một lần đánh thức CLI, đốt lượt vô hạn).
      let woState = wo ? wo.state : null;
      if (wo && wo.state === 'assigned' && wo.agent_id === c.agent.id) {
        const hard = ['cli_missing', 'fake_unsupported', 'unsupported', 'auth_expired'].includes(String(a.code));
        const to = hard || wo.attempts + 1 >= MAX_PROBLEM_ATTEMPTS ? 'stalled' : 'open';
        const summary = to === 'stalled' ? `Agent báo lỗi ${String(a.code).slice(0, 60)}: ${String(a.text || '').slice(0, 300)}` : undefined;
        woState = state.transitionWorkOrder(db, wo.id, to, { summary, actor: { type: 'agent', id: c.agent.id }, entry: 'mcp' }).state;
      }
      return { text: `Đã ghi vấn đề ${a.code}${wo ? ' cho ' + wo.display_id + ' (lệnh: ' + woState + ')' : ''}; chủ xưởng sẽ thấy ở màn Pipeline.`, data: { ok: true, run: run.display_id, work_order_state: woState } };
    } },
  ];
}

module.exports = { tools };
