// © 2026 Gen Labs — All rights reserved.
// Các màn lưới: Hàng chờ/Đã quyết, Lệnh sản xuất, Giáo trình, Asset, Nhật ký, Kênh, Agent & MCP, Nhà cung cấp, Pipeline.
import { h, icon, toast, confirmButton, copyText, clear, append } from '../components/dom.js';
import { t, tOr } from '../i18n.js';
import { post, get } from '../components/api.js';
import { openDialog, field } from '../components/dialog.js';
import { errorBanner, badge } from '../components/states.js';
import { gridView, fieldList } from './grid-view.js';
import { buildHash, toText } from '../components/util.js';
import { authCard, typeCodeNotice } from './authorize.js';
import { pageHeader } from '../components/shell.js';
import { onDebounced } from '../components/bus.js';
import { ensureOffline, offlineStatus, PULL_CMD } from './voice-offline.js';

const idOf = (row) => toText(row.display_id || row.id || Object.values(row)[0]);
const btn = (label, onclick, cls = 'btn', ic) => h('button', { type: 'button', class: cls, onclick }, ic ? icon(ic) : null, label);

// Hộp form chung: gọi POST, hiện lỗi trong hộp, thành công -> onDone(res)
function formDialog({ title, fields, submitLabel, path, build, onDone, resultView }) {
  const err = h('div');
  const inputs = fields.map((f) => f);
  const body = h('div', { class: 'form' }, inputs.map((f) => field(f.label, f.input, f.hint)), err);
  return openDialog(title, body, (close) => [
    btn(t('common.cancel'), close),
    btn(submitLabel, async (e) => {
      const b = e.currentTarget; b.disabled = true; clear(err);
      try {
        const res = await post(path, build());
        if (resultView) { clear(body); body.append(resultView(res)); b.remove(); } else close();
        if (onDone) onDone(res);
      } catch (ex) { err.append(errorBanner(ex)); b.disabled = false; }
    }, 'btn primary'),
  ]);
}

const input = (type = 'text', ph = '') => h('input', { type, class: 'input', placeholder: ph, autocomplete: 'off' });

// ---------- Duyệt ----------
function reviewTabs(active) {
  return h('div', { class: 'tabs', role: 'tablist' },
    h('a', { class: 'tab' + (active === 'queue' ? ' active' : ''), href: buildHash('review'), role: 'tab' }, t('review.queue')),
    h('a', { class: 'tab' + (active === 'decided' ? ' active' : ''), href: '#/review?view=decided', role: 'tab' }, t('review.decided')));
}
export const reviewList = (container, ctx) => {
  const decided = ctx.route.query.view === 'decided';
  return gridView({
    grid: decided ? 'reviews' : 'review_queue', title: 'nav.review', desc: decided ? 'review.decided_desc' : 'review.queue_desc',
    empty: decided ? 'review.decided_empty' : 'review.queue_empty',
    tabs: () => reviewTabs(decided ? 'decided' : 'queue'),
    onOpen: (row) => { const rd = toText(row.render || row.render_display_id || row.display_id || row.id); if (/^RD-/.test(rd)) location.hash = buildHash('review', rd); },
  })(container, ctx);
};

// ---------- Lệnh sản xuất ----------
export const workOrders = gridView({
  grid: 'work_orders', title: 'nav.work_orders', desc: 'wo.desc', empty: 'wo.empty',
  headerActions: (ctx, reload) => [btn(t('wo.new'), () => newWorkOrder(reload), 'btn primary', 'plus')],
  inspector: (row, ctx, reload, cols) => h('div', null, fieldList(row, cols),
    confirmButton(t('wo.cancel'), t('common.confirm_again'), async () => {
      try { await post('/api/work_orders/' + encodeURIComponent(idOf(row)) + '/cancel', {}); toast(t('wo.cancelled'), 'ok'); reload(); } catch (e) { toast(e.text_human || e.detail, 'danger'); }
    })),
});

function newWorkOrder(reload) {
  const note = input('text', t('wo.note_ph'));
  formDialog({
    title: t('wo.new'), fields: [{ label: t('wo.note'), input: note }], submitLabel: t('common.create'),
    path: '/api/work_orders', build: () => ({ kind: 'manual', summary: note.value.trim() }), onDone: () => { toast(t('common.saved'), 'ok'); reload(); },
  });
}

// ---------- Pipeline ----------
export const pipeline = gridView({
  grid: 'runs', title: 'nav.pipeline', desc: 'pipe.desc', empty: 'pipe.empty',
  headerActions: (ctx, reload) => [btn(t('wo.new'), () => newWorkOrder(reload), 'btn primary', 'plus')],
});

// ---------- Giáo trình ----------
export const curriculum = gridView({
  grid: 'curriculum', title: 'nav.curriculum', desc: 'cur.desc', empty: 'cur.empty',
  headerActions: (ctx, reload) => [btn(t('cur.new'), () => {
    const title = input('text'); const level = input('text');
    formDialog({
      title: t('cur.new'), fields: [{ label: t('cur.principle'), input: title }, { label: t('cur.level'), input: level }],
      submitLabel: t('common.create'), path: '/api/curriculum', build: () => ({ title: title.value.trim(), level: level.value.trim() || null }),
      onDone: () => { toast(t('common.saved'), 'ok'); reload(); },
    });
  }, 'btn primary', 'plus')],
});

// ---------- Asset / Nhật ký ----------
export const assets = gridView({ grid: 'assets', title: 'nav.assets', desc: 'assets.desc', empty: 'state.empty' });
export const audit = gridView({ grid: 'audit', title: 'nav.audit', desc: 'audit.desc', empty: 'state.empty' });

// ---------- Kênh ----------
export function channelForm(onDone) {
  const name = input('text'); const lang = input('text'); lang.value = 'vi';
  const termLang = input('text'); termLang.value = 'en';
  const schedule = input('text'); schedule.value = '06:00';
  return formDialog({
    title: t('ch.new'),
    fields: [{ label: t('ch.name'), input: name }, { label: t('ch.lang'), input: lang }, { label: t('ch.term_lang'), input: termLang },
      { label: t('ch.schedule'), input: schedule, hint: t('ch.schedule_hint') }],
    submitLabel: t('common.create'), path: '/api/channels',
    build: () => ({ name: name.value.trim(), lang: lang.value.trim(), term_lang: termLang.value.trim(), schedule: { time: schedule.value.trim(), per_run: 1 } }),
    onDone,
  });
}
export const channels = gridView({
  grid: 'channels', title: 'nav.channels', desc: 'ch.desc', empty: 'ch.empty',
  headerActions: (ctx, reload) => [btn(t('ch.new'), () => channelForm(() => { toast(t('common.saved'), 'ok'); reload(); }), 'btn primary', 'plus')],
});

// ---------- Agent & MCP ----------
export function tokenResult(res) {
  const token = toText(res && (res.token || (res.agent && res.agent.token)));
  const box = h('div', { class: 'token-once' },
    h('div', { class: 'banner warn' }, icon('warn'), h('span', null, t('agent.token_once'))),
    h('code', { class: 'mono token' }, token));
  box.append(btn(t('common.copy'), async (e) => { e.currentTarget.textContent = (await copyText(token)) ? t('common.copied') : t('common.copy_failed'); }, 'btn'));
  return box;
}
export function agentForm(onDone) {
  const name = input('text');
  const scopes = ['read', 'compose', 'run'].map((s) => ({ s, cb: h('input', { type: 'checkbox', checked: s !== 'run' }) }));
  const scopeBox = h('div', { class: 'checks' }, scopes.map(({ s, cb }) => h('label', { class: 'check' }, cb, h('span', { class: 'mono' }, s))));
  return formDialog({
    title: t('agent.new'), fields: [{ label: t('agent.name'), input: name }, { label: t('agent.scopes'), input: scopeBox, hint: t('agent.scopes_hint') }],
    submitLabel: t('agent.issue'), path: '/api/agents',
    build: () => ({ name: name.value.trim(), scopes: scopes.filter((x) => x.cb.checked).map((x) => x.s) }),
    resultView: tokenResult, onDone,
  });
}
// Thẻ kết nối: lệnh/URL + Sao chép (ConnectCard)
export function connectCard(cmd) {
  const b = btn(t('common.copy'), async (e) => { e.currentTarget.textContent = (await copyText(cmd)) ? t('common.copied') : t('common.copy_failed'); });
  return h('div', { class: 'connect-card' }, h('code', { class: 'mono token' }, cmd), b);
}
export const mcpUrl = () => location.origin + '/mcp';
export const claudeCmd = () => 'claude mcp add --transport http gen-studio ' + mcpUrl();

function connectDialog() {
  const sec = (title, hint, cmd) => h('section', { class: 'connect-sec' }, h('h3', null, title), h('p', { class: 'muted' }, hint), cmd ? connectCard(cmd) : null);
  openDialog(t('connect.title'), h('div', { class: 'form' },
    sec(t('connect.claude_code'), t('connect.claude_code_hint'), claudeCmd()),
    sec(t('connect.cloud'), t('connect.cloud_hint', { url: 'https://…/mcp' })),
    sec(t('connect.internal'), t('connect.internal_hint'))));
}

// Thẻ K0: trạng thái runner + Bật/Tắt agent nội bộ (Bật khi chưa ghép/đã thu hồi, Tắt khi đang ghép). Runner báo trạng thái qua /oauth/pairing-status (không có SSE) nên hỏi lại mỗi 5 s.
function runnerCard() {
  const box = h('div', { class: 'runner-card' });
  let alive = true, timer = null;
  async function load() {
    try {
      const [rs, ag] = await Promise.all([get('/api/runner-status'), get('/api/grid/agents')]);
      if (!alive) return;
      const internal = (ag.rows || []).find((a) => a.kind === 'internal' && a.status !== 'revoked');
      const r = rs.runner;
      const state = r && r.online ? tOr('runner.state.' + r.state, r.state) + (r.code ? ' · ' + tOr('runner.code.' + r.code, r.code) : '') : t('runner.offline');
      clear(box);
      append(box, [h('div', { class: 'rc-head' }, h('strong', null, t('k0.title')), badge(internal ? t('k0.on', { id: toText(internal.display_id) }) : t('k0.off'), internal ? 'ok' : 'idle')),
        h('div', { class: 'muted small' }, state),
        rs.pairing && rs.pairing.open && !internal ? h('div', { class: 'muted small' }, t('runner.window', { at: new Date(rs.pairing.open_until).toLocaleTimeString() }), ' ', h('a', { href: '#/agents?view=pending' }, t('k0.pending_link'))) : null,
        internal
          ? h('div', { class: 'row' }, confirmButton(t('agent.disable_internal'), t('common.confirm_again'), async () => { try { await post('/api/agents/' + encodeURIComponent(internal.display_id) + '/revoke', {}); toast(t('agent.revoked'), 'ok'); load(); } catch (e) { toast(e.text_human || e.detail, 'danger'); } }))
          : btn(t('setup.agent.enable'), async () => { try { await post('/api/pairing/open', { channel: 'internal' }); load(); } catch (e) { toast(e.text_human || e.detail, 'danger'); } }, 'btn primary')]);
    } catch (e) { if (alive) { clear(box); box.append(errorBanner(e, load)); } }
    if (alive) timer = setTimeout(load, 5000);
  }
  load();
  const off = onDebounced('change', () => { clearTimeout(timer); load(); }, 300);
  return { el: box, stop: () => { alive = false; clearTimeout(timer); off(); } };
}

// 3 tab: Agent · Chờ duyệt (badge số lượng) · Nâng cao
function agentTabs(active) {
  const n = h('span', { class: 'nav-badge', hidden: true });
  const refresh = async () => { try { const r = await get('/api/auth-requests'); const c = (r.requests || []).length; n.textContent = String(c); n.hidden = c === 0; } catch { n.hidden = true; } };
  refresh();
  const off = onDebounced('change', refresh, 300);
  const tab = (id, href, label, extra) => h('a', { class: 'tab' + (active === id ? ' active' : ''), href, role: 'tab' }, label, extra || null);
  const el = h('div', { class: 'tabs', role: 'tablist' }, tab('agents', buildHash('agents'), t('agent.tab.agents')),
    tab('pending', '#/agents?view=pending', t('agent.tab.pending'), n), tab('advanced', '#/agents?view=advanced', t('agent.tab.advanced')));
  return { el, off };
}
const agentGrid = gridView({
  grid: 'agents', title: 'nav.agents', desc: 'agent.desc', empty: 'agent.empty',
  headerActions: () => [btn(t('agent.connect'), connectDialog, 'btn', 'plug')],
  inspector: (row, ctx, reload, cols) => h('div', null, fieldList(row, cols),
    row.status === 'revoked' ? null : confirmButton(row.kind === 'internal' ? t('agent.disable_internal') : t('agent.revoke'), t('common.confirm_again'), async () => {
      try { await post('/api/agents/' + encodeURIComponent(idOf(row)) + '/revoke', {}); toast(t('agent.revoked'), 'ok'); reload(); } catch (e) { toast(e.text_human || e.detail, 'danger'); }
    })),
});
const pendingGrid = gridView({
  grid: 'auth_requests', title: 'nav.agents', desc: 'pending.desc', empty: 'pending.empty',
  // chủ xưởng luôn dọn được một đợt flood: từ chối mọi yêu cầu chờ không thuộc kênh nội bộ
  headerActions: (ctx, reload) => [confirmButton(t('pending.deny_all'), t('common.confirm_again'), async () => {
    try { const r = await post('/api/auth-requests/deny-all', {}); toast(t('pending.denied_n', { n: r.denied }), 'ok'); reload(); } catch (e) { toast(e.text_human || e.detail, 'danger'); }
  })],
  inspector: (row, ctx, reload) => {
    const box = h('div');
    get('/api/auth-requests/' + encodeURIComponent(idOf(row))).then(({ request }) => { box.append(request.needs_code ? typeCodeNotice() : authCard(request, { onDone: () => setTimeout(reload, 300) })); }, (e) => box.append(errorBanner(e)));
    return box;
  },
});
function advancedView(container, ctx, tabs) {
  container.append(pageHeader(t('nav.agents'), t('adv.desc')), tabs,
    h('div', { class: 'pad adv' },
      h('section', { class: 'connect-sec' }, h('h3', null, t('adv.manual_title')), h('p', { class: 'muted' }, t('adv.manual_hint')), btn(t('agent.new'), () => agentForm(() => {}), 'btn', 'plus')),
      h('section', { class: 'connect-sec' }, h('h3', null, t('adv.pair_title')), h('p', { class: 'muted' }, t('adv.pair_hint')),
        btn(t('adv.pair_btn'), async () => { try { await post('/api/pairing/open', { channel: 'loopback' }); toast(t('adv.pair_opened'), 'ok'); location.hash = '#/pair'; } catch (e) { toast(e.text_human || e.detail, 'danger'); } }, 'btn')),
      h('section', { class: 'connect-sec' }, h('h3', null, t('adv.token_cli')), connectCard('genstudio token create "Tên agent" --scopes read,compose')),
      h('section', { class: 'connect-sec' }, h('h3', null, t('adv.stdio_title')), h('p', { class: 'muted' }, t('adv.stdio_hint')), connectCard('claude mcp add gen-studio -- genstudio mcp --token <token>'))));
}
// tab Agent / Chờ duyệt dùng lưới chung: chèn dải tab qua cfg.tabs của gridView (gridView tự gọi cfg.tabs(ctx))
export const agents = (container, ctx) => {
  const view = ctx.route.query.view;
  const tabs = agentTabs(view === 'pending' ? 'pending' : view === 'advanced' ? 'advanced' : 'agents');
  let off, card = null;
  if (view === 'advanced') { advancedView(container, ctx, tabs.el); off = null; }
  else if (view === 'pending') off = pendingGrid(container, ctx, tabs.el);
  else { card = runnerCard(); off = agentGrid(container, ctx, h('div', null, tabs.el, card.el)); }   // thẻ K0 nằm trên cùng tab Agent
  return () => { tabs.off(); if (card) card.stop(); if (off) off(); };
};

// ---------- Nhà cung cấp ----------
export function providerForm(onDone, resultView) {
  const key = input('password'); key.autocomplete = 'new-password';
  const model = input('text', t('prov.model_ph'));
  return formDialog({
    title: t('prov.new'), fields: [{ label: t('prov.key'), input: key, hint: t('prov.key_hint') }, { label: t('prov.model'), input: model }],
    submitLabel: t('common.save'), path: '/api/providers',
    build: () => { const b = { vendor: 'gemini', kind: 'tts', key: key.value.trim() }; if (model.value.trim()) b.model = model.value.trim(); return b; },
    onDone, resultView,
  });
}
export const providers = gridView({
  grid: 'providers', title: 'nav.providers', desc: 'prov.desc', empty: 'prov.empty',
  headerActions: (ctx, reload) => [btn(t('prov.new'), () => providerForm(() => { toast(t('common.saved'), 'ok'); reload(); }), 'btn primary', 'plus'),
    // giọng offline (gói L): tạo hàng giọng + giám khảo vendor offline (không khoá) nếu chưa có
    btn(t('voff.enable'), async (e) => { const b = e.currentTarget; b.disabled = true; try { await ensureOffline(); toast(t('common.saved'), 'ok'); reload(); } catch (ex) { toast(ex.text_human || ex.detail, 'danger'); } b.disabled = false; }, 'btn')],
  inspector: (row, ctx, reload, cols) => {
    const scanBox = h('div');
    // offline: trạng thái sidecar từ lần quét gần nhất; chưa sẵn sàng ⇒ lệnh cần chạy trên máy chủ
    if (row.vendor === 'offline' && row.service_state) { const st = offlineStatus({ service: { state: row.service_state } }); if (st) scanBox.append(st); }
    // bật/tắt hàng (vd có cả Gemini lẫn offline: pipeline dùng hàng ĐANG BẬT có ID nhỏ nhất cho từng việc)
    const on = row.enabled === true || row.enabled === 1;
    const toggle = btn(t(on ? 'voff.disable_row' : 'voff.enable_row'), async (e) => {
      const b = e.currentTarget; b.disabled = true;
      try { await post('/api/providers', { provider: idOf(row), enabled: on ? 0 : 1 }); toast(t('common.saved'), 'ok'); reload(); } catch (ex) { toast(ex.text_human || ex.detail, 'danger'); }
      b.disabled = false;
    });
    return h('div', null, fieldList(row, cols), scanBox, toggle,
      btn(t('prov.scan'), async (e) => {
        const b = e.currentTarget; b.disabled = true;
        try { await post('/api/providers/' + encodeURIComponent(idOf(row)) + '/scan', {}); toast(t('prov.scanned'), 'ok'); reload(); }
        catch (ex) { clear(scanBox); scanBox.append(errorBanner(ex)); if (row.vendor === 'offline') scanBox.append(connectCard(PULL_CMD)); }
        b.disabled = false;
      }));
  },
});
