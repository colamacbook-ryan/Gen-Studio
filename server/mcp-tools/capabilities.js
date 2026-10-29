// © 2026 Gen Labs — All rights reserved.
// get_capabilities: khối hình (theo loại bài), giọng, hạn mức có nguồn, nhân vật, từ điển thuật ngữ. Gộp thêm object `capabilities(ctx, args)` của MỌI module mcp-tools
// (SPEC-0.2.0 §2.4) nên không gói nào phải sửa tool này. Khoá của module gộp SAU khoá lõi (không đè khoá lõi — trùng khoá ⇒ bỏ khoá của module).
'use strict';
const events = require('../events.js');
const grids = require('../grids.js');
const { LIMITS } = require('../write.js');
const { POLICY_FIELDS } = require('../policy.js');
const gatesMod = require('../../media/gates/index.js');
const { kit } = require('./_kit.js');

const J = grids.J;

// Phần lõi — cũng đóng vai "module capabilities" mẫu: blocks_by_kind, kinds, gates_by_kind (SPEC §2.3/§2.5)
function capabilities(ctx) {
  const { ext } = kit(ctx);
  const reg = require('../../render/blocks/registry.js');
  const kinds = ext ? ext.lessonExt.kinds() : ['lesson'];
  const out = { kinds, blocks_by_kind: {}, gates_by_kind: {} };
  for (const k of kinds) {
    out.blocks_by_kind[k] = reg.list(k);
    out.gates_by_kind[k] = gatesMod.GATES.filter((g) => g.applies(k, k === 'tutorial' ? { thumbnail: 'x' } : {})).map((g) => g.id);   // G-THUMB "có điều kiện" theo dữ liệu bài: tutorial luôn có
  }
  return out;
}

function tools(ctx) {
  const { db, config, S, channelOf, chanData, castOf } = kit(ctx);
  return [
    { name: 'get_capabilities', scope: 'read', description: 'Khối hình (block types + lược đồ, theo loại bài), giọng, hạn mức có nguồn, nhân vật, từ điển thuật ngữ của kênh.', schema: { channel: S }, required: [], handler: (a) => {
      let blocks = [];
      try { blocks = require('../../render/blocks/registry.js').list(); } catch (e) { events.logError('capabilities.blocks', e); }
      const providers = db.all('SELECT display_id, kind, vendor, model, enabled, scan FROM providers WHERE workspace_id=? AND deleted_at IS NULL ORDER BY display_id', db.ws)
        .map((p) => { const s = J(p.scan) || {}; return { display_id: p.display_id, kind: p.kind, vendor: p.vendor, model: p.model, enabled: !!p.enabled, available: s.available, quota: s.quota || { value: null, source: 'unknown' }, voices: s.voices || [] }; });
      const ch = channelOf(a.channel);
      const d = chanData(ch);
      const data = { app_version: config.version, blocks, providers, channel: { display_id: ch.display_id, name: ch.name }, cast: castOf(ch).map((m) => ({ display_id: m.display_id, name: m.name, role_label: m.role_label })),
        glossary: d.glossary || d.terms || [], limits: LIMITS, policy_fields_owner_only: POLICY_FIELDS };
      for (const fn of ctx.caps || []) {
        let part = null;
        try { part = fn(ctx, a); } catch (e) { events.logError('capabilities.module', e); }
        if (part && typeof part === 'object') for (const [k, v] of Object.entries(part)) if (!(k in data)) data[k] = v;
      }
      return { text: `Khối: ${blocks.map((b) => b.name + '@' + b.version).join(', ')}\nNhà cung cấp: ${providers.map((p) => p.display_id + ' ' + p.kind + ' ' + (p.model || '(chưa quét model)')).join('; ') || '(chưa có)'}\nNhân vật: ${data.cast.map((m) => m.display_id + ' ' + m.name).join(', ')}\nThuật ngữ: ${JSON.stringify(data.glossary)}`, data };
    } },
  ];
}

module.exports = { tools, capabilities };
