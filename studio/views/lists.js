// © 2026 Gen Labs — All rights reserved.
// Các màn lưới: Hàng chờ/Đã quyết, Lệnh sản xuất, Giáo trình, Asset, Nhật ký, Kênh, Agent & MCP, Nhà cung cấp, Pipeline.
import { h, icon, toast, confirmButton, copyText, clear } from '../components/dom.js';
import { t } from '../i18n.js';
import { post } from '../components/api.js';
import { openDialog, field } from '../components/dialog.js';
import { errorBanner } from '../components/states.js';
import { gridView, fieldList } from './grid-view.js';
import { buildHash, toText } from '../components/util.js';

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
  inspector: (row, ctx, reload) => h('div', null, fieldList(row),
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
export const agents = gridView({
  grid: 'agents', title: 'nav.agents', desc: 'agent.desc', empty: 'agent.empty',
  headerActions: (ctx, reload) => [btn(t('agent.new'), () => agentForm(reload), 'btn primary', 'plus')],
  inspector: (row, ctx, reload) => h('div', null, fieldList(row),
    confirmButton(t('agent.revoke'), t('common.confirm_again'), async () => {
      try { await post('/api/agents/' + encodeURIComponent(idOf(row)) + '/revoke', {}); toast(t('agent.revoked'), 'ok'); reload(); } catch (e) { toast(e.text_human || e.detail, 'danger'); }
    })),
});

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
  headerActions: (ctx, reload) => [btn(t('prov.new'), () => providerForm(() => { toast(t('common.saved'), 'ok'); reload(); }), 'btn primary', 'plus')],
  inspector: (row, ctx, reload) => h('div', null, fieldList(row),
    btn(t('prov.scan'), async (e) => {
      const b = e.currentTarget; b.disabled = true;
      try { await post('/api/providers/' + encodeURIComponent(idOf(row)) + '/scan', {}); toast(t('prov.scanned'), 'ok'); reload(); } catch (ex) { toast(ex.text_human || ex.detail, 'danger'); }
      b.disabled = false;
    })),
});
