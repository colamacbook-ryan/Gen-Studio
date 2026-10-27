// © 2026 Gen Labs — All rights reserved.
// Điểm vào SPA: router hash, phiên (/api/me), SSE /api/events, khung app.
import { h, clear } from './components/dom.js';
import { setLang, getLang, t } from './i18n.js';
import { get, post, loadMe, setCsrf } from './components/api.js';
import { buildShell } from './components/shell.js';
import { emit } from './components/bus.js';
import { parseRoute } from './components/util.js';
import { errorBanner } from './components/states.js';

const appEl = document.getElementById('app');
const PUBLIC = new Set(['setup', 'login']);
let me = null;
let shell = null;
let cleanup = null;
let es = null;

const ctx = {
  get me() { return me; },
  route: parseRoute(location.hash),
  lang: getLang,
  setLang(l) { setLang(l); localStorage.setItem('gs_lang', l); document.documentElement.lang = l; },
  toggleLang() { ctx.setLang(getLang() === 'vi' ? 'en' : 'vi'); resetShell(); render(); },
  async refreshMe() { me = await loadMe(); connectSse(); return me; },
  async logout() {
    try { await post('/api/logout', {}); } catch { /* phiên có thể đã hết hạn */ }
    me = null; setCsrf(''); closeSse(); resetShell(); location.hash = '#/login'; render();
  },
};

function resetShell() { if (shell) { shell.destroy(); shell = null; } clear(appEl); }

function connectSse() {
  if (es || !me) return;
  es = new EventSource('/api/events');
  es.addEventListener('open', () => emit('conn', true));
  es.addEventListener('change', (e) => { let p = null; try { p = JSON.parse(e.data); } catch { p = null; } emit('change', p); });
  es.addEventListener('error', () => emit('conn', false));
}
function closeSse() { if (es) { es.close(); es = null; } }

async function loadView(route) {
  const lists = await import('./views/lists.js');
  switch (route.path) {
    case 'overview': return (await import('./views/overview.js')).mount;
    case 'review': return route.id ? (await import('./views/review-room.js')).mount : lists.reviewList;
    case 'lessons': return (await import('./views/lessons.js')).mount;
    case 'pipeline': return lists.pipeline;
    case 'work-orders': return lists.workOrders;
    case 'agents': return lists.agents;
    case 'providers': return lists.providers;
    case 'channels': return lists.channels;
    case 'curriculum': return lists.curriculum;
    case 'assets': return lists.assets;
    case 'audit': return lists.audit;
    case 'setup': return (await import('./views/setup.js')).mount;
    case 'login': return (await import('./views/login.js')).mount;
    default: return (await import('./views/overview.js')).mount;
  }
}

let seq = 0;
async function render() {
  const mySeq = ++seq;
  const route = parseRoute(location.hash);
  ctx.route = route;
  if (cleanup) { try { cleanup(); } catch (e) { console.error(e); } cleanup = null; }

  if (!me && !PUBLIC.has(route.path)) {
    let needsOwner = false;
    try { const st = await get('/api/setup/state'); needsOwner = !!(st && (st.needs_owner ?? (st.has_owner === false) ?? (st.owner_exists === false))); } catch { needsOwner = false; }
    if (mySeq !== seq) return;
    location.hash = needsOwner ? '#/setup' : '#/login';
    return;
  }
  const theater = (route.path === 'review' && route.id) || PUBLIC.has(route.path);
  let host;
  if (theater) { resetShell(); host = appEl; }
  else {
    if (!shell) { clear(appEl); shell = buildShell(ctx); appEl.append(shell.root); }
    shell.setActive(route.path, route.id);
    host = clear(shell.content);
  }
  document.title = 'Gen-Studio · ' + route.path;
  try {
    const mount = await loadView(route);
    if (mySeq !== seq) return;
    cleanup = mount(host, ctx) || null;
  } catch (e) {
    console.error(e);
    host.append(h('div', { class: 'pad' }, errorBanner({ code: 'view_error', text_human: t('err.generic'), detail: e && e.message }, () => render())));
  }
}

async function boot() {
  const saved = localStorage.getItem('gs_lang');
  if (saved) ctx.setLang(saved);
  try { me = await loadMe(); } catch (e) { clear(appEl); appEl.append(h('div', { class: 'pad' }, errorBanner(e, () => location.reload()))); return; }
  if (me && me.user && me.user.lang && !saved) ctx.setLang(me.user.lang);
  connectSse();
  window.addEventListener('hashchange', render);
  if (!location.hash) location.hash = '#/overview'; else render();
}
boot();
