# Bắt đầu nhanh — cài Gen-Studio trên máy của bạn

Khoảng 15 phút cho lần đầu. Cần: macOS hoặc Linux, kết nối Internet, một khoá Google Gemini.

## 1. Cài Docker
- **macOS:** tải và mở [Docker Desktop](https://www.docker.com/products/docker-desktop/). Đợi đến khi biểu tượng cá voi báo *running*.
- **Linux:** installer tự cài Docker nếu máy chưa có.

## 2. Tạo token đọc repo (repo đang riêng tư)
1. Mở <https://github.com/settings/personal-access-tokens/new>.
2. *Repository access* chọn **Only select repositories**, rồi chọn **Gen-Studio**.
3. *Permissions › Contents* chọn **Read-only**, sau đó bấm *Generate token* và sao chép token.

Token chỉ dùng trong lúc cài. Installer không in token ra và không ghi token vào file.

## 3. Cài bằng một lệnh
Mở Terminal và dán:
```bash
export GS_GITHUB_TOKEN='dán-token-ở-đây'
curl -fsSL -H "Authorization: Bearer $GS_GITHUB_TOKEN" -H "Accept: application/vnd.github.raw" \
  https://api.github.com/repos/colamacbook-ryan/Gen-Studio/contents/install.sh | bash
```
- Lần đầu mất vài phút để dựng image.
- Cuối cùng installer in ra một **link thiết lập**, chỉ dùng được một lần trong 30 phút. Lỡ hết hạn thì chạy `genstudio open` để lấy link mới.
- Muốn đổi cổng hoặc thư mục: thêm `--port 7600` và/hoặc `--dir ~/xuong` vào cuối lệnh `bash`.

## 4. Thiết lập lần đầu (trên trình duyệt)
1. **Chủ xưởng:** tên, tên đăng nhập, mật khẩu (≥ 12 ký tự).
2. **Giọng đọc:** dán khoá Gemini rồi bấm *Lưu và quét*. Cùng một khoá dùng cho cả giọng đọc lẫn giám khảo phát âm.
3. **Agent:**
   - Trong Terminal chạy `genstudio agent-login` một lần để đăng nhập Claude Code chính chủ vào container agent.
   - Quay lại trình duyệt, bấm **Bật agent nội bộ**. Vài giây sau một thẻ xin quyền hiện ra; bấm **Duyệt**.
4. **Kênh đầu tiên:** đặt tên và giờ ra bài hằng ngày.

## 5. Bài đầu tiên
1. Mở **Lệnh sản xuất**, bấm nút **Lệnh sản xuất** (góc phải), ghi đề bài, rồi bấm *Tạo*.
2. Agent nhận việc, soạn bài, tạo giọng và dựng clip. Clip 1 phút mất khoảng vài phút.
3. Mở **Duyệt** rồi chọn bản dựng để vào **Phòng chiếu**. Xem clip và bảng 8 cổng kiểm, rồi bấm **Quyết định › Duyệt** và **Xuất** (MP4 + phụ đề).

## 6. (Tuỳ chọn) Cho Claude Code trên máy làm việc với xưởng
```bash
claude mcp add --transport http gen-studio http://localhost:7490/mcp
```
Mở Claude Code và gõ `/mcp`, chọn *gen-studio*, rồi *Authenticate*. Trình duyệt sẽ mở trang **Cấp phép**; chọn phạm vi và bấm **Duyệt**.

## Lệnh hay dùng
`genstudio status` · `genstudio logs` · `genstudio open` · `genstudio backup` · `genstudio update` · `genstudio stop`

## Lưu ý
- Gemini gói miễn phí cho khoảng **10 lượt giọng/ngày/model**, đủ để thử. Muốn ra clip đều mỗi ngày cần gói trả phí.
- **Sao lưu:** file backup **không** chứa khoá chính. Hãy cất riêng giá trị `GS_MASTER_KEY` trong `data/.env`, vì khôi phục sang máy mới sẽ cần khoá này.
- Chỉ phiên đăng nhập của bạn mới duyệt được clip hoặc cấp quyền cho agent. Agent không bao giờ tự duyệt được.
