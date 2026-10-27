// © 2026 Gen Labs — All rights reserved.
// Cấp phép (#/authorize?req=) và Ghép thiết bị (#/pair): AuthRequestCard dùng chung cho trang này, tab Chờ duyệt và bước Agent ở thiết lập.
// Duyệt/Từ chối chỉ chạy được bằng phiên đăng nhập của chủ xưởng (server từ chối token agent). Duyệt gọi fetch (JSON) rồi JS chuyển hướng — không POST form (CSP form-action).
import { h, clear, icon } from '../components/dom.js';
import { t } from '../i18n.js';
import { get, post } from '../components/api.js';
import { errorBanner, emptyState } from '../components/states.js';
import { onDebounced } from '../components/bus.js';
import { toText } from '../components/util.js';
import { fmtDateTime } from '../components/datagrid.js';

const SCOPES = ['read', 'compose', 'run'];

// rq: dạng từ GET /api/auth-requests. opts.onDone(res, 'approve'|'deny'); opts.redirect=true → đi theo redirect của OAuth; opts.userCode = mã chủ xưởng đã TỰ GÕ (thiết bị ngoài)
export function authCard(rq, opts = {}) {
  const asked = (rq.scopes_requested || []).filter((s) => SCOPES.includes(s));
  const boxes = asked.map((s) => ({ s, cb: h('input', { type: 'checkbox', checked: true }) }));
  const msg = h('div');
  const row = (k, v, mono) => (v ? h('div', { class: 'consent-row' }, h('span', { class: 'micro' }, k), h('span', { class: mono ? 'mono' : null }, toText(v))) : null);
  // redirect không phải loopback (kể cả claude.ai): luôn hỏi "bạn vừa tự bấm kết nối?" và bắt tick xác nhận
  const confirmCb = rq.needs_confirm ? h('input', { type: 'checkbox' }) : null;
  const approve = h('button', { type: 'button', class: 'btn primary', onclick: () => decide('approve') }, t('auth.approve'));
  const deny = h('button', { type: 'button', class: 'btn', onclick: () => decide('deny') }, t('auth.deny'));
  const done = (text) => { clear(card); card.append(h('div', { class: 'consent-done' }, icon('check'), h('span', null, text))); };

  async function decide(kind) {
    const scopes = boxes.filter((b) => b.cb.checked).map((b) => b.s);
    clear(msg);
    if (kind === 'approve') {
      if (!scopes.length) { msg.append(errorBanner({ code: 'invalid', text_human: t('auth.pick_scope') })); return; }
      if (confirmCb && !confirmCb.checked) { msg.append(errorBanner({ code: 'invalid', text_human: t('auth.confirm_check') })); return; }
    }
    approve.disabled = deny.disabled = true;
    try {
      const body = kind === 'approve' ? { scopes, confirm: !!(confirmCb && confirmCb.checked), user_code: opts.userCode || undefined } : {};
      const res = await post('/api/auth-requests/' + encodeURIComponent(rq.id) + '/' + kind, body);
      if (opts.onDone) opts.onDone(res, kind);
      done(kind === 'approve' ? t('auth.approved', { id: res.agent ? res.agent.display_id : '' }) : t('auth.denied'));
      if (opts.redirect && res.redirect) { card.append(h('p', { class: 'muted' }, t('auth.redirecting'))); setTimeout(() => { location.assign(res.redirect); }, 700); }
    } catch (ex) { msg.append(errorBanner(ex)); approve.disabled = deny.disabled = false; }
  }

  const card = h('div', { class: 'consent' },
    h('div', { class: 'consent-head' }, h('strong', null, toText(rq.client_name)), h('span', { class: 'badge tone-info' }, t('auth.kind.' + rq.kind))),
    h('p', { class: 'muted small' }, rq.agent_kind === 'internal' ? '' : t('auth.self_declared')),
    rq.needs_confirm ? h('div', { class: 'banner warn', role: 'alert' }, icon('warn'), h('span', null, t('auth.confirm_recent', { host: toText(rq.redirect_host), at: fmtDateTime(rq.registered_at || rq.created_at) }))) : null,
    row(t('auth.source'), t('auth.channel.' + rq.channel)), row(t('auth.redirect'), rq.redirect_host, true), row(t('auth.registered'), rq.registered_at ? fmtDateTime(rq.registered_at) : ''),
    row(t('auth.asked_at'), fmtDateTime(rq.created_at)), row(t('auth.expires'), fmtDateTime(rq.expires_at)),
    h('div', { class: 'consent-scopes' }, h('span', { class: 'micro' }, t('auth.scopes')),
      boxes.map(({ s, cb }) => h('label', { class: 'check' }, cb, h('span', null, t('auth.scope.' + s)))),
      h('span', { class: 'muted small' }, t('auth.lower_only'))),
    confirmCb ? h('label', { class: 'check' }, confirmCb, h('span', null, t('auth.confirm_check'))) : null,
    h('p', { class: 'muted small' }, t('auth.never')),
    msg, h('div', { class: 'row' }, approve, deny));
  return card;
}

// Trạng thái đã quyết/hết hạn của một yêu cầu (không cho bấm lại)
function settled(rq) {
  const text = rq.status === 'denied' ? t('auth.denied') : rq.status === 'expired' ? t('auth.expired') : t('auth.handled', { status: rq.status });
  return h('div', { class: 'consent' }, h('div', { class: 'consent-done' }, icon(rq.status === 'approved' ? 'check' : 'warn'), h('span', null, text)),
    h('a', { class: 'btn', href: '#/agents' }, t('auth.back_agents')));
}
// Thiết bị ngoài: không hiện thẻ có nút Duyệt; chủ xưởng phải sang Ghép thiết bị và tự gõ mã
export const typeCodeNotice = () => h('div', { class: 'consent' }, h('p', null, t('auth.type_code_first')), h('a', { class: 'btn primary', href: '#/pair' }, t('auth.open_pair')));

// #/authorize?req=<id> — toàn màn, như trang thiết lập
export function mount(container, ctx) {
  const id = ctx.route.query.req || '';
  const panel = h('div', { class: 'step-panel' });
  container.append(h('div', { class: 'theater-page center' }, h('div', { class: 'setup-main' }, h('h1', { class: 'display' }, t('auth.title')), panel)));
  (async () => {
    if (!id) { panel.append(errorBanner({ code: 'invalid', text_human: t('auth.missing') })); return; }
    try {
      const { request } = await get('/api/auth-requests/' + encodeURIComponent(id));
      panel.append(request.status !== 'pending' ? settled(request) : request.needs_code ? typeCodeNotice() : authCard(request, { redirect: true }));
    } catch (e) { panel.append(errorBanner(e)); }
  })();
  return () => {};
}

// #/pair — chủ xưởng TỰ GÕ mã ghép của thiết bị ngoài (không liệt kê, không điền sẵn từ liên kết)
export function pairMount(container) {
  const result = h('div', { class: 'consent-list' });
  const input = h('input', { type: 'text', class: 'input mono', placeholder: t('auth.code_ph'), autocomplete: 'off', maxlength: '9', 'aria-label': t('auth.need_code') });
  const find = async () => {
    clear(result);
    const code = input.value.trim().toUpperCase();
    if (!code) return;
    try {
      const { request } = await post('/api/auth-requests/lookup', { user_code: code });
      result.append(authCard(request, { userCode: code }));
    } catch (e) { result.append(e && e.status === 404 ? emptyState(t('pair.not_found')) : errorBanner(e)); }
  };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') find(); });
  container.append(h('div', { class: 'theater-page center' }, h('div', { class: 'setup-main' }, h('h1', { class: 'display' }, t('pair.title')),
    h('p', { class: 'muted' }, t('pair.hint')), h('p', { class: 'muted small' }, t('pair.type_hint')),
    h('label', { class: 'field' }, h('span', { class: 'field-label' }, t('auth.need_code')), input), h('button', { type: 'button', class: 'btn primary', onclick: find }, t('auth.find')), result)));
  input.focus();
  return () => {};
}
