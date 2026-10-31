// © 2026 Gen Labs — All rights reserved.
// Gói C (0.3.0) — quy tắc ánh xạ TÊN FILE → mã ô Bộ Neo (kit_slots.code). Dùng chung cho `server/ops/import.js`
// và `cli/import-kit.js`. Hai tầng:
//  1) OVERRIDES — ánh xạ tay theo (mã phiếu MR, tên file) cho hàng THẬT đã nộp trong `library/inbox/` (tên file
//     tự do, không theo mẫu máy đọc được — xem ghi chú MUSE.md §3 "tên file viết thường, nối gạch ngang").
//  2) Mẫu tổng quát `<subject>-<NN>-<slug>.<ext>` ⇒ thử `<subject>.expr.<NN>` rồi `<subject>.pose.<NN>` (mẫu đặt
//     tên khuyến nghị cho lô Muse SAU này khi nộp thẳng theo ô — ví dụ `nhi-21-sulking.png` ⇒ `nhi.expr.21`).
// Không khớp cả hai ⇒ unmapped, kèm lý do (brief 0.3.0-C: "báo rõ file không ánh xạ được").
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const KIT_SLOTS_FILE = path.join(__dirname, '..', 'seed', 'kit-slots.json');

let _slotCodes = null;
function slotCodes() {
  if (_slotCodes) return _slotCodes;
  const data = JSON.parse(fs.readFileSync(KIT_SLOTS_FILE, 'utf8'));
  _slotCodes = new Set((data.slots || []).map((s) => s.code));
  return _slotCodes;
}

// OVERRIDES[mrId][filename] = kit_slot | null (null = cố ý không gắn ô, ví dụ ảnh "preview"/sheet tổng hợp)
const OVERRIDES = {
  'MR-044': { // Nhi · thiết kế 3D gốc (3 phương án, cùng một ô — Ryan chọn khi certify)
    'nhi-3d-variant-a.png': 'nhi.id.01',
    'nhi-3d-variant-b.png': 'nhi.id.01',
    'nhi-3d-variant-c.png': 'nhi.id.01',
  },
  'MR-046': { // Vy · thiết kế 3D gốc
    'vy-3d-variant-a.png': 'vy.id.01',
    'vy-3d-variant-b.png': 'vy.id.01',
    'vy-3d-variant-c.png': 'vy.id.01',
  },
  'MR-045': { // Nhi · bảng xoay 3D — 4 góc máy khớp đúng nhi.id.02..05; file sheet tổng hợp không map (chỉ preview)
    'nhi-3d-view-front.png': 'nhi.id.02',
    'nhi-3d-view-three-quarter.png': 'nhi.id.03',
    'nhi-3d-view-side.png': 'nhi.id.04',
    'nhi-3d-view-back.png': 'nhi.id.05',
    'nhi-3d-turnaround-sheet-3840x2160.png': null,
  },
  'MR-047': { // Vy · bảng xoay 3D — 4 góc máy khớp đúng vy.id.02..05; file sheet tổng hợp không map (chỉ preview)
    'vy-3d-view-front.png': 'vy.id.02',
    'vy-3d-view-three-quarter.png': 'vy.id.03',
    'vy-3d-view-side.png': 'vy.id.04',
    'vy-3d-view-back.png': 'vy.id.05',
    'vy-3d-turnaround-sheet-3840x2160.png': null,
  },
  'MR-052': { // Ryan · toàn thân 3D (3 phương án trang phục, cùng một ô)
    'ryan-3d-grey-tee.png': 'ryan.id.01',
    'ryan-3d-smart-shirt.png': 'ryan.id.01',
    'ryan-3d-hoodie.png': 'ryan.id.01',
  },
  'MR-053': { // Ryan · bảng xoay 3D — 4 góc máy khớp đúng ryan.id.02..05; file sheet tổng hợp không map (chỉ preview)
    'ryan-3d-view-front.png': 'ryan.id.02',
    'ryan-3d-view-three-quarter.png': 'ryan.id.03',
    'ryan-3d-view-side.png': 'ryan.id.04',
    'ryan-3d-view-back.png': 'ryan.id.05',
    'ryan-3d-turnaround-sheet-3840x2160.png': null,
  },
};

// Mẫu chung MR-063/065/066 (nhi/vy/ryan) VÀ hàng từ Drive (VPS inbox/drive/03_Hoan-thanh/<MR>/<file>):
// <subject>-NN-slug.ext. `fx` dùng riêng cho ký hiệu cảm xúc (MR-064, fx.manpu.NN) — cùng dạng số nhưng nhóm khác.
const NUMBERED_RE = /^([a-z]+)-([0-9]{1,2})-([a-z0-9-]+)\.(png|jpg|jpeg|webp)$/i;
const BASE_FRAME_RE = /^([a-z]+)-00-base\.(png|jpg|jpeg|webp)$/i;

// mapFile({ mrId, filename }) → { code: string|null, reason: string }
function mapFile({ mrId, filename }) {
  const ov = mrId && OVERRIDES[mrId];
  if (ov && Object.prototype.hasOwnProperty.call(ov, filename)) {
    const code = ov[filename];
    return code ? { code, reason: `override MR-ánh xạ tay (${mrId})` } : { code: null, reason: 'override: cố ý không gắn ô (ảnh xem trước/tổng hợp)' };
  }
  // `<subject>-00-base.ext` (MR-063 bước 1, STANDARD-KIT-v1): ảnh gốc dùng để sửa-ra các biểu cảm bằng
  // image-to-image, KHÔNG phải một ô Bộ Neo (mã ô bắt đầu từ 01) — cố ý bỏ qua, không phải lỗi.
  if (BASE_FRAME_RE.test(filename)) {
    return { code: null, reason: '<subject>-00-base.ext là ảnh gốc tham chiếu (MR-063 bước 1), không phải một ô (mã ô bắt đầu từ 01) — cố ý không gắn ô' };
  }
  const m = NUMBERED_RE.exec(filename);
  if (m) {
    const subject = m[1].toLowerCase();
    const n = m[2].padStart(2, '0');
    const codes = slotCodes();
    if (subject === 'fx') {
      const fx = `fx.manpu.${n}`;
      if (codes.has(fx)) return { code: fx, reason: `mẫu tên số fx-NN-slug → ${fx}` };
      return { code: null, reason: `mẫu tên số khớp nhưng không có ô "${fx}" trong seed/kit-slots.json` };
    }
    const expr = `${subject}.expr.${n}`;
    if (codes.has(expr)) return { code: expr, reason: `mẫu tên số <subject>-NN-slug → ${expr}` };
    const pose = `${subject}.pose.${n}`;
    if (codes.has(pose)) return { code: pose, reason: `mẫu tên số <subject>-NN-slug → ${pose}` };
    return { code: null, reason: `mẫu tên số khớp nhưng không có ô "${expr}"/"${pose}" trong seed/kit-slots.json` };
  }
  return { code: null, reason: 'không khớp quy tắc ánh xạ (override hoặc mẫu <subject>-NN-slug.ext)' };
}

module.exports = { mapFile, slotCodes, OVERRIDES };
