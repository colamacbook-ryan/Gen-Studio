// © 2026 Gen Labs — All rights reserved.
// Tiện ích của gói T (tên bắt đầu `_` ⇒ bộ nạp op bỏ qua): lấy dữ liệu từ DB cho render/thumb.js resolveThumbs — dùng chung cho hook plan.after (pipeline) và tool preview_thumbnail (xem trước).
//   thumbEnv(db, { channel, channelData, beats:[{display_id}] }) → ctx của resolveThumbs: { beatOrder, faces, assetPath, castRecipe, channelName, logoPath }
//   previewPlan(db, { lv, channel, channelData, beats, lines }) → plan tối thiểu (không cần timeline/giọng): { style:{brand}, cast, parts, beats[{id, block, params, slot}], persona }
'use strict';

const J = (v) => { if (typeof v !== 'string') return v; try { return JSON.parse(v); } catch { return v; } };

function thumbEnv(db, B) {
  const rawBrand = (B.channelData && B.channelData.brand) || {};
  const pathOf = (ref) => {   // AS-… → đường dẫn tương đối trong kho (media/xx/<sha>.<ext>) mà resolveAssets đọc; không còn tệp ⇒ null
    const a = typeof ref === 'string' && /^AS-\d+$/.test(ref) ? db.get('SELECT path, media_present FROM assets WHERE workspace_id=? AND display_id=?', db.ws, ref) : null;
    return a && a.media_present ? a.path : null;
  };
  // ảnh mặt chủ kênh (brand.thumb.faces, chính sách chỉ owner): bỏ mục không còn tệp
  const rawThumb = rawBrand.thumb || {};
  const faces = (Array.isArray(rawThumb.faces) ? rawThumb.faces : []).map((f) => ({ asset: pathOf(f && f.asset), mood: f && f.mood })).filter((f) => f.asset);
  // logo chỉ lên ảnh bìa khi brand.logo.show có "thumb" (mặc định có)
  const lg = rawBrand.logo, logoPath = lg && lg.asset && (!Array.isArray(lg.show) || lg.show.includes('thumb')) ? pathOf(lg.asset) : null;
  const castRecipe = (ref) => {   // nhân vật chưa lên sân khấu trong lời thoại: bản đã chốt, không có thì bản hiện hành (cùng luật pipeline)
    const cm = db.json(db.get('SELECT * FROM cast_members WHERE workspace_id=? AND display_id=? AND deleted_at IS NULL', db.ws, ref));
    if (!cm || cm.channel_id !== B.channel.id) return null;
    const ver = cm.status === 'approved' && cm.approved_version ? cm.approved_version : cm.current_version;
    const v = db.json(db.get('SELECT data FROM cast_versions WHERE entity_id=? AND version=?', cm.id, ver));
    return (v && v.data) || null;
  };
  return { beatOrder: (B.beats || []).map((b) => b.display_id), faces, assetPath: pathOf, castRecipe, channelName: B.channel && B.channel.name, logoPath };
}

// plan tối thiểu cho xem trước: resolveThumbs chỉ cần style.brand, cast (+ parts), beats (id/block/params/slot) và persona
function previewPlan(db, B) {
  const registry = require('../../render/blocks/registry.js');
  const brandMod = require('../../render/brand.js');
  const lib = require('../../render/cast/index.js').library();
  const env = thumbEnv(db, B);
  // illustration: params.asset CHỈ nhận mã AS-… còn tệp trong workspace → thay bằng đường dẫn đã lưu (cùng luật pipeline); sai/không có ⇒ bỏ nhịp (resolveThumbs báo thumb_visual_missing), KHÔNG bao giờ đọc đường dẫn do agent gửi
  const beats = [];
  for (const b of B.beats || []) {
    const def = registry.get(b.block_type); let params = J(b.params) || {};
    if (b.block_type === 'illustration') {
      const p = params && typeof params === 'object' ? env.assetPath(params.asset) : null;
      if (!p) continue;
      params = Object.assign({}, params, { asset: p });
    }
    const fp = def && def.footprint ? def.footprint((B.lv && B.lv.aspect) || '16:9', params) : { w: 1000, h: 600 };   // F7: footprint theo tỉ lệ của bài (NULL = 16:9)
    beats.push({ id: b.display_id, block: b.block_type, params, slot: { x: 0, y: 0, w: fp.w, h: fp.h } });
  }
  const cast = {};
  for (const l of B.lines || []) { const m = db.json(db.get('SELECT display_id FROM cast_members WHERE id=?', l.cast_member_id)); if (m && !cast[m.display_id]) { const r = env.castRecipe(m.display_id); if (r) cast[m.display_id] = r; } }
  return { style: { brand: brandMod.normalize(B.channelData) }, cast, parts: lib.parts, beats, persona: {}, env };
}

// Phân giải MỘT phương án để xem trước (tool MCP preview_thumbnail và route /api/preview/still?mode=thumb dùng chung).
//   q = { lesson, version?, variant?, spec? }; helpers = { need(table, ref, what), fail(code, text, detail), chanData(channel) } → { spec, lesson }
function resolvePreview(db, q, h) {
  const T = require('../../render/thumb.js');
  const l = h.need('lessons', q.lesson, 'bài học');
  const ver = q.version === undefined ? l.current_version : q.version;
  const lv = db.json(db.get('SELECT * FROM lesson_versions WHERE lesson_id=? AND version=?', l.id, ver));
  if (!lv) throw h.fail('not_found', `Bài ${l.display_id} không có phiên bản ${ver}.`);
  let variant;
  if (q.spec !== undefined) { if (!q.spec || typeof q.spec !== 'object' || Array.isArray(q.spec)) throw h.fail('invalid', 'spec phải là object (một phương án ảnh bìa).'); variant = q.spec; }
  else {
    const th = J(lv.thumbnail);
    if (!th || !Array.isArray(th.variants) || !th.variants.length) throw h.fail('invalid', 'Bài chưa có thumbnail — truyền spec hoặc nộp thumbnail trước.');
    const i = q.variant === undefined ? 0 : q.variant;
    if (!Number.isInteger(i) || i < 0 || i >= th.variants.length) throw h.fail('invalid', `variant phải từ 0 đến ${th.variants.length - 1}.`);
    variant = th.variants[i];
  }
  // kiểm khô phương án (T3–T6) trên chính dữ liệu người gọi gửi — đường dẫn/asset lạ bị chặn ở đây, trước khi chạm vào đĩa
  const ve = T.validateThumbnail({ variants: [variant] }, { single: true, beatCount: db.get('SELECT COUNT(*) AS n FROM beats WHERE lesson_version_id=?', lv.id).n,
    beatIds: new Set(db.all('SELECT display_id FROM beats WHERE lesson_version_id=?', lv.id).map((x) => x.display_id)),
    castOk: (ref) => { const m = db.get('SELECT channel_id FROM cast_members WHERE workspace_id=? AND display_id=? AND deleted_at IS NULL', db.ws, ref); return !!m && m.channel_id === l.channel_id; },
    assetOk: (ref) => { const a = /^AS-\d+$/.test(String(ref)) ? db.get('SELECT mime, media_present FROM assets WHERE workspace_id=? AND display_id=?', db.ws, ref) : null; return !a ? { ok: false, text: `Asset ${ref} không có trong xưởng.` } : !a.media_present ? { ok: false, text: `Asset ${ref} đã bị dọn tệp.` } : /^image\//.test(a.mime || '') ? { ok: true } : { ok: false, text: `Asset ${ref} không phải ảnh.` }; } });
  if (ve.length) throw h.fail('invalid', 'Phương án ảnh bìa chưa hợp lệ: ' + ve.map((e) => e.path + ': ' + e.text).join(' | '), { errors: ve });
  return { l, lv, variant, resolve: () => {
    const channel = db.json(db.get('SELECT * FROM channels WHERE id=?', l.channel_id));
    const B = { lv, channel, channelData: h.chanData(channel), beats: db.all('SELECT * FROM beats WHERE lesson_version_id=? ORDER BY ord', lv.id).map((b) => db.json(b)), lines: db.all('SELECT * FROM lines WHERE lesson_version_id=? ORDER BY ord', lv.id) };
    const plan = previewPlan(db, B);
    let spec;
    try { spec = T.resolveThumbs({ variants: [variant] }, plan, plan.env)[0]; } catch (e) { if (e && e.name === 'PlanError') throw h.fail('invalid', e.text_human, e.detail); throw e; }
    spec.index = 0;
    // cùng kiểm quyền asset của pipeline (§6.10) trước khi dựng: raster/audio chưa được owner xác nhận ⇒ từ chối
    const missing = require('../rights.js').missing(db, T.assetRefsOf([spec]));
    if (missing.length) throw h.fail('rights_missing', `Asset ${missing.join(', ')} chưa được chủ xưởng xác nhận quyền sử dụng nên chưa xem trước được.`, { assets: missing });
    return spec;
  } };
}

module.exports = { thumbEnv, previewPlan, resolvePreview, J };
