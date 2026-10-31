// © 2026 Gen Labs — All rights reserved.
// A3 Chi tiết ô (gói D, 0.3.0): lịch sử nộp, chứng nhận, tài sản hiện hành, subject_rev, tiêu chí bắt buộc của nhóm ô.
import { h, clear } from '../components/dom.js';
import { t, tOr } from '../i18n.js';
import { get } from '../components/api.js';
import { pageHeader } from '../components/shell.js';
import { errorBanner, skeleton, badge } from '../components/states.js';
import { statusTone, buildHash } from '../components/util.js';
import { fmtDateTime } from '../components/datagrid.js';

function subRow(s) {
  return h('tr', null,
    h('td', null, h('a', { href: buildHash('kho-queue', s.display_id), class: 'mono' }, s.display_id)),
    h('td', null, badge(tOr('st.' + s.state, s.state), statusTone(s.state))),
    h('td', null, t('queue.attempt', { n: s.attempt })),
    h('td', null, s.checks_level ? badge(tOr('queue.lv.' + s.checks_level, s.checks_level), statusTone(s.checks_level)) : '—'),
    h('td', null, s.asset ? h('a', { href: s.asset.url, target: '_blank', rel: 'noopener' }, s.asset.display_id) : '—'),
    h('td', { class: 'muted small' }, s.decision_reason || ''),
    h('td', { class: 'muted small' }, fmtDateTime(s.created_at)));
}

export function mount(container, ctx) {
  const code = ctx.route.id;
  container.append(pageHeader(t('slot.title') + (code ? ' · ' + code : ''), ''));
  const body = h('div', { class: 'pad kho-slot' }, skeleton(6));
  container.append(body);
  let alive = true;
  if (!code) { clear(body); body.append(h('p', { class: 'muted' }, t('slot.not_found'))); return () => { alive = false; }; }
  get('/api/kit/slot/' + encodeURIComponent(code)).then((res) => {
    if (!alive) return;
    clear(body);
    const slot = res.slot;
    const head = h('section', { class: 'slot-head' },
      h('h2', null, slot.title_vi, ' / ', slot.title_en), h('div', { class: 'muted small mono' }, slot.code),
      h('div', { class: 'row' }, h('span', { class: 'muted small' }, t('slot.group') + ': '), badge(slot.group_code, 'idle'),
        slot.subject_rev ? h('span', { class: 'muted small' }, ' · ' + t('slot.subject_rev') + ': ' + slot.subject_rev) : null),
      h('div', { class: 'muted small' }, t('slot.added_in') + ' ' + slot.added_in + (slot.retired_in ? ' · ' + t('slot.retired', { v: slot.retired_in }) : '')));
    const req = res.required || { m: [], mh: [] };
    const criteria = h('section', { class: 'slot-criteria' },
      h('div', { class: 'muted small' }, h('strong', null, t('slot.required_m')), ': ', req.m.join(', ') || '—'),
      h('div', { class: 'muted small' }, h('strong', null, t('slot.required_mh')), ': ', req.mh.join(', ') || '—'));
    const subs = res.submissions || [];
    const history = h('section', { class: 'slot-history' }, h('h3', null, t('slot.history')),
      subs.length ? h('table', { class: 'simple-table' },
        h('thead', null, h('tr', null, ['ID', t('col.state'), '#', t('queue.tab_checks'), t('slot.current_asset'), t('col.decision_reason'), t('col.created_at')].map((x) => h('th', null, x)))),
        h('tbody', null, subs.map(subRow)))
        : h('p', { class: 'muted' }, t('slot.history_empty')));
    const certs = res.certs || [];
    const certsBox = h('section', { class: 'slot-certs' }, h('h3', null, t('slot.certs')),
      certs.length ? h('ul', null, certs.map((c) => h('li', null, t('slot.cert_via', { via: tOr('col.' + c.via, c.via), at: fmtDateTime(c.at) }), ' — ', h('span', { class: 'mono small' }, c.asset_id))))
        : h('p', { class: 'muted' }, t('slot.certs_empty')));
    body.append(head, criteria, history, certsBox);
  }, (e) => { if (!alive) return; clear(body); body.append(errorBanner(e, () => mount(container, ctx))); });
  return () => { alive = false; };
}
