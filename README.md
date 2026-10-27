# Gen-Studio

**Xưởng sản xuất video có quản lý quy trình, tự cài trên máy của bạn.** Agent AI kết nối qua **MCP** để soạn bài học; Gen-Studio tạo giọng, dựng clip motion graphic và chạy cổng kiểm. Chủ xưởng chỉ mở một giao diện để xem, lần vết và **duyệt**.

- **Agent làm, người duyệt** — mọi bước có tool MCP; quyết định Duyệt chỉ có trong phiên đăng nhập của chủ xưởng (agent gọi là bị từ chối).
- **Mỗi bài là dữ liệu** — clip dựng từ 9 khối hình có tham số + nhân vật Gen-Chibi; máy quay tự sinh; không viết code riêng cho từng bài.
- **Chuyển động liền mạch theo lời nói** — mốc hình neo vào từng từ được đọc; không cắt cảnh cứng.
- **8 cổng kiểm tự động** — giọng (định dạng WAV, khớp kịch bản, phát âm thuật ngữ ngoại ngữ), độ to, đồng bộ, chuyển động, đủ khung, đóng gói MP4. Không đo được = không qua.
- **Lần vết** — mỗi bản dựng lưu manifest bất biến: câu → clip giọng → nhân vật → khối hình → model → agent → lệnh sản xuất.

> Trạng thái: **MVP 0.1.0** (dựng + duyệt). Đăng lên nền tảng và số liệu kênh thuộc giai đoạn 2.

## Chạy thử nhanh (máy dev, không cần Docker)

Yêu cầu: Node 22 LTS, ffmpeg, Chromium (đặt `GS_CHROMIUM_PATH` nếu không có lệnh `chromium` trong PATH).

```bash
DATA_DIR=./data GS_SEED_DEMO=1 GS_DEMO_PASSWORD='mat-khau-cua-ban' GS_FAKE_PROVIDERS=1 node server/main.js
# mở http://localhost:7490 → đăng nhập ryan / mat-khau-cua-ban
```
- `GS_SEED_DEMO=1` nạp kênh mẫu "Lớp AI Bình Dân", 2 nhân vật, giáo trình, vài bài và bản dựng mẫu.
- `GS_FAKE_PROVIDERS=1` dùng giọng/giám khảo giả (không gọi mạng). Bỏ biến này và dán khoá Gemini ở **Kết nối › Nhà cung cấp** để dùng giọng thật.
- Agent giả để thử trọn vòng: tạo token ở **Kết nối › Agent & MCP**, rồi
  `GS_MCP_URL=http://127.0.0.1:7490/mcp GS_AGENT_TOKEN=<token> GS_FAKE_AGENT=1 node agent/runner.js`.

## Cài đặt (self-host, Docker)

```bash
curl -fsSL https://raw.githubusercontent.com/colamacbook-ryan/Gen-Studio/main/install.sh | bash
```
Installer không hỏi gì, in ra link thiết lập lần đầu (dùng trong 30 phút). Lệnh nhanh: `genstudio start|stop|status|logs|update|backup|restore|uninstall|mcp|password|lang|open|agent-token|agent-login`.

- **Agent nội bộ** chạy trong container `agent` riêng: **không** mount dữ liệu, **không** có secret, chỉ nói chuyện với `/mcp`. Đăng nhập Claude Code chính chủ một lần: `genstudio agent-login`; bật bằng token: `genstudio agent-token <token>`.
- **Agent ngoài** trên cùng máy: `claude mcp add gen-studio -- genstudio mcp --token <token>`.

> Repo đang private: installer cần `GS_GITHUB_TOKEN` để tải bản phát hành. Image Docker và installer **chưa được chạy thử trên máy sạch** — xem mục Giới hạn.

## Kiểm thử
```bash
bash tools/test.sh          # kiểm repo + node --test test/*.test.js (gồm e2e trọn vòng với Chromium + ffmpeg thật)
```

## Giới hạn đã biết của MVP
- Chưa chạy thử `install.sh` / image Docker trên máy sạch; chưa có OAuth 2.1 cho agent trên cloud ("Đưa lên mạng").
- Gemini TTS gói miễn phí ~10 lượt/ngày/model; ra clip hằng ngày cần gói trả phí.
- Render ~11 khung/giây ở 1080p30 (clip 45 s ≈ 2 phút).
- Chưa có màn tạo nhân vật trên giao diện: agent tạo nhân vật qua MCP (`save_cast_member`); agent giả tự tạo 2 nhân vật mẫu khi kênh chưa có.
- Mốc từng từ lấy từ giám khảo Gemini; khi không có thì ước theo ký tự (lệch ~±0,3 s).

## Tài liệu
Kiến trúc và hợp đồng giữa các gói: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). Ý đồ, spec, thiết kế, database: Second-Brain `01-projects/xuong-video/` — tóm tắt ở [`docs/README.md`](docs/README.md).

© 2026 Gen Labs — All rights reserved.
