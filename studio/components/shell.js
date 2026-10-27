// © 2026 Gen Labs — All rights reserved.
// Khung app Data Console: sidebar 216 · header 44 · content · dock chat rail (MVP: khung tĩnh).
import { h, icon, clear } from './dom.js';
import { t, tOr } from '../i18n.js';
import { get } from './api.js';
import { on, onDebounced } from './bus.js';
import { buildHash } from './util.js';
import { toText } from './util.js';

const NAV = [
  { group: 'nav.g.overview', items: [{ path: 'overview', icon: 'home', label: 'nav.overview' }] },
  { group: 'nav.g.review', items: [{ path: 'review', icon: 'stamp', label: 'nav.review', badge: 'review' }] },
  { group: 'nav.g.produce', items: [
    { path: 'curriculum', icon: 'book', label: 'nav.curriculum' },
    { path: 'work-orders', icon: 'list', label: 'nav.work_orders' },
    { path: 'lessons', icon: 'film', label: 'nav.lessons' },
    { path: 'pipeline', icon: 'flow', label: 'nav.pipeline' }] },
  { group: 'nav.g.library', items: [{ path: 'assets', icon: 'image', label: 'nav.assets' }] },
  { group: 'nav.g.connect', items: [
    { path: 'agents', icon: 'plug', label: 'nav.agents' },
    { path: 'providers', icon: 'key', label: 'nav.providers' }] },
  { group: 'nav.g.system', items: [
    { path: 'channels', icon: 'cog', label: 'nav.channels' },
    { path: 'audit', icon: 'log', label: 'nav.audit' }] },
];

export function pageHeader(title, desc, actions) {
  return h('div', { class: 'page-header' },
    h('div', { class: 'ph-text' }, h('h1', null, title), desc ? h('span', { class: 'muted' }, desc) : null),
    h('div', { class: 'ph-actions' }, actions || []));
}

export function buildShell(ctx) {
  const badges = {};
  const nav = h('nav', { class: 'sidebar', 'aria-label': t('nav.label') },
    h('div', { class: 'brand' }, h('span', { class: 'brand-mark', 'aria-hidden': 'true' }),
      h('div', null, h('div', { class: 'brand-name' }, t('brand.name')), h('div', { class: 'brand-sub muted' }, t('brand.sub')))),
    NAV.map((g) => h('div', { class: 'nav-group' },
      h('div', { class: 'micro' }, t(g.group)),
      g.items.map((it) => {
        const b = it.badge ? h('span', { class: 'nav-badge', hidden: true }) : null;
        if (b) badges[it.badge] = b;
        return h('a', { class: 'nav-item', href: buildHash(it.path), 'data-path': it.path }, icon(it.icon), h('span', null, t(it.label)), b);
      }))),
    h('div', { class: 'spacer' }),
    h('div', { class: 'user-box' },
      h('span', { class: 'avatar', 'aria-hidden': 'true' }, toText((ctx.me && ctx.me.user && (ctx.me.user.display_name || ctx.me.user.username)) || '?').slice(0, 1).toUpperCase()),
      h('div', null, h('div', null, toText(ctx.me && ctx.me.user && (ctx.me.user.display_name || ctx.me.user.username))),
        h('div', { class: 'muted small' }, tOr('role.' + toText(ctx.me && ctx.me.user && ctx.me.user.role), toText(ctx.me && ctx.me.user && ctx.me.user.role))))));

  const status = h('span', { class: 'conn ok' }, h('i', { class: 'dot' }), t('conn.ok'));
  const jump = h('input', {
    type: 'text', class: 'cmdk mono', placeholder: t('cmdk.ph'), 'aria-label': t('cmdk.label'),
    onkeydown: (e) => {
      e.stopPropagation();
      if (e.key !== 'Enter') return;
      const v = jump.value.trim().toUpperCase();
      let m;
      if ((m = /^LS-\d+$/.exec(v))) location.hash = buildHash('lessons', v);
      else if ((m = /^RD-\d+$/.exec(v))) location.hash = buildHash('review', v);
      else if (v) { location.hash = buildHash('lessons'); }
      jump.value = '';
    },
  });
  const logout = h('button', { type: 'button', class: 'btn', onclick: ctx.logout }, t('auth.logout'));
  const crumb = h('nav', { class: 'crumb', 'aria-label': t('nav.crumb') });
  const langBtn = h('button', { type: 'button', class: 'btn mono', title: t('lang.toggle'), 'aria-label': t('lang.toggle'), onclick: ctx.toggleLang }, ctx.lang().toUpperCase());
  const header = h('header', { class: 'app-header' }, crumb, jump, h('span', { class: 'spacer' }), status, langBtn, logout);
  const content = h('main', { class: 'content', id: 'content' });

  // Dock Ghim & Soi: MVP là rail tĩnh, mở ra thấy khung "sắp có", không gọi API.
  const dockPanel = h('div', { class: 'dock-panel', hidden: true }, h('div', { class: 'micro' }, t('dock.title')), h('p', { class: 'muted' }, t('dock.soon')));
  const dockBtn = h('button', {
    type: 'button', class: 'icon-btn', 'aria-label': t('dock.title'), title: t('dock.title'),
    onclick: () => { dockPanel.hidden = !dockPanel.hidden; dock.classList.toggle('open', !dockPanel.hidden); },
  }, icon('chat'));
  const dock = h('aside', { class: 'dock', 'aria-label': t('dock.title') }, dockBtn, dockPanel);

  const root = h('div', { class: 'app' }, nav, h('div', { class: 'main-col' }, header, content), dock);

  async function refreshBadges() {
    try {
      const res = await get('/api/grid/review_queue');
      const n = res && Array.isArray(res.rows) ? res.rows.length : 0;
      badges.review.textContent = String(n); badges.review.hidden = n === 0;
    } catch { badges.review.hidden = true; }
  }
  refreshBadges();
  const offs = [
    onDebounced('change', refreshBadges, 400),
    on('conn', (ok) => { status.className = 'conn ' + (ok ? 'ok' : 'warn'); clear(status); status.append(h('i', { class: 'dot' }), t(ok ? 'conn.ok' : 'conn.lost')); }),
  ];

  return {
    root, content,
    setActive(path, id) {
      for (const a of nav.querySelectorAll('.nav-item')) a.classList.toggle('active', a.dataset.path === path);
      clear(crumb);
      const item = NAV.flatMap((g) => g.items).find((i) => i.path === path);
      crumb.append(h('span', null, item ? t(item.label) : ''), id ? h('span', { class: 'muted' }, ' › ') : null, id ? h('span', { class: 'mono' }, id) : null);
    },
    destroy() { offs.forEach((f) => f()); },
  };
}
