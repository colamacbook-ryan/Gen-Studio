// © 2026 Gen Labs — All rights reserved.
// UI-L5R3 — tab "Định dạng" của Kênh (SPEC-0.2.0-F7 §10.5): tỉ lệ mặc định (`default_aspect`), lịch trộn tỉ lệ (`schedule.mix`, Σn = per_run ≤ 20),
// bảng preset nền tảng có nguồn + nhãn "cần kiểm lại" (verified:false). Gắn vào Kênh qua móc channel-tabs của lists.js — hợp đồng: export tab(env).
// Chỉ chủ xưởng (phiên UI) đổi được (POLICY_FIELDS); người khác xem chỉ đọc. Lưu = POST /api/channels {channel, data:{default_aspect, schedule}} ⇒ version kênh mới.
import { h, clear, append, toast } from '../../components/dom.js';
import { t } from '../../i18n.js';
import { errorBanner } from '../../components/states.js';
import { toText } from '../../components/util.js';
import { loadAspects, aspectPicker, aspectBadge, aspectFrame, safeOverlay, enabledAspects, presetsFor, presetLabel, fmtSeconds, mixModel, aspectDef, defaultAspect } from '../../components/aspect.js';

export const MAX_PER_RUN = 20;

// Trạng thái ban đầu của form từ dữ liệu kênh (thuần — test e-ui-l5r3)
export function formatState(data, catalog) {
  const d = data && typeof data === 'object' ? data : {};
  const sc = d.schedule && typeof d.schedule === 'object' ? d.schedule : {};
  const per = Number.isInteger(Number(sc.per_run)) && Number(sc.per_run) > 0 ? Math.min(Number(sc.per_run), MAX_PER_RUN) : 1;
  const ids = enabledAspects(catalog).map((a) => a.id);
  const counts = {};
  ids.forEach((id) => { counts[id] = 0; });
  const mix = Array.isArray(sc.mix) ? sc.mix.filter((m) => m && typeof m.aspect === 'string') : [];
  mix.forEach((m) => { counts[m.aspect] = Math.max(0, Math.floor(Number(m.n) || 0)); });
  const def = d.default_aspect || d.aspect || defaultAspect(catalog);
  if (!mix.length) counts[ids.includes(def) ? def : ids[0]] = per;
  return { default_aspect: def, per_run: per, mixOn: mix.length > 0, counts, time: scheduleTime(sc) };
}

// Giờ chạy lịch "HH:MM" từ {time} hoặc cron "M H * * *" (cùng luật scheduler.parseSchedule); không đọc được ⇒ ''
export function scheduleTime(sc) {
  const txt = toText(sc && (sc.time || sc.cron) || '');
  const c5 = /^\s*(\d{1,2})\s+(\d{1,2})\s+\*\s+\*\s+\*\s*$/.exec(txt);
  const m = c5 ? [null, c5[2], c5[1]] : /(\d{1,2}):(\d{2})/.exec(txt);
  if (!m || +m[1] > 23 || +m[2] > 59) return '';
  return String(+m[1]).padStart(2, '0') + ':' + String(+m[2]).padStart(2, '0');
}

// Bản vá gửi lên (thuần): mix tắt ⇒ bỏ khoá mix khỏi schedule; giữ mọi khoá schedule khác (time, cron…)
export function formatPatch(state, prevSchedule, order) {
  const schedule = Object.assign({}, prevSchedule && typeof prevSchedule === 'object' ? prevSchedule : {});
  schedule.per_run = state.per_run;
  delete schedule.mix;
  if (state.mixOn) schedule.mix = mixModel(state.counts, state.per_run, order).mix;
  return { default_aspect: state.default_aspect, schedule };
}

// Câu tóm tắt: "1 bài 16:9 + 1 bài 9:16"
export function mixSentence(mix) { return mix.map((m) => t('fmt.n_of', { n: m.n, a: m.aspect })).join(' + '); }

function presetTable(catalog) {
  const head = ['fmt.col.platform', 'fmt.col.aspect', 'fmt.col.max', 'fmt.col.cover', 'fmt.col.source', 'fmt.col.status'];
  const grid = h('div', { class: 'fmt-table', role: 'table', 'aria-label': t('fmt.presets') },
    h('div', { class: 'fmt-tr fmt-th', role: 'row' }, head.map((k) => h('span', { role: 'columnheader' }, t(k)))));
  for (const a of enabledAspects(catalog)) {
    for (const p of presetsFor(catalog, a.id)) {
      const src = p.source_url && /^https:\/\//.test(p.source_url) ? h('a', { href: p.source_url, target: '_blank', rel: 'noopener noreferrer' }, toText(p.source || p.source_url)) : h('span', { class: 'muted' }, toText(p.source) || '—');
      const status = p.verified === false ? h('span', { class: 'ar-unverified' }, t('aspect.unverified'))
        : p.verified === true ? h('span', { class: 'muted small' }, t('aspect.verified', { d: toText(p.checked) })) : h('span', { class: 'muted' }, '—');
      grid.append(h('div', { class: 'fmt-tr', role: 'row' },
        h('span', { role: 'cell' }, presetLabel(p.id)),
        h('span', { role: 'cell' }, aspectBadge(a.id)),
        p.max_s == null ? h('span', { role: 'cell', class: 'muted' }, t('aspect.no_limit')) : h('span', { role: 'cell', class: 'mono' }, fmtSeconds(p.max_s)),
        h('span', { role: 'cell', class: 'mono small' }, toText(p.cover) || '—'),
        h('span', { role: 'cell' }, src),
        h('span', { role: 'cell' }, status)));
    }
  }
  return grid;
}

function previews(catalog, current) {
  const box = h('div', { class: 'fmt-previews' });
  let show = true;
  const frames = h('div', { class: 'fmt-frames' });
  const draw = () => {
    clear(frames);
    for (const a of enabledAspects(catalog)) {
      const def = aspectDef(catalog, a.id);
      const frame = aspectFrame(a.id, show && def && def.safe ? safeOverlay(def, { tier: 'both' }) : null, { long: 132, label: a.id });
      frames.append(h('figure', { class: 'fmt-frame' + (a.id === current() ? ' on' : '') }, frame,
        h('figcaption', null, aspectBadge(a.id), def && Array.isArray(def.size) ? h('span', { class: 'mono muted small' }, def.size[0] + '×' + def.size[1]) : null,
          def && Array.isArray(def.target_s) ? h('span', { class: 'muted small' }, t('aspect.target', { a: def.target_s[0], b: def.target_s[1] })) : null)));
    }
  };
  const toggle = h('label', { class: 'check small' }, h('input', { type: 'checkbox', checked: true, onchange: (e) => { show = e.target.checked; draw(); } }), h('span', null, t('aspect.safe_overlay')));
  draw();
  box.append(h('div', { class: 'fmt-sec-head' }, h('h3', null, t('fmt.preview')), toggle), frames,
    h('p', { class: 'muted small fmt-legend' }, h('i', { class: 'fmt-key hard', 'aria-hidden': 'true' }), t('aspect.safe.hard'), h('i', { class: 'fmt-key soft', 'aria-hidden': 'true' }), t('aspect.safe.soft')));
  box.redraw = draw;
  return box;
}

// Hợp đồng móc channel-tabs (lists.js): tab(env) → {key, label, order, mount(host) → cleanup?}
export function tab(env) {
  return {
    key: 'format', label: t('fmt.tab'), order: 10,
    mount(host) {
      let alive = true;
      host.append(h('div', { class: 'fmt-loading muted' }, t('state.loading')));
      loadAspects().then((catalog) => {
        if (!alive) return;
        clear(host);
        const ch = env.channel || {};
        const prevSchedule = ch.data && ch.data.schedule;
        const st = formatState(ch.data, catalog);
        const order = enabledAspects(catalog).map((a) => a.id);
        const ro = !env.isOwner;
        const err = h('div');
        const saveBtn = h('button', { type: 'button', class: 'btn primary', disabled: true }, t('fmt.save'));
        const status = h('span', { class: 'muted small fmt-status', role: 'status' });

        // — tỉ lệ mặc định
        const picker = aspectPicker({ aspects: catalog, value: st.default_aspect, name: 'fmt-def-' + toText(ch.display_id), disabled: ro,
          onChange: (v) => { st.default_aspect = v; if (!st.mixOn) { order.forEach((id) => { st.counts[id] = id === v ? st.per_run : 0; }); } refresh(); prev.redraw(); } });

        // — lịch trộn
        const perIn = h('input', { type: 'number', class: 'input fmt-num mono', min: 1, max: MAX_PER_RUN, value: st.per_run, disabled: ro, 'aria-label': t('fmt.per_run'),
          oninput: () => { st.per_run = Math.max(1, Math.min(MAX_PER_RUN, Math.floor(Number(perIn.value) || 1))); if (!st.mixOn) st.counts[st.default_aspect] = st.per_run; refresh(); } });
        const mixOn = h('input', { type: 'checkbox', checked: st.mixOn, disabled: ro || order.length < 2,
          onchange: () => { st.mixOn = mixOn.checked; if (!st.mixOn) order.forEach((id) => { st.counts[id] = id === st.default_aspect ? st.per_run : 0; }); refresh(); } });
        const counts = h('div', { class: 'fmt-counts' });
        const sumLine = h('p', { class: 'fmt-sum small' });
        const summary = h('p', { class: 'fmt-summary' });
        const countInputs = order.map((id) => {
          const inp = h('input', { type: 'number', class: 'input fmt-num mono', min: 0, max: MAX_PER_RUN, value: st.counts[id] || 0, disabled: ro, 'aria-label': t('fmt.count_for', { a: id }),
            oninput: () => { st.counts[id] = Math.max(0, Math.min(MAX_PER_RUN, Math.floor(Number(inp.value) || 0))); refresh(); } });
          counts.append(h('label', { class: 'fmt-count' }, aspectBadge(id), inp, h('span', { class: 'muted small' }, t('fmt.lessons'))));
          return [id, inp];
        });

        function valid() { const m = mixModel(st.counts, st.per_run, order); return !st.mixOn || (m.ok && m.mix.length > 0); }
        function refresh() {
          const m = mixModel(st.counts, st.per_run, order);
          counts.hidden = !st.mixOn;
          for (const [id, inp] of countInputs) if (document.activeElement !== inp) inp.value = String(st.counts[id] || 0);
          if (document.activeElement !== perIn) perIn.value = String(st.per_run);
          clear(sumLine);
          if (st.mixOn) {
            sumLine.className = 'fmt-sum small ' + (m.ok ? 'ok' : 'bad');
            sumLine.append(h('span', { class: 'mono' }, m.sum + '/' + st.per_run), ' · ', m.ok ? t('fmt.sum_ok') : t('aspect.mix_sum', { n: st.per_run }));
          }
          const plan = st.mixOn ? m.mix : [{ aspect: st.default_aspect, n: st.per_run }];
          clear(summary);
          summary.append(h('span', { class: 'muted' }, st.time ? t('fmt.each_run_at', { time: st.time }) : t('aspect.mix') + ':'), ' ', h('strong', null, mixSentence(plan)));
          const dirty = JSON.stringify(formatPatch(st, prevSchedule, order)) !== JSON.stringify(formatPatch(formatState(ch.data, catalog), prevSchedule, order));
          saveBtn.disabled = ro || !dirty || !valid();
          status.textContent = ro ? t('fmt.owner_only') : dirty ? t('fmt.unsaved') : '';
        }
        saveBtn.addEventListener('click', async () => {
          if (!valid()) return;
          saveBtn.disabled = true; clear(err);
          try {
            await env.save(formatPatch(st, prevSchedule, order), t('fmt.note'));
            toast(t('fmt.saved'), 'ok');
          } catch (e) { err.append(errorBanner(e)); saveBtn.disabled = false; }
        });

        const prev = previews(catalog, () => st.default_aspect);
        const left = h('section', { class: 'fmt-sec' },
          h('div', { class: 'fmt-sec-head' }, h('h3', null, t('fmt.default')), h('span', { class: 'muted small' }, t('fmt.default_hint'))),
          picker,
          h('div', { class: 'fmt-sec-head sp' }, h('h3', null, t('aspect.mix')), h('span', { class: 'muted small' }, t('fmt.mix_hint'))),
          h('div', { class: 'fmt-mix' },
            h('label', { class: 'fmt-count' }, h('span', null, t('fmt.per_run')), perIn),
            h('label', { class: 'check' }, mixOn, h('span', null, t('fmt.mix_on')))),
          counts, sumLine, summary);
        const right = h('section', { class: 'fmt-sec' }, prev);
        append(host, [h('div', { class: 'fmt' },
          h('div', { class: 'fmt-cols' }, left, right),
          h('section', { class: 'fmt-sec' }, h('div', { class: 'fmt-sec-head' }, h('h3', null, t('fmt.presets')), h('span', { class: 'muted small' }, t('fmt.presets_hint'))), presetTable(catalog)),
          err,
          h('div', { class: 'fmt-actions' }, status, saveBtn))]);
        refresh();
      }, (e) => { if (!alive) return; clear(host); host.append(errorBanner({ code: e && e.code, text_human: t('aspect.err_load'), detail: e && (e.detail || e.message), status: e && e.status }, () => { clear(host); tab(env).mount(host); })); });
      return () => { alive = false; };
    },
  };
}
