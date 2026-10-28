// © 2026 Gen Labs — All rights reserved.
// Màn Nhân vật (#/cast) — STUB do P0b tạo (SPEC-0.2.0 §2.4): lưới `cast` + Inspector mặc định, đọc ?q= (vd #/cast?q=status:candidate từ Tổng quan).
// Gói UI-L1 sở hữu file này và thay bằng màn thật (Bảng nhân vật, cast.approve qua ConfirmModal, preview qua renderStill).
import { gridView } from './grid-view.js';

export const mount = gridView({ grid: 'cast', title: 'nav.cast', desc: 'cast.desc', empty: 'cast.empty' });
