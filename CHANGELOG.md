# Changelog

## 0.1.1 — 2026-10-28 · cài thật bằng Docker
Cài thử đúng bản v0.1.0 bằng `install.sh` + Docker trên máy sạch lộ 7 lỗi mà bộ test không thấy; đã sửa, mỗi lỗi có test:
- Installer chỉ bật `studio`, agent nội bộ không bao giờ chạy → nay dựng + bật cả `agent` (dựng agent hỏng thì studio vẫn chạy, có cảnh báo).
- **Bản dựng đầu tiên của người mới luôn bị chặn:** bước Giọng đọc chỉ tạo nhà cung cấp giọng, thiếu giám khảo; và nhà cung cấp không có model gọi `/models/null` → khoá Gemini lưu cho cả hai vai; model trống chọn theo danh sách ưu tiên đối chiếu kết quả quét.
- Đổi cổng (`--port`) thì mọi trang 403 "Host không được phép"; link thiết lập in sai cổng → Host hợp lệ gồm cổng phía máy chủ (`GS_HOST_PORT`).
- Phông tải từ mạng lúc dựng image (hỏng khi mạng/proxy chặn, không ghim phiên bản) → phông OFL vendor trong repo, ghim commit + checksum.
- `genstudio agent-login` gọi `claude login` (không phải lệnh) → `claude auth login`.
- Quét Gemini lỗi ở bước thiết lập: có Quét lại + Tiếp tục, không tạo nhà cung cấp trùng. Vendor nhà cung cấp chỉ nhận danh sách hỗ trợ.
- Thêm `docs/QUICKSTART.md` (hướng dẫn cài từng bước).

## 0.1.0 — 2026-10-27 · MVP dựng + duyệt
- Vòng trọn: lịch/lệnh sản xuất → agent soạn bài qua MCP → giọng song ngữ (Gemini TTS) → dựng motion graphic Gen-Chibi (Chromium + ffmpeg) → 8 cổng kiểm → chủ xưởng duyệt trong Phòng chiếu → xuất MP4 + SRT.
- Duyệt chỉ có trong phiên đăng nhập của chủ xưởng; agent không có đường duyệt/xoá; mọi ghi qua một cổng `write()` có nhật ký.
- Chạy bền: hàng việc có lease + chạy bù sau khởi động lại, chống treo dựng hình (timeout CDP, hạn tổng), manifest đóng băng.
- Bảo mật: SVG allowlist, kiểm magic bytes, chặn path traversal, sân khấu không ra mạng (CSP + proxy chết), sao lưu không chứa khoá chính.
- Self-host: Docker (studio + agent tách riêng, agent không mount dữ liệu), `install.sh`, CLI `genstudio` — chưa chạy thử trên máy sạch.
- Duyệt quyền MCP cho agent: OAuth 2.1 (metadata, đăng ký client, PKCE S256, refresh xoay vòng, thu hồi khi bị đánh cắp) cho Claude Code/claude.ai và ghép thiết bị cho agent nội bộ (chỉ khi chủ xưởng mở cửa sổ ghép, chỉ trong máy); trang Cấp phép, tab Chờ duyệt, bước Agent mới ở thiết lập; chỉ phiên UI của chủ xưởng duyệt được, chỉ hạ phạm vi. Token tay chuyển vào Nâng cao.
- **Thay đổi phá vỡ:** bỏ `genstudio agent-token <token>` và `GS_AGENT_TOKEN` của runner (runner luôn chạy, tự ghép thiết bị, token ở volume `agent-state`); cấp token tay bằng `genstudio token create`.

## 0.0.0 — 2026-10-27
- Khởi tạo repo: license Gen Labs (thay Apache-2.0 mặc định), CLAUDE.md, README, ASSET_MANIFEST, bộ kiểm repo tối thiểu + CI.
