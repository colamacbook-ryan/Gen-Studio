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

**Sắp có (gói B)** — bộ tool theo phiếu: `list` (xem phiếu khả dụng), `claim` (nhận phiếu), `get_input` (lấy mô tả/prompt/ảnh tham chiếu), `submit` (nộp kết quả), `upload_chunk` (nộp file lớn theo mảnh), `report_blocked` (báo kẹt). Khi có, MCP sẽ thay thế cả vòng Sheet lẫn Drive cho Muse. Cho tới lúc đó, **dùng quy trình Sheet + Drive ở §2–§3**.

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
