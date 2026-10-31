// © 2026 Gen Labs — All rights reserved.
// A1 Tổng quan kho (gói D, 0.3.0): lưới 457 ô Bộ Neo theo 10 nhóm NB-01..10, màu theo trạng thái, % đạt.
// % đạt: TODO dùng `v_kit_coverage` khi C.2 bổ sung view (ghi trong GET /api/kit/overview) — tạm tính trực tiếp từ kit_certs.
import { h, clear, icon } from '../components/dom.js';
import { t } from '../i18n.js';
import { get } from '../components/api.js';
import { pageHeader } from '../components/shell.js';
import { errorBanner, skeleton } from '../components/states.js';
import { buildHash } from '../components/util.js';
import { fmtDateTime } from '../components/datagrid.js';

const STATUS_ORDER = ['empty', 'submitted', 'rework', 'blocked', 'approved', 'certified'];

function legend() {
  return h('div', { class: 'kho-legend' }, STATUS_ORDER.map((s) => h('span', { class: 'kho-leg-item' }, h('i', { class: 'kho-dot st-' + s }), t('kho.st.' + s))));
}

function groupCard(g) {
  return h('div', { class: 'kho-group-card' },
    h('div', { class: 'kho-group-head' }, h('strong', null, g.group_code), h('span', { class: 'muted small' }, g.total + ' ' + t('kho.slots'))),
    h('div', { class: 'kho-group-bar' }, h('i', { style: { width: g.pct + '%' } })),
    h('div', { class: 'muted small' }, t('kho.certified_of', { c: g.certified, t: g.total, pct: g.pct })));
}

function slotCell(s) {
  const title = (s.title_vi || s.code) + (s.claimed_by ? ' · ' + s.claimed_by : '');
  return h('a', {
    class: 'kho-cell st-' + s.status, href: buildHash('kho-slot', s.code), title,
    'aria-label': s.code + ' — ' + t('kho.st.' + s.status),
  }, s.claimed_by ? h('i', { class: 'kho-claim-dot' }) : null);
}

export function mount(container, ctx) {
  container.append(pageHeader(t('kho.title'), t('kho.desc')));
  const body = h('div', { class: 'pad kho-overview' }, skeleton(8));
  container.append(body);
  let alive = true;
  get('/api/kit/overview').then((res) => {
    if (!alive) return;
    clear(body);
    const totals = res.totals || { total: 0, certified: 0, pct: 0 };
    const summary = h('div', { class: 'kho-summary' },
      h('div', { class: 'kho-summary-pct' }, h('strong', null, totals.pct + '%'), h('span', { class: 'muted small' }, t('kho.pct_overall'))),
      h('div', { class: 'muted small' }, t('kho.certified_of', { c: totals.certified, t: totals.total, pct: totals.pct })));
    const groups = h('div', { class: 'kho-groups' }, (res.groups || []).map(groupCard));
    const claims = res.claims || [];
    const claimsBox = h('section', { class: 'kho-claims' },
      h('h2', null, t('kho.claims_title')),
      claims.length ? h('ul', null, claims.map((c) => h('li', null,
        h('a', { href: buildHash('kho-slot', c.kit_slot), class: 'mono' }, c.kit_slot), ' — ', t('kho.claims_by', { agent: c.claimed_by, at: fmtDateTime(c.claim_expires_at) }))))
        : h('p', { class: 'muted' }, t('kho.claims_empty')));
    const grid = h('div', { class: 'kho-grid', role: 'list', 'aria-label': t('kho.title') }, (res.slots || []).map(slotCell));
    body.append(summary, h('p', { class: 'muted small' }, t('kho.pct_todo')), groups, legend(), grid, claimsBox);
  }, (e) => { if (!alive) return; clear(body); body.append(errorBanner(Object.assign({}, e, { text_human: t('kho.err_load') }), () => mount(container, ctx))); });
  return () => { alive = false; };
}
