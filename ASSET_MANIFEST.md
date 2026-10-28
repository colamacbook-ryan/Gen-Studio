# ASSET_MANIFEST — thư viện, asset và dịch vụ bên ngoài

Mọi thứ không do Gen-Studio tự viết phải có một dòng ở đây trước khi vào repo hoặc image.

| Thành phần | Nguồn | Phiên bản | License | Dùng ở | Trạng thái |
|---|---|---|---|---|---|
| Engine Gen-Chibi (core, choreo, kinds, sounds, audio) | colamacbook-ryan/Gen-Chibi | 0.26.0 (khoá khi vendor) | © 2026 Gen Labs — All rights reserved (cùng chủ sở hữu) | `vendor/gen-chibi/` | Đã vendor 0.26.0 (tools/sync-gen-chibi.sh kiểm phiên bản) |
| Chromium | chromium.org | theo image | BSD-3-Clause | image Docker (renderer) | Dự kiến |
| FFmpeg | ffmpeg.org | theo image | LGPL-2.1+ (build không bật GPL) | image Docker (trộn, mã hoá) | Dự kiến — kiểm build |
| Google Gemini API (TTS, chép lời) | Google | quét lúc chạy (STD-10) | Điều khoản Gemini API | provider giọng/giám khảo | Dịch vụ, không phân phối |
| node:22-bookworm-slim (image base) | Docker Hub official image (Node.js / Debian) | 22 LTS · bookworm | MIT (Node.js) + license các gói Debian | `Dockerfile`, `Dockerfile.agent` | Dùng (gói F) |
| chromium (gói Debian bookworm) | Debian apt | theo image | BSD-3-Clause và các license thành phần | `Dockerfile` (renderer) | Dùng (gói F) |
| ffmpeg (gói Debian bookworm) | Debian apt | theo image | LGPL-2.1+ / GPL tuỳ build Debian — chỉ gọi như tiến trình ngoài, không liên kết; kiểm lại trước khi phân phối image | `Dockerfile` | Dùng (gói F) — cần rà license trước phát hành công khai |
| fonts-noto-core | Debian apt (Google Noto) | theo image | SIL OFL 1.1 | `Dockerfile` | Dùng (gói F) |
| IBM Plex Sans, IBM Plex Mono | google/fonts (`ofl/ibmplexsans`, `ofl/ibmplexmono`) | google/fonts@ddf386ba1b9f (2026-10-28) | SIL OFL 1.1 (kèm `OFL.txt`) | `vendor/fonts/` → image `/usr/share/fonts` và `render/stage/fonts` | Dùng (vendor từ 0.1.1; sha256 trong `vendor/fonts/SHA256SUMS`) |
| Be Vietnam Pro, Patrick Hand | google/fonts (`ofl/bevietnampro`, `ofl/patrickhand`) | google/fonts@ddf386ba1b9f (2026-10-28) | SIL OFL 1.1 (kèm `OFL.txt`) | như trên | Dùng (vendor từ 0.1.1) |
| Claude Code CLI (`@anthropic-ai/claude-code`) | npm (Anthropic) | `latest` lúc build (ARG `CLAUDE_CODE_VERSION`) | Điều khoản thương mại của Anthropic (không phân phối lại; cài lúc build trên máy người dùng) | CHỈ `Dockerfile.agent` (`npm install -g`) | Dùng (gói F) — owner tự đăng nhập chính chủ qua `genstudio agent-login` |

## Ảnh chụp giao diện & nhạc của xưởng (chính sách 0.2.0, SPEC-0.2.0 §6.10)

- Đây là **dữ liệu người dùng** trong `data/`, **không bao giờ** vào repo hay gói phát hành.
- Quyền dùng do **owner xác nhận từng tệp** (bảng `asset_rights`, chỉ thêm hàng; xác nhận hoặc thu hồi đều ghi Nhật ký). Mọi asset raster (PNG/JPEG/WebP/GIF) và audio do agent tải lên cần xác nhận này trước khi vào **bất kỳ** bản dựng nào; asset do owner tải lên qua phiên UI có cơ sở `owner_upload` (vẫn phải tick "đã che thông tin cá nhân" với ảnh raster). SVG do agent vẽ (qua lọc allowlist) và asset hệ thống không cần xác nhận. Luật chỉ áp cho asset tạo sau migration 0003; asset cũ giữ hành vi 0.1.x.
- Ưu tiên dựng lại giao diện bằng DSL giả lập hoặc SVG; không chép logo, biểu tượng thương hiệu hay ảnh minh hoạ của bên thứ ba. Tên sản phẩm chỉ ghi dạng chữ để nói về đúng sản phẩm đó. [CHƯA VERIFY pháp lý — cần tư vấn trước khi bán.]
- Repo chỉ chứa asset do Gen Labs làm: con trỏ (SVG nội tuyến), theme DSL, mẫu ảnh bìa.
