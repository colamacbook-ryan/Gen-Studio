// © 2026 Gen Labs — All rights reserved.
// Gói T (SPEC-0.2.0 §5): ảnh bìa. Thuần (không DOM), chạy Node. Quy cách T1–T11 là DỮ LIỆU ở một chỗ (RULES); mẫu là DỮ LIỆU ở render/thumbs/templates.json.
//   RULES · MOODS · MOOD_STATE · templates() · template(id) · checkTemplate(t) — bộ kiểm T9 chạy NGAY LÚC NẠP mẫu (CNS-101): mẫu sai ⇒ ném lỗi khi require.
//   validateThumbnail(thumbnail, env) → [{path, text}]     — kiểm khô T3, T4, T5, T6 (+ T11 sớm) phía agent/ghi bài, không cần trình duyệt
//   resolveThumbs(thumbnail, plan, ctx?) → specs[]            — đặc tả bài → phương án đã phân giải cho sân khấu (mỗi spec đưa thẳng vào __still('thumb', spec); renderPlan gọi 2 lần: có chữ / textOff)
//   assetRefsOf(specs) → [{asset, label}]                     — asset mà các phương án cần (ảnh mặt, logo, hình chủ đạo) để pipeline kiểm quyền + nạp
//   measure(specs, domMeasures, pixels) → {variants:[{index, pass, score, …}], passed:[…]}  — phép đo G-THUMB; pixels do media/gates/thumb.js đo (contrast, diff, kích thước, dung lượng)
//   proposeText(lesson) → khung gợi ý tất định (không gọi LLM) cho tool propose_thumbnail_text
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { PlanError } = require('./engine/plan-error');

// ---------- quy cách (T1–T11) — MỘT chỗ để đổi khi nền tảng đổi (SPEC §5.11) ----------
const RULES = Object.freeze({
  sizes: [[1280, 720], [1920, 1080]],     // T1
  max_bytes: 2 * 1024 * 1024,             // T2 (< 2 MB mỗi file) [CHƯA VERIFY giới hạn hiện hành của YouTube]
  words_max: 6, chars_max: 32, lines_max: 2,   // T3
  kicker_words_max: 2, kicker_chars_max: 14,   // T4
  face_h_ratio_min: 0.22, sidekick_head_max: 0.7,   // T5
  contrast_min: 4.5,                      // T7 (WCAG)
  font_px_min: 100, tiny: [168, 94],      // T8: ở 168×94 chữ hoa cao ≥ 9 px ⇔ cỡ chữ ≥ 100 px ở bản 1280
  margin: 48,                             // T9
  no_go: Object.freeze({ x: 1020, y: 610, w: 260, h: 110, why: 'yt_duration' }),
  brand_w_max_ratio: 0.12,                // T10
  diff_min: 0.10, mask_threshold: 24, diff_threshold: 24,   // T11 + mặt nạ chữ
  variants_min: 2, variants_max: 3,
  W: 1280, H: 720,
});
const MOODS = ['shock', 'smug', 'greedy', 'angry', 'panic', 'sad', 'proud', 'vow', 'excited', 'think'];
// mood của ảnh bìa → trạng thái Gen-Chibi (engine hiện có 18 trạng thái; gói K/V có thể thêm biến thể)
const MOOD_STATE = Object.freeze({ shock: 'shock', smug: 'smug', greedy: 'greedy', angry: 'rage', panic: 'panic', sad: 'cry', proud: 'proud', vow: 'vow', excited: 'proud', think: 'think' });
const DEFAULT_TOKENS = Object.freeze({ paper: '#F6F7FC', rule: '#DCD8F3', ink: '#1D2A6E', ink_soft: '#55608F', hl: '#FFD84A', accent: '#E8A33D', accent2: '#FF6F59', leaf: '#23926A', card: '#FFFFFF', en: '#7A4FD6' });
const CORNERS = ['tl', 'tr', 'bl', 'br'];

// ---------- màu / tương phản (WCAG 2.x) ----------
function hexToRgb(h) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(h || '').trim()); if (!m) return null;
  const n = parseInt(m[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
function luminance(rgb) { return 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]); }
function contrastOfLum(a, b) { const hi = Math.max(a, b), lo = Math.min(a, b); return (hi + 0.05) / (lo + 0.05); }
function contrast(hexA, hexB) { const a = hexToRgb(hexA), b = hexToRgb(hexB); return a && b ? contrastOfLum(luminance(a), luminance(b)) : 0; }

// ---------- mẫu: nạp + kiểm T9 ngay lúc nạp ----------
const rect = (b) => ({ x: b.x, y: b.y, w: b.w, h: b.h });
const hit = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
// rect nằm trong vùng an toàn (lề m); `bleed` = các cạnh được miễn (chỉ hộp mặt)
function insideSafe(r, m, bleed) {
  const W = RULES.W, H = RULES.H, bl = bleed || [], e = 0.5;
  return (bl.includes('left') || r.x >= m - e) && (bl.includes('top') || r.y >= m - e) && (bl.includes('right') || r.x + r.w <= W - m + e) && (bl.includes('bottom') || r.y + r.h <= H - m + e);
}
function cornerRect(corner, b) {
  const m = RULES.margin, w = b.w, h = b.h;
  return { x: corner === 'tr' || corner === 'br' ? RULES.W - m - w : m, y: corner === 'bl' || corner === 'br' ? RULES.H - m - h : m, w, h };
}
// → [lỗi tiếng Việt]; rỗng = mẫu hợp lệ
function checkTemplate(t) {
  const e = [], id = (t && t.id) || '?', B = (t && t.boxes) || {};
  if (!t || !/^[a-z0-9][a-z0-9-]*$/.test(t.id || '')) e.push('mẫu thiếu id hợp lệ');
  for (const k of ['face', 'headline', 'kicker', 'visual', 'brand']) if (!B[k]) e.push(`${id}: thiếu hộp ${k}`);
  if (e.length) return e;
  const m = (t.safe && t.safe.margin) || RULES.margin, nogo = (t.safe && t.safe.no_go) || [RULES.no_go];
  if (m < RULES.margin) e.push(`${id}: lề ${m} < ${RULES.margin}`);
  if (!nogo.some((z) => z.x === RULES.no_go.x && z.y === RULES.no_go.y && z.w >= RULES.no_go.w && z.h >= RULES.no_go.h)) e.push(`${id}: thiếu vùng cấm góc phải dưới ${RULES.no_go.w}×${RULES.no_go.h}`);
  const named = ['face', 'sidekick', 'headline', 'kicker', 'visual', 'brand'].filter((k) => B[k]);
  for (const k of named) {
    const r = rect(B[k]), bleed = k === 'face' ? B[k].bleed || [] : [];
    if (![r.x, r.y, r.w, r.h].every(Number.isFinite) || r.w <= 0 || r.h <= 0) { e.push(`${id}.${k}: toạ độ không hợp lệ`); continue; }
    if (k !== 'face' && B[k].bleed) e.push(`${id}.${k}: chỉ hộp mặt được khai bleed (T9)`);
    for (const b of bleed) if (!['top', 'bottom', 'left', 'right'].includes(b)) e.push(`${id}.face: bleed "${b}" không hợp lệ`);
    if (!insideSafe(r, m, bleed)) e.push(`${id}.${k}: ra ngoài lề ${m} px (T9)`);
    for (const z of nogo) if (hit(r, z)) e.push(`${id}.${k}: chạm vùng cấm dấu thời lượng (T9)`);
  }
  // hộp chữ không giao hộp mặt/sidekick/hình chủ đạo (SPEC §5.11), logo không giao chữ
  for (const a of ['headline', 'kicker']) for (const b of ['face', 'sidekick', 'visual']) if (B[b] && hit(rect(B[a]), rect(B[b]))) e.push(`${id}: hộp ${a} giao hộp ${b}`);
  if (hit(rect(B.headline), rect(B.kicker))) e.push(`${id}: hộp headline giao kicker`);
  for (const a of ['face', 'sidekick', 'visual']) for (const b of ['face', 'sidekick', 'visual']) if (a < b && B[a] && B[b] && hit(rect(B[a]), rect(B[b]))) e.push(`${id}: hộp ${a} giao hộp ${b}`);
  for (const a of ['headline', 'kicker', 'visual', 'face']) if (hit(rect(B.brand), rect(B[a]))) e.push(`${id}: hộp brand giao hộp ${a}`);
  if (B.brand.w > RULES.W * RULES.brand_w_max_ratio + 0.5) e.push(`${id}.brand: rộng ${B.brand.w} > ${Math.floor(RULES.W * RULES.brand_w_max_ratio)} px (T10)`);
  if (!CORNERS.includes(B.brand.corner)) e.push(`${id}.brand: corner không hợp lệ`);
  if (B.headline.font_px_min < RULES.font_px_min) e.push(`${id}.headline: font_px_min ${B.headline.font_px_min} < ${RULES.font_px_min} (T8)`);
  if ((B.headline.lines_max || 2) > RULES.lines_max) e.push(`${id}.headline: lines_max > ${RULES.lines_max} (T3)`);
  if (B.face.head_min_h && B.face.head_min_h < RULES.face_h_ratio_min * RULES.H - 1) e.push(`${id}.face: head_min_h < ${Math.round(RULES.face_h_ratio_min * RULES.H)} (T5)`);
  return e;
}

let _tpl = null;
function templates() {
  if (!_tpl) {
    const raw = JSON.parse(fs.readFileSync(path.join(__dirname, 'thumbs', 'templates.json'), 'utf8')).templates;
    const errs = raw.flatMap(checkTemplate);
    if (errs.length) throw new Error('Mẫu ảnh bìa không hợp lệ (T9, CNS-101): ' + errs.join('; '));
    const ids = new Set(); for (const t of raw) { if (ids.has(t.id)) throw new Error('Mẫu ảnh bìa trùng id: ' + t.id); ids.add(t.id); }
    _tpl = raw;
  }
  return _tpl;
}
const template = (id) => templates().find((t) => t.id === id) || null;
templates();   // kiểm ngay lúc nạp module (CNS-101)

// ---------- chữ ----------
const words = (s) => String(s == null ? '' : s).trim().split(/\s+/).filter(Boolean);
const wordCount = (s) => words(s).length;
const bare = (w) => String(w).replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '').toLowerCase();
// Ước số dòng ở cỡ chữ tối thiểu (Inter/Be Vietnam đậm ≈ 0,5 em mỗi ký tự — lạc quan, chỉ để báo sớm lỗi CHẮC CHẮN tràn; phép đo thật là G-THUMB)
function estimateLines(text, boxW, px) {
  const per = Math.max(1, Math.floor(boxW / (0.5 * px)));
  let lines = 1, cur = 0;
  for (const w of words(text)) { const n = w.length; if (cur === 0) cur = n; else if (cur + 1 + n <= per) cur += 1 + n; else { lines++; cur = n; } }
  return lines;
}

// ---------- kiểm khô (T3 T4 T5 T6 + T11 sớm) ----------
// env = { beatIds?: Set<string>|null (id nhịp có trong bài nộp), beatCount?: số nhịp, castOk?(ref)→bool, assetOk?(ref)→{ok, text?}, hasOwnerFaces?: bool }
function validateThumbnail(th, env) {
  env = env || {};
  const out = [], E = (p, text) => out.push({ path: 'thumbnail' + p, text });
  if (!th || typeof th !== 'object' || Array.isArray(th) || !Array.isArray(th.variants)) { E('', 'thumbnail phải là {variants:[…]} (2–3 phương án).'); return out; }
  const vs = th.variants;
  if (!env.single && (vs.length < RULES.variants_min || vs.length > RULES.variants_max)) E('.variants', `Cần ${RULES.variants_min}–${RULES.variants_max} phương án ảnh bìa (đang ${vs.length}).`);
  const sigs = new Map();
  vs.forEach((v, i) => {
    const at = `.variants[${i}]`;
    if (!v || typeof v !== 'object' || Array.isArray(v)) { E(at, 'Phương án phải là object.'); return; }
    const tpl = template(v.template);
    if (!tpl) E(at + '.template', `Mẫu "${v.template}" không có (có: ${templates().map((t) => t.id).join(', ')}).`);
    // T3
    if (typeof v.headline !== 'string' || !v.headline.trim()) E(at + '.headline', 'Thiếu tiêu đề (headline).');
    else {
      const n = wordCount(v.headline), c = v.headline.trim().length;
      if (n > RULES.words_max) E(at + '.headline', `Tiêu đề ${n} từ > ${RULES.words_max} từ (T3; tách theo khoảng trắng).`);
      if (c > RULES.chars_max) E(at + '.headline', `Tiêu đề ${c} ký tự > ${RULES.chars_max} (T3).`);
      if (/[\r\n]/.test(v.headline)) E(at + '.headline', 'Tiêu đề không xuống dòng tay (máy tự ngắt dòng).');
      if (tpl && n <= RULES.words_max && c <= RULES.chars_max) {
        const hb = tpl.boxes.headline;
        if (estimateLines(v.headline, hb.w, hb.font_px_min) > (hb.lines_max || RULES.lines_max)) E(at + '.headline', `Tiêu đề quá dài cho mẫu ${tpl.id} (tràn ${hb.lines_max || RULES.lines_max} dòng ở cỡ ${hb.font_px_min} px): rút gọn hoặc đổi sang mẫu có hộp chữ rộng hơn.`);
      }
      if (v.highlight !== undefined && v.highlight !== null) {
        if (typeof v.highlight !== 'string' || !v.highlight.trim()) E(at + '.highlight', 'highlight phải là một từ của tiêu đề.');
        else if (wordCount(v.highlight) > 1) E(at + '.highlight', 'Chỉ nhấn tối đa 1 từ (T3).');
        else if (!words(v.headline).some((w) => bare(w) === bare(v.highlight))) E(at + '.highlight', `Từ nhấn "${v.highlight}" không nằm trong tiêu đề.`);
      }
    }
    // T4
    if (v.kicker !== undefined && v.kicker !== null) {
      if (typeof v.kicker !== 'string' || !v.kicker.trim()) E(at + '.kicker', 'kicker phải là chữ không rỗng (hoặc bỏ).');
      else {
        if (wordCount(v.kicker) > RULES.kicker_words_max) E(at + '.kicker', `Nhãn phụ ${wordCount(v.kicker)} từ > ${RULES.kicker_words_max} (T4).`);
        if (v.kicker.trim().length > RULES.kicker_chars_max) E(at + '.kicker', `Nhãn phụ ${v.kicker.trim().length} ký tự > ${RULES.kicker_chars_max} (T4).`);
      }
    }
    // T5
    const f = v.face;
    if (!f || typeof f !== 'object' || Array.isArray(f)) E(at + '.face', 'Thiếu face: {owner:true, mood} hoặc {cast:"CM-…", mood}.');
    else {
      if (!MOODS.includes(f.mood)) E(at + '.face.mood', `mood phải thuộc ${MOODS.join(' | ')}.`);
      if (f.owner === true && f.cast !== undefined) E(at + '.face', 'face chỉ khai MỘT trong owner:true hoặc cast.');
      else if (f.owner !== true && typeof f.cast !== 'string') E(at + '.face', 'face cần owner:true (ảnh mặt thật của chủ kênh) hoặc cast:"CM-…".');
      else if (f.cast !== undefined && env.castOk && !env.castOk(f.cast)) E(at + '.face.cast', `Nhân vật "${f.cast}" không thuộc kênh này.`);
    }
    if (v.sidekick !== undefined && v.sidekick !== null) {
      const s = v.sidekick;
      if (Array.isArray(s) || typeof s !== 'object') E(at + '.sidekick', 'Chỉ nhận tối đa 1 sidekick (object) — T5.');
      else {
        if (tpl && !tpl.boxes.sidekick) E(at + '.sidekick', `Mẫu ${tpl.id} không có chỗ cho sidekick.`);
        if (typeof s.cast !== 'string') E(at + '.sidekick.cast', 'sidekick cần cast:"CM-…" (KOL).');
        else if (env.castOk && !env.castOk(s.cast)) E(at + '.sidekick.cast', `Nhân vật "${s.cast}" không thuộc kênh này.`);
        if (!MOODS.includes(s.mood)) E(at + '.sidekick.mood', `mood phải thuộc ${MOODS.join(' | ')}.`);
      }
    }
    // T6: đúng 1 hình chủ đạo
    const vis = v.visual;
    if (!vis || typeof vis !== 'object' || Array.isArray(vis)) E(at + '.visual', 'Thiếu visual: đúng 1 trong {beat: số thứ tự nhịp (0,1,…) hoặc BT-…} | {asset:"AS-…"} (T6).');
    else {
      const keys = ['beat', 'asset'].filter((k) => vis[k] !== undefined && vis[k] !== null);
      if (keys.length !== 1) E(at + '.visual', 'visual cần ĐÚNG MỘT trong beat | asset (T6).');
      else if (keys[0] === 'beat') {
        const b = vis.beat;
        if (Number.isInteger(b)) { if (env.beatCount != null && (b < 0 || b >= env.beatCount)) E(at + '.visual.beat', `Nhịp số ${b} không có (bài có ${env.beatCount} nhịp).`); }
        else if (typeof b === 'string' && /^BT-\d{4,}$/.test(b)) { if (env.beatIds && !env.beatIds.has(b)) E(at + '.visual.beat', `Nhịp ${b} không có trong bài (gán id nhịp trong beats[].id hoặc dùng số thứ tự).`); }
        else E(at + '.visual.beat', 'beat phải là số thứ tự nhịp (0,1,…) hoặc mã BT-….');
      } else if (typeof vis.asset !== 'string' || !/^AS-\d+$/.test(vis.asset)) E(at + '.visual.asset', 'asset phải là mã AS-….');
      else if (env.assetOk) { const r = env.assetOk(vis.asset); if (r && !r.ok) E(at + '.visual.asset', r.text || `Asset ${vis.asset} không dùng được.`); }
    }
    // T11 sớm: hai phương án y hệt nhau
    const sig = JSON.stringify([v.template, v.headline, v.highlight || null, v.kicker || null, v.face, v.sidekick || null, v.visual]);
    if (sigs.has(sig)) E(at, `Phương án trùng phương án ${sigs.get(sig)} (T11: khác nhau ≥ ${Math.round(RULES.diff_min * 100)} % pixel).`); else sigs.set(sig, i);
  });
  return out;
}

// ---------- phân giải (đặc tả bài → spec cho sân khấu) ----------
// ctx = { beatOrder?: [id nhịp theo thứ tự ord], faces?: [{asset: đường dẫn đã phân giải, mood}], assetPath?(ref)→đường dẫn|null (visual.asset AS-…),
//         castRecipe?(ref)→công thức|null, channelName?, logoPath?: đường dẫn logo nếu brand cho hiện ở ảnh bìa }
// Ném PlanError (pipeline đổi thành Block) khi thiếu dữ liệu không thể dựng.
function resolveThumbs(thumbnail, plan, ctx) {
  ctx = ctx || {};
  if (!thumbnail || !Array.isArray(thumbnail.variants)) return [];
  const brand = plan && plan.style && plan.style.brand || null;
  const tokens = Object.assign({}, DEFAULT_TOKENS, brand && brand.tokens || {});
  const planCast = (plan && plan.cast) || {};
  const beats = (plan && plan.beats) || [];
  const castUsed = {};
  const useCast = (ref) => {
    const rec = planCast[ref] || (ctx.castRecipe && ctx.castRecipe(ref));
    if (!rec) throw new PlanError('thumb_cast_missing', `Ảnh bìa dùng nhân vật ${ref} nhưng không có công thức.`, { cast: ref });
    castUsed[ref] = rec; return ref;
  };
  const leadId = () => {
    const role = Object.entries((plan && plan.persona) || {}).find(([, p]) => p && p.role === 'host_lead');
    return role ? role[0] : Object.keys(planCast)[0] || null;
  };
  const specs = thumbnail.variants.map((v, index) => {
    const tpl = template(v.template);
    if (!tpl) throw new PlanError('thumb_template', `Mẫu ảnh bìa "${v.template}" không có.`, { variant: index });
    const warnings = [];
    // mặt chính (T5): ảnh owner → KOL host_lead → khung giữ chỗ có nhãn (không bao giờ qua G-THUMB)
    const f = v.face || {}; let face;
    if (f.owner === true) {
      const faces = ctx.faces || [], pick = faces.find((x) => x.mood === f.mood) || faces[0];
      if (pick) face = { kind: 'owner', asset: pick.asset, mood: f.mood, pick_mood: pick.mood };
      else {
        const lead = leadId();
        warnings.push('Kênh chưa có ảnh mặt chủ kênh (brand.thumb.faces) — dùng KOL ' + (lead || '(không có)') + ' làm mặt chính.');
        face = lead ? { kind: 'cast', cast: useCast(lead), mood: f.mood, fallback: 'host_lead' } : { kind: 'placeholder', mood: f.mood, label: 'ẢNH MẶT CHỦ KÊNH' };
      }
    } else face = { kind: 'cast', cast: useCast(f.cast), mood: f.mood };
    if (face.kind === 'cast') face.state = MOOD_STATE[face.mood] || 'normal';
    const sidekick = v.sidekick ? { cast: useCast(v.sidekick.cast), mood: v.sidekick.mood, state: MOOD_STATE[v.sidekick.mood] || 'normal' } : null;
    // hình chủ đạo (T6)
    let visual = null;
    const vis = v.visual || {};
    if (vis.beat !== undefined) {
      const id = Number.isInteger(vis.beat) ? (ctx.beatOrder || [])[vis.beat] : vis.beat;
      const b = beats.find((x) => x.id === id);
      if (!b) throw new PlanError('thumb_visual_missing', `Ảnh bìa phương án ${index + 1}: nhịp ${vis.beat} không có trong bản dựng.`, { variant: index, beat: vis.beat });
      visual = { kind: 'block', block: b.block, params: b.params, beat: b.id, w: (b.slot && b.slot.w) || 1000, h: (b.slot && b.slot.h) || 600 };
      if (b.block === 'illustration' && b.params && b.params.asset) visual.asset = b.params.asset;
    } else if (vis.asset !== undefined) {
      const p = ctx.assetPath ? ctx.assetPath(vis.asset) : null;
      if (!p) throw new PlanError('thumb_asset_missing', `Ảnh bìa phương án ${index + 1}: asset ${vis.asset} không dùng được (thiếu tệp).`, { variant: index, asset: vis.asset });
      visual = { kind: 'asset', asset: p, ref: vis.asset };
    }
    // màu: chữ = màu tương phản cao nhất với nền; nhấn = màu thương hiệu đạt ≥ 4,5 :1, không thì đảo (nền chữ)
    const bg = tokens[tpl.bg && tpl.bg.fill] || tokens.ink;
    const textOpts = ['#FFFFFF', tokens.ink, tokens.paper, '#0B0F2A'];
    const text = textOpts.reduce((a, c) => (contrast(c, bg) > contrast(a, bg) ? c : a), textOpts[0]);
    const hlOpts = [tokens.hl, tokens.accent2, tokens.accent].filter((c) => c && c.toLowerCase() !== text.toLowerCase());
    const hlOk = hlOpts.find((c) => contrast(c, bg) >= RULES.contrast_min);
    const kickOnHl = contrast(tokens.hl, bg) >= 3;   // nhãn phụ trên nền đặc: màu nhấn nếu tách được khỏi nền, không thì đảo (mực trên nền vàng ↔ vàng trên nền mực)
    const palette = { bg, text, light: luminance(hexToRgb(bg) || [0, 0, 0]) > 0.3, kickBg: kickOnHl ? tokens.hl : tokens.ink, kickFg: kickOnHl ? tokens.ink : tokens.hl, hl: hlOk || bg, hlMode: hlOk ? 'color' : 'plate', hlPlate: text, shadow: contrast('#000000', bg) > contrast('#FFFFFF', bg) ? '#FFFFFF' : '#05071A',
      ink: tokens.ink, paper: tokens.paper, card: tokens.card, accent: tokens.accent, accent2: tokens.accent2, hlToken: tokens.hl, burst: tokens[tpl.bg && tpl.bg.burst] || tokens.hl, rule: tokens.rule };
    // góc dấu kênh = brand.thumb.corner (mặc định brand là 'tl'); góc dưới-phải là vùng thời lượng, và góc không còn chỗ trong mẫu (đè chữ/mặt/hình) ⇒ giữ góc của mẫu
    let corner = brand && brand.thumb && CORNERS.includes(brand.thumb.corner) && brand.thumb.corner !== 'br' ? brand.thumb.corner : tpl.boxes.brand.corner;
    let bb = Object.assign({}, tpl.boxes.brand, cornerRect(corner, tpl.boxes.brand));
    if (['headline', 'kicker', 'visual', 'face', 'sidekick'].some((k) => tpl.boxes[k] && hit(rect(bb), rect(tpl.boxes[k])))) { corner = tpl.boxes.brand.corner; bb = Object.assign({}, tpl.boxes.brand); }
    return {
      index, template: tpl, headline: v.headline.trim(), highlight: v.highlight || null, kicker: v.kicker ? v.kicker.trim() : null,
      face, sidekick, visual, palette, tokens: { ink: tokens.ink, paper: tokens.paper, rule: tokens.rule, card: tokens.card },
      brand: { corner, box: bb, data: brand, name: ctx.channelName || (plan && plan.style && plan.style.meta && plan.style.meta.tag) || '', logo: ctx.logoPath || null, kicker_style: (brand && brand.thumb && brand.thumb.kicker_style) || 'plate' },
      cast: castUsed, parts: (plan && plan.parts) || [], warnings,
    };
  });
  // dữ liệu nặng (công thức, linh kiện) chỉ cần cho nhân vật thật sự dùng — thu gọn theo từng spec
  return specs.map((s) => {
    const need = new Set([s.face.cast, s.sidekick && s.sidekick.cast].filter(Boolean));
    return Object.assign(s, { cast: Object.fromEntries(Object.entries(s.cast).filter(([k]) => need.has(k))) });
  });
}
function assetRefsOf(specs) {
  const seen = new Map();
  const add = (a, label) => { if (a && !seen.has(a)) seen.set(a, { asset: a, label }); };
  (specs || []).forEach((s) => {
    if (s.face && s.face.asset) add(s.face.asset, 'ảnh bìa: mặt chủ kênh');
    if (s.visual && s.visual.asset) add(s.visual.asset, 'ảnh bìa: hình chủ đạo');
    if (s.brand && s.brand.logo) add(s.brand.logo, 'ảnh bìa: logo');
  });
  return [...seen.values()];
}

// ---------- đo G-THUMB ----------
const r1 = (n) => Math.round(n * 10) / 10, r3 = (n) => Math.round(n * 1000) / 1000;
const rectOf = (m) => (m && Number.isFinite(m.x) ? { x: m.x, y: m.y, w: m.w, h: m.h } : null);
function score(contrastV, fontPx, faceHRatio) {
  return r3(0.4 * Math.min((contrastV || 0) / 7, 1) + 0.3 * Math.min((fontPx || 0) / 140, 1) + 0.3 * Math.min((faceHRatio || 0) / 0.35, 1));
}
// Một phương án: spec (đã phân giải), dom (kết quả GSThumb.render, toạ độ 1280), px (số đo ảnh) → {pass, fails:[{rule, text}], …}
// px = { dim1280:[w,h]|null, dim1920, magic1280:bool, magic1920:bool, bytes1280, bytes1920, contrast:number|null, diffs:{[j]: tỉ lệ}|{} }
function evaluateVariant(spec, dom, px, keptBefore) {
  dom = dom || {}; px = px || {};
  const fails = [], F = (rule, text) => fails.push({ rule, text });
  const tpl = spec.template, B = tpl.boxes, H = dom.headline || {}, vio = [];
  // T1
  const okDim = (d, w, h) => Array.isArray(d) && d[0] === w && d[1] === h;
  if (!okDim(px.dim1280, 1280, 720)) F('T1', `Ảnh 1280 sai kích thước (${(px.dim1280 || []).join('×') || 'không có'}).`);
  if (!okDim(px.dim1920, 1920, 1080)) F('T1', `Ảnh 1920 sai kích thước (${(px.dim1920 || []).join('×') || 'không có'}).`);
  // T2
  if (!px.magic1280 || !px.magic1920) F('T2', 'Tệp không phải JPEG (magic bytes FF D8 FF).');
  if (!(px.bytes1280 < RULES.max_bytes) || !(px.bytes1920 < RULES.max_bytes)) F('T2', `Dung lượng ${Math.max(px.bytes1280 || 0, px.bytes1920 || 0)} byte ≥ 2 MB.`);
  // T3
  const nW = wordCount(spec.headline), nC = spec.headline.length;
  if (nW > RULES.words_max) F('T3', `Tiêu đề ${nW} từ > ${RULES.words_max}.`);
  if (nC > RULES.chars_max) F('T3', `Tiêu đề ${nC} ký tự > ${RULES.chars_max}.`);
  if (!(H.lines >= 1) || H.lines > (B.headline.lines_max || RULES.lines_max)) F('T3', `Tiêu đề ${H.lines || '?'} dòng > ${B.headline.lines_max || RULES.lines_max}.`);
  if (H.overflow) F('T3', 'Tiêu đề tràn hộp chữ (rút gọn hoặc đổi mẫu).');
  if (spec.highlight && wordCount(spec.highlight) > 1) F('T3', 'Nhấn quá 1 từ.');
  // T4
  const K = dom.kicker || null;
  if (spec.kicker) {
    if (wordCount(spec.kicker) > RULES.kicker_words_max || spec.kicker.length > RULES.kicker_chars_max) F('T4', `Nhãn phụ "${spec.kicker}" quá dài (≤ ${RULES.kicker_words_max} từ, ≤ ${RULES.kicker_chars_max} ký tự).`);
    if (!K || K.overflow) F('T4', 'Nhãn phụ tràn hộp.');
  }
  // T5
  const faceM = dom.face || null, headH = faceM && faceM.head_h, faceRatio = headH ? headH / RULES.H : 0;
  if (!faceM || faceM.kind === 'placeholder') F('T5', 'Chưa có mặt chính thật (đang là khung giữ chỗ).');
  else {
    if (faceRatio < RULES.face_h_ratio_min - 1e-9) F('T5', `Mặt chính cao ${r1(faceRatio * 100)} % < ${RULES.face_h_ratio_min * 100} % chiều cao ảnh.`);
    if (B.face.head_min_h && headH < B.face.head_min_h - 0.5) F('T5', `Đầu mặt chính cao ${Math.round(headH)} px < ${B.face.head_min_h} px của mẫu.`);
    if (faceM.kind === 'owner' && faceM.alpha === false) F('T5', 'Ảnh mặt chủ kênh không có kênh alpha (cần PNG đã tách nền).');
  }
  if (!MOODS.includes(spec.face && spec.face.mood)) F('T5', 'mood mặt chính không hợp lệ.');
  const S = dom.sidekick || null;
  if (spec.sidekick) {
    if (!S) F('T5', 'Không dựng được sidekick.');
    else if (headH && S.head_h > RULES.sidekick_head_max * headH + 0.5) F('T5', `Đầu sidekick (${Math.round(S.head_h)} px) to hơn ${RULES.sidekick_head_max * 100} % đầu mặt chính (${Math.round(headH)} px).`);
  }
  // T6
  if (!spec.visual || !dom.visual) F('T6', 'Thiếu hình chủ đạo (cần đúng 1).');
  // T7
  const ct = typeof px.contrast === 'number' ? px.contrast : null;
  if (ct === null || ct < RULES.contrast_min) F('T7', `Tương phản chữ/nền ${ct === null ? '?' : r1(ct)}:1 < ${RULES.contrast_min}:1.`);
  // T8
  const fontPx = H.font_px || 0;
  if (fontPx < RULES.font_px_min) F('T8', `Cỡ chữ tiêu đề ${Math.round(fontPx)} px < ${RULES.font_px_min} px (không đọc được ở 168×94).`);
  // T9: vùng an toàn + dấu thời lượng
  const nogo = (tpl.safe && tpl.safe.no_go) || [RULES.no_go], m = (tpl.safe && tpl.safe.margin) || RULES.margin;
  const parts = [['headline', rectOf(H), []], ['kicker', rectOf(K), []], ['brand', rectOf(dom.brand), []], ['visual', rectOf(dom.visual), []], ['face', rectOf(faceM), B.face.bleed || []], ['sidekick', rectOf(S), []]];
  for (const [name, r, bleed] of parts) {
    if (!r) continue;
    if (!insideSafe(r, m, bleed)) vio.push({ part: name, why: 'margin' });
    if (nogo.some((z) => hit(r, z))) vio.push({ part: name, why: 'yt_duration' });
  }
  if (vio.length) F('T9', 'Vùng an toàn: ' + vio.map((v) => `${v.part} (${v.why === 'margin' ? 'ngoài lề ' + m + ' px' : 'đè dấu thời lượng'})`).join(', ') + '.');
  // T10
  const bm = dom.brand;
  if (!bm) F('T10', 'Thiếu logo/dấu kênh.');
  else {
    if (bm.w > RULES.W * RULES.brand_w_max_ratio + 0.5) F('T10', `Logo rộng ${Math.round(bm.w)} px > ${Math.floor(RULES.W * RULES.brand_w_max_ratio)} px (12 %).`);
    if (bm.corner !== spec.brand.corner) F('T10', `Logo không ở góc ${spec.brand.corner}.`);
    for (const t of [rectOf(H), rectOf(K)]) if (t && hit(rectOf(bm), t)) { F('T10', 'Logo đè chữ.'); break; }
  }
  // T11
  let minDiff = null;
  for (const j of keptBefore || []) {
    const d = px.diffs && px.diffs[j];
    if (typeof d === 'number') { minDiff = minDiff === null ? d : Math.min(minDiff, d); if (d < RULES.diff_min) F('T11', `Giống phương án ${j + 1} (chỉ khác ${r1(d * 100)} % pixel < ${RULES.diff_min * 100} %).`); }
  }
  return {
    index: spec.index, i: spec.index, pass: fails.length === 0, score: score(ct, fontPx, faceRatio), fails,
    template: tpl.id, bytes_1280: px.bytes1280 == null ? null : px.bytes1280, bytes_1920: px.bytes1920 == null ? null : px.bytes1920,
    words: nW, chars: nC, lines: H.lines || null, font_px: fontPx ? Math.round(fontPx) : null, contrast: ct === null ? null : r1(ct), face_h_ratio: r3(faceRatio),
    face: faceM ? faceM.kind : null, mood: spec.face && spec.face.mood, safe_violations: vio, brand_box: bm ? [Math.round(bm.x), Math.round(bm.y), Math.round(bm.w), Math.round(bm.h)] : null,
    min_diff_other: minDiff === null ? null : r3(minDiff), warnings: spec.warnings || [],
  };
}
// measure(specs, domMeasures[], pixels[]) → { variants, passed }
// T11: phương án sau bị loại nếu giống một phương án ĐẠT trước nó (thứ tự agent gửi); phương án trước không bị phạt.
function measure(specs, domMeasures, pixels) {
  const variants = [], kept = [];
  (specs || []).forEach((s, k) => {
    const v = evaluateVariant(s, (domMeasures || [])[k], (pixels || [])[k], kept);
    variants.push(v); if (v.pass) kept.push(s.index);
  });
  return { variants, passed: variants.filter((v) => v.pass).map((v) => v.index) };
}

// ---------- gợi ý chữ tất định (tool propose_thumbnail_text; KHÔNG gọi LLM) ----------
// lesson = { title, lines:[{say, terms[]}], beats:[{block, params}] } → { terms:[…], frames:[{pattern, text, words, chars, ok, free_words?}], limits }
function proposeText(lesson) {
  const lines = (lesson && lesson.lines) || [], beats = (lesson && lesson.beats) || [], count = new Map();
  const bump = (t, w) => { t = String(t || '').trim(); if (t && wordCount(t) <= 3 && t.length <= 20) count.set(t, (count.get(t) || 0) + w); };
  lines.forEach((l) => (l.terms || []).forEach((t) => bump(t, 2)));
  beats.forEach((b) => { const p = b.params || {}; if (['concept-chip', 'stamp', 'takeaway'].includes(b.block)) bump(p.term || p.text || p.label, 3); });
  const terms = [...count.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t).slice(0, 5);
  const X = terms[0] || String((lesson && lesson.title) || '').split(/\s+/).slice(0, 2).join(' ');
  const mk = (pattern, text, extra) => Object.assign({ pattern, text, words: wordCount(text), chars: text.length, ok: wordCount(text) <= RULES.words_max && text.length <= RULES.chars_max }, extra || {});
  const frames = X ? [
    mk('X là gì?', `${X} là gì?`),
    mk('Sự thật về X', `Sự thật về ${X}`),
    // khuôn có chỗ trống: agent điền phần "…"; báo ngân sách từ/ký tự còn lại
    (() => { const fixed = `Đừng … nếu chưa biết ${X}`, fw = wordCount(fixed) - 1; return { pattern: 'Đừng … nếu chưa biết X', text: fixed, words: null, chars: null, ok: null, free_words: Math.max(0, RULES.words_max - fw), free_chars: Math.max(0, RULES.chars_max - (fixed.length - 1)) }; })(),
  ] : [];
  return { terms, frames, limits: { words_max: RULES.words_max, chars_max: RULES.chars_max, lines_max: RULES.lines_max, kicker_words_max: RULES.kicker_words_max, kicker_chars_max: RULES.kicker_chars_max, moods: MOODS.slice() } };
}

module.exports = { RULES, MOODS, MOOD_STATE, DEFAULT_TOKENS, CORNERS, templates, template, checkTemplate, validateThumbnail, resolveThumbs, assetRefsOf, measure, evaluateVariant, score,
  proposeText, wordCount, contrast, luminance, contrastOfLum, hexToRgb, estimateLines, rect, hit, insideSafe, cornerRect, stub: false };
