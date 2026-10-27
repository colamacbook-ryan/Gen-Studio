// © 2026 Gen Labs — All rights reserved.
// Đăng nhập (POST /api/login) -> nạp lại /api/me để lấy CSRF.
import { h, clear } from '../components/dom.js';
import { t } from '../i18n.js';
import { post } from '../components/api.js';
import { errorBanner } from '../components/states.js';

export function mount(container, ctx) {
  const user = h('input', { type: 'text', class: 'input', id: 'lg-user', autocomplete: 'username', required: true });
  const pass = h('input', { type: 'password', class: 'input', id: 'lg-pass', autocomplete: 'current-password', required: true });
  const msg = h('div');
  const submit = h('button', { type: 'submit', class: 'btn primary' }, t('auth.login'));
  const form = h('form', { class: 'auth-form', onsubmit: async (e) => {
    e.preventDefault(); submit.disabled = true; clear(msg);
    try { await post('/api/login', { username: user.value.trim(), password: pass.value }); await ctx.refreshMe(); location.hash = '#/overview'; }
    catch (ex) { msg.append(errorBanner(ex)); submit.disabled = false; }
  } },
  h('h1', { class: 'display' }, t('auth.login_title')),
  h('label', { class: 'field', for: 'lg-user' }, h('span', { class: 'field-label' }, t('auth.username'))), user,
  h('label', { class: 'field', for: 'lg-pass' }, h('span', { class: 'field-label' }, t('auth.password'))), pass,
  msg, submit);
  container.append(h('div', { class: 'theater-page center' }, form));
  user.focus();
  return () => {};
}
