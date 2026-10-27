// © 2026 Gen Labs — All rights reserved.
// Hộp thoại modal đơn giản (Esc đóng, trả về hàm đóng).
import { h } from './dom.js';
import { t } from '../i18n.js';

export function openDialog(title, body, actions, onClose) {
  const prev = document.activeElement;
  const close = () => { document.removeEventListener('keydown', onKey, true); wrap.remove(); if (prev && prev.focus) prev.focus(); if (onClose) onClose(); };
  const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  const box = h('div', { class: 'dialog', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('div', { class: 'dialog-title' }, title),
    h('div', { class: 'dialog-body' }, body),
    h('div', { class: 'dialog-actions' }, actions ? actions(close) : h('button', { type: 'button', class: 'btn', onclick: close }, t('common.close'))));
  const wrap = h('div', { class: 'overlay', onmousedown: (e) => { if (e.target === wrap) close(); } }, box);
  document.body.appendChild(wrap);
  document.addEventListener('keydown', onKey, true);
  const first = box.querySelector('input,textarea,select,button');
  if (first) first.focus();
  return close;
}

// Form field: nhãn + input (label thật cho a11y)
export function field(label, input, hint) {
  return h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), input, hint ? h('span', { class: 'muted small' }, hint) : null);
}
