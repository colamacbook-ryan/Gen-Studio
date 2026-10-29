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
| **Giọng offline (gói L, tuỳ chọn — profile `voice`)** | | | | | |
| VieNeu-TTS v3 Turbo — trọng số ONNX (`onnx_update/` fp32, `onnx_int8/` int8) + README | huggingface.co/pnnbao-ump/VieNeu-TTS-v3-Turbo | commit `61b85e3d937fbbacb387714180e8182823512523`, sha256 từng tệp trong `voice/models.json` | Apache-2.0 (model card: áp cho mọi artifact gồm preset voice; người nói preset đã đồng ý cho tổng hợp giọng, dùng thương mại được). **Rủi ro mở:** dữ liệu huấn luyện ~10k giờ không công bố — không kiểm được nguồn NC; bản VieNeu cũ 0.3B là CC BY-NC (không dùng) | tải lúc chạy vào volume `voice-models` (`genstudio voice pull`), KHÔNG vào repo/image | Dùng (0.2.0) |
| SDK `vieneu` (gồm 25 preset `assets/voices_v3_turbo.json`) | PyPI | 3.8.3 (hash trong `voice/requirements.lock`) | Apache-2.0. Ghi chú: model card ở commit trên mô tả SDK 3.7.1 (23 preset); 2 preset thêm ở 3.8.3 (Adam bựa, Thiền Tâm Đức) chưa có câu xác nhận đồng ý riêng ⇒ **ẩn** (`CONSENTED_PRESETS` trong `voice/server.py`, so cả aliases: Hải Đăng = Minh Quân, Thiện Minh = Anh Khôi, Quốc Tuấn = Mạnh Dũng); mở 23 giọng | image `voice` | Dùng — chỉ preset, **không** mở clone giọng (điều khoản cấm giả mạo) |
| MOSS-Audio-Tokenizer-Nano (ONNX, codec giải mã) + README | huggingface.co/OpenMOSS-Team/MOSS-Audio-Tokenizer-Nano-ONNX | commit `ceff0d0749bfb3fa2d61149794ec6feef0d1e1ae` (chỉ tệp decode) | Apache-2.0 | volume `voice-models` | Dùng |
| sea-g2p (phonemizer tiếng Việt, cùng tác giả VieNeu; không dùng espeak/GPL) | PyPI | 0.10.0 | Apache-2.0 | image `voice` | Dùng |
| faster-whisper (giám khảo nghe-chép) | PyPI (SYSTRAN) | 1.2.1 | MIT | image `voice` | Dùng |
| CTranslate2 | PyPI (OpenNMT) | 4.8.4 | MIT | image `voice` | Dùng |
| Trọng số Whisper `small` (bản CTranslate2) + README | huggingface.co/Systran/faster-whisper-small | commit `536b0662742c02347bc0e980a01041f333bce120` | MIT (OpenAI Whisper) | volume `voice-models` | Dùng (mặc định) |
| Trọng số Whisper `medium` (tuỳ chọn `GS_VOICE_JUDGE=medium`) | huggingface.co/Systran/faster-whisper-medium | commit `08e178d48790749d25932bbc082711ddcfdfbc4f` | MIT | volume `voice-models` | Tuỳ chọn |
| onnxruntime | PyPI (Microsoft) | **1.23.2** (ghim: 1.31 chặn external data qua symlink) | MIT | image `voice` | Dùng |
| numpy, tokenizers, huggingface_hub (+httpx2/httpcore2/h11/anyio/idna/hf-xet/filelock/fsspec/packaging/PyYAML/tqdm/truststore/typing_extensions/click), cffi, pycparser | PyPI | đúng phiên bản + hash trong `voice/requirements.lock` | BSD-3 / Apache-2.0 / MIT / MPL-2.0 (tqdm) / PSF (typing_extensions) | image `voice` | Dùng |
| soundfile (kèm libsndfile), soxr (python-soxr + libsoxr) | PyPI | 0.14.0 · 1.1.0 | BSD-3 (soundfile) + **LGPL-2.1+** (libsndfile, libsoxr) — thư viện động trong wheel, không sửa | image `voice` | Dùng — giữ thông báo LGPL khi phân phối image |
| PyAV `av` (faster-whisper import lúc nạp; sidecar KHÔNG dùng để giải âm thanh — L-101) | PyPI | 19.0.2 | BSD-3 + FFmpeg kèm wheel (LGPL) | image `voice` | Dùng — rà license FFmpeg kèm wheel trước phân phối image công khai |
| python:3.13-slim-bookworm (image base) | Docker Hub official image | 3.13 · bookworm | PSF-2.0 + license các gói Debian | `Dockerfile.voice` | Dùng |

## Ảnh chụp giao diện & nhạc của xưởng (chính sách 0.2.0, SPEC-0.2.0 §6.10)

- Đây là **dữ liệu người dùng** trong `data/`, **không bao giờ** vào repo hay gói phát hành.
- Quyền dùng do **owner xác nhận từng tệp** (bảng `asset_rights`, chỉ thêm hàng; xác nhận hoặc thu hồi đều ghi Nhật ký). Mọi asset raster (PNG/JPEG/WebP/GIF) và audio do agent tải lên cần xác nhận này trước khi vào **bất kỳ** bản dựng nào; asset do owner tải lên qua phiên UI có cơ sở `owner_upload` (vẫn phải tick "đã che thông tin cá nhân" với ảnh raster). SVG do agent vẽ (qua lọc allowlist) và asset hệ thống không cần xác nhận. Luật chỉ áp cho asset tạo sau migration 0003; asset cũ giữ hành vi 0.1.x.
- Ưu tiên dựng lại giao diện bằng DSL giả lập hoặc SVG; không chép logo, biểu tượng thương hiệu hay ảnh minh hoạ của bên thứ ba. Tên sản phẩm chỉ ghi dạng chữ để nói về đúng sản phẩm đó. [CHƯA VERIFY pháp lý — cần tư vấn trước khi bán.]
- Repo chỉ chứa asset do Gen Labs làm: con trỏ (SVG nội tuyến), theme DSL, mẫu ảnh bìa.
