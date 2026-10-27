// © 2026 Gen Labs — All rights reserved.
// Màn lưới chung: page header + DataGrid + Inspector 400px (danh sách trường của hàng đang chọn).
import { h, clear } from '../components/dom.js';
import { t, tOr } from '../i18n.js';
import { createDataGrid, cellText } from '../components/datagrid.js';
import { pageHeader } from '../components/shell.js';
import { onDebounced } from '../components/bus.js';
import { toText } from '../components/util.js';

// Inspector mặc định: bảng trường/giá trị. Giá trị object -> JSON mono (không render object vào DOM).
export function fieldList(row) {
  const box = h('dl', { class: 'fields' });
  for (const [k, v] of Object.entries(row || {})) {
    const isObj = v != null && typeof v === 'object';
    box.append(h('dt', { class: 'micro' }, tOr('col.' + k, k)),
      h('dd', { class: isObj || /(^|_)id$/.test(k) ? 'mono' : null }, isObj ? toText(v) : cellText({ key: k }, v)));
  }
  return box;
}

// cfg: {grid, title, desc, empty, actions(ctx, grid)→nodes, inspector(row, ctx, reload)→node, onOpen(row, ctx), q}
export function gridView(cfg) {
  return function mount(container, ctx) {
    let selected = null;
    const inspector = h('aside', { class: 'inspector', 'aria-label': t('insp.title') });
    const placeholder = () => { clear(inspector); inspector.append(h('div', { class: 'insp-empty muted' }, t('insp.pick'))); };
    placeholder();
    let grid = null;
    const showRow = (row) => {
      selected = row; clear(inspector);
      inspector.append(h('div', { class: 'insp-head micro' }, t('insp.title')),
        cfg.inspector ? cfg.inspector(row, ctx, () => grid.reload()) : fieldList(row));
    };
    grid = createDataGrid({
      name: cfg.grid, q: cfg.q, emptyText: cfg.empty ? t(cfg.empty) : undefined, selectedId: ctx.route.id,
      onSelect: showRow, onOpen: cfg.onOpen ? (row) => cfg.onOpen(row, ctx) : undefined,
      extra: cfg.actions ? cfg.actions(ctx, () => grid.reload()) : [],
    });
    container.append(...[pageHeader(t(cfg.title), cfg.desc ? t(cfg.desc) : '', cfg.headerActions ? cfg.headerActions(ctx, () => grid.reload()) : []),
      cfg.tabs ? cfg.tabs(ctx) : null,
      h('div', { class: 'work' }, grid.el, inspector)].filter(Boolean));
    const off = onDebounced('change', () => grid.reload());
    return () => { off(); grid.destroy(); };
  };
}
