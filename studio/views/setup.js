// © 2026 Gen Labs — All rights reserved.
// Thiết lập lần đầu (#/setup?k=…): chủ xưởng → khoá giọng + quét → agent token → kênh.
import { h, clear, icon, copyText } from '../components/dom.js';
import { t } from '../i18n.js';
import { post, get } from '../components/api.js';
import { errorBanner } from '../components/states.js';
import { field } from '../components/dialog.js';
import { tokenResult } from './lists.js';
import { toText, statusTone } from '../components/util.js';
import { badge } from '../components/states.js';

const STEPS = ['owner', 'provider', 'agent', 'channel'];

export function mount(container, ctx) {
  const key = ctx.route.query.k || '';
  let step = ctx.me ? 1 : 0; // đã có phiên (vd tải lại trang) thì sang bước 2
  const stepper = h('ol', { class: 'stepper' });
  const panel = h('div', { class: 'step-panel' });
  container.append(h('div', { class: 'theater-page setup' },
    h('aside', { class: 'setup-side' }, h('div', { class: 'brand-name' }, t('brand.name')), stepper),
    h('div', { class: 'setup-main' }, h('h1', { class: 'display' }, t('setup.welcome')), panel)));

  const input = (type, id, extra) => h('input', { type, id, class: 'input', autocomplete: 'off', ...(extra || {}) });
  const inField = (label, el) => field(label, el);

  function drawStepper() {
    clear(stepper);
    STEPS.forEach((s, i) => stepper.append(h('li', { class: i === step ? 'active' : i < step ? 'done' : '' },
      h('span', { class: 'mono' }, String(i + 1)), t('setup.step.' + s))));
  }
  function next() { step += 1; if (step >= STEPS.length) { location.hash = '#/overview'; return; } draw(); }
  const skipBtn = () => h('button', { type: 'button', class: 'btn', onclick: next }, t('setup.skip'));

  function formShell(title, hint, fields, onSubmit, submitLabel, extra) {
    const msg = h('div');
    const submit = h('button', { type: 'submit', class: 'btn primary' }, submitLabel);
    return h('form', { class: 'step-form', onsubmit: async (e) => {
      e.preventDefault(); submit.disabled = true; clear(msg);
      try { await onSubmit(msg); } catch (ex) { msg.append(errorBanner(ex)); }
      submit.disabled = false;
    } }, h('h2', null, title), h('p', { class: 'muted' }, hint), fields, msg, h('div', { class: 'row' }, submit, extra || null));
  }

  function ownerStep() {
    const name = input('text', 'su-name'); const user = input('text', 'su-user'); const pw = input('password', 'su-pw', { minlength: '12', autocomplete: 'new-password' });
    const lang = h('select', { class: 'input' }, h('option', { value: 'vi' }, 'Tiếng Việt'), h('option', { value: 'en' }, 'English'));
    lang.value = ctx.lang();
    if (!key) panel.append(h('div', { class: 'banner warn' }, icon('warn'), h('span', null, t('setup.no_key'))));
    return formShell(t('setup.owner.title'), t('setup.owner.hint'),
      [inField(t('setup.owner.display'), name), inField(t('auth.username'), user), inField(t('setup.owner.password'), pw), inField(t('setup.owner.lang'), lang)],
      async () => {
        await post('/api/setup/owner?k=' + encodeURIComponent(key), { display_name: name.value.trim(), username: user.value.trim(), password: pw.value, lang: lang.value });
        ctx.setLang(lang.value);
        await ctx.refreshMe();
        next();
      }, t('common.next'));
  }

  function providerStep() {
    const k = input('password', 'su-key', { autocomplete: 'new-password' });
    const result = h('div', { class: 'scan' });
    return formShell(t('setup.provider.title'), t('setup.provider.hint'), [inField(t('prov.key'), k), result],
      async () => {
        clear(result);
        const saved = await post('/api/providers', { vendor: 'gemini', kind: 'tts', key: k.value.trim() });
        k.value = '';
        result.append(h('div', { class: 'muted mono' }, t('setup.provider.saved')));
        const id = saved && (saved.display_id || saved.id || (saved.provider && (saved.provider.display_id || saved.provider.id)));
        if (id) {
          const scan = await post('/api/providers/' + encodeURIComponent(id) + '/scan', {});
          const models = (scan && (scan.models || (scan.result && scan.result.models))) || [];
          if (models.length) {
            result.append(h('div', { class: 'sub-grid' }, models.map((m) => h('div', { class: 'sub-row' },
              h('span', { class: 'mono' }, toText(m.model)), badge(m.available ? t('prov.ready') : t('prov.unavailable'), m.available ? 'ok' : 'idle'),
              h('span', { class: 'muted mono' }, m.quota && m.quota.value != null ? toText(m.quota.value) + ' · ' + toText(m.quota.source) : t('prov.quota_unknown'))))));
          }
        }
        result.append(h('button', { type: 'button', class: 'btn primary', onclick: next }, t('common.next')));
      }, t('prov.save_scan'), skipBtn());
  }

  function agentStep() {
    const name = input('text', 'su-agent'); name.value = 'Claude Code';
    const out = h('div');
    return formShell(t('setup.agent.title'), t('setup.agent.hint'), [inField(t('agent.name'), name), out],
      async () => {
        const res = await post('/api/agents', { name: name.value.trim(), scopes: ['read', 'compose', 'run'] });
        clear(out); out.append(tokenResult(res), h('button', { type: 'button', class: 'btn primary', onclick: next }, t('common.next')));
      }, t('agent.issue'), skipBtn());
  }

  function channelStep() {
    const name = input('text', 'su-ch'); const sched = input('text', 'su-sched'); sched.value = '06:00';
    return formShell(t('setup.channel.title'), t('setup.channel.hint'), [inField(t('ch.name'), name), inField(t('ch.schedule'), sched)],
      async () => {
        await post('/api/channels', { name: name.value.trim(), lang: ctx.lang(), term_lang: 'en', schedule: { time: sched.value.trim(), per_run: 1 } });
        next();
      }, t('setup.enter'), skipBtn());
  }

  function draw() {
    drawStepper(); clear(panel);
    panel.append([ownerStep, providerStep, agentStep, channelStep][step]());
  }
  draw();
  return () => {};
}
