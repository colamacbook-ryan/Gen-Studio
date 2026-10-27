// © 2026 Gen Labs — All rights reserved.
// Bài học: lưới + Inspector 4 tab (Kịch bản · Nhịp hình · Phiên bản · Nguồn gốc).
import { h, clear } from '../components/dom.js';
import { t } from '../i18n.js';
import { get } from '../components/api.js';
import { createDataGrid } from '../components/datagrid.js';
import { pageHeader } from '../components/shell.js';
import { skeleton, errorBanner, emptyState, badge } from '../components/states.js';
import { onDebounced } from '../components/bus.js';
import { buildHash, splitTerms, toText, fmtTc, statusTone } from '../components/util.js';

const TABS = ['script', 'beats', 'versions', 'lineage'];

export function termSpans(say, terms) {
  return splitTerms(say, terms).map((p) => (p.term ? h('span', { class: 'term' }, p.text) : p.text));
}

function linesTab(d) {
  const lines = d.lines || (d.lesson && d.lesson.lines) || [];
  if (!lines.length) return emptyState(t('lesson.no_lines'));
  return h('div', { class: 'sub-grid' }, lines.map((l) => h('div', { class: 'sub-row' },
    h('span', { class: 'mono id' }, toText(l.display_id || l.id)),
    h('span', { class: 'who' }, toText(l.who_name || l.who)),
    h('span', { class: 'say' }, termSpans(l.say, l.terms)),
    l.a_ms != null ? h('span', { class: 'mono muted' }, fmtTc(l.a_ms)) : null)));
}
function beatsTab(d) {
  const beats = d.beats || (d.lesson && d.lesson.beats) || [];
  if (!beats.length) return emptyState(t('lesson.no_beats'));
  return h('div', { class: 'sub-grid' }, beats.map((b) => {
    const anchor = b.anchor && typeof b.anchor === 'object' ? toText(b.anchor.line) + ' “' + toText(b.anchor.word != null ? b.anchor.word : b.anchor.word_index) + '”' : toText(b.anchor);
    return h('div', { class: 'sub-row' }, h('span', { class: 'mono id' }, toText(b.display_id || b.id)),
      h('span', { class: 'mono' }, toText(b.block)), h('span', { class: 'muted' }, anchor),
      h('span', { class: 'mono clip', title: toText(b.params) }, toText(b.params)));
  }));
}
function versionsTab(d) {
  const versions = d.versions || [];
  const renders = d.renders || [];
  return h('div', null,
    versions.length ? h('div', { class: 'sub-grid' }, versions.map((v) => h('div', { class: 'sub-row' },
      h('span', { class: 'mono id' }, 'v' + toText(v.version != null ? v.version : v.n)), h('span', { class: 'muted' }, toText(v.created_at || '')),
      h('span', null, toText(v.note || v.summary || ''))))) : emptyState(t('lesson.no_versions')),
    h('div', { class: 'micro sp' }, t('lesson.renders')),
    renders.length ? h('div', { class: 'sub-grid' }, renders.map((r) => {
      const id = toText(r.display_id || r.id);
      return h('div', { class: 'sub-row' }, h('a', { class: 'mono id', href: buildHash('review', id) }, id),
        badge(toText(r.state), statusTone(r.state)), h('span', { class: 'muted' }, 'v' + toText(r.version != null ? r.version : '')));
    })) : emptyState(t('lesson.no_renders')));
}
function chainItem(it) {
  if (it && typeof it === 'object') {
    const id = toText(it.display_id || it.id);
    const label = toText(it.label || it.title || it.name || '');
    const link = /^RD-/.test(id) ? buildHash('review', id) : /^LS-/.test(id) ? buildHash('lessons', id) : null;
    return h('div', { class: 'chain-item' }, link ? h('a', { class: 'mono', href: link }, id) : h('span', { class: 'mono' }, id), label ? h('span', { class: 'muted' }, ' ' + label) : null);
  }
  return h('div', { class: 'chain-item mono' }, toText(it));
}
function lineageTab(d) {
  const l = d.lineage;
  const items = Array.isArray(l) ? l : l && typeof l === 'object' ? Object.entries(l).map(([k, v]) => (v && typeof v === 'object' ? v : { id: k + ': ' + toText(v) })) : [];
  if (!items.length) return emptyState(t('lesson.no_lineage'));
  return h('div', { class: 'chain' }, items.map(chainItem));
}

function detailPanel(displayId) {
  const box = h('div', { class: 'lesson-detail' });
  let tab = 'script'; let data = null; let alive = true;
  const body = h('div', { class: 'tab-body' });
  const tabsEl = h('div', { class: 'tabs small', role: 'tablist' });
  const draw = () => {
    clear(tabsEl); clear(body);
    for (const k of TABS) tabsEl.append(h('button', { type: 'button', role: 'tab', class: 'tab' + (tab === k ? ' active' : ''), onclick: () => { tab = k; draw(); } }, t('lesson.tab.' + k)));
    body.append({ script: linesTab, beats: beatsTab, versions: versionsTab, lineage: lineageTab }[tab](data));
  };
  async function load() {
    clear(body); body.append(skeleton(5));
    try { data = await get('/api/lessons/' + encodeURIComponent(displayId)); if (!alive) return; draw(); }
    catch (e) { if (!alive) return; clear(body); body.append(errorBanner(e, load)); }
  }
  const lessonRow = h('div', { class: 'insp-title mono' }, displayId);
  box.append(lessonRow, tabsEl, body);
  load();
  return { el: box, destroy: () => { alive = false; }, reload: load };
}

export function mount(container, ctx) {
  const inspector = h('aside', { class: 'inspector', 'aria-label': t('insp.title') }, h('div', { class: 'insp-empty muted' }, t('insp.pick')));
  let detail = null; let currentId = null;
  const show = (row) => {
    const id = toText(row.display_id || row.id || Object.values(row)[0]);
    if (id === currentId) return;
    currentId = id;
    if (detail) detail.destroy();
    clear(inspector);
    detail = detailPanel(id);
    inspector.append(h('div', { class: 'insp-head micro' }, t('insp.title')), detail.el);
  };
  const grid = createDataGrid({ name: 'lessons', selectedId: ctx.route.id, onSelect: show, emptyText: t('lesson.empty') });
  container.append(pageHeader(t('nav.lessons'), t('lesson.desc')), h('div', { class: 'work' }, grid.el, inspector));
  const off = onDebounced('change', () => { grid.reload(); if (detail) detail.reload(); });
  return () => { off(); grid.destroy(); if (detail) detail.destroy(); };
}
