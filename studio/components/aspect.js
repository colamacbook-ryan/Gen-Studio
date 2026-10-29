// © 2026 Gen Labs — All rights reserved.
// UI-0 (SPEC-0.2.0-F7 §10.5) — thành phần tỉ lệ khung dùng chung cho mọi gói UI.
// Dữ liệu duy nhất: GET /api/aspects (= render/aspects.js catalog(), fixture test/fixtures/api-aspects.json). Không hardcode danh sách tỉ lệ/preset ở đây.
// Phần thuần (không DOM, test được trong Node): ratioOf, aspectToken, aspectLabel, enabledAspects, aspectDef, presetsFor, fmtSeconds, pickerModel, mixModel.
// Phần DOM: aspectPicker, aspectBadge, aspectGlyph, aspectFrame, aspectThumb, presetList, safeOverlay, fitChips.
import { h, append } from './dom.js';
import { t, has } from '../i18n.js';
import { get } from './api.js';
import { toText } from './util.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

// ---------------- thuần ----------------

// '9:16' → [9, 16]; giá trị lạ ⇒ null
export function ratioOf(id) {
  const m = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/.exec(String(id == null ? '' : id).trim());
  if (!m) return null;
  const w = Number(m[1]), hh = Number(m[2]);
  return w > 0 && hh > 0 ? [w, hh] : null;
}
// '9:16' → '9x16' (khoá i18n, tên tệp) — cùng luật `token` của aspects.json
export const aspectToken = (id) => String(id == null ? '' : id).replace(':', 'x');
// "9 / 16" cho CSS aspect-ratio; giá trị lạ ⇒ 16 / 9 (khung cũ)
export function aspectRatioCss(id) { const r = ratioOf(id) || [16, 9]; return r[0] + ' / ' + r[1]; }
// nhãn dài ("9:16 · Clip ngắn"); tỉ lệ chưa có chữ (vd 1:1 thêm sau bằng dữ liệu) ⇒ chính mã tỉ lệ
export function aspectLabel(id) { const k = 'aspect.' + aspectToken(id); return has(k) ? t(k) : toText(id); }
export const isVertical = (id) => { const r = ratioOf(id); return !!r && r[1] > r[0]; };

// catalog có thể là {default, aspects:[…], presets:[…]} hoặc chính mảng aspects
const listOf = (catalog) => (Array.isArray(catalog) ? catalog : catalog && Array.isArray(catalog.aspects) ? catalog.aspects : []);
export function enabledAspects(catalog) { return listOf(catalog).filter((a) => a && a.enabled !== false && typeof a.id === 'string'); }
export function aspectDef(catalog, id) { return listOf(catalog).find((a) => a && a.id === id) || null; }
export function defaultAspect(catalog) {
  const en = enabledAspects(catalog);
  const d = catalog && !Array.isArray(catalog) && catalog.default;
  return (en.find((a) => a.id === d) || en.find((a) => a.default) || en[0] || { id: '16:9' }).id;
}
// preset của một tỉ lệ, theo thứ tự khai trong aspect.presets (nguồn: catalog.presets)
export function presetsFor(catalog, id) {
  const all = catalog && Array.isArray(catalog.presets) ? catalog.presets : [];
  const def = aspectDef(catalog, id);
  const order = def && Array.isArray(def.presets) ? def.presets : all.filter((p) => p.aspect === id).map((p) => p.id);
  return order.map((pid) => all.find((p) => p.id === pid) || { id: pid, aspect: id, max_s: null, verified: null });
}
export const presetLabel = (id) => (has('aspect.preset.' + id) ? t('aspect.preset.' + id) : toText(id));
// 180 → "3:00"; 1800 → "30:00"
export function fmtSeconds(s) {
  const v = Math.max(0, Math.round(Number(s) || 0));
  return Math.floor(v / 60) + ':' + String(v % 60).padStart(2, '0');
}
// "16:9" có hỗ trợ loại bài `kind` không (thiếu kinds ⇒ có)
export function supportsKind(def, kind) { return !kind || !def || !Array.isArray(def.kinds) || def.kinds.includes(kind); }

// Mô hình bộ chọn: {static, options:[{value, aspect, label, inherit?, disabled, reason}], value}
//  - value '' = "Theo kênh" (inherit); giá trị thật = mã tỉ lệ
//  - chỉ ≤ 1 tỉ lệ bật ⇒ static (nhãn tĩnh, không control — §10.5 trạng thái)
//  - kind không có trong kinds của tỉ lệ ⇒ lựa chọn tắt + lý do (tutorial ⇒ aspect.tutorial_blocked)
export function pickerModel({ aspects, value, inherit, kind } = {}) {
  const list = enabledAspects(aspects);
  const reasonFor = (id) => (kind === 'tutorial' ? t('aspect.tutorial_blocked') : t('aspect.label') + ': ' + toText(id) + ' ≠ ' + toText(kind));
  const options = [];
  if (inherit && inherit.value) {
    const d = aspectDef(aspects, inherit.value);
    const ok = supportsKind(d, kind);
    options.push({ value: '', aspect: inherit.value, inherit: true, label: inherit.label || t('aspect.inherit', { v: inherit.value }), disabled: !ok, reason: ok ? null : reasonFor(inherit.value) });
  }
  for (const a of list) {
    const ok = supportsKind(a, kind);
    options.push({ value: a.id, aspect: a.id, label: aspectLabel(a.id), disabled: !ok, reason: ok ? null : reasonFor(a.id) });
  }
  let v = value == null ? (inherit && inherit.value ? '' : defaultAspect(aspects)) : String(value);
  const cur = options.find((o) => o.value === v);
  if (!cur || cur.disabled) { const first = options.find((o) => !o.disabled); v = first ? first.value : v; }
  return { static: list.length <= 1, options, value: v };
}

// Lịch trộn (schedule.mix) ⇄ số bài mỗi tỉ lệ. counts = {aspect: n}. Trả {mix:[{aspect,n}] (bỏ n=0), sum, ok, per_run}
export function mixModel(counts, perRun, order) {
  const ids = order && order.length ? order : Object.keys(counts || {});
  const mix = [];
  let sum = 0;
  for (const id of ids) {
    const n = Math.max(0, Math.floor(Number(counts && counts[id]) || 0));
    if (n > 0) { mix.push({ aspect: id, n }); sum += n; }
  }
  const per = Math.floor(Number(perRun) || 0);
  return { mix, sum, per_run: per, ok: per >= 1 && per <= 20 && sum === per };
}

// ---------------- dữ liệu ----------------
let cache = null;
// GET /api/aspects, nhớ trong phiên (dữ liệu chỉ đổi khi sửa render/aspects.json + khởi động lại). Lỗi ⇒ không nhớ, lần sau gọi lại.
export function loadAspects({ force } = {}) {
  if (force || !cache) {
    cache = get('/api/aspects').then((r) => r || { aspects: [], presets: [] });
    cache.catch(() => { cache = null; });
  }
  return cache;
}
export function _resetAspectsCache() { cache = null; }

// ---------------- DOM ----------------

// Hình chữ nhật đúng tỉ lệ, cạnh dài `size` px (mặc định 14) — "chữ ký" của tỉ lệ, dùng trong badge, bộ chọn, ảnh nhỏ.
export function aspectGlyph(id, size = 14) {
  const r = ratioOf(id) || [16, 9];
  const k = size / Math.max(r[0], r[1]);
  const w = Math.max(4, Math.round(r[0] * k)), hh = Math.max(4, Math.round(r[1] * k));
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('width', String(size)); svg.setAttribute('height', String(size)); svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
  svg.setAttribute('aria-hidden', 'true'); svg.classList.add('ar-glyph');
  const rect = document.createElementNS(SVG_NS, 'rect');
  rect.setAttribute('x', String((size - w) / 2 + 0.75)); rect.setAttribute('y', String((size - hh) / 2 + 0.75));
  rect.setAttribute('width', String(w - 1.5)); rect.setAttribute('height', String(hh - 1.5)); rect.setAttribute('rx', '1.5');
  svg.appendChild(rect);
  return svg;
}

// Badge tỉ lệ: [▭ 9:16] — mono, dọc có sắc riêng để nhận ra trong lưới/danh sách
export function aspectBadge(id) {
  const v = toText(id) || '16:9';
  return h('span', { class: 'ar-badge' + (isVertical(v) ? ' vertical' : ''), title: aspectLabel(v), 'aria-label': t('aspect.label') + ': ' + aspectLabel(v) },
    aspectGlyph(v, 12), h('span', { class: 'mono' }, v));
}

// Khung xem trước theo tỉ lệ (nội dung tuỳ ý). opts.long = cạnh dài px (mặc định 100% chiều rộng), opts.label = aria-label
export function aspectFrame(id, child, opts = {}) {
  const r = ratioOf(id) || [16, 9];
  const style = { aspectRatio: aspectRatioCss(id) };
  if (opts.long) { if (r[0] >= r[1]) style.width = opts.long + 'px'; else style.height = opts.long + 'px'; }
  const el = h('div', { class: 'ar-frame' + (isVertical(id) ? ' vertical' : ''), style, 'aria-label': opts.label || null, 'data-aspect': toText(id) });
  return append(el, [child]);
}

// Ảnh nhỏ đúng tỉ lệ trong ô vuông `long`×`long` (D0: 64 ⇒ 64×36 / 36×64). src rỗng ⇒ ô giữ chỗ có glyph (không gọi mạng).
export function aspectThumb(id, src, opts = {}) {
  const long = opts.long || 64;
  const r = ratioOf(id) || [16, 9];
  const w = r[0] >= r[1] ? long : Math.round(long * r[0] / r[1]);
  const hh = r[0] >= r[1] ? Math.round(long * r[1] / r[0]) : long;
  const inner = src
    ? h('img', { src, alt: opts.alt || '', width: w, height: hh, loading: 'lazy', decoding: 'async' })
    : h('span', { class: 'ar-thumb-ph' }, aspectGlyph(id, 16));
  return h('span', { class: 'ar-thumb', style: { width: long + 'px', height: long + 'px' } },
    append(h('span', { class: 'ar-thumb-box', style: { width: w + 'px', height: hh + 'px' } }), [inner]));
}

// Danh sách preset của một tỉ lệ: tên nền tảng · thời lượng tối đa · "cần kiểm lại" khi verified:false (nguồn có ở title)
export function presetList(catalog, id, opts = {}) {
  const ps = presetsFor(catalog, id);
  const box = h('ul', { class: 'ar-presets' + (opts.compact ? ' compact' : ''), 'aria-label': t('aspect.presets') });
  for (const p of ps) {
    const max = p.max_s == null ? t('aspect.no_limit') : t('aspect.max_s', { s: fmtSeconds(p.max_s) });
    box.append(h('li', { title: [p.source, p.source_url, p.checked].filter(Boolean).join(' · ') || null },
      h('span', { class: 'ar-p-name' }, presetLabel(p.id)),
      h('span', { class: 'ar-p-max' }, max),
      p.verified === false ? h('span', { class: 'ar-unverified' }, t('aspect.unverified')) : null));
  }
  return box;
}

// Bộ chọn tỉ lệ (segmented control bằng radio thật ⇒ phím mũi tên, nhãn, trình đọc màn hình chạy sẵn).
// args: {aspects (catalog hoặc mảng), value, inherit?:{label, value}, kind?, onChange?(value|null), name?, presets?:true, disabled?}
// Trả Element có `.value` (null = theo kênh) và `.setInherit({label,value})`. ≤ 1 tỉ lệ bật ⇒ nhãn tĩnh.
let seq = 0;
export function aspectPicker(args = {}) {
  const name = args.name || 'ar-' + (++seq);
  const root = h('div', { class: 'ar-picker' });
  let model = null;
  let inherit = args.inherit || null;
  let current = args.value == null ? null : String(args.value);
  const notes = h('div', { class: 'ar-notes' });

  function draw() {
    model = pickerModel({ aspects: args.aspects, value: current, inherit, kind: args.kind });
    current = model.value;
    while (root.firstChild) root.removeChild(root.firstChild);
    if (model.static) {
      const only = model.options.find((o) => !o.inherit) || model.options[0];
      root.append(h('span', { class: 'ar-static', title: t('aspect.only_one') }, aspectBadge(only ? only.aspect : '16:9'), h('span', { class: 'muted' }, only ? only.label : '')));
    } else {
      const group = h('div', { class: 'ar-seg', role: 'radiogroup', 'aria-label': t('aspect.label') });
      for (const o of model.options) {
        const inp = h('input', { type: 'radio', name, value: o.value, checked: o.value === current, disabled: o.disabled || args.disabled,
          onchange: () => { current = o.value; draw(); if (args.onChange) args.onChange(current === '' ? null : current); } });
        group.append(h('label', { class: 'ar-opt' + (o.value === current ? ' on' : '') + (o.disabled ? ' off' : '') + (o.inherit ? ' inherit' : ''), title: o.reason || null },
          inp, aspectGlyph(o.aspect, 14), h('span', { class: 'ar-opt-label' }, o.label)));
      }
      root.append(group);
    }
    while (notes.firstChild) notes.removeChild(notes.firstChild);
    const sel = model.options.find((o) => o.value === current);
    const blocked = model.options.find((o) => o.disabled && o.reason);
    if (args.presets !== false && sel) notes.append(presetList(args.aspects, sel.aspect, { compact: true }));
    if (blocked) notes.append(h('p', { class: 'ar-reason small' }, blocked.reason));
    if (notes.firstChild) root.append(notes);
  }
  draw();
  Object.defineProperty(root, 'value', { get: () => (current === '' || current == null ? null : current) });
  root.setInherit = (inh) => { inherit = inh || null; draw(); };
  return root;
}

// Lớp phủ vùng UI nền tảng (SVG, toạ độ khung gốc của tỉ lệ). def = định nghĩa tỉ lệ từ catalog. tier: 'hard' | 'soft' | 'both'.
// Tỉ lệ không có `safe` (16:9) ⇒ SVG rỗng (không vẽ gì).
export function safeOverlay(def, { tier = 'both' } = {}) {
  const size = def && Array.isArray(def.size) ? def.size : (ratioOf(def && def.id) || [16, 9]);
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${size[0]} ${size[1]}`); svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('class', 'ar-safe'); svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', t('aspect.safe_overlay'));
  const safe = def && def.safe;
  if (!safe) return svg;
  const el = (tag, attrs) => { const n = document.createElementNS(SVG_NS, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v)); return n; };
  const rectOf = (b) => ({ x: b[0], y: b[1], width: b[2] - b[0], height: b[3] - b[1] });
  if ((tier === 'hard' || tier === 'both') && Array.isArray(safe.hard)) {
    const [x0, y0, x1, y1] = safe.hard;
    // vùng bị UI nền tảng che = cả khung trừ hình chữ nhật an toàn (evenodd)
    svg.appendChild(el('path', { d: `M0 0H${size[0]}V${size[1]}H0Z M${x0} ${y0}V${y1}H${x1}V${y0}Z`, 'fill-rule': 'evenodd', class: 'ar-safe-mask' }));
    const r = el('rect', Object.assign(rectOf(safe.hard), { class: 'ar-safe-hard' }));
    r.appendChild(el('title', {})).textContent = t('aspect.safe.hard');
    svg.appendChild(r);
  }
  if ((tier === 'soft' || tier === 'both') && Array.isArray(safe.soft)) {
    const r = el('rect', Object.assign(rectOf(safe.soft), { class: 'ar-safe-soft' }));
    r.appendChild(el('title', {})).textContent = t('aspect.safe.soft');
    svg.appendChild(r);
  }
  return svg;
}

// Chip vừa/quá thời lượng theo preset: fit = {[preset]: {ok, max_s}} (GET /api/renders/:id → fit)
export function fitChips(fit) {
  const box = h('div', { class: 'ar-fit' });
  for (const [pid, f] of Object.entries(fit && typeof fit === 'object' ? fit : {})) {
    const ok = !!(f && f.ok);
    const text = ok ? t('aspect.fit.ok', { p: presetLabel(pid) }) : t('aspect.fit.over', { p: presetLabel(pid), s: t('aspect.max_s', { s: fmtSeconds(f && f.max_s) }) });
    box.append(h('span', { class: 'badge tone-' + (ok ? 'ok' : 'warn') }, text));
  }
  return box;
}
