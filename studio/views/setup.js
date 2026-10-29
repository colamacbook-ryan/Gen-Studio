// © 2026 Gen Labs — All rights reserved.
// Thiết lập lần đầu (#/setup?k=…): chủ xưởng → khoá giọng + quét → agent token → kênh.
import { h, clear, icon, copyText } from '../components/dom.js';
import { t, tOr } from '../i18n.js';
import { post, get } from '../components/api.js';
import { errorBanner } from '../components/states.js';
import { field } from '../components/dialog.js';
import { tokenResult, connectCard, claudeCmd } from './lists.js';
import { authCard } from './authorize.js';
import { onDebounced } from '../components/bus.js';
import { toText, statusTone } from '../components/util.js';
import { badge } from '../components/states.js';
import { ensureOffline, offlineStatus, PULL_CMD } from './voice-offline.js';

const PAIR_WINDOW_MS = 10 * 60 * 1000; // cửa sổ ghép 10 phút (PRODUCT-SPEC A3)
const STEPS = ['owner', 'provider', 'agent', 'channel'];

export function mount(container, ctx) {
  const key = ctx.route.query.k || new URLSearchParams(location.search).get('k') || '';
  let step = 0;
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
  // khoá thiết lập chỉ dùng một lần: bỏ ?k=… khỏi thanh địa chỉ (cả query lẫn hash) để không nằm lại trong lịch sử/ảnh chụp
  function stripKey() { try { history.replaceState(null, '', location.pathname + '#/setup'); } catch { /* môi trường không hỗ trợ */ } }
  function finish() { try { history.replaceState(null, '', location.pathname); } catch { /* bỏ qua */ } location.hash = '#/overview'; }
  function next() { step += 1; if (step >= STEPS.length) { finish(); return; } draw(); }
  // tải lại giữa chừng: tiếp tục ở bước đầu tiên CHƯA xong theo trạng thái máy chủ (chủ xưởng → giọng đọc → agent → kênh); đủ cả thì vào xưởng
  async function firstIncomplete() {
    if (!ctx.me) return 0;
    try {
      const [prov, ags, chs] = await Promise.all([get('/api/grid/providers'), get('/api/grid/agents'), get('/api/grid/channels')]);
      if (!(prov.rows || []).length) return 1;
      if (!(ags.rows || []).some((a) => a.status !== 'revoked')) return 2;
      if (!(chs.rows || []).length) return 3;
      return -1;
    } catch { return 1; }
  }
  const skipBtn = () => h('button', { type: 'button', class: 'btn', onclick: next }, t('setup.skip'));

  function formShell(title, hint, fields, onSubmit, submitLabel, extra) {
    const msg = h('div');
    const submit = h('button', { type: 'submit', class: 'btn primary' }, submitLabel);
    // hàng nút gửi/bỏ qua — bước xong thì ẩn đi để chỉ còn MỘT nút chính (Tiếp tục), theo STD-07
    const row = h('div', { class: 'row' }, submit, extra || null);
    return h('form', { class: 'step-form', onsubmit: async (e) => {
      e.preventDefault(); submit.disabled = true; clear(msg);
      try { await onSubmit(msg, row); } catch (ex) { msg.append(errorBanner(ex)); }
      submit.disabled = false;
    } }, h('h2', null, title), h('p', { class: 'muted' }, hint), fields, msg, row);
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
        stripKey();
        next();
      }, t('common.next'));
  }

  // Bước Giọng đọc: hai lựa chọn — Gemini (cần khoá) hoặc giọng offline trên máy (không khoá, gói L). Mỗi lựa chọn một nút chính.
  let voiceMode = 'gemini';
  function voiceCards() {
    const card = (id, title, hint) => h('button', { type: 'button', class: 'opt-card' + (voiceMode === id ? ' active' : ''), 'aria-pressed': voiceMode === id ? 'true' : 'false',
      onclick: () => { if (voiceMode !== id) { voiceMode = id; draw(); } } }, h('strong', null, title), h('div', { class: 'muted small' }, hint));
    return h('div', { class: 'opt-cards' }, card('gemini', t('voff.opt_gemini'), t('voff.opt_gemini_hint')), card('offline', t('voff.opt_offline'), t('voff.opt_offline_hint')));
  }
  function providerStep() { return voiceMode === 'offline' ? offlineStep() : geminiStep(); }

  function offlineStep() {
    const result = h('div', { class: 'scan' });
    return formShell(t('setup.provider.title'), t('voff.opt_offline_hint'), [voiceCards(), result],
      async (msg, row) => {
        clear(result);
        const ids = await ensureOffline();
        row.hidden = true; // đã bật: không mời bật lần nữa
        result.append(h('div', { class: 'muted mono' }, t('voff.enabled')));
        const scanBox = h('div');
        result.append(scanBox, h('button', { type: 'button', class: 'btn primary', onclick: next }, t('common.next')));
        // quét cả hai hàng (giọng + giám khảo); dịch vụ chưa chạy ⇒ báo lỗi thân thiện + lệnh cần chạy, vẫn đi tiếp được
        async function runScan() {
          clear(scanBox);
          try {
            let scan = null;
            for (const id of ids.filter(Boolean)) scan = await post('/api/providers/' + encodeURIComponent(id) + '/scan', {});
            const st = offlineStatus(scan);
            if (st) scanBox.append(st);
            if (!scan || !scan.service || !scan.service.ready) scanBox.append(h('button', { type: 'button', class: 'btn', onclick: runScan }, t('prov.scan')));
          } catch (ex) {
            scanBox.append(errorBanner(ex), connectCard(PULL_CMD), h('button', { type: 'button', class: 'btn', onclick: runScan }, t('prov.scan')));
          }
        }
        await runScan();
      }, t('voff.enable'), skipBtn());
  }

  function geminiStep() {
    const k = input('password', 'su-key', { autocomplete: 'new-password' });
    const result = h('div', { class: 'scan' });
    return formShell(t('setup.provider.title'), t('setup.provider.hint'), [voiceCards(), inField(t('prov.key'), k), result],
      async (msg, row) => {
        clear(result);
        const key = k.value.trim();
        const saved = await post('/api/providers', { vendor: 'gemini', kind: 'tts', key });
        // cùng khoá Gemini làm giám khảo (chép lời, phát âm, mốc từng từ): thiếu thì bản dựng đầu tiên bị chặn no_provider
        await post('/api/providers', { vendor: 'gemini', kind: 'judge', key });
        k.value = '';
        result.append(h('div', { class: 'muted mono' }, t('setup.provider.saved')));
        const id = saved && (saved.display_id || saved.id || (saved.provider && (saved.provider.display_id || saved.provider.id)));
        row.hidden = true; // khoá đã lưu: không mời "Lưu và quét" lần nữa (tránh tạo nhà cung cấp trùng)
        const scanBox = h('div');
        result.append(scanBox, h('button', { type: 'button', class: 'btn primary', onclick: next }, t('common.next')));
        // quét lỗi (mạng, khoá sai) vẫn đi tiếp được; "Quét lại" quét đúng khoá vừa lưu
        async function runScan() {
          clear(scanBox);
          try {
            const scan = await post('/api/providers/' + encodeURIComponent(id) + '/scan', {});
            const models = (scan && (scan.models || (scan.result && scan.result.models))) || [];
            if (models.length) {
              scanBox.append(h('div', { class: 'sub-grid' }, models.map((m) => h('div', { class: 'sub-row' },
                h('span', { class: 'mono' }, toText(m.model)), badge(m.available ? t('prov.ready') : t('prov.unavailable'), m.available ? 'ok' : 'idle'),
                h('span', { class: 'muted mono' }, m.quota && m.quota.value != null ? toText(m.quota.value) + ' · ' + toText(m.quota.source) : t('prov.quota_unknown'))))));
            }
          } catch (ex) {
            scanBox.append(errorBanner(ex), h('button', { type: 'button', class: 'btn', onclick: runScan }, t('prov.scan')));
          }
        }
        if (id) await runScan();
      }, t('prov.save_scan'), skipBtn());
  }

  // Bước Agent: (a) agent nội bộ — bấm "Bật agent nội bộ" mở cửa sổ ghép, runner xin quyền, Duyệt ngay tại đây; (b) agent ngoài — lệnh claude mcp add + chờ gọi lần đầu;
  // (c) token tay ở "Nâng cao". Mỗi trạng thái đúng một nút chính (L-… "mỗi bước một nút chính").
  let stopWait = null;
  function agentStep() {
    const mode = { v: 'internal' };
    const body = h('div', { class: 'agent-body' });
    const out = h('div');
    const optBtn = (id, title, hint) => h('button', { type: 'button', class: 'opt-card' + (mode.v === id ? ' active' : ''), onclick: () => { mode.v = id; drawBody(); } }, h('strong', null, title), h('div', { class: 'muted small' }, hint));
    const cards = h('div', { class: 'opt-cards' });
    const next_ = h('button', { type: 'button', class: 'btn primary', onclick: next }, t('common.next'));

    function drawCards() { clear(cards); cards.append(optBtn('internal', t('setup.agent.internal'), t('setup.agent.internal_hint')), optBtn('external', t('setup.agent.external'), t('setup.agent.external_hint'))); }
    function stopAll() { if (stopWait) { stopWait(); stopWait = null; } }

    // chờ + hiện thẻ: poll 2 s + SSE; fetchView() → {nodes, finished}
    function watch(host, render) {
      let alive = true, timer = null;
      const tickFn = async () => { try { const r = await render(); if (!alive) return; clear(host); host.append(...r.nodes); if (r.finished) { host.append(next_); return; } } catch (e) { if (alive) { clear(host); host.append(errorBanner(e)); } } if (alive) timer = setTimeout(tickFn, 2000); };
      tickFn();
      const off = onDebounced('change', () => { clearTimeout(timer); tickFn(); }, 300);
      stopWait = () => { alive = false; clearTimeout(timer); off(); };
    }

    function internalBody() {
      const status = h('div', { class: 'waiting' });
      const watchBox = h('div');
      let clickedAt = null;
      const open = h('button', { type: 'button', class: 'btn primary', onclick: async (e) => {
        const b = e.currentTarget; b.disabled = true;
        try { await post('/api/pairing/open', { channel: 'internal' }); clickedAt = new Date(Date.now() - 2000).toISOString(); b.textContent = t('setup.agent.reopen'); b.className = 'btn'; startWatch(); }   // sau cú bấm đầu, "Mở lại ghép" chỉ là nút phụ
        catch (ex) { clear(status); status.append(errorBanner(ex)); }
        b.disabled = false;
      } }, t('setup.agent.enable'));
      body.append(h('p', { class: 'muted' }, t('connect.internal_hint')), h('p', { class: 'muted small' }, t('setup.agent.login_note')), connectCard('genstudio agent-login'), open, status, watchBox);
      // tải lại trang khi cửa sổ ghép còn mở: coi như đã bấm (từ lúc mở cửa sổ) để thẻ yêu cầu hiện lại
      get('/api/runner-status').then((rs) => {
        if (clickedAt || !rs.pairing || !rs.pairing.open || !rs.pairing.open_until) return;
        clickedAt = new Date(Date.parse(rs.pairing.open_until) - PAIR_WINDOW_MS - 2000).toISOString();
        open.textContent = t('setup.agent.reopen'); open.className = 'btn'; startWatch();
      }).catch(() => {});
      function startWatch() {
        stopAll();
        watch(watchBox, async () => {
          const [rs, list] = await Promise.all([get('/api/runner-status'), get('/api/auth-requests')]);
          const nodes = [];
          const r = rs.runner;
          nodes.push(h('div', { class: 'waiting' }, r && r.online ? tOr('runner.state.' + r.state, r.state) + (r.code ? ' · ' + tOr('runner.code.' + r.code, r.code) : '') : t('runner.offline')));
          if (rs.pairing && rs.pairing.open) nodes.push(h('div', { class: 'muted small' }, t('runner.window', { at: new Date(rs.pairing.open_until).toLocaleTimeString() })));
          // chỉ thẻ internal sinh SAU cú bấm; có hơn một thì không hiện nút Duyệt
          const mine = list.requests.filter((q) => q.kind === 'device' && q.agent_kind === 'internal' && q.created_at >= clickedAt);
          let finished = false;
          if (mine.length === 1) nodes.push(authCard(mine[0], { onDone: (res, kind) => { if (kind === 'approve') { stopAll(); open.hidden = true; clear(watchBox); watchBox.append(h('div', { class: 'consent-done' }, icon('check'), h('span', null, t('setup.agent.paired', { id: res.agent.display_id }))), next_); } } }));
          else if (mine.length > 1) nodes.push(h('div', { class: 'banner warn', role: 'alert' }, icon('warn'), h('span', null, t('setup.agent.many'))));
          else nodes.push(h('div', { class: 'waiting' }, t('setup.agent.wait_runner')));
          return { nodes, finished };
        });
      }
    }

    function externalBody() {
      const box = h('div');
      body.append(h('p', { class: 'muted' }, t('connect.claude_code_hint')), connectCard(claudeCmd()), h('p', { class: 'muted small' }, t('connect.cloud_hint', { url: location.origin + '/mcp' })), box);
      watch(box, async () => {
        const [list, agents] = await Promise.all([get('/api/auth-requests'), get('/api/grid/agents')]);
        const hit = (agents.rows || []).find((a) => a.kind === 'oauth' && a.last_call_at && a.status !== 'revoked');
        if (hit) return { nodes: [h('div', { class: 'consent-done' }, icon('check'), h('span', null, t('connect.connected', { name: toText(hit.name), id: toText(hit.display_id) })))], finished: true };
        const nodes = list.requests.filter((q) => q.kind === 'oauth').map((q) => authCard(q, { onDone: () => {} }));
        nodes.push(h('div', { class: 'waiting' }, t('connect.waiting')));
        return { nodes, finished: false };
      });
    }

    function drawBody() {
      stopAll(); drawCards(); clear(body);
      if (mode.v === 'internal') internalBody(); else externalBody();
    }

    // (c) token tay — thu gọn, không phải đường chính
    const name = input('text', 'su-agent'); name.value = 'Claude Code';
    const adv = h('details', { class: 'detail' }, h('summary', null, t('setup.agent.advanced')),
      h('p', { class: 'muted small' }, t('adv.manual_hint')), inField(t('agent.name'), name), out,
      h('button', { type: 'button', class: 'btn', onclick: async (e) => {
        const b = e.currentTarget; b.disabled = true; clear(out);
        try { const res = await post('/api/agents', { name: name.value.trim(), scopes: ['read', 'compose', 'run'] }); out.append(tokenResult(res)); }
        catch (ex) { out.append(errorBanner(ex)); b.disabled = false; }
      } }, t('agent.issue')));
    const wrap = h('div', { class: 'step-form' }, h('h2', null, t('setup.agent.title')), h('p', { class: 'muted' }, t('setup.agent.hint')), cards, body, adv, h('div', { class: 'row' }, skipBtn()));
    drawBody();
    return wrap;
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
    if (stopWait) { stopWait(); stopWait = null; }
    drawStepper(); clear(panel);
    panel.append([ownerStep, providerStep, agentStep, channelStep][step]());
  }
  firstIncomplete().then((n) => { if (n < 0) { finish(); return; } step = n; draw(); });
  return () => { if (stopWait) { stopWait(); stopWait = null; } };
}
