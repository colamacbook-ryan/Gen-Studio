// © 2026 Gen Labs — All rights reserved.
// Tool MCP về kênh: get_channel · update_channel · propose_brand_change (gói B, SPEC-0.2.0 §4.6).
// get_channel trả thêm `brand` đã chuẩn hoá (chỉ đọc) và `brand_errors`; update_channel gửi `brand` ⇒ forbidden (trường chính sách) kèm gợi ý dùng propose_brand_change;
// propose_brand_change ⇒ op brand.propose tạo SG- (diff trên brand) — chỉ owner trên phiên UI mới Áp dụng được (agent chỉ ĐỀ XUẤT, §10).
// capabilities: brand_presets, font_pairs.
'use strict';
const { kit } = require('./_kit.js');
const { policyHits } = require('../policy.js');
const brandMod = require('../../render/brand.js');

// brand gửi ra cho agent: bản chuẩn hoá, bỏ `vars` (biến CSS dẫn xuất — chỉ sân khấu cần)
function brandView(data) {
  const b = brandMod.normalize(data);
  if (!b) return { brand: null, brand_errors: [] };
  const out = Object.assign({}, b); delete out.vars;
  return { brand: out, brand_errors: brandMod.check(data.brand) };
}

function tools(ctx) {
  const { write, S, O, fail, channelOf, chanData, actorOf } = kit(ctx);
  return [
    { name: 'get_channel', scope: 'read', description: 'Xem kênh (bản hiện hành: từ điển, phong cách, giọng, lịch, nhận diện `brand` đã chuẩn hoá — chỉ đọc, đổi qua propose_brand_change…).', schema: { channel: S }, required: [], handler: (a) => {
      const ch = channelOf(a.channel);
      const data = chanData(ch);
      const bv = brandView(data);
      return { text: `Kênh ${ch.display_id} "${ch.name}" v${ch.current_version} (${ch.lang_primary}, thuật ngữ ${ch.lang_terms}).\n${JSON.stringify(data)}`, data: { channel: { display_id: ch.display_id, name: ch.name, lang_primary: ch.lang_primary, lang_terms: ch.lang_terms, version: ch.current_version, data, brand: bv.brand, brand_errors: bv.brand_errors } } };
    } },
    { name: 'update_channel', scope: 'compose', description: 'Sửa phần NỘI DUNG của kênh (từ điển thuật ngữ, phong cách, giọng theo vai, thẻ kết) — tạo version mới. Trường chính sách (kể cả brand) chỉ owner được sửa; đổi nhận diện dùng propose_brand_change.', schema: { channel: S, data: O, note: S }, required: ['channel', 'data'], handler: (a, c) => {
      const bad = policyHits(a.data);
      if (bad.length) throw fail('forbidden', 'Trường chính sách của kênh (' + bad.join(', ') + ') chỉ chủ xưởng được sửa.' + (bad.includes('brand') ? ' Dùng propose_brand_change để gửi Đề xuất cho chủ xưởng.' : ''), { fields: bad });
      const out = write(actorOf(c), 'channel.update', { channel: a.channel, data: a.data, note: a.note });
      return { text: `Đã cập nhật kênh ${out.display_id} lên v${out.version}.`, data: { channel: out.display_id, version: out.version } };
    } },
    { name: 'propose_brand_change', scope: 'compose', description: 'Đề xuất đổi nhận diện kênh (màu, phông, logo, lower-third, phụ đề, intro/outro) bằng brand_patch (gộp sâu vào brand hiện hành). Chỉ TẠO Đề xuất (SG-); chủ xưởng xem trước và bấm Áp dụng. Patch được kiểm lược đồ + tương phản trước khi tạo.',
      schema: { channel: S, brand_patch: O, note: S }, required: ['channel', 'brand_patch'], handler: (a, c) => {
        const sg = write(actorOf(c), 'brand.propose', { channel: a.channel, brand_patch: a.brand_patch, note: a.note });
        return { text: `Đã tạo đề xuất ${sg.display_id} đổi nhận diện kênh ${a.channel}; chờ chủ xưởng Áp dụng.`, data: { suggestion: sg.display_id, channel: a.channel, state: sg.state || 'proposed' } };
      } },
  ];
}

function capabilities() {
  return {
    brand_presets: Object.keys(brandMod.PRESETS).map((k) => ({ id: k, label: brandMod.PRESETS[k].label, tokens: brandMod.PRESETS[k].tokens, fonts: brandMod.PRESETS[k].fonts })),
    font_pairs: Object.keys(brandMod.FONT_PAIRS).map((k) => ({ id: k, label: brandMod.FONT_PAIRS[k].label })),
  };
}

module.exports = { tools, capabilities };
