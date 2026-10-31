# UI Kho (Gen Kit) — 0.3.0 gói D

> Song ngữ VI/EN theo yêu cầu bắt buộc (`FRONTEND-GK-0.1.md`). Ảnh chụp thật: `docs/ui-kho/` (1440×900 và 390×844).

## VI

Giao diện kho tài nguyên Bộ Neo (Anchor Set, 457 ô) nằm trong sidebar Gen-Studio, 6 màn:

| Màn | Route | Mô tả |
|---|---|---|
| A1 Tổng quan kho | `#/kho` | Lưới 457 ô theo 10 nhóm NB-01..10, màu theo trạng thái (trống/chờ kiểm/làm lại/chờ chủ xưởng/đã duyệt/đạt), % chứng nhận mỗi nhóm + tổng thể, danh sách ô đang bị Muse giữ. |
| A2 Hàng chờ duyệt | `#/kho-queue` | Data Console các bài Muse nộp — lọc theo trạng thái, xem tệp + bảng tiêu chí kiểm máy, Duyệt / Trả làm lại / Bỏ / Mở lại, Miễn tiêu chí, tick M*/H rồi Xác nhận ô. |
| A3 Chi tiết ô | `#/kho-slot/<mã ô>` | Lịch sử nộp, chứng nhận, tiêu chí bắt buộc của nhóm ô, phiên bản nhân vật. |
| A4 Phiếu & Muse | `#/kho-tokens` | Tạo/thu hồi token Muse (`assets.submit`) và Gen (`assets.review`), danh sách ô đang bị giữ (claim còn hạn). |
| A5 Nhật ký kiểm | `#/kho-audit` | Nhật ký ghi/sửa liên quan kho (lọc sẵn trên nhật ký chung). |
| A6 Cài đặt kho | `#/kho-settings` | Đồng bộ lại danh mục 457 ô, lối tắt đổi mật khẩu. |

**% đạt (A1):** hiện tính trực tiếp từ `kit_certs` (mỗi ô có ≥1 chứng nhận = đạt). TODO: chuyển sang view `v_kit_coverage` khi gói C.2 (đội khác) bổ sung.

**API mỏng** (`server/routes/kit.js`, mọi ghi qua `write()`, chỉ gọi lại op đã có ở `server/ops/kit.js` gói A/B/C): `GET /api/kit/overview`, `GET /api/kit/slot/:code`, `GET /api/kit/submission/:id`, `POST /api/kit/submission/:id/decide`, `POST /api/kit/certify`, `POST /api/kit/waive`, `POST /api/kit/sync`.

## EN

The Gen Kit Anchor Set store UI (457 slots) lives in the Gen-Studio sidebar, 6 screens:

| Screen | Route | Description |
|---|---|---|
| A1 Overview | `#/kho` | 457-slot grid across 10 groups (NB-01..10), colour-coded by status (empty/pending/rework/awaiting owner/approved/certified), per-group and overall certification %, slots currently held by Muse. |
| A2 Review queue | `#/kho-queue` | Data Console of Muse's submissions — filter by state, view the file + machine-check criteria table, Approve / Request rework / Reject / Reopen, Waive a criterion, tick M*/H then Certify the slot. |
| A3 Slot detail | `#/kho-slot/<slot code>` | Submission history, certifications, required criteria for the slot's group, character revision. |
| A4 Requests & Muse | `#/kho-tokens` | Create/revoke Muse tokens (`assets.submit`) and Gen tokens (`assets.review`), slots currently held (live claims). |
| A5 Review log | `#/kho-audit` | Store-related audit entries (pre-filtered view of the shared audit log). |
| A6 Store settings | `#/kho-settings` | Re-sync the 457-slot catalog, shortcut to change password. |

**Certification % (A1):** currently computed directly from `kit_certs` (a slot with ≥1 certification counts as certified). TODO: switch to the `v_kit_coverage` view once package C.2 (another team) adds it.

**Thin API** (`server/routes/kit.js`, every write goes through `write()`, only calling existing ops in `server/ops/kit.js` from packages A/B/C): `GET /api/kit/overview`, `GET /api/kit/slot/:code`, `GET /api/kit/submission/:id`, `POST /api/kit/submission/:id/decide`, `POST /api/kit/certify`, `POST /api/kit/waive`, `POST /api/kit/sync`.
