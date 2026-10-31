// © 2026 Gen Labs — All rights reserved.
// A5 Nhật ký kiểm/audit (gói D, 0.3.0): lọc sẵn lưới `audit` chung (server/grids/audit.js) theo các đối tượng liên quan kho
// (lần nộp, tài sản, ô Bộ Neo, đề xuất) — không thêm lưới riêng, tái dùng Data Console đã có.
import { gridView } from './grid-view.js';

export const mount = (container, ctx) => gridView({
  grid: 'audit', title: 'klog.title', desc: 'klog.desc', empty: 'state.empty',
  q: 'entity_type:asset_submission,asset,kit_slots,suggestion',
})(container, ctx);
