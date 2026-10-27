// © 2026 Gen Labs — All rights reserved.
// Lưới dữ liệu: whitelist cột + parser ô truy vấn tham số hoá (DATABASE §5.2).
'use strict';

// ---------- tiện ích ----------
const now = () => new Date().toISOString();
function J(v) { if (typeof v === 'string') { try { return JSON.parse(v); } catch { return v; } } return v; }

// ---------- định nghĩa lưới ----------
const AGENT_OF_RENDER = '(SELECT a.display_id FROM lesson_versions lv2 JOIN work_orders w ON w.id=lv2.work_order_id JOIN agents a ON a.id=w.agent_id WHERE lv2.id=r.lesson_version_id)';
const GRIDS = {
  review_queue: {
    from: 'renders r JOIN lesson_versions lv ON lv.id=r.lesson_version_id JOIN lessons l ON l.id=lv.lesson_id',
    where: "r.workspace_id=? AND r.state='awaiting_review'",
    cols: {
      display_id: { label: 'ID', type: 'id', expr: 'r.display_id', search: true },
      render: { label: 'Render', type: 'id', expr: 'r.display_id' },
      state: { label: 'Trạng thái', type: 'enum', expr: 'r.state' },
      lesson: { label: 'Bài', type: 'id', expr: 'l.display_id' },
      title: { label: 'Tiêu đề', type: 'text', expr: 'l.title', search: true },
      version: { label: 'Version', type: 'num', expr: 'lv.version' },
      duration_ms: { label: 'Thời lượng', type: 'ms', expr: 'r.duration_ms' },
      waiting_since: { label: 'Chờ từ', type: 'date', expr: 'r.state_changed_at' },
      agent: { label: 'Agent', type: 'id', expr: AGENT_OF_RENDER },
    },
    sort: '-waiting_since',
    footer: rows => ({ count: rows.length, total_duration_ms: sum(rows, 'duration_ms') }),
  },
  reviews: {
    from: 'reviews rv JOIN renders r ON r.id=rv.render_id LEFT JOIN users u ON u.id=rv.decided_by',
    where: 'rv.workspace_id=?',
    cols: {
      display_id: { label: 'ID', type: 'id', expr: 'rv.display_id', search: true },
      render: { label: 'Render', type: 'id', expr: 'r.display_id' },
      decision: { label: 'Quyết định', type: 'enum', expr: 'rv.decision' },
      review_seconds: { label: 'Giây duyệt', type: 'num', expr: 'rv.review_seconds' },
      decided_by: { label: 'Người duyệt', type: 'text', expr: 'u.display_name' },
      decided_at: { label: 'Lúc', type: 'date', expr: 'rv.created_at' },
      notes: { label: 'Ghi chú', type: 'num', expr: '(SELECT COUNT(*) FROM review_notes n WHERE n.review_id=rv.id)' },
    },
    sort: '-decided_at',
    footer: rows => ({ count: rows.length, median_review_seconds: median(rows.map(r => r.review_seconds).filter(x => typeof x === 'number')) }),
  },
  work_orders: {
    from: 'work_orders w LEFT JOIN channels ch ON ch.id=w.channel_id LEFT JOIN curriculum_nodes cu ON cu.id=w.curriculum_node_id LEFT JOIN lessons l ON l.id=w.lesson_id LEFT JOIN agents a ON a.id=w.agent_id',
    where: 'w.workspace_id=?',
    cols: {
      display_id: { label: 'ID', type: 'id', expr: 'w.display_id', search: true },
      kind: { label: 'Loại', type: 'enum', expr: 'w.kind' },
      state: { label: 'Trạng thái', type: 'enum', expr: 'w.state' },
      channel: { label: 'Kênh', type: 'id', expr: 'ch.display_id' },
      node: { label: 'Mục giáo trình', type: 'id', expr: 'cu.display_id' },
      lesson: { label: 'Bài', type: 'id', expr: 'l.display_id' },
      agent: { label: 'Agent', type: 'id', expr: 'a.display_id' },
      brief: { label: 'Giao việc', type: 'text', expr: 'w.brief', search: true },
      attempts: { label: 'Lần', type: 'num', expr: 'w.attempts' },
      opened_at: { label: 'Mở lúc', type: 'date', expr: 'w.opened_at' },
      closed_at: { label: 'Đóng lúc', type: 'date', expr: 'w.closed_at' },
      summary: { label: 'Tóm tắt', type: 'text', expr: 'w.summary', search: true },
    },
    sort: '-opened_at',
    footer: rows => { const by = {}; rows.forEach(r => { by[r.state] = (by[r.state] || 0) + 1; }); return { count: rows.length, by_state: by }; },
  },
  lessons: {
    from: 'lessons l LEFT JOIN channels ch ON ch.id=l.channel_id LEFT JOIN curriculum_nodes cu ON cu.id=l.curriculum_node_id LEFT JOIN renders lr ON lr.id=l.latest_render_id',
    where: 'l.workspace_id=? AND l.deleted_at IS NULL',
    cols: {
      display_id: { label: 'ID', type: 'id', expr: 'l.display_id', search: true },
      title: { label: 'Tiêu đề', type: 'text', expr: 'l.title', search: true },
      channel: { label: 'Kênh', type: 'id', expr: 'ch.display_id' },
      node: { label: 'Mục giáo trình', type: 'id', expr: 'cu.display_id' },
      version: { label: 'Version', type: 'num', expr: 'l.current_version' },
      render: { label: 'Render', type: 'id', expr: 'lr.display_id' },
      state: { label: 'Trạng thái', type: 'enum', expr: 'lr.state' },
      duration_ms: { label: 'Thời lượng', type: 'ms', expr: 'lr.duration_ms' },
      updated_at: { label: 'Cập nhật', type: 'date', expr: 'l.updated_at' },
    },
    sort: '-updated_at',
    footer: rows => ({ count: rows.length, total_duration_ms: sum(rows, 'duration_ms') }),
  },
  runs: {
    from: 'runs rn LEFT JOIN renders r ON r.id=rn.render_id LEFT JOIN work_orders w ON w.id=rn.work_order_id',
    where: 'rn.workspace_id=?',
    cols: {
      display_id: { label: 'ID', type: 'id', expr: 'rn.display_id', search: true },
      kind: { label: 'Loại', type: 'enum', expr: 'rn.kind' },
      state: { label: 'Trạng thái', type: 'enum', expr: 'rn.state' },
      render: { label: 'Render', type: 'id', expr: 'r.display_id' },
      work_order: { label: 'Lệnh', type: 'id', expr: 'w.display_id' },
      attempt: { label: 'Lần', type: 'num', expr: 'rn.attempt' },
      progress: { label: 'Tiến độ', type: 'num', expr: 'rn.progress' },
      started_at: { label: 'Bắt đầu', type: 'date', expr: 'rn.started_at' },
      finished_at: { label: 'Kết thúc', type: 'date', expr: 'rn.finished_at' },
      calls: { label: 'Lượt gọi', type: 'num', expr: "COALESCE(json_extract(rn.cost,'$.calls'),0)" },
      error: { label: 'Lỗi', type: 'text', expr: "json_extract(rn.error,'$.text_human')", search: true },
    },
    sort: '-started_at',
    footer: rows => {
      const day = new Date().toISOString().slice(0, 10);
      return { count: rows.length, calls_today: rows.filter(r => String(r.started_at || '').startsWith(day)).reduce((a, r) => a + (r.calls || 0), 0) };
    },
  },
  curriculum: {
    from: 'curriculum_nodes cu LEFT JOIN channels ch ON ch.id=cu.channel_id',
    where: 'cu.workspace_id=? AND cu.deleted_at IS NULL',
    cols: {
      display_id: { label: 'ID', type: 'id', expr: 'cu.display_id', search: true },
      channel: { label: 'Kênh', type: 'id', expr: 'ch.display_id' },
      ord: { label: 'Thứ tự', type: 'num', expr: 'cu.ord' },
      title: { label: 'Mục', type: 'text', expr: 'cu.title', search: true },
      principle: { label: 'Nguyên lý', type: 'text', expr: 'cu.principle', search: true },
      status: { label: 'Trạng thái', type: 'enum', expr: 'cu.status' },
    },
    sort: 'ord',
    footer: rows => ({ total: rows.length, done: rows.filter(r => r.status === 'done').length }),
  },
  cast: {
    from: 'cast_members cm LEFT JOIN channels ch ON ch.id=cm.channel_id',
    where: 'cm.workspace_id=? AND cm.deleted_at IS NULL',
    cols: {
      display_id: { label: 'ID', type: 'id', expr: 'cm.display_id', search: true },
      name: { label: 'Tên', type: 'text', expr: 'cm.name', search: true },
      role_label: { label: 'Vai', type: 'text', expr: 'cm.role_label', search: true },
      channel: { label: 'Kênh', type: 'id', expr: 'ch.display_id' },
      version: { label: 'Version', type: 'num', expr: 'cm.current_version' },
    },
    sort: 'display_id',
    footer: rows => ({ count: rows.length }),
  },
  voice_clips: {
    from: 'voice_clips vc',
    where: 'vc.workspace_id=?',
    cols: {
      display_id: { label: 'ID', type: 'id', expr: 'vc.display_id', search: true },
      say: { label: 'Lời', type: 'text', expr: 'vc.say', search: true },
      voice: { label: 'Giọng', type: 'text', expr: 'vc.voice' },
      model: { label: 'Model', type: 'text', expr: 'vc.model' },
      duration_ms: { label: 'Thời lượng', type: 'ms', expr: 'vc.duration_ms' },
      created_at: { label: 'Tạo lúc', type: 'date', expr: 'vc.created_at' },
    },
    sort: '-created_at',
    footer: rows => ({ count: rows.length, total_duration_ms: sum(rows, 'duration_ms') }),
  },
  agents: {
    from: 'agents ag',
    where: 'ag.workspace_id=? AND ag.deleted_at IS NULL',
    cols: {
      display_id: { label: 'ID', type: 'id', expr: 'ag.display_id', search: true },
      name: { label: 'Tên', type: 'text', expr: 'ag.name', search: true },
      kind: { label: 'Loại', type: 'enum', expr: 'ag.kind' },
      scopes: { label: 'Phạm vi', type: 'json', expr: 'ag.scopes' },
      status: { label: 'Trạng thái', type: 'enum', expr: 'ag.status' },
      last_call_at: { label: 'Gọi gần nhất', type: 'date', expr: 'ag.last_call_at' },
      wake_limit_per_day: { label: 'Lượt/ngày', type: 'num', expr: 'ag.wake_limit_per_day' },
    },
    sort: 'display_id',
    footer: rows => ({ count: rows.length }),
  },
  providers: {
    from: 'providers pv',
    where: 'pv.workspace_id=? AND pv.deleted_at IS NULL',
    cols: {
      display_id: { label: 'ID', type: 'id', expr: 'pv.display_id', search: true },
      kind: { label: 'Loại', type: 'enum', expr: 'pv.kind' },
      vendor: { label: 'Nhà cung cấp', type: 'text', expr: 'pv.vendor', search: true },
      model: { label: 'Model', type: 'text', expr: 'pv.model', search: true },
      enabled: { label: 'Bật', type: 'bool', expr: 'pv.enabled' },
      scan: { label: 'Quét', type: 'json', expr: 'pv.scan' },
      calls_today: { label: 'Lượt hôm nay', type: 'num', expr: "COALESCE((SELECT u.calls FROM provider_usage u WHERE u.provider_id=pv.id AND u.day=strftime('%Y-%m-%d','now')),0)" },
    },
    sort: 'display_id',
    footer: rows => ({ count: rows.length, calls_today: sum(rows, 'calls_today') }),
  },
  assets: {
    from: 'assets a',
    where: 'a.workspace_id=?',
    cols: {
      display_id: { label: 'ID', type: 'id', expr: 'a.display_id', search: true },
      kind: { label: 'Loại', type: 'enum', expr: 'a.kind' },
      mime: { label: 'MIME', type: 'text', expr: 'a.mime' },
      bytes: { label: 'Dung lượng', type: 'num', expr: 'a.bytes' },
      media_present: { label: 'Còn tệp', type: 'bool', expr: 'a.media_present' },
      source: { label: 'Nguồn', type: 'enum', expr: 'a.source' },
      created_at: { label: 'Tạo lúc', type: 'date', expr: 'a.created_at' },
    },
    sort: '-created_at',
    footer: rows => ({ count: rows.length, total_bytes: sum(rows, 'bytes') }),
  },
  channels: {
    from: 'channels ch',
    where: 'ch.workspace_id=? AND ch.deleted_at IS NULL',
    cols: {
      display_id: { label: 'ID', type: 'id', expr: 'ch.display_id', search: true },
      name: { label: 'Tên', type: 'text', expr: 'ch.name', search: true },
      lang_primary: { label: 'Ngôn ngữ', type: 'enum', expr: 'ch.lang_primary' },
      lang_terms: { label: 'Ngôn ngữ thuật ngữ', type: 'enum', expr: 'ch.lang_terms' },
      version: { label: 'Version', type: 'num', expr: 'ch.current_version' },
      schedule: { label: 'Lịch', type: 'text', expr: "COALESCE(json_extract((SELECT data FROM channel_versions v WHERE v.entity_id=ch.id AND v.version=ch.current_version),'$.schedule.time'), json_extract((SELECT data FROM channel_versions v WHERE v.entity_id=ch.id AND v.version=ch.current_version),'$.schedule.cron'))" },
    },
    sort: 'display_id',
    footer: rows => ({ count: rows.length }),
  },
  audit: {
    from: 'audit_log a',
    where: 'a.workspace_id=?',
    cols: {
      display_id: { label: 'ID', type: 'id', expr: 'a.display_id', search: true },
      ts: { label: 'Lúc', type: 'date', expr: 'a.ts' },
      actor: { label: 'Tác nhân', type: 'text', expr: 'a.actor', search: true },
      entry: { label: 'Lối vào', type: 'enum', expr: 'a.entry' },
      action: { label: 'Hành động', type: 'text', expr: 'a.action', search: true },
      entity_type: { label: 'Đối tượng', type: 'enum', expr: 'a.entity_type' },
      entity_id: { label: 'Mã đối tượng', type: 'text', expr: 'a.entity_id', search: true },
    },
    sort: '-ts',
    footer: rows => ({ count: rows.length }),
  },
};
function sum(rows, k) { return rows.reduce((a, r) => a + (Number(r[k]) || 0), 0); }
function median(a) { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }

// ---------- parser ô truy vấn ----------
function bad(text) { const e = new Error(text); e.code = 'invalid'; e.text_human = text; return e; }
const TOK = /\s*(-)?(?:([a-z_]+)(>=|<=|:|>|<)(?:"([^"]*)"|(\S+))|"([^"]*)"|(\S+))/y;
const esc = s => s.replace(/[\\%_]/g, c => '\\' + c);

// Trả {conds:[sql], params:[]} — luôn tham số hoá; tên cột phải nằm trong whitelist.
function parseQuery(grid, q) {
  const conds = [], params = [];
  const s = String(q || '').trim();
  if (s.length > 500) throw bad('Ô truy vấn quá dài.');
  TOK.lastIndex = 0;
  let m;
  while (TOK.lastIndex < s.length && (m = TOK.exec(s))) {
    const neg = !!m[1];
    let sql, p = [];
    if (m[2]) {
      const col = Object.hasOwn(grid.cols, m[2]) ? grid.cols[m[2]] : null;
      if (!col) throw bad('Cột không hợp lệ: ' + m[2] + '. Cột có thể dùng: ' + Object.keys(grid.cols).join(', '));
      const op = m[3], val = m[4] !== undefined ? m[4] : m[5];
      if (op === ':') {
        if (col.type === 'num' || col.type === 'ms') {
          const n = Number(val); if (!Number.isFinite(n)) throw bad('Giá trị số không hợp lệ cho cột ' + m[2]);
          sql = col.expr + ' = ?'; p = [n];
        } else if (col.type === 'bool') { sql = col.expr + ' = ?'; p = [/^(1|true|yes|co|có)$/i.test(val) ? 1 : 0]; }
        else if (col.type === 'text' || col.type === 'json') { sql = col.expr + " LIKE ? ESCAPE '\\'"; p = ['%' + esc(val) + '%']; }
        else if (col.type === 'date') { sql = col.expr + " LIKE ? ESCAPE '\\'"; p = [esc(val) + '%']; }
        else {
          const vs = val.split(',').filter(Boolean);
          sql = col.expr + ' COLLATE NOCASE IN (' + vs.map(() => '?').join(',') + ')'; p = vs;
        }
      } else {
        if (col.type === 'num' || col.type === 'ms') { const n = Number(val); if (!Number.isFinite(n)) throw bad('Giá trị số không hợp lệ cho cột ' + m[2]); sql = col.expr + ' ' + op + ' ?'; p = [n]; }
        else if (col.type === 'date') { sql = col.expr + ' ' + op + ' ?'; p = [val]; }
        else throw bad('Toán tử ' + op + ' chỉ dùng cho cột số hoặc ngày: ' + m[2]);
      }
    } else {
      const word = m[6] !== undefined ? m[6] : m[7];
      const sc = Object.values(grid.cols).filter(c => c.search);
      if (!sc.length) throw bad('Lưới này không hỗ trợ tìm theo chữ.');
      sql = '(' + sc.map(c => c.expr + " LIKE ? ESCAPE '\\'").join(' OR ') + ')'; p = sc.map(() => '%' + esc(word) + '%');
    }
    conds.push((neg ? 'NOT COALESCE(' : '(') + sql + (neg ? ', 0)' : ')'));
    params.push(...p);
  }
  return { conds, params };
}

function runGrid(db, name, { q, sort, limit } = {}) {
  const g = Object.hasOwn(GRIDS, name) ? GRIDS[name] : null;
  if (!g) { const e = new Error('Không có lưới ' + name); e.code = 'not_found'; e.text_human = 'Không có lưới "' + name + '".'; throw e; }
  const ws = db.ws;
  const { conds, params } = parseQuery(g, q);
  let sk = String(sort || g.sort || ''), desc = false;
  if (sk[0] === '-') { desc = true; sk = sk.slice(1); }
  if (!Object.hasOwn(g.cols, sk)) { if (sort) throw bad('Không sắp xếp được theo cột: ' + sk); sk = Object.keys(g.cols)[0]; }
  const select = Object.entries(g.cols).map(([k, c]) => c.expr + ' AS ' + k).join(', ');
  const sql = 'SELECT ' + select + ' FROM ' + g.from + ' WHERE ' + g.where + (conds.length ? ' AND ' + conds.join(' AND ') : '') +
    ' ORDER BY ' + g.cols[sk].expr + (desc ? ' DESC' : ' ASC') + ' LIMIT 5000';
  let rows = db.all(sql, ws, ...params);
  const jcols = Object.entries(g.cols).filter(([, c]) => c.type === 'json').map(([k]) => k);
  rows = rows.map(r => { const o = Object.assign({}, r); jcols.forEach(k => { o[k] = J(o[k]); }); return o; });
  const footer = g.footer(rows);
  const lim = Math.max(1, Math.min(500, Number(limit) || 200));
  return {
    columns: Object.entries(g.cols).map(([key, c]) => ({ key, label: c.label, type: c.type })),
    rows: rows.slice(0, lim).map(r => Object.assign({ id: r.display_id }, r)),
    footer: Object.assign({ matched: rows.length }, footer),
  };
}

module.exports = { GRIDS, parseQuery, runGrid, J, now };
