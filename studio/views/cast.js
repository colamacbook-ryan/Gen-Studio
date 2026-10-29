// © 2026 Gen Labs — All rights reserved.
// Màn Nhân vật (#/cast, L1 — gói UI-L1, SPEC-0.2.0 §3.7–3.8, §10): lưới `cast` (lọc theo kênh, đọc ?q=) + Inspector riêng:
// trạng thái chốt (suy ra "đã chốt · có thay đổi chờ chốt"), bảng nhân vật dựng bằng renderStill(mode:'cast'), lỗi validateRecipe thân thiện,
// giọng theo nhà cung cấp (Gemini / offline — danh sách quét lúc chạy), Chốt dùng / Cho nghỉ (chỉ owner trên phiên UI; agent không có tool).
import { h, clear, icon, toast, confirmButton } from '../components/dom.js';
import { t, tOr } from '../i18n.js';
import { get, post } from '../components/api.js';
import { createDataGrid, fmtDateTime } from '../components/datagrid.js';
import { pageHeader } from '../components/shell.js';
import { openDialog } from '../components/dialog.js';
import { skeleton, errorBanner, emptyState, badge } from '../components/states.js';
import { onDebounced } from '../components/bus.js';
import { initialQuery } from './grid-view.js';
import { toText, normalizeError } from '../components/util.js';

const TABS = ['sheet', 'voice', 'recipe', 'versions'];
const TONE = { draft: 'idle', candidate: 'info', approved: 'ok', approved_pending: 'warn', retired: 'idle' };

export function statusBadge(st) { return badge(tOr('cast.st.' + st, st), TONE[st] || 'idle'); }
// lỗi/cảnh báo của validateRecipe → danh sách (đường dẫn mono + câu người đọc)
export function issueList(items, tone) {
  return h('ul', { class: 'cast-issues tone-' + tone }, (items || []).map((e) => h('li', null,
    h('span', { class: 'mono' }, toText(e.path) || t('cast.valid_general')), h('span', null, toText(e.text_human || e.text || e.code)))));
}
// detail của lỗi API đã thành chuỗi (normalizeError) — đọc lại danh sách lỗi theo trường nếu có: [{path, text_human}] | null
export function detailErrors(e) {
  let d = e && e.detail;
  if (typeof d === 'string') { try { d = JSON.parse(d); } catch { d = null; } }
  return d && typeof d === 'object' && Array.isArray(d.errors) ? d.errors : null;
}
// lỗi từ op (invalid kèm detail.errors) → khối thân thiện + Chi tiết kỹ thuật
function opError(e) {
  const n = normalizeError(e);
  const errs = detailErrors(e);
  return errs ? h('div', null, errorBanner({ code: n.code, text_human: n.text_human || t('err.generic'), status: n.status }), issueList(errs, 'danger')) : errorBanner(e);
}

function sheetTab(m, state) {
  const box = h('div', { class: 'cast-sheet' });
  const w = 1280;
  const src = '/api/cast/' + encodeURIComponent(m.display_id) + '/sheet?w=' + w + '&version=' + m.current_version;
  if (state.sheetErr && state.sheetErr.src === src) { box.append(errorBanner({ code: 'sheet', text_human: t('cast.sheet_fail'), detail: state.sheetErr.detail })); return box; }
  const prog = h('div', { class: 'cast-prog', role: 'status' }, h('i', { class: 'bar' }), h('span', { class: 'muted small' }, t('cast.sheet_rendering')));
  const img = h('img', { alt: t('cast.sheet_alt', { name: toText(m.name) }), class: 'cast-sheet-img', hidden: true });
  img.addEventListener('load', () => { img.hidden = false; prog.remove(); });
  img.addEventListener('error', () => {
    // lấy lại để đọc lỗi JSON (không render object; chỉ chữ thân thiện + chi tiết)
    fetch(src, { credentials: 'same-origin' }).then((r) => r.json()).then((j) => { state.sheetErr = { src, detail: toText(j && j.error && (j.error.text_human + ' · ' + toText(j.error.detail))) }; })
      .catch((ex) => { state.sheetErr = { src, detail: toText(ex && ex.message) }; })
      .finally(() => { prog.remove(); box.append(errorBanner({ code: 'sheet', text_human: t('cast.sheet_fail'), detail: state.sheetErr && state.sheetErr.detail })); });
  });
  img.src = src;
  const open = h('button', { type: 'button', class: 'btn', onclick: () => openDialog(t('cast.sheet_alt', { name: toText(m.name) }), h('img', { src, alt: '', class: 'cast-sheet-big' })) }, icon('image'), t('cast.sheet_open'));
  box.append(prog, h('button', { type: 'button', class: 'cast-sheet-btn', 'aria-label': t('cast.sheet_open'), onclick: () => open.click() }, img), open);
  return box;
}

function voiceTab(d, reload, isOwner) {
  const voices = d.voices || {};
  const providers = ['gemini', 'offline'].filter((p) => Array.isArray(voices[p]));
  const cur = d.voice || {};
  const box = h('div', { class: 'cast-voice' });
  box.append(h('p', { class: 'small' }, cur.voice ? t('cast.voice.current', { p: tOr('cast.voice.' + toText(cur.provider || 'gemini'), toText(cur.provider)), v: toText(cur.voice) }) : t('cast.voice.none_set')));
  if (!providers.length) { box.append(h('p', { class: 'muted small' }, t('cast.voice.no_provider'))); return box; }
  let prov = providers.includes(cur.provider) ? cur.provider : providers[0];
  let pick = cur.provider === prov ? toText(cur.voice) : '';
  const seg = h('div', { class: 'brand-seg', role: 'radiogroup', 'aria-label': t('cast.voice.provider') });
  const list = h('div', { class: 'voice-pick', role: 'radiogroup', 'aria-label': t('cast.voice.pick') });
  const note = h('p', { class: 'muted small' });
  const save = h('button', { type: 'button', class: 'btn', disabled: true }, t('cast.voice.save'));
  const err = h('div');
  const paint = () => {
    clear(seg); clear(list);
    for (const p of providers) seg.append(h('button', { type: 'button', role: 'radio', class: 'seg-opt' + (p === prov ? ' on' : ''), 'aria-checked': p === prov ? 'true' : 'false', onclick: () => { prov = p; pick = cur.provider === p ? toText(cur.voice) : ''; paint(); } }, h('span', { class: 'vp-label' }, t('cast.voice.' + p))));
    const vs = voices[prov] || [];
    if (!vs.length) list.append(h('p', { class: 'muted small' }, t('cast.voice.empty')));
    for (const v of vs) {
      const on = v.id === pick;
      list.append(h('button', { type: 'button', role: 'radio', 'aria-checked': on ? 'true' : 'false', class: 'vp-item' + (on ? ' on' : ''), disabled: !isOwner, onclick: () => { pick = v.id; paint(); } },
        h('span', null, toText(v.name || v.id)), v.gender ? h('span', { class: 'muted small' }, tOr('cast.gender.' + toText(v.gender), toText(v.gender))) : null,
        v.name && v.name !== v.id ? h('span', { class: 'mono muted small' }, toText(v.id)) : null));
    }
    const at = voices[prov + '_scanned_at'];
    note.textContent = at ? t('cast.voice.scanned', { t: fmtDateTime(at) }) : t('cast.voice.scanned_unknown');
    save.disabled = !isOwner || !pick || (pick === toText(cur.voice) && prov === (cur.provider || 'gemini'));
  };
  save.addEventListener('click', async () => {
    save.disabled = true; clear(err);
    try {
      const res = await post('/api/cast/' + encodeURIComponent(d.member.display_id) + '/voice', { provider: prov, voice: pick });
      toast(t('cast.voice.saved', { v: toText(res && res.result && res.result.version) }), 'ok'); reload();
    } catch (e) { err.append(opError(e)); save.disabled = false; }
  });
  paint();
  box.append(h('div', { class: 'micro' }, t('cast.voice.provider')), seg, list, note, h('p', { class: 'muted small' }, t('cast.voice.note')), err, h('div', { class: 'row' }, save));
  if (!isOwner) box.append(h('p', { class: 'muted small' }, t('cast.owner_only')));
  return box;
}

function recipeTab(d) {
  const r = d.data;
  if (!r || typeof r !== 'object') return emptyState(t('cast.r.empty'));
  const p = r.persona && typeof r.persona === 'object' ? r.persona : null;
  const rows = [];
  const row = (k, v) => { if (v != null && v !== '') rows.push(h('dt', { class: 'micro' }, t('cast.r.' + k)), h('dd', null, v)); };
  row('role', toText(r.role || d.member.role_label || ''));
  if (p) row('persona', h('span', { class: 'mono small' }, [p.role, p.energy, p.temperament, p.laugh, p.tic].filter(Boolean).map(toText).join(' · ')));
  else if (typeof r.persona === 'string') row('persona', toText(r.persona));
  if (r.catchphrase) row('catchphrase', '“' + toText(r.catchphrase.vi || r.catchphrase) + '”');
  if (r.running_gag && r.running_gag.text) row('gag', toText(r.running_gag.text));
  if (r.dynamic && r.dynamic.type) row('dynamic', h('span', { class: 'mono small' }, toText(r.dynamic.type) + (r.dynamic.with ? ' · ' + toText(r.dynamic.with) : '')));
  const pal = r.look && r.look.palette && typeof r.look.palette === 'object' ? r.look.palette : null;
  if (pal) row('palette', h('span', { class: 'swatches' }, Object.entries(pal).map(([k, v]) => {
    const hex = /^#[0-9a-fA-F]{3,8}$/.test(String(v)) ? String(v) : null;
    return h('span', { class: 'sw-chip', title: k + ' ' + toText(v) }, h('i', { style: hex ? { background: hex } : null, class: hex ? '' : 'ref' }), h('span', { class: 'mono small' }, k));
  })));
  const must = r.identity && Array.isArray(r.identity.must) ? r.identity.must : [];
  if (must.length) row('identity', h('span', { class: 'scr-ids' }, must.map((x) => h('span', { class: 'mono chip' }, toText(x)))));
  return h('div', null, h('dl', { class: 'fields' }, rows),
    h('details', { class: 'detail' }, h('summary', null, t('cast.r.raw')), h('pre', { class: 'mono' }, JSON.stringify(r, null, 2))));
}

function versionsTab(d) {
  const vs = d.versions || [];
  if (!vs.length) return emptyState(t('lesson.no_versions'));
  return h('div', { class: 'sub-grid' }, vs.map((v) => h('div', { class: 'sub-row' },
    h('span', { class: 'mono id' }, 'v' + toText(v.version)),
    v.version === d.member.approved_version ? badge(t('cast.ver.approved'), 'ok') : v.version === d.member.current_version ? badge(t('cast.ver.current'), 'info') : null,
    h('span', { class: 'say' }, toText(v.note || '')), h('span', { class: 'muted small mono' }, fmtDateTime(v.created_at)))));
}

function approveDialog(m, onDone) {
  const err = h('div');
  const body = h('div', null, h('p', null, t('cast.approve_body', { v: m.current_version })), err);
  openDialog(t('cast.approve_title', { name: toText(m.name), v: m.current_version }), body, (close) => [
    h('button', { type: 'button', class: 'btn', onclick: close }, t('common.cancel')),
    h('button', { type: 'button', class: 'btn primary', onclick: async (e) => {
      const b = e.currentTarget; b.disabled = true; clear(err);
      try {
        await post('/api/cast/' + encodeURIComponent(m.display_id) + '/approve', { version: m.current_version });
        close(); toast(t('cast.approved_done', { name: toText(m.name), v: m.current_version }), 'ok'); onDone();
      } catch (ex) { err.append(opError(ex)); b.disabled = false; }
    } }, t('cast.approve', { v: m.current_version })),
  ]);
}

function detailPanel(id, ctx, onChanged) {
  const box = h('div', { class: 'cast-detail' });
  const isOwner = !!(ctx.me && ctx.me.user && ctx.me.user.role === 'owner');
  let d = null; let tab = 'sheet'; let alive = true;
  const state = {};
  const head = h('div'); const tabsEl = h('div', { class: 'tabs small', role: 'tablist' }); const body = h('div', { class: 'tab-body' });
  box.append(head, tabsEl, body);
  function draw() {
    clear(head); clear(tabsEl); clear(body);
    const m = d.member, st = m.status, v = d.validation || { ok: false, errors: [], warnings: [] };
    const ch = m.channel ? toText(m.channel.name || m.channel.display_id) : '—';
    head.append(h('div', { class: 'cast-head' },
      h('div', { class: 'cast-name' }, h('span', null, toText(m.name)), h('span', { class: 'mono muted small' }, toText(m.display_id))),
      h('div', { class: 'cast-line' }, statusBadge(st), h('span', { class: 'muted small' }, t('cast.meta', { cur: m.current_version, ch }))),
      h('p', { class: 'small cast-note' }, t('cast.note.' + st, { cur: m.current_version, ap: toText(m.approved_version) }))));
    // kiểm công thức (validateRecipe phía server, chế độ chặt như lúc chốt)
    if (st !== 'retired') {
      if (v.ok) head.append(h('p', { class: 'small tone-ok cast-valid' }, icon('check'), t('cast.valid_ok', { mode: toText(v.mode) || 'v2' }), v.warnings.length ? h('span', { class: 'tone-warn' }, ' · ' + t('cast.valid_warn', { n: v.warnings.length })) : null));
      else head.append(h('div', { class: 'banner danger cast-bad', role: 'alert' }, h('div', { class: 'banner-main' }, icon('warn'), h('span', null, t('cast.valid_bad', { n: v.errors.length }))), issueList(v.errors, 'danger')));
      if (v.warnings.length) head.append(h('details', { class: 'detail' }, h('summary', null, t('cast.valid_warn', { n: v.warnings.length })), issueList(v.warnings, 'warn')));
    }
    // hành động (chỉ owner; lý do luôn hiện khi tắt)
    const canApprove = isOwner && st !== 'retired' && v.ok && !(st === 'approved');
    const acts = h('div', { class: 'cast-acts' },
      st !== 'retired' && st !== 'approved' ? h('button', { type: 'button', class: 'btn primary', disabled: !canApprove, onclick: () => approveDialog(m, () => { load(); onChanged(); }) }, icon('check'), t('cast.approve', { v: m.current_version })) : null,
      st !== 'retired' && isOwner ? confirmButton(t('cast.retire'), t('cast.retire_confirm'), async () => {
        try { await post('/api/cast/' + encodeURIComponent(m.display_id) + '/retire', {}); toast(t('cast.retired_done', { name: toText(m.name) }), 'ok'); load(); onChanged(); }
        catch (e) { toast((e && e.text_human) || t('err.generic'), 'danger'); }
      }) : null);
    head.append(acts);
    if (!isOwner) head.append(h('p', { class: 'muted small' }, t('cast.owner_only')));
    else if (st !== 'retired' && st !== 'approved' && !v.ok) head.append(h('p', { class: 'muted small' }, t('cast.cannot_approve')));
    for (const k of TABS) tabsEl.append(h('button', { type: 'button', role: 'tab', 'aria-selected': tab === k ? 'true' : 'false', class: 'tab' + (tab === k ? ' active' : ''), onclick: () => { tab = k; draw(); } }, t('cast.tab.' + k)));
    body.append(tab === 'sheet' ? sheetTab(m, state) : tab === 'voice' ? voiceTab(d, () => { load(); onChanged(); }, isOwner) : tab === 'recipe' ? recipeTab(d) : versionsTab(d));
  }
  async function load() {
    if (!d) { clear(body); body.append(skeleton(5)); }
    try { const x = await get('/api/cast/' + encodeURIComponent(id)); if (!alive) return; d = x; draw(); }
    catch (e) { if (!alive) return; clear(head); clear(body); body.append(errorBanner(e, load)); }
  }
  load();
  return { el: box, destroy: () => { alive = false; }, reload: load };
}

export function mount(container, ctx) {
  let chan = '';
  const q0 = initialQuery(ctx, {});
  const m0 = /(?:^|\s)channel:(\S+)/.exec(q0); if (m0) chan = m0[1];
  const inspector = h('aside', { class: 'inspector cast-insp', 'aria-label': t('insp.title') });
  const placeholder = () => { clear(inspector); inspector.append(h('div', { class: 'insp-empty muted' }, t('insp.pick'))); };
  placeholder();
  let detail = null; let currentId = null; let grid = null;
  const show = (row) => {
    const id = toText(row.display_id || row.id);
    if (id === currentId) return;
    currentId = id; if (detail) detail.destroy();
    clear(inspector); detail = detailPanel(id, ctx, () => grid && grid.reload());
    inspector.append(h('div', { class: 'insp-head micro' }, t('insp.title')), detail.el);
  };
  const select = h('select', { class: 'input cast-chan', 'aria-label': t('cast.channel_filter') }, h('option', { value: '' }, t('cast.all_channels')));
  const gridHost = h('div', { class: 'cast-grid-host' });
  function buildGrid() {
    if (grid) grid.destroy();
    clear(gridHost);
    const rest = q0.replace(/(?:^|\s)channel:\S+/, '').trim();
    grid = createDataGrid({ name: 'cast', q: [chan ? 'channel:' + chan : '', rest].filter(Boolean).join(' '), selectedId: ctx.route.id, onSelect: show, emptyText: t('cast.empty') });
    gridHost.append(grid.el);
  }
  select.addEventListener('change', () => { chan = select.value; buildGrid(); });
  get('/api/grid/channels').then((res) => {
    for (const r of (res && res.rows) || []) select.append(h('option', { value: toText(r.display_id) }, toText(r.name) + ' · ' + toText(r.display_id)));
    select.value = chan;
  }).catch(() => { /* bộ lọc kênh là phần phụ */ });
  buildGrid();
  container.append(pageHeader(t('nav.cast'), t('cast.desc'), [select]), h('div', { class: 'work' }, gridHost, inspector));
  const off = onDebounced('change', () => { if (grid) grid.reload(); if (detail) detail.reload(); });
  return () => { off(); if (grid) grid.destroy(); if (detail) detail.destroy(); };
}
