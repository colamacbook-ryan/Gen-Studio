// © 2026 Gen Labs — All rights reserved.
// A2 Hàng chờ duyệt (gói D, 0.3.0, nhóm «Sản xuất»): Data Console (lọc/sắp xếp qua lưới `kit_submissions`),
// Inspector tab Tệp/Kiểm máy/Lịch sử, hành động Duyệt/Trả làm lại/Bỏ/Miễn tiêu chí/tick M*/H + Xác nhận ô.
import { h, clear, toast, icon } from '../components/dom.js';
import { t, tOr } from '../i18n.js';
import { get, post } from '../components/api.js';
import { gridView } from './grid-view.js';
import { openDialog, field } from '../components/dialog.js';
import { errorBanner, badge, skeleton } from '../components/states.js';
import { statusTone, buildHash, toText } from '../components/util.js';
import { fmtDateTime } from '../components/datagrid.js';

const btn = (label, onclick, cls = 'btn', ic) => h('button', { type: 'button', class: cls, onclick }, ic ? icon(ic) : null, label);
const idOf = (row) => toText(row.display_id || row.id);

function tabs(active) {
  const tab = (key, q) => h('a', { class: 'tab' + (active === key ? ' active' : ''), href: '#/kho-queue?q=' + encodeURIComponent(q) }, t('queue.tab.' + key));
  return h('div', { class: 'tabs', role: 'tablist' },
    tab('pending', 'state:submitted'), tab('auto_rework', 'state:rework decision_kind:auto'), tab('blocked', 'state:blocked'),
    tab('approved', 'state:approved'), tab('rejected', 'state:rejected'), tab('all', ''));
}

function reasonDialog(title, label, onOk) {
  const ta = h('textarea', { class: 'input', rows: 3, maxlength: 500 });
  const err = h('div');
  openDialog(title, h('div', { class: 'form' }, field(label, ta), err), (close) => [
    btn(t('common.cancel'), close),
    btn(t('common.save'), async (e) => {
      const b = e.currentTarget; b.disabled = true; clear(err);
      try { await onOk(ta.value.trim()); close(); } catch (ex) { err.append(errorBanner(ex)); b.disabled = false; }
    }, 'btn primary'),
  ]);
}

function checksTable(checks, onWaive) {
  if (!checks || !checks.length) return h('p', { class: 'muted small' }, t('queue.no_checks'));
  return h('table', { class: 'simple-table checks-table' },
    h('thead', null, h('tr', null, [t('queue.criterion'), t('queue.severity'), t('queue.level'), t('queue.measured'), ''].map((x) => h('th', null, x)))),
    h('tbody', null, checks.map((c) => h('tr', null,
      h('td', { class: 'mono' }, c.criterion), h('td', { class: 'mono small' }, c.severity || '—'),
      h('td', null, badge(tOr('queue.lv.' + c.level, c.level), statusTone(c.level))),
      h('td', { class: 'muted small' }, c.measured || c.detail || '—'),
      h('td', null, c.level === 'fail' || c.level === 'warn' ? btn(t('queue.waive'), () => onWaive(c), 'btn small') : null)))));
}

function historyTable(history) {
  if (!history || !history.length) return h('p', { class: 'muted small' }, t('slot.history_empty'));
  return h('table', { class: 'simple-table' },
    h('thead', null, h('tr', null, ['ID', t('queue.attempt').replace(' {n}', ''), '', ''].map((x) => h('th', null, x)))),
    h('tbody', null, history.map((hrow) => h('tr', null,
      h('td', { class: 'mono' }, hrow.display_id), h('td', null, badge(tOr('st.' + hrow.state, hrow.state), statusTone(hrow.state))),
      h('td', { class: 'muted small' }, hrow.decision_reason || ''), h('td', { class: 'muted small' }, fmtDateTime(hrow.created_at))))));
}

function certifySection(sub, slotCode, required, reload) {
  if (!slotCode) return null;
  const ticks = new Map((required.mh || []).map((c) => [c, h('input', { type: 'checkbox' })]));
  const box = h('section', { class: 'certify-box' }, h('div', { class: 'micro' }, t('queue.certify_section')),
    h('p', { class: 'muted small' }, t('queue.certify_hint')),
    [...ticks.entries()].map(([code, cb]) => h('label', { class: 'check' }, cb, h('span', { class: 'mono small' }, code))));
  const err = h('div');
  box.append(err, btn(t('queue.certify_do'), async (e) => {
    const b = e.currentTarget; b.disabled = true; clear(err);
    const h_ticks = [...ticks.entries()].filter(([, cb]) => cb.checked).map(([code]) => code);
    try {
      await post('/api/kit/certify', { asset: sub.asset ? sub.asset.display_id : undefined, kit_slot: slotCode, h_ticks, submission: sub.submission.display_id });
      toast(t('queue.certify_ok'), 'ok'); reload();
    } catch (ex) { err.append(errorBanner(ex)); }
    b.disabled = false;
  }, 'btn primary'));
  return box;
}

function inspectorBody(row, ctx, reload) {
  const box = h('div', { class: 'kq-inspector' }, skeleton(5));
  const id = idOf(row);
  get('/api/kit/submission/' + encodeURIComponent(id)).then((res) => {
    clear(box);
    const sub = res.submission;
    const head = h('div', { class: 'insp-head2' },
      badge(tOr('st.' + sub.state, sub.state), statusTone(sub.state)),
      sub.kit_slot ? h('a', { href: buildHash('kho-slot', sub.kit_slot), class: 'mono' }, sub.kit_slot) : null,
      h('span', { class: 'muted small' }, t('queue.attempt', { n: sub.attempt })));
    const decided = sub.decision_kind ? h('p', { class: 'muted small' }, t('queue.decided_by', { who: sub.decided_actor || sub.decision_kind, kind: sub.decision_kind })) : null;
    const fileBox = h('div', { class: 'kq-file' },
      res.asset ? h('div', null, h('span', { class: 'mono small' }, res.asset.display_id + ' · ' + res.asset.mime), ' ',
        h('a', { href: res.asset.url, target: '_blank', rel: 'noopener', class: 'btn small' }, t('queue.open_file')),
        /^audio\//.test(res.asset.mime || '') ? h('audio', { controls: true, src: res.asset.url, style: { display: 'block', marginTop: '6px', width: '100%' } }) : null,
        /^image\//.test(res.asset.mime || '') ? h('img', { src: res.asset.url, style: { maxWidth: '100%', marginTop: '6px', borderRadius: '6px' } }) : null,
        /^video\//.test(res.asset.mime || '') ? h('video', { controls: true, src: res.asset.url, style: { display: 'block', marginTop: '6px', maxWidth: '100%' } }) : null)
        : h('p', { class: 'muted small' }, '—'));
    const onWaive = (c) => reasonDialog(t('queue.waive'), t('queue.waive_reason'), async (reason) => {
      if (reason.length < 10) throw { code: 'invalid', text_human: t('queue.waive_reason') };
      await post('/api/kit/waive', { submission: sub.display_id, criterion: c.criterion, severity: c.severity || undefined, reason });
      toast(t('queue.waived_ok'), 'ok'); reload();
    });
    const checksBox = h('section', null, h('div', { class: 'micro' }, t('queue.tab_checks')), checksTable(res.checks, onWaive));
    const histBox = h('section', null, h('div', { class: 'micro' }, t('queue.tab_history')), historyTable(res.history));
    const slotLink = sub.kit_slot ? h('p', null, h('a', { href: buildHash('kho-slot', sub.kit_slot) }, t('queue.open_slot'))) : null;
    const certify = certifySection({ submission: sub, asset: res.asset }, sub.kit_slot, res.required || {}, reload);

    const actions = h('div', { class: 'kq-actions' });
    if (sub.state === 'submitted') {
      actions.append(
        btn(t('queue.approve'), async () => { try { await post('/api/kit/submission/' + encodeURIComponent(sub.display_id) + '/decide', { verdict: 'approve' }); toast(t('queue.approved_ok'), 'ok'); reload(); } catch (ex) { toast(ex.text_human || ex.detail, 'danger'); } }, 'btn primary', 'check'),
        btn(t('queue.rework'), () => reasonDialog(t('queue.rework'), t('queue.reason'), async (reason) => {
          await post('/api/kit/submission/' + encodeURIComponent(sub.display_id) + '/decide', { verdict: 'rework', reason }); toast(t('queue.reworked_ok'), 'ok'); reload();
        }), 'btn'),
        btn(t('queue.reject'), () => reasonDialog(t('queue.reject'), t('queue.reason'), async (reason) => {
          await post('/api/kit/submission/' + encodeURIComponent(sub.display_id) + '/decide', { verdict: 'reject', reason }); toast(t('queue.rejected_ok'), 'ok'); reload();
        }), 'btn danger'));
    } else if (sub.state === 'blocked' || sub.state === 'rework') {
      actions.append(btn(t('queue.reopen'), async () => { try { await post('/api/kit/submission/' + encodeURIComponent(sub.display_id) + '/decide', { verdict: 'reopen' }); toast(t('queue.reopened_ok'), 'ok'); reload(); } catch (ex) { toast(ex.text_human || ex.detail, 'danger'); } }, 'btn'));
    }
    box.append(...[head, decided, fileBox, checksBox, histBox, slotLink, certify, actions].filter(Boolean));
  }, (e) => { clear(box); box.append(errorBanner(e, () => { clear(box); box.append(skeleton(5)); })); });
  return box;
}

export const mount = (container, ctx) => gridView({
  grid: 'kit_submissions', title: 'queue.title', desc: 'queue.desc', empty: 'queue.empty', q: 'state:submitted',
  tabs: (c) => tabs(c.route.query.q === '' ? 'all' : c.route.query.q === 'state:rework decision_kind:auto' ? 'auto_rework' : c.route.query.q === 'state:blocked' ? 'blocked' : c.route.query.q === 'state:approved' ? 'approved' : c.route.query.q === 'state:rejected' ? 'rejected' : 'pending'),
  inspector: (row, c, reload) => inspectorBody(row, c, reload),
})(container, ctx);
