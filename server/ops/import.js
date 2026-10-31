// © 2026 Gen Labs — All rights reserved.
// Gói C (0.3.0, +C.2): ba op phục vụ nhập kho hàng hiện có (`cli/import-kit.js`) — KHÔNG đụng pipeline Muse đầy đủ
// (asset_requests/submission_files, gói khác). Quyền 'ownerOrCli' giống `kit.sync` (DB-GK-0.1 §8: importer
// INSERT THẲNG trạng thái đích, không qua cạnh chuyển — trigger chỉ chặn UPDATE, không chặn INSERT).
'use strict';
const kit = require('./kit.js');

const DESC_FIELDS = ['source_kind', 'redistribution', 'quality', 'commercial_ok', 'subject'];
const ATTEST_BASIS = ['own_product', 'licensed', 'owner_responsibility'];

function register(op, ctx) {
  const { db, ws, err, byRef, need } = ctx;
  if (!db) return; // test dựng ctx rỗng để kiểm nạp module

  // ---- asset.attest_import — nhập kho ghi asset_rights (DB-GK-0.1 §8; cortex CNS-M1-18: nhập kho không ghi
  // asset_rights ⇒ điều 2 "quyền hiệu lực" của STANDARD §5 không bao giờ thoả, % đầy đủ đứng ở 0 vĩnh viễn).
  // Idempotent theo asset: hàng mới nhất đã 'attest' ⇒ bỏ qua, không ghi chồng (asset_rights chỉ thêm — 0003).
  // `by` = owner duy nhất của workspace (CLI không có danh tính user — khác `asset.attest` ownerUi của gói U,
  // vốn chỉ chạy trên phiên UI thật của Ryan và đòi pii_redacted cho ảnh raster).
  op('asset.attest_import', 'ownerOrCli', (c) => {
    const p = c.p;
    const asset = need('assets', p.asset, 'tài sản');
    if (!ATTEST_BASIS.includes(p.basis)) throw err('invalid', 'basis phải là own_product/licensed/owner_responsibility.', { basis: p.basis });
    const last = db.get('SELECT action FROM asset_rights WHERE asset_id=? ORDER BY at DESC, rowid DESC LIMIT 1', asset.id);
    if (last && last.action === 'attest') return { result: { asset: asset.display_id, rights: 'attested', deduped: true }, entity: ['asset', asset.display_id], before: null, after: { deduped: true } };
    const owner = db.get("SELECT id FROM users WHERE role='owner' AND deleted_at IS NULL ORDER BY created_at LIMIT 1");
    if (!owner) throw err('invalid', 'Chưa có owner trong hệ thống để ghi asset_rights.', null);
    db.insertRow('asset_rights', { asset_id: asset.id, action: 'attest', basis: p.basis, pii_redacted: 0, note: p.note || null, by: owner.id, at: db.now() });
    return { result: { asset: asset.display_id, rights: 'attested', deduped: false }, entity: ['asset', asset.display_id], before: null, after: { rights: 'attested', basis: p.basis, deduped: false } };
  });

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
  // `quality_claimed` (0.3.0-C.2, CNS-M1-07): hạng Muse TỰ KHAI trong meta.json — lưu riêng cột này, KHÔNG
  // đổ vào `assets.quality` (Ryan đặt khi duyệt/chứng nhận).
  op('submission.import', 'ownerOrCli', (c) => {
    const p = c.p;
    const asset = need('assets', p.asset, 'tài sản');
    if (!['submitted', 'approved', 'rework', 'rejected', 'blocked'].includes(p.state)) {
      throw err('invalid', 'state phải là submitted/approved/rework/rejected/blocked.', { state: p.state });
    }
    if (p.quality_claimed !== undefined && p.quality_claimed !== null && !['A', 'B'].includes(p.quality_claimed)) {
      throw err('invalid', 'quality_claimed phải là A/B.', { quality_claimed: p.quality_claimed });
    }
    const kitSlot = p.kit_slot || null;
    // bổ sung cổng C.2 (Gen, mục 4 — "chống đụng ô"): ô đang bị MỘT AGENT MCP giữ sống (kit_slots.claimed_by,
    // kit.claim/SPEC-GK-0.1) ⇒ nhập kho (cron Drive/CLI, không có danh tính agent) phải CHỜ, không tạo thêm
    // lần nộp chen vào giữa — tránh đụng độ với bài đang làm dở qua MCP.
    if (kitSlot) {
      const slot = db.get('SELECT claimed_by, claim_expires_at FROM kit_slots WHERE workspace_id=? AND code=?', ws(), kitSlot);
      if (slot && slot.claimed_by && slot.claim_expires_at && slot.claim_expires_at > db.now()) {
        throw err('conflict', `Ô "${kitSlot}" đang được agent "${slot.claimed_by}" giữ tới ${slot.claim_expires_at} — nhập kho phải chờ hết hạn giữ (chống đụng ô).`, { kit_slot: kitSlot, claimed_by: slot.claimed_by, claim_expires_at: slot.claim_expires_at });
      }
    }
    const dup = db.get('SELECT * FROM asset_submissions WHERE workspace_id=? AND asset_id=? AND kit_slot IS ?', ws(), asset.id, kitSlot);
    if (dup) return { result: { ...dup, deduped: true }, entity: ['asset_submission', dup.display_id], before: null, after: { deduped: true } };
    const row = db.insertRow('asset_submissions', {
      agent_id: null, kit_slot: kitSlot, asset_id: asset.id, previous_id: null, attempt: 1,
      state: p.state, checks_level: p.checks_level || null, quality_claimed: p.quality_claimed || null,
      decision_kind: p.decision_kind || null, decided_actor: p.decided_actor || null, decision_reason: p.decision_reason || null,
    }, { prefix: 'SB' });
    return { result: { ...row, deduped: false }, entity: ['asset_submission', row.display_id], before: null, after: { state: row.state, deduped: false } };
  });

  // ---- submission.set_state — nâng trạng thái một lần nộp import đã có (vd 'submitted' → 'approved' SAU khi
  // đã ghi `submission.record_checks` ở trạng thái 'submitted' — record_checks chặn ghi khi không còn
  // 'submitted', nên import phải ghi kiểm TRƯỚC rồi mới nâng, review PR #35 mục 4). Idempotent: state khớp
  // sẵn ⇒ không đổi gì.
  // Nợ review C (0.3.0-C.2, mục 3): CHỈ cho sửa lần nộp DO IMPORT TẠO (`agent_id IS NULL` — Muse qua MCP luôn
  // có `agent_id`, đi đường `submission.approve`/`.reject`/`.reopen` của gói khác) và CHỈ từ 'submitted' —
  // tránh một lệnh CLI đổi được trạng thái lần nộp đã chốt (approved/rejected) của pipeline Muse thật.
  op('submission.set_state', 'ownerOrCli', (c) => {
    const p = c.p;
    const sub = need('asset_submissions', p.submission, 'lần nộp');
    if (!['submitted', 'approved', 'rework', 'rejected', 'blocked'].includes(p.state)) {
      throw err('invalid', 'state phải là submitted/approved/rework/rejected/blocked.', { state: p.state });
    }
    if (sub.agent_id !== null) throw err('forbidden', `Lần nộp ${sub.display_id} do agent "${sub.agent_id}" tạo (qua MCP) — submission.set_state chỉ sửa lần nộp do import tạo (agent_id IS NULL).`, { submission: sub.display_id, agent_id: sub.agent_id });
    if (sub.state === p.state) return { result: { ...sub, changed: false }, entity: ['asset_submission', sub.display_id], before: null, after: { changed: false } };
    if (sub.state !== 'submitted') throw err('conflict', `Lần nộp ${sub.display_id} đang ở "${sub.state}" — submission.set_state chỉ đổi được từ "submitted".`, { state: sub.state });
    db.update('asset_submissions', sub.id, {
      state: p.state, decision_kind: p.decision_kind || null, decided_actor: p.decided_actor || null, decision_reason: p.decision_reason || null,
    });
    return { result: { ...byRef('asset_submissions', sub.id), changed: true }, entity: ['asset_submission', sub.display_id], before: { state: sub.state }, after: { state: p.state, changed: true } };
  });
}

module.exports = { register };
