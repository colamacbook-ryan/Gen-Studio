// © 2026 Gen Labs — All rights reserved.
// Dòng thời gian + bố cục + máy quay tự sinh (thuần, không DOM, chạy Node): từ bài học + clip giọng → plan để trang sân khấu dựng khung.
// buildPlan({lesson:{title?, lines, beats, camera_hints?}, clips:{[lineId]:{duration_ms, word_times:[{w,t0,t1}] (ms, tương đối đầu clip) | null, envelope:[0..1]@30fps}},
//            channel?, cast?, parts?, aspect:'16:9', fps:30, kind?, variant?, brand?, thumbs?, assetRefs?, persona?, cursor?, screens?}) → plan (xem docs/ARCHITECTURE.md §4; phần mở rộng ghi ở đầu mỗi trường bên dưới).
// PLAN v2 (SPEC-0.2.0 §2.1): mọi trường mới có mặc định ⇒ bài cũ dựng lại đúng như trước. kind = input.kind | lesson.kind | 'lesson'; kind 'tutorial' đi nhánh
// render/engine/tutorial.js buildTutorialPlan (gói U) và PHẢI trả cùng một cấu trúc plan. Các trường v2 do pipeline/hook cấp qua input (brand đã chuẩn hoá, thumbs đã phân giải, assetRefs…).
'use strict';
const registry = require('../blocks/registry');
const camera = require('./camera');
const aspects = require('../aspects');

const { PlanError } = require('./plan-error');

const LEAD_MS = 1100, GAP_MS = 500, TAIL_MS = 3600, END_HOLD_MS = 2100, INTRO_MS = 150, OVERVIEW_LEAD_MS = 200, END_AFTER_OVERVIEW_MS = 1300;
const PITCH_X = 1700, PITCH_Y = 1050, COLS = 3, ORIGIN_X = 1000, ORIGIN_Y = 600, STACK_GAP = 40, ZONE_MAX_H = 900;
const norm = w => w.toLowerCase().replace(/[.,;:!?"'“”‘’()…]/g, '');
const tokensOf = say => String(say).trim().split(/\s+/).filter(Boolean);

// ---------- câu + mốc từng chữ ----------
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

// Tìm chỉ mục chữ (theo khoảng trắng trong `say`) mà neo trỏ tới. Trả {index, text} hoặc ném PlanError.
function anchorIndex(line, anchor) {
  const toks = tokensOf(line.say);
  if (!anchor || typeof anchor !== 'object') throw new PlanError('anchor_missing', 'Beat thiếu neo (anchor).', { line: line.id });
  if (Number.isInteger(anchor.word_index)) {
    if (anchor.word_index < 0 || anchor.word_index >= toks.length) throw new PlanError('anchor_range', 'Neo vượt quá số chữ của câu ' + line.id + ' (' + toks.length + ' chữ).', { line: line.id, word_index: anchor.word_index });
    return { index: anchor.word_index, text: toks[anchor.word_index] };
  }
  if (typeof anchor.word !== 'string' || !anchor.word.trim()) throw new PlanError('anchor_missing', 'Neo cần `word` hoặc `word_index`.', { line: line.id });
  const say = String(line.say); let pos = say.indexOf(anchor.word);
  if (pos < 0) pos = say.toLowerCase().indexOf(anchor.word.toLowerCase());
  if (pos < 0) throw new PlanError('anchor_not_found', 'Neo "' + anchor.word + '" không nằm trong câu ' + line.id + '.', { line: line.id, word: anchor.word });
  const index = tokensOf(say.slice(0, pos)).length - (/\s$/.test(say.slice(0, pos)) || pos === 0 ? 0 : 1);
  return { index: Math.min(Math.max(index, 0), toks.length - 1), text: toks[Math.min(Math.max(index, 0), toks.length - 1)] };
}

// Mốc t0 (ms, tuyệt đối) của chữ neo trong câu đã dựng (line có .words tuyệt đối).
function anchorTime(line, anchor) {
  const a = anchorIndex(line, anchor), toks = tokensOf(line.say), ws = line.words;
  if (ws.length === toks.length) return { t: ws[a.index].t0, index: a.index };
  const cand = ws.map((x, i) => ({ i, ok: norm(x.w) === norm(a.text) })).filter(x => x.ok);
  if (cand.length) { const guess = a.index / toks.length * ws.length; cand.sort((p, q) => Math.abs(p.i - guess) - Math.abs(q.i - guess)); return { t: ws[cand[0].i].t0, index: cand[0].i }; }
  const f = a.index / toks.length; return { t: Math.round(line.a_ms + f * (line.b_ms - line.a_ms)), index: a.index };
}

// Kiểm neo khi nộp bài (Gen gọi): trả mảng lỗi chữ tiếng Việt, rỗng = ổn. Không cần clip giọng.
function validateAnchors(lesson) {
  const errs = [], byId = {}; (lesson.lines || []).forEach(l => { byId[l.id] = l; });
  (lesson.beats || []).forEach((b, i) => {
    ['anchor', 'anchor2'].forEach(k => {
      if (k === 'anchor2' && !b[k]) return;
      const a = b[k]; const line = a && byId[a.line];
      if (!line) return errs.push('beat ' + (b.id || i + 1) + ': ' + k + ' trỏ tới câu không có (' + (a && a.line) + ')');
      try { anchorIndex(line, a); } catch (e) { errs.push('beat ' + (b.id || i + 1) + ': ' + e.text_human); }
    });
  });
  return errs;
}

function buildLines(lesson, clips, fps, leadMs) {
  let cursor = leadMs || LEAD_MS;
  return lesson.lines.map(l => {
    const c = (clips && clips[l.id]) || {}, dur = c.duration_ms > 0 ? Math.round(c.duration_ms) : estimateMs(l.say);
    const rel = Array.isArray(c.word_times) && c.word_times.length ? c.word_times : proportionalWords(l.say, dur);
    const a = cursor, b = a + dur; cursor = b + (Number.isFinite(l.pause_ms) ? l.pause_ms : GAP_MS);
    const words = rel.map(x => ({ w: x.w, t0: a + Math.round(x.t0), t1: a + Math.round(x.t1) }));
    const envelope = Array.isArray(c.envelope) && c.envelope.length ? c.envelope : synthEnvelope(rel, dur, 30);
    return { id: l.id, who: l.who, say: l.say, lang: l.lang || 'vi', terms: l.terms || [], subtitle: l.subtitle || null, mood: l.mood || null,
      a_ms: a, b_ms: b, words, envelope, env_fps: 30 };
  });
}

// ---------- bố cục trang vở ----------
function layout(beats) {
  // beats đã sắp theo t_in; trả {zones, world}
  const zones = []; let prev = null;
  const lay = [];
  beats.forEach(b => {
    const def = registry.get(b.block), fp = def.footprint('16:9', b.params);
    b._fp = fp; b._place = def.place;
    if (FRAME_PLACES.indexOf(def.place) >= 0) { b.slot = Object.assign({}, FULL_SLOT); b.zone = null; return; }
    if (def.place === 'overview') { b.zone = null; return; }
    const cur = zones[zones.length - 1];
    if (prev && b.morphFrom && prev.id === b.morphFrom) { b.zone = prev.zone; b._same = prev; lay.push(b); prev = b; return; }
    if (def.place === 'over' && prev && prev.zone !== null) { b.zone = prev.zone; b._over = prev; lay.push(b); return; }
    const fits = cur && prev && prev.zone === cur.id && def.place === 'stack' && (def.stackOn || []).indexOf(prev.block) >= 0 && cur.h + STACK_GAP + fp.h <= ZONE_MAX_H;
    if (fits) { cur.members.push(b); cur.h += STACK_GAP + fp.h; cur.w = Math.max(cur.w, fp.w); b.zone = cur.id; }
    else { const z = { id: 'Z' + (zones.length + 1), members: [b], w: fp.w, h: fp.h, idx: zones.length }; zones.push(z); b.zone = z.id; }
    prev = b; lay.push(b);
  });
  zones.forEach(z => {
    const col0 = z.idx % COLS, row = Math.floor(z.idx / COLS), col = row % 2 ? COLS - 1 - col0 : col0;
    z.cx = ORIGIN_X + col * PITCH_X; z.cy = ORIGIN_Y + row * PITCH_Y + (col % 2 ? 30 : 0);
    z.x = Math.round(z.cx - z.w / 2); z.y = Math.round(z.cy - z.h / 2);
    let y = z.y; z.members.forEach(b => { b.slot = { x: Math.round(z.cx - b._fp.w / 2), y: Math.round(y), w: b._fp.w, h: b._fp.h }; y += b._fp.h + STACK_GAP; });
  });
  lay.forEach(b => {
    if (b._same) b.slot = Object.assign({}, b._same.slot);
    else if (b._over) { const o = b._over.slot; b.slot = { x: Math.round(o.x + o.w / 2 - b._fp.w / 2), y: Math.round(o.y + o.h / 2 - b._fp.h / 2), w: b._fp.w, h: b._fp.h }; }
  });
  const maxX = Math.max.apply(null, zones.map(z => z.cx)), maxY = Math.max.apply(null, zones.map(z => z.cy));
  const world = { w: Math.max(2200, maxX + 1100), h: Math.max(1300, maxY + 800) };
  return { zones, world };
}

// ---------- bố cục theo tỉ lệ (F7 §4.1) — chỉ khi aspects.json → layout không legacy; 16:9 dùng layout() ở trên, không đổi ----------
// Cùng luật xếp vùng (morph/over/stack) với layout(); khác ở hình học: W = layout.world {cols, pitch:[x,y], origin:[x,y], zone_max_h, min:[w,h], pad:[w,h]},
// zig-zag theo hàng khi cols > 1; khối phủ khung (hud/fullbleed/track) nhận slot = cả khung `size`.
function layoutLay(beats, W, size, aspect) {
  const zones = [], lay = []; let prev = null;
  beats.forEach(b => {
    const def = registry.get(b.block), fp = def.footprint(aspect, b.params);
    b._fp = fp; b._place = def.place;
    if (FRAME_PLACES.indexOf(def.place) >= 0) { b.slot = { x: 0, y: 0, w: size[0], h: size[1] }; b.zone = null; return; }
    if (def.place === 'overview') { b.zone = null; return; }
    const cur = zones[zones.length - 1];
    if (prev && b.morphFrom && prev.id === b.morphFrom) { b.zone = prev.zone; b._same = prev; lay.push(b); prev = b; return; }
    if (def.place === 'over' && prev && prev.zone !== null) { b.zone = prev.zone; b._over = prev; lay.push(b); return; }
    const fits = cur && prev && prev.zone === cur.id && def.place === 'stack' && (def.stackOn || []).indexOf(prev.block) >= 0 && cur.h + STACK_GAP + fp.h <= W.zone_max_h;
    if (fits) { cur.members.push(b); cur.h += STACK_GAP + fp.h; cur.w = Math.max(cur.w, fp.w); b.zone = cur.id; }
    else { const z = { id: 'Z' + (zones.length + 1), members: [b], w: fp.w, h: fp.h, idx: zones.length }; zones.push(z); b.zone = z.id; }
    prev = b; lay.push(b);
  });
  const C = Math.max(1, W.cols | 0);
  zones.forEach(z => {
    const col0 = z.idx % C, row = Math.floor(z.idx / C), col = row % 2 ? C - 1 - col0 : col0;
    z.cx = W.origin[0] + col * W.pitch[0]; z.cy = W.origin[1] + row * W.pitch[1];
    z.x = Math.round(z.cx - z.w / 2); z.y = Math.round(z.cy - z.h / 2);
    let y = z.y; z.members.forEach(b => { b.slot = { x: Math.round(z.cx - b._fp.w / 2), y: Math.round(y), w: b._fp.w, h: b._fp.h }; y += b._fp.h + STACK_GAP; });
  });
  lay.forEach(b => {
    if (b._same) b.slot = Object.assign({}, b._same.slot);
    else if (b._over) { const o = b._over.slot; b.slot = { x: Math.round(o.x + o.w / 2 - b._fp.w / 2), y: Math.round(o.y + o.h / 2 - b._fp.h / 2), w: b._fp.w, h: b._fp.h }; }
  });
  const maxX = zones.length ? Math.max.apply(null, zones.map(z => z.cx)) : W.origin[0], maxY = zones.length ? Math.max.apply(null, zones.map(z => z.cy)) : W.origin[1];
  return { zones, world: { w: Math.max(W.min[0], maxX + W.pad[0]), h: Math.max(W.min[1], maxY + W.pad[1]) } };
}

// Khối không nằm trong vùng/trang vở: phủ cả khung 1920×1080 (hud · fullbleed (màn hình) · track (con trỏ/focus bám đích sau máy quay))
const FRAME_PLACES = ['hud', 'fullbleed', 'track'];
const FULL_SLOT = { x: 0, y: 0, w: 1920, h: 1080 };
const KINDS = ['lesson', 'tutorial'];
// Các trường v2 của plan (§2.1) — mặc định khi input không cấp
function v2Fields(input, lesson) {
  return {
    kind: input.kind || lesson.kind || 'lesson',
    variant: input.variant || lesson.variant || 'full',
    cursor: input.cursor === undefined ? null : input.cursor,
    screens: input.screens === undefined ? null : input.screens,
    thumbs: Array.isArray(input.thumbs) ? input.thumbs : [],
    assetRefs: Array.isArray(input.assetRefs) ? input.assetRefs : [],
    persona: input.persona && typeof input.persona === 'object' ? input.persona : {},
    packs: Array.isArray(input.packs) ? input.packs : [],   // gói dữ liệu Gen-Chibi [{json, outline}] — sân khấu đăng ký trước khi nạp công thức (render/cast library().packs)
  };
}
// Bố cục mặc định của chỗ đứng: trái x=-40, phải x=1500 (như sân khấu v0.1.x); mode: stage | pip | hidden
function actorLayout(side, over) { return Object.assign({ mode: 'stage', x: side === 'left' ? -40 : 1500, y: 0, scale: 1 }, over || {}); }

function buildPlan(input) {
  const lesson0 = input.lesson || {};
  const kind = input.kind || lesson0.kind || 'lesson';
  if (!KINDS.includes(kind)) throw new PlanError('kind_unsupported', 'Loại bài "' + kind + '" chưa được hỗ trợ khi dựng (có: ' + KINDS.join(', ') + ').', { kind });
  // tỉ lệ (F7 §3.1): phải có trong render/aspects.json (tỉ lệ đã tắt vẫn dựng được — bài cũ đã nộp); loại bài phải nằm trong `kinds` (tutorial tự chặn ở tutorial.js)
  const asp = input.aspect || '16:9', ad = aspects.get(asp);
  if (!ad) throw new PlanError('aspect_unsupported', 'Tỉ lệ "' + asp + '" không có trong render/aspects.json.', { aspect: asp });
  if (kind !== 'tutorial' && ad.kinds.indexOf(kind) < 0) throw new PlanError('aspect_kind_unsupported', 'Loại bài "' + kind + '" chưa dựng được ở tỉ lệ ' + asp + '.', { aspect: asp, kind });
  if (kind === 'tutorial') return require('./tutorial').buildTutorialPlan(input);   // nhánh tutorial (gói U); stub P0b ném PlanError tutorial_unsupported
  return buildLessonPlan(input);
}

function buildLessonPlan(input) {
  const lesson = input.lesson || {}, fps = input.fps || 30;
  if (!Array.isArray(lesson.lines) || !lesson.lines.length) throw new PlanError('no_lines', 'Bài chưa có câu thoại nào.');
  // bố cục theo tỉ lệ (F7): 16:9 layout.legacy ⇒ lay = null ⇒ mọi dòng dưới chạy đúng như 0.1.x (M14); tỉ lệ khác ⇒ tham số từ aspects.json
  const aspect = input.aspect || '16:9', AD = aspects.get(aspect), lay = AD && AD.layout && !AD.layout.legacy ? AD.layout : null;
  const dflt = (!input.cast || !Object.keys(input.cast).length) ? require('../cast').defaults() : null;
  const castIn = dflt ? dflt.cast : input.cast, parts = input.parts || (dflt ? dflt.parts : []);
  // nhận diện kênh (gói B, SPEC §4.5): intro bật ⇒ LEAD_MS = max(1100, intro.duration_ms + 300); khối mở đầu vào đúng lúc intro tan; outro.hold_ms thay END_HOLD_MS
  const bi = input.brand && input.brand.intro && input.brand.intro.enabled && input.brand.intro.kind !== 'none' ? Math.min(3000, input.brand.intro.duration_ms | 0) : 0;
  const leadMs = bi ? Math.max(LEAD_MS, bi + 300) : LEAD_MS, introMs = bi || INTRO_MS;
  const endHoldMs = input.brand && input.brand.outro && input.brand.outro.hold_ms > 0 ? input.brand.outro.hold_ms : END_HOLD_MS;
  const lines = buildLines(lesson, input.clips, fps, leadMs);
  const byId = {}; lines.forEach(l => { byId[l.id] = l; });
  const lastEnd = lines[lines.length - 1].b_ms;

  // nhân vật: chỉ những ai có lời, theo thứ tự xuất hiện; sân khấu có 2 chỗ (trái, phải)
  const speakers = new Set(); lines.forEach(l => {
    if (!castIn[l.who]) throw new PlanError('cast_missing', 'Nhân vật ' + l.who + ' của câu ' + l.id + ' chưa có trong cast.', { who: l.who, line: l.id });
    speakers.add(l.who);
  });
  // chỗ đứng theo thứ tự trong cast (người đầu bên trái), không theo ai nói trước
  const cast = {}; Object.keys(castIn).filter(k => speakers.has(k)).forEach(k => { cast[k] = castIn[k]; });
  if (Object.keys(cast).length > 2) throw new PlanError('cast_limit', 'Sân khấu MVP chứa tối đa 2 nhân vật nói trong một bài (đang có ' + Object.keys(cast).length + ').', { speakers: Object.keys(cast) });

  // beats: kiểm khối + neo → t_in
  const src = (lesson.beats || []).map((b, i) => ({ b, i }));
  const beats = src.map(({ b, i }) => {
    const v = registry.validate(b.block, b.params);
    if (!v.ok) throw new PlanError('block_invalid', 'Khối "' + b.block + '" của beat ' + (b.id || i + 1) + ' sai tham số: ' + v.errors.join('; '), { beat: b.id || null, errors: v.errors });
    if (lay && !registry.supports(b.block, aspect)) throw new PlanError('block_aspect', 'Khối "' + b.block + '" của beat ' + (b.id || i + 1) + ' chưa hỗ trợ tỉ lệ ' + aspect + ' (có: ' + registry.names('lesson', aspect).join(', ') + ').', { beat: b.id || null, block: b.block, aspect });
    const line = byId[b.anchor && b.anchor.line];
    if (!line) throw new PlanError('anchor_line', 'Beat ' + (b.id || i + 1) + ' neo vào câu không có (' + (b.anchor && b.anchor.line) + ').', { beat: b.id || null });
    const at = anchorTime(line, b.anchor);
    const out = { id: b.id || 'BT-auto-' + (i + 1), block: b.block, params: b.params === undefined ? {} : b.params, anchor: b.anchor, line: line.id, t_anchor: at.t, t_in: at.t };
    if (b.anchor2) { const l2 = byId[b.anchor2.line]; if (!l2) throw new PlanError('anchor_line', 'anchor2 của beat ' + out.id + ' trỏ tới câu không có.', { beat: out.id }); out.t_peak = Math.max(at.t, anchorTime(l2, b.anchor2).t); }
    out._order = i; return out;
  }).sort((p, q) => p.t_in - q.t_in || p._order - q._order);

  // khối mở đầu (title) hiện ngay đầu clip, không đợi giọng
  if (beats.length && registry.get(beats[0].block).intro) beats[0].t_in = Math.min(beats[0].t_in, introMs);
  // toàn cảnh + thẻ kết: dùng beat của bài nếu có, không thì tự thêm
  let ov = beats.filter(b => b.block === 'lesson-map').pop();
  const noOv = !!(lay && lay.overview === false);   // F7 CNS-346: tỉ lệ tắt toàn cảnh tự thêm ⇒ thẻ kết theo ngay sau câu cuối
  if (!ov && noOv) ov = null;
  else if (!ov) { ov = { id: 'AUTO-lesson-map', block: 'lesson-map', params: {}, anchor: null, line: null, t_anchor: lastEnd + OVERVIEW_LEAD_MS, t_in: lastEnd + OVERVIEW_LEAD_MS, _order: 1e6 }; beats.push(ov); }
  let end = beats.filter(b => b.block === 'end-card').pop();
  if (!end) {
    const title = (input.channel && input.channel.name) || lesson.title || 'Bài học';
    end = { id: 'AUTO-end-card', block: 'end-card', params: { title: title, sub: (input.channel && input.channel.name && lesson.title) || '', next: lesson.next || '' }, anchor: null, line: null,
      t_anchor: ov ? ov.t_in + END_AFTER_OVERVIEW_MS : lastEnd + OVERVIEW_LEAD_MS, t_in: ov ? ov.t_in + END_AFTER_OVERVIEW_MS : lastEnd + OVERVIEW_LEAD_MS, _order: 1e6 + 1 };
    beats.push(end);
  }
  beats.sort((p, q) => p.t_in - q.t_in || p._order - q._order);

  // morph: prob-card liền ngay trước (không khối nào chen giữa) → cùng một thẻ
  beats.forEach((b, i) => { const d = registry.get(b.block); const p = beats[i - 1]; if (d.morphs && p && p.block === b.block) b.morphFrom = p.id; });
  const { zones, world } = lay ? layoutLay(beats, lay.world, AD.size, aspect) : layout(beats);
  const duration = Math.round(Math.max(lastEnd + TAIL_MS, end.t_in + endHoldMs));

  // t_out: chuỗi morph kết thúc khi link kế tiếp vào; còn lại ở lại trang đến hết clip
  beats.forEach((b, i) => { const nx = beats[i + 1]; b.t_out = nx && nx.morphFrom === b.id ? nx.t_in : duration; });

  // zone: mốc vào đầu/cuối cho máy quay
  zones.forEach(z => { z.beats = z.members.map(b => b.id); z.tIn = Math.min.apply(null, z.members.map(b => b.t_in)); z.tLast = Math.max.apply(null, z.members.map(b => b.t_in)); });
  // beat chồng/morph thuộc cùng vùng → cập nhật tLast
  beats.forEach(b => { const z = zones.find(q => q.id === b.zone); if (z) z.tLast = Math.max(z.tLast, b.t_in); });
  const hints = {};
  (Array.isArray(lesson.camera_hints) ? lesson.camera_hints : []).forEach(h => { const b = beats.find(x => x.id === h.beat); if (b) { const zi = zones.findIndex(q => q.id === b.zone); if (zi >= 0) hints[zi] = h; } });
  const cam = camera.build(Object.assign({ zones: zones.map(z => ({ cx: z.cx, cy: z.cy, w: z.w, h: z.h, x: z.x, y: z.y, tIn: z.tIn, tLast: z.tLast })), hints, overviewT: ov ? ov.t_in : null, durationMs: duration },
    lay ? camera.layOpts(lay.camera, AD.size) : {}));

  // slot toàn cảnh
  if (ov) ov.slot = { x: 0, y: 0, w: world.w, h: world.h };

  // cues âm thanh: theo block.sfx + tiếng vút khi máy quay lia
  const cues = [];
  beats.forEach(b => {
    const d = registry.get(b.block), peakMs = b.t_peak !== undefined ? b.t_peak - b.t_in : Math.round((b.morphFrom && d.peakMorph ? d.peakMorph : d.peak || 0.4) * 1000);
    registry.sfxOf(b.block, b.params, !!b.morphFrom).forEach(s => cues.push({ t_ms: Math.max(0, Math.round(b.t_in + (s.at === 'peak' ? peakMs : 0) + (s.dt || 0))), name: s.name, vol: s.vol === undefined ? 0.4 : s.vol }));
    b.peak_ms = peakMs;
  });
  cam.moves.forEach(m => { if (!m.overview && m.dist > 500) cues.push({ t_ms: Math.round(m.t + 50), name: 'whoosh', vol: 0.35 }); });
  cues.sort((a, b) => a.t_ms - b.t_ms);

  const alay = (input.actorLayout && typeof input.actorLayout === 'object') ? input.actorLayout : {};   // {[id]: {mode,x,y,scale}} do hook plan.input cấp (tutorial: pip)
  // F7: bố cục dọc đặt hai KOL theo layout.actors (x, scale); `bottom` do sân khấu đọc từ biến CSS (--lay-actor-bottom)
  const actorLay = (side, i, over) => lay ? Object.assign({ mode: 'stage', x: lay.actors.x[i], y: 0, scale: lay.actors.scale }, over || {}) : actorLayout(side, over);
  const actors = Object.keys(cast).map((id, i) => { const side = i === 0 ? 'left' : 'right'; return { id, side, name: cast[id].name || id, layout: actorLay(side, i, alay[id]) }; });
  const clean = beats.map(b => {
    const o = { id: b.id, block: b.block, params: b.params, anchor: b.anchor, line: b.line, t_in: b.t_in, t_anchor: b.t_anchor, t_out: b.t_out, peak_ms: b.peak_ms, slot: b.slot, zone: b.zone };
    if (b.t_peak !== undefined) o.t_peak = b.t_peak;
    if (b.morphFrom) o.morphFrom = b.morphFrom;
    return o;
  });
  const plan = {
    fps, size: lay ? AD.size.slice() : [1920, 1080], aspect: input.aspect || '16:9', duration_ms: duration,
    lines, beats: clean, camera: cam.keys, cues, cast, parts, actors, ...v2Fields(input, lesson),
    // style: world = kích thước trang vở; zones = các vùng nội dung (cho lesson-map + máy quay); meta = tiêu đề cho chip góc trái
    style: { world, zones: zones.map(z => ({ id: z.id, x: z.x, y: z.y, w: z.w, h: z.h, cx: z.cx, cy: z.cy, beats: z.beats })),
      meta: { title: lesson.title || '', tag: lesson.tag || '' }, brand: input.brand || null }   // brand: nhận diện kênh đã chuẩn hoá + hash (gói B; null ⇒ giao diện mặc định v0.1.x)
  };
  // F7 §3.2: `layout` (bản phân giải của aspects.json → layout, kèm `safe`) CHỈ khi không legacy ⇒ plan 16:9 không có khoá mới (trùng byte golden)
  if (lay) plan.layout = Object.assign({}, lay, { safe: AD.safe });
  return plan;
}

module.exports = { buildPlan, validateAnchors, anchorTime, PlanError, LEAD_MS, KINDS, FRAME_PLACES };
