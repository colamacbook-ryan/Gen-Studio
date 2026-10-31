// © 2026 Gen Labs — All rights reserved.
// Hàm thuần (không DOM) dùng chung: route, timecode, escape, tách thuật ngữ, chuẩn hoá lỗi.

export const ROUTES = ['overview', 'review', 'lessons', 'pipeline', 'work-orders', 'agents', 'providers',
  'channels', 'curriculum', 'assets', 'cast', 'audit', 'setup', 'login', 'authorize', 'pair',
  'kho', 'kho-queue', 'kho-slot', 'kho-tokens', 'kho-audit', 'kho-settings'];
// Tên cũ/tên API → tên route: href viết kiểu khoá API (#/work_orders?q=…) vẫn mở đúng lưới (Tổng quan v2 dùng href của /api/overview)
export const ROUTE_ALIASES = { work_orders: 'work-orders', workorders: 'work-orders' };

// '#/review/RD-0004?x=1' -> {path:'review', id:'RD-0004', query:{x:'1'}}
export function parseRoute(hash) {
  let s = String(hash || '').replace(/^#/, '');
  const qi = s.indexOf('?');
  const qs = qi >= 0 ? s.slice(qi + 1) : '';
  if (qi >= 0) s = s.slice(0, qi);
  const parts = s.split('/').filter(Boolean);
  const query = {};
  for (const pair of qs.split('&')) {
    if (!pair) continue;
    const eq = pair.indexOf('=');
    const k = eq >= 0 ? pair.slice(0, eq) : pair;
    const v = eq >= 0 ? pair.slice(eq + 1) : '';
    try { query[decodeURIComponent(k)] = decodeURIComponent(v.replace(/\+/g, ' ')); } catch { query[k] = v; }
  }
  let path = parts[0] || 'overview';
  if (Object.hasOwn(ROUTE_ALIASES, path)) path = ROUTE_ALIASES[path];
  if (!ROUTES.includes(path)) path = 'overview';
  let id = null;
  if (parts[1]) { try { id = decodeURIComponent(parts[1]); } catch { id = parts[1]; } }
  return { path, id, query };
}

export function buildHash(path, id) {
  return '#/' + path + (id ? '/' + encodeURIComponent(id) : '');
}

const p2 = (n) => String(n).padStart(2, '0');

// ms -> 'MM:SS.d' (giây thập phân, như thiết kế: 00:31.2)
export function fmtTc(ms) {
  const v = Math.max(0, Number(ms) || 0);
  const tenths = Math.floor(v / 100);
  const m = Math.floor(tenths / 600);
  const s = Math.floor((tenths % 600) / 10);
  return p2(m) + ':' + p2(s) + '.' + (tenths % 10);
}

// giây -> 'M:SS' (thời lượng clip)
// byte → "17,2 MB" / "1,4 GB"
export function fmtBytes(b) {
  const n = Number(b); if (!isFinite(n)) return '—';
  const u = ['B', 'KB', 'MB', 'GB', 'TB']; let i = 0, v = n;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return (i === 0 ? String(v) : v.toFixed(v >= 100 ? 0 : 1).replace('.', ',')) + ' ' + u[i];
}
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
// Định dạng một giá trị số đo theo TÊN khoá (không đổ JSON thô ra giao diện)
export function fmtVal(key, v) {
  if (v == null || v === '') return '—';
  const k = String(key);
  if (Array.isArray(v)) return String(v.length);
  if (typeof v === 'object') return Object.entries(v).map(([a, b]) => a + ' ' + fmtVal(a, b)).join(' · ') || '0';
  if (typeof v === 'number') {
    if (/_ms$/.test(k)) return fmtDur(v);
    if (/_seconds$|_sec$/.test(k)) return fmtDur(v * 1000);
    if (/bytes|^disk\.|\.(used|total|reclaimable)$/.test(k)) return fmtBytes(v);
    if (/minutes$/.test(k)) return v + "'";
    return v.toLocaleString('vi-VN');
  }
  if (typeof v === 'string' && ISO_RE.test(v)) { const d = new Date(v); if (!isNaN(d)) return d.toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }); }
  return toText(v);
}

export function fmtDur(ms) {
  const sec = Math.round((Number(ms) || 0) / 1000);
  return Math.floor(sec / 60) + ':' + p2(sec % 60);
}

// giây -> 'MM:SS' (đồng hồ duyệt)
export function fmtClock(sec) {
  const v = Math.max(0, Math.floor(Number(sec) || 0));
  return p2(Math.floor(v / 60)) + ':' + p2(v % 60);
}

export function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Mọi giá trị -> chuỗi an toàn để đặt vào textContent (không bao giờ '[object Object]').
export function toText(v) {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  try { return JSON.stringify(v); } catch { return ''; }
}

// Tách câu thành các đoạn, đánh dấu thuật ngữ ngoại ngữ (không phân biệt hoa thường).
export function splitTerms(say, terms) {
  const text = String(say == null ? '' : say);
  const list = (Array.isArray(terms) ? terms : []).map(String).filter(Boolean)
    .sort((a, b) => b.length - a.length);
  if (!list.length) return [{ text, term: false }];
  const low = text.toLowerCase();
  const marks = [];
  for (const term of list) {
    const tl = term.toLowerCase();
    let from = 0;
    for (;;) {
      const i = low.indexOf(tl, from);
      if (i < 0) break;
      if (!marks.some((m) => i < m[1] && i + tl.length > m[0])) marks.push([i, i + tl.length]);
      from = i + tl.length;
    }
  }
  marks.sort((a, b) => a[0] - b[0]);
  const out = [];
  let pos = 0;
  for (const [a, b] of marks) {
    if (a > pos) out.push({ text: text.slice(pos, a), term: false });
    out.push({ text: text.slice(a, b), term: true });
    pos = b;
  }
  if (pos < text.length) out.push({ text: text.slice(pos), term: false });
  return out.length ? out : [{ text, term: false }];
}

// Lỗi API -> {code, text_human, detail} (không stack trace).
export function normalizeError(e) {
  if (e && typeof e === 'object' && 'text_human' in e) {
    return { code: toText(e.code) || 'error', text_human: toText(e.text_human), detail: toText(e.detail), status: e.status || 0 };
  }
  const msg = e && e.message ? String(e.message) : toText(e);
  return { code: 'error', text_human: '', detail: msg, status: 0 };
}

// Câu đang phát tại thời điểm tMs (hoặc câu gần nhất đã qua).
export function lineAt(lines, tMs) {
  let best = null;
  for (const l of lines || []) {
    if (l.a_ms <= tMs) best = l;
    if (l.a_ms <= tMs && tMs <= l.b_ms) return l;
  }
  return best;
}

// Trạng thái -> màu token (ok/info/warn/danger/idle)
export function statusTone(s) {
  const v = String(s || '').toLowerCase();
  if (/^(pass|ok|approved|fulfilled|done|ready|online|succeeded|success|available|active)$/.test(v)) return 'ok';
  if (/^(fail|failed|blocked|stalled|error|rejected|revoked|danger)$/.test(v)) return 'danger';
  if (/^(waiting|wait|paused)|quota|unknown|warn/.test(v)) return 'warn';
  if (/(running|assigned|open|queued|awaiting|voicing|judging|aligning|rendering|mixing|gating|changes_requested|info)/.test(v)) return 'info';
  return 'idle';
}

export function csvEscape(v) {
  let s = toText(v);
  // Chống chèn công thức khi mở CSV bằng Excel/Sheets: nội dung do agent viết có thể bắt đầu bằng = + - @ tab CR.
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
