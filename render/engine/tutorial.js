// © 2026 Gen Labs — All rights reserved.
// Nhánh `tutorial` của buildPlan (SPEC-0.2.0 §2.1, §6) — thuần, không DOM, tất định. Gói U sở hữu.
// buildTutorialPlan(input) → plan CÙNG cấu trúc với bài thường (plan v2) + trường `tutorial` (hình học + lịch sự kiện cho sân khấu và G-CURSOR).
//   input = input của buildPlan; lesson.kind === 'tutorial'; lesson.screens (lesson_versions.screens), lesson.host {cast, mode:'pip'|'none'}, lesson.music, lesson.variant 'full'|'trailer'.
//   Bước con trỏ là Beat neo vào chữ (phương án A §6.3): cursor/focus/callout/keystroke/screen; mốc neo = khoảnh khắc hành động.
// Hình học: "thế giới" = khung 1920×1080 ở máy quay {960,540,1}; màn đặt vào hộp FIT (tránh PiP góc trái dưới và dải phụ đề), có khung thiết bị (browser/desktop/none).
// Máy quay theo vùng: camera.buildRegions (focus ⇒ phóng); con trỏ: cursor-path.compile (Fitts + minimum-jerk, không di khi máy quay lia).
// Trợ giúp hình học dùng chung cho G-CURSOR (media/gates/cursor.js): screenAt, scrollAt, targetBox, camAt, frameBox, PIP, SAFE.
'use strict';
const registry = require('../blocks/registry');
const camera = require('./camera');
const CP = require('./cursor-path');
const mockUi = require('../blocks/mock-ui');
const { PlanError } = require('./plan-error');
const aspects = require('../aspects');

const PACE = { full: { lead: 1100, gap: 500, tail: 2600, hold: 5000, endHold: 2400 }, trailer: { lead: 400, gap: 200, tail: 1800, hold: 2600, endHold: 2200 } };
const FIT = { x0: 336, y0: 36, x1: 1880, y1: 900 };
const CHROME_H = { browser: 52, desktop: 34, none: 0 };
const SAFE = { x0: 48, y0: 48, x1: 1872, y1: 880 };
const PIP = { x: 24, y: 775, w: 281, h: 281 };          // khớp render/stage/tutorial.css (.pip)
const ANCHOR = { x: 1000, y: 470 };                     // điểm khung đặt đích khi phóng
const DEFAULT_ACCENT = '#FF6F59';
const TRANS_MS = { fade: 400, slide: 400, cut: 0 };
const LIMITS = { screens: 12, steps: 120 };
const CLICKY = ['button', 'nav', 'tab', 'item', 'toggle', 'row', 'card', 'badge', 'image'];
const STEP_BLOCKS = ['cursor', 'focus', 'callout', 'keystroke', 'screen'];
const tokensOf = say => String(say).trim().split(/\s+/).filter(Boolean);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const r2 = v => Math.round(v * 100) / 100;

// ---------- câu (nhịp theo biến thể) ----------
function estimateMs(say) { return Math.round(tokensOf(say).length * 340 + 400); }
function proportionalWords(say, durMs) {
  const toks = tokensOf(say), total = toks.reduce((s, w) => s + w.length + 1, 0); let c = 0;
  return toks.map(w => { const t0 = Math.round(durMs * c / total); c += w.length + 1; return { w, t0, t1: Math.round(durMs * (c - 1) / total) }; });
}
function synthEnvelope(words, durMs, fps) {
  const n = Math.max(1, Math.ceil(durMs / 1000 * fps)), env = [];
  for (let i = 0; i < n; i++) { const t = i / fps * 1000; const w = words.find(x => t >= x.t0 && t <= x.t1); env.push(w ? +(0.45 + 0.4 * Math.abs(Math.sin(i * 0.9))).toFixed(3) : 0.05); }
  return env;
}
function buildLines(lesson, clips, pace, leadMs) {
  let cur = leadMs || pace.lead;
  return lesson.lines.map(l => {
    const c = (clips && clips[l.id]) || {}, dur = c.duration_ms > 0 ? Math.round(c.duration_ms) : estimateMs(l.say);
    const rel = Array.isArray(c.word_times) && c.word_times.length ? c.word_times : proportionalWords(l.say, dur);
    const a = cur, b = a + dur; cur = b + (Number.isFinite(l.pause_ms) ? l.pause_ms : pace.gap);
    const words = rel.map(x => ({ w: x.w, t0: a + Math.round(x.t0), t1: a + Math.round(x.t1) }));
    const envelope = Array.isArray(c.envelope) && c.envelope.length ? c.envelope : synthEnvelope(rel, dur, 30);
    return { id: l.id, who: l.who, say: l.say, lang: l.lang || 'vi', terms: l.terms || [], subtitle: l.subtitle || null, mood: l.mood || null, a_ms: a, b_ms: b, words, envelope, env_fps: 30 };
  });
}

// ---------- màn hình ----------
// Đặt một màn vào khung: tỉ lệ s = vừa hộp FIT (trừ thanh khung thiết bị); thiết bị canh giữa ngang (không lấn sang PiP), giữa dọc trong FIT.
function placeScreen(sc) {
  const view = sc.view, chH = CHROME_H[sc.chrome] || 0, fw = FIT.x1 - FIT.x0, fh = FIT.y1 - FIT.y0;
  const s = Math.min(fw / view[0], (fh - chH) / view[1]), w = Math.round(view[0] * s), h = Math.round(view[1] * s);
  const dx = Math.max(FIT.x0, Math.round((1920 - w) / 2)), dy = Math.round(FIT.y0 + (fh - h - chH) / 2);
  return { s: +s.toFixed(6), device: { x: dx, y: dy, w, h: h + chH }, rect: { x: dx, y: dy + chH, w, h } };
}
function resolveScreens(list) {
  if (!Array.isArray(list) || !list.length) throw new PlanError('tutorial_screens', 'Bài hướng dẫn cần ít nhất một màn hình (screens).');
  if (list.length > LIMITS.screens) throw new PlanError('tutorial_screens', `Tối đa ${LIMITS.screens} màn hình mỗi bài (đang có ${list.length}).`);
  const seen = new Set();
  return list.map((sc, i) => {
    const id = sc && sc.id;
    if (typeof id !== 'string' || !id) throw new PlanError('tutorial_screens', `screens[${i}] thiếu id.`);
    if (seen.has(id)) throw new PlanError('tutorial_screens', `Màn ${id} bị trùng id.`); seen.add(id);
    const src = sc.source || {}, chrome = sc.chrome || 'browser', out = { id, chrome, url_label: sc.url_label || '' };
    if (src.mock) {
      const errs = mockUi.validate(src.mock);
      if (errs.length) throw new PlanError('tutorial_mock', `Màn ${id}: ${errs.slice(0, 3).join('; ')}`, { screen: id, errors: errs });
      const lay = mockUi.layout(src.mock);
      Object.assign(out, { kind: 'mock', mock: src.mock, size: [lay.w, lay.h], view: [lay.w, lay.h], main: lay.main, scrollMax: lay.scrollMax, zmax: 2.5,
        targets: Object.fromEntries(Object.entries(lay.targets).map(([k, b]) => [k, b])), redact: [] });
    } else if (typeof src.asset === 'string' && src.asset) {
      const size = sc.size;
      if (!Array.isArray(size) || size.length !== 2 || !size.every(n => Number.isInteger(n) && n > 0)) throw new PlanError('tutorial_screens', `Màn ${id}: ảnh chụp cần size [w,h] (px nguồn).`);
      const vh = Number.isInteger(sc.view_h) && sc.view_h > 0 ? Math.min(sc.view_h, size[1]) : size[1];
      const targets = {};
      Object.entries(sc.targets || {}).forEach(([k, b]) => { targets[k] = { x: b.x, y: b.y, w: b.w, h: b.h, label: b.label || k, kind: b.kind || 'button', scroll: vh < size[1], draggable: !!b.draggable }; });
      Object.assign(out, { kind: 'asset', asset: src.asset, size: size.slice(), view: [size[0], vh], main: { x: 0, y: 0, w: size[0], h: vh }, scrollMax: size[1] - vh, targets,
        redact: (sc.redact || []).map(r => ({ x: r.x, y: r.y, w: r.w, h: r.h, style: r.style === 'mosaic' ? 'mosaic' : 'solid' })) });
    } else throw new PlanError('tutorial_screens', `Màn ${id}: source phải có mock (DSL) hoặc asset.`);
    Object.assign(out, placeScreen(out));
    if (out.kind === 'asset') out.zmax = Math.max(1, Math.floor(Math.min(2.5, 1.5 / out.s) * 1e4) / 1e4);   // không phóng quá độ nét ảnh nguồn (C8; làm tròn XUỐNG)
    return out;
  });
}

// ---------- trợ giúp hình học (dùng chung với G-CURSOR) ----------
const byScreen = plan => { const m = {}; (plan.screens || []).forEach(s => { m[s.id] = s; }); return m; };
function screenAt(plan, t) { let cur = null; for (const s of plan.tutorial.screenline) { if (s.t0 <= t) cur = s; else break; } return cur; }
function scrollAt(plan, screenId, t) {
  let y = 0;
  for (const a of plan.tutorial.scrolls) { if (a.screen !== screenId || t < a.t0) continue; y = t >= a.t1 ? a.to : a.from + (a.to - a.from) * camera.easeInOutCubic((t - a.t0) / (a.t1 - a.t0)); }
  return y;
}
// hộp đích trên màn (px màn, đã trừ cuộn) + có nhìn thấy không (nằm trong vùng cắt cuộn)
function targetScreenBox(plan, sc, name, t) {
  const b = sc.targets[name]; if (!b) return null;
  const y = b.scroll ? b.y - scrollAt(plan, sc.id, t) : b.y, m = sc.main;
  const visible = !b.scroll || (y >= m.y - 1 && y + b.h <= m.y + m.h + 1);
  return { x: b.x, y, w: b.w, h: b.h, visible, kind: b.kind, label: b.label, draggable: b.draggable };
}
function toDisplay(sc, b) { return { x: sc.rect.x + b.x * sc.s, y: sc.rect.y + b.y * sc.s, w: b.w * sc.s, h: b.h * sc.s }; }
function targetBox(plan, screenId, name, t) {
  const sc = byScreen(plan)[screenId]; if (!sc) return null;
  const b = targetScreenBox(plan, sc, name, t); if (!b) return null;
  return Object.assign(toDisplay(sc, b), { visible: b.visible, kind: b.kind, label: b.label });
}
const camAt = (plan, t) => camera.sample(plan.camera, t);
const frameBox = (plan, b, t) => camera.boxToFrame(camAt(plan, t), b);

// thẻ chú thích: ≤ 2 dòng; chọn phía nằm trọn khung an toàn, không chạm PiP (auto: phải → dưới → trên → trái)
function calloutBox(fb, text, side, pip) {
  const fs = 26, lines = String(text).length > 30 ? balance(text) : [String(text)];
  const w = Math.round(Math.min(600, Math.max.apply(null, lines.map(l => mockUi.textW(l, fs))) + 48)), h = lines.length * 36 + 28, g = 26;
  const cx = fb.x + fb.w / 2, cy = fb.y + fb.h / 2;
  const at = { right: { x: fb.x + fb.w + g, y: cy - h / 2 }, left: { x: fb.x - g - w, y: cy - h / 2 }, bottom: { x: cx - w / 2, y: fb.y + fb.h + g }, top: { x: cx - w / 2, y: fb.y - g - h } };
  const order = side && side !== 'auto' ? [side] : ['right', 'bottom', 'top', 'left'];
  const ok = b => b.x >= SAFE.x0 && b.y >= SAFE.y0 && b.x + b.w <= SAFE.x1 && b.y + b.h <= SAFE.y1 && !(pip && hit(b, pip));
  let pick = null;
  for (const s of order) { const p = at[s], b = { x: Math.round(p.x), y: Math.round(p.y), w, h, side: s }; if (ok(b)) { pick = b; break; } if (!pick) pick = b; }
  return Object.assign(pick, { lines, fs });
}
function balance(text) {
  const words = String(text).trim().split(/\s+/); let best = 1, bd = 1e9;
  for (let i = 1; i < words.length; i++) { const d = Math.abs(words.slice(0, i).join(' ').length - words.slice(i).join(' ').length); if (d < bd) { bd = d; best = i; } }
  return words.length < 2 ? [text] : [words.slice(0, best).join(' '), words.slice(best).join(' ')];
}
const hit = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const inSafe = b => b.x >= SAFE.x0 && b.y >= SAFE.y0 && b.x + b.w <= SAFE.x1 && b.y + b.h <= SAFE.y1;

// ---------- neo chữ (cùng luật với timeline.js) ----------
function anchorAt(line, anchor) {
  const tl = require('./timeline');
  return tl.anchorTime(line, anchor).t;
}

function buildTutorialPlan(input) {
  // F7 §5.2: tutorial chỉ dựng ở tỉ lệ có `tutorial` trong `kinds` (0.2.0: chỉ 16:9) — lưới an toàn thứ hai sau aspects.resolve lúc nộp bài
  const asp = input.aspect || '16:9', ad = aspects.get(asp);
  if (!ad || ad.kinds.indexOf('tutorial') < 0) throw new PlanError('aspect_kind_unsupported', aspects.TUTORIAL_BLOCKED, { aspect: asp, kind: 'tutorial' });
  const lesson = input.lesson || {}, fps = input.fps || 30;
  const variant = input.variant || lesson.variant || 'full';
  if (!['full', 'trailer'].includes(variant)) throw new PlanError('tutorial_variant', `variant phải là full hoặc trailer (đang "${variant}").`);
  const pace = PACE[variant];
  if (!Array.isArray(lesson.lines) || !lesson.lines.length) throw new PlanError('no_lines', 'Bài chưa có câu thoại nào.');
  const screens = resolveScreens(input.screens || lesson.screens);
  const scMap = {}; screens.forEach(s => { scMap[s.id] = s; });

  // nhân vật + host (§6.6): pip (mặc định, 1 người nói) | none (ẩn). intro_outro cần sân khấu đổi bố cục theo thời gian — chưa có ở bản này.
  const dflt = (!input.cast || !Object.keys(input.cast).length) ? require('../cast').defaults() : null;
  const castIn = dflt ? dflt.cast : input.cast, parts = input.parts || (dflt ? dflt.parts : []);
  // nhận diện kênh (gói B): intro bật ⇒ câu đầu đợi intro tan (như nhánh bài thường), cả trailer
  const bi = input.brand && input.brand.intro && input.brand.intro.enabled && input.brand.intro.kind !== 'none' ? Math.min(3000, input.brand.intro.duration_ms | 0) : 0;
  const lines = buildLines(lesson, input.clips, pace, bi ? Math.max(pace.lead, bi + 300) : pace.lead);
  const lineById = {}; lines.forEach(l => { lineById[l.id] = l; });
  const speakers = [];
  lines.forEach(l => { if (!castIn[l.who]) throw new PlanError('cast_missing', 'Nhân vật ' + l.who + ' của câu ' + l.id + ' chưa có trong cast.', { who: l.who, line: l.id }); if (!speakers.includes(l.who)) speakers.push(l.who); });
  const host = Object.assign({ mode: 'pip' }, lesson.host || input.host || {});
  if (!['pip', 'none'].includes(host.mode)) throw new PlanError('tutorial_host', `host.mode "${host.mode}" chưa hỗ trợ ở bản này (có: pip, none).`, { mode: host.mode });
  if (host.mode === 'pip' && speakers.length > 1) throw new PlanError('tutorial_host', `Chế độ PiP chỉ có 1 người nói (đang có ${speakers.length}: ${speakers.join(', ')}).`, { speakers });
  if (speakers.length > 2) throw new PlanError('cast_limit', 'Tối đa 2 nhân vật nói trong một bài.', { speakers });
  if (!host.cast) host.cast = speakers[0];
  const cast = {}; Object.keys(castIn).filter(k => speakers.includes(k)).forEach(k => { cast[k] = castIn[k]; });
  const pipOn = host.mode === 'pip';
  const actors = Object.keys(cast).map((id, i) => ({ id, side: i === 0 ? 'left' : 'right', name: cast[id].name || id,
    layout: { mode: host.mode === 'none' ? 'hidden' : 'pip', x: i === 0 ? -40 : 1500, y: 0, scale: 1 } }));

  // beats: kiểm khối theo kind tutorial + neo → mốc
  const src = Array.isArray(lesson.beats) ? lesson.beats : [];
  const beats = src.map((b, i) => {
    const v = registry.validate(b.block, b.params, 'tutorial');
    if (!v.ok) throw new PlanError('block_invalid', 'Khối "' + b.block + '" của beat ' + (b.id || i + 1) + ' sai tham số: ' + v.errors.join('; '), { beat: b.id || null, errors: v.errors });
    const line = lineById[b.anchor && b.anchor.line];
    if (!line) throw new PlanError('anchor_line', 'Beat ' + (b.id || i + 1) + ' neo vào câu không có (' + (b.anchor && b.anchor.line) + ').', { beat: b.id || null });
    const t = anchorAt(line, b.anchor);
    return { id: b.id || 'BT-auto-' + (i + 1), block: b.block, params: b.params === undefined ? {} : b.params, anchor: b.anchor, line: line.id, t_anchor: t, t_in: t, _order: i };
  }).sort((p, q) => p.t_in - q.t_in || p._order - q._order);
  if (beats.filter(b => b.block === 'cursor' || b.block === 'focus' || b.block === 'callout').length > LIMITS.steps) throw new PlanError('tutorial_steps', `Tối đa ${LIMITS.steps} bước mỗi bài.`);
  const lastEnd = lines[lines.length - 1].b_ms;

  // màn theo thời gian
  const screenBeats = beats.filter(b => b.block === 'screen');
  if (!screenBeats.length) throw new PlanError('tutorial_screens', 'Bài hướng dẫn cần ít nhất một beat "screen" để hiện màn hình.');
  screenBeats.forEach(b => { if (!scMap[b.params.screen]) throw new PlanError('tutorial_screen_ref', `Beat ${b.id}: màn "${b.params.screen}" không có trong screens (có: ${screens.map(s => s.id).join(', ')}).`, { beat: b.id }); });
  const firstScreenT = screenBeats[0].t_in;
  const screenline = screenBeats.map(b => ({ beat: b.id, screen: b.params.screen, t0: b.t_in, fade: TRANS_MS[b.params.transition || 'fade'], transition: b.params.transition || 'fade' }));
  const tut = { variant, accent: DEFAULT_ACCENT, screenline, scrolls: [], pip: pipOn ? Object.assign({}, PIP) : null, safe: Object.assign({}, SAFE), cursorFrom: firstScreenT, host };
  const brand = input.brand || null;
  if (brand && brand.tokens && typeof brand.tokens.accent === 'string' && /^#[0-9a-fA-F]{6}$/.test(brand.tokens.accent)) tut.accent = brand.tokens.accent;
  const shell = { screens, tutorial: tut, camera: [] };

  // khối thế giới (title…) chỉ làm mở đầu trước màn đầu tiên — màn phủ cả khung nên khối trang vở sau đó sẽ bị che
  const worldBeats = beats.filter(b => !STEP_BLOCKS.includes(b.block) && registry.get(b.block).place !== 'hud');
  worldBeats.forEach(b => { if (b.t_in >= firstScreenT) throw new PlanError('tutorial_world_block', `Beat ${b.id} (${b.block}) nằm sau màn đầu tiên nên bị màn hình che; trong bài hướng dẫn khối "${b.block}" chỉ dùng làm mở đầu (neo trước beat screen đầu tiên).`, { beat: b.id }); });
  if (worldBeats.length > 1) throw new PlanError('tutorial_world_block', `Bài hướng dẫn chỉ có 1 khối mở đầu trên trang vở (đang có ${worldBeats.length}: ${worldBeats.map(b => b.id).join(', ')}).`);

  // cuộn (đổi vị trí đích về sau) — tính trước khi biên dịch con trỏ
  const stepBeats = beats.filter(b => b.block === 'cursor');
  stepBeats.forEach(b => {
    if (b.params.action !== 'scroll') return;
    const s = screenAt(shell, b.t_in); if (!s) return;
    const sc = scMap[s.screen], from = scrollAt(shell, sc.id, b.t_in), to = clamp(from + b.params.dy, 0, sc.scrollMax);
    const dur = Math.round(clamp(600 + Math.abs(to - from) * 0.4, 600, 900));
    tut.scrolls.push({ beat: b.id, screen: sc.id, t0: b.t_in, t1: b.t_in + dur, from, to, dy: b.params.dy });
  });

  // bước con trỏ: phân giải đích trên màn đang hiện tại lúc hành động
  const resolveTarget = (b, name, t) => {
    const s = screenAt(shell, t);
    if (!s) throw new PlanError('tutorial_target', `Beat ${b.id}: chưa có màn nào hiện lúc ${Math.round(t)} ms (đặt beat screen trước).`, { beat: b.id });
    const sc = scMap[s.screen], bx = targetScreenBox(shell, sc, name, t);
    if (!bx) throw new PlanError('tutorial_target', `Beat ${b.id}: đích "${name}" không có trên màn ${sc.id} (có: ${Object.keys(sc.targets).slice(0, 12).join(', ') || '—'}).`, { beat: b.id, target: name, screen: sc.id });
    return { sc, bx, disp: toDisplay(sc, bx) };
  };
  const steps = stepBeats.map(b => {
    const p = b.params, r = resolveTarget(b, p.target, b.t_in), d = r.disp, h1 = CP.hash01(b.id, 'px'), h2 = CP.hash01(b.id, 'py');
    const field = r.bx.kind === 'field';
    const pt = p.action === 'type' || (field && p.action === 'click')
      ? { x: d.x + d.w * (0.55 + 0.1 * h1), y: d.y + d.h * (0.45 + 0.1 * h2) }
      : { x: d.x + d.w * (0.5 + (h1 - 0.5) * 0.3), y: d.y + d.h * (0.5 + (h2 - 0.5) * 0.3) };
    const kind = p.action === 'type' || (field && p.action === 'click') ? 'ibeam' : p.action === 'scroll' ? 'arrow' : CLICKY.includes(r.bx.kind) || field ? 'hand' : 'arrow';
    const st = { id: b.id, action: p.action, t: b.t_in, p: pt, W: Math.min(d.w, d.h), kind, target: p.target, screen: r.sc.id, text: p.text, cps: p.cps, label: r.bx.label, box: d };
    if (p.action === 'scroll') st.scrollMs = (tut.scrolls.find(x => x.beat === b.id) || { t1: b.t_in + 700, t0: b.t_in }).t1 - b.t_in;
    if (p.action === 'drag') {
      const r2b = resolveTarget(b, p.to, b.t_in), d2 = r2b.disp;
      st.to = { x: d2.x + d2.w / 2, y: d2.y + d2.h / 2 }; st.toW = Math.min(d2.w, d2.h); st.toTarget = p.to; st.dragBox = { w: Math.round(d.w), h: Math.round(d.h) }; st.toBox = d2;
    }
    return st;
  });

  // máy quay theo vùng: focus ⇒ phóng; giữ tới (hold_ms | focus kế | đổi màn | bước con trỏ cần chỗ ngoài khung nhìn)
  const focusBeats = beats.filter(b => b.block === 'focus');
  const nextAfter = (list, t) => list.find(x => x.t_in > t);
  const regions = focusBeats.map((b, i) => {
    const r = resolveTarget(b, b.params.target, b.t_in);
    const frame = camera.regionFrame({ box: r.disp, zoom: b.params.zoom, zmax: r.sc.zmax, device: r.sc.device, pip: tut.pip, safe: SAFE, anchor: ANCHOR });
    const nf = focusBeats[i + 1], ns = nextAfter(screenBeats, b.t_in);
    const hardEnd = Math.min(nf ? nf.t_in : Infinity, ns ? ns.t_in : Infinity);
    let tEnd = Math.min(b.t_in + (b.params.hold_ms || pace.hold), hardEnd);
    // bước con trỏ sau đó mà đích nằm ngoài khung nhìn ⇒ lùi máy quay xong TRƯỚC khi con trỏ bắt đầu di (con trỏ không di khi máy quay lia)
    // (xét cả bước ngay SAU tEnd: lùi máy quay mất dOut, con trỏ cần T + 150 ms trước mốc — không được chồng nhau)
    // Chỉ xét bước trên CÙNG màn (đổi màn đã chốt tEnd); không cắt vùng trước khi bước trong-khung trước đó làm xong.
    let prevP = null, inViewEnd = b.t_in;
    const dOut = camera.transitionMs(frame, camera.FULL, variant);
    for (const st of steps) {
      if (st.t <= b.t_in) { prevP = st.to || st.p; continue; }
      if (ns && st.t >= ns.t_in) break;
      const D = prevP ? Math.hypot(st.p.x - prevP.x, st.p.y - prevP.y) : 400;
      const T = CP.fittsMs(D, st.W, D * 1.05) + (D > 600 ? 120 : 0), latest = st.t - 150 - T - dOut - 60;
      if (latest >= tEnd) break;
      // ngoài khung nhìn = hộp đích (sau máy quay của vùng) không nằm trọn khung an toàn hoặc chạm PiP — cùng luật C2
      const outOfView = [st.box].concat(st.toBox ? [st.toBox] : []).some(bx => { const f = camera.boxToFrame(frame, bx); return !inSafe(f) || (tut.pip && hit(f, tut.pip)); });
      if (outOfView) { tEnd = Math.max(inViewEnd, Math.min(tEnd, latest)); break; }
      // bước trong khung bắt đầu trước khi vùng hết: giữ phóng tới khi bước làm xong (không lùi máy quay giữa lúc con trỏ dừng/bấm)
      inViewEnd = st.t + (st.action === 'type' ? 400 + 70 * String(st.text || '').length : st.action === 'drag' ? 1600 : st.action === 'scroll' ? 1000 : 250);
      tEnd = Math.min(hardEnd, Math.max(tEnd, inViewEnd));
      prevP = st.to || st.p;
    }
    return { beat: b, frame, t: b.t_in, tEnd, sc: r.sc, disp: r.disp };
  });
  const lastFrameT = Math.max(lastEnd + pace.tail, ...beats.map(b => b.t_in + 1200));
  const cam = camera.buildRegions({ regions: regions.map(r => ({ t: r.t, tEnd: Math.max(r.t + 1, r.tEnd), frame: r.frame })), durationMs: lastFrameT, pace: variant });
  shell.camera = cam.keys;

  // con trỏ
  const sc0 = scMap[screenline[0].screen];
  const startPos = { x: sc0.rect.x + sc0.rect.w * 0.62, y: sc0.rect.y + sc0.rect.h * 0.58 };
  const comp = CP.compile({ steps, camAt: t => camera.sample(cam.keys, t), camMoves: cam.moves, fps, durationMs: lastFrameT, startT: firstScreenT + 300, startPos });
  tut.steps = comp.steps.map((s, i) => Object.assign(s, { target: steps[i].target, screen: steps[i].screen, to: steps[i].toTarget || null }));
  tut.drags = comp.drags.map(d => { const st = steps.find(x => x.id === d.beat); return Object.assign(d, { screen: st.screen, target: st.target, to: st.toTarget }); });
  tut.focus = regions.map((r, i) => {
    const R = cam.regions[i], p = r.beat.params, settled = camera.boxToFrame(r.frame, r.disp);
    const pad = 10, ring = { x: Math.round(settled.x - pad), y: Math.round(settled.y - pad), w: Math.round(settled.w + 2 * pad), h: Math.round(settled.h + 2 * pad) };
    return { beat: r.beat.id, block: 'focus', screen: r.sc.id, target: p.target, t: R.t, arrive: R.arrive, tEnd: R.tEnd, out: R.out, z: r.frame.z, box: r.disp, ring: p.ring === false ? null : ring,
      dim: p.dim === undefined ? 0.55 : p.dim, callout: p.callout ? calloutBox(ring, p.callout, p.side, tut.pip) : null };
  });
  // chú thích không phóng: giữ tới chú thích/focus/màn kế hoặc 3,2 s
  tut.callouts = beats.filter(b => b.block === 'callout').map(b => {
    const r = resolveTarget(b, b.params.target, b.t_in), fb = camera.boxToFrame(camera.sample(cam.keys, b.t_in), r.disp);
    const nxt = beats.find(x => x.t_in > b.t_in && ['callout', 'focus', 'screen'].includes(x.block)), tEnd = Math.min(b.t_in + 3200, nxt ? nxt.t_in : Infinity);
    const ring = { x: Math.round(fb.x - 8), y: Math.round(fb.y - 8), w: Math.round(fb.w + 16), h: Math.round(fb.h + 16) };
    return { beat: b.id, block: 'callout', screen: r.sc.id, target: b.params.target, t: b.t_in, tEnd, box: r.disp, ring, callout: calloutBox(ring, b.params.text, b.params.side, tut.pip) };
  });
  tut.keystrokes = beats.filter(b => b.block === 'keystroke').map(b => ({ beat: b.id, t: b.t_in, t1: b.t_in + 1600, keys: b.params.keys.slice() }));

  // khối mở đầu + thẻ kết (tự thêm nếu bài không có — như bài thường)
  let end = beats.filter(b => b.block === 'end-card').pop();
  if (!end) {
    const title = (input.channel && input.channel.name) || lesson.title || 'Hướng dẫn';
    end = { id: 'AUTO-end-card', block: 'end-card', params: { title: String(title).slice(0, 40), sub: String((input.channel && input.channel.name && lesson.title) || '').slice(0, 80) }, anchor: null, line: null,
      t_anchor: lastEnd + 300, t_in: lastEnd + 300, _order: 1e6 };
    beats.push(end);
  }
  beats.push({ id: 'AUTO-cursor', block: 'cursor', params: {}, anchor: null, line: null, t_anchor: firstScreenT, t_in: firstScreenT, _order: 1e6 + 1 });
  beats.sort((p, q) => p.t_in - q.t_in || p._order - q._order);
  const duration = Math.round(Math.max(lastFrameT, end.t_in + pace.endHold));
  if (cam.keys[cam.keys.length - 1].t < duration) cam.keys.push(Object.assign({}, cam.keys[cam.keys.length - 1], { t: duration }));

  // sự kiện thật (C9): hành động con trỏ, đoạn di, focus/callout vào, máy quay lia, đổi màn, phím tắt, khối vào
  const ev = [];
  beats.forEach(b => { if (b.id !== 'AUTO-cursor') ev.push(b.t_in); });
  cam.moves.forEach(m => ev.push(m.t0, m.t1));
  comp.cursor.moves.forEach(m => ev.push(m.t0, m.t1));
  comp.cursor.typing.forEach(x => ev.push(...x.at, x.t1));
  tut.scrolls.forEach(x => ev.push(x.t0, x.t1));
  tut.events = [...new Set(ev.map(r2))].sort((a, b) => a - b);

  // âm: bấm = tick, đổi màn = swish, phím tắt = tick; khối khác theo sfx của khối
  const cues = [];
  comp.cursor.clicks.forEach(c => cues.push({ t_ms: Math.round(c.t), name: 'tick', vol: 0.3 }));
  screenline.forEach((s, i) => { if (i > 0) cues.push({ t_ms: Math.round(s.t0), name: 'swish', vol: 0.18 }); });
  tut.keystrokes.forEach(k => cues.push({ t_ms: Math.round(k.t), name: 'tick', vol: 0.25 }));
  beats.filter(b => !STEP_BLOCKS.includes(b.block)).forEach(b => {
    const d = registry.get(b.block), peakMs = Math.round((d.peak || 0.4) * 1000);
    registry.sfxOf(b.block, b.params, false).forEach(s => cues.push({ t_ms: Math.max(0, Math.round(b.t_in + (s.at === 'peak' ? peakMs : 0) + (s.dt || 0))), name: s.name, vol: s.vol === undefined ? 0.4 : s.vol }));
  });
  cues.sort((a, b) => a.t_ms - b.t_ms || (a.name < b.name ? -1 : 1));

  // ô khối: mọi khối F4 phủ khung; khối mở đầu canh giữa thế giới 1920×1080
  const clean = beats.map(b => {
    const d = registry.get(b.block), place = d.place;
    let slot = { x: 0, y: 0, w: 1920, h: 1080 };
    if (!STEP_BLOCKS.includes(b.block) && place !== 'hud') { const fp = d.footprint('16:9', b.params); slot = { x: Math.round(960 - fp.w / 2), y: Math.round(500 - fp.h / 2), w: fp.w, h: fp.h }; }
    return { id: b.id, block: b.block, params: b.params, anchor: b.anchor, line: b.line, t_in: b.t_in, t_anchor: b.t_anchor, t_out: duration, peak_ms: Math.round((d.peak || 0.4) * 1000), slot, zone: null };
  });

  // asset cần nạp: ảnh màn (hạ về ≤ 2× hiển thị, CNS-114) + ảnh trong DSL
  const assetRefs = (Array.isArray(input.assetRefs) ? input.assetRefs : []).slice();
  screens.forEach(sc => {
    if (sc.kind === 'asset') assetRefs.push({ asset: sc.asset, label: 'màn ' + sc.id, maxPx: [Math.min(3840, Math.round(sc.rect.w * 2)), Math.min(2400, Math.round(sc.rect.h * 2 * sc.size[1] / sc.view[1]))] });
    if (sc.kind === 'mock') walkMock(sc.mock.root, n => { if (n.type === 'image') assetRefs.push({ asset: n.asset, label: 'màn ' + sc.id + ' image' }); });
  });
  const music = lesson.music || input.music || null;

  return {
    fps, size: [1920, 1080], aspect: input.aspect || '16:9', duration_ms: duration,
    lines, beats: clean, camera: cam.keys, cues, cast, parts, actors,
    kind: 'tutorial', variant, cursor: comp.cursor, screens, thumbs: Array.isArray(input.thumbs) ? input.thumbs : [], assetRefs,
    persona: input.persona && typeof input.persona === 'object' ? input.persona : {},
    packs: Array.isArray(input.packs) ? input.packs : [],   // gói dữ liệu Gen-Chibi (gói K) — giữ nguyên như nhánh bài thường
    music: music ? { asset: music.asset, gain_db: music.gain_db === undefined ? -18 : music.gain_db, duck_db: music.duck_db === undefined ? -10 : music.duck_db } : null,
    tutorial: tut,
    style: { world: { w: 1920, h: 1080 }, zones: [], meta: { title: lesson.title || '', tag: lesson.tag || '' }, brand },
  };
}
function walkMock(n, fn) { if (!n || typeof n !== 'object') return; fn(n); (n.children || []).forEach(c => walkMock(c, fn)); }

module.exports = { buildTutorialPlan, resolveScreens, placeScreen, screenAt, scrollAt, targetBox, camAt, frameBox, calloutBox, walkMock, estimateMs, inSafe, hit, SAFE, PIP, FIT, PACE, LIMITS, DEFAULT_ACCENT };
