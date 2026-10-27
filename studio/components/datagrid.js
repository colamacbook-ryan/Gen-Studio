// © 2026 Gen Labs — All rights reserved.
// DataGrid dùng chung (STD-07 §5): toolbar + ô truy vấn → q, formula bar, chữ cột, cột ID đóng băng, footer từ API.
import { h, icon, clear } from './dom.js';
import { t, tOr } from '../i18n.js';
import { get } from './api.js';
import { skeleton, emptyState, errorBanner, badge } from './states.js';
import { toText, statusTone, csvEscape, fmtDur, fmtVal } from './util.js';

const STATE_KEYS = /^(state|status|decision|result|role)$/;

function widthFor(col, i) {
  if (i === 0) return '104px';
  switch (col.type) {
    case 'num': case 'number': case 'int': return '88px';
    case 'time': case 'datetime': return '150px';
    case 'badge': case 'state': return '140px';
    default: return STATE_KEYS.test(col.key) ? '140px' : 'minmax(160px,1fr)';
  }
}

export function fmtDateTime(v) {
  const d = new Date(v);
  if (isNaN(d.getTime())) return toText(v);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function cellText(col, v) {
  if (v == null) return '';
  if ((col.type === 'time' || col.type === 'datetime' || /_at$/.test(col.key)) && (typeof v === 'string' || typeof v === 'number')) return fmtDateTime(v);
  if (col.type === 'duration' && typeof v === 'number') return fmtDur(v);
  if (typeof v === 'number') return v.toLocaleString();
  if (Array.isArray(v) && v.every(x => x == null || typeof x !== 'object')) return v.join(', ');
  if (typeof v === 'object') return fmtVal(col.key, v);
  return toText(v);
}

function cellNode(col, v, idx) {
  const text = cellText(col, v);
  if (idx === 0) return h('span', { class: 'mono id' }, text);
  if (col.type === 'badge' || col.type === 'state' || STATE_KEYS.test(col.key)) return text ? badge(tOr('st.' + text, text), statusTone(text)) : '';
  if (col.type === 'num' || col.type === 'number' || col.type === 'int' || col.type === 'duration') return h('span', { class: 'mono num' }, text);
  if (col.type === 'id' || /(^|_)id$/.test(col.key)) return h('span', { class: 'mono' }, text);
  return text;
}

export function createDataGrid(opts) {
  const { name, onSelect, onOpen, extra, selectedId, emptyText } = opts;
  let q = opts.q || '';
  let sort = '';
  let data = null;
  let selRow = -1; let selCol = 0; let selId = selectedId || null;
  let seen = null; let alive = true; let updatedAt = null;

  const qInput = h('input', {
    type: 'text', class: 'query mono', placeholder: t('grid.query_ph'), 'aria-label': t('grid.query'), value: q,
    onkeydown: (e) => { if (e.key === 'Enter') { q = qInput.value.trim(); load(); } e.stopPropagation(); },
  });
  const refBox = h('span', { class: 'fx-ref mono' }, '—');
  const fxVal = h('span', { class: 'fx-val mono' }, '');
  const scroller = h('div', { class: 'grid-scroll', tabindex: '0', role: 'table', 'aria-label': name });
  const footer = h('div', { class: 'grid-foot' });
  const csvBtn = h('button', { type: 'button', class: 'icon-btn', title: t('grid.csv'), 'aria-label': t('grid.csv'), onclick: exportCsv }, icon('download'));
  const reloadBtn = h('button', { type: 'button', class: 'icon-btn', title: t('state.retry'), 'aria-label': t('state.retry'), onclick: () => load() }, icon('clock'));
  const el = h('section', { class: 'datagrid' },
    h('div', { class: 'grid-toolbar' },
      h('span', { class: 'view-label' }, t('grid.view_all')),
      h('div', { class: 'query-wrap' }, qInput),
      h('button', { type: 'button', class: 'icon-btn', title: t('grid.run_query'), 'aria-label': t('grid.run_query'), onclick: () => { q = qInput.value.trim(); load(); } }, icon('filter')),
      csvBtn, reloadBtn, ...(extra || [])),
    h('div', { class: 'grid-formula' }, refBox, h('span', { class: 'fx' }, 'fx'), fxVal),
    scroller, footer);

  function rowId(row) { return data && data.columns.length ? toText(row[data.columns[0].key]) : ''; }

  function select(ri, ci, fromKey) {
    if (!data || !data.rows.length) return;
    selRow = Math.max(0, Math.min(data.rows.length - 1, ri));
    selCol = Math.max(0, Math.min(data.columns.length - 1, ci));
    const row = data.rows[selRow]; const col = data.columns[selCol];
    selId = rowId(row);
    refBox.textContent = selId + ' · ' + String.fromCharCode(65 + selCol);
    fxVal.textContent = cellText(col, row[col.key]);
    for (const r of scroller.querySelectorAll('.grow')) r.classList.toggle('sel', r.dataset.id === selId);
    for (const c of scroller.querySelectorAll('.gcell.csel')) c.classList.remove('csel');
    const rowEl = scroller.querySelector('.grow[data-id="' + CSS.escape(selId) + '"]');
    const cellEl = rowEl && rowEl.children[selCol];
    if (cellEl) { cellEl.classList.add('csel'); if (fromKey) rowEl.scrollIntoView({ block: 'nearest' }); }
    if (onSelect) onSelect(row);
    renderFooter();
  }

  function renderFooter() {
    clear(footer);
    if (!data) return;
    const f = data.footer && typeof data.footer === 'object' ? data.footer : {};
    const count = f.count ?? f.total ?? data.rows.length;
    footer.appendChild(h('span', null, t('grid.rows', { n: count }) + (selRow >= 0 ? ' · ' + t('grid.selected', { n: 1 }) : '')));
    for (const [k, v] of Object.entries(f)) {
      if (k === 'count' || k === 'total') continue;
      footer.appendChild(h('span', { class: 'mono sigma' }, tOr('foot.' + k, k) + ': ' + fmtVal(k, v)));
    }
    footer.appendChild(h('span', { class: 'spacer' }));
    if (updatedAt) footer.appendChild(h('span', null, t('grid.updated', { time: fmtDateTime(updatedAt).slice(11) })));
  }

  function render() {
    clear(scroller);
    const cols = data.columns;
    const tpl = cols.map(widthFor).join(' ');
    const minW = 'max-content';
    const letters = h('div', { class: 'grow letters', role: 'row', style: { gridTemplateColumns: tpl, minWidth: minW } },
      cols.map((c, i) => h('div', { class: 'gcell mono' + (i === 0 ? ' frozen' : ''), role: 'presentation' }, String.fromCharCode(65 + i))));
    const head = h('div', { class: 'grow ghead', role: 'row', style: { gridTemplateColumns: tpl, minWidth: minW } },
      cols.map((c, i) => {
        const active = sort === c.key ? '▲' : sort === '-' + c.key ? '▼' : '';
        return h('div', {
          class: 'gcell' + (i === 0 ? ' frozen' : ''), role: 'columnheader', tabindex: '-1',
          onclick: () => { sort = sort === c.key ? '-' + c.key : sort === '-' + c.key ? '' : c.key; load(); },
        }, tOr('col.' + c.key, c.label || c.key), active ? h('span', { class: 'sortmark' }, active) : null);
      }));
    scroller.appendChild(letters); scroller.appendChild(head);
    if (!data.rows.length) { scroller.appendChild(emptyState(emptyText || t('state.empty'))); return; }
    data.rows.forEach((row, ri) => {
      const id = rowId(row);
      const isNew = seen && !seen.has(id);
      const r = h('div', {
        class: 'grow' + (isNew ? ' row-new' : '') + (id === selId ? ' sel' : ''), role: 'row', 'data-id': id,
        style: { gridTemplateColumns: tpl, minWidth: minW },
        ondblclick: () => onOpen && onOpen(row),
      }, cols.map((c, ci) => h('div', {
        class: 'gcell' + (ci === 0 ? ' frozen' : ''), role: 'cell',
        onclick: () => select(ri, ci),
      }, cellNode(c, row[c.key], ci))));
      scroller.appendChild(r);
    });
    seen = new Set(data.rows.map(rowId));
    if (selId) {
      const i = data.rows.findIndex((r) => rowId(r) === selId);
      if (i >= 0) { selRow = i; select(i, selCol); } else selRow = -1;
    }
  }

  scroller.addEventListener('keydown', (e) => {
    if (!data || !data.rows.length) return;
    const k = e.key;
    if (k === 'ArrowDown' || k === 'j') { e.preventDefault(); select(selRow + 1, selCol, true); }
    else if (k === 'ArrowUp' || k === 'k') { e.preventDefault(); select(selRow < 0 ? 0 : selRow - 1, selCol, true); }
    else if (k === 'ArrowRight') { e.preventDefault(); select(Math.max(selRow, 0), selCol + 1, true); }
    else if (k === 'ArrowLeft') { e.preventDefault(); select(Math.max(selRow, 0), selCol - 1, true); }
    else if (k === 'Enter' && selRow >= 0 && onOpen) { e.preventDefault(); onOpen(data.rows[selRow]); }
  });

  function exportCsv() {
    if (!data) return;
    const lines = [data.columns.map((c) => csvEscape(c.label || c.key)).join(',')];
    for (const r of data.rows) lines.push(data.columns.map((c) => csvEscape(r[c.key])).join(','));
    const a = h('a', { href: URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' })), download: name + '.csv' });
    document.body.appendChild(a); a.click(); a.remove();
  }

  async function load(silent) {
    if (!alive) return;
    if (!silent || !data) { clear(scroller); scroller.appendChild(skeleton(7)); }
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (sort) params.set('sort', sort);
    const qs = params.toString();
    try {
      const res = await get('/api/grid/' + encodeURIComponent(name) + (qs ? '?' + qs : ''));
      if (!alive) return;
      data = { columns: Array.isArray(res && res.columns) ? res.columns : [], rows: Array.isArray(res && res.rows) ? res.rows : [], footer: res && res.footer };
      updatedAt = Date.now();
      render(); renderFooter();
    } catch (e) {
      if (!alive) return;
      clear(scroller); scroller.appendChild(errorBanner(e, () => load()));
    }
  }

  load();
  return {
    el, reload: () => load(true), destroy: () => { alive = false; },
    getRows: () => (data ? data.rows : []),
  };
}
