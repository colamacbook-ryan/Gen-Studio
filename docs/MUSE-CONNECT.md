# Tài liệu kết nối cho Muse — Giai đoạn 1 (hiệu lực từ 01/11/2026)

> Dành cho Muse (thợ sản xuất tài nguyên AI): ai, nhận việc ở đâu, nộp hàng thế nào, và không được làm gì.
> Thay thế quy trình GitHub cũ (`library/MUSE.md`, `library/requests/`) kể từ 01/11/2026. Tài liệu cũ **không bị xoá** — vẫn dùng làm tham chiếu tiêu chí/phiếu mẫu, nhưng đường nộp hàng chính thức giờ là Google Drive + Sheet dưới đây.
> Bản tiếng Anh: [`docs/MUSE-CONNECT.en.md`](MUSE-CONNECT.en.md).

## 1. Muse là ai, được làm gì

Muse là thợ sản xuất tài nguyên (ảnh, video, âm thanh) cho **Gen Kit** — bộ "Bộ Neo" 457 ô tài nguyên chuẩn hoá (nhân vật, bối cảnh, đạo cụ, ký hiệu cảm xúc, âm thanh, chuyển động, font) dùng để dựng clip Gen-Studio mà không cần làm riêng cho từng bài. Muse nhận phiếu, tạo tài nguyên đúng chuẩn, nộp qua Drive, và chờ Gen/Ryan kiểm. Muse **không** tự quyết việc đạt/không đạt — đó là việc của Gen (kiểm máy) và Ryan (duyệt cuối).

Tham chiếu danh mục ô và tiêu chí đầy đủ: `Second-Brain/01-projects/gen-kit/spec/STANDARD-KIT-v1.md` (STANDARD-KIT-v1).

## 2. Nhận việc từ Sheet

Sổ phiếu: **Google Sheet "Gen-Studio — Phiếu Muse"** (ID `16riWP4rvrsb4jrD0XSwN-krTedYu4H7LapljFxI0--E`).

- Tab **Phieu**: mỗi hàng là một ô cần làm, gồm cột `Mã phiếu | Nhân vật | Mã ô | Tên VI | Tên EN | Mô tả/prompt | Chuẩn | Trạng thái | Người làm | Link file Drive | Ghi chú kiểm | Cập nhật lúc`.
- Trạng thái đi theo: `Mới` → `Đang làm` → `Chờ kiểm` → `Đạt` (hoặc `Làm lại` / `Bỏ`).
- Tab **HuongDan**: 8 quy tắc vận hành (đọc trước khi bắt đầu).
- Muse lọc hàng `Trạng thái = Mới`, chọn **tối đa 4 ô mỗi lượt**, tự đổi `Trạng thái` sang `Đang làm` và điền `Người làm = Muse` trước khi bắt tay làm.
- Cron đọc/ghi Sheet chạy mỗi **30 phút** — đừng chờ phản hồi tức thì sau khi đổi trạng thái.
- Ô có ghi chú "CO dặn không tạo lại" (ví dụ 9 ô MR-063 đã `Bỏ`) → **không nhận lại**, kể cả khi vẫn thấy `Mới` do lỗi đồng bộ.

## 3. Nộp hàng qua Google Drive

Thư mục chia sẻ **"Muse Workspace"**:

- `01_Inbox/` — nơi để phiếu/tài liệu tham chiếu (đọc, không ghi).
- `02_Dang-lam/` — thư mục làm việc tạm, Muse có thể để file nháp.
- `03_Hoan-thanh/<Mã phiếu>/<Mã ô>.png` — **nơi nộp hàng chính thức**. Tên file = đúng mã ô (vd. `nhi.expr.08.png`), đặt trong thư mục con đặt theo mã phiếu.

VPS kéo thư mục `03_Hoan-thanh` về mỗi **5 phút**, đối chiếu với sổ phiếu và cập nhật cột `Link file Drive`, `Trạng thái` sang `Chờ kiểm`.

**Ví dụ trọn một lượt** (dòng Sheet → file → trạng thái):
1. Hàng `MR-063 | Nhi | nhi.expr.08 | Cười lăn, nước mắt vui | Rolling laugh, happy tears | ... | Trạng thái: Mới`.
2. Muse đổi `Trạng thái: Đang làm`, `Người làm: Muse`.
3. Muse tạo ảnh đúng chuẩn khung (2048×2048, nền `#00B140`, không đệm — xem §5), lưu vào `03_Hoan-thanh/MR-063/nhi.expr.08.png`.
4. Muse đổi `Trạng thái: Chờ kiểm`.
5. VPS kéo về trong vòng 5 phút, điền `Link file Drive`, ghi `Cập nhật lúc`.
6. Gen kiểm máy (kích thước, màu nền, khoá khung) → đạt thì để Ryan duyệt; Ryan đổi `Trạng thái: Đạt` (chỉ Ryan làm bước này). Tiêu chí máy trượt → Gen tự trả `Làm lại` (ghi lý do ở `Ghi chú kiểm`), **tối đa 2 lần** trước khi báo Ryan can thiệp.

## 4. Nộp qua MCP

**Hiện có** — `upload_asset` (scope `compose`) tại `https://asset.genos.top/mcp`:
- Nhận `kind`, `mime` (`image/svg+xml`, `image/png`, `image/jpeg`, `image/webp` — kiểm magic bytes, không chỉ đuôi file), và `data_base64` hoặc `text` (SVG).
- Lưu asset, trả `display_id`, `bytes`, cờ `deduped` nếu trùng nội dung, và `rights` — ảnh raster (PNG/JPEG/WebP) do agent tải lên bị đánh dấu `rights: pending`, **chờ chủ xưởng (Ryan) xác nhận quyền** trước khi được dùng trong bản dựng thật. SVG không bị giữ.
- `get_asset` (scope `read`) xem lại thông tin asset đã lưu, kèm `data_base64` nếu file ≤ 256 KB.
- Kết nối: OAuth 2.1 + PKCE tự động qua dynamic client registration (`/.well-known/oauth-authorization-server`), hoặc token tĩnh: `genstudio token create "Muse" --scopes compose`.
- MCP hiện **không biết gì về phiếu/Sheet** — chỉ là kho asset thô. Không dùng để báo trạng thái phiếu.

**Đã có (gói B, 0.3.0)** — bộ tool theo ô Bộ Neo, scope `assets.submit` (Muse) / `assets.review` (Gen):

- Lấy token: `genstudio token create "Muse" --scopes assets.submit --expires 30d` (nên luôn đặt `--expires`; không khai thì không hết hạn). Chủ xưởng thu hồi bằng `genstudio token revoke <id>` (id in ra lúc tạo), xem danh sách bằng `genstudio token list`.
- `kit_list({state, group, page, page_size})` — danh sách ô theo trạng thái (`free | claimed | submitted | rework | certified`) và nhóm (`group`, mã `NB-01..NB-10` — dùng tạm thay "phiếu", xem ghi chú ở cuối mục này).
- `kit_claim({kit_slot})` — nhận một ô (⇒ "Đang làm"), khoá cho riêng agent 2 giờ.
- `kit_get_input({kit_slot})` — chuẩn/spec của ô, ảnh tham chiếu đã chứng nhận (nếu có), và nếu ô đang "Làm lại": lý do + tiêu chí trượt của lần nộp gần nhất.
- `kit_submit({kit_slot, declared_mime, data_base64 | text | upload_session, previous})` — nộp nội dung ≤ 256 KB qua `data_base64`/`text`; tệp lớn hơn (tới 50 MB) dùng `kit_upload_chunk` trước rồi truyền `upload_session`. Máy kiểm chạy ngay; trả về `verdict` (`pass|rework|review`) và `state` (`submitted` = Chờ duyệt · `rework` = tự trả làm lại · `blocked_for_ryan` = trượt 3 lần liên tiếp, chờ Ryan quyết). Nộp lại sau khi sửa: truyền `previous` = mã lần nộp trước.
- `kit_upload_chunk({action: start|chunk|finish, session, kit_slot, index, data_base64})` — chunk ≤ 1 MB mỗi lần, `action=start` mở phiên (trả `session`), `action=finish` đóng phiên để dùng `session` làm `upload_session` của `kit_submit`.
- `kit_report_blocked({kit_slot, reason})` — báo không nộp được (thiếu tham chiếu, lỗi đề…), bỏ claim.
- **Giới hạn:** 4 ô/lượt (tối đa 4 claim sống/agent, `GS_KIT_MAX_CLAIMS` — nhận ô thứ 5 bị `conflict`, nộp/`kit_report_blocked` bớt trước), claim 2 giờ (không nộp kịp thì tự rảnh), phiên tải 24 giờ (`kit_upload_chunk` quá hạn tự dọn), 60 lệnh/phút/agent qua `/mcp` (riêng `kit_upload_chunk` 200/phút). `kit_get_input` trả thêm `claim_expires_at` (ô bạn đang giữ) và `claims_left` (còn nhận được bao nhiêu ô mới). Token sai/thiếu: tối đa 30 yêu cầu/phút theo IP (chỉ đếm yêu cầu LỖI — token đúng không bao giờ bị trần này chặn).
- Phía Gen (scope `assets.review`): `kit_review_list` (hàng chờ xét), `kit_propose` (đề xuất approve/rework/reject cho Ryan), `kit_certify` (chứng nhận ngoài hàng chờ — chỉ chủ xưởng trên giao diện thực hiện được, agent gọi sẽ nhận "forbidden").
- MCP giờ thay thế cả vòng Sheet lẫn Drive cho Muse. Quy trình Sheet + Drive ở §2–§3 **vẫn dùng được song song** trong giai đoạn chuyển tiếp (chưa gỡ).
- Quyết định tự chọn: gói B chưa dựng bảng "phiếu" (`asset_requests`) nên `kit_list(group=...)` lọc theo **nhóm ô** (`NB-01..NB-10`, STANDARD-KIT-v1 §2.1), không phải theo một phiếu công việc cụ thể như §2 ở trên — việc gộp phiếu thật vào MCP để gói sau.

## 5. Chuẩn & lỗi thường gặp

Chuẩn đầy đủ: `Second-Brain/01-projects/gen-kit/spec/STANDARD-KIT-v1.md`. Tóm tắt các tiêu chí máy kiểm được (M) hay gặp nhất:

| Tiêu chí | Ngưỡng |
|---|---|
| Kích thước | đúng 2048×2048 (biểu cảm) hoặc 2048×2560 (tư thế toàn thân, nhận diện) — **không đệm** (không dải mép đồng màu khác nền > 4 px) |
| Nền | `#00B140` phẳng; 4 góc 64×64 px lệch trung bình mỗi kênh ≤ 6, độ lệch chuẩn ≤ 3 |
| Lẫn màu nền vào nhân vật | điểm ảnh trong dải chroma bên trong mặt nạ nhân vật ≤ 0,5 % |
| Khoá khung | so với ô `.expr.00`/mẫu gốc: tâm mặt lệch ≤ 20 px, bề rộng mặt lệch ≤ 3 % |
| Âm thanh | LUFS trung bình −16, đỉnh ≤ −1 dBFS |
| Dung lượng | SVG ≤ 2 MB, Lottie ≤ 5 MB |

**Lý do `Làm lại` thường gặp:** sai kích thước khung, nền lệch màu hoặc không phẳng, có viền đệm, mặt/tư thế lệch khỏi khoá khung, đặt sai tên file (không khớp mã ô), đặt sai thư mục (không theo `03_Hoan-thanh/<Mã phiếu>/`).

## 6. Không được làm

- **Không sửa** các hàng đã `Đạt` trong Sheet — kể cả khi thấy lỗi, báo Gen qua `Ghi chú kiểm` hoặc kênh khác, không tự đổi trạng thái.
- **Không tạo lại** ô đã `Bỏ` (đặc biệt các ô có ghi "CO dặn không tạo lại", vd. 9 ô MR-063).
- **Không tự đổi** trạng thái sang `Đạt` — chỉ Ryan làm bước duyệt cuối.
- **Không đẩy GitHub** cho quy trình này (repo Gen-Studio không phải đường nộp của Muse giai đoạn 1; nhánh `muse/assets` thuộc quy trình cũ, chỉ dùng khi Gen yêu cầu rõ).
- **Không** vượt quá 4 ô mỗi lượt nhận việc.
