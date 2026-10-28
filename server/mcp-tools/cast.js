// © 2026 Gen Labs — All rights reserved.
// Tool MCP về nhân vật: list_cast · save_cast_member · render_cast_preview (tên giữ nguyên từ 0.1.x). Gói V (SPEC-0.2.0 §3, §13.2): công thức được kiểm phía server khi lưu
// (xem server/ops/cast.js) — tool này thêm `status` (draft|candidate), `validate_only` (kiểm không lưu) và trả trạng thái chốt dùng. cast.approve / cast.retire KHÔNG có tool (§10: chỉ owner trên UI).
// capabilities(ctx) → object gộp vào get_capabilities: lược đồ công thức, enum tính cách, danh sách mood để agent viết đúng.
// Gói K có thể thay render_cast_preview bằng renderStill mode cast.
'use strict';
const { kit } = require('./_kit.js');

function capabilities() {
  const { ENUMS } = require('../../render/cast/validate.js');
  const direct = require('../../render/engine/direct.js');
  return {
    cast_recipe: {
      statuses_agent_can_set: ['draft', 'candidate'],
      approve_retire: 'chỉ chủ xưởng trên giao diện (cast.approve / cast.retire) — agent không có tool',
      persona: { role: ENUMS.role, energy: ENUMS.energy, temperament: ENUMS.temperament, laugh: ENUMS.laugh, tic: 'tên một động tác của engine (vd chinHand, shrug)' },
      running_gag: { trigger: ['on_partner_mood:<mood>'].concat(ENUMS.gagTrigger), max_per_min: '1–6' },
      dynamic_type: ENUMS.dynamic,
      voice: '{provider: "gemini", model: null | tên model, voice: tên giọng} — mỗi nhân vật một giọng riêng, không trùng nhân vật khác trong kênh (kể cả Anh Gen / Bé Hỏi)',
      hard_rules: ['không chung identity.must hay linh kiện nhận diện với nhân vật khác (KOL không đeo kính của Anh Gen)', 'không có "status" trong data', 'không có tên kênh trong công thức', 'linh kiện phải đủ hướng nhìn (trước, q45, q90, q135, q180)'],
      catchphrase: 'không tự đọc lên: agent tự viết vào câu thoại, ≤ 2 lần mỗi bài',
    },
    moods: direct.moodNames(),
    mood_aliases: direct.MOODS.aliases,
  };
}

function tools(ctx) {
  const { db, write, S, O, channelOf, castOf, actorOf, need, fail } = kit(ctx);
  const pending = (m) => m.status === 'approved' && m.approved_version && m.version > m.approved_version;
  const statusOf = (ref) => { const r = db.get('SELECT status, approved_version FROM cast_members WHERE display_id=?', ref); return r || { status: 'draft', approved_version: null }; };
  return [
    { name: 'list_cast', scope: 'read', description: 'Danh sách nhân vật của kênh (kèm trạng thái: draft | candidate | approved | retired; "pending_changes" = đã chốt nhưng có bản sửa mới chờ chốt).', schema: { channel: S }, required: [], handler: (a) => {
      const m = castOf(channelOf(a.channel)).map((x) => Object.assign(x, statusOf(x.display_id)));
      m.forEach((x) => { x.pending_changes = !!pending(x); });
      return { text: m.map((x) => `${x.display_id} ${x.name} (${x.role_label || '—'}) v${x.version} [${x.status}${x.pending_changes ? ' · có thay đổi chờ chốt' : ''}]`).join('\n') || 'Chưa có nhân vật.', data: { cast: m } };
    } },
    { name: 'save_cast_member', scope: 'compose', description: 'Tạo/sửa nhân vật (công thức Gen-Chibi trong data) — version mới. Công thức được kiểm phía server (lược đồ, linh kiện, không trùng nhân vật khác); sai thì từ chối kèm lý do. status: draft | candidate (chốt dùng là việc của chủ xưởng). validate_only=true: chỉ kiểm, không lưu.', schema: { cast: S, channel: S, name: S, role_label: S, data: O, note: S, status: S, validate_only: { type: 'boolean' } }, required: ['data'], handler: (a, c) => {
      if (a.validate_only) {
        const { validateRecipe } = require('../../render/cast/validate.js');
        const castLib = require('../../render/cast');
        const m = a.cast ? need('cast_members', a.cast, 'nhân vật') : null;
        const ch = m ? db.json(db.get('SELECT * FROM channels WHERE id=?', m.channel_id)) : channelOf(a.channel);
        if (!a.data || typeof a.data !== 'object') throw fail('invalid', 'Cần data (công thức nhân vật).');
        const sibs = castOf(ch).filter((x) => !m || x.display_id !== m.display_id).map((x) => ({ ref: x.display_id, name: x.name, data: x.data }));
        const cv = db.json(db.get('SELECT data FROM channel_versions WHERE entity_id=? AND version=?', ch.id, ch.current_version));
        const v = validateRecipe(a.data, { library: castLib.library(), brand: cv && cv.data && cv.data.brand, channelName: ch.name, siblings: sibs, strict: a.status === 'candidate' });
        return { text: v.ok ? `Công thức hợp lệ (${v.mode})${v.warnings.length ? ' — ' + v.warnings.length + ' cảnh báo' : ''}.` : 'Công thức chưa hợp lệ:\n' + v.errors.map((e) => `- ${e.path || '(chung)'}: ${e.text_human}`).join('\n'), data: { ok: v.ok, mode: v.mode, errors: v.errors, warnings: v.warnings } };
      }
      const out = write(actorOf(c), 'cast.save', { id: a.cast, channel: a.channel, name: a.name, role_label: a.role_label, data: a.data, note: a.note, status: a.status });
      return { text: `Đã lưu nhân vật ${out.display_id} v${out.version} [${out.status}].${out.warnings ? ' Cảnh báo: ' + out.warnings.map((w) => w.text_human).join(' · ') : ''}`, data: { cast: out.display_id, version: out.version, status: out.status, warnings: out.warnings || [] } };
    } },
    { name: 'render_cast_preview', scope: 'read', description: 'Xem trước nhân vật (SVG).', schema: { cast: S }, required: [], handler: () => ({ text: 'Xem trước nhân vật chưa hỗ trợ ở bản này (chủ xưởng xem trên giao diện).', data: { supported: false, code: 'not_supported' } }) },
  ];
}

module.exports = { tools, capabilities };
