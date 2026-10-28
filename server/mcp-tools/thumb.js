// © 2026 Gen Labs — All rights reserved.
// Gói T — tool MCP ảnh bìa (SPEC-0.2.0 §5.6). Chọn ảnh bìa KHÔNG có tool (chỉ owner trên UI, §10 — op thumbnail.pick).
//   propose_thumbnail_text {lesson | title+lines+beats}  — KHÔNG gọi LLM (agent tự nghĩ chữ): trả khung gợi ý TẤT ĐỊNH từ dữ liệu bài (thuật ngữ chính, nhịp concept-chip/stamp/takeaway,
//                                                          giới hạn độ dài, 3 khuôn câu "X là gì?" · "Đừng … nếu chưa biết X" · "Sự thật về X" đã điền thuật ngữ + đếm từ). Agent chọn/viết lại rồi gửi trong `thumbnail`.
//   capabilities → get_capabilities.thumbnail = { templates, rules, owner_faces }
//   preview_thumbnail {lesson, version?, variant? | spec?}  — xem trước MỘT phương án ảnh bìa: JPEG 640×360 (≤ 200 KB) + số đo G-THUMB của phương án đó (SPEC §5.6). Dựng qua renderStill (hàng đợi still dùng chung, CNS-106),
//                                                          giới hạn 6 lần/phút/agent. (render_still mode:'thumb' nhận đặc tả đã phân giải; tool này phân giải từ bài + kênh giúp agent.)
'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const T = require('../../render/thumb.js');
const { gateThumb } = require('../../media/gates/thumb.js');
const { previewPlan, J } = require('../ops/_thumb-data.js');
const { kit } = require('./_kit.js');

const RATE_MAX = 6, RATE_WINDOW_MS = 60e3, PREVIEW_MAX_BYTES = 200 * 1024;

function templateInfo(t) {
  const h = t.boxes.headline;
  return { id: t.id, version: t.version, label: t.label, has_sidekick: !!t.boxes.sidekick, headline: { width_px: h.w, lines_max: h.lines_max, font_px_min: h.font_px_min }, brand_corner: t.boxes.brand.corner };
}
const rules = () => ({ words_max: T.RULES.words_max, chars_max: T.RULES.chars_max, lines_max: T.RULES.lines_max, kicker_words_max: T.RULES.kicker_words_max, kicker_chars_max: T.RULES.kicker_chars_max,
  variants: [T.RULES.variants_min, T.RULES.variants_max], moods: T.MOODS.slice(), contrast_min: T.RULES.contrast_min, font_px_min: T.RULES.font_px_min });

function tools(ctx) {
  const { db, S, N, O, arr, fail, need, chanData } = kit(ctx);
  const hits = new Map();   // agent.id → [thời điểm]
  const limited = (id, now = Date.now()) => { const a = (hits.get(id) || []).filter((t) => now - t < RATE_WINDOW_MS); if (a.length >= RATE_MAX) { hits.set(id, a); return true; } a.push(now); hits.set(id, a); return false; };
  const FF = (ctx.config && ctx.config.ffmpegPath) || 'ffmpeg';
  const ff = (args, what) => { const r = spawnSync(FF, args, { encoding: 'utf8' }); if (r.status !== 0) throw fail('bad_gateway', `ffmpeg lỗi khi ${what}: ${String(r.stderr || r.error || '').slice(0, 160)}`); };
  return [
    { name: 'propose_thumbnail_text', scope: 'compose', description: 'Gợi ý khung chữ cho ảnh bìa (KHÔNG gọi LLM, tất định): thuật ngữ chính của bài + 3 khuôn câu đã điền + đếm từ/ký tự + giới hạn. Truyền lesson (bài đã nộp) hoặc title+lines+beats (bài chưa nộp). Bạn chọn hoặc viết lại rồi gửi trong thumbnail của submit_lesson.',
      schema: { lesson: S, title: S, lines: { type: 'array' }, beats: { type: 'array' } }, required: [], handler: (a) => {
        let src;
        if (a.lesson) {
          const l = need('lessons', a.lesson, 'bài học');
          const lv = db.get('SELECT id FROM lesson_versions WHERE lesson_id=? AND version=?', l.id, l.current_version);
          if (!lv) throw fail('not_found', 'Bài chưa có phiên bản.');
          const J = (v) => { try { return typeof v === 'string' ? JSON.parse(v) : v; } catch { return null; } };
          src = { title: l.title,
            lines: db.all('SELECT say, terms_declared FROM lines WHERE lesson_version_id=? ORDER BY ord', lv.id).map((x) => ({ say: x.say, terms: J(x.terms_declared) || [] })),
            beats: db.all('SELECT block_type, params FROM beats WHERE lesson_version_id=? ORDER BY ord', lv.id).map((x) => ({ block: x.block_type, params: J(x.params) || {} })) };
        } else {
          if (!Array.isArray(a.lines) || !a.lines.length) throw fail('invalid', 'Cần lesson (bài đã nộp) hoặc title + lines + beats.');
          src = { title: a.title || '', lines: arr(a.lines).map((l) => ({ say: l && l.say, terms: (l && l.terms) || [] })), beats: arr(a.beats).map((b) => ({ block: b && b.block, params: (b && b.params) || {} })) };
        }
        const r = T.proposeText(src);
        const text = `Thuật ngữ chính: ${r.terms.join(', ') || '(không có)'}\n` + r.frames.map((f) => `- ${f.pattern}: "${f.text}"` + (f.words == null ? ` — còn tối đa ${f.free_words} từ / ${f.free_chars} ký tự cho phần "…"` : ` (${f.words} từ, ${f.chars} ký tự${f.ok ? '' : ', VƯỢT giới hạn'})`)).join('\n')
          + `\nGiới hạn: ≤ ${r.limits.words_max} từ, ≤ ${r.limits.chars_max} ký tự, ≤ ${r.limits.lines_max} dòng; nhấn tối đa 1 từ (highlight); mood ∈ ${r.limits.moods.join(' | ')}.`;
        return { text, data: r };
      } },
    { name: 'preview_thumbnail', scope: 'compose', description: `Xem trước MỘT phương án ảnh bìa của bài (lesson [+ version], variant = số thứ tự phương án bắt đầu từ 0; hoặc spec = một phương án chưa nộp): trả ảnh JPEG 640×360 + số đo G-THUMB (T1–T11) của phương án đó. Giới hạn ${RATE_MAX} lần/phút.`,
      schema: { lesson: S, version: N, variant: N, spec: O }, required: ['lesson'], handler: async (a, c) => {
        const l = need('lessons', a.lesson, 'bài học');
        const ver = a.version === undefined ? l.current_version : a.version;
        const lv = db.json(db.get('SELECT * FROM lesson_versions WHERE lesson_id=? AND version=?', l.id, ver));
        if (!lv) throw fail('not_found', `Bài ${l.display_id} không có phiên bản ${ver}.`);
        let variant;
        if (a.spec !== undefined) { if (!a.spec || typeof a.spec !== 'object' || Array.isArray(a.spec)) throw fail('invalid', 'spec phải là object (một phương án ảnh bìa).'); variant = a.spec; }
        else {
          const th = J(lv.thumbnail);
          if (!th || !Array.isArray(th.variants) || !th.variants.length) throw fail('invalid', 'Bài chưa có thumbnail — truyền spec hoặc nộp thumbnail trước.');
          const i = a.variant === undefined ? 0 : a.variant;
          if (!Number.isInteger(i) || i < 0 || i >= th.variants.length) throw fail('invalid', `variant phải từ 0 đến ${th.variants.length - 1}.`);
          variant = th.variants[i];
        }
        if (limited(c.agent.id)) throw fail('rate_limited', `Xem trước ảnh bìa quá nhiều (tối đa ${RATE_MAX}/phút). Thử lại sau ít phút.`);
        const channel = db.json(db.get('SELECT * FROM channels WHERE id=?', l.channel_id));
        const B = { lv, channel, channelData: chanData(channel), beats: db.all('SELECT * FROM beats WHERE lesson_version_id=? ORDER BY ord', lv.id).map((b) => db.json(b)), lines: db.all('SELECT * FROM lines WHERE lesson_version_id=? ORDER BY ord', lv.id) };
        const plan = previewPlan(db, B);
        let spec;
        try { spec = T.resolveThumbs({ variants: [variant] }, plan, plan.env)[0]; } catch (e) { if (e && e.name === 'PlanError') throw fail('invalid', e.text_human, e.detail); throw e; }
        spec.index = 0;
        const still = (ctx.deps && ctx.deps.still) || require('../../render/still.js');
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-thumb-prev-'));
        try {
          const payload = Object.assign({}, spec, { assetRefs: T.assetRefsOf([spec]) });
          const shot = async (extra, file) => {
            try { return await still.renderStill({ mode: 'thumb', payload: Object.assign({}, payload, extra), size: [1920, 1080], format: 'png', outFile: file, assetRoot: ctx.config.dataDir, ffmpegPath: FF, chromiumPath: ctx.config.chromiumPath }); }
            catch (e) {
              if (e && ['still_queue_full', 'still_timeout'].includes(e.code)) throw fail(e.code === 'still_queue_full' ? 'rate_limited' : 'bad_gateway', e.message, { still: e.code });
              throw e;
            }
          };
          const t1 = await shot({}, path.join(tmp, 't1.png')), t2 = await shot({ textOff: true }, path.join(tmp, 't1.notext.png'));
          const pngs = { png: path.join(tmp, 't1.png'), png_notext: path.join(tmp, 't1.notext.png'), jpg1280: path.join(tmp, 't1.1280.jpg'), jpg1920: path.join(tmp, 't1.1920.jpg') };
          ff(['-v', 'error', '-y', '-i', pngs.png, '-vf', 'scale=1280:-2:flags=lanczos', '-q:v', '3', pngs.jpg1280], 'hạ 1280');
          ff(['-v', 'error', '-y', '-i', pngs.png, '-vf', 'scale=1920:-2:flags=lanczos', '-q:v', '3', pngs.jpg1920], 'hạ 1920');
          const g = gateThumb({ variants: [{ index: 0, spec, measures: t1.measures, png: pngs.png, png_notext: pngs.png_notext, jpg1280: pngs.jpg1280, jpg1920: pngs.jpg1920 }], ffmpegPath: FF });
          const small = path.join(tmp, 'p.jpg');
          for (const q of [5, 8, 12, 18]) { ff(['-v', 'error', '-y', '-i', pngs.png, '-vf', 'scale=640:360:flags=lanczos', '-q:v', String(q), small], 'dựng ảnh xem trước'); if (fs.statSync(small).size <= PREVIEW_MAX_BYTES) break; }
          const buf = fs.readFileSync(small), v = g.measure.variants[0] || null;
          const errors = [].concat(t1.errors || [], t2.errors || []);
          const text = g.result === 'unknown' ? g.measure.text_human
            : v.pass ? `Phương án đạt G-THUMB (score ${v.score}): chữ ${v.font_px} px, tương phản ${String(v.contrast).replace('.', ',')}:1, mặt ${Math.round(v.face_h_ratio * 100)} % chiều cao.`
            : 'Phương án TRƯỢT G-THUMB: ' + v.fails.map((f) => `${f.rule} ${f.text}`).join(' | ');
          return { text: text + (spec.warnings.length ? '\nLưu ý: ' + spec.warnings.join(' ') : ''), data: { result: g.result, measure: v, warnings: spec.warnings, bytes: buf.length, errors, elapsed_ms: (t1.elapsed_ms || 0) + (t2.elapsed_ms || 0) }, images: [{ data: buf.toString('base64'), mimeType: 'image/jpeg' }] };
        } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
      } },
  ];
}

// get_capabilities.thumbnail: mẫu + quy cách; owner_faces = số ảnh mặt chủ kênh đã khai (0 ⇒ face.owner rơi về KOL host_lead)
function capabilities(ctx, args) {
  const out = { thumbnail: { templates: T.templates().map(templateInfo), rules: rules() } };
  try {
    const { channelOf, chanData } = kit(ctx);
    const d = chanData(channelOf(args && args.channel));
    const faces = d.brand && d.brand.thumb && Array.isArray(d.brand.thumb.faces) ? d.brand.thumb.faces : [];
    out.thumbnail.owner_faces = faces.length;
    out.thumbnail.required = !!(d.policy && d.policy.thumbnail_required === true);
  } catch (e) { if (!(e && e.code === 'not_found')) throw e; /* chưa có kênh: chỉ trả mẫu + quy cách */ }
  return out;
}

module.exports = { tools, capabilities, templateInfo };
