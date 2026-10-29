// © 2026 Gen Labs — All rights reserved.
// Tool MCP về asset: upload_asset · get_asset. Chuyển NGUYÊN TRẠNG từ server/mcp.js (P0b); thêm `rights` vào kết quả upload (raster/audio agent tải lên cần owner xác nhận, §6.10).
'use strict';
const fs = require('node:fs');
const events = require('../events.js');
const pipeline = require('../pipeline.js');
const { kit } = require('./_kit.js');

const MAGIC = {
  'image/png': (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8,
  'image/webp': (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP',
  'image/svg+xml': (b) => /^\s*(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*<svg[\s>]/i.test(b.subarray(0, 2000).toString('utf8')),
};

function tools(ctx) {
  const { db, write, S, O, fail, need, actorOf } = kit(ctx);
  return [
    { name: 'upload_asset', scope: 'compose', description: 'Tải asset lên (SVG qua lọc, PNG/JPEG/WebP). Gửi data_base64 hoặc text (cho SVG). Ảnh raster do agent tải lên cần chủ xưởng xác nhận quyền trước khi dùng trong bản dựng — ưu tiên SVG.', schema: { kind: S, mime: S, data_base64: S, text: S, meta: O }, required: ['kind', 'mime'], handler: (a, c) => {
      const buf = a.data_base64 ? Buffer.from(a.data_base64, 'base64') : a.text ? Buffer.from(a.text, 'utf8') : null;
      if (!buf || !buf.length) throw fail('invalid', 'Thiếu data_base64 hoặc text.');
      const chk = MAGIC[a.mime];
      if (!chk) throw fail('invalid', 'MIME không được hỗ trợ: ' + a.mime + ' (cho phép: ' + Object.keys(MAGIC).join(', ') + ').');
      if (!chk(buf)) throw fail('invalid', 'Nội dung không đúng định dạng ' + a.mime + ' (kiểm magic bytes).');
      const out = write(actorOf(c), 'asset.put', { kind: a.kind, bytes: buf, mime: a.mime, meta: a.meta || null, source: 'upload' });
      return { text: `Đã lưu asset ${out.display_id} (${out.bytes} byte${out.deduped ? ', trùng nội dung cũ' : ''})${out.rights === 'pending' ? '; CHỜ chủ xưởng xác nhận quyền trước khi dùng trong bản dựng' : ''}.`, data: { asset: out.display_id, bytes: out.bytes, deduped: !!out.deduped, rights: out.rights } };
    } },
    { name: 'get_asset', scope: 'read', description: 'Xem thông tin asset (kèm nội dung base64 nếu ≤ 256 KB).', schema: { asset: S }, required: ['asset'], handler: (a) => {
      const as = need('assets', a.asset, 'asset');
      const out = { display_id: as.display_id, kind: as.kind, mime: as.mime, bytes: as.bytes, meta: as.meta, url: '/media/' + as.display_id };
      if (as.bytes <= 262144 && as.media_present) { try { out.data_base64 = fs.readFileSync(pipeline.assetFile(db, as.id).file).toString('base64'); } catch (e) { events.logError('get_asset', e); } }
      return { text: `Asset ${as.display_id} ${as.kind} ${as.mime} ${as.bytes} byte.`, data: { asset: out } };
    } },
  ];
}

module.exports = { tools };
