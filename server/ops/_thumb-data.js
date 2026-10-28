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
  const beats = (B.beats || []).map((b) => {
    const def = registry.get(b.block_type), params = J(b.params) || {};
    const fp = def && def.footprint ? def.footprint('16:9', params) : { w: 1000, h: 600 };
    return { id: b.display_id, block: b.block_type, params, slot: { x: 0, y: 0, w: fp.w, h: fp.h } };
  });
  const cast = {};
  for (const l of B.lines || []) { const m = db.json(db.get('SELECT display_id FROM cast_members WHERE id=?', l.cast_member_id)); if (m && !cast[m.display_id]) { const r = env.castRecipe(m.display_id); if (r) cast[m.display_id] = r; } }
  return { style: { brand: brandMod.normalize(B.channelData) }, cast, parts: lib.parts, beats, persona: {}, env };
}

module.exports = { thumbEnv, previewPlan, J };
