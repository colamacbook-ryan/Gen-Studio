// © 2026 Gen Labs — All rights reserved.
// Tab "Nhận diện" của Kênh (H1 — gói UI-H1, SPEC-0.2.0 §4.3–4.7, F7 §5.3). Tự đăng ký vào móc tab Inspector kênh của UI-L5R3 (lists.js nạp động
// ./channel-tabs/*.js — CNS-126) theo hợp đồng của lists.js: export function tab(env) → {key, label, order, mount(host) → cleanup} (xem cuối file).
// Inspector 400px chỉ đủ cho thẻ tóm tắt ⇒ nút "Mở trình sửa nhận diện" mở trình sửa toàn khung (trái 560px form · phải xem trước); host đủ rộng ⇒ trình sửa nằm ngay trong host.
// Xem trước: POST /api/preview/still {mode:'brand', brand: bản nháp, aspect} (KHÔNG ghi gì). Lưu: POST /api/channels {id, data:{brand}} (chỉ owner — brand là trường chính sách).
// Đề xuất SG- của agent: Thử trong bản nháp / Áp dụng (POST /api/suggestions/:id/apply — chỉ owner trên phiên UI).
import { h, clear, icon, toast, confirmButton } from '../../components/dom.js';
import { t, tOr } from '../../i18n.js';
import { get, post, getCsrf } from '../../components/api.js';
import { errorBanner, badge, skeleton } from '../../components/states.js';
import { toText, fmtTc } from '../../components/util.js';
import { fmtDateTime } from '../../components/datagrid.js';
import { AspectUI } from '../lessons.js';

const TOKEN_KEYS = ['paper', 'rule', 'rule_strong', 'margin', 'ink', 'ink_soft', 'hl', 'accent', 'accent2', 'leaf', 'card', 'en'];
// (nền, chữ, token bị báo, ngưỡng, khoá nhãn) — cùng luật render/brand.js CONTRAST_RULES (máy chủ kiểm lại khi lưu)
export const CONTRAST = [['paper', 'ink', 'ink', 7, 'ink_paper'], ['paper', 'ink_soft', 'ink_soft', 4.5, 'soft_paper'], ['paper', 'en', 'en', 4.5, 'en_paper'], ['card', 'ink', 'card', 7, 'ink_card'], ['hl', 'ink', 'hl', 4.5, 'ink_hl']];
const HEX = /^#[0-9A-Fa-f]{6}$/;
const VIEWS = [['mid', 4200], ['card', null], ['thumb', null]];
const SECTIONS = { lower_third: ['enabled', 'style', 'duration_ms', 'text'], subtitle: ['size', 'plate', 'max_chars_line', 'position'], intro: ['enabled', 'kind', 'duration_ms', 'sfx'] };

const lum = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4))).reduce((s, x, i) => s + x * [0.2126, 0.7152, 0.0722][i], 0);
export function contrastRatio(a, b) { if (!HEX.test(a) || !HEX.test(b)) return null; const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
// tương phản trượt theo token → [{token, label, ratio, need}]
export function contrastIssues(tokens) {
  const out = [];
  for (const [bg, fg, tok, need, label] of CONTRAST) {
    const r = contrastRatio(tokens[bg], tokens[fg]);
    if (r != null && r + 1e-9 < need) out.push({ token: tok, label, ratio: Math.round(r * 100) / 100, need });
  }
  return out;
}
const fmtRatio = (r) => (Math.round(r * 10) / 10).toString();
const clone = (v) => JSON.parse(JSON.stringify(v));
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
export function deepMerge(a, b) {
  const out = clone(isObj(a) ? a : {});
  for (const [k, v] of Object.entries(isObj(b) ? b : {})) out[k] = isObj(v) && isObj(out[k]) ? deepMerge(out[k], v) : clone(v);
  return out;
}
// bản đã chuẩn hoá (máy chủ) → dữ liệu lưu được: bỏ vars/hash/logo.ref, logo null ⇒ bỏ khoá
export function cleanBrand(n) {
  const b = clone(n || {});
  delete b.vars; delete b.hash;
  if (b.logo) delete b.logo.ref; else delete b.logo;
  return b;
}
const channelIdOf = (c) => toText(c && typeof c === 'object' ? (c.display_id || c.id) : c);
const tok = (s) => t('brand.tok.' + s);

// ===================== thẻ tóm tắt (Inspector 400px) =====================
function summary(data, onOpen) {
  const n = data.normalized || {};
  const errs = contrastIssues((n && n.tokens) || {});
  const preset = (data.presets || []).find((p) => p.id === n.preset);
  const pair = (data.font_pairs || []).find((p) => p.id === (n.fonts && n.fonts.pair));
  return h('div', { class: 'brand-sum' },
    data.brand ? null : h('p', { class: 'muted small' }, t('brand.no_brand')),
    h('div', { class: 'brand-strip', 'aria-hidden': 'true' }, TOKEN_KEYS.map((k) => h('i', { style: { background: n.tokens ? n.tokens[k] : 'transparent' }, title: tok(k) }))),
    h('dl', { class: 'fields' },
      h('dt', { class: 'micro' }, t('brand.sum.preset')), h('dd', null, toText(preset ? preset.label : n.preset)),
      h('dt', { class: 'micro' }, t('brand.sum.fonts')), h('dd', null, toText(pair ? pair.label : '')),
      h('dt', { class: 'micro' }, t('brand.sum.logo')), h('dd', { class: 'mono' }, n.logo ? toText(n.logo.asset) + ' · ' + t('brand.corner.' + n.logo.corner) : t('brand.sum.none'))),
    errs.length ? badge(t('brand.sum.errors', { n: errs.length }), 'danger') : null,
    (data.suggestions || []).length ? badge(t('brand.sec.suggest', { n: data.suggestions.length }), 'warn') : null,
    h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn', onclick: onOpen }, icon('image'), t('brand.open'))));
}

// ===================== trình sửa =====================
// mountEditor(host, {channel, isOwner, sheet?, onClose?}) → { destroy() }
export function mountEditor(host, opts) {
  const chId = channelIdOf(opts.channel);
  let data = null; let saved = null; let draft = null; let aspect = '16:9'; let alive = true; let cat = null;
  const isOwner = !!opts.isOwner;
  const root = h('div', { class: 'brand-ed' + (opts.sheet ? ' sheet' : '') }, skeleton(8));
  host.append(root);
  const urls = new Map();   // view → objectURL hiện tại
  let pvTimer = null; let pvAbort = null; let pvSeq = 0;
  const pvBoxes = {}; let pvStateEl = null; let pvGrid = null; let saveBtn = null; let stateEl = null; let errBox = null;
  const fieldErr = new Map();   // path → phần tử hiện lỗi

  const dirty = () => !data.brand || JSON.stringify(draft) !== JSON.stringify(saved);
  const issues = () => contrastIssues(draft.tokens || {});

  async function load() {
    try {
      const [d, c] = await Promise.all([get('/api/channels/' + encodeURIComponent(chId) + '/brand'), AspectUI.load().catch(() => null)]);
      if (!alive) return;
      data = d; cat = c; saved = cleanBrand(d.normalized); draft = clone(saved);
      aspect = d.default_aspect || '16:9';
      render(); schedulePreview(0);
    } catch (e) { if (!alive) return; clear(root); root.append(errorBanner(e, load)); }
  }

  // ---- thanh trên: trạng thái + Khôi phục preset · Huỷ · Lưu (⌘S) ----
  function topBar() {
    stateEl = h('span', { class: 'small brand-state', role: 'status' });
    saveBtn = h('button', { type: 'button', class: 'btn primary', onclick: save }, t('brand.save'), h('span', { class: 'mono kbd' }, '⌘S'));
    const resetBtn = h('button', { type: 'button', class: 'btn', disabled: !isOwner, onclick: resetPreset }, t('brand.reset'));
    const revertBtn = h('button', { type: 'button', class: 'btn', disabled: !isOwner, onclick: () => { draft = clone(saved); render(); schedulePreview(0); } }, t('brand.revert'));
    const close = opts.onClose ? (dirty() ? confirmButton(t('brand.close'), t('common.confirm_again'), opts.onClose, 'btn') : h('button', { type: 'button', class: 'btn', onclick: opts.onClose }, t('brand.close'), h('span', { class: 'mono kbd' }, 'Esc'))) : null;
    return h('header', { class: 'brand-top' },
      h('nav', { class: 'crumb' }, h('span', null, t('nav.channels')), h('span', { class: 'muted' }, ' › '), h('span', null, toText(data.channel.name)), h('span', { class: 'mono muted' }, ' ' + toText(data.channel.display_id)), h('span', { class: 'muted' }, ' › '), h('span', null, t('brand.tab'))),
      stateEl, h('span', { class: 'spacer' }), resetBtn, revertBtn, saveBtn, close);
  }
  function paintState() {
    if (!stateEl) return;
    const bad = issues().length;
    stateEl.textContent = !data.brand ? t('brand.never') : dirty() ? t('brand.dirty') : t('brand.clean', { v: data.channel.version });
    stateEl.className = 'small brand-state ' + (dirty() ? 'tone-warn' : 'muted');
    saveBtn.disabled = !isOwner || bad > 0 || !dirty();
    saveBtn.title = bad ? t('brand.blocked') : '';
    // lỗi tương phản dưới từng token
    for (const [k, el] of fieldErr) { if (k.startsWith('tokens.')) { clear(el); el.hidden = true; } }
    for (const is of issues()) {
      const el = fieldErr.get('tokens.' + is.token); if (!el) continue;
      el.hidden = false; el.append(t('brand.cr.fail', { label: t('brand.cr.' + is.label), r: fmtRatio(is.ratio), n: is.need }));
    }
    root.querySelectorAll('[data-ratio]').forEach((el) => {
      const [bg, fg, need] = el.dataset.ratio.split('|'); const r = contrastRatio(draft.tokens[bg], draft.tokens[fg]);
      el.textContent = r == null ? '—' : t('brand.cr.ok', { r: fmtRatio(r) });
      el.className = 'mono small ratio ' + (r != null && r + 1e-9 < Number(need) ? 'tone-danger' : 'tone-ok');
    });
  }
  const changed = (rebuild) => { if (rebuild) render(); else paintState(); schedulePreview(); };

  // ---- các nhóm của form ----
  const sec = (title, ...kids) => h('section', { class: 'brand-sec' }, h('h3', { class: 'brand-h' }, title), ...kids);
  const errSlot = (path) => { const el = h('p', { class: 'field-err tone-danger small', hidden: true, role: 'alert' }); fieldErr.set(path, el); return el; };
  const seg = (name, values, cur, label, onPick) => h('div', { class: 'brand-seg', role: 'radiogroup', 'aria-label': label },
    values.map((v) => h('button', { type: 'button', role: 'radio', 'aria-checked': v === cur ? 'true' : 'false', class: 'seg-opt' + (v === cur ? ' on' : ''), disabled: !isOwner,
      onclick: (e) => { onPick(v); const box = e.currentTarget.parentNode; for (const b of box.children) { const on = b === e.currentTarget; b.classList.toggle('on', on); b.setAttribute('aria-checked', on ? 'true' : 'false'); } } }, tOr(name + '.' + v, v))));
  const numIn = (val, min, max, step, onSet, label) => {
    const el = h('input', { type: 'number', class: 'input mono', min: String(min), max: String(max), step: String(step), value: String(val), disabled: !isOwner, 'aria-label': label });
    el.addEventListener('input', () => { const n = Math.round(Number(el.value)); if (Number.isFinite(n) && n >= min && n <= max) { el.classList.remove('bad'); onSet(n); changed(); } else el.classList.add('bad'); });
    return el;
  };
  const toggleIn = (on, label, onSet) => {
    const cb = h('input', { type: 'checkbox', role: 'switch', class: 'sw-input', checked: !!on, disabled: !isOwner, 'aria-label': label });
    cb.addEventListener('change', () => { onSet(cb.checked); changed(); });
    return h('label', { class: 'sw' }, cb, h('span', { class: 'sw-track', 'aria-hidden': 'true' }), h('span', null, label));
  };
  const row = (label, ctrl, hint) => h('div', { class: 'brand-row' }, h('span', { class: 'brand-lab' }, label), h('div', { class: 'brand-ctl' }, ctrl, hint ? h('p', { class: 'muted small brand-hint' }, hint) : null));

  function suggestSec() {
    const sgs = data.suggestions || [];
    if (!sgs.length) return null;
    return sec(t('brand.sec.suggest', { n: sgs.length }), h('div', { class: 'sg-list' }, sgs.map((s) => h('div', { class: 'sg-card' },
      h('div', { class: 'sg-head' }, h('span', { class: 'mono id' }, toText(s.id)), h('span', { class: 'muted small' }, t('brand.sg.by', { t: fmtDateTime(s.created_at) }))),
      s.note ? h('p', { class: 'small' }, toText(s.note)) : null,
      h('div', { class: 'scr-ids' }, h('span', { class: 'muted small' }, t('brand.sg.fields', { list: '' })), Object.keys(s.patch || {}).map((k) => h('span', { class: 'mono chip' }, k))),
      s.stale ? h('p', { class: 'small tone-warn' }, icon('warn'), ' ', t('brand.sg.stale', { b: toText(s.base_version), c: toText(data.channel.version) })) : null,
      h('div', { class: 'row' },
        h('button', { type: 'button', class: 'btn', onclick: () => { draft = deepMerge(draft, s.patch); render(); schedulePreview(0); toast(t('brand.sg.tried', { id: toText(s.id) }), 'info'); } }, t('brand.sg.try')),
        isOwner ? confirmButton(t('brand.sg.apply'), t('brand.sg.apply_confirm'), () => applySg(s), 'btn') : h('span', { class: 'muted small' }, t('brand.sg.owner_only')))))));
  }
  function presetSec() {
    return sec(t('brand.sec.preset'), h('div', { class: 'preset-cards', role: 'radiogroup', 'aria-label': t('brand.sec.preset') }, (data.presets || []).map((p) => {
      const on = draft.preset === p.id;
      return h('button', { type: 'button', role: 'radio', 'aria-checked': on ? 'true' : 'false', class: 'preset-card' + (on ? ' on' : ''), disabled: !isOwner,
        onclick: () => { draft.preset = p.id; draft.tokens = clone(p.tokens); draft.fonts = { pair: p.fonts }; changed(true); } },
        h('span', { class: 'preset-sw', style: { background: p.tokens.paper } }, ['ink', 'hl', 'accent', 'accent2', 'en'].map((k) => h('i', { style: { background: p.tokens[k] } }))),
        h('span', { class: 'preset-name' }, toText(p.label)), h('span', { class: 'mono muted small' }, toText(p.id)));
    })));
  }
  function colorsSec() {
    const pairFor = (k) => CONTRAST.find((c) => c[2] === k);
    const rows = TOKEN_KEYS.map((k) => {
      const v = draft.tokens[k] || '#000000';
      const sw = h('input', { type: 'color', class: 'tok-sw', value: v.toLowerCase(), disabled: !isOwner, 'aria-label': tok(k) });
      const hex = h('input', { type: 'text', class: 'input mono tok-hex', value: v, maxlength: '7', spellcheck: 'false', disabled: !isOwner, 'aria-label': tok(k) + ' HEX' });
      sw.addEventListener('input', () => { draft.tokens[k] = sw.value.toUpperCase(); hex.value = draft.tokens[k]; hex.classList.remove('bad'); changed(); });
      hex.addEventListener('input', () => { const x = hex.value.trim(); if (HEX.test(x)) { hex.classList.remove('bad'); draft.tokens[k] = x.toUpperCase(); sw.value = x.toLowerCase(); changed(); } else hex.classList.add('bad'); });
      hex.addEventListener('blur', () => { if (!HEX.test(hex.value.trim())) { hex.value = draft.tokens[k]; hex.classList.remove('bad'); } });
      const p = pairFor(k);
      const ratio = p ? h('span', { 'data-ratio': p[0] + '|' + p[1] + '|' + p[3], title: t('brand.cr.' + p[4]) + ' · ≥ ' + p[3] + ':1' }) : h('span', { class: 'muted small' }, '');
      return h('div', { class: 'tok-row' }, sw, h('span', { class: 'tok-name' }, tok(k), h('span', { class: 'mono muted' }, ' ' + k)), hex, ratio, errSlot('tokens.' + k));
    });
    return sec(t('brand.sec.colors'), h('div', { class: 'tok-grid' }, rows));
  }
  function fontsSec() {
    const cur = draft.fonts && draft.fonts.pair;
    const stack = { 'be-vietnam': '"Be Vietnam Pro", var(--sans)', 'patrick-hand': '"Patrick Hand", "Comic Neue", var(--sans)', 'plex-sans': 'var(--sans)', 'plex-mono': 'var(--mono)' };
    return sec(t('brand.sec.fonts'), h('div', { class: 'font-list', role: 'radiogroup', 'aria-label': t('brand.sec.fonts') }, (data.font_pairs || []).map((f) => {
      const [disp, hand] = f.id.split('+'); const on = cur === f.id;
      return h('button', { type: 'button', role: 'radio', 'aria-checked': on ? 'true' : 'false', class: 'font-opt' + (on ? ' on' : ''), disabled: !isOwner,
        onclick: () => { draft.fonts = { pair: f.id }; changed(true); } },
        h('span', { class: 'font-name' }, toText(f.label), h('span', { class: 'mono muted small' }, ' ' + f.id)),
        h('span', { class: 'font-sample', style: { fontFamily: stack[disp] || 'var(--sans)' } }, t('brand.font.sample')),
        h('span', { class: 'font-hand', style: { fontFamily: stack[hand] || 'var(--sans)' } }, 'A.I. · Large Language Model'));
    })), h('p', { class: 'muted small' }, t('brand.font.note')));
  }
  function logoSec() {
    const lg = draft.logo || null;
    const logos = data.logos || [];
    const pick = h('div', { class: 'logo-pick', role: 'radiogroup', 'aria-label': t('brand.sec.logo') },
      h('button', { type: 'button', role: 'radio', 'aria-checked': lg ? 'false' : 'true', class: 'logo-opt none' + (lg ? '' : ' on'), disabled: !isOwner, onclick: () => { delete draft.logo; changed(true); } }, t('brand.logo.none')),
      logos.map((a) => {
        const on = lg && lg.asset === a.id;
        return h('button', { type: 'button', role: 'radio', 'aria-checked': on ? 'true' : 'false', class: 'logo-opt' + (on ? ' on' : '') + (a.ok ? '' : ' bad'), disabled: !isOwner || !a.ok, title: a.ok ? a.id : a.id + ' · ' + t('brand.logo.too_big'),
          onclick: () => { draft.logo = Object.assign({ corner: 'tr', size: 's', show: ['video', 'thumb', 'end_card'] }, draft.logo || {}, { asset: a.id }); changed(true); } },
          h('img', { src: a.url, alt: '', loading: 'lazy' }), h('span', { class: 'mono small' }, a.id));
      }));
    const kids = [pick, h('p', { class: 'muted small' }, logos.length ? t('brand.logo.rule') : t('brand.logo.empty')), errSlot('logo.asset')];
    if (lg) {
      kids.push(row(t('brand.logo.corner'), seg('brand.corner', ['tl', 'tr', 'bl', 'br'], lg.corner, t('brand.logo.corner'), (v) => { draft.logo.corner = v; changed(); }),
        /^b/.test(lg.corner) ? t('brand.logo.vertical') : null));
      kids.push(row(t('brand.logo.size'), seg('brand.logo.size', ['s', 'm'], lg.size, t('brand.logo.size'), (v) => { draft.logo.size = v; changed(); })));
      const show = h('div', { class: 'checks' }, ['video', 'thumb', 'end_card'].map((k) => {
        const cb = h('input', { type: 'checkbox', checked: (lg.show || []).includes(k), disabled: !isOwner });
        cb.addEventListener('change', () => { const s = new Set(draft.logo.show || []); if (cb.checked) s.add(k); else s.delete(k); draft.logo.show = ['video', 'thumb', 'end_card'].filter((x) => s.has(x)); changed(); });
        return h('label', { class: 'check' }, cb, h('span', null, t('brand.logo.show.' + k)));
      }));
      kids.push(row(t('brand.logo.show'), show));
    }
    return sec(t('brand.sec.logo'), ...kids);
  }
  function ltSec() {
    const lt = draft.lower_third;
    const text = h('input', { type: 'text', class: 'input', value: lt.text || '', maxlength: '60', disabled: !isOwner, 'aria-label': t('brand.lt.text') });
    text.addEventListener('input', () => { lt.text = text.value; changed(); });
    return sec(t('brand.sec.lt'),
      toggleIn(lt.enabled, t('brand.lt.enabled'), (v) => { lt.enabled = v; }),
      row(t('brand.lt.style'), seg('brand.lt.style', ['chip', 'bar', 'tag'], lt.style, t('brand.lt.style'), (v) => { lt.style = v; changed(); })),
      row(t('brand.lt.dur'), numIn(lt.duration_ms, 800, 6000, 100, (n) => { lt.duration_ms = n; }, t('brand.lt.dur'))),
      row(t('brand.lt.text'), text),
      h('p', { class: 'note-vert small' }, AspectUI.badge('9:16'), h('span', null, t('brand.lt_off_vertical'))));
  }
  function subSec() {
    const s = draft.subtitle;
    return sec(t('brand.sec.sub'),
      row(t('brand.sub.size'), seg('brand.sub.size', ['s', 'm', 'l'], s.size, t('brand.sub.size'), (v) => { s.size = v; changed(); })),
      row(t('brand.sub.plate'), seg('brand.sub.plate', ['none', 'card'], s.plate, t('brand.sub.plate'), (v) => { s.plate = v; changed(); })),
      row(t('brand.sub.max'), numIn(s.max_chars_line, 20, 60, 1, (n) => { s.max_chars_line = n; }, t('brand.sub.max'))),
      row(t('brand.sub.pos'), seg('brand.sub.pos', ['bottom', 'top'], s.position, t('brand.sub.pos'), (v) => { s.position = v; changed(true); })),
      s.position === 'top' ? h('p', { class: 'note-vert small' }, AspectUI.badge('9:16'), h('span', null, t('brand.sub.top_vertical'))) : null);
  }
  function introSec() {
    const it = draft.intro, ou = draft.outro;
    const sfx = h('select', { class: 'input', disabled: !isOwner, 'aria-label': t('brand.intro.sfx') }, ['none', 'pop', 'swish', 'chime', 'whoosh', 'ta-da', 'slide-up', 'rimshot'].map((v) => h('option', { value: v, selected: v === it.sfx }, v)));
    sfx.addEventListener('change', () => { it.sfx = sfx.value; changed(); });
    return sec(t('brand.sec.intro'),
      toggleIn(it.enabled, t('brand.intro.enabled'), (v) => { it.enabled = v; if (v && it.kind === 'none') it.kind = 'logo-pop'; render(); }),
      row(t('brand.intro.kind'), seg('brand.intro.kind', ['none', 'logo-pop', 'title-wipe'], it.kind, t('brand.intro.kind'), (v) => { it.kind = v; changed(); })),
      row(t('brand.intro.dur'), numIn(it.duration_ms, 300, 3000, 100, (n) => { it.duration_ms = n; }, t('brand.intro.dur'))),
      row(t('brand.intro.sfx'), sfx),
      row(t('brand.outro.hold'), numIn(ou.hold_ms, 1000, 6000, 100, (n) => { ou.hold_ms = n; }, t('brand.outro.hold'))));
  }
  function endSec() {
    const ec = draft.end_card;
    const cta = h('input', { type: 'text', class: 'input', value: ec.cta || '', maxlength: '40', disabled: !isOwner, 'aria-label': t('brand.end.cta') });
    cta.addEventListener('input', () => { ec.cta = cta.value; changed(); });
    return sec(t('brand.sec.end'), row(t('brand.end.cta'), cta), toggleIn(ec.next_hint, t('brand.end.next'), (v) => { ec.next_hint = v; }));
  }

  // ---- xem trước ----
  function previewCol() {
    pvStateEl = h('span', { class: 'muted small' });
    const opts = ((cat && cat.aspects) || [{ id: '16:9' }, { id: '9:16' }]).filter((a) => a.enabled !== false).map((a) => ({ id: a.id }));
    const picker = AspectUI.picker({ options: opts, value: aspect, label: t('brand.pv.aspect'), onChange: (v) => { aspect = v; drawPvGrid(); schedulePreview(0); } });
    pvGrid = h('div', { class: 'pv-grid' });
    drawPvGrid();
    return h('aside', { class: 'brand-pv', 'aria-label': t('brand.pv.title') },
      h('div', { class: 'pv-head' }, h('h3', { class: 'brand-h' }, t('brand.pv.title')), pvStateEl, h('span', { class: 'spacer' }), picker), pvGrid);
  }
  function drawPvGrid() {
    clear(pvGrid);
    const vert = AspectUI.portrait(aspect);
    pvGrid.className = 'pv-grid' + (vert ? ' vert' : '');
    for (const [v, tc] of VIEWS) {
      const img = h('img', { alt: t('brand.pv.' + v), hidden: !urls.get(v + '|' + aspect) });
      if (urls.get(v + '|' + aspect)) img.src = urls.get(v + '|' + aspect);
      const frame = h('div', { class: 'pv-frame', style: { aspectRatio: AspectUI.ratioCss(aspect) } }, img, h('i', { class: 'pv-bar', 'aria-hidden': 'true' }));
      const err = h('div', { class: 'pv-err' });
      pvBoxes[v] = { frame, img, err };
      pvGrid.append(h('figure', { class: 'pv-item' }, frame, h('figcaption', { class: 'small' }, h('span', null, t('brand.pv.' + v)), tc != null ? h('span', { class: 'mono muted' }, t('brand.pv.tc', { tc: fmtTc(tc) })) : null), err));
    }
  }
  function schedulePreview(ms) {
    clearTimeout(pvTimer);
    for (const b of Object.values(pvBoxes)) b.frame.classList.add('stale');
    pvTimer = setTimeout(runPreview, ms == null ? 650 : ms);
  }
  async function runPreview() {
    if (!alive || !data) return;
    if (pvAbort) pvAbort.abort();
    const ac = new AbortController(); pvAbort = ac; const seq = ++pvSeq;
    const asp = aspect, vert = AspectUI.portrait(asp);
    const body = (view) => ({ mode: 'brand', channel: chId, view, aspect: asp, w: vert ? 360 : 640, brand: draft });
    pvStateEl.textContent = dirty() ? t('brand.pv.draft') : t('brand.pv.saved');
    // tuần tự để không dồn hàng still (FIFO ≤ 8 của máy chủ)
    for (const [v] of VIEWS) {
      const box = pvBoxes[v]; if (!box) continue;
      clear(box.err);
      try {
        const r = await fetch('/api/preview/still', { method: 'POST', credentials: 'same-origin', signal: ac.signal,
          headers: { 'Content-Type': 'application/json', Accept: 'image/jpeg', 'X-CSRF': getCsrf() }, body: JSON.stringify(body(v)) });
        if (!r.ok) {
          let j = null; try { j = await r.json(); } catch { j = null; }
          const e = (j && j.error) || {};
          throw { code: e.code || 'http_' + r.status, text_human: t('brand.pv.err'), detail: toText(e.text_human || '') + (e.detail ? ' · ' + toText(e.detail) : ''), status: r.status };
        }
        const blob = await r.blob();
        if (seq !== pvSeq || !alive) return;
        const key = v + '|' + asp, old = urls.get(key);
        const url = URL.createObjectURL(blob); urls.set(key, url);
        if (old) URL.revokeObjectURL(old);
        box.img.src = url; box.img.hidden = false; box.frame.classList.remove('stale');
      } catch (e) {
        if (e && e.name === 'AbortError') return;
        if (seq !== pvSeq || !alive) return;
        box.frame.classList.remove('stale');
        box.err.append(errorBanner(e && e.text_human ? e : { code: 'preview', text_human: t('brand.pv.err'), detail: toText(e && e.message) }));
      }
    }
  }

  // ---- hành động ----
  function resetPreset() {
    const p = (data.presets || []).find((x) => x.id === draft.preset) || (data.presets || [])[0];
    if (!p) return;
    draft.tokens = clone(p.tokens); draft.fonts = { pair: p.fonts };
    render(); schedulePreview(0); toast(t('brand.reset_done', { p: toText(p.label) }), 'info');
  }
  async function save() {
    if (!isOwner || issues().length || !dirty()) return;
    saveBtn.disabled = true; clear(errBox);
    try {
      const res = await post('/api/channels', { id: chId, data: { brand: draft } });
      const v = res && (res.channel && (res.channel.version || res.channel.current_version));
      toast(t('brand.saved', { v: toText(v) }), 'ok');
      await load();
      if (opts.onSaved) opts.onSaved();
    } catch (e) {
      errBox.append(errorBanner(e));
      let d = e && e.detail; if (typeof d === 'string') { try { d = JSON.parse(d); } catch { d = null; } }
      for (const fe of (d && Array.isArray(d.errors) ? d.errors : [])) { const el = fieldErr.get(String(fe.path)); if (el) { el.hidden = false; clear(el); el.append(toText(fe.text)); } }
      paintState();
    }
  }
  async function applySg(s) {
    try {
      const res = await post('/api/suggestions/' + encodeURIComponent(s.id) + '/apply', {});
      const after = res && res.result && res.result.after;
      toast(t('brand.sg.applied', { id: toText(s.id), v: toText((after && after.channel_version) || '') }), 'ok');
      await load(); if (opts.onSaved) opts.onSaved();
    } catch (e) { toast((e && e.text_human) || t('err.generic'), 'danger'); }
  }

  function render() {
    fieldErr.clear();
    clear(root);
    errBox = h('div');
    const form = h('div', { class: 'brand-form' },
      data.brand ? null : h('div', { class: 'banner warn' }, h('div', { class: 'banner-main' }, icon('warn'), h('span', null, t('brand.no_brand')))),
      isOwner ? null : h('p', { class: 'muted small' }, t('brand.owner_only')),
      errBox, suggestSec(), presetSec(), colorsSec(), fontsSec(), logoSec(), subSec(), ltSec(), introSec(), endSec());
    root.append(topBar(), h('div', { class: 'brand-body' }, form, previewCol()));
    paintState();
  }

  const onKey = (e) => {
    if ((e.metaKey || e.ctrlKey) && (e.key === 's' || e.key === 'S')) { e.preventDefault(); save(); }
    else if (e.key === 'Escape' && opts.onClose && !document.querySelector('.overlay')) { if (!data || !dirty()) { e.preventDefault(); opts.onClose(); } }
  };
  window.addEventListener('keydown', onKey);
  load();
  return {
    destroy() { alive = false; clearTimeout(pvTimer); if (pvAbort) pvAbort.abort(); window.removeEventListener('keydown', onKey); for (const u of urls.values()) URL.revokeObjectURL(u); root.remove(); },
  };
}

// Trình sửa toàn khung (phủ vùng nội dung, giữ sidebar): dùng khi Inspector hẹp
export function openBrandEditor(channel, env = {}) {
  const prevFocus = document.activeElement;
  const sheet = h('div', { class: 'brand-sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('brand.title') });
  document.body.append(sheet);
  let ed = null;
  const close = () => { if (ed) ed.destroy(); sheet.remove(); if (prevFocus && prevFocus.focus) prevFocus.focus(); if (env.onClose) env.onClose(); };
  (typeof env.isOwner === 'boolean' ? Promise.resolve(env.isOwner) : ownerOf(env.ctx)).then((isOwner) => { ed = mountEditor(sheet, { channel, isOwner, sheet: true, onClose: close, onSaved: env.reload }); });
  return close;
}
async function ownerOf(ctx) {
  if (ctx && ctx.me && ctx.me.user) return ctx.me.user.role === 'owner';
  try { const me = await get('/api/me'); return !!(me && me.user && me.user.role === 'owner'); } catch { return false; }
}

// ===================== móc tab kênh (UI-L5R3, CNS-126) =====================
// Hợp đồng của lists.js (UI-L5R3): export function tab(env) → {key, label, order?, mount(host) → cleanup?} | null
//   env = {channel:{display_id, name, version, data}, row, ctx, isOwner, save(dataPatch, note?), reload()}
// Host rộng (bảng kênh dưới lưới) ⇒ trình sửa nằm ngay trong host; host hẹp (Inspector 400px) ⇒ thẻ tóm tắt + nút mở trình sửa toàn khung.
export function mountTab(host, env = {}) {
  const chId = channelIdOf(env.channel || env.row);
  let alive = true; let ed = null; let closeSheet = null;
  const box = h('div', { class: 'brand-tab' }, skeleton(4));
  host.append(box);
  const wide = () => (host.getBoundingClientRect ? host.getBoundingClientRect().width : 0) >= 1000;
  const ownerP = typeof env.isOwner === 'boolean' ? Promise.resolve(env.isOwner) : ownerOf(env.ctx);
  ownerP.then((isOwner) => {
    if (!alive) return;
    if (wide()) { clear(box); ed = mountEditor(box, { channel: chId, isOwner, onSaved: env.reload }); return; }
    const drawSum = () => get('/api/channels/' + encodeURIComponent(chId) + '/brand').then((d) => {
      if (!alive) return; clear(box);
      box.append(summary(d, () => { closeSheet = openBrandEditor(chId, { ctx: env.ctx, isOwner, reload: () => { drawSum(); if (env.reload) env.reload(); } }); }));
    }).catch((e) => { if (alive) { clear(box); box.append(errorBanner(e, drawSum)); } });
    drawSum();
  });
  return () => { alive = false; if (ed) ed.destroy(); if (closeSheet) closeSheet(); };
}
export function tab(env = {}) {
  if (!channelIdOf(env.channel || env.row)) return null;
  return { key: 'brand', order: 20, label: t('brand.tab'), mount: (host) => mountTab(host, env) };
}
export default tab;
