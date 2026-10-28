// © 2026 Gen Labs — All rights reserved.
// Gói T — tool MCP ảnh bìa (SPEC-0.2.0 §5.6). Chọn ảnh bìa KHÔNG có tool (chỉ owner trên UI, §10 — op thumbnail.pick).
//   propose_thumbnail_text {lesson | title+lines+beats}  — KHÔNG gọi LLM (agent tự nghĩ chữ): trả khung gợi ý TẤT ĐỊNH từ dữ liệu bài (thuật ngữ chính, nhịp concept-chip/stamp/takeaway,
//                                                          giới hạn độ dài, 3 khuôn câu "X là gì?" · "Đừng … nếu chưa biết X" · "Sự thật về X" đã điền thuật ngữ + đếm từ). Agent chọn/viết lại rồi gửi trong `thumbnail`.
//   capabilities → get_capabilities.thumbnail = { templates, rules, owner_faces }
// Dựng xem trước (JPEG 640×360 + số đo) dùng tool render_still mode:'thumb' (server/mcp-tools/still.js); chế độ thumb do render/stage/thumb.js cung cấp.
'use strict';
const T = require('../../render/thumb.js');
const { kit } = require('./_kit.js');

function templateInfo(t) {
  const h = t.boxes.headline;
  return { id: t.id, version: t.version, label: t.label, has_sidekick: !!t.boxes.sidekick, headline: { width_px: h.w, lines_max: h.lines_max, font_px_min: h.font_px_min }, brand_corner: t.boxes.brand.corner };
}
const rules = () => ({ words_max: T.RULES.words_max, chars_max: T.RULES.chars_max, lines_max: T.RULES.lines_max, kicker_words_max: T.RULES.kicker_words_max, kicker_chars_max: T.RULES.kicker_chars_max,
  variants: [T.RULES.variants_min, T.RULES.variants_max], moods: T.MOODS.slice(), contrast_min: T.RULES.contrast_min, font_px_min: T.RULES.font_px_min });

function tools(ctx) {
  const { db, S, arr, fail, need } = kit(ctx);
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
