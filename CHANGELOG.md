# Changelog

## 0.1.0 — 2026-10-27 · MVP dựng + duyệt
- Vòng trọn: lịch/lệnh sản xuất → agent soạn bài qua MCP → giọng song ngữ (Gemini TTS) → dựng motion graphic Gen-Chibi (Chromium + ffmpeg) → 8 cổng kiểm → chủ xưởng duyệt trong Phòng chiếu → xuất MP4 + SRT.
- Duyệt chỉ có trong phiên đăng nhập của chủ xưởng; agent không có đường duyệt/xoá; mọi ghi qua một cổng `write()` có nhật ký.
- Chạy bền: hàng việc có lease + chạy bù sau khởi động lại, chống treo dựng hình (timeout CDP, hạn tổng), manifest đóng băng.
- Bảo mật: SVG allowlist, kiểm magic bytes, chặn path traversal, sân khấu không ra mạng (CSP + proxy chết), sao lưu không chứa khoá chính.
- Self-host: Docker (studio + agent tách riêng, agent không mount dữ liệu), `install.sh`, CLI `genstudio` — chưa chạy thử trên máy sạch.

## 0.0.0 — 2026-10-27
- Khởi tạo repo: license Gen Labs (thay Apache-2.0 mặc định), CLAUDE.md, README, ASSET_MANIFEST, bộ kiểm repo tối thiểu + CI.
