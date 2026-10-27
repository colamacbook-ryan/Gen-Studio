# ASSET_MANIFEST — thư viện, asset và dịch vụ bên ngoài

Mọi thứ không do Gen-Studio tự viết phải có một dòng ở đây trước khi vào repo hoặc image.

| Thành phần | Nguồn | Phiên bản | License | Dùng ở | Trạng thái |
|---|---|---|---|---|---|
| Engine Gen-Chibi (core, choreo, kinds, sounds, audio) | colamacbook-ryan/Gen-Chibi | 0.25.1 (khoá khi vendor) | © 2026 Gen Labs — All rights reserved (cùng chủ sở hữu) | `vendor/gen-chibi/` | Dự kiến (chưa vendor) |
| Chromium | chromium.org | theo image | BSD-3-Clause | image Docker (renderer) | Dự kiến |
| FFmpeg | ffmpeg.org | theo image | LGPL-2.1+ (build không bật GPL) | image Docker (trộn, mã hoá) | Dự kiến — kiểm build |
| Be Vietnam Pro, Patrick Hand | Google Fonts | — | SIL OFL 1.1 | trang sân khấu, UI | Dự kiến |
| Google Gemini API (TTS, chép lời) | Google | quét lúc chạy (STD-10) | Điều khoản Gemini API | provider giọng/giám khảo | Dịch vụ, không phân phối |
