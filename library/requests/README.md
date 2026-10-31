# Phiếu sản xuất tài nguyên (MR-xxx)

> **Thay thế từ 01/11/2026:** đường nộp hàng chính thức của Muse chuyển sang Google Sheet + Drive — xem [`docs/MUSE-CONNECT.md`](../../docs/MUSE-CONNECT.md). Nội dung dưới đây (quy trình GitHub/PR cũ) được **giữ nguyên** làm tham chiếu tiêu chí và phiếu mẫu, không còn là đường nộp hàng chính.

- Mỗi phiếu là một file `MR-xxx-<tên>.md`, có `status` ghi ở phần đầu file.
- Trạng thái đi theo thứ tự: `todo` → `in-progress` → `review` → `done`. Ngoài ra có `blocked`.
- Muse nhận và làm phiếu theo `library/MUSE.md`. Gen soát phiếu và nhận hàng vào kho.
- Ưu tiên của các nhóm phiếu:
  - **P0 (MR-052..056):** Ryan là MC chính. Nhân vật 3D lấy từ avatar, gồm toàn thân, góc xoay, biểu cảm, khung dựng clip, phòng quay.
  - **P0b (MR-044..051):** Nhi và Vy chuyển sang 3D cùng phong cách.
  - **P2a (MR-057..062):** âm thanh chuyên nghiệp: logo âm thanh, mở/kết, chuyển cảnh, UI, hài/cảm xúc, 6 nhạc nền.
  - **P1 (MR-001..023):** clip 2D cũ, đang `hold`. Sau khi duyệt thiết kế 3D sẽ thay bằng phiếu clip 3D.
  - **P2–P5:** bối cảnh 3D, ảnh bìa, nền động lặp, nhạc.
  - **P9:** việc thường trực, xem `BACKLOG.md`.
- Thêm phiếu mới: chép một phiếu cùng loại, đặt số tiếp theo, rồi sửa nội dung.

## Theo dõi tiến độ Muse
- **Nhanh nhất:** xem các commit `muse:` trên nhánh `muse/assets` tại github.com/colamacbook-ryan/Gen-Studio/commits/muse/assets.
- **Bảng tiến độ:** vào tab Actions → workflow `muse-status` → Job Summary. Bảng chạy mỗi khi Muse push và tự chạy 2 giờ một lần. Nó đếm phiếu theo trạng thái, ghi lần làm việc gần nhất, và cảnh báo khi Muse im lặng quá 6 giờ.
- **Gen tự canh:** Gen theo dõi PR «Muse: lô tài nguyên», kiểm định kỳ và báo Ryan.

## Tự động hoá phối hợp
- Giao thức chi tiết của Muse: `library/MUSE.md` v2 (báo danh, vòng lặp, định dạng nộp, PR, giao dự phòng).
- Muse tự kiểm trước khi nộp: `node library/tools/check-inbox.mjs MR-xxx`.
- CI `muse-inbox-check` chạy trên mỗi PR. Nó chặn khi Muse sửa ngoài phạm vi, `meta.json` sai, file hỏng/sai định dạng hoặc lớn hơn 20 MB.
- Nhịp tim: `library/inbox/_heartbeat.json` cho biết Muse có đang chạy không, có push được không, và lỗi gặp phải.
