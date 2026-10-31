// © 2026 Gen Labs — All rights reserved.
// Hộp "Đổi mật khẩu" (POST /api/me/password) — gọi từ nút trong hộp người dùng của sidebar (shell.js).
// Chưa đổi được display_name: /api/me chưa có PATCH (cố ý không mở rộng thêm, brief Gen 31/10/2026).
import { h, clear, toast } from './dom.js';
import { t } from '../i18n.js';
import { post } from './api.js';
import { openDialog, field } from './dialog.js';
import { errorBanner } from './states.js';

export function openChangePassword() {
  const cur = h('input', { type: 'password', class: 'input', autocomplete: 'current-password', required: true });
  const next = h('input', { type: 'password', class: 'input', autocomplete: 'new-password', required: true, minlength: 12 });
  const again = h('input', { type: 'password', class: 'input', autocomplete: 'new-password', required: true });
  const err = h('div');
  const body = h('div', { class: 'form' },
    field(t('account.current_password'), cur),
    field(t('account.new_password'), next, t('account.new_password_hint')),
    field(t('account.new_password_again'), again),
    err);
  openDialog(t('account.change_password'), body, (close) => [
    h('button', { type: 'button', class: 'btn', onclick: close }, t('common.cancel')),
    h('button', { type: 'button', class: 'btn primary', onclick: async (e) => {
      clear(err);
      if (next.value !== again.value) { err.append(errorBanner({ code: 'invalid', text_human: t('account.mismatch') })); return; }
      const b = e.currentTarget; b.disabled = true;
      try {
        await post('/api/me/password', { current_password: cur.value, new_password: next.value });
        toast(t('account.changed_ok'), 'ok'); close();
      } catch (ex) { err.append(errorBanner(ex)); b.disabled = false; }
    } }, t('common.save')),
  ]);
}
