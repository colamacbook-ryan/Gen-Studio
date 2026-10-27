# CLAUDE.md — Gen-Studio

Bộ não (SSOT) của Ryan × Gen nằm ở repo **colamacbook-ryan/Second-Brain**.
Nếu phiên này chưa có Second-Brain: gắn thêm repo đó vào phiên, đọc `CLAUDE.md` + `claude/START-HERE.md` của nó trước khi làm việc.
Ghi nhớ, quyết định, journal luôn viết vào Second-Brain; repo này chỉ chứa code + tài liệu của chính nó.
Hồ sơ dự án: `Second-Brain/01-projects/xuong-video/` (INTENT.md, spec/, audit/, spikes/).

## Quy ước repo
- License: © 2026 Gen Labs — All rights reserved. Không thêm thư viện/asset bên thứ ba khi chưa ghi vào `ASSET_MANIFEST.md` và kiểm license.
- Không phụ thuộc npm ở runtime (Node thuần, trình duyệt thuần). `engine/` không đụng DOM để chạy được cả trong Node (server, MCP) lẫn trang sân khấu.
- Engine Gen-Chibi nằm ở `vendor/gen-chibi/` và **khoá phiên bản** (ghi trong `ASSET_MANIFEST.md`); không sửa tay trong vendor — cập nhật bằng script đồng bộ.
- Mọi ghi dữ liệu đi qua **một cổng** `write()` (UI, HTTP, MCP). Agent không có tool duyệt/xoá (INT-02).
- Chuẩn: self-host-app (STD-06), Data Console (STD-07), Ghim & Soi (STD-08), runtime discovery (STD-10), engineering (STD-11).
- Sản phẩm sẵn sàng bán: chuỗi UI qua i18n vi/en; không hardcode tên owner/kênh (INT-09).
- Media từ API: kiểm magic bytes, giải bằng thư viện định dạng, không tự bọc (bài học L-101).
- Mọi thay đổi chạy `bash tools/test.sh` trước khi đẩy. Phát hành: sửa `VERSION` + `CHANGELOG.md`.
- Bài học L-42: mọi tính năng vẽ/động phải có ngân sách hiệu năng.
- Quy trình STD-05: code sản phẩm chỉ bắt đầu sau khi spec ②, frontend spec ③ và database ⑤ được duyệt; trước đó chỉ có spike.
