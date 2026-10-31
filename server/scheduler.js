// © 2026 Gen Labs — All rights reserved.
// Lịch: mỗi phút mở Work order theo lịch kênh ("HH:MM" mỗi ngày + per_run); WO assigned quá nhịp sống → mở lại / stalled.
'use strict';
const state = require('./state.js');
const events = require('./events.js');
const grids = require('./grids.js');
const { localParts, wsTz } = require('./pipeline.js');
const aspects = require('../render/aspects.js');
const { SESSION_TTL_MS } = require('./ops/kit.js');

const SYS = { type: 'system', id: 'scheduler', entry: 'system' };
const MAX_ATTEMPTS = 3;

// {time:'06:00', per_run:1} | {cron:'06:00 daily', per_run} | "06:00 daily" → {h, mi, per_run} | null
function parseSchedule(s) {
  if (!s) return null;
  const obj = typeof s === 'string' ? { cron: s } : s;
  const txt = String(obj.time || obj.cron || '');
  const c5 = /^\s*(\d{1,2})\s+(\d{1,2})\s+\*\s+\*\s+\*\s*$/.exec(txt);   // cron "M H * * *"
  const m = c5 ? [null, c5[2], c5[1]] : /(\d{1,2}):(\d{2})/.exec(txt);
  if (!m) return null;
  const h = +m[1], mi = +m[2];
  if (h > 23 || mi > 59) return null;
  if (obj.cron && /weekly|monthly|week|month/i.test(obj.cron)) return null; // MVP chỉ hỗ trợ hằng ngày
  const per = Number(obj.per_run);
  const per_run = Number.isInteger(per) && per > 0 ? Math.min(per, 20) : 1;
  const out = { h, mi, per_run };
  const mix = parseMix(obj.mix, per_run);
  if (mix) out.mix = mix;
  return out;
}
// F7 (CNS-334): schedule.mix = [{aspect, n}] — Σn = per_run, mỗi tỉ lệ phải đang bật; không khớp ⇒ bỏ qua (mọi lệnh lịch theo mặc định kênh như cũ). write() đã chặn mix sai lúc owner lưu.
// per_run giữ nghĩa TỔNG ⇒ Tổng quan (runway, weekly.target) không đổi công thức.
function parseMix(mix, per_run) {
  if (!Array.isArray(mix) || !mix.length) return null;
  let sum = 0;
  const out = [];
  for (const m of mix) {
    if (!m || typeof m.aspect !== 'string' || !Number.isInteger(m.n) || m.n < 1) return null;
    const g = aspects.get(m.aspect);
    if (!g || !g.enabled) return null;
    sum += m.n; out.push({ aspect: m.aspect, n: m.n });
  }
  return sum === per_run ? out : null;
}
// danh sách tỉ lệ theo thứ tự mở lệnh: [{9:16 ×1, 16:9 ×2}] → ['9:16','16:9','16:9']
const expandMix = (mix) => (mix ? mix.flatMap((m) => Array(m.n).fill(m.aspect)) : []);
// Thời điểm (UTC) của h:mi theo giờ địa phương của tz vào ngày y-m-d.
function zoned(y, m, d, h, mi, tz) {
  const guess = Date.UTC(y, m - 1, d, h, mi);
  const p = localParts(new Date(guess), tz);
  return new Date(guess - (Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi) - guess));
}
function slotAround(now, sc, tz) {
  const p = localParts(now, tz);
  const today = zoned(p.y, p.m, p.d, sc.h, sc.mi, tz);
  const prev = zoned(p.y, p.m, p.d - 1, sc.h, sc.mi, tz), next = zoned(p.y, p.m, p.d + 1, sc.h, sc.mi, tz);
  return today <= now ? { latest: today, next } : { latest: prev, next: today };
}
function channels(db) {
  return db.all('SELECT * FROM channels WHERE workspace_id=? AND deleted_at IS NULL ORDER BY display_id', db.ws).map(ch => {
    const v = db.json(db.get('SELECT data FROM channel_versions WHERE entity_id=? AND version=?', ch.id, ch.current_version));
    return Object.assign({}, ch, { data: (v && v.data) || {} });
  });
}
// Lần mở lịch kế tiếp (ISO) của mọi kênh, hoặc null.
function nextSlot(db, now = new Date()) {
  const tz = wsTz(db);
  let best = null;
  channels(db).forEach(ch => { const sc = parseSchedule(ch.data.schedule); if (sc) { const n = slotAround(now, sc, tz).next; if (!best || n < best) best = n; } });
  return best ? best.toISOString() : null;
}

function openScheduled(ctx, now = new Date()) {
  const { db, write } = ctx;
  const tz = wsTz(db), opened = [];
  for (const ch of channels(db)) {
    const sc = parseSchedule(ch.data.schedule);
    if (!sc) continue;
    const slot = slotAround(now, sc, tz).latest.toISOString();
    if (db.get("SELECT 1 AS x FROM work_orders WHERE channel_id=? AND kind='new_lesson' AND opened_at>=?", ch.id, slot)) continue;
    const nodes = db.all(
      `SELECT * FROM curriculum_nodes WHERE channel_id=? AND status='todo' AND deleted_at IS NULL
         AND id NOT IN (SELECT curriculum_node_id FROM work_orders WHERE curriculum_node_id IS NOT NULL AND state IN ('open','assigned','stalled'))
       ORDER BY ord, display_id LIMIT ?`, ch.id, sc.per_run);
    const plan = expandMix(sc.mix);
    for (const [i, n] of nodes.entries()) {
      const wo = write(SYS, 'work_order.create', {
        channel: ch.display_id, kind: 'new_lesson', curriculum_node: n.display_id, ...(plan[i] ? { aspect: plan[i] } : {}),
        brief: `Soạn bài mới cho kênh ${ch.name}: mục giáo trình ${n.display_id} "${n.title}"${n.principle ? ' — nguyên lý: ' + n.principle : ''}. Dùng get_channel, list_cast, list_curriculum, get_capabilities rồi nộp bài bằng submit_lesson (kèm work_order).`,
      });
      opened.push(wo.display_id);
    }
  }
  return opened;
}

// WO assigned mà agent im quá `stallMin` phút: mở lại (tối đa MAX_ATTEMPTS lần) rồi stalled.
function sweepStalled(ctx, now = new Date(), stallMin = Number(process.env.GS_WO_STALL_MIN) || 15) {
  const { db } = ctx;
  const out = [];
  db.all("SELECT w.*, a.last_call_at FROM work_orders w LEFT JOIN agents a ON a.id=w.agent_id WHERE w.workspace_id=? AND w.state='assigned'", db.ws).forEach(w => {
    const beat = [w.last_call_at, w.assigned_at].filter(Boolean).sort().pop();
    if (!beat || now.getTime() - Date.parse(beat) < stallMin * 60000) return;
    const to = w.attempts + 1 >= MAX_ATTEMPTS ? 'stalled' : 'open';
    state.transitionWorkOrder(db, w.id, to, { summary: to === 'stalled' ? 'Agent không phản hồi — đăng nhập Claude Code có thể đã hết hạn.' : undefined });
    out.push({ wo: w.display_id, to });
  });
  return out;
}

function tick(ctx, now = new Date()) {
  return { opened: openScheduled(ctx, now), stalled: sweepStalled(ctx, now) };
}

// Gói 0.3.0-B.2 (nợ review B): nhả claim Bộ Neo hết hạn + dọn phiên tải >24h TOÀN WORKSPACE, mỗi 10 phút.
// `kit.claim_expired`/`upload.pruned` (server/ops/kit.js) là op system-only — ghi audit cùng tên, không qua MCP.
// review Gen (PR #39 mục 2 [major]): đếm TRƯỚC bằng SELECT thuần (không audit) — chỉ write() khi thật sự có gì để
// dọn. Trước đây gọi write() vô điều kiện mỗi 10 phút ⇒ audit_log (append-only) + SSE nhận ~288 dòng rác/ngày dù
// không có claim/phiên nào hết hạn (đa số bản cài, đa số lần tick).
function kitSweep(ctx) {
  const { db, write } = ctx;
  const now = db.now();
  const out = { claims_expired: 0, uploads_pruned: 0 };
  const pendingClaims = db.get('SELECT COUNT(*) AS n FROM kit_slots WHERE workspace_id=? AND claimed_by IS NOT NULL AND claim_expires_at IS NOT NULL AND claim_expires_at<=?', db.ws, now).n;
  if (pendingClaims > 0) out.claims_expired = write(SYS, 'kit.claim_expired', {}).expired;
  const cutoff = new Date(Date.now() - SESSION_TTL_MS).toISOString();
  const pendingUploads = db.get("SELECT COUNT(*) AS n FROM upload_sessions WHERE workspace_id=? AND state='open' AND created_at<?", db.ws, cutoff).n;
  if (pendingUploads > 0) out.uploads_pruned = write(SYS, 'upload.pruned', {}).pruned;
  return out;
}
function start(ctx, { intervalMs = 60000, kitSweepMs = 10 * 60000 } = {}) {
  const t = setInterval(() => { try { tick(ctx); } catch (e) { events.logError('scheduler', e); } }, intervalMs);
  t.unref();
  const kt = setInterval(() => { try { kitSweep(ctx); } catch (e) { events.logError('scheduler', e); } }, kitSweepMs);
  kt.unref();
  try { tick(ctx); } catch (e) { events.logError('scheduler', e); }
  try { kitSweep(ctx); } catch (e) { events.logError('scheduler', e); }
  return { stop: () => { clearInterval(t); clearInterval(kt); }, tick: now => tick(ctx, now), kitSweep: () => kitSweep(ctx) };
}

module.exports = { start, tick, kitSweep, openScheduled, sweepStalled, nextSlot, parseSchedule, slotAround, parseMix, expandMix };
