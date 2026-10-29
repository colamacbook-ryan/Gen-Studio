// © 2026 Gen Labs — All rights reserved.
// Gói B — nhận diện kênh phía cổng ghi (SPEC-0.2.0 §4.3, §4.6, §10, CNS-094):
//   • `brand.propose` (compose): agent ĐỀ XUẤT thay đổi brand ⇒ tạo SG- (target_kind channel_brand, diff = patch) — agent không bao giờ sửa brand trực tiếp (update_channel ⇒ policy_field).
//   • ext.suggestionApply 'channel_brand': validate lúc tạo SG- (cả đường trợ lý `suggestion.create`), apply lúc owner (phiên UI) bấm Áp dụng một chạm ⇒ kênh lên version mới.
//   • around channel.create / channel.update: owner lưu `brand` ⇒ brand.check (lược đồ + tương phản + logo) — sai thì lỗi theo từng token, không ghi gì.
//   • hook plan.after: phân giải logo AS-… → đường dẫn (resolveAssets + kiểm quyền asset của pipeline lo phần còn lại) và cue âm thanh intro.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const brandMod = require('../../render/brand.js');
const { deepMerge } = require('../hooks.js');

const LOGO_MAX_BYTES = 512 * 1024, LOGO_MAX_SIDE = 1024, PATCH_MAX_CHARS = 16 * 1024, PENDING_MAX = 20;
const LOGO_MIME = ['image/svg+xml', 'image/png', 'image/webp'];
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// cạnh dài của PNG/WebP đọc từ đầu tệp (SVG là vector: không giới hạn px); không đọc được ⇒ null
function logoSide(mime, file) {
  let fd;
  try {
    fd = fs.openSync(file, 'r');
    const b = Buffer.alloc(64); fs.readSync(fd, b, 0, 64, 0);
    if (mime === 'image/png' && b.subarray(12, 16).toString() === 'IHDR') return Math.max(b.readUInt32BE(16), b.readUInt32BE(20));
    if (mime === 'image/webp') {
      const k = b.subarray(12, 16).toString();
      if (k === 'VP8X') return Math.max(1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3));
      if (k === 'VP8 ') return Math.max(b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff);
      if (k === 'VP8L') { const v = b.readUInt32LE(21); return Math.max((v & 0x3fff) + 1, ((v >> 14) & 0x3fff) + 1); }
    }
    return null;
  } catch (e) { return null; } finally { if (fd !== undefined) fs.closeSync(fd); }
}

function register(op, ctx) {
  const { db, ws, err, need, ext, newVersion } = ctx;

  const curData = (ch) => { const v = db.json(db.get('SELECT data FROM channel_versions WHERE entity_id=? AND version=?', ch.id, ch.current_version)); return (v && v.data) || {}; };
  const logoErrors = (brand) => {
    if (!isObj(brand) || !isObj(brand.logo) || typeof brand.logo.asset !== 'string') return [];
    const a = db.get('SELECT * FROM assets WHERE workspace_id=? AND display_id=?', ws(), brand.logo.asset);
    const bad = (text) => [{ path: 'logo.asset', text }];
    if (!a || !a.media_present) return bad('Logo ' + brand.logo.asset + ' không có trong xưởng (hoặc đã bị dọn tệp).');
    if (!LOGO_MIME.includes(a.mime)) return bad('Logo phải là SVG/PNG/WebP ≤ 512 KB.');
    if (a.bytes > LOGO_MAX_BYTES) return bad('Logo phải là SVG/PNG/WebP ≤ 512 KB (đang ' + Math.round(a.bytes / 1024) + ' KB).');
    const side = logoSide(a.mime, path.join(db.dataDir, a.path));
    if (side !== null && side > LOGO_MAX_SIDE) return bad('Logo có cạnh dài ' + side + ' px, tối đa ' + LOGO_MAX_SIDE + ' px.');
    return [];
  };
  // ném lỗi invalid kèm danh sách lỗi theo từng token/đường dẫn (UI hiện dưới ô tương ứng)
  const validateBrand = (brand) => {
    const errors = brandMod.check(brand).concat(logoErrors(brand));
    if (errors.length) throw err('invalid', 'Nhận diện kênh chưa hợp lệ: ' + errors.map((e) => `${e.path}: ${e.text}`).join(' · '), { errors });
  };
  const brandOf = (data) => (isObj(data.brand) ? data.brand : {});
  const checkPatch = (p, patch) => {
    if (!isObj(patch) || !Object.keys(patch).length) throw err('invalid', 'brand_patch phải là object không rỗng.', null);
    if (JSON.stringify(patch).length > PATCH_MAX_CHARS) throw err('invalid', 'brand_patch quá lớn (tối đa 16 KB).', null);
  };

  // ---- agent đề xuất ----
  op('brand.propose', 'compose', (c) => {
    const p = c.p, ch = need('channels', p.channel, 'kênh');
    checkPatch(p, p.brand_patch);
    const cur = brandOf(curData(ch)), merged = deepMerge(cur, p.brand_patch);
    validateBrand(merged);
    const pending = db.get("SELECT COUNT(*) AS n FROM suggestions WHERE workspace_id=? AND target_kind='channel_brand' AND target_id=? AND state='proposed'", ws(), ch.display_id).n;
    if (pending >= PENDING_MAX) throw err('conflict', `Kênh đã có ${PENDING_MAX} đề xuất nhận diện chờ duyệt; chờ chủ xưởng xử lý trước.`, null);
    const diff = { channel: ch.display_id, base_version: ch.current_version, patch: p.brand_patch, before: cur, after: merged, note: typeof p.note === 'string' ? p.note.slice(0, 500) : null };
    const sg = db.insertRow('suggestions', { target_kind: 'channel_brand', target_id: ch.display_id, diff, state: 'proposed', created_by: c.by }, { prefix: 'SG' });
    return { result: sg, entity: ['suggestion', sg.display_id], before: null, after: { target: 'channel_brand', target_id: ch.display_id, fields: Object.keys(p.brand_patch) } };
  });

  // ---- owner áp dụng SG- (op suggestion.apply của lõi: chỉ owner + phiên UI, cùng transaction) ----
  const channelOfSg = (sg) => need('channels', sg.target_id || (sg.diff && sg.diff.channel), 'kênh');
  ext.suggestionApply.register('channel_brand', {
    validate(c, p) {
      const diff = p.diff;
      if (!isObj(diff) || !isObj(diff.patch)) throw err('invalid', 'Gợi ý channel_brand cần diff.patch (object).', null);
      checkPatch(p, diff.patch);
      const ch = need('channels', p.target_id || diff.channel, 'kênh');
      validateBrand(deepMerge(brandOf(curData(ch)), diff.patch));
    },
    apply(c, sg) {
      const diff = sg.diff;
      if (!isObj(diff) || !isObj(diff.patch)) throw err('invalid', 'Gợi ý không có diff.patch để áp dụng.', null);
      const ch = channelOfSg(sg), data = curData(ch), merged = deepMerge(brandOf(data), diff.patch);
      validateBrand(merged);   // kiểm lại ở lúc áp dụng: asset logo có thể đã đổi từ khi đề xuất
      const v = newVersion('channel_versions', ch.id, Object.assign({}, data, { brand: merged }), 'Áp dụng ' + sg.display_id, c.by);
      db.update('channels', ch.id, { current_version: v });
      return { channel: ch.display_id, channel_version: v, brand_hash: brandMod.normalize({ brand: merged }).hash };
    },
  });

  // ---- owner lưu brand trực tiếp: kiểm khi lưu ----
  const guard = (prev) => (c) => {
    const d = c.p && c.p.data;
    ctx.checkPolicy(c.a, d || {}, c.p);   // agent gửi brand ⇒ forbidden trước (không lộ lỗi lược đồ), đúng như lõi
    if (d && d.brand !== undefined && d.brand !== null) validateBrand(d.brand);
    return prev(c);
  };
  ctx.around('channel.create', guard);
  ctx.around('channel.update', guard);

  // ---- pipeline: logo → asset đã phân giải, cue âm thanh intro ----
  ext.hooks.on('plan.after', ({ plan }) => {
    const brand = plan && plan.style && plan.style.brand;
    if (!brand) return;
    if (brand.logo && brand.logo.asset) {
      const a = db.get('SELECT path, media_present FROM assets WHERE workspace_id=? AND display_id=?', ws(), brand.logo.asset);
      if (!a || !a.media_present) {
        const e = new Error(`Logo ${brand.logo.asset} của nhận diện kênh không còn trong xưởng.`);
        e.name = 'PlanError'; e.code = 'brand_logo_missing'; e.text_human = e.message; e.detail = { asset: brand.logo.asset };
        throw e;
      }
      plan.style.brand = Object.assign({}, brand, { logo: Object.assign({}, brand.logo, { ref: a.path }) });   // `hash` giữ nguyên: ref là dữ liệu dẫn xuất
      plan.assetRefs = (Array.isArray(plan.assetRefs) ? plan.assetRefs : []).concat([{ asset: a.path, label: 'logo kênh', maxPx: [LOGO_MAX_SIDE, LOGO_MAX_SIDE] }]);
    }
    const i = brand.intro;
    if (i && i.enabled && i.kind !== 'none' && i.sfx && i.sfx !== 'none') {
      plan.cues = (plan.cues || []).concat([{ t_ms: Math.round(i.duration_ms * 0.12), name: i.sfx, vol: 0.35 }]).sort((x, y) => x.t_ms - y.t_ms);
    }
  });
}

module.exports = { register, OWNER: 'B', LOGO_MAX_BYTES, LOGO_MAX_SIDE };
