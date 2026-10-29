// © 2026 Gen Labs — All rights reserved.
// GET /api/overview?period=7d|30d|month — SPEC-0.2.0 §7.2. Gói O (0.2.0): GIỮ nguyên mọi khoá 0.1.x (client cũ không vỡ) và THÊM các khoá v2 cùng cấp:
//   period · modules · kpi_period · kpi_today · risks{runway,voice_quota} · weekly · orders_by_state · curriculum · recent_renders · recent_orders.
// Phần v2 nằm trong buildV2(db, {period, now}) — thuần đọc DB, nhận `now` để test cố định đồng hồ. Mỗi số một công thức (xem chú thích từng khối).
// Múi giờ: MỌI ranh giới ngày/tuần/kỳ và "hôm nay" tính theo múi giờ workspace (workspaces.timezone, pipeline.wsTz). provider_usage.day cũng được GHI theo múi giờ
//   đó (pipeline.bumpUsage dùng localParts(…, wsTz)), nên used_today đọc đúng cùng khoá ngày — không cần quy đổi UTC.
// register(add, rctx): add(method, pattern, opts{sess?,ui?,strictOrigin?,raw?,pub?}, async fn({req,res,url,params,body,sess}) → object | {status,headers,body} | null)
//   rctx = { db, write, config, ctx, actorOf(c), userActor(u), fail, need(table, ref, what), J, send, readJson }
'use strict';
const fs = require('node:fs');
const events = require('../events.js');

// mọi mã asset trong outputs của Render: giá trị chuỗi (mp4, srt_vi, cover…) và outputs.thumbs[].w1280/w1920 (0.2.0, mảng — không đưa thẳng vào SQL)
function assetIdsOf(outputs) {
  const out = [];
  for (const [k, v] of Object.entries(outputs || {})) {
    if (typeof v === 'string') out.push(v);
    else if (k === 'thumbs' && Array.isArray(v)) for (const t of v) for (const f of ['w1280', 'w1920']) if (t && typeof t[f] === 'string') out.push(t[f]);
  }
  return out;
}

const PERIODS = { '7d': 7, '30d': 30, month: 0 };
const TTS_RUN_KINDS = ['tts', 'voicing'];          // seed dùng 'tts', pipeline thật đặt tên theo trạng thái: 'voicing'
const RENDER_RUN_KINDS = ['render', 'rendering'];  // như trên: SPEC ghi 'render', pipeline thật ghi 'rendering'
const r1 = (x) => Math.round(x * 10) / 10;
const J0 = (v) => { if (typeof v === 'string') { try { return JSON.parse(v); } catch { return v; } } return v; };
function median(a) {
  if (!a.length) return null;
  const s = a.slice().sort((x, y) => x - y), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
// 00:00 địa phương của ngày y-m-d (d có thể tràn/âm) theo múi giờ tz, trả Date (UTC). Hiệu chỉnh hai lần để đúng cả khi qua mốc DST.
function zonedMidnight(localParts, y, m, d, tz) {
  let t = Date.UTC(y, m - 1, d);
  for (let i = 0; i < 2; i++) {
    const p = localParts(new Date(t), tz);
    t -= Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - Date.UTC(y, m - 1, d);
  }
  return new Date(t);
}
const dayStr = (y, m, d) => new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10);
function isoWeekKey(y, m, d) {   // ISO 8601: tuần chứa thứ Năm
  const th = new Date(Date.UTC(y, m - 1, d + 3));
  const iy = th.getUTCFullYear();
  return `${iy}-W${String(Math.ceil(((th - Date.UTC(iy, 0, 1)) / 864e5 + 1) / 7)).padStart(2, '0')}`;
}
// Hạn mức giọng: STD-10 — chưa biết ⇒ null, KHÔNG bịa. Cùng nghĩa với pipeline: quota.of = tổng hạn mức; không có `of` mà có value ⇒ value = số lượt CÒN lại (lúc quét).
function quotaOf(scan, used) {
  const q = scan && scan.quota;
  if (!q || !q.source || q.source === 'unknown') return { limit: null, remaining: null, source: 'unknown' };
  if (typeof q.of === 'number') return { limit: q.of, remaining: Math.max(0, q.of - used), source: q.source };
  if (typeof q.value === 'number') return { limit: null, remaining: Math.max(0, q.value), source: q.source };
  return { limit: null, remaining: null, source: 'unknown' };
}

function buildV2(db, { period = '7d', now = new Date() } = {}) {
  const { localParts, wsTz, nextMidnightIso } = require('../pipeline.js');
  const { parseSchedule } = require('../scheduler.js');
  const { RIGHTS_SQL } = require('../rights.js');
  if (!Object.hasOwn(PERIODS, period)) { const e = new Error('Kỳ không hợp lệ (7d | 30d | month).'); e.code = 'invalid'; e.text_human = e.message; e.detail = { period }; throw e; }
  const ws = db.ws, tz = wsTz(db), p = localParts(now, tz);
  const n = (sql, ...a) => db.get(sql, ...a).n;
  const mid = (dOff) => zonedMidnight(localParts, p.y, p.m, p.d + dOff, tz);
  // kỳ: 7d/30d = N ngày LỊCH kết thúc hôm nay (gồm hôm nay); month = từ mùng 1 tháng này. to = bây giờ.
  const from = period === 'month' ? zonedMidnight(localParts, p.y, p.m, 1, tz) : mid(1 - PERIODS[period]);
  const f = from.toISOString(), t = now.toISOString(), today0 = mid(0).toISOString();

  // ---- thẻ phân hệ (mỗi số = COUNT trên đúng bảng mà href mở) ----
  const woCount = (st) => n('SELECT COUNT(*) AS n FROM work_orders WHERE workspace_id=? AND state=?', ws, st);
  const rcount = (st) => n('SELECT COUNT(*) AS n FROM renders WHERE workspace_id=? AND state=?', ws, st);
  const RUNNING = "('queued','voicing','judging','aligning','rendering','mixing','gating','retrying')";
  const modules = [
    { key: 'review', pending: rcount('awaiting_review'), href: '#/review' },
    { key: 'agent_auth', pending: n("SELECT COUNT(*) AS n FROM auth_requests WHERE workspace_id=? AND status='pending' AND expires_at>=?", ws, t), href: '#/agents?view=pending' },
    { key: 'work_orders', pending: woCount('open'), assigned: woCount('assigned'), stalled: woCount('stalled'), href: '#/work-orders?q=state:open' },
    { key: 'pipeline', running: n('SELECT COUNT(*) AS n FROM renders WHERE workspace_id=? AND state IN ' + RUNNING, ws), blocked: rcount('blocked'), waiting_quota: rcount('waiting_quota'), href: '#/pipeline' },
    { key: 'cast', pending: n("SELECT COUNT(*) AS n FROM cast_members WHERE workspace_id=? AND deleted_at IS NULL AND status='candidate'", ws), href: '#/cast?q=status:candidate' },
    { key: 'asset_rights', pending: n(`SELECT COUNT(*) AS n FROM assets a WHERE a.workspace_id=? AND (${RIGHTS_SQL})='pending'`, ws), href: '#/assets?q=rights:pending' },
  ];

  // ---- Theo kỳ ----
  // first_pass_rate: Render vào awaiting_review trong kỳ, không có gate fail (của Render, hoặc của Voice clip sinh trong run của Render đó), không do WO 'unblock' ⇒ / tổng
  const fp = db.all(`SELECT r.id,
      (SELECT 1 FROM gate_results g WHERE g.subject_kind='render' AND g.subject_id=r.id AND g.result='fail' LIMIT 1) AS rf,
      (SELECT 1 FROM lesson_versions lv JOIN work_orders w ON w.id=lv.work_order_id WHERE lv.id=r.lesson_version_id AND w.kind='unblock') AS ub
    FROM renders r WHERE r.workspace_id=? AND r.awaiting_review_at>=? AND r.awaiting_review_at<=?`, ws, f, t);
  // Voice clip trượt cổng: gate_results của clip nối với Render qua run sinh ra nó. Quét MỘT lần phía gate (chỉ hàng fail) rồi tra Set — tương quan theo từng Render là O(n·m) (đo: 730 ms/2.000 Render)
  const vfail = fp.length ? new Set(db.all("SELECT DISTINCT rn.render_id AS id FROM gate_results g JOIN runs rn ON rn.id=g.run_id WHERE g.subject_kind='voice_clip' AND g.result='fail' AND rn.render_id IS NOT NULL").map((x) => x.id)) : new Set();
  const passed = fp.filter((x) => !x.rf && !vfail.has(x.id) && !x.ub).length;
  const o2r = db.all(`SELECT r.awaiting_review_at AS a, w.opened_at AS o FROM renders r JOIN lesson_versions lv ON lv.id=r.lesson_version_id JOIN work_orders w ON w.id=lv.work_order_id
    WHERE r.workspace_id=? AND r.awaiting_review_at>=? AND r.awaiting_review_at<=?`, ws, f, t).map((x) => (Date.parse(x.a) - Date.parse(x.o)) / 60000).filter(Number.isFinite);
  const rk = RENDER_RUN_KINDS.map(() => '?').join(',');
  const art = db.get(`SELECT AVG((julianday(finished_at)-julianday(started_at))*86400.0) AS v FROM runs INDEXED BY ix_runs_kind_state WHERE workspace_id=? AND kind IN (${rk}) AND state='done'
    AND started_at IS NOT NULL AND finished_at>=? AND finished_at<=?`, ws, ...RENDER_RUN_KINDS, f, t).v;
  const revs = db.all('SELECT review_seconds FROM reviews WHERE workspace_id=? AND review_seconds IS NOT NULL AND created_at>=? AND created_at<=?', ws, f, t).map((x) => x.review_seconds / 60);
  const kpi_period = {
    submitted: n("SELECT COUNT(*) AS n FROM lesson_versions WHERE workspace_id=? AND state IN ('submitted','superseded') AND created_at>=? AND created_at<=?", ws, f, t),
    renders: n('SELECT COUNT(*) AS n FROM renders WHERE workspace_id=? AND created_at>=? AND created_at<=?', ws, f, t),
    approved: n("SELECT COUNT(*) AS n FROM reviews WHERE workspace_id=? AND decision='approved' AND created_at>=? AND created_at<=?", ws, f, t),
    first_pass_rate: fp.length ? Math.round((passed / fp.length) * 100) / 100 : null,
    median_order_to_review_min: o2r.length ? r1(median(o2r)) : null,
    avg_render_s: art == null ? null : r1(art),
    median_review_min: revs.length ? r1(median(revs)) : null,
  };

  // ---- Hạn mức giọng + calls_per_lesson ----
  const tts = db.all("SELECT * FROM providers WHERE workspace_id=? AND kind='tts' AND deleted_at IS NULL ORDER BY display_id", ws);
  const usedOn = (pid) => (db.get('SELECT calls FROM provider_usage WHERE provider_id=? AND day=?', pid, p.day) || { calls: 0 }).calls;
  const tk = TTS_RUN_KINDS.map(() => '?').join(',');
  // calls_per_lesson = TB (tổng runs.cost.calls loại tts của từng Render) trên ≤ 7 Render gần nhất có số liệu; chưa có số liệu ⇒ null (không bịa)
  // 7 Render gần nhất lấy trước (ít dòng) rồi tra runs theo ix_runs_render — gộp thành một câu con làm planner quét cả bảng runs (đo: 58 ms/50.000 Run)
  const last7 = db.all('SELECT id FROM renders WHERE workspace_id=? ORDER BY created_at DESC, id DESC LIMIT 7', ws).map((x) => x.id);
  const cpl = last7.length ? db.all(`SELECT SUM(json_extract(rn.cost,'$.calls')) AS calls FROM runs rn INDEXED BY ix_runs_render WHERE rn.render_id IN (${last7.map(() => '?').join(',')}) AND rn.kind IN (${tk})
      AND json_valid(rn.cost) GROUP BY rn.render_id HAVING calls IS NOT NULL`, ...last7, ...TTS_RUN_KINDS).map((x) => x.calls) : [];
  const callsPerLesson = cpl.length ? r1(cpl.reduce((a, b) => a + b, 0) / cpl.length) : null;
  const resetsAt = nextMidnightIso(db, now);
  const voice_quota = tts.filter((pv) => pv.enabled).map((pv) => {
    const used = usedOn(pv.id), q = quotaOf(J0(pv.scan), used);
    const left = q.remaining !== null && callsPerLesson ? Math.floor(q.remaining / callsPerLesson) : null;
    let level = 'ok';   // unknown: chưa biết hạn mức · danger: hết · warn: đủ < 2 bài hoặc còn < 20% hạn mức
    if (q.remaining === null) level = 'unknown';
    else if (q.remaining <= 0) level = 'danger';
    else if ((left !== null && left < 2) || (q.limit && q.remaining / q.limit < 0.2)) level = 'warn';
    return { provider: pv.display_id, model: pv.model || null, used_today: used, limit: q.limit, limit_source: q.source, remaining: q.remaining,
      calls_per_lesson: callsPerLesson, lessons_left: left, resets_at: resetsAt, level };
  });
  const knownLimits = voice_quota.length > 0 && voice_quota.every((v) => v.limit !== null);

  // ---- Hôm nay (từ 00:00 địa phương) ----
  const kpi_today = {
    renders: n('SELECT COUNT(*) AS n FROM renders WHERE workspace_id=? AND created_at>=? AND created_at<=?', ws, today0, t),
    approved: n("SELECT COUNT(*) AS n FROM reviews WHERE workspace_id=? AND decision='approved' AND created_at>=? AND created_at<=?", ws, today0, t),
    voice_calls: tts.reduce((s, pv) => s + usedOn(pv.id), 0),
    voice_limit: knownLimits ? voice_quota.reduce((s, v) => s + v.limit, 0) : null,
    agent_wakes: n("SELECT COUNT(*) AS n FROM runs INDEXED BY ix_runs_kind_state WHERE workspace_id=? AND kind='agent_wake' AND created_at>=? AND created_at<=?", ws, today0, t),
    stuck: rcount('blocked') + woCount('stalled'),
  };

  // ---- kênh: runway ----
  const chans = db.all('SELECT * FROM channels WHERE workspace_id=? AND deleted_at IS NULL ORDER BY display_id', ws).map((ch) => {
    const v = db.json(db.get('SELECT data FROM channel_versions WHERE entity_id=? AND version=?', ch.id, ch.current_version));
    return Object.assign({}, ch, { data: (v && v.data) || {} });
  });
  const unpub = Object.fromEntries(db.all(`SELECT l.channel_id AS c, COUNT(*) AS n FROM renders r JOIN lesson_versions lv ON lv.id=r.lesson_version_id JOIN lessons l ON l.id=lv.lesson_id
    WHERE r.workspace_id=? AND r.state='approved' AND r.published_at IS NULL GROUP BY l.channel_id`, ws).map((x) => [x.c, x.n]));
  let perRunSum = 0;
  const runway = chans.map((ch) => {
    const sc = parseSchedule(ch.data.schedule), pol = ch.data.publish && ch.data.publish.per_day;
    if (sc) perRunSum += sc.per_run;
    const hasPol = typeof pol === 'number' && Number.isFinite(pol) && pol > 0;
    const perDay = hasPol ? pol : sc ? sc.per_run : null, nUn = unpub[ch.id] || 0;
    const days = perDay ? Math.floor(nUn / perDay) : null;   // không có per_day ⇒ null (không chia cho 0, không bịa)
    return { channel: ch.display_id, approved_unpublished: nUn, per_day: perDay, per_day_source: hasPol ? 'policy' : sc ? 'schedule' : null, days,
      level: days === null ? 'unknown' : days < 1 ? 'danger' : days < 3 ? 'warn' : 'ok' };
  });

  // ---- 8 tuần ISO gần nhất (cũ → mới), tuần bắt đầu thứ Hai theo giờ địa phương; target = Σ per_run các kênh × 7 ----
  const dow = new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay(), back = (dow + 6) % 7;
  const weeks = [];
  for (let i = 7; i >= 0; i--) {
    const off = -back - 7 * i;
    weeks.push({ start: zonedMidnight(localParts, p.y, p.m, p.d + off, tz), week: isoWeekKey(p.y, p.m, p.d + off), from: dayStr(p.y, p.m, p.d + off), approved: 0, target: perRunSum * 7 });
  }
  for (const rv of db.all("SELECT created_at FROM reviews WHERE workspace_id=? AND decision='approved' AND created_at>=? AND created_at<=?", ws, weeks[0].start.toISOString(), t)) {
    const ms = Date.parse(rv.created_at);
    for (let i = weeks.length - 1; i >= 0; i--) if (ms >= weeks[i].start.getTime()) { weeks[i].approved++; break; }
  }

  // ---- lệnh sản xuất, giáo trình ----
  const orders_by_state = { open: 0, assigned: 0, fulfilled: 0, stalled: 0, cancelled: 0 };
  db.all('SELECT state, COUNT(*) AS n FROM work_orders WHERE workspace_id=? GROUP BY state', ws).forEach((x) => { orders_by_state[x.state] = x.n; });
  const cs = Object.fromEntries(db.all('SELECT status, COUNT(*) AS n FROM curriculum_nodes WHERE workspace_id=? AND deleted_at IS NULL GROUP BY status', ws).map((x) => [x.status, x.n]));
  const by_root = db.all(`WITH RECURSIVE t(root, id, status) AS (
      SELECT id, id, status FROM curriculum_nodes WHERE workspace_id=? AND parent_id IS NULL AND deleted_at IS NULL
      UNION ALL SELECT t.root, c.id, c.status FROM curriculum_nodes c JOIN t ON c.parent_id=t.id WHERE c.deleted_at IS NULL)
    SELECT r.display_id AS id, r.title, COUNT(*) AS total, SUM(t.status='done') AS done, SUM(t.status='in_progress') AS in_progress
    FROM t JOIN curriculum_nodes r ON r.id=t.root GROUP BY t.root ORDER BY r.channel_id, r.ord, r.display_id`, ws);
  // next: 3 mục todo kế tiếp theo đúng luật của lịch (scheduler.openScheduled): thứ tự ord, bỏ mục đã có lệnh đang mở/giao/kẹt
  const next = db.all(`SELECT c.display_id AS id, c.title, ch.display_id AS channel FROM curriculum_nodes c JOIN channels ch ON ch.id=c.channel_id
    WHERE c.workspace_id=? AND c.status='todo' AND c.deleted_at IS NULL
      AND c.id NOT IN (SELECT curriculum_node_id FROM work_orders WHERE curriculum_node_id IS NOT NULL AND state IN ('open','assigned','stalled'))
    ORDER BY c.ord, c.display_id LIMIT 3`, ws);
  const curriculum = { total: (cs.todo || 0) + (cs.in_progress || 0) + (cs.done || 0), done: cs.done || 0, in_progress: cs.in_progress || 0, todo: cs.todo || 0,
    by_root: by_root.map((x) => ({ id: x.id, title: x.title, done: x.done, in_progress: x.in_progress, total: x.total })), next };

  // ---- danh sách gần đây (5) ----
  const thumbOf = (o, pick) => {
    if (pick) return pick;
    if (!o) return null;
    const th = Array.isArray(o.thumbs) ? o.thumbs.filter((x) => x && x.pass !== false && x.w1280) : [];
    return th.length ? th.reduce((a, b) => ((b.score || 0) > (a.score || 0) ? b : a)).w1280 : o.cover || null;
  };
  const recent_renders = db.all(`SELECT r.display_id AS id, l.display_id AS lesson, l.title, r.state, r.created_at AS at, r.state_changed_at, r.outputs, r.thumbnail_pick, lv.aspect
    FROM renders r JOIN lesson_versions lv ON lv.id=r.lesson_version_id JOIN lessons l ON l.id=lv.lesson_id
    WHERE r.workspace_id=? ORDER BY r.created_at DESC, r.rowid DESC LIMIT 5`, ws).map((x) => ({ id: x.id, lesson: x.lesson, title: x.title, state: x.state, at: x.at, state_at: x.state_changed_at, aspect: x.aspect || '16:9',   // F7: NULL (bài cũ) = 16:9
    thumb: thumbOf(J0(x.outputs), x.thumbnail_pick), href: x.state === 'awaiting_review' ? '#/review/' + x.id : '#/pipeline?q=' + encodeURIComponent('display_id:' + x.id) }));
  const recent_orders = db.all(`SELECT w.display_id AS id, w.kind, w.state, a.display_id AS agent, w.opened_at AS at FROM work_orders w LEFT JOIN agents a ON a.id=w.agent_id
    WHERE w.workspace_id=? ORDER BY w.opened_at DESC, w.rowid DESC LIMIT 5`, ws).map((x) => Object.assign(x, { href: '#/work-orders?q=' + encodeURIComponent('display_id:' + x.id) }));

  return {
    period: { key: period, from: f, to: t, tz },
    modules, kpi_period, kpi_today,
    risks: { runway, voice_quota },
    weekly: weeks.map((w) => ({ week: w.week, from: w.from, approved: w.approved, target: w.target })),
    orders_by_state, curriculum, recent_renders, recent_orders,
  };
}

function register(add, rctx) {
  const { db, config, J, fail } = rctx;
  // thu hồi TỰ ĐỘNG (refresh bị dùng lại) của agent nội bộ mà chưa có agent nội bộ nào thay: Tổng quan hiện nút "Ghép lại"
  const pairingLost = () => {
    const last = db.get("SELECT entity_id FROM audit_log WHERE action='auth.refresh' AND after LIKE '%refresh_reuse%' ORDER BY ts DESC LIMIT 1");
    if (!last) return null;
    const ag = db.get("SELECT display_id, kind, status FROM agents WHERE display_id=?", last.entity_id);
    if (!ag || ag.kind !== 'internal' || ag.status !== 'revoked') return null;
    if (db.get("SELECT 1 AS x FROM agents WHERE kind='internal' AND status!='revoked' AND deleted_at IS NULL")) return null;
    return { agent: ag.display_id };
  };
  // từng có agent nội bộ nhưng hiện không có cái nào đang bật (đã tắt/thu hồi): Tổng quan nhắc và dẫn tới thẻ runner
  const internalOff = () => !!db.get("SELECT 1 AS x FROM agents WHERE kind='internal' AND deleted_at IS NULL") && !db.get("SELECT 1 AS x FROM agents WHERE kind='internal' AND status!='revoked' AND deleted_at IS NULL");
  add('GET', '/api/overview', { sess: true }, async ({ url }) => {
    const period = (url && url.searchParams.get('period')) || '7d';
    if (!Object.hasOwn(PERIODS, period)) throw fail('invalid', 'Kỳ không hợp lệ (7d | 30d | month).', { period });
    const n = (sql, ...p) => db.get(sql, ...p).n;
    const ACTIVE = "('queued','voicing','judging','aligning','rendering','mixing','gating','retrying','waiting_quota')";
    const t0 = new Date().toISOString(), y0 = new Date(Date.now() - 86400e3).toISOString();   // 24 giờ gần nhất (cuốn chiếu), không phải "hôm qua" theo lịch
    const done = db.all("SELECT kind, opened_at, closed_at FROM work_orders WHERE workspace_id=? AND state='fulfilled' AND closed_at>=? AND closed_at<?", db.ws, y0, t0);
    const mins = done.map(w => (Date.parse(w.closed_at) - Date.parse(w.opened_at)) / 60000).filter(Number.isFinite).sort((x, y) => x - y);
    const med = mins.length ? mins[mins.length >> 1] : null;
    let used = 0, reclaimable = 0, total = null;
    used = n('SELECT COALESCE(SUM(bytes),0) AS n FROM assets WHERE workspace_id=? AND media_present=1', db.ws);
    db.all("SELECT outputs FROM renders WHERE workspace_id=? AND state IN ('superseded','rejected') AND outputs IS NOT NULL", db.ws).forEach(r => {
      assetIdsOf(J(r.outputs)).forEach(id => { const a2 = db.get('SELECT bytes FROM assets WHERE (id=? OR display_id=?) AND media_present=1 AND source=?', id, id, 'system'); if (a2) reclaimable += a2.bytes; });
    });
    try { const st = fs.statfsSync(config.dataDir); total = st.blocks * st.bsize; } catch { total = null; }
    let next = null;
    try { next = require('../scheduler.js').nextSlot(db, new Date()); } catch (e) { events.logError('next_schedule', e); }
    return Object.assign({
      awaiting_review: n("SELECT COUNT(*) AS n FROM renders WHERE workspace_id=? AND state='awaiting_review'", db.ws),
      running: n('SELECT COUNT(*) AS n FROM renders WHERE workspace_id=? AND state IN ' + ACTIVE, db.ws),
      pending_auth: n("SELECT COUNT(*) AS n FROM auth_requests WHERE workspace_id=? AND status='pending' AND expires_at>=?", db.ws, new Date().toISOString()),
      pairing_lost: pairingLost(),
      internal_agent_off: internalOff(),
      stalled_work_orders: db.all("SELECT w.display_id, w.kind, w.brief, w.summary, w.opened_at, a.display_id AS agent FROM work_orders w LEFT JOIN agents a ON a.id=w.agent_id WHERE w.workspace_id=? AND w.state='stalled' ORDER BY w.opened_at", db.ws),
      yesterday: {
        work_orders: done.length,
        renders: n('SELECT COUNT(*) AS n FROM renders WHERE workspace_id=? AND created_at>=? AND created_at<?', db.ws, y0, t0),
        auto_fixed: done.filter(w => w.kind === 'unblock' || w.kind === 'revise').length,
        median_minutes: med === null ? null : Math.round(med * 10) / 10,
      },
      providers: db.all('SELECT display_id, kind, vendor, model, enabled, scan FROM providers WHERE workspace_id=? AND deleted_at IS NULL', db.ws).map(p => Object.assign(p, { scan: J(p.scan) })),
      next_schedule: next,
      disk: { used, total, reclaimable },
    }, buildV2(db, { period }));
  });
}

module.exports = { register, assetIdsOf, buildV2, zonedMidnight, isoWeekKey, quotaOf };
