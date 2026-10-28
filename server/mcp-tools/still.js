// © 2026 Gen Labs — All rights reserved.
// Tool MCP `render_still` (SPEC-0.2.0 §2.4, §10): dựng MỘT khung xem trước qua renderStill (render/still.js) — dùng chung F1 (cast), F2 (brand), F3 (thumb), F4 (frame).
// Phạm vi `compose`; giới hạn tần suất theo agent (RATE_MAX/phút); Trợ lý không có đường vào (chỉ agent MCP). Không ghi DB nên không đi qua write() — mọi thứ trả về là ảnh + số đo.
// payload.assetRefs CHỈ nhận mã AS-… (hoặc {asset:'AS-…', maxPx?, label?}) của asset có thật trong workspace; không nhận đường dẫn/URL từ agent.
// Ảnh trả về dạng MCP `image` (base64) kèm structuredContent {mode, measures, errors, mime, bytes, elapsed_ms}. Test tiêm `ctx.deps.still` (stub) thay renderStill thật.
'use strict';
const path = require('node:path');
const { kit } = require('./_kit.js');

const MODES = ['thumb', 'frame', 'brand', 'cast'];
const RATE_MAX = 10, RATE_WINDOW_MS = 60e3;     // tối đa 10 ảnh/phút/agent
const MAX_PAYLOAD_BYTES = 256 * 1024;
const MAX_IMAGE_BYTES = 1.5 * 1024 * 1024;     // ảnh trả về tối đa 1,5 MB (vượt ⇒ hạ chất lượng JPEG)

function tools(ctx) {
  const { db, config, S, N, O, fail } = kit(ctx);
  const hits = new Map();   // agent.id → [thời điểm]
  const limited = (id, now = Date.now()) => {
    const a = (hits.get(id) || []).filter((t) => now - t < RATE_WINDOW_MS);
    if (a.length >= RATE_MAX) { hits.set(id, a); return true; }
    a.push(now); hits.set(id, a); return false;
  };
  // AS-… → đường dẫn tương đối trong kho (media/xx/<sha>.<ext>) mà resolveAssets đọc; asset không còn tệp ⇒ lỗi
  const mapRefs = (refs) => refs.map((r, i) => {
    const o = typeof r === 'string' ? { asset: r } : r;
    if (!o || typeof o.asset !== 'string' || !/^AS-\d+$/.test(o.asset)) throw fail('invalid', `payload.assetRefs[${i}] phải là mã asset AS-… (không nhận đường dẫn hay URL).`);
    const a = db.get('SELECT path, media_present FROM assets WHERE workspace_id=? AND display_id=?', db.ws, o.asset);
    if (!a || !a.media_present) throw fail('not_found', `Không có asset ${o.asset} (hoặc đã bị dọn tệp).`);
    return Object.assign({}, o, { asset: a.path });
  });

  return [
    { name: 'render_still', scope: 'compose', description: 'Dựng MỘT khung xem trước (ảnh) bằng sân khấu thật: mode = thumb (ảnh bìa) | brand (nhận diện kênh) | cast (bảng nhân vật) | frame (một khung của bài). Giới hạn ' + RATE_MAX + ' ảnh/phút. payload.assetRefs chỉ nhận mã AS-….',
      schema: { mode: { type: 'string', enum: MODES }, payload: O, size: { type: 'array', items: N, description: '[w,h] ≤ 1920×1080; mặc định [1280,720]' }, format: { type: 'string', enum: ['jpeg', 'png'] } }, required: ['mode'], handler: async (a, c) => {
        if (!MODES.includes(a.mode)) throw fail('invalid', 'mode phải là một trong: ' + MODES.join(', ') + '.');
        const payload = a.payload === undefined ? {} : a.payload;
        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw fail('invalid', 'payload phải là object.');
        if (JSON.stringify(payload).length > MAX_PAYLOAD_BYTES) throw fail('payload_too_large', 'payload quá lớn (tối đa 256 KB).');
        const size = a.size === undefined ? [1280, 720] : a.size;
        if (!Array.isArray(size) || size.length !== 2 || !size.every((n) => Number.isFinite(n) && n >= 16) || size[0] > 1920 || size[1] > 1080) throw fail('invalid', 'size phải là [w,h] trong 16..1920 × 16..1080.');
        const format = a.format === 'png' ? 'png' : 'jpeg';
        if (payload.assetRefs !== undefined && !Array.isArray(payload.assetRefs)) throw fail('invalid', 'payload.assetRefs phải là mảng.');
        if (limited(c.agent.id)) throw fail('rate_limited', `Dựng ảnh xem trước quá nhiều (tối đa ${RATE_MAX}/phút). Thử lại sau ít phút.`);
        const body = Object.assign({}, payload, payload.assetRefs ? { assetRefs: mapRefs(payload.assetRefs) } : {});
        delete body.assetData; delete body.fontCss;   // agent không tự nhét dữ liệu đã phân giải / CSS vào sân khấu (kể cả trong payload.plan của mode frame)
        if (body.plan && typeof body.plan === 'object' && !Array.isArray(body.plan)) { body.plan = Object.assign({}, body.plan); delete body.plan.assetData; delete body.plan.fontCss; }
        const still = (ctx.deps && ctx.deps.still) || require('../../render/still.js');
        let r;
        try {
          r = await still.renderStill({ mode: a.mode, payload: body, size, format, quality: 85, assetRoot: config.dataDir, ffmpegPath: config.ffmpegPath, chromiumPath: config.chromiumPath });
        } catch (e) {
          if (e && ['still_queue_full', 'still_timeout'].includes(e.code)) throw fail(e.code === 'still_queue_full' ? 'rate_limited' : 'bad_gateway', e.message, { still: e.code });
          if (e && ['still_mode', 'still_size'].includes(e.code)) throw fail('invalid', e.message, { still: e.code });
          throw e;
        }
        let buf = r.buffer;
        if (format === 'jpeg' && buf.length > MAX_IMAGE_BYTES) {
          const r2 = await still.renderStill({ mode: a.mode, payload: body, size, format, quality: 60, assetRoot: config.dataDir, ffmpegPath: config.ffmpegPath, chromiumPath: config.chromiumPath });
          buf = r2.buffer; r.errors = r2.errors; r.measures = r2.measures;
        }
        const mime = format === 'png' ? 'image/png' : 'image/jpeg';
        return {
          text: `Đã dựng khung ${a.mode} ${size[0]}×${size[1]} (${buf.length} byte${r.errors && r.errors.length ? ', có ' + r.errors.length + ' lỗi console' : ''}).`,
          data: { mode: a.mode, size, mime, bytes: buf.length, measures: r.measures || {}, errors: r.errors || [], elapsed_ms: r.elapsed_ms == null ? null : r.elapsed_ms },
          images: [{ data: buf.toString('base64'), mimeType: mime }],
        };
      } },
  ];
}

module.exports = { tools, MODES, RATE_MAX };
