// © 2026 Gen Labs — All rights reserved.
// Màn lưới chung: page header + DataGrid + Inspector 400px (danh sách trường của hàng đang chọn).
import { h, clear } from '../components/dom.js';
import { t, tOr } from '../i18n.js';
import { createDataGrid, cellText } from '../components/datagrid.js';
import { pageHeader } from '../components/shell.js';
import { onDebounced } from '../components/bus.js';
import { toText, statusTone } from '../components/util.js';
import { badge } from '../components/states.js';

// Inspector mặc định: bảng trường/giá trị. Giá trị object -> JSON mono (không render object vào DOM).
// Giá trị: trạng thái → huy hiệu; mảng đơn giản → "a, b, c"; ngày → định dạng đọc được; object → JSON mono (không render object vào DOM).
// Nhãn: i18n col.<khoá> → nhãn cột từ API → khoá (không bao giờ hiện khoá in hoa thô nếu đã biết nhãn).
export function fieldList(row, columns) {
  const meta = {};
  (columns || []).forEach((c) => { meta[c.key] = c; });
  const box = h('dl', { class: 'fields' });
  for (const [k, v] of Object.entries(row || {})) {
    if (k === 'id' && 'display_id' in row) continue;   // trùng cột ID
    const isObj = v != null && typeof v === 'object' && !(Array.isArray(v) && v.every((x) => x == null || typeof x !== 'object'));
    const label = tOr('col.' + k, meta[k] ? meta[k].label : k);
    let val;
    if (isObj) val = toText(v);
    else if (v != null && /^(state|status|decision|result|role)$/.test(k)) val = badge(tOr('st.' + v, toText(v)), statusTone(v));
    else if (k === 'kind' && typeof v === 'string') val = tOr('kind.' + v, v);
    else val = cellText(meta[k] || { key: k }, v);
    box.append(h('dt', { class: 'micro' }, label), h('dd', { class: isObj || /(^|_)id$/.test(k) ? 'mono' : null }, val));
  }
  return box;
}

// cfg: {grid, title, desc, empty, actions(ctx, grid)→nodes, inspector(row, ctx, reload)→node, onOpen(row, ctx), q}
export function gridView(cfg) {
  return function mount(container, ctx, tabsEl) {
    let selected = null;
    const inspector = h('aside', { class: 'inspector', 'aria-label': t('insp.title') });
    const placeholder = () => { clear(inspector); inspector.append(h('div', { class: 'insp-empty muted' }, t('insp.pick'))); };
    placeholder();
    let grid = null;
    const showRow = (row) => {
      selected = row; clear(inspector);
      inspector.append(h('div', { class: 'insp-head micro' }, t('insp.title')),
        cfg.inspector ? cfg.inspector(row, ctx, () => grid.reload(), grid.getColumns()) : fieldList(row, grid.getColumns()));
    };
    grid = createDataGrid({
      name: cfg.grid, q: cfg.q, emptyText: cfg.empty ? t(cfg.empty) : undefined, selectedId: ctx.route.id,
      onSelect: showRow, onOpen: cfg.onOpen ? (row) => cfg.onOpen(row, ctx) : undefined,
      extra: cfg.actions ? cfg.actions(ctx, () => grid.reload()) : [],
    });
    container.append(...[pageHeader(t(cfg.title), cfg.desc ? t(cfg.desc) : '', cfg.headerActions ? cfg.headerActions(ctx, () => grid.reload()) : []),
      cfg.tabs ? cfg.tabs(ctx) : tabsEl || null,
      h('div', { class: 'work' }, grid.el, inspector)].filter(Boolean));
    const off = onDebounced('change', () => grid.reload());
    return () => { off(); grid.destroy(); };
  };
}
