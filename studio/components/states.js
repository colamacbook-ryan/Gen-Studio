// © 2026 Gen Labs — All rights reserved.
// Trạng thái trống / đang tải / lỗi dùng chung cho mọi màn.
import { h, icon } from './dom.js';
import { t } from '../i18n.js';
import { normalizeError } from './util.js';

export function skeleton(rows = 6) {
  const box = h('div', { class: 'skeleton', 'aria-busy': 'true', 'aria-label': t('state.loading') });
  for (let i = 0; i < rows; i++) box.appendChild(h('div', { class: 'sk-row', style: { width: (60 + ((i * 17) % 40)) + '%' } }));
  return box;
}

export function emptyState(text, cta) {
  return h('div', { class: 'empty' }, h('p', null, text), cta || null);
}

// Banner lỗi: câu thân thiện + Chi tiết kỹ thuật (thu gọn) + Thử lại.
export function errorBanner(err, onRetry) {
  const e = normalizeError(err);
  const human = e.text_human || (e.status === 401 ? t('err.unauth') : t('err.generic'));
  const detail = [e.code, e.status ? 'HTTP ' + e.status : '', e.detail].filter(Boolean).join(' · ');
  return h('div', { class: 'banner danger', role: 'alert' },
    h('div', { class: 'banner-main' }, icon('warn'), h('span', null, human),
      onRetry ? h('button', { type: 'button', class: 'btn', onclick: onRetry }, t('state.retry')) : null),
    detail ? h('details', { class: 'detail' }, h('summary', null, t('err.detail')), h('pre', { class: 'mono' }, detail)) : null);
}

export function badge(text, tone) {
  const ic = tone === 'ok' ? 'check' : tone === 'danger' ? 'x' : tone === 'warn' ? 'warn' : tone === 'info' ? 'clock' : null;
  return h('span', { class: 'badge tone-' + (tone || 'idle') }, ic ? icon(ic) : h('i', { class: 'dot' }), text);
}
