// © 2026 Gen Labs — All rights reserved.
// Quyền dùng asset (SPEC-0.2.0 §6.10, CNS-092/125). Hiện trạng = hàng MỚI NHẤT của asset trong asset_rights (chỉ thêm hàng).
// Luật: mọi asset raster/audio do người dùng tải lên SAU migration 0003 cần `attest`; SVG, asset hệ thống và asset cũ (trước 0003) không cần.
'use strict';

const RASTER = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const isRaster = (a) => RASTER.has(String(a.mime || '')) || (['image', 'logo', 'cover'].includes(a.kind) && a.mime !== 'image/svg+xml');
const isAudio = (a) => a.kind === 'audio' || /^audio\//.test(String(a.mime || ''));

// Thời điểm migration 0003 chạy (asset tạo từ lúc này trở đi chịu luật). Không có ⇒ null (không áp luật).
function cutoff(db) {
  const r = db.get('SELECT applied_at FROM schema_migrations WHERE version=3');
  return r ? r.applied_at : null;
}
// Asset này có thuộc diện cần xác nhận quyền không (chưa xét đã xác nhận hay chưa)?
function needsRights(a, cut) {
  if (!a || a.source === 'system') return false;
  if (!(isRaster(a) || isAudio(a))) return false;
  return !!cut && String(a.created_at) >= String(cut);
}
// 'attested' | 'pending' (cần mà chưa có/đã thu hồi) | 'exempt'
function statusOf(db, a, cut) {
  const last = db.get('SELECT action FROM asset_rights WHERE asset_id=? ORDER BY at DESC, rowid DESC LIMIT 1', a.id);
  if (last && last.action === 'attest') return 'attested';
  return needsRights(a, cut === undefined ? cutoff(db) : cut) ? 'pending' : 'exempt';
}
// refs = [chuỗi | {asset}] — mỗi phần tử là mã AS-…, id, hoặc đường dẫn tương đối media/xx/<sha>.<ext> (dạng plan.assetRefs). → mảng asset thiếu quyền (display_id)
function missing(db, refs) {
  const cut = cutoff(db), out = [];
  for (const r of refs || []) {
    const ref = typeof r === 'string' ? r : r && r.asset;
    if (!ref || /^data:/.test(ref)) continue;
    const a = db.get('SELECT * FROM assets WHERE display_id=? OR id=? OR path=?', ref, ref, String(ref).replace(/^file:\/\//, ''));
    if (a && statusOf(db, a, cut) === 'pending' && !out.includes(a.display_id)) out.push(a.display_id);
  }
  return out;
}
// SQL (biểu thức cho lưới assets): cột `rights` ∈ attested | pending | exempt — cùng luật với statusOf (thời điểm 0003 lấy từ schema_migrations ngay trong SQL).
const RIGHTS_SQL = `CASE
  WHEN (SELECT x.action FROM asset_rights x WHERE x.asset_id=a.id ORDER BY x.at DESC, x.rowid DESC LIMIT 1)='attest' THEN 'attested'
  WHEN a.source!='system' AND (a.mime IN ('image/png','image/jpeg','image/webp','image/gif') OR a.kind='audio' OR a.mime LIKE 'audio/%')
       AND a.created_at>=COALESCE((SELECT applied_at FROM schema_migrations WHERE version=3),'9999') THEN 'pending'
  ELSE 'exempt' END`.replace(/\s+/g, ' ');

module.exports = { cutoff, needsRights, statusOf, missing, RIGHTS_SQL, isRaster, isAudio };
