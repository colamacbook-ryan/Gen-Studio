// © 2026 Gen Labs — All rights reserved.
// A6 Cài đặt kho + Tài khoản (gói D, 0.3.0): đồng bộ danh mục 457 ô (kit.sync) · đổi mật khẩu đã có ở nút chìa khoá
// trên sidebar (studio/components/account.js, gói D.0) — không có API đổi tên hiển thị nên không thêm mục đó (ẩn, theo brief).
import { h, toast } from '../components/dom.js';
import { t } from '../i18n.js';
import { post } from '../components/api.js';
import { pageHeader } from '../components/shell.js';
import { errorBanner } from '../components/states.js';
import { openChangePassword } from '../components/account.js';

export function mount(container) {
  const err = h('div');
  const syncBtn = h('button', {
    type: 'button', class: 'btn primary', onclick: async (e) => {
      const b = e.currentTarget; b.disabled = true; err.textContent = '';
      try { const r = await post('/api/kit/sync', {}); toast(t('kset.sync_ok', r.result || r), 'ok'); } catch (ex) { err.replaceChildren(errorBanner(ex)); }
      b.disabled = false;
    },
  }, t('kset.sync'));
  container.append(pageHeader(t('kset.title'), t('kset.desc')),
    h('div', { class: 'pad form' },
      h('section', { class: 'connect-sec' }, h('h3', null, t('kset.sync')), h('p', { class: 'muted' }, t('kset.sync_hint')), syncBtn, err),
      h('section', { class: 'connect-sec' }, h('h3', null, t('kset.account')), h('p', { class: 'muted' }, t('kset.account_hint')),
        h('button', { type: 'button', class: 'btn', onclick: () => openChangePassword() }, t('account.change_password')))));
}
