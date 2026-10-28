// © 2026 Gen Labs — All rights reserved.
// Tool MCP về kênh: get_channel · update_channel. Chuyển NGUYÊN TRẠNG từ server/mcp.js (P0b). Gói B mở rộng tại đây (get_channel trả thêm brand đã chuẩn hoá;
// thêm propose_brand_change — agent chỉ ĐỀ XUẤT, §10) và đăng ký capabilities (brand_presets, font_pairs).
'use strict';
const { kit } = require('./_kit.js');
const { policyHits } = require('../policy.js');

function tools(ctx) {
  const { write, S, O, fail, need, channelOf, chanData, actorOf } = kit(ctx);
  return [
    { name: 'get_channel', scope: 'read', description: 'Xem kênh (bản hiện hành: từ điển, phong cách, giọng, lịch…).', schema: { channel: S }, required: [], handler: (a) => {
      const ch = channelOf(a.channel);
      const data = chanData(ch);
      return { text: `Kênh ${ch.display_id} "${ch.name}" v${ch.current_version} (${ch.lang_primary}, thuật ngữ ${ch.lang_terms}).\n${JSON.stringify(data)}`, data: { channel: { display_id: ch.display_id, name: ch.name, lang_primary: ch.lang_primary, lang_terms: ch.lang_terms, version: ch.current_version, data } } };
    } },
    { name: 'update_channel', scope: 'compose', description: 'Sửa phần NỘI DUNG của kênh (từ điển thuật ngữ, phong cách, giọng theo vai, thẻ kết) — tạo version mới. Trường chính sách chỉ owner được sửa.', schema: { channel: S, data: O, note: S }, required: ['channel', 'data'], handler: (a, c) => {
      const bad = policyHits(a.data);
      if (bad.length) throw fail('forbidden', 'Trường chính sách của kênh (' + bad.join(', ') + ') chỉ chủ xưởng được sửa.', { fields: bad });
      const out = write(actorOf(c), 'channel.update', { channel: a.channel, data: a.data, note: a.note });
      return { text: `Đã cập nhật kênh ${out.display_id} lên v${out.version}.`, data: { channel: out.display_id, version: out.version } };
    } },
  ];
}

module.exports = { tools };
