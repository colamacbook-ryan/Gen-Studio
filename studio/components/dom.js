// © 2026 Gen Labs — All rights reserved.
// Tạo phần tử DOM an toàn (textContent, không innerHTML) + toast + hộp xác nhận.
import { toText } from './util.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

// h('div', {class:'x', onclick:fn, style:{…}}, child, 'text', [..])
export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'value') el.value = toText(v);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, toText(v));
    }
  }
  append(el, kids);
  return el;
}

export function append(el, kids) {
  for (const c of kids) {
    if (c == null || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else if (c instanceof Node) el.appendChild(c);
    else el.appendChild(document.createTextNode(toText(c)));
  }
  return el;
}

export function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }

// Icon inline SVG stroke 1.5 / 16px. Đường vẽ là hằng số của app (không phải dữ liệu người dùng).
const ICONS = {
  grid: 'M2 3h12v10H2zM2 7h12M6 3v10',
  home: 'M2 8l6-5 6 5M4 7v6h8V7',
  stamp: 'M3 13h10M5 10h6l-1-3V4a2 2 0 10-4 0v3z',
  film: 'M2 3h12v10H2zM5 3v10M11 3v10M2 6h3M2 10h3M11 6h3M11 10h3',
  book: 'M3 2h9v12H3zM3 11h9',
  list: 'M5 4h9M5 8h9M5 12h9M2 4h.5M2 8h.5M2 12h.5',
  flow: 'M2 4h4v3H2zM10 9h4v3h-4zM6 5.5h2.5V10.5H10',
  plug: 'M6 2v4M10 2v4M4 6h8v2a4 4 0 01-8 0zM8 12v2',
  key: 'M10 6a3 3 0 11-1 2.2L3 14v-2h2v-2h2l2-2',
  cog: 'M8 5.5a2.5 2.5 0 100 5 2.5 2.5 0 000-5zM8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2',
  log: 'M3 2h10v12H3zM6 5h4M6 8h4M6 11h2',
  image: 'M2 3h12v10H2zM2 11l4-4 3 3 2-2 3 3',
  filter: 'M2 3h12L9.5 8.5V13l-3-1.5V8.5z',
  sort: 'M5 3v10M5 13l-2-2M5 13l2-2M11 13V3M11 3l-2 2M11 3l2 2',
  download: 'M8 2v8M5 7l3 3 3-3M3 13h10',
  plus: 'M8 3v10M3 8h10',
  clock: 'M8 2a6 6 0 100 12A6 6 0 008 2zM8 4.5V8l2.5 1.5',
  check: 'M3 8.5l3.5 3.5L13 4.5',
  x: 'M4 4l8 8M12 4l-8 8',
  warn: 'M8 2l6.5 11.5h-13zM8 6.5v3M8 11.5v.5',
  chat: 'M2 3h12v8H7l-3 3v-3H2z',
  bell: 'M4 11V7a4 4 0 118 0v4l1 1H3zM6.5 14h3',
  play: 'M5 3l8 5-8 5z',
  pause: 'M5 3v10M11 3v10',
};

export function icon(name) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('width', '16'); svg.setAttribute('height', '16'); svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor'); svg.setAttribute('stroke-width', '1.5');
  svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true'); svg.classList.add('ico');
  const p = document.createElementNS(SVG_NS, 'path');
  p.setAttribute('d', ICONS[name] || ICONS.grid);
  svg.appendChild(p);
  return svg;
}

export function toast(text, tone = 'info') {
  let box = document.getElementById('toasts');
  if (!box) { box = h('div', { id: 'toasts', role: 'status', 'aria-live': 'polite' }); document.body.appendChild(box); }
  const el = h('div', { class: 'toast tone-' + tone }, toText(text));
  box.appendChild(el);
  setTimeout(() => el.remove(), 4500);
}

// Hộp xác nhận 2 bước: bấm lần 1 đổi nhãn, lần 2 mới chạy.
export function confirmButton(label, confirmLabel, onConfirm, cls = 'btn danger') {
  let armed = false; let timer = null;
  const b = h('button', { type: 'button', class: cls }, label);
  b.addEventListener('click', () => {
    if (!armed) {
      armed = true; b.textContent = confirmLabel; b.classList.add('armed');
      timer = setTimeout(() => { armed = false; b.textContent = label; b.classList.remove('armed'); }, 4000);
    } else { clearTimeout(timer); armed = false; b.textContent = label; b.classList.remove('armed'); onConfirm(); }
  });
  return b;
}

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch {
    const ta = h('textarea', { style: { position: 'fixed', opacity: '0' } }); ta.value = text;
    document.body.appendChild(ta); ta.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove(); return ok;
  }
}
