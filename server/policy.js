// © 2026 Gen Labs — All rights reserved.
// Trường chính sách của kênh — CHỈ chủ xưởng sửa (CNS-036, SPEC-0.2.0 §2.4/§10). MỘT danh sách duy nhất cho write.js và mcp-tools (CNS-089).
// F7 (SPEC-0.2.0-F7 §3.2/§9): `default_aspect` (tỉ lệ mặc định của kênh) và `schedule.mix` (lịch trộn tỉ lệ, nằm trong `schedule`) là chính sách ⇒ chỉ owner đặt; khoá `aspect` cũ chỉ còn là bí danh đọc.
// `brand` (nhận diện kênh) và `policy` (policy.thumbnail_required…) là chính sách: agent chỉ được ĐỀ XUẤT (Suggestion `channel_brand`), không sửa trực tiếp.
'use strict';

const POLICY_FIELDS = ['schedule', 'loudness', 'subtitle_langs', 'limits', 'aspect', 'default_aspect', 'fps', 'publish', 'auto_publish', 'brand', 'policy'];

// Các trường chính sách có mặt trong `data` hoặc ở cấp trên (`top`, payload thô của op). Rỗng = không vi phạm.
function policyHits(data, top) {
  return POLICY_FIELDS.filter((k) => (data && typeof data === 'object' && k in data) || (top && typeof top === 'object' && k in top));
}

module.exports = { POLICY_FIELDS, policyHits };
