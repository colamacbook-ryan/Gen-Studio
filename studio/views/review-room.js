// © 2026 Gen Labs — All rights reserved.
// Phòng chiếu: video + bàn dựng 4 làn + bảng cổng + ghi chú ghim + quyết định (chỉ phiên UI).
import { h, icon, clear, toast, confirmButton } from '../components/dom.js';
import { t } from '../i18n.js';
import { get, post } from '../components/api.js';
import { openDialog } from '../components/dialog.js';
import { skeleton, errorBanner, badge } from '../components/states.js';
import { buildHash, fmtTc, fmtClock, lineAt, toText, statusTone } from '../components/util.js';
import { termSpans } from './lessons.js';

const GATE_ORDER = ['G-WAV', 'G-SCRIPT', 'G-PRON', 'G-LOUD', 'G-SYNC', 'G-MOTION', 'G-FRAMES', 'G-MUX'];

function measureText(m) {
  if (m == null) return '';
  if (typeof m === 'string' || typeof m === 'number') return String(m);
  return toText(m.text_human || m.text || m);
}

export function mount(container, ctx) {
  const id = ctx.route.id;
  let alive = true; let off = [];
  const root = h('div', { class: 'theater' }, h('div', { class: 'theater-loading' }, skeleton(6)));
  container.append(root);

  const cleanup = () => { alive = false; off.forEach((f) => f()); };
  get('/api/renders/' + encodeURIComponent(id)).then((data) => { if (alive) { clear(root); off = build(root, id, data, ctx); } })
    .catch((e) => { if (!alive) return; clear(root); root.append(h('div', { class: 'theater-loading' }, errorBanner(e, () => { cleanup(); location.reload(); }), h('a', { class: 'btn', href: buildHash('review') }, t('room.exit')))); });
  return cleanup;
}

function build(root, id, data, ctx) {
  const disposers = [];
  const r = data.render || data;
  const plan = data.plan || r.plan || {};
  const gates = data.gates || r.gates || [];
  const serverNotes = data.notes || r.notes || [];
  const media = data.media || r.media || {};
  const videoUrl = media.video || media.mp4 || media.url || (media.asset_id ? '/media/' + media.asset_id : null);
  const lines = Array.isArray(plan.lines) ? plan.lines : [];
  const beats = Array.isArray(plan.beats) ? plan.beats : [];
  const cues = Array.isArray(plan.cues) ? plan.cues : [];
  const fps = Number(plan.fps) || 30;
  let state = r.state || 'awaiting_review';
  let durMs = Number(plan.duration_ms) || 0;
  let curMs = 0;
  let selected = null;
  let seconds = 0;
  let decided = state !== 'awaiting_review';
  const drafts = [];
  let dialogOpen = false;
  let nextDraft = 1;

  // ---- video ----
  const video = h('video', { class: 'vid', preload: 'metadata', playsinline: true, tabindex: '-1' });
  if (videoUrl) video.src = videoUrl;
  const vidBox = h('div', { class: 'vid-box' }, video);
  if (!videoUrl) vidBox.append(errorBanner({ code: 'media_missing', text_human: t('room.media_missing'), detail: toText(media) }));
  video.addEventListener('error', () => vidBox.append(errorBanner({ code: 'media_error', text_human: t('room.media_missing'), detail: 'GET ' + videoUrl })));
  const stamp = h('div', { class: 'stamp', role: 'status', hidden: state !== 'approved' }, t('room.stamp'));
  vidBox.append(stamp);

  const tcLabel = h('span', { class: 'mono tc' }, fmtTc(0) + ' / ' + fmtTc(durMs));
  const playBtn = h('button', { type: 'button', class: 'icon-btn', 'aria-label': t('room.play'), onclick: () => toggle() }, icon('play'));
  const subtitle = h('div', { class: 'subtitle' });
  const exportOut = h('span', { class: 'muted mono small' });
  const exportBtn = h('button', { type: 'button', class: 'btn', hidden: state !== 'approved', onclick: doExport }, icon('download'), t('room.export'));
  const controls = h('div', { class: 'controls' }, playBtn, tcLabel, subtitle, h('span', { class: 'spacer' }), exportOut, exportBtn);

  // ---- bàn dựng ----
  const total = () => durMs || (video.duration ? video.duration * 1000 : 1);
  const pct = (ms) => Math.max(0, Math.min(100, (ms / total()) * 100)) + '%';
  const track = (cls) => h('div', { class: 'lane-track ' + cls });
  const ruler = h('div', { class: 'lane-track ruler' });
  const laneVoice = track('voice'); const laneBeat = track('beat'); const laneSfx = track('sfx'); const laneGate = track('gate');
  const playhead = h('div', { class: 'playhead', 'aria-hidden': 'true' });
  const blocks = new Map();

  function addBlock(lane, key, startMs, endMs, label, title, cls, row) {
    const b = h('button', {
      type: 'button', class: 'blk ' + cls, title, style: { left: pct(startMs), width: 'max(' + (((endMs - startMs) / total()) * 100) + '%,6px)', top: row ? (row * 22 + 2) + 'px' : '2px' },
      onclick: (e) => { e.stopPropagation(); selected = key; paintSel(); seekMs(startMs); },
    }, label);
    blocks.set(key, b); lane.append(b);
    return b;
  }
  function paintSel() { for (const [k, b] of blocks) b.classList.toggle('sel', k === selected); }

  function drawTimeline() {
    for (const l of [ruler, laneVoice, laneBeat, laneSfx, laneGate]) clear(l);
    blocks.clear();
    const step = total() > 120000 ? 10000 : total() > 40000 ? 5000 : 2000;
    for (let ms = 0; ms <= total(); ms += step) ruler.append(h('span', { class: 'tick mono', style: { left: pct(ms) } }, fmtTc(ms).slice(0, 5)));
    lines.forEach((l) => addBlock(laneVoice, 'L:' + l.id, l.a_ms, l.b_ms, toText(l.id) + ' ' + toText(l.say), toText(l.who) + ' · ' + toText(l.say), 'voice', 0));
    const rowEnds = [];
    beats.forEach((b) => {
      let row = rowEnds.findIndex((e) => e <= b.t_in); if (row < 0) row = rowEnds.length < 2 ? rowEnds.length : 1;
      rowEnds[row] = b.t_out;
      addBlock(laneBeat, 'B:' + b.id, b.t_in, b.t_out, toText(b.block), toText(b.id) + ' · ' + toText(b.block), 'beat', row);
    });
    cues.forEach((c, i) => addBlock(laneSfx, 'C:' + i, c.t_ms, c.t_ms + 150, '', toText(c.name) + ' @' + fmtTc(c.t_ms), 'sfx', 0));
    const allPass = gates.length && gates.every((g) => g.result === 'pass');
    laneGate.append(h('div', { class: 'gate-strip tone-' + (allPass ? 'ok' : gates.some((g) => g.result === 'fail') ? 'danger' : 'warn'), title: t('room.gates') }));
    paintSel();
  }
  const seekFromEvent = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    seekMs(((e.clientX - rect.left) / rect.width) * total());
  };
  for (const l of [ruler, laneVoice, laneBeat, laneSfx, laneGate]) l.addEventListener('click', seekFromEvent);
  const laneRow = (label, el, cls) => h('div', { class: 'lane ' + cls }, h('div', { class: 'lane-label micro' }, t('lane.' + label)), el);
  const timeline = h('div', { class: 'timeline', 'aria-label': t('room.timeline') },
    laneRow('ruler', ruler, 'l-ruler'), laneRow('voice', laneVoice, 'l-voice'), laneRow('beat', laneBeat, 'l-beat'),
    laneRow('sfx', laneSfx, 'l-sfx'), laneRow('gate', laneGate, 'l-gate'),
    h('div', { class: 'playhead-wrap' }, playhead));

  // ---- đồng bộ đầu phát ----
  function paint() {
    const ms = curMs;
    playhead.style.left = pct(ms);
    tcLabel.textContent = fmtTc(ms) + ' / ' + fmtTc(total());
    const ln = lineAt(lines, ms);
    clear(subtitle);
    if (ln) subtitle.append(h('span', { class: 'who' }, toText(ln.who) + ': '), termSpans(ln.say, ln.terms));
    for (const l of lines) { const b = blocks.get('L:' + l.id); if (b) b.classList.toggle('active', ln && ln.id === l.id && ms <= l.b_ms); }
  }
  function seekMs(ms) {
    curMs = Math.max(0, Math.min(total(), ms));
    if (videoUrl && video.readyState > 0) video.currentTime = curMs / 1000;
    paint();
  }
  let raf = 0;
  const tick = () => { curMs = video.currentTime * 1000; paint(); if (!video.paused) raf = requestAnimationFrame(tick); };
  video.addEventListener('play', () => { playBtn.replaceChildren(icon('pause')); playBtn.setAttribute('aria-label', t('room.pause')); raf = requestAnimationFrame(tick); });
  video.addEventListener('pause', () => { playBtn.replaceChildren(icon('play')); playBtn.setAttribute('aria-label', t('room.play')); cancelAnimationFrame(raf); });
  video.addEventListener('timeupdate', () => { if (video.paused) { curMs = video.currentTime * 1000; paint(); } });
  video.addEventListener('loadedmetadata', () => { if (!durMs) { durMs = video.duration * 1000; drawTimeline(); } paint(); });
  video.addEventListener('seeked', () => { curMs = video.currentTime * 1000; paint(); });
  function toggle() { if (!videoUrl) return; if (video.paused) video.play().catch(() => {}); else video.pause(); }
  disposers.push(() => { cancelAnimationFrame(raf); video.pause(); video.removeAttribute('src'); video.load(); });

  // ---- bảng cổng ----
  const gateByName = new Map(gates.map((g) => [g.gate, g]));
  const gateNames = GATE_ORDER.filter((n) => gateByName.has(n)).concat(gates.map((g) => g.gate).filter((n) => !GATE_ORDER.includes(n)));
  const passN = gates.filter((g) => g.result === 'pass').length;
  const gatePanel = h('section', { class: 'panel' }, h('div', { class: 'micro' }, t('room.gates') + ' · ' + passN + '/' + gates.length),
    gateNames.length ? h('div', { class: 'gate-table', role: 'table' }, gateNames.map((n) => {
      const g = gateByName.get(n);
      return h('div', { class: 'gate-row', role: 'row' }, h('span', { class: 'mono' }, n),
        badge(t('gate.' + toText(g.result)), g.result === 'pass' ? 'ok' : g.result === 'fail' ? 'danger' : 'warn'),
        h('span', { class: 'muted mono small' }, measureText(g.measure)));
    })) : h('p', { class: 'muted' }, t('room.no_gates')));

  // ---- ghi chú ----
  const notesBox = h('div', { class: 'notes' });
  function drawNotes() {
    clear(notesBox);
    serverNotes.forEach((n) => notesBox.append(h('div', { class: 'note saved' }, h('div', { class: 'mono small muted' }, toText(n.pin_ref || n.pin_kind)), h('div', null, toText(n.text)))));
    drafts.forEach((d) => {
      const ta = h('textarea', { class: 'input', rows: '2', 'aria-label': t('room.note_text'), placeholder: t('room.note_ph'), oninput: () => { d.text = ta.value; updateDecide(); } });
      ta.value = d.text; d.ta = ta;
      notesBox.append(h('div', { class: 'note draft' },
        h('div', { class: 'note-head' }, h('a', { class: 'mono small', href: '#', onclick: (e) => { e.preventDefault(); seekMs(d.t_ms); } }, d.pin_ref),
          h('button', { type: 'button', class: 'icon-btn', 'aria-label': t('common.remove'), onclick: () => { drafts.splice(drafts.indexOf(d), 1); drawNotes(); updateDecide(); } }, icon('x'))), ta));
    });
    if (!serverNotes.length && !drafts.length) notesBox.append(h('p', { class: 'muted small' }, t('room.no_notes')));
  }
  function pinNote() {
    if (decided) return;
    const ln = lineAt(lines, curMs);
    const pin_ref = ln ? toText(ln.id) + '@' + fmtTc(curMs) : fmtTc(curMs);
    const d = { key: nextDraft++, pin_kind: ln ? 'line' : 'time', pin_ref, t_ms: curMs, text: '' };
    drafts.push(d); drawNotes(); d.ta.focus();
  }
  const noteList = () => drafts.filter((d) => d.text.trim()).map((d) => ({ pin_kind: d.pin_kind, pin_ref: d.pin_ref, text: d.text.trim() }));
  const decideBtn = h('button', { type: 'button', class: 'btn primary wide', hidden: decided, onclick: openDecision }, t('room.decide'), h('span', { class: 'mono kbd' }, '⌘↵'));
  const notesPanel = h('section', { class: 'panel grow' }, h('div', { class: 'micro' }, t('room.notes')),
    h('button', { type: 'button', class: 'btn', hidden: decided, onclick: pinNote }, icon('plus'), t('room.pin'), h('span', { class: 'mono kbd' }, 'M')), notesBox);
  function updateDecide() { if (changesBtn) { const ok = noteList().length > 0; changesBtn.disabled = !ok; changesHint.hidden = ok; } }

  // ---- quyết định ----
  let changesBtn = null; let changesHint = null; let busy = false;
  function openDecision() {
    if (decided || dialogOpen) return;
    dialogOpen = true;
    changesHint = h('p', { class: 'muted small' }, t('room.changes_need_note'));
    const body = h('div', null, h('p', null, t('room.decide_hint')), changesHint);
    const close = openDialog(t('room.decide'), body, (closeFn) => {
      changesBtn = h('button', { type: 'button', class: 'btn', onclick: () => submit('changes_requested', closeFn) }, t('room.changes'));
      updateDecide();
      return [
        h('button', { type: 'button', class: 'btn primary', onclick: () => submit('approved', closeFn) }, t('room.approve')),
        changesBtn,
        confirmButton(t('room.discard'), t('common.confirm_again'), () => submit('rejected', closeFn)),
      ];
    }, () => { dialogOpen = false; changesBtn = null; });
    return close;
  }
  async function submit(decision, closeFn) {
    if (busy) return;
    const notes = noteList();
    if (decision === 'changes_requested' && !notes.length) { toast(t('room.changes_need_note'), 'warn'); return; }
    busy = true;
    try {
      await post('/api/renders/' + encodeURIComponent(id) + '/review', { decision, notes, review_seconds: seconds });
      closeFn();
      decided = true; decideBtn.hidden = true;
      if (decision === 'approved') {
        state = 'approved'; stamp.hidden = false; stamp.classList.add('press'); exportBtn.hidden = false;
        toast(t('room.approved'), 'ok');
      } else {
        toast(t(decision === 'changes_requested' ? 'room.changes_sent' : 'room.discarded'), 'ok');
        setTimeout(() => { location.hash = buildHash('review'); }, 900);
      }
    } catch (e) { toast((e && e.text_human) || (e && e.detail) || t('err.generic'), 'danger'); }
    busy = false;
  }
  async function doExport() {
    exportBtn.disabled = true;
    try {
      const res = await post('/api/renders/' + encodeURIComponent(id) + '/export', {});
      exportOut.textContent = toText((res && (res.path || res.dir || res.export_path)) || t('room.exported'));
      toast(t('room.exported'), 'ok');
    } catch (e) { toast((e && e.text_human) || (e && e.detail) || t('err.generic'), 'danger'); }
    exportBtn.disabled = false;
  }

  // ---- đồng hồ duyệt ----
  const clock = h('span', { class: 'mono', role: 'timer', 'aria-label': t('room.clock') }, fmtClock(0));
  const timer = setInterval(() => { if (!document.hidden && !decided) { seconds += 1; clock.textContent = fmtClock(seconds); } }, 1000);
  disposers.push(() => clearInterval(timer));

  // ---- phím tắt ----
  const onKey = (e) => {
    if (dialogOpen && !(e.key === 'Enter' && (e.metaKey || e.ctrlKey))) return;
    const tag = e.target && e.target.tagName;
    const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); openDecision(); return; }
    if (typing) return;
    switch (e.key) {
      case ' ': e.preventDefault(); toggle(); break;
      case 'ArrowLeft': e.preventDefault(); seekMs(curMs - (e.shiftKey ? 1000 : 1000 / fps)); break;
      case 'ArrowRight': e.preventDefault(); seekMs(curMs + (e.shiftKey ? 1000 : 1000 / fps)); break;
      case ',': { e.preventDefault(); const prev = lines.filter((l) => l.a_ms < curMs - 400).pop(); seekMs(prev ? prev.a_ms : 0); break; }
      case '.': { e.preventDefault(); const nx = lines.find((l) => l.a_ms > curMs + 50); if (nx) seekMs(nx.a_ms); break; }
      case 'm': case 'M': e.preventDefault(); pinNote(); break;
      case 'Escape': location.hash = buildHash('review'); break;
      default:
    }
  };
  window.addEventListener('keydown', onKey);
  disposers.push(() => window.removeEventListener('keydown', onKey));

  // ---- bố cục ----
  const lessonRef = toText(r.lesson_display_id || r.lesson || (data.lesson && data.lesson.display_id) || '');
  const ver = r.version != null ? ' v' + toText(r.version) : '';
  const top = h('header', { class: 'theater-top' },
    h('nav', { class: 'crumb' }, h('a', { href: buildHash('review') }, t('nav.review')), h('span', { class: 'muted' }, ' › '), h('span', { class: 'mono' }, id)),
    lessonRef ? h('span', { class: 'tag mono' }, lessonRef + ver) : null,
    h('span', { class: 'spacer' }),
    h('span', { class: 'clock' }, icon('clock'), clock),
    h('a', { class: 'btn', href: buildHash('review') }, t('room.exit'), h('span', { class: 'mono kbd' }, 'Esc')));
  const dockRail = h('aside', { class: 'dock rail', 'aria-label': t('dock.title'), title: t('dock.title') + ' — ' + t('dock.soon') }, icon('chat'));
  root.append(top, h('div', { class: 'theater-body' },
    h('div', { class: 'theater-left' }, h('div', { class: 'vid-area' }, vidBox, controls), timeline),
    h('aside', { class: 'theater-right' }, gatePanel, notesPanel, h('div', { class: 'decide-bar' }, decideBtn)),
    dockRail));
  drawTimeline(); drawNotes(); paint();
  return disposers;
}
