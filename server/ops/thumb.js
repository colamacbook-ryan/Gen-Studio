// © 2026 Gen Labs — All rights reserved.
// Gói T — ảnh bìa (SPEC-0.2.0 §5, §10, CNS-086/123). Đăng ký qua ctx.ext (không sửa lõi):
//   • lessonExt 'thumbnail'  — cột lesson_versions.thumbnail + kiểm khô T3–T6 (+ T11 sớm) + luật `policy.thumbnail_required` (kênh bật, hoặc bài `tutorial`)
//   • channelDefaults        — kênh TẠO MỚI (wizard hoặc channel.create) có mặc định policy.thumbnail_required = true (kênh cũ giữ nguyên; người gọi gửi gì thì thắng; agent vẫn không tự đặt được trường chính sách)
//   • hooks 'plan.after'     — plan.thumbs = resolveThumbs(...) + đẩy asset (ảnh mặt chủ kênh, logo, hình chủ đạo) vào plan.assetRefs để pipeline kiểm quyền + nạp
//   • gates 'G-THUMB'        — media/gates/thumb.js; measure.variants=[{index, pass, score,…}] quyết định phương án nào thành asset (outputs.thumbs), cả bộ trượt ⇒ blocked thumb_fail
//   • op thumbnail.pick      — CHỈ owner trên phiên UI (ownerUi, ma trận §10): chọn ảnh bìa của một Render (đổi được tới khi gói đã xuất)
'use strict';
const T = require('../../render/thumb.js');
const { gateThumb } = require('../../media/gates/thumb.js');
const { thumbEnv } = require('./_thumb-data.js');
const AS = require('../../render/aspects.js');

// mọi mẫu mọi tỉ lệ (hợp đồng A3: templates() không đối số chỉ là 4 mẫu 16:9)
const allTemplates = () => T.templatesOf('*');
const EXAMPLE = '{"variants":[{"template":"host-shock-left","headline":"AI bịa chuyện thế nào?","highlight":"bịa","kicker":"SỰ THẬT","face":{"owner":true,"mood":"shock"},"visual":{"beat":0}},' +
  '{"template":"big-visual","headline":"Máy đoán chữ kế tiếp","face":{"cast":"CM-…","mood":"excited"},"visual":{"beat":1}}]}';
const { J } = require('./_thumb-data.js');

// lược đồ JSON của thumbnail cho inputSchema validate/submit/update_lesson (lessonExt.schema)
const MOOD_ENUM = { type: 'string', enum: T.MOODS };
const SCHEMA = {
  thumbnail: {
    type: ['object', 'null'],
    description: `Ảnh bìa: ${T.RULES.variants_min}–${T.RULES.variants_max} phương án {template, headline (≤ ${T.RULES.words_max} từ, ≤ ${T.RULES.chars_max} ký tự), highlight? (1 từ), kicker? (≤ ${T.RULES.kicker_words_max} từ), face:{owner:true|cast:"CM-…", mood}, sidekick?:{cast, mood}, visual:{beat: số thứ tự nhịp | BT-… } hoặc {asset:"AS-…"}}. Gọi propose_thumbnail_text để lấy khung chữ; get_capabilities → thumbnail.templates để biết mẫu. null = bỏ ảnh bìa (kênh bắt buộc thì bị từ chối).`,
    properties: {
      variants: { type: 'array', minItems: T.RULES.variants_min, maxItems: T.RULES.variants_max, items: { type: 'object', required: ['template', 'headline', 'face', 'visual'], properties: {
        template: { type: 'string', enum: allTemplates().map((t) => t.id) }, headline: { type: 'string' }, highlight: { type: 'string' }, kicker: { type: 'string' },
        face: { type: 'object', properties: { owner: { type: 'boolean' }, cast: { type: 'string' }, mood: MOOD_ENUM } },
        sidekick: { type: 'object', properties: { cast: { type: 'string' }, mood: MOOD_ENUM } },
        visual: { type: 'object', properties: { beat: { type: ['integer', 'string'] }, asset: { type: 'string' } } } } } },
    },
  },
};

function register(op, ctx) {
  const { db, ext, err, byRef, need } = ctx;

  // ---- asset → đường dẫn tương đối trong kho (media/xx/<sha>.<ext>) mà resolveAssets đọc; không còn tệp ⇒ null ----
  const assetRow = (ref) => (typeof ref === 'string' && /^AS-\d+$/.test(ref) ? db.get('SELECT path, mime, kind, media_present FROM assets WHERE workspace_id=? AND display_id=?', db.ws, ref) : null);

  // ---- lessonExt: cột `thumbnail` + kiểm khô + luật bắt buộc theo kênh ----
  ext.lessonExt.register({
    name: 'thumbnail', columns: ['thumbnail'], schema: { properties: SCHEMA },
    validate(lv, c) {
      const th = lv.values.thumbnail;
      const pol = (lv.channelData && lv.channelData.policy) || {};
      // F7: tỉ lệ ĐÃ PHÂN GIẢI (ops/aspect.js `resolve` chạy trước mọi validate). Ảnh bìa chỉ bắt buộc khi có ≥ 1 mẫu cùng tỉ lệ (thumbSupported), còn không thì không đòi thứ không thể làm.
      const asp = AS.get(lv.values.aspect) ? lv.values.aspect : '16:9';
      const required = (pol.thumbnail_required === true || lv.kind === 'tutorial') && AS.thumbSupported(asp);
      if (th === null || th === undefined) {
        return required ? [{ path: 'thumbnail', text: `thumbnail_required: ${lv.kind === 'tutorial' ? 'Bài hướng dẫn' : 'Kênh này'} bắt buộc có ảnh bìa (policy.thumbnail_required). Thêm thumbnail, ví dụ ${EXAMPLE} — gọi propose_thumbnail_text để lấy khung chữ.` }] : [];
      }
      const ids = new Set((lv.beats || []).map((b) => b && b.id).filter(Boolean));
      const castOk = (ref) => { const m = c.byRef('cast_members', ref); return !!m && m.channel_id === lv.channel.id; };
      const assetOk = (ref) => {
        const a = assetRow(ref);
        if (!a) return { ok: false, text: `Asset ${ref} không có trong xưởng.` };
        if (!a.media_present) return { ok: false, text: `Asset ${ref} đã bị dọn tệp.` };
        if (!/^image\//.test(a.mime || '')) return { ok: false, text: `Asset ${ref} không phải ảnh (mime ${a.mime || '?'}).` };
        return { ok: true };
      };
      const errs = T.validateThumbnail(th, { beatIds: ids, beatCount: (lv.beats || []).length, castOk, assetOk, aspect: asp });
      // mẫu phải cùng tỉ lệ với bài (mẫu không khai `aspect` ⇒ 16:9) — một nguồn: render/thumb.js checkAspect (code thumbnail_aspect)
      errs.push(...T.checkAspect(th, asp));
      return errs;
    },
  });

  // ---- channelDefaults: kênh mới ⇒ ảnh bìa bắt buộc (CNS-123). Chỉ policy.thumbnail_required; preset brand do gói B đặt ----
  ext.channelDefaults.register(() => ({ policy: { thumbnail_required: true } }));

  // ---- plan.after: đặc tả bài → plan.thumbs ----
  ext.hooks.on('plan.after', ({ B, plan, ctx: pc }) => {
    const th = B && B.lv && J(B.lv.thumbnail);
    if (!th || !Array.isArray(th.variants)) return;
    const specs = T.resolveThumbs(th, plan, thumbEnv((pc && pc.db) || db, B));
    plan.thumbs = specs;
    // ảnh mặt/logo/hình chủ đạo đi cùng danh sách asset của plan (quyền dùng + nạp một chỗ); hạ cỡ ảnh lớn (CNS-114)
    plan.assetRefs = (Array.isArray(plan.assetRefs) ? plan.assetRefs : []).concat(T.assetRefsOf(specs).map((r) => Object.assign({ maxPx: [1600, 1600] }, r)));
  });

  // ---- G-THUMB ----
  ext.gates.register('G-THUMB', async ({ rendered, ffmpegPath }) => gateThumb({ variants: (rendered && rendered.thumbs) || [], ffmpegPath }));

  // ---- thumbnail.pick: chỉ owner + phiên UI (ma trận §10). Chọn phương án đã ĐẠT của Render; đổi được tới khi gói đã xuất (exported_at). ----
  op('thumbnail.pick', 'ownerUi', (c) => {
    const r = need('renders', c.p.render, 'bản dựng');
    const outs = J(r.outputs) || {};
    const thumbs = Array.isArray(outs.thumbs) ? outs.thumbs : [];
    if (!thumbs.length) throw err('invalid', 'Bản dựng này không có ảnh bìa theo phương án.', { render: r.display_id });
    if (!['awaiting_review', 'approved'].includes(r.state)) throw err('conflict', `Bản dựng đang ở trạng thái "${r.state}", chưa/không còn chọn ảnh bìa được.`, { render: r.display_id, state: r.state });
    if (r.exported_at) throw err('conflict', 'Gói đã xuất nên không đổi ảnh bìa được nữa.', { render: r.display_id });
    const ref = c.p.asset;
    const t = thumbs.find((x) => x && x.pass !== false && (x.w1280 === ref || x.w1920 === ref || x.variant === c.p.variant));
    if (!t) throw err('invalid', 'Ảnh bìa phải là một phương án đạt G-THUMB của chính bản dựng này.', { render: r.display_id, asset: ref || null, variant: c.p.variant === undefined ? null : c.p.variant });
    const before = { thumbnail_pick: r.thumbnail_pick || null };
    db.update('renders', r.id, { thumbnail_pick: t.w1280, thumbnail_picked_by: c.by, thumbnail_picked_at: db.now() });
    return { result: byRef('renders', r.id), entity: ['render', r.display_id], before, after: { thumbnail_pick: t.w1280, variant: t.variant } };
  });
}

module.exports = { register, OWNER: 'T', EXAMPLE, SCHEMA };
