// © 2026 Gen Labs — All rights reserved.
// D0 Tổng quan v2 (SPEC-0.2.0 §7.3) — GET /api/overview?period=7d|30d|month. Năm hàng:
//   1 thẻ phân hệ (6, mỗi thẻ ↗ lưới đã lọc đúng `href` của API) · 2 KPI theo kỳ + hôm nay · 3 rủi ro: kho clip (runway) + lượt giọng
//   4 cột tuần so mục tiêu · donut lệnh theo trạng thái · tiến độ giáo trình · 5 bản dựng gần đây (ảnh nhỏ đúng tỉ lệ) + lệnh gần đây.
// Mọi số lấy từ API (STD-07 §9: không số không nguồn); null ⇒ "—" hoặc "?" (STD-10: hạn mức chưa biết không bao giờ bịa số).
// Mỗi hàng vẽ trong try/catch riêng: hỏng một hàng ⇒ banner trong hàng đó, các hàng khác vẫn hiện. Cập nhật theo `change` (gom 500 ms).
import { h, clear, append, icon } from '../components/dom.js';
import { t, tOr, getLang } from '../i18n.js';
import { get, post } from '../components/api.js';
import { pageHeader } from '../components/shell.js';
import { errorBanner, emptyState, badge } from '../components/states.js';
import { onDebounced } from '../components/bus.js';
import { toText, fmtVal, fmtDur, statusTone } from '../components/util.js';
import { aspectBadge, aspectThumb } from '../components/aspect.js';
import { barChart, donutChart, stackBars } from '../components/charts.js';

// Làm phẳng object lồng nhau thành [[khoá, giá trị chuỗi]] (mảng -> số phần tử hoặc danh sách ngắn). Giữ từ 0.1.x (test e-ui).
export function flatten(obj, prefix = '', out = [], depth = 0) {
  for (const [k, v] of Object.entries(obj || {})) {
    const key = prefix ? prefix + '.' + k : k;
    if (Array.isArray(v)) out.push([key, v.every((x) => x == null || typeof x !== 'object') ? v.map(toText).join(', ') || '0' : String(v.length)]);
    else if (v && typeof v === 'object' && depth < 2) flatten(v, key, out, depth + 1);
    else out.push([key, fmtVal(key, v)]);
  }
  return out;
}

// ---------------- thuần (test e-ui-d0) ----------------
export const PERIODS = ['7d', '30d', 'month'];
export const MODULE_ICONS = { review: 'stamp', agent_auth: 'plug', work_orders: 'list', pipeline: 'flow', cast: 'grid', asset_rights: 'image' };
export const KPI_PERIOD = ['submitted', 'renders', 'approved', 'first_pass_rate', 'median_order_to_review_min', 'avg_render_s', 'median_review_min'];
export const KPI_TODAY = ['renders', 'approved', 'voice_calls', 'agent_wakes'];
export const ORDER_STATES = [['open', 'info'], ['assigned', 'beat'], ['stalled', 'danger'], ['fulfilled', 'ok'], ['cancelled', 'idle']];

const locale = () => (getLang() === 'en' ? 'en-US' : 'vi-VN');
const num = (v, d = 0) => Number(v).toLocaleString(locale(), { maximumFractionDigits: d, minimumFractionDigits: 0 });

// Số chính của thẻ phân hệ: pending (việc chờ) — riêng pipeline là running
export function moduleCount(m) { return Number(m && (m.key === 'pipeline' ? m.running : m.pending)) || 0; }
// Dòng phụ có số (work_orders/pipeline) hoặc câu mô tả
export function moduleSub(m) {
  const k = 'ov.mod.' + m.key + '.sub';
  const vars = { assigned: m.assigned ?? 0, stalled: m.stalled ?? 0, blocked: m.blocked ?? 0, waiting_quota: m.waiting_quota ?? 0 };
  return tOr(k, '') ? t(k, vars) : '';
}
// KPI → chuỗi hiển thị (null ⇒ "—")
export function fmtKpi(key, v) {
  if (v == null || v === '' || !Number.isFinite(Number(v))) return '—';
  const n = Number(v);
  if (key === 'first_pass_rate') return t('ov.unit.pct', { n: num(n * 100) });
  if (/_min$/.test(key)) return t('ov.unit.min', { n: num(n, 1) });
  if (key === 'avg_render_s') return fmtDur(n * 1000);
  return num(n);
}
// Lượt giọng: "6/10" khi biết hạn mức; không biết hạn mức ⇒ "6 đã dùng" (STD-10: không bịa mẫu số)
export function voiceText(q) { return q.limit == null ? t('ov.voice.used', { used: num(q.used_today || 0) }) : t('ov.voice.of', { used: num(q.used_today || 0), limit: num(q.limit) }); }
// "2026-W43" → "W43"
export const weekLabel = (w) => { const m = /W(\d+)$/.exec(toText(w)); return m ? 'W' + m[1] : toText(w); };
// thời gian tương đối
export function ago(at, now = Date.now()) {
  const ms = now - Date.parse(at);
  if (!Number.isFinite(ms)) return '—';
  const m = Math.floor(ms / 60000);
  if (m < 1) return t('ov.ago.now');
  if (m < 60) return t('ov.ago.m', { n: m });
  const hh = Math.floor(m / 60);
  if (hh < 24) return t('ov.ago.h', { n: hh });
  return t('ov.ago.d', { n: Math.floor(hh / 24) });
}
// Xưởng mới: chưa có bản dựng nào (§7.3 trạng thái) ⇒ hàng 3–5 thay bằng một EmptyState
export function isFresh(o) { return !(o && Array.isArray(o.recent_renders) && o.recent_renders.length); }
// Thước ngày của runway: 0…max ngày (≥ 7, làm tròn lên bội 7), mốc 1 (cạn) và 3 (sắp cạn) theo công thức level của API
export function runwayScale(days) { const d = Math.max(0, Number(days) || 0); return Math.max(7, Math.ceil((d + 1) / 7) * 7); }
// href nội bộ hợp lệ (chỉ hash route của app) — dữ liệu API không bao giờ thành javascript: hay link ngoài
export const safeHref = (x) => (typeof x === 'string' && /^#\/[\w-]/.test(x) ? x : null);

// ---------------- DOM ----------------
const block = (cls, title, extra, body) => h('section', { class: 'ov-card ' + cls },
  h('header', { class: 'ov-card-head' }, h('h2', null, title), extra || null), body);
const openLink = (href, label) => (safeHref(href) ? h('a', { class: 'ov-open', href: safeHref(href), 'aria-label': label || t('ov.recent.open_grid') }, t('ov.recent.open_grid'), h('span', { 'aria-hidden': 'true' }, ' ↗')) : null);

// hàng an toàn: lỗi khi vẽ ⇒ banner trong hàng, không làm sập màn
function row(cls, fn, retry) {
  const el = h('div', { class: 'ov-row ' + cls });
  try { append(el, [fn()]); } catch (e) { console.error(e); clear(el); el.append(errorBanner({ code: 'render_error', text_human: t('ov.err_row'), detail: e && e.message }, retry)); }
  return el;
}

function modulesRow(o) {
  const mods = Array.isArray(o.modules) ? o.modules : [];
  return h('nav', { class: 'ov-mods', 'aria-label': t('nav.overview') }, mods.map((m) => {
    const n = moduleCount(m);
    const name = tOr('ov.mod.' + m.key, toText(m.key));
    const href = safeHref(m.href);
    const body = [h('div', { class: 'ov-mod-top' }, icon(MODULE_ICONS[m.key] || 'grid'), h('span', { class: 'ov-mod-name' }, name), h('span', { class: 'ov-mod-arrow', 'aria-hidden': 'true' }, '↗')),
      h('div', { class: 'ov-mod-n mono' }, num(n)),
      h('div', { class: 'ov-mod-sub' }, moduleSub(m))];
    const cls = 'ov-mod' + (n > 0 ? ' hot' : '') + (m.key === 'work_orders' && m.stalled > 0 ? ' alarm' : '');
    return href ? h('a', { class: cls, href, 'aria-label': t('ov.mod.open', { name }) + ': ' + n }, body) : h('div', { class: cls }, body);
  }));
}

function kpiRow(o, period, setPeriod) {
  const sel = h('select', { class: 'ov-period input', 'aria-label': t('ov.period.label'), onchange: (e) => setPeriod(e.target.value) },
    PERIODS.map((p) => h('option', { value: p, selected: p === period }, t('ov.period.' + p))));
  const kp = o.kpi_period || {}, kt = o.kpi_today || {};
  const cell = (label, value, sub) => h('div', { class: 'ov-kpi' }, h('span', { class: 'ov-kpi-label' }, label), h('span', { class: 'ov-kpi-v mono' }, value), sub ? h('span', { class: 'ov-kpi-sub mono' }, sub) : null);
  const range = o.period && o.period.from ? t('ov.period.range', { from: toText(o.period.from).slice(5, 10).split('-').reverse().join('/'), to: toText(o.period.to).slice(5, 10).split('-').reverse().join('/') }) : null;
  const left = h('section', { class: 'ov-strip' },
    h('header', { class: 'ov-strip-head' }, h('h2', null, t('ov.period.label')), sel, range ? h('span', { class: 'muted small mono' }, range) : null),
    h('div', { class: 'ov-kpis k7' }, KPI_PERIOD.map((k) => cell(t('ov.kpi.' + k), fmtKpi(k, kp[k]), /^median_/.test(k) ? t('ov.kpi.median') : k.startsWith('avg_') ? t('ov.kpi.avg') : null))));
  const voiceSub = kt.voice_limit != null ? '/' + num(kt.voice_limit) : null;
  const right = h('section', { class: 'ov-strip' },
    h('header', { class: 'ov-strip-head' }, h('h2', null, t('ov.today'))),
    h('div', { class: 'ov-kpis k4' }, KPI_TODAY.map((k) => cell(t('ov.today.' + k), fmtKpi(k, kt[k]), k === 'voice_calls' ? voiceSub : null))));
  return [left, right];
}

const levelBadge = (lv) => badge(t('ov.level.' + (['ok', 'warn', 'danger'].includes(lv) ? lv : 'unknown')), lv === 'ok' ? 'ok' : lv === 'warn' ? 'warn' : lv === 'danger' ? 'danger' : 'idle');

// Thước ngày: đoạn tô tới N ngày, vạch mỗi ngày, mốc 1 và 3 ngày (ranh giới danger/warn)
function runwayRuler(r) {
  const max = runwayScale(r.days);
  const pct = (d) => (Math.min(d, max) / max) * 100 + '%';
  const ticks = [];
  for (let d = 1; d < max; d++) ticks.push(h('i', { class: 'rw-tick' + (d % 7 === 0 ? ' wk' : ''), style: { left: pct(d) } }));
  return h('div', { class: 'rw-ruler lv-' + (r.level || 'unknown'), role: 'img', 'aria-label': t('ov.runway.days', { n: r.days ?? '?' }) },
    h('div', { class: 'rw-fill', style: { width: r.days == null ? '0' : pct(r.days) } }),
    ticks,
    h('i', { class: 'rw-mark m1', style: { left: pct(1) }, title: t('ov.level.danger') }),
    h('i', { class: 'rw-mark m3', style: { left: pct(3) }, title: t('ov.level.warn') }),
    h('span', { class: 'rw-end mono' }, String(max)));
}

function runwayCard(o) {
  const rows = (o.risks && Array.isArray(o.risks.runway) ? o.risks.runway : []);
  const body = h('div', { class: 'ov-risk-rows' });
  if (!rows.length) body.append(h('p', { class: 'muted' }, t('ov.runway.none')));
  for (const r of rows) {
    const days = r.days == null ? null : Number(r.days);
    body.append(h('div', { class: 'rw-row' },
      h('div', { class: 'rw-head' },
        h('a', { class: 'mono rw-ch', href: '#/channels/' + encodeURIComponent(toText(r.channel)) }, toText(r.channel)),
        h('span', { class: 'rw-days' }, days == null ? '—' : t('ov.runway.days', { n: num(days) })),
        levelBadge(r.level)),
      runwayRuler(r),
      h('div', { class: 'rw-detail muted small' }, r.per_day == null ? t('ov.runway.no_schedule')
        : t('ov.runway.detail', { n: num(r.approved_unpublished || 0), p: num(r.per_day, 1) }) + (r.per_day_source ? ' · ' + tOr('ov.runway.src.' + r.per_day_source, '') : ''))));
  }
  body.append(h('p', { class: 'ov-foot muted small' }, t('ov.runway.note')));
  return block('ov-runway', t('ov.runway.title'), openLink('#/review?view=decided'), body);
}

function voiceCard(o) {
  const rows = (o.risks && Array.isArray(o.risks.voice_quota) ? o.risks.voice_quota : []);
  const body = h('div', { class: 'ov-risk-rows' });
  if (!rows.length) body.append(h('p', { class: 'muted' }, t('ov.voice.none')));
  let resets = null;
  for (const q of rows) {
    resets = resets || q.resets_at;
    const hasLeft = q.remaining != null, hasLimit = q.limit != null && q.limit > 0;
    const usedPct = hasLimit ? Math.min(100, (q.used_today / q.limit) * 100) : 0;
    const src = tOr('ov.voice.src.' + toText(q.limit_source || 'unknown'), toText(q.limit_source));
    body.append(h('div', { class: 'vq-row' },
      h('div', { class: 'vq-head' },
        h('span', { class: 'mono vq-model', title: toText(q.provider) }, toText(q.model || q.provider)),
        h('span', { class: 'vq-left mono', title: t('ov.voice.left') }, hasLeft ? num(q.remaining) : '?'),
        levelBadge(q.level)),
      h('div', { class: 'vq-bar lv-' + (q.level || 'unknown'), role: 'img', 'aria-label': voiceText(q) },
        hasLimit ? h('div', { class: 'vq-used', style: { width: usedPct + '%' } }) : h('div', { class: 'vq-unknown' })),
      h('div', { class: 'vq-detail muted small' },
        h('span', { class: q.limit == null ? null : 'mono' }, voiceText(q)), ' · ', h('span', null, src), ' · ',
        h('span', null, !hasLeft ? t('ov.voice.unknown') : q.lessons_left == null ? t('ov.voice.no_cpl') : t('ov.voice.lessons', { n: num(q.lessons_left) })))));
  }
  if (resets) { const d = new Date(resets); if (!isNaN(d)) body.append(h('p', { class: 'ov-foot muted small' }, t('ov.voice.resets', { time: d.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' }) }))); }
  return block('ov-voice', t('ov.voice.title'), openLink('#/providers'), body);
}

function weeklyCard(o) {
  const ws = Array.isArray(o.weekly) ? o.weekly : [];
  const tgt = ws.length ? ws[ws.length - 1].target : 0;
  const items = ws.map((w) => ({ label: weekLabel(w.week), value: Number(w.approved) || 0, target: Number(w.target) > 0 ? Number(w.target) : null, title: weekLabel(w.week) + ' · ' + toText(w.from) + ': ' + w.approved + (w.target ? ' / ' + w.target : '') }));
  const legend = h('span', { class: 'muted small' }, tgt > 0 ? h('span', { class: 'ch-dash', 'aria-hidden': 'true' }) : null, tgt > 0 ? t('ov.week.target', { n: num(tgt) }) : t('ov.week.no_target'));
  return block('ov-weekly', t('ov.week.title'), legend,
    barChart(items, { width: 380, height: 150, caption: t('ov.week.title'), headers: [t('ov.week.col_week'), t('ov.week.col_approved'), t('ov.week.col_target')] }));
}

function ordersCard(o) {
  const by = o.orders_by_state || {};
  const segs = ORDER_STATES.map(([k, tone]) => ({ key: k, label: tOr('st.' + k, k), value: Number(by[k]) || 0, tone, href: '#/work-orders?q=' + encodeURIComponent('state:' + k) }));
  const total = segs.reduce((a, s) => a + s.value, 0);
  return block('ov-orders', t('ov.orders.title'), openLink('#/work-orders'),
    donutChart(segs, { size: 116, stroke: 14, center: { value: num(total), label: t('ov.orders.total') }, caption: t('ov.orders.title'), headers: [t('ov.orders.col_state'), t('ov.orders.col_n')] }));
}

function curriculumCard(o) {
  const c = o.curriculum || {};
  const roots = Array.isArray(c.by_root) ? c.by_root : [];
  const parts = (r) => [
    { key: 'done', label: t('ov.cur.done'), value: Number(r.done) || 0, tone: 'ok' },
    { key: 'in_progress', label: t('ov.cur.in_progress'), value: Number(r.in_progress) || 0, tone: 'info' },
    { key: 'todo', label: t('ov.cur.todo'), value: Math.max(0, (Number(r.total) || 0) - (Number(r.done) || 0) - (Number(r.in_progress) || 0)), tone: 'idle' }];
  const head = h('span', { class: 'mono muted small' }, t('ov.cur.sum', { done: num(c.done || 0), total: num(c.total || 0) }));
  if (!roots.length) return block('ov-cur', t('ov.cur.title'), head, h('p', { class: 'muted' }, t('ov.cur.empty')));
  const rows = roots.slice(0, 6).map((r) => ({ label: toText(r.title || r.id), sub: num(r.done || 0) + '/' + num(r.total || 0), href: '#/curriculum?q=' + encodeURIComponent('display_id:' + toText(r.id)), parts: parts(r), total: Number(r.total) || 0 }));
  const next = Array.isArray(c.next) ? c.next : [];
  return block('ov-cur', t('ov.cur.title'), head, h('div', null,
    stackBars(rows, { width: 240, barHeight: 8, caption: t('ov.cur.title'), rowHeader: t('ov.cur.col_root') }),
    next.length ? h('div', { class: 'ov-next' }, h('span', { class: 'muted small' }, t('ov.cur.next')),
      h('ol', null, next.map((x) => h('li', null, h('span', { class: 'mono' }, toText(x.id)), ' ', h('span', null, toText(x.title)))))) : null));
}

function recentRenders(o) {
  const rs = Array.isArray(o.recent_renders) ? o.recent_renders : [];
  const list = h('ul', { class: 'ov-list renders' });
  for (const r of rs) {
    const href = safeHref(r.href);
    const thumb = r.thumb && /^[\w-]+$/.test(toText(r.thumb)) ? '/media/' + encodeURIComponent(toText(r.thumb)) : null;
    const th = aspectThumb(r.aspect || '16:9', thumb, { long: 48 });
    const img = th.querySelector('img');
    if (img) img.addEventListener('error', () => { const box = img.parentNode; img.remove(); if (box) box.append(aspectThumb(r.aspect || '16:9', null, { long: 0 }).querySelector('.ar-thumb-ph')); }, { once: true });
    const inner = [th,
      h('div', { class: 'ov-li-main' },
        h('div', { class: 'ov-li-title' }, toText(r.title) || toText(r.lesson)),
        h('div', { class: 'ov-li-meta' }, h('span', { class: 'mono' }, toText(r.id)), h('span', { class: 'mono muted' }, toText(r.lesson)), aspectBadge(r.aspect || '16:9'))),
      h('div', { class: 'ov-li-side' }, badge(tOr('st.' + r.state, toText(r.state)), statusTone(r.state)), h('span', { class: 'muted small' }, ago(r.state_at || r.at)))];
    list.append(h('li', null, href ? h('a', { href, class: 'ov-li' }, inner) : h('div', { class: 'ov-li' }, inner)));
  }
  if (!rs.length) list.append(h('li', { class: 'muted ov-li-empty' }, t('ov.recent.none')));
  return block('ov-recent', t('ov.recent.renders'), openLink('#/lessons'), list);
}

function recentOrders(o) {
  const rs = Array.isArray(o.recent_orders) ? o.recent_orders : [];
  const list = h('ul', { class: 'ov-list orders' });
  for (const w of rs) {
    const href = safeHref(w.href);
    const inner = [h('span', { class: 'mono ov-wo-id' }, toText(w.id)),
      h('span', { class: 'ov-wo-kind' }, tOr('kind.' + w.kind, toText(w.kind))),
      w.agent ? h('span', { class: 'mono muted small' }, toText(w.agent)) : h('span', { class: 'muted small' }, '—'),
      h('span', { class: 'spacer' }),
      badge(tOr('st.' + w.state, toText(w.state)), statusTone(w.state)),
      h('span', { class: 'muted small ov-wo-at' }, ago(w.at))];
    list.append(h('li', null, href ? h('a', { href, class: 'ov-li' }, inner) : h('div', { class: 'ov-li' }, inner)));
  }
  if (!rs.length) list.append(h('li', { class: 'muted ov-li-empty' }, t('ov.recent.none')));
  return block('ov-recent', t('ov.recent.orders'), openLink('#/work-orders'), list);
}

function alerts(o, reload) {
  const out = [];
  if (o.pairing_lost) out.push(h('div', { class: 'banner warn' }, h('div', { class: 'banner-main' }, icon('warn'), h('span', null, t('ov.pairing_lost', { id: toText(o.pairing_lost.agent) })),
    h('button', { type: 'button', class: 'btn', onclick: async () => { try { await post('/api/pairing/open', { channel: 'internal' }); location.hash = '#/agents?view=pending'; } catch { reload(); } } }, t('ov.repair')))));
  else if (o.internal_agent_off) out.push(h('div', { class: 'banner warn' }, h('div', { class: 'banner-main' }, icon('warn'), h('span', null, t('ov.internal_off')), h('a', { class: 'btn', href: '#/agents' }, t('ov.internal_on')))));
  return out;
}

// Skeleton đúng hình 5 hàng
function skeletonD0() {
  const sk = (cls) => h('div', { class: 'ov-sk ' + cls }, h('div', { class: 'sk-row', style: { width: '40%' } }), h('div', { class: 'sk-row', style: { width: '70%' } }));
  return h('div', { class: 'ov-skel', 'aria-busy': 'true', 'aria-label': t('state.loading') },
    h('div', { class: 'ov-row r1' }, h('div', { class: 'ov-mods' }, [1, 2, 3, 4, 5, 6].map(() => sk('mod')))),
    h('div', { class: 'ov-row r2' }, sk('strip'), sk('strip')),
    h('div', { class: 'ov-row r3' }, sk('card'), sk('card')),
    h('div', { class: 'ov-row r4' }, sk('chart'), sk('chart'), sk('chart')),
    h('div', { class: 'ov-row r5' }, sk('list'), sk('list')));
}

export function mount(container, ctx) {
  let period = PERIODS.includes(localStorage.getItem('gs_ov_period')) ? localStorage.getItem('gs_ov_period') : '7d';
  const stamp = h('span', { class: 'muted small mono' });
  const body = h('div', { class: 'overview v2' });
  container.append(pageHeader(t('nav.overview'), t('ov.desc'), [stamp]), body);
  let alive = true, last = null, reqSeq = 0;

  function draw(o, err) {
    clear(body);
    if (err) body.append(errorBanner(err, load));
    if (!o) return;
    append(body, alerts(o, load));
    body.append(row('r1', () => modulesRow(o), load), row('r2', () => kpiRow(o, period, setPeriod), load));
    if (isFresh(o)) {
      body.append(h('div', { class: 'ov-row ov-fresh' }, emptyState(t('ov.fresh'), h('a', { class: 'btn primary', href: '#/agents' }, icon('plug'), t('ov.connect_agent')))));
    } else {
      body.append(row('r3', () => [runwayCard(o), voiceCard(o)], load),
        row('r4', () => [weeklyCard(o), ordersCard(o), curriculumCard(o)], load),
        row('r5', () => [recentRenders(o), recentOrders(o)], load));
    }
    stamp.textContent = t('ov.updated', { time: new Date().toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' }) });
  }
  function setPeriod(p) { if (!PERIODS.includes(p)) return; period = p; localStorage.setItem('gs_ov_period', p); load(); }
  async function load() {
    const my = ++reqSeq;
    if (!last) { clear(body); body.append(skeletonD0()); }
    try {
      const o = await get('/api/overview?period=' + encodeURIComponent(period));
      if (!alive || my !== reqSeq) return;
      last = o || {};
      draw(last, null);
    } catch (e) { if (!alive || my !== reqSeq) return; draw(last, e); }
  }
  load();
  const off = onDebounced('change', load, 500);
  return () => { alive = false; off(); };
}
