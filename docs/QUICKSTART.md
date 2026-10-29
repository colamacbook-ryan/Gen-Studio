# Bắt đầu nhanh — cài Gen-Studio trên máy của bạn

Khoảng 15 phút cho lần đầu. Cần: macOS hoặc Linux, kết nối Internet, và **một trong hai**: khoá Google Gemini, hoặc giọng offline trên máy (không cần khoá, tải ~1 GB model — mục 7).

Đã cài bản 0.1.x? Xem mục **8. Nâng cấp**.

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
- **Chưa có khoá Gemini?** Thêm `--voice-offline` vào cuối lệnh `bash` để cài **giọng offline trên máy** (xem mục 7).

## 4. Thiết lập lần đầu (trên trình duyệt)
1. **Chủ xưởng:** tên, tên đăng nhập, mật khẩu (≥ 12 ký tự).
2. **Giọng đọc:** chọn một trong hai:
   - **Gemini (cần khoá):** dán khoá Gemini rồi bấm *Lưu và quét*. Cùng một khoá dùng cho cả giọng đọc lẫn giám khảo phát âm.
   - **Giọng offline trên máy (không cần khoá):** bấm *Bật giọng offline*. Màn hình báo *sẵn sàng* khi model đã tải; nếu báo *chưa tải model* thì chạy lệnh nó hiện (`genstudio voice pull`) rồi bấm *Quét lại*.
3. **Agent:**
   - Trong Terminal chạy `genstudio agent-login` một lần để đăng nhập Claude Code chính chủ vào container agent.
   - Quay lại trình duyệt, bấm **Bật agent nội bộ**. Vài giây sau một thẻ xin quyền hiện ra; bấm **Duyệt**.
4. **Kênh đầu tiên:** đặt tên và giờ ra bài hằng ngày.

## 5. Bài đầu tiên
1. Mở **Lệnh sản xuất**, bấm nút **Lệnh sản xuất** (góc phải), ghi đề bài.
2. Chọn **tỉ lệ khung**:
   - **Theo kênh** (mặc định 16:9): video ngang cho YouTube.
   - **16:9**: video ngang 1920×1080.
   - **9:16**: clip dọc 1080×1920 cho TikTok, Reels, Shorts. Chữ và nhân vật tự dồn vào vùng an toàn; cổng **G-SAFE** chặn bản dựng nếu chữ nằm dưới thanh nút của nền tảng.

   Bấm *Tạo*. Muốn cả kênh mặc định dọc: **Kênh › chọn kênh › tab Định dạng › Tỉ lệ mặc định**.
3. Agent nhận việc, soạn bài, tạo giọng và dựng clip. Clip 1 phút mất khoảng vài phút (giọng offline chậm hơn Gemini một chút).
4. Mở **Duyệt** rồi chọn bản dựng để vào **Phòng chiếu**. Xem clip, bảng cổng kiểm (8 cổng; bài có ảnh bìa thêm G-THUMB, clip dọc thêm G-SAFE), rồi bấm **Quyết định › Duyệt** và **Xuất**. Gói xuất gồm MP4 + phụ đề + ảnh bìa; clip dọc có tên `RD-….9x16.mp4`.
5. Kênh tạo mới ở 0.2.0 **bắt buộc có ảnh bìa** (agent tự làm 3 phương án; bạn chọn trong Phòng chiếu). Kênh cũ từ 0.1.x không bị đòi.

## 6. (Tuỳ chọn) Cho Claude Code trên máy làm việc với xưởng
```bash
claude mcp add --transport http gen-studio http://localhost:7490/mcp
```
Mở Claude Code và gõ `/mcp`, chọn *gen-studio*, rồi *Authenticate*. Trình duyệt sẽ mở trang **Cấp phép**; chọn phạm vi và bấm **Duyệt**.

## 7. (Tuỳ chọn) Giọng offline trên máy — không cần khoá
Giọng **VieNeu-TTS** đọc tiếng Việt (23 giọng có xác nhận đồng ý của người nói) và giám khảo **faster-whisper** nghe-chép để chấm cổng — chạy hoàn toàn trên máy bạn, không gửi dữ liệu ra ngoài.
- Bật: `genstudio voice pull` (hoặc cài với `--voice-offline`). Lần đầu tải khoảng **1 GB** model từ huggingface.co (mỗi tệp được kiểm sha256; sai là từ chối).
- Kiểm: `genstudio voice status` → `● ready … 23 giọng`.
- Cần khoảng **2 GB RAM** trống và 4 nhân CPU; mỗi câu sinh chậm hơn Gemini một chút (xem ARCHITECTURE §13).
- Tuỳ chọn trong `.env`: `GS_VOICE_PRECISION=int8` (máy yếu, nhanh hơn ~40 %, chất lượng thấp hơn chút), `GS_VOICE_JUDGE=medium` (giám khảo chính xác hơn, chậm gấp đôi), rồi chạy lại `genstudio voice pull`.
- Có cả Gemini lẫn offline: xưởng dùng nhà cung cấp **đang bật** có ID nhỏ nhất cho từng việc (giọng / giám khảo). Muốn đổi: màn **Nhà cung cấp** → chọn hàng → *Tắt nhà cung cấp này*. Trộn được, ví dụ giọng offline + giám khảo Gemini.
- Giới hạn: giám khảo offline chấm phát âm thuật ngữ tiếng Anh bằng cách nghe-chép (thấy đúng chữ tiếng Anh ⇒ đạt), chặt hơn Gemini; câu rất ngắn (vd «À, ra vậy!») dễ bị nghe sai và phải tạo lại. Mac (Apple Silicon) chưa được kiểm.

## 8. Nâng cấp từ 0.1.x
1. (Khuyên làm) `genstudio backup` — file nằm ở `data/backups/`. Cất riêng `GS_MASTER_KEY` trong `data/.env`.
2. Chạy lại **đúng lệnh cài ở mục 3** (cùng `--dir`/`--port` nếu lúc đầu có dùng). Installer tải bản mới, **giữ nguyên** `data/` và `.env`, dựng lại image rồi khởi động lại. (`genstudio update` chỉ dùng cho bản cài bằng `git clone`; bản cài từ Release nó sẽ nhắc bạn chạy lại installer.)
3. Lần khởi động đầu, xưởng tự **sao lưu cơ sở dữ liệu** vào `data/backups/pre-migrate-<thời điểm>.db` rồi mới nâng cấp lược đồ. Bài, bản dựng, gói xuất cũ giữ nguyên; bài cũ là 16:9 và không bị đòi ảnh bìa.
4. Muốn thêm giọng offline sau khi nâng cấp: `genstudio voice pull`.
5. Có sự cố, muốn quay về 0.1.1 (đừng cài đè bản cũ lên thư mục đang dùng — tệp migration mới còn sót sẽ nâng cấp lại dữ liệu):
   1. `genstudio stop`, rồi đổi tên thư mục cài, ví dụ `mv ~/gen-studio ~/gen-studio-0.2.0`.
   2. Cài bản cũ vào thư mục trống: lệnh cài ở mục 3 kèm `--version v0.1.1`. Xong thì `genstudio stop`.
   3. Chép `~/gen-studio-0.2.0/data/` đè lên `~/gen-studio/data/` (giữ `data/.env` để có khoá chính), xoá `data/studio.db-wal`, `data/studio.db-shm`, rồi chép `data/backups/pre-migrate-….db` thành `data/studio.db`.
   4. `genstudio start`. Mọi thứ làm sau khi nâng cấp sẽ mất.

## Lệnh hay dùng
`genstudio status` · `genstudio logs` · `genstudio open` · `genstudio backup` · `genstudio update` · `genstudio stop` · `genstudio voice status|pull`

## Lưu ý
- Gemini gói miễn phí cho khoảng **10 lượt giọng/ngày/model**, đủ để thử. Muốn ra clip đều mỗi ngày cần gói trả phí.
- **Sao lưu:** file backup **không** chứa khoá chính. Hãy cất riêng giá trị `GS_MASTER_KEY` trong `data/.env`, vì khôi phục sang máy mới sẽ cần khoá này.
- Chỉ phiên đăng nhập của bạn mới duyệt được clip hoặc cấp quyền cho agent. Agent không bao giờ tự duyệt được.
