// © 2026 Gen Labs — All rights reserved.
// UI-L5R3 — đọc MỘT kênh cho Inspector kênh (tab Định dạng, tab Nhận diện của UI-H1 qua móc channel-tabs). Chỉ đọc, cần phiên.
//   GET /api/channels/:id → {channel:{display_id, name, lang_primary, lang_terms, version, data}}  (data = channel_versions.data của version hiện hành)
// Ghi vẫn đi qua POST /api/channels (channel.update ⇒ write(), quyền POLICY_FIELDS) — route này không ghi gì.
'use strict';

function register(add, rctx) {
  const { db, need } = rctx;
  add('GET', '/api/channels/:id', { sess: true }, async (c) => {
    const ch = need('channels', c.params.id, 'kênh', ' AND deleted_at IS NULL');
    const v = db.json(db.get('SELECT data FROM channel_versions WHERE entity_id=? AND version=?', ch.id, ch.current_version));
    return { channel: { display_id: ch.display_id, name: ch.name, lang_primary: ch.lang_primary, lang_terms: ch.lang_terms, version: ch.current_version,
      row_version: ch.row_version, data: (v && v.data) || {} } };
  });
}

module.exports = { register };
