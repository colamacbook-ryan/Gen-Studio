// © 2026 Gen Labs — All rights reserved.
// Gói U — route xác nhận quyền dùng asset (SPEC-0.2.0 §6.10, §10): CHỈ phiên UI của chủ xưởng (cookie + CSRF + Origin chặt), đi qua write() op asset.attest / asset.revoke_attest.
// UI L5 (gói UI-L5R3) gọi hai route này từ ConfirmModal. Agent (Bearer) / CLI không có lối: route đòi phiên UI và op kiểm `ownerUi`.
//   POST /api/assets/:id/attest  {basis: own_product|licensed|owner_responsibility, pii_redacted: true (bắt buộc với ảnh raster), note?}
//   POST /api/assets/:id/revoke-attest {note?}
'use strict';

function register(add, rctx) {
  const { write, actorOf } = rctx;
  add('POST', '/api/assets/:id/attest', { sess: true, ui: true, strictOrigin: true }, async (c) => {
    const b = c.body || {};
    return { result: write(actorOf(c), 'asset.attest', { asset: c.params.id, basis: b.basis, pii_redacted: b.pii_redacted === true, note: b.note }) };
  });
  add('POST', '/api/assets/:id/revoke-attest', { sess: true, ui: true, strictOrigin: true }, async (c) => {
    const b = c.body || {};
    return { result: write(actorOf(c), 'asset.revoke_attest', { asset: c.params.id, note: b.note }) };
  });
}

module.exports = { register };
