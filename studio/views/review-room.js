// © 2026 Gen Labs — All rights reserved.
// Phòng chiếu: video đúng tỉ lệ bản dựng (9:16 hiện dọc) + lớp phủ vùng UI nền tảng + bàn dựng 4 làn (+ làn tuỳ chọn) + bảng cổng (số đo G-SAFE xem được trên khung)
// + tab Ảnh bìa (chọn phương án, chỉ owner) + cảnh báo nhân vật chưa chốt + quyết định (chỉ phiên UI) + công tắc Đã đăng. Gói UI-R2 (SPEC-0.2.0 §5.8, F7 §10.5).
import { h, icon, clear, toast, confirmButton } from '../components/dom.js';
import { t, tOr } from '../i18n.js';
import { get, post } from '../components/api.js';
import { openDialog } from '../components/dialog.js';
import { skeleton, errorBanner, badge } from '../components/states.js';
import { buildHash, fmtTc, fmtClock, lineAt, toText } from '../components/util.js';
import { termSpans, AspectUI } from './lessons.js';

// Làn tuỳ chọn của bàn dựng (SPEC-0.2.0 §13.2, P0b mở móc): mỗi tên N ở đây ứng với studio/views/review-lanes/N.js, export
//   lane(env) → { key, label, draw(env, track) } | null   (env: plan, lines, beats, cues, gates, castName, pct(ms), total(), seekMs(ms), addBlock(track, key, a_ms, b_ms, label, title, cls, row), h, clear, t)
// Thiếu file (gói chưa có) ⇒ import lỗi ⇒ bỏ qua êm, không làm hỏng Phòng chiếu. Danh sách cổng KHÔNG hardcode: lấy theo thứ tự API trả về (GATES theo loại bài).
const OPTIONAL_LANES = ['cursor'];
async function loadLaneModules() {
  const out = [];
  for (const name of OPTIONAL_LANES) {
    try { const m = await import('./review-lanes/' + name + '.js'); if (m && typeof m.lane === 'function') out.push(m); } catch (e) { /* chưa có làn này */ }
  }
  return out;
}

// Số đo cổng → một dòng người đọc được (không bao giờ đổ JSON thô ra giao diện)
const num = (x, d = 1) => (typeof x === 'number' && isFinite(x) ? x.toFixed(d).replace(/\.0+$/, '') : '—');
const okCount = (arr) => (Array.isArray(arr) ? arr.filter(x => x && x.result === 'pass').length : 0);
export function measureText(m, gate) {
  if (m == null) return '';
  if (typeof m === 'string' || typeof m === 'number') return String(m);
  try {
    // cổng 0.2.0: câu theo ngôn ngữ giao diện (text_human của máy chủ là tiếng Việt)
    switch (gate) {
      case 'G-SAFE': {
        if (m.applicable === false) return t('rv.gm.safe_na');
        if (!m.samples) break;
        const w = (m.warnings || []).length;
        return t('rv.gm.safe', { v: (m.violations || []).length, px: num(m.min_font_px) }) + (w ? t('rv.gm.safe_warn', { n: w }) : '');
      }
      case 'G-THUMB': {
        const vs = Array.isArray(m.variants) ? m.variants : [];
        if (!vs.length) break;
        const best = vs.filter((v) => v.pass).sort((a, b) => (b.score || 0) - (a.score || 0))[0];
        return best ? t('rv.gm.thumb', { ok: (m.passed || []).length, n: vs.length, px: num(best.font_px, 0), c: num(best.contrast) }) : t('rv.gm.thumb_none');
      }
      case 'G-CURSOR': if (m.checks) return t('rv.gm.cursor', { steps: m.steps != null ? m.steps : '—', clicks: m.clicks != null ? m.clicks : '—', bad: m.violation_count || 0 }); break;
      default:
    }
  } catch (e) { /* rơi xuống dòng chung */ }
  if (m.text_human) return toText(m.text_human);
  try {
    switch (gate) {
      case 'G-WAV': {
        const a = m.tier_a || [], b = m.tier_b || {};
        return t('gm.lines', { ok: okCount(a), n: a.length }) + ' · ' + t('gm.wavb', { marks: b.marks != null ? b.marks : '—', ratio: num(b.worst_ratio) });
      }
      case 'G-SCRIPT': case 'G-PRON': return t('gm.lines', { ok: okCount(m.lines), n: (m.lines || []).length });
      case 'G-LOUD': return t('gm.loud', { lufs: num(m.lufs), tp: num(m.tp) });
      case 'G-SYNC': return t('gm.sync', { beats: m.beats != null ? m.beats : '—', bad: (m.bad_index || []).length ? t('gm.sync.bad', { list: m.bad_index.join(', ') }) : '' });
      case 'G-MOTION': return t('gm.motion', { fz: (m.bad_freezes || []).length, cuts: (m.bad_cuts || []).length });
      case 'G-FRAMES': return t('gm.frames', { got: m.got, expected: m.expected, err: m.error_count || 0 });
      case 'G-MUX': return t('gm.mux', { v: num(m.video_s, 2), a: num(m.audio_s, 2), srt: m.srt ? Object.keys(m.srt).filter(k => m.srt[k] === 'ok').join('+') || '—' : '—' });
    }
  } catch (e) { /* rơi xuống dòng chung */ }
  return '';
}

// Một dòng vi phạm/cảnh báo G-SAFE (F7 §6.2) → chữ người đọc được
export function safeItemText(v) {
  const bits = [tOr('rv.safe.rule.' + toText(v.rule), toText(v.rule))];
  if (v.rule === 'S6') {
    if (v.preset) bits.push(t('rv.safe.dur_max', { d: num(v.duration_s), p: tOr('lsn.asp.preset.' + v.preset, v.preset), m: v.max_s }));
    else if (Array.isArray(v.target_s)) bits.push(t('rv.safe.dur_target', { d: num(v.duration_s), a: v.target_s[0], b: v.target_s[1] }));
    return bits.join(' · ');
  }
  if (v.font_px != null) bits.push(t('rv.safe.font', { px: num(v.font_px), min: v.min_font_px != null ? v.min_font_px : '—' }));
  else if (v.edge) bits.push(t('rv.safe.edge', { e: toText(v.edge) }));
  const ref = v.line || v.beat || v.role;
  if (ref) bits.push(toText(ref));
  if (v.count > 1) bits.push('×' + v.count);
  return bits.join(' · ');
}

// Tỉ lệ khung của bản dựng: render.size → [w,h]; thiếu ⇒ suy từ aspect ("9:16")
export function frameOf(r) {
  if (Array.isArray(r.size) && r.size[0] > 0 && r.size[1] > 0) return [Number(r.size[0]), Number(r.size[1])];
  const m = /^(\d+):(\d+)$/.exec(toText(r.aspect));
  return m ? (Number(m[2]) > Number(m[1]) ? [1080, 1920] : [1920, 1080]) : [1920, 1080];
}
// Phương án đang chọn: thumbnail_pick = mã asset ảnh 1280 (AS-…), media.thumbs[].w1280 = '/media/AS-…'
export function pickedIndex(thumbs, pick) {
  if (!pick || !Array.isArray(thumbs)) return -1;
  const tail = (u) => toText(u).split('/').pop();
  return thumbs.findIndex((x) => tail(x.w1280) === pick || tail(x.w1920) === pick);
}
// Phương án điểm cao nhất trong số đạt (gói xuất dùng khi chưa chọn); bằng điểm ⇒ theo thứ tự gửi
export function bestIndex(thumbs) {
  let best = -1;
  (thumbs || []).forEach((x, i) => { if (x && x.pass !== false && (best < 0 || (x.score || 0) > (thumbs[best].score || 0))) best = i; });
  return best;
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
  const fit = data.fit || null;
  const videoUrl = media.video || media.mp4 || media.url || (media.asset_id ? '/media/' + media.asset_id : null);
  const lines = Array.isArray(plan.lines) ? plan.lines : [];
  const castName = (who) => toText((data.cast && data.cast[who]) || who);
  const beats = Array.isArray(plan.beats) ? plan.beats : [];
  const cues = Array.isArray(plan.cues) ? plan.cues : [];
  const fps = Number(plan.fps) || 30;
  const isOwner = !!(ctx.me && ctx.me.user && ctx.me.user.role === 'owner');
  const aspect = toText(r.aspect) || '16:9';
  const [FW, FH] = frameOf(r);
  const portrait = FH > FW;
  const thumbs = Array.isArray(media.thumbs) ? media.thumbs : [];
  let state = r.state || 'awaiting_review';
  let durMs = Number(plan.duration_ms) || 0;
  let curMs = 0;
  let selected = null;
  let seconds = 0;
  let decided = state !== 'awaiting_review';
  const drafts = [];
  let dialogOpen = false;
  let nextDraft = 1;
  let room = { thumbnail_pick: r.thumbnail_pick || null, exported_at: null, published_at: null, cast: [] };
  let catalog = null; let thumbSpecs = null;

  // ---- video theo tỉ lệ ----
  const video = h('video', { class: 'vid', preload: 'metadata', playsinline: true, tabindex: '-1' });
  if (videoUrl) video.src = videoUrl;
  const overlayLayer = h('div', { class: 'ov-layer', hidden: true });
  const markLayer = h('div', { class: 'ov-mark', hidden: true });
  const vidBox = h('div', { class: 'vid-box' + (portrait ? ' portrait' : ''), style: { aspectRatio: FW + ' / ' + FH }, 'data-aspect': aspect }, video, overlayLayer, markLayer);
  if (!videoUrl) vidBox.append(errorBanner({ code: 'media_missing', text_human: t('room.media_missing'), detail: toText(media) }));
  video.addEventListener('error', () => vidBox.append(errorBanner({ code: 'media_error', text_human: t('room.media_missing'), detail: 'GET ' + videoUrl })));
  const stamp = h('div', { class: 'stamp', role: 'status', hidden: state !== 'approved' }, t('room.stamp'));
  vidBox.append(stamp);

  // lớp phủ vùng UI nền tảng (chỉ tỉ lệ có `safe`, lấy từ GET /api/aspects)
  let overlayOn = false;
  const overlayBtn = h('button', { type: 'button', class: 'btn ov-btn', hidden: true, 'aria-pressed': 'false', onclick: () => setOverlay(!overlayOn) }, icon('grid'), t('rv.overlay'), h('span', { class: 'mono kbd' }, 'U'));
  function setOverlay(on) {
    if (overlayBtn.hidden) return;
    overlayOn = on; overlayLayer.hidden = !on;
    overlayBtn.setAttribute('aria-pressed', on ? 'true' : 'false'); overlayBtn.classList.toggle('on', on);
    overlayBtn.title = t(on ? 'rv.overlay_on' : 'rv.overlay_off');
    if (!on) markLayer.hidden = true;
  }
  // khung đánh dấu một vi phạm G-SAFE trên video (toạ độ khung)
  function markBox(box) {
    clear(markLayer);
    if (!Array.isArray(box) || box.length < 4) { markLayer.hidden = true; return; }
    const pc = (v, of) => (v / of) * 100 + '%';
    markLayer.append(h('span', { class: 'ov-box', style: { left: pc(box[0], FW), top: pc(box[1], FH), width: pc(box[2], FW), height: pc(box[3], FH) } }));
    markLayer.hidden = false;
  }

  const tcLabel = h('span', { class: 'mono tc' }, fmtTc(0) + ' / ' + fmtTc(durMs));
  const playBtn = h('button', { type: 'button', class: 'icon-btn', 'aria-label': t('room.play'), onclick: () => toggle() }, icon('play'));
  const subtitle = h('div', { class: 'subtitle' });
  const exportOut = h('span', { class: 'muted mono small' });
  const exportBtn = h('button', { type: 'button', class: 'btn', hidden: state !== 'approved', onclick: doExport }, icon('download'), t('room.export'));
  // công tắc Đã đăng (render.mark_published / unmark, chỉ owner, chỉ bản đã duyệt)
  const pubInput = h('input', { type: 'checkbox', role: 'switch', class: 'sw-input', disabled: !isOwner, 'aria-label': t('rv.published') });
  const pubNote = h('span', { class: 'muted small' });
  const pubSwitch = h('label', { class: 'sw', hidden: state !== 'approved' }, pubInput, h('span', { class: 'sw-track', 'aria-hidden': 'true' }), h('span', null, t('rv.published')), pubNote);
  pubInput.addEventListener('change', async () => {
    const want = pubInput.checked; pubInput.disabled = true;
    try { await post('/api/renders/' + encodeURIComponent(id) + '/published', { published: want }); room.published_at = want ? new Date().toISOString() : null; room.published_source = want ? 'manual' : null; toast(t(want ? 'rv.published_on' : 'rv.published_off'), 'ok'); }
    catch (e) { pubInput.checked = !want; toast((e && e.text_human) || t('err.generic'), 'danger'); }
    pubInput.disabled = !isOwner; paintPub();
  });
  function paintPub() { pubInput.checked = !!room.published_at; pubNote.textContent = room.published_at && room.published_source === 'export' ? '· ' + t('rv.published_auto') : ''; }
  const controls = h('div', { class: 'controls' }, playBtn, tcLabel, subtitle, h('span', { class: 'spacer' }), overlayBtn, pubSwitch, exportOut, exportBtn);

  // thông tin tỉ lệ: cỡ khung · độ vừa từng nền tảng · khung bìa trong clip · chú giải lớp phủ
  const aspectInfo = h('div', { class: 'asp-info' + (portrait ? ' side' : '') });
  function drawAspectInfo() {
    clear(aspectInfo);
    const def = catalog && AspectUI.def(catalog, aspect);
    const chips = fit && Object.keys(fit).length && (portrait || Object.keys(fit).some((k) => fit[k] && fit[k].ok === false)) ? AspectUI.fitChips(fit, catalog) : null;
    aspectInfo.append(h('div', { class: 'asp-row' }, AspectUI.badge(aspect), h('span', { class: 'mono muted small' }, t('rv.size', { w: FW, h: FH }))));
    if (chips) aspectInfo.append(h('div', { class: 'micro' }, t('rv.platforms')), chips);
    if (typeof media.cover_frame_ms === 'number') {
      aspectInfo.append(h('button', { type: 'button', class: 'linkish small', title: t('rv.cover_seek'), onclick: () => seekMs(media.cover_frame_ms) }, icon('image'), t('rv.cover_frame', { tc: fmtTc(media.cover_frame_ms) })));
    }
    if (def && def.safe) aspectInfo.append(h('p', { class: 'muted small asp-legend' }, h('i', { class: 'lg-hard', 'aria-hidden': 'true' }), h('i', { class: 'lg-soft', 'aria-hidden': 'true' }), t('rv.overlay_legend')));
  }

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
    lines.forEach((l) => addBlock(laneVoice, 'L:' + l.id, l.a_ms, l.b_ms, toText(l.id) + ' ' + toText(l.say), castName(l.who) + ' · ' + toText(l.say), 'voice', 0));
    const rowEnds = [];
    beats.forEach((b) => {
      let row = rowEnds.findIndex((e) => e <= b.t_in); if (row < 0) row = rowEnds.length < 2 ? rowEnds.length : 1;
      rowEnds[row] = b.t_out;
      addBlock(laneBeat, 'B:' + b.id, b.t_in, b.t_out, toText(b.block), toText(b.id) + ' · ' + toText(b.block), 'beat', row);
    });
    cues.forEach((c, i) => addBlock(laneSfx, 'C:' + i, c.t_ms, c.t_ms + 150, '', toText(c.name) + ' @' + fmtTc(c.t_ms), 'sfx', 0));
    const allPass = gates.length && gates.every((g) => g.result === 'pass');
    laneGate.append(h('div', { class: 'gate-strip tone-' + (allPass ? 'ok' : gates.some((g) => g.result === 'fail') ? 'danger' : 'warn'), title: t('room.gates') }));
    // mốc vi phạm G-SAFE trên làn Cổng: bấm ⇒ tua tới đó và đánh dấu trên khung
    const safe = gates.find((g) => g.gate === 'G-SAFE');
    ((safe && safe.measure && safe.measure.violations) || []).forEach((v, i) => {
      if (typeof v.t_ms !== 'number') return;
      const b = addBlock(laneGate, 'S:' + i, v.t_ms, v.t_ms + 150, '', 'G-SAFE ' + safeItemText(v) + ' @' + fmtTc(v.t_ms), 'gmark', 0);
      b.addEventListener('click', () => { setOverlay(true); markBox(v.box); });
    });
    drawExtraLanes();
    paintSel();
  }
  // ---- làn tuỳ chọn (review-lanes/*.js) ----
  const extraLanes = [];
  const laneEnv = () => ({ plan, lines, beats, cues, gates, castName, pct, total, seekMs, addBlock, h, clear, t });
  function drawExtraLanes() {
    for (const l of extraLanes) {
      clear(l.track);
      try { if (l.draw) l.draw(laneEnv(), l.track); } catch (e) { console.error('làn ' + l.key, e); }
    }
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
    if (ln) subtitle.append(h('span', { class: 'who' }, castName(ln.who) + ': '), ...termSpans(ln.say, ln.terms));
    for (const l of lines) { const b = blocks.get('L:' + l.id); if (b) b.classList.toggle('active', ln && ln.id === l.id && ms <= l.b_ms); }
  }
  function seekMs(ms) {
    curMs = Math.max(0, Math.min(total(), ms));
    if (videoUrl && video.readyState > 0) video.currentTime = curMs / 1000;
    paint();
  }
  let raf = 0;
  const tick = () => { curMs = video.currentTime * 1000; paint(); if (!video.paused) raf = requestAnimationFrame(tick); };
  video.addEventListener('play', () => { playBtn.replaceChildren(icon('pause')); playBtn.setAttribute('aria-label', t('room.pause')); markLayer.hidden = true; raf = requestAnimationFrame(tick); });
  video.addEventListener('pause', () => { playBtn.replaceChildren(icon('play')); playBtn.setAttribute('aria-label', t('room.play')); cancelAnimationFrame(raf); });
  video.addEventListener('timeupdate', () => { if (video.paused) { curMs = video.currentTime * 1000; paint(); } });
  video.addEventListener('loadedmetadata', () => { if (!durMs) { durMs = video.duration * 1000; drawTimeline(); } paint(); });
  video.addEventListener('seeked', () => { curMs = video.currentTime * 1000; paint(); });
  function toggle() { if (!videoUrl) return; if (video.paused) video.play().catch(() => {}); else video.pause(); }
  disposers.push(() => { cancelAnimationFrame(raf); video.pause(); video.removeAttribute('src'); video.load(); });

  // ---- bảng cổng ----
  const gateByName = new Map(gates.map((g) => [g.gate, g]));
  const gateNames = gates.map((g) => g.gate);   // đúng thứ tự máy chủ trả (cổng áp cho loại bài)
  const passN = gates.filter((g) => g.result === 'pass').length;
  const gateTone = (res) => (res === 'pass' ? 'ok' : res === 'fail' ? 'danger' : res === 'pending' ? 'idle' : 'warn');
  // chi tiết G-SAFE: vi phạm + cảnh báo, mỗi dòng tua được tới mốc đo và khoanh hộp trên khung
  function safeDetail(m) {
    const item = (v, kind) => {
      const at = typeof v.t_ms === 'number';
      return h('li', { class: 'safe-item ' + kind },
        h('span', { class: 'mono rule tone-' + (kind === 'viol' ? 'danger' : 'warn') }, toText(v.rule)),
        h('span', { class: 'small' }, safeItemText(v)),
        at ? h('button', { type: 'button', class: 'linkish mono small', title: t('rv.safe.show'), onclick: () => { seekMs(v.t_ms); setOverlay(true); markBox(v.box); } }, fmtTc(v.t_ms)) : null);
    };
    const vs = m.violations || [], ws = m.warnings || [];
    return h('div', { class: 'safe-detail' },
      h('div', { class: 'micro' }, t('rv.safe.violations') + ' · ' + vs.length),
      vs.length ? h('ul', { class: 'safe-list' }, vs.map((v) => item(v, 'viol'))) : h('p', { class: 'muted small' }, t('rv.safe.none')),
      ws.length ? h('div', { class: 'micro' }, t('rv.safe.warnings') + ' · ' + ws.length) : null,
      ws.length ? h('ul', { class: 'safe-list' }, ws.map((v) => item(v, 'warn'))) : null);
  }
  const gateRows = gateNames.map((n) => {
    const g = gateByName.get(n);
    const res = toText(g.result);
    const rowEl = h('div', { class: 'gate-row', role: 'row' }, h('span', { class: 'mono', role: 'cell' }, n),
      h('span', { role: 'cell' }, badge(tOr('gate.' + res, tOr('rv.gate.' + res, res)), gateTone(res))),
      h('span', { class: 'muted mono small', role: 'cell' }, measureText(g.measure, g.gate)));
    if (n === 'G-SAFE' && g.measure && g.measure.samples) {
      const det = safeDetail(g.measure); det.hidden = !((g.measure.violations || []).length);
      const tg = h('button', { type: 'button', class: 'icon-btn gate-more', 'aria-expanded': det.hidden ? 'false' : 'true', 'aria-label': t('rv.safe.title'), title: t('rv.safe.title'),
        onclick: () => { det.hidden = !det.hidden; tg.setAttribute('aria-expanded', det.hidden ? 'false' : 'true'); } }, icon('list'));
      rowEl.append(tg);
      return [rowEl, det];
    }
    return rowEl;
  });
  const gatePanel = h('section', { class: 'panel' }, h('div', { class: 'micro' }, t('room.gates') + ' · ' + passN + '/' + gates.length),
    gateNames.length ? h('div', { class: 'gate-table', role: 'table' }, gateRows) : h('p', { class: 'muted' }, t('room.no_gates')));

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
    drafts.push(d); setTab('gates'); drawNotes(); d.ta.focus();
  }
  const noteList = () => drafts.filter((d) => d.text.trim()).map((d) => ({ pin_kind: d.pin_kind, pin_ref: d.pin_ref, text: d.text.trim() }));
  const decideBtn = h('button', { type: 'button', class: 'btn primary wide', hidden: decided, onclick: openDecision }, t('room.decide'), h('span', { class: 'mono kbd' }, '⌘↵'));
  const notesPanel = h('section', { class: 'panel grow' }, h('div', { class: 'micro' }, t('room.notes')),
    h('button', { type: 'button', class: 'btn', hidden: decided, onclick: pinNote }, icon('plus'), t('room.pin'), h('span', { class: 'mono kbd' }, 'M')), notesBox);
  function updateDecide() { if (changesBtn) { const ok = noteList().length > 0; changesBtn.disabled = !ok; changesHint.hidden = ok; } }

  // ---- cảnh báo nhân vật chưa chốt (CNS-110) ----
  const castBox = h('div', { class: 'cast-warn-box' });
  const unapproved = () => (room.cast || []).filter((c) => !c.approved && c.status !== 'retired');
  function castWarnings(compact) {
    const list = unapproved();
    if (!list.length) return [];
    return [h('div', { class: 'banner warn cast-warn', role: 'note' },
      h('div', { class: 'banner-main' }, icon('warn'),
        h('ul', null, list.map((c) => h('li', { class: 'small' }, t('rv.cast.unapproved', { name: toText(c.name), v: toText(c.version) })))),
        compact ? null : h('a', { class: 'btn', href: buildHash('cast', toText(list[0].display_id)) }, t('rv.cast.open'))))];
  }
  function drawCastBox() { clear(castBox); castBox.append(...castWarnings(false)); }

  // ---- ảnh bìa (tab) ----
  const thumbPanel = h('section', { class: 'panel thumb-panel' });
  let shelf = false;
  function thumbVariants() {
    // gộp số đo G-THUMB (mọi phương án, kể cả trượt) với ảnh đã đạt (media.thumbs)
    const g = gateByName.get('G-THUMB');
    const mv = (g && g.measure && Array.isArray(g.measure.variants)) ? g.measure.variants : [];
    const idxs = new Set([...mv.map((v) => v.index), ...thumbs.map((x) => x.variant)].filter((x) => x != null));
    return [...idxs].sort((a, b) => a - b).map((i) => {
      const m = mv.find((v) => v.index === i) || {}, th = thumbs.find((x) => x.variant === i) || null;
      const spec = thumbSpecs && thumbSpecs[i];
      return { index: i, pass: th ? th.pass !== false : !!m.pass, score: th && th.score != null ? th.score : m.score, img: th && th.w1280, thumb: th, fails: Array.isArray(m.fails) ? [...new Set(m.fails.map((f) => f.rule))] : [], headline: spec && spec.headline, template: spec && spec.template };
    });
  }
  function lockReason() {
    if (!isOwner) return t('rv.thumb.owner_only');
    if (room.exported_at) return t('rv.thumb.locked_exported');
    if (!['awaiting_review', 'approved'].includes(state)) return t('rv.thumb.locked_state');
    return null;
  }
  async function pickThumb(v) {
    try {
      await post('/api/renders/' + encodeURIComponent(id) + '/thumbnail', { variant: v.index });
      room.thumbnail_pick = toText(v.img).split('/').pop();
      toast(t('rv.thumb.saved', { n: v.index + 1 }), 'ok'); drawThumbs();
    } catch (e) { toast((e && e.text_human) || t('err.generic'), 'danger'); }
  }
  function drawThumbs() {
    clear(thumbPanel);
    const vs = thumbVariants();
    if (!vs.length) { thumbPanel.append(h('p', { class: 'muted small' }, t('rv.thumb.none'))); return; }
    const picked = pickedIndex(thumbs, room.thumbnail_pick);
    const pickedVar = picked >= 0 ? thumbs[picked].variant : null;
    const best = bestIndex(thumbs);
    const lock = lockReason();
    const [sw, sh] = portrait ? [94, 168] : [168, 94];
    const shelfBtn = h('button', { type: 'button', class: 'btn' + (shelf ? ' on' : ''), 'aria-pressed': shelf ? 'true' : 'false', onclick: () => { shelf = !shelf; drawThumbs(); } }, icon('image'), t('rv.thumb.shelf', { w: sw, h: sh }));
    thumbPanel.append(h('div', { class: 'thumb-head' }, h('span', { class: 'micro' }, t('rv.thumb.head')), h('span', { class: 'spacer' }), shelfBtn));
    const grid = h('div', { class: 'thumb-grid' + (portrait ? ' vert' : '') + (shelf ? ' shelf' : ''), role: 'radiogroup', 'aria-label': t('rv.thumb.head') });
    for (const v of vs) {
      const on = pickedVar === v.index;
      const can = !lock && v.pass && v.img;
      const card = h('button', { type: 'button', role: 'radio', 'aria-checked': on ? 'true' : 'false', class: 'thumb-card' + (on ? ' on' : '') + (v.pass ? '' : ' failed'),
        disabled: !can && !on, 'aria-label': t('rv.thumb.pick', { n: v.index + 1 }), onclick: () => { if (can && !on) pickThumb(v); } },
        h('div', { class: 'thumb-img', style: { aspectRatio: portrait ? '9 / 16' : '16 / 9', width: shelf ? sw + 'px' : null } },
          v.img ? h('img', { src: v.img, alt: toText(v.headline || ''), loading: 'lazy' }) : h('span', { class: 'muted small' }, icon('x')),
          on ? h('span', { class: 'thumb-on' }, icon('check'), t('rv.thumb.picked')) : null),
        h('div', { class: 'thumb-meta' },
          h('div', { class: 'thumb-l1' }, h('span', null, t('rv.thumb.variant', { n: v.index + 1 })),
            v.pass ? h('span', { class: 'tone-ok small' }, icon('check'), t('rv.thumb.pass')) : h('span', { class: 'tone-danger small' }, icon('x'), t('rv.thumb.fail', { rules: v.fails.join('/') || '—' }))),
          v.headline ? h('div', { class: 'thumb-hl' }, toText(v.headline)) : null,
          h('div', { class: 'mono muted small' }, (v.template ? toText(v.template) + ' · ' : '') + (v.score != null ? t('rv.thumb.score', { s: num(v.score, 2) }) : ''))));
      grid.append(card);
    }
    thumbPanel.append(grid);
    if (pickedVar == null && best >= 0) thumbPanel.append(h('p', { class: 'muted small' }, t('rv.thumb.auto', { n: thumbs[best].variant + 1 })));
    if (lock) thumbPanel.append(h('p', { class: 'muted small' }, icon('warn'), ' ', lock));
    if (typeof media.cover_frame_ms === 'number') thumbPanel.append(h('button', { type: 'button', class: 'linkish small', onclick: () => seekMs(media.cover_frame_ms) }, icon('film'), t('rv.cover_frame', { tc: fmtTc(media.cover_frame_ms) })));
  }

  // ---- tab cột phải ----
  const hasThumbs = thumbs.length > 0 || !!(gateByName.get('G-THUMB'));
  let tab = 'gates';
  const tabBtn = (k, label) => h('button', { type: 'button', role: 'tab', class: 'tab', 'data-k': k, onclick: () => setTab(k) }, label);
  const tabsEl = h('div', { class: 'tabs small rv-tabs', role: 'tablist', hidden: !hasThumbs },
    tabBtn('gates', t('rv.tab.gates')), tabBtn('thumbs', t('rv.tab.thumbs') + (thumbs.length ? ' · ' + thumbs.length : '')));
  const gatesWrap = h('div', { class: 'rv-pane' }, gatePanel, notesPanel);
  const thumbsWrap = h('div', { class: 'rv-pane', hidden: true }, thumbPanel);
  function setTab(k) {
    tab = k; gatesWrap.hidden = k !== 'gates'; thumbsWrap.hidden = k !== 'thumbs';
    for (const b of tabsEl.children) { const on = b.dataset.k === k; b.classList.toggle('active', on); b.setAttribute('aria-selected', on ? 'true' : 'false'); }
    if (k === 'thumbs') drawThumbs();
  }

  // ---- quyết định ----
  let changesBtn = null; let changesHint = null; let busy = false;
  function openDecision() {
    if (decided || dialogOpen) return;
    dialogOpen = true;
    changesHint = h('p', { class: 'muted small' }, t('room.changes_need_note'));
    const picked = pickedIndex(thumbs, room.thumbnail_pick), best = bestIndex(thumbs);
    const thumbLine = picked >= 0 ? h('p', { class: 'decide-line' }, icon('image'), t('rv.decide.thumb', { n: thumbs[picked].variant + 1 }))
      : best >= 0 ? h('p', { class: 'decide-line' }, icon('image'), t('rv.decide.thumb_auto', { n: thumbs[best].variant + 1 })) : null;
    const body = h('div', null, h('p', null, t('room.decide_hint')), thumbLine, castWarnings(true), changesHint);
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
        state = 'approved'; stamp.hidden = false; stamp.classList.add('press'); exportBtn.hidden = false; pubSwitch.hidden = false; paintPub();
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
      loadRoom();
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
      case 'u': case 'U': if (!overlayBtn.hidden) { e.preventDefault(); setOverlay(!overlayOn); } break;
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
    AspectUI.badge(aspect),
    h('span', { class: 'spacer' }),
    h('span', { class: 'clock' }, icon('clock'), clock),
    h('a', { class: 'btn', href: buildHash('review') }, t('room.exit'), h('span', { class: 'mono kbd' }, 'Esc')));
  const dockRail = h('aside', { class: 'dock rail', 'aria-label': t('dock.title'), title: t('dock.title') + ' — ' + t('dock.soon') }, icon('chat'));
  const stage = h('div', { class: 'vid-stage' + (portrait ? ' portrait' : '') }, vidBox, portrait ? aspectInfo : null);
  root.append(top, h('div', { class: 'theater-body' + (portrait ? ' is-portrait' : '') },
    h('div', { class: 'theater-left' }, h('div', { class: 'vid-area' }, stage, controls, portrait ? null : aspectInfo), timeline),
    h('aside', { class: 'theater-right' }, castBox, tabsEl, gatesWrap, thumbsWrap, h('div', { class: 'decide-bar' }, decideBtn)),
    dockRail));
  drawTimeline(); drawNotes(); paint(); drawAspectInfo(); setTab('gates');

  // dữ liệu phụ (không chặn hiển thị): danh mục tỉ lệ (lớp phủ), trạng thái xuất/đăng + nhân vật, chữ ảnh bìa từ đặc tả bài
  AspectUI.load().then((cat) => {
    if (!root.isConnected) return;
    catalog = cat; const def = AspectUI.def(cat, aspect);
    const ov = def && def.safe ? AspectUI.safeOverlay(def, { tier: 'both' }) : null;
    if (ov) { overlayLayer.append(ov); overlayBtn.hidden = false; overlayBtn.title = t('rv.overlay_off'); }
    drawAspectInfo();
  }).catch((e) => { if (root.isConnected) aspectInfo.append(errorBanner({ code: (e && e.code) || 'aspects', text_human: t('lsn.asp.err_load'), detail: e && (e.detail || e.message) })); });
  function loadRoom() {
    return get('/api/renders/' + encodeURIComponent(id) + '/room').then((x) => {
      if (!root.isConnected || !x) return;
      room = Object.assign(room, x); paintPub(); drawCastBox(); if (tab === 'thumbs') drawThumbs();
    }).catch(() => { /* phần phụ: lỗi thì giữ giao diện chính */ });
  }
  loadRoom();
  if (hasThumbs && lessonRef) {
    get('/api/lessons/' + encodeURIComponent(lessonRef) + '/ext').then((x) => {
      thumbSpecs = x && x.thumbnail && Array.isArray(x.thumbnail.variants) ? x.thumbnail.variants : null;
      if (root.isConnected && tab === 'thumbs') drawThumbs();
    }).catch(() => { /* chữ tiêu đề là phần phụ */ });
  }
  loadLaneModules().then((mods) => {
    if (!root.isConnected && !timeline.isConnected) return;
    for (const m of mods) {
      let l = null;
      try { l = m.lane(laneEnv()); } catch (e) { console.error('review-lane', e); }
      if (!l || !l.key) continue;
      const trk = track('x-' + l.key); trk.addEventListener('click', seekFromEvent);
      timeline.insertBefore(h('div', { class: 'lane l-' + l.key }, h('div', { class: 'lane-label micro' }, toText(l.label || l.key)), trk), timeline.querySelector('.playhead-wrap'));
      timeline.classList.add('has-' + l.key);
      extraLanes.push({ key: l.key, track: trk, draw: l.draw });
    }
    drawExtraLanes(); paintSel();
  });
  return disposers;
}
