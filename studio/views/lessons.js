// © 2026 Gen Labs — All rights reserved.
// Bài học (P2): lưới (cột Loại + Tỉ lệ do máy chủ khai) + Inspector: đầu thẻ (loại · tỉ lệ · kênh · "Tạo lệnh bản …") và các tab
// Kịch bản · Nhịp hình · Màn hình & bước (chỉ bài hướng dẫn) · Phiên bản · Nguồn gốc. Gói UI-P2 (= UI-TUT), SPEC-0.2.0 §6.12 + F7 §10.5.
// Tỉ lệ khung: thành phần dùng chung UI-0 (components/aspect.js).
import { h, clear, icon, toast } from '../components/dom.js';
import { t, tOr } from '../i18n.js';
import { get, post } from '../components/api.js';
import { createDataGrid } from '../components/datagrid.js';
import { pageHeader } from '../components/shell.js';
import { openDialog, field } from '../components/dialog.js';
import { skeleton, errorBanner, emptyState, badge } from '../components/states.js';
import { onDebounced } from '../components/bus.js';
import { buildHash, splitTerms, toText, fmtTc, statusTone } from '../components/util.js';
import * as A from '../components/aspect.js';


const TABS = ['script', 'beats', 'screens', 'versions', 'lineage'];
const CURSOR_BLOCKS = new Set(['cursor', 'focus', 'callout', 'keystroke', 'screen']);

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
const anchorText = (b) => (b.anchor && typeof b.anchor === 'object' ? toText(b.anchor.line) + ' “' + toText(b.anchor.word != null ? b.anchor.word : b.anchor.word_index) + '”' : toText(b.anchor));
function beatsTab(d) {
  const beats = d.beats || (d.lesson && d.lesson.beats) || [];
  if (!beats.length) return emptyState(t('lesson.no_beats'));
  return h('div', { class: 'sub-grid' }, beats.map((b) => h('div', { class: 'sub-row' }, h('span', { class: 'mono id' }, toText(b.display_id || b.id)),
    h('span', { class: 'mono' }, toText(b.block)), h('span', { class: 'muted' }, anchorText(b)),
    h('span', { class: 'mono clip', title: toText(b.params) }, toText(b.params)))));
}
// Màn hình & bước (chỉ bài hướng dẫn): ảnh nhỏ + khung đích + vùng che; lưới con các bước con trỏ.
function screenCard(sc) {
  const src = sc.source || {};
  const mock = src.mock && typeof src.mock === 'object' ? src.mock : null;
  const size = Array.isArray(sc.size) ? sc.size : mock ? [mock.w, mock.h] : null;
  const targets = sc.targets && typeof sc.targets === 'object' ? Object.entries(sc.targets) : [];
  const redact = Array.isArray(sc.redact) ? sc.redact : [];
  // đích của màn giả lập là phần tử có id trong DSL (không có toạ độ): liệt kê theo tên
  const mockIds = [];
  (function walk(n, depth) { if (!n || typeof n !== 'object' || depth > 8 || mockIds.length > 40) return; if (typeof n.id === 'string') mockIds.push(n.id); (n.children || n.items || []).forEach((c) => walk(c, depth + 1)); })(mock && mock.root, 0);
  const thumb = h('div', { class: 'scr-thumb' + (mock ? ' mock' : ''), style: size ? { aspectRatio: size[0] + ' / ' + size[1] } : null });
  if (src.asset) thumb.append(h('img', { src: '/media/' + encodeURIComponent(toText(src.asset)), alt: '', loading: 'lazy' }));
  else thumb.append(h('span', { class: 'mono scr-mock-label' }, t('lsn.screen.mock', { theme: toText(mock && mock.theme) || '—' })));
  if (size) {
    const pct = (v, of) => (Math.max(0, Math.min(1, Number(v) / of)) * 100) + '%';
    targets.forEach(([k, r]) => { if (r && typeof r === 'object' && r.w) thumb.append(h('span', { class: 'scr-target', title: k + (r.label ? ' · ' + toText(r.label) : ''), style: { left: pct(r.x, size[0]), top: pct(r.y, size[1]), width: pct(r.w, size[0]), height: pct(r.h, size[1]) } })); });
    redact.forEach((r) => { if (r && r.w) thumb.append(h('span', { class: 'scr-redact', style: { left: pct(r.x, size[0]), top: pct(r.y, size[1]), width: pct(r.w, size[0]), height: pct(r.h, size[1]) } })); });
  }
  const names = targets.length ? targets.map(([k]) => k) : mockIds;
  return h('div', { class: 'scr-card' }, thumb,
    h('div', { class: 'scr-meta' },
      h('div', { class: 'scr-head' }, h('span', { class: 'mono id' }, toText(sc.id)), h('span', { class: 'muted small' }, src.asset ? t('lsn.screen.asset', { id: toText(src.asset) }) : t('lsn.screen.mock', { theme: toText(mock && mock.theme) || '—' })),
        size ? h('span', { class: 'mono muted small' }, t('lsn.screen.size', { w: size[0], h: size[1] })) : null),
      h('div', { class: 'small muted' }, t('lsn.screen.targets', { n: names.length }) + (redact.length ? ' · ' + t('lsn.screen.redact', { n: redact.length }) : '')),
      names.length ? h('div', { class: 'scr-ids' }, names.slice(0, 12).map((n) => h('span', { class: 'mono chip' }, toText(n)))) : null));
}
function screensTab(d, ext) {
  const screens = (ext && Array.isArray(ext.screens) && ext.screens) || [];
  const beats = (d.beats || []).filter((b) => CURSOR_BLOCKS.has(b.block));
  const steps = beats.length ? h('div', { class: 'step-grid', role: 'table', 'aria-label': t('lsn.steps') },
    h('div', { class: 'step-row head', role: 'row' }, ['step', 'action', 'target', 'anchor', 'caption'].map((k) => h('span', { role: 'columnheader' }, t('lsn.col.' + k)))),
    beats.map((b) => {
      const p = b.params && typeof b.params === 'object' ? b.params : {};
      const action = b.block === 'cursor' ? toText(p.action || 'move') : b.block === 'screen' ? '→ ' + toText(p.screen) : b.block === 'keystroke' ? toText(p.keys || p.text || '') : b.block;
      return h('div', { class: 'step-row', role: 'row' }, h('span', { class: 'mono id', role: 'cell' }, toText(b.display_id || b.id)),
        h('span', { class: 'mono', role: 'cell' }, action), h('span', { class: 'mono', role: 'cell' }, toText(p.target || '')),
        h('span', { class: 'muted', role: 'cell' }, anchorText(b)), h('span', { role: 'cell', class: 'clip' }, toText(p.callout || p.caption || p.text || '')));
    })) : emptyState(t('lsn.no_steps'));
  return h('div', { class: 'scr-tab' },
    screens.length ? h('div', { class: 'scr-list' }, screens.map(screenCard)) : emptyState(t('lsn.no_screens')),
    h('p', { class: 'muted small' }, t('lsn.screen.edit_later')),
    h('div', { class: 'micro sp' }, t('lsn.steps')), steps);
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
        badge(tOr('st.' + toText(r.state), toText(r.state)), statusTone(r.state)), h('span', { class: 'muted' }, 'v' + toText(r.version != null ? r.version : '')));
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
  const items = Array.isArray(l) ? l : l && typeof l === 'object' ? Object.entries(l).flatMap(([k, v]) => (Array.isArray(v) ? v : [v && typeof v === 'object' ? v : { id: k + ': ' + toText(v) }])) : [];
  if (!items.length) return emptyState(t('lesson.no_lineage'));
  return h('div', { class: 'chain' }, items.map(chainItem));
}

// ---- "Tạo lệnh bản {v}" — tỉ lệ khác mà loại bài hỗ trợ (F7 §10.5); tutorial ⇒ tắt kèm lý do ----
// → [{id, def, ok, reason}] cho mọi tỉ lệ đang bật khác tỉ lệ hiện tại
export function otherAspects(cat, current, kind) {
  return ((cat && cat.aspects) || []).filter((a) => a.enabled !== false && a.id !== current).map((a) => {
    const ok = !Array.isArray(a.kinds) || a.kinds.includes(kind || 'lesson');
    return { id: a.id, def: a, ok, reason: ok ? null : t('aspect.tutorial_blocked') };
  });
}
export function makeOrderBrief({ id, title, aspect, def }) {
  let s = t('lsn.make_brief', { v: aspect, id, title });
  if (def && Array.isArray(def.target_s)) s += t('lsn.make_target', { a: def.target_s[0], b: def.target_s[1] });
  return s;
}
function makeOrderDialog({ lesson, ext, opt }) {
  const title = toText(lesson.title), id = toText(lesson.display_id), ch = ext && ext.channel;
  const brief = h('textarea', { class: 'input', rows: '4', 'aria-label': t('lsn.make_brief_label') });
  brief.value = makeOrderBrief({ id, title, aspect: opt.id, def: opt.def });
  const err = h('div');
  const size = (opt.def && opt.def.size) || A.ratioOf(opt.id) || [16, 9];
  const body = h('div', { class: 'form' },
    h('div', { class: 'order-sum' }, h('span', { class: 'mono' }, id), h('span', { class: 'muted' }, '→'), A.aspectBadge(opt.id), ch ? h('span', { class: 'muted small' }, t('lsn.channel') + ': ' + toText(ch.name || ch.display_id)) : null),
    h('p', { class: 'muted small' }, t('lsn.make_hint', { title, v: opt.id, w: size[0], h: size[1] })),
    field(t('lsn.make_brief_label'), brief), err);
  openDialog(t('lsn.make_title', { v: opt.id }), body, (close) => [
    h('button', { type: 'button', class: 'btn', onclick: close }, t('common.cancel')),
    h('button', { type: 'button', class: 'btn primary', onclick: async (e) => {
      const b = e.currentTarget; b.disabled = true; clear(err);
      try {
        const res = await post('/api/work_orders', { kind: 'manual', channel: ch ? ch.display_id : undefined, lesson: id, aspect: opt.id, brief: brief.value.trim() });
        const wo = res && (res.work_order || res);
        close(); toast(t('lsn.make_done', { id: toText(wo && wo.display_id) }), 'ok');
      } catch (ex) { err.append(errorBanner(ex)); b.disabled = false; }
    } }, t('lsn.make_submit')),
  ]);
}

function headerBlock(d, ext, cat, isOwner) {
  const lesson = d.lesson || {};
  const kind = (ext && ext.kind) || 'lesson';
  const aspect = (ext && ext.aspect) || '16:9';
  const fromChannel = ext && !ext.aspect_stored && ext.channel && ext.channel.default_aspect && ext.channel.default_aspect === aspect;
  const meta = h('div', { class: 'lsn-meta' },
    badge(tOr('kind.' + kind, kind) + (ext && ext.variant === 'trailer' ? ' · ' + t('lsn.variant.trailer') : ''), kind === 'tutorial' ? 'info' : 'idle'),
    A.aspectBadge(aspect), fromChannel ? h('span', { class: 'muted small' }, t('lsn.aspect_from_channel')) : null,
    ext && ext.channel ? h('span', { class: 'muted small' }, toText(ext.channel.name || ext.channel.display_id)) : null);
  const actions = h('div', { class: 'lsn-actions' });
  for (const o of otherAspects(cat, aspect, kind)) {
    const disabled = !o.ok || !isOwner;
    const b = h('button', { type: 'button', class: 'btn', disabled, 'aria-describedby': disabled ? 'lsn-why-' + o.def.token : null,
      onclick: () => makeOrderDialog({ lesson, ext, opt: o }) }, icon('plus'), t('aspect.make_other', { v: o.id }));
    actions.append(b);
    if (disabled) actions.append(h('p', { class: 'muted small lsn-why', id: 'lsn-why-' + o.def.token }, !o.ok ? o.reason : t('lsn.make_owner_only')));
  }
  return h('div', { class: 'lsn-head' }, h('div', { class: 'lsn-title' }, toText(lesson.title)), meta, actions);
}

function detailPanel(displayId, ctx) {
  const box = h('div', { class: 'lesson-detail' });
  let tab = 'script'; let data = null; let ext = null; let cat = null; let alive = true;
  const head = h('div');
  const body = h('div', { class: 'tab-body' });
  const tabsEl = h('div', { class: 'tabs small', role: 'tablist' });
  const isOwner = !!(ctx && ctx.me && ctx.me.user && ctx.me.user.role === 'owner');
  const draw = () => {
    clear(tabsEl); clear(body); clear(head);
    head.append(headerBlock(data, ext, cat, isOwner));
    const tabs = TABS.filter((k) => k !== 'screens' || (ext && ext.kind === 'tutorial'));
    if (!tabs.includes(tab)) tab = 'script';
    for (const k of tabs) tabsEl.append(h('button', { type: 'button', role: 'tab', 'aria-selected': tab === k ? 'true' : 'false', class: 'tab' + (tab === k ? ' active' : ''), onclick: () => { tab = k; draw(); } }, k === 'screens' ? t('lsn.tab.screens') : t('lesson.tab.' + k)));
    body.append(tab === 'screens' ? screensTab(data, ext) : { script: linesTab, beats: beatsTab, versions: versionsTab, lineage: lineageTab }[tab](data));
  };
  async function load() {
    clear(body); body.append(skeleton(5));
    try {
      const [d, x, c] = await Promise.all([
        get('/api/lessons/' + encodeURIComponent(displayId)),
        get('/api/lessons/' + encodeURIComponent(displayId) + '/ext').catch(() => null),
        A.loadAspects().catch(() => null)]);
      if (!alive) return; data = d; ext = x; cat = c; draw();
    } catch (e) { if (!alive) return; clear(body); body.append(errorBanner(e, load)); }
  }
  box.append(h('div', { class: 'insp-title mono' }, displayId), head, tabsEl, body);
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
    detail = detailPanel(id, ctx);
    inspector.append(h('div', { class: 'insp-head micro' }, t('insp.title')), detail.el);
  };
  const q0 = ctx.route && ctx.route.query && typeof ctx.route.query.q === 'string' ? ctx.route.query.q : '';
  // bộ lọc nhanh Loại + Tỉ lệ (truy vấn lưới `kind:` / `aspect:` — cột do máy chủ khai, F7 §3.6)
  const filt = { kind: (/(?:^|\s)kind:(\S+)/.exec(q0) || [])[1] || '', aspect: (/(?:^|\s)aspect:(\S+)/.exec(q0) || [])[1] || '' };
  const rest = q0.replace(/(?:^|\s)(?:kind|aspect):\S+/g, '').trim();
  const gridHost = h('div', { class: 'lsn-grid-host' });
  let grid = null;
  function buildGrid() {
    if (grid) grid.destroy();
    clear(gridHost);
    const q = [filt.kind ? 'kind:' + filt.kind : '', filt.aspect ? 'aspect:' + filt.aspect : '', rest].filter(Boolean).join(' ');
    grid = createDataGrid({ name: 'lessons', q, selectedId: currentId || ctx.route.id, onSelect: show, emptyText: t('lesson.empty') });
    gridHost.append(grid.el);
  }
  const chip = (key, val, label, extra) => h('button', { type: 'button', role: 'radio', 'aria-checked': filt[key] === val ? 'true' : 'false', class: 'seg-opt' + (filt[key] === val ? ' on' : ''),
    onclick: (e) => { filt[key] = val; for (const b of e.currentTarget.parentNode.children) { const on = b === e.currentTarget; b.classList.toggle('on', on); b.setAttribute('aria-checked', on ? 'true' : 'false'); } buildGrid(); } }, label, extra || null);
  const filters = h('div', { class: 'lsn-filters' },
    h('span', { class: 'micro' }, t('lsn.f.kind')),
    h('div', { class: 'brand-seg', role: 'radiogroup', 'aria-label': t('lsn.f.kind') }, chip('kind', '', t('lsn.f.all')), chip('kind', 'lesson', t('kind.lesson')), chip('kind', 'tutorial', t('kind.tutorial'))),
    h('span', { class: 'micro' }, t('aspect.label')),
    h('div', { class: 'brand-seg', role: 'radiogroup', 'aria-label': t('aspect.label') }, chip('aspect', '', t('lsn.f.all')), chip('aspect', '16:9', '16:9'), chip('aspect', '9:16', '9:16')));
  buildGrid();
  container.append(pageHeader(t('nav.lessons'), t('lesson.desc'), [filters]), h('div', { class: 'work' }, gridHost, inspector));
  const off = onDebounced('change', () => { if (grid) grid.reload(); if (detail) detail.reload(); });
  return () => { off(); if (grid) grid.destroy(); if (detail) detail.destroy(); };
}
