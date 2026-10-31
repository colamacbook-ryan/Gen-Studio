// © 2026 Gen Labs — All rights reserved.
// Gói C (0.3.0): hai op phục vụ nhập kho hàng hiện có (`cli/import-kit.js`) — KHÔNG đụng pipeline Muse đầy đủ
// (asset_requests/submission_files, gói khác). Quyền 'ownerOrCli' giống `kit.sync` (DB-GK-0.1 §8: importer
// INSERT THẲNG trạng thái đích, không qua cạnh chuyển — trigger chỉ chặn UPDATE, không chặn INSERT).
'use strict';
const kit = require('./kit.js');

const DESC_FIELDS = ['source_kind', 'redistribution', 'quality', 'commercial_ok', 'subject'];

function register(op, ctx) {
  const { db, ws, err, byRef, need } = ctx;
  if (!db) return; // test dựng ctx rỗng để kiểm nạp module

  // ---- asset.meta — gán mô tả nhập kho (nguồn, quyền dùng, chất lượng, ô Bộ Neo) cho một asset đã có.
  // Idempotent: không đổi cột nào khớp sẵn giá trị cũ (nhập lại = 0 thay đổi, brief 0.3.0-C).
  op('asset.meta', 'ownerOrCli', (c) => {
    const p = c.p;
    const asset = need('assets', p.asset, 'tài sản');
    const patch = {};
    let derivedSubject;
    if (p.kit_slot !== undefined) {
      if (p.kit_slot === null) {
        if (asset.kit_slot !== null) patch.kit_slot = null;
      } else {
        const slot = db.get('SELECT * FROM kit_slots WHERE workspace_id=? AND code=?', ws(), p.kit_slot);
        if (!slot) throw err('not_found', `Không tìm thấy ô "${p.kit_slot}".`, { kit_slot: p.kit_slot });
        if (slot.retired_in) throw err('invalid', `Ô "${p.kit_slot}" đã retired (${slot.retired_in}).`, { kit_slot: p.kit_slot });
        if (asset.kit_slot !== slot.code) patch.kit_slot = slot.code;
        derivedSubject = kit.deriveSubject(slot.code);
      }
    }
    const subjectWanted = p.subject !== undefined ? p.subject : derivedSubject;
    for (const f of DESC_FIELDS) {
      const v = f === 'subject' ? subjectWanted : p[f];
      if (v === undefined) continue;
      if (asset[f] !== v) patch[f] = v;
    }
    if (!Object.keys(patch).length) {
      return { result: { ...asset, changed: false }, entity: ['asset', asset.display_id], before: null, after: { changed: false } };
    }
    db.update('assets', asset.id, patch);
    const before = Object.fromEntries(Object.keys(patch).map((k) => [k, asset[k]]));
    return { result: { ...byRef('assets', asset.id), changed: true }, entity: ['asset', asset.display_id], before, after: { ...patch, changed: true } };
  });

  // ---- submission.import — ghi nhận một lần nộp (Muse/catalog) đã có sẵn vào `asset_submissions`, INSERT
  // thẳng trạng thái đích (gói C không có submission.approve/reject — chờ pipeline Muse đầy đủ, gói khác).
  // Idempotent theo (asset, kit_slot): đã có lần nộp cho đúng cặp này thì bỏ qua, không tạo thêm.
  op('submission.import', 'ownerOrCli', (c) => {
    const p = c.p;
    const asset = need('assets', p.asset, 'tài sản');
    if (!['submitted', 'approved', 'rework', 'rejected'].includes(p.state)) {
      throw err('invalid', 'state phải là submitted/approved/rework/rejected.', { state: p.state });
    }
    const kitSlot = p.kit_slot || null;
    const dup = db.get('SELECT * FROM asset_submissions WHERE workspace_id=? AND asset_id=? AND kit_slot IS ?', ws(), asset.id, kitSlot);
    if (dup) return { result: { ...dup, deduped: true }, entity: ['asset_submission', dup.display_id], before: null, after: { deduped: true } };
    const row = db.insertRow('asset_submissions', {
      agent_id: null, kit_slot: kitSlot, asset_id: asset.id, previous_id: null, attempt: 1,
      state: p.state, checks_level: p.checks_level || null,
      decision_kind: p.decision_kind || null, decided_actor: p.decided_actor || null, decision_reason: p.decision_reason || null,
    }, { prefix: 'SB' });
    return { result: { ...row, deduped: false }, entity: ['asset_submission', row.display_id], before: null, after: { state: row.state, deduped: false } };
  });
}

module.exports = { register };
