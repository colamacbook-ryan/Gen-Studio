// © 2026 Gen Labs — All rights reserved.
// A4 Phiếu & Muse (gói D, 0.3.0): token của agent Muse (assets.submit) / Gen (assets.review) qua agent_token.* có sẵn
// (POST /api/agents, POST /api/agents/:id/revoke — server/api.js), và ô đang bị giữ (claim) từ GET /api/kit/overview.
import { h, clear, icon, toast, confirmButton } from '../components/dom.js';
import { t } from '../i18n.js';
import { get, post } from '../components/api.js';
import { gridView, fieldList } from './grid-view.js';
import { tokenResult } from './lists.js';
import { openDialog, field } from '../components/dialog.js';
import { errorBanner, skeleton } from '../components/states.js';
import { buildHash } from '../components/util.js';
import { fmtDateTime } from '../components/datagrid.js';

const input = (ph) => h('input', { type: 'text', class: 'input', placeholder: ph || '', autocomplete: 'off' });

function newMuseToken(onDone) {
  const name = input('Muse');
  const submitCb = h('input', { type: 'checkbox', checked: true });
  const reviewCb = h('input', { type: 'checkbox' });
  const err = h('div');
  const body = h('div', { class: 'form' },
    field(t('agent.name'), name),
    h('div', { class: 'checks' },
      h('label', { class: 'check' }, submitCb, h('span', null, t('tok.scope.submit'))),
      h('label', { class: 'check' }, reviewCb, h('span', null, t('tok.scope.review')))),
    h('p', { class: 'muted small' }, t('tok.scope_hint')), err);
  openDialog(t('tok.new'), body, (close) => [
    h('button', { type: 'button', class: 'btn', onclick: close }, t('common.cancel')),
    h('button', {
      type: 'button', class: 'btn primary', onclick: async (e) => {
        const b = e.currentTarget; b.disabled = true; clear(err);
        const scopes = [...(submitCb.checked ? ['assets.submit'] : []), ...(reviewCb.checked ? ['assets.review'] : [])];
        try {
          const res = await post('/api/agents', { name: name.value.trim(), scopes });
          clear(body); body.append(tokenResult(res)); e.currentTarget.remove();
          if (onDone) onDone(res);
        } catch (ex) { err.append(errorBanner(ex)); b.disabled = false; }
      },
    }, t('agent.issue')),
  ]);
}

function claimsPanel(container) {
  const box = h('section', { class: 'kho-claims pad' }, h('h2', null, t('tok.claims')), skeleton(2));
  container.append(box);
  get('/api/kit/overview').then((res) => {
    clear(box);
    const claims = res.claims || [];
    box.append(h('h2', null, t('tok.claims')),
      claims.length ? h('ul', null, claims.map((c) => h('li', null, h('a', { href: buildHash('kho-slot', c.kit_slot), class: 'mono' }, c.kit_slot), ' — ', c.claimed_by, ' · ', fmtDateTime(c.claim_expires_at))))
        : h('p', { class: 'muted' }, t('tok.claims_empty')),
      h('p', { class: 'muted small' }, t('tok.released_hint')));
  }, (e) => { clear(box); box.append(errorBanner(e)); });
}

export const mount = (container, ctx) => {
  const off = gridView({
    grid: 'agents', title: 'tok.title', desc: 'tok.desc', empty: 'agent.empty', q: 'scopes:assets.',
    headerActions: (c, reload) => [h('button', { type: 'button', class: 'btn primary', onclick: () => newMuseToken(() => reload()) }, icon('plug'), t('tok.new'))],
    inspector: (row, c, reload, cols) => h('div', null, fieldList(row, cols),
      row.status === 'revoked' ? null : confirmButton(t('agent.revoke'), t('common.confirm_again'), async () => {
        try { await post('/api/agents/' + encodeURIComponent(row.display_id) + '/revoke', {}); toast(t('agent.revoked'), 'ok'); reload(); } catch (e) { toast(e.text_human || e.detail, 'danger'); }
      })),
  })(container, ctx);
  claimsPanel(container);
  return off;
};
