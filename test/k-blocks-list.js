// © 2026 Gen Labs — All rights reserved.
// Danh sách khối thêm ở 0.2.x cho clip dài (gói K: quiz, compare-split…) theo ĐÚNG thứ tự index.json — các test hợp đồng cũ (9 khối MVP, 6 khối tutorial) nối thêm danh sách này.
// Thêm khối mới ⇒ thêm tên vào đây (chủ đích), không nới lỏng test hợp đồng.
'use strict';
const LONG_BLOCKS = ['quiz', 'compare-split'];
// khối 0.2.x dựng được ở 9:16 (còn lại chỉ 16:9, vd pip-swap)
const LONG_BLOCKS_916 = ['quiz', 'compare-split'];
module.exports = { LONG_BLOCKS, LONG_BLOCKS_916 };
