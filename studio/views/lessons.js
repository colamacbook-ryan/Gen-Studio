// © 2026 Gen Labs — All rights reserved.
// Bài học (P2): lưới (cột Loại + Tỉ lệ do máy chủ khai) + Inspector: đầu thẻ (loại · tỉ lệ · kênh · "Tạo lệnh bản …") và các tab
// Kịch bản · Nhịp hình · Màn hình & bước (chỉ bài hướng dẫn) · Phiên bản · Nguồn gốc. Gói UI-P2 (= UI-TUT), SPEC-0.2.0 §6.12 + F7 §10.5.
// File này cũng giữ ADAPTER UI-0 (bộ chọn/badge/khung tỉ lệ) dùng chung cho Phòng chiếu và tab Nhận diện cho tới khi gộp studio/components/aspect.js.
import { h, clear, icon, toast } from '../components/dom.js';
import { t, tOr } from '../i18n.js';
import { get, post } from '../components/api.js';
import { createDataGrid } from '../components/datagrid.js';
import { pageHeader } from '../components/shell.js';
import { openDialog, field } from '../components/dialog.js';
import { skeleton, errorBanner, emptyState, badge } from '../components/states.js';
import { onDebounced } from '../components/bus.js';
import { buildHash, splitTerms, toText, fmtTc, statusTone } from '../components/util.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

// ======================= ADAPTER UI-0 =======================
// Hợp đồng UI-0 (SPEC-0.2.0-F7 §10.5): loadAspects · aspectPicker · aspectBadge · aspectRatioCss · safeOverlay · fitChips.
// Có `window.GSAspectUI` (UI-0 tự gắn) ⇒ dùng hàm của UI-0; chưa có ⇒ bản tối giản dưới đây tự đọc GET /api/aspects.
// KHI GỘP UI-0: thay khối này bằng `import * as A from '../components/aspect.js'` và trỏ AspectUI.* sang A.* (cùng chữ ký); bỏ khoá `lsn.asp.*`.
let catalogP = null;
const ui0 = (name) => (typeof window !== 'undefined' && window.GSAspectUI && typeof window.GSAspectUI[name] === 'function' ? window.GSAspectUI[name] : null);
const sizeOfId = (id) => { const m = /^(\d+):(\d+)$/.exec(String(id || '')); return m ? [Number(m[1]), Number(m[2])] : [16, 9]; };
export const AspectUI = {
  // → Promise<{version, default, aspects:[…], presets:[…]}> (cache theo phiên; lỗi ⇒ lần sau thử lại)
  load() {
    const f = ui0('loadAspects'); if (f) return f();
    if (!catalogP) catalogP = get('/api/aspects').catch((e) => { catalogP = null; throw e; });
    return catalogP;
  },
  def(cat, id) { return ((cat && cat.aspects) || []).find((a) => a.id === id) || null; },
  label(id) { const tok = String(id || '').replace(':', 'x'); return tOr('lsn.asp.' + tok, toText(id)); },
  ratioCss(id) { const f = ui0('aspectRatioCss'); if (f) return f(id); const [a, b] = sizeOfId(id); return a + ' / ' + b; },
  portrait(id) { const [a, b] = sizeOfId(id); return b > a; },
  badge(id) {
    const f = ui0('aspectBadge'); if (f) return f(id);
    const [a, b] = sizeOfId(id), vert = b > a;
    return h('span', { class: 'asp-badge' + (vert ? ' vert' : ''), title: AspectUI.label(id) }, h('i', { class: 'asp-glyph', 'aria-hidden': 'true' }), h('span', { class: 'mono' }, toText(id)));
  },
  // segmented control; chỉ 1 lựa chọn ⇒ nhãn tĩnh. options: [{id, disabled?, title?}]
  picker({ options, value, onChange, label }) {
    const f = ui0('aspectPicker'); if (f) return f({ aspects: options, value, onChange });
    const opts = (options || []).filter(Boolean);
    if (opts.length <= 1) return h('span', { class: 'asp-static' }, AspectUI.badge(opts[0] ? opts[0].id : value));
    let cur = value;
    const box = h('div', { class: 'asp-seg', role: 'radiogroup', 'aria-label': label || t('lsn.asp.label') });
    const paint = () => { for (const b of box.children) { const on = b.dataset.id === cur; b.setAttribute('aria-checked', on ? 'true' : 'false'); b.classList.toggle('on', on); b.tabIndex = on ? 0 : -1; } };
    for (const o of opts) {
      box.append(h('button', { type: 'button', role: 'radio', class: 'asp-opt', 'data-id': o.id, disabled: !!o.disabled, title: o.title || AspectUI.label(o.id),
        onclick: () => { if (o.disabled || cur === o.id) return; cur = o.id; paint(); if (onChange) onChange(o.id); },
        onkeydown: (e) => {
          if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
          e.preventDefault(); const live = opts.filter((x) => !x.disabled); const i = live.findIndex((x) => x.id === cur);
          const nx = live[(i + (e.key === 'ArrowRight' ? 1 : live.length - 1)) % live.length]; if (nx) { cur = nx.id; paint(); box.querySelector('[data-id="' + nx.id + '"]').focus(); if (onChange) onChange(nx.id); }
        } }, AspectUI.badge(o.id)));
    }
    paint();
    return box;
  },
  // lớp phủ SVG theo toạ độ khung (viewBox = size): tô vùng ngoài khung cứng, viền vùng mềm, nhãn 3 dải. def = định nghĩa tỉ lệ có `safe`.
  safeOverlay(def, opts = {}) {
    const f = ui0('safeOverlay'); if (f) return f(def, { tier: opts.tier || 'both' });
    if (!def || !def.safe || !Array.isArray(def.size)) return null;
    const [W, H] = def.size, [x0, y0, x1, y1] = def.safe.hard, s = def.safe.soft;
    const el = (tag, attrs, text) => { const n = document.createElementNS(SVG_NS, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v)); if (text != null) n.textContent = text; return n; };
    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none', class: 'safe-ov', 'aria-hidden': 'true' });
    const defs = el('defs', {});
    const pat = el('pattern', { id: 'safe-hatch', width: 24, height: 24, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' });
    pat.append(el('rect', { width: 24, height: 24, fill: 'rgba(229,96,77,.22)' }), el('rect', { width: 6, height: 24, fill: 'rgba(229,96,77,.45)' }));
    defs.append(pat); svg.append(defs);
    svg.append(el('path', { d: `M0 0H${W}V${H}H0Z M${x0} ${y0}V${y1}H${x1}V${y0}Z`, 'fill-rule': 'evenodd', fill: 'url(#safe-hatch)' }));
    svg.append(el('rect', { x: x0, y: y0, width: x1 - x0, height: y1 - y0, fill: 'none', stroke: '#E5604D', 'stroke-width': 4 }));
    if (s && (opts.tier || 'both') !== 'hard') svg.append(el('rect', { x: s[0], y: s[1], width: s[2] - s[0], height: s[3] - s[1], fill: 'none', stroke: '#E8C547', 'stroke-width': 4, 'stroke-dasharray': '18 12' }));
    const lab = (x, y, text, anchor) => { const g = el('text', { x, y, 'text-anchor': anchor || 'middle', class: 'safe-lab' }, text); svg.append(g); };
    lab(W / 2, Math.max(48, y0 / 2 + 14), t('lsn.asp.safe.top'));
    lab(W / 2, y1 + (H - y1) / 2 + 14, t('lsn.asp.safe.bottom'));
    if (W - x1 > 90) { const tx = x1 + (W - x1) / 2; const g = el('text', { x: tx, y: (y0 + y1) / 2, 'text-anchor': 'middle', class: 'safe-lab', transform: `rotate(90 ${tx} ${(y0 + y1) / 2})` }, t('lsn.asp.safe.right')); svg.append(g); }
    return svg;
  },
  // chip mỗi nền tảng: vừa / quá thời lượng; nhãn "cần kiểm lại" khi preset chưa verify
  fitChips(fit, cat) {
    const f = ui0('fitChips'); if (f) return f(fit);
    const ids = Object.keys(fit || {});
    if (!ids.length) return null;
    const meta = (id) => ((cat && cat.presets) || []).find((p) => p.id === id) || {};
    return h('div', { class: 'fit-chips', role: 'list' }, ids.map((id) => {
      const v = fit[id] || {}, m = meta(id), ok = v.ok !== false;
      return h('span', { class: 'fit-chip ' + (ok ? 'tone-ok' : 'tone-warn'), role: 'listitem', title: m.verified === false ? t('lsn.asp.unverified') : (m.source_url || '') },
        icon(ok ? 'check' : 'warn'), h('span', null, tOr('lsn.asp.preset.' + id, id)),
        h('span', { class: 'muted' }, ok ? t('lsn.asp.fit.ok') : t('lsn.asp.fit.over', { s: v.max_s != null ? v.max_s + ' s' : '' })),
        m.verified === false ? h('span', { class: 'fit-q', 'aria-label': t('lsn.asp.unverified') }, '?') : null);
    }));
  },
};
// ===================== HẾT ADAPTER UI-0 =====================

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
    return { id: a.id, def: a, ok, reason: ok ? null : t('lsn.tutorial_blocked') };
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
  const size = (opt.def && opt.def.size) || sizeOfId(opt.id);
  const body = h('div', { class: 'form' },
    h('div', { class: 'order-sum' }, h('span', { class: 'mono' }, id), h('span', { class: 'muted' }, '→'), AspectUI.badge(opt.id), ch ? h('span', { class: 'muted small' }, t('lsn.channel') + ': ' + toText(ch.name || ch.display_id)) : null),
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
    AspectUI.badge(aspect), fromChannel ? h('span', { class: 'muted small' }, t('lsn.aspect_from_channel')) : null,
    ext && ext.channel ? h('span', { class: 'muted small' }, toText(ext.channel.name || ext.channel.display_id)) : null);
  const actions = h('div', { class: 'lsn-actions' });
  for (const o of otherAspects(cat, aspect, kind)) {
    const disabled = !o.ok || !isOwner;
    const b = h('button', { type: 'button', class: 'btn', disabled, 'aria-describedby': disabled ? 'lsn-why-' + o.def.token : null,
      onclick: () => makeOrderDialog({ lesson, ext, opt: o }) }, icon('plus'), t('lsn.make_other', { v: o.id }));
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
        AspectUI.load().catch(() => null)]);
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
    h('span', { class: 'micro' }, t('lsn.asp.label')),
    h('div', { class: 'brand-seg', role: 'radiogroup', 'aria-label': t('lsn.asp.label') }, chip('aspect', '', t('lsn.f.all')), chip('aspect', '16:9', '16:9'), chip('aspect', '9:16', '9:16')));
  buildGrid();
  container.append(pageHeader(t('nav.lessons'), t('lesson.desc'), [filters]), h('div', { class: 'work' }, gridHost, inspector));
  const off = onDebounced('change', () => { if (grid) grid.reload(); if (detail) detail.reload(); });
  return () => { off(); if (grid) grid.destroy(); if (detail) detail.destroy(); };
}
