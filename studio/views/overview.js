// © 2026 Gen Labs — All rights reserved.
// Tổng quan: "Việc của bạn" + số đo từ GET /api/overview (hiển thị tổng quát, không giả định lược đồ).
import { h, clear } from '../components/dom.js';
import { t, tOr } from '../i18n.js';
import { get } from '../components/api.js';
import { pageHeader } from '../components/shell.js';
import { skeleton, errorBanner, emptyState } from '../components/states.js';
import { onDebounced } from '../components/bus.js';
import { buildHash, toText } from '../components/util.js';

// Làm phẳng object lồng nhau thành [[khoá, giá trị chuỗi]] (mảng -> số phần tử hoặc danh sách ngắn).
export function flatten(obj, prefix = '', out = [], depth = 0) {
  for (const [k, v] of Object.entries(obj || {})) {
    const key = prefix ? prefix + '.' + k : k;
    if (Array.isArray(v)) out.push([key, v.every((x) => x == null || typeof x !== 'object') ? v.map(toText).join(', ') || '0' : String(v.length)]);
    else if (v && typeof v === 'object' && depth < 2) flatten(v, key, out, depth + 1);
    else out.push([key, toText(v)]);
  }
  return out;
}

export function mount(container, ctx) {
  const body = h('div', { class: 'overview' });
  container.append(pageHeader(t('nav.overview'), t('ov.desc')), body);
  let alive = true;
  async function load() {
    if (!body.firstChild) body.append(skeleton(6));
    try {
      const data = await get('/api/overview');
      if (!alive) return;
      clear(body);
      const o = data || {};
      const pending = Number(o.pending_review ?? o.awaiting_review ?? (o.review && o.review.pending) ?? 0) || 0;
      body.append(h('section', { class: 'band' },
        h('div', { class: 'micro' }, t('ov.yours')),
        pending > 0
          ? h('div', { class: 'band-row' }, h('span', { class: 'big mono' }, String(pending)), h('span', null, t('ov.pending', { n: pending })),
            h('a', { class: 'btn primary', href: buildHash('review') }, t('ov.open_theater')))
          : h('div', { class: 'band-row muted' }, t('ov.nothing'))));
      const rows = flatten(o);
      if (!rows.length) { body.append(emptyState(t('ov.empty'), h('a', { class: 'btn', href: buildHash('agents') }, t('ov.connect_agent')))); return; }
      body.append(h('section', { class: 'band' }, h('div', { class: 'micro' }, t('ov.metrics')),
        h('div', { class: 'metrics' }, rows.map(([k, v]) => h('div', { class: 'metric' },
          h('span', { class: 'muted' }, tOr('ov.k.' + k, k)), h('span', { class: 'mono' }, v))))));
    } catch (e) { if (!alive) return; clear(body); body.append(errorBanner(e, load)); }
  }
  load();
  const off = onDebounced('change', load, 500);
  return () => { alive = false; off(); };
}
