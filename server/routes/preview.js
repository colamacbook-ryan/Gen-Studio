// © 2026 Gen Labs — All rights reserved.
// Xem trước nhận diện kênh (SPEC-0.2.0 §4.7, F2-7): dựng MỘT khung bằng sân khấu thật qua renderStill (render/still.js), cache theo brand_hash.
//   GET  /api/preview/still?mode=brand&channel=CH-0001&view=mid|card|thumb[&w=1280]            — brand ĐÃ LƯU của kênh
//   POST /api/preview/still {mode:'brand', channel, view, brand?, w?}                          — brand NHÁP (form chưa lưu); không ghi gì vào DB
// Chỉ phiên đăng nhập của chủ xưởng/UI (sess). Trả ảnh JPEG; lỗi lược đồ/tương phản ⇒ 400 invalid kèm `errors` theo từng token (UI hiện dưới ô tương ứng).
// Khung mẫu dùng nội dung mẫu + nhân vật mặc định (cast.defaults) — xem trước là để thấy BỘ NHẬN DIỆN, không phải bài thật.
// mode=thumb (gói T): GET ?mode=thumb&lesson=LS-…[&version=N][&variant=0][&w=640] · POST {mode:'thumb', lesson, variant | spec (phương án nháp), w?} — JPEG một phương án ảnh bìa, cùng đường phân giải với tool preview_thumbnail.
// Các mode khác (frame, cast…) do gói khác thêm sau khi gộp, không trùng (method, pattern).
// F7 (SPEC-0.2.0-F7 §3.6, §5.3): `aspect` (query/body; tỉ lệ đang bật trong render/aspects.json, mặc định "16:9"; mode thumb: mặc định = spec.aspect của phương án) ⇒ JPEG đúng tỉ lệ,
//   `w` = chiều rộng, cạnh dài ≤ 1920 (9:16: w ≤ 1080). Brand mid/card: bài mẫu dựng ở tỉ lệ đó (logo bl/br đổi tl/tr, không lower-third ở 9:16); thumb: khung dọc + vị trí theo layout.
'use strict';
const brandMod = require('../../render/brand.js');
const { buildPlan } = require('../../render/engine/timeline.js');
const thumbMod = require('../../render/thumb.js');
const { resolvePreview } = require('../ops/_thumb-data.js');
const aspects = require('../../render/aspects.js');

const VIEWS = ['mid', 'card', 'thumb'];
const CACHE_MAX = 32, W_MIN = 320, W_MAX = 1920;
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// bài mẫu 2 câu: có KOL, phụ đề, lower-third (câu đầu của từng người), thẻ kết (timeline tự thêm)
function samplePlan(brand, channelName, aspect) {
  const say1 = 'Chào các bạn, hôm nay mình học vì sao A.I. đôi khi sai mà vẫn tự tin.', say2 = 'Câu quen thì máy đoán chắc tay, câu lạ thì máy cũng đoán luôn.';
  const lines = [{ id: 'LN-1', who: 'CM-0002', say: say1, terms: ['A.I.'] }, { id: 'LN-2', who: 'CM-0001', say: say2 }];
  return buildPlan({ fps: 12, brand, aspect: aspect || undefined, channel: { name: channelName || 'Kênh mẫu' }, lesson: { title: 'Vì sao A.I. sai mà vẫn tự tin?', lines, beats: [
    { id: 'B1', block: 'title', anchor: { line: 'LN-1', word: 'Chào' }, params: { text: 'Vì sao A.I. sai mà vẫn tự tin?', highlight: ['tự tin.'] } },
    { id: 'B2', block: 'takeaway', anchor: { line: 'LN-2', word: 'Câu' }, params: { kind: 'eq', text: 'Đoán ≠ Biết', sub: 'tự tin không phải là đúng' } }] } });
}

function register(add, rctx) {
  const { db, config, fail, need } = rctx;
  const cache = new Map();   // khoá → {buf, hash}
  const put = (k, v) => { cache.set(k, v); while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value); };

  // tỉ lệ yêu cầu: phải đang bật; → {aspect, size:[W,H] của sân khấu, wMax (cạnh dài ≤ 1920)}
  function aspectReq(v, dflt) {
    const id = v === undefined || v === null || v === '' ? (dflt || '16:9') : String(v), ad = aspects.get(id);
    if (!ad || !ad.enabled) throw fail('invalid', `Tỉ lệ "${id}" không được hỗ trợ (đang bật: ${aspects.list({ enabledOnly: true }).map((a) => a.id).join(', ')}).`, { code: 'aspect_unsupported' });
    return { aspect: id, def: ad, wMax: Math.min(W_MAX, Math.round(W_MAX * ad.size[0] / Math.max(ad.size[0], ad.size[1]))) };
  }
  const sizeOf = (A, w) => [w, Math.round(w * A.def.size[1] / A.def.size[0])];

  // ảnh bìa (gói T): phương án đã nộp hoặc nháp → spec → renderStill; không ghi DB
  async function serveThumb({ res, q }) {
    const w = q.w === undefined ? 640 : Math.round(Number(q.w));
    const num = (v) => (v === undefined || v === '' ? undefined : Number(v));
    const spec = resolvePreview(db, { lesson: q.lesson, version: num(q.version), variant: num(q.variant), spec: q.spec }, { need, fail, chanData: (ch) => { const v = db.json(db.get('SELECT data FROM channel_versions WHERE entity_id=? AND version=?', ch.id, ch.current_version)); return (v && v.data) || {}; } }).resolve();
    const A = aspectReq(q.aspect, spec && spec.aspect);
    if (!Number.isFinite(w) || w < W_MIN || w > A.wMax) throw fail('invalid', `w phải trong ${W_MIN}..${A.wMax}.`);
    let r;
    try {
      r = await require('../../render/still.js').renderStill({ mode: 'thumb', payload: Object.assign({}, spec, { assetRefs: thumbMod.assetRefsOf([spec]) }), size: sizeOf(A, w), aspect: A.aspect, format: 'jpeg', quality: 82, assetRoot: config.dataDir, ffmpegPath: config.ffmpegPath, chromiumPath: config.chromiumPath });
    } catch (e) {
      if (e && e.code === 'still_queue_full') throw fail('rate_limited', e.message, { still: e.code });
      if (e && e.code === 'still_timeout') throw fail('bad_gateway', e.message, { still: e.code });
      throw e;
    }
    if (r.errors && r.errors.length) throw fail('bad_gateway', 'Dựng xem trước có lỗi trong sân khấu.', { errors: r.errors });
    res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Content-Length': r.buffer.length, 'Cache-Control': 'private, no-store' });
    res.end(r.buffer);
    return null;
  }

  async function serve({ res, q, draft }) {
    if (q.mode === 'thumb') return serveThumb({ res, q });
    if (q.mode !== 'brand') throw fail('invalid', 'Chế độ xem trước "' + q.mode + '" chưa hỗ trợ (hiện có: brand, thumb).');
    const view = q.view || 'mid';
    if (!VIEWS.includes(view)) throw fail('invalid', 'view phải là một trong: ' + VIEWS.join(', ') + '.');
    const A = aspectReq(q.aspect);
    const w = q.w === undefined ? Math.min(1280, A.wMax) : Math.round(Number(q.w));
    if (!Number.isFinite(w) || w < W_MIN || w > A.wMax) throw fail('invalid', `w phải trong ${W_MIN}..${A.wMax}.`);
    const ch = need('channels', q.channel, 'kênh');
    const cv = db.json(db.get('SELECT data FROM channel_versions WHERE entity_id=? AND version=?', ch.id, ch.current_version));
    const data = Object.assign({}, (cv && cv.data) || {});
    if (draft !== undefined) {
      if (!isObj(draft)) throw fail('invalid', 'brand nháp phải là object.');
      data.brand = draft;
    }
    const rawBrand = isObj(data.brand) ? data.brand : {};   // kênh chưa có nhận diện ⇒ xem trước bản mặc định của preset
    const errors = brandMod.check(rawBrand);
    if (errors.length) throw fail('invalid', 'Nhận diện chưa hợp lệ: ' + errors.map((e) => e.path + ': ' + e.text).join(' · '), { errors });
    let brand = brandMod.normalize(Object.assign({}, data, { brand: rawBrand }));
    // logo: AS-… → đường dẫn trong kho; renderStill phân giải (magic bytes, trong assetRoot, ≤ 8 MB, hạ cỡ)
    const payload = { view };
    if (brand.logo) {
      const a = db.get('SELECT path, media_present FROM assets WHERE workspace_id=? AND display_id=?', db.ws, brand.logo.asset);
      if (!a || !a.media_present) throw fail('invalid', 'Logo ' + brand.logo.asset + ' không có trong xưởng.', { errors: [{ path: 'logo.asset', text: 'Logo không có trong xưởng.' }] });
      brand = Object.assign({}, brand, { logo: Object.assign({}, brand.logo, { ref: a.path }) });
      payload.assetRefs = [{ asset: a.path, label: 'logo kênh', maxPx: [1024, 1024] }];
    }
    const key = [brand.hash, brand.logo ? brand.logo.asset : '', view, w, ch.name, A.aspect].join('|');
    let hit = cache.get(key);
    if (!hit) {
      payload.brand = brand;
      if (view !== 'thumb') payload.plan = samplePlan(brand, ch.name, A.aspect);
      else if (!A.def.layout.legacy) Object.assign(payload, { aspect: A.aspect, size: A.def.size, layout: Object.assign({}, A.def.layout, { safe: A.def.safe }) });
      let r;
      try {
        r = await require('../../render/still.js').renderStill({ mode: 'brand', payload, size: sizeOf(A, w), aspect: A.aspect, format: 'jpeg', quality: 82, assetRoot: config.dataDir, ffmpegPath: config.ffmpegPath, chromiumPath: config.chromiumPath });
      } catch (e) {
        if (e && e.code === 'still_queue_full') throw fail('rate_limited', e.message, { still: e.code });
        if (e && e.code === 'still_timeout') throw fail('bad_gateway', e.message, { still: e.code });
        throw e;
      }
      if (r.errors && r.errors.length) throw fail('bad_gateway', 'Dựng xem trước có lỗi trong sân khấu.', { errors: r.errors });
      hit = { buf: r.buffer, hash: brand.hash };
      put(key, hit);
    }
    res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Content-Length': hit.buf.length, 'Cache-Control': 'private, max-age=0, must-revalidate', 'ETag': '"' + hit.hash + '-' + view + '-' + w + (A.aspect === '16:9' ? '' : '-' + A.def.token) + '"', 'X-Brand-Hash': hit.hash });
    res.end(hit.buf);
    return null;
  }

  add('GET', '/api/preview/still', { sess: true }, ({ res, url }) => serve({ res, q: Object.fromEntries(url.searchParams) }));
  add('POST', '/api/preview/still', { sess: true, strictOrigin: true }, ({ res, body }) => serve({ res, q: isObj(body) ? body : {}, draft: isObj(body) ? body.brand : undefined }));
}

module.exports = { register, samplePlan };
