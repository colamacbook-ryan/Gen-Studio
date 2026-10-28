// © 2026 Gen Labs — All rights reserved.
// GET /api/overview — CHUYỂN NGUYÊN TRẠNG từ server/api.js (P0b, SPEC-0.2.0 §2.4/§7.2; không có hai route trùng). Gói O mở rộng file này (?period=, thẻ M1…M8, href lưới đã lọc).
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

function register(add, rctx) {
  const { db, config, J } = rctx;
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
  add('GET', '/api/overview', { sess: true }, async () => {
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
    return {
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
    };
  });
}

module.exports = { register, assetIdsOf };
