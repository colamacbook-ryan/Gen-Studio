# Phiếu sản xuất tài nguyên (MR-xxx)

- Mỗi phiếu là một file `MR-xxx-<tên>.md`, có `status` ghi ở phần đầu file.
- Trạng thái đi theo thứ tự: `todo` → `in-progress` → `review` → `done`. Ngoài ra có `blocked`.
- Muse nhận và làm phiếu theo `library/MUSE.md`. Gen soát phiếu và nhận hàng vào kho.
- Ưu tiên của các nhóm phiếu:
  - **P0 (MR-052..056):** Ryan là MC chính. Nhân vật 3D lấy từ avatar, gồm toàn thân, góc xoay, biểu cảm, khung dựng clip, phòng quay.
  - **P0b (MR-044..051):** Nhi và Vy chuyển sang 3D cùng phong cách.
  - **P1 (MR-001..023):** clip 2D cũ, đang `hold`. Sau khi duyệt thiết kế 3D sẽ thay bằng phiếu clip 3D.
  - **P2–P5:** bối cảnh 3D, ảnh bìa, nền động lặp, nhạc.
  - **P9:** việc thường trực, xem `BACKLOG.md`.
- Thêm phiếu mới: chép một phiếu cùng loại, đặt số tiếp theo, rồi sửa nội dung.

## Theo dõi tiến độ Muse
- **Nhanh nhất:** xem các commit `muse:` trên nhánh `muse/assets` tại github.com/colamacbook-ryan/Gen-Studio/commits/muse/assets.
- **Bảng tiến độ:** vào tab Actions → workflow `muse-status` → Job Summary. Bảng chạy mỗi khi Muse push và tự chạy 2 giờ một lần. Nó đếm phiếu theo trạng thái, ghi lần làm việc gần nhất, và cảnh báo khi Muse im lặng quá 6 giờ.
- **Gen tự canh:** Gen theo dõi PR «Muse: lô tài nguyên», kiểm định kỳ và báo Ryan.
