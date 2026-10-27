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
- Agent giả để thử trọn vòng (không Docker): ở **Kết nối › Agent & MCP › Nâng cao** bấm **Ghép CLI**, rồi chạy
  `GS_MCP_URL=http://127.0.0.1:7490/mcp GS_AGENT_STATE=./data/agent-state GS_FAKE_AGENT=1 node agent/runner.js`;
  runner in một mã ghép, bạn gõ mã đó ở trang **Ghép thiết bị** (`#/pair`) và bấm Duyệt. Runner lưu token ở `GS_AGENT_STATE/token.json` và tự refresh.

## Cài đặt (self-host, Docker)

```bash
curl -fsSL https://raw.githubusercontent.com/colamacbook-ryan/Gen-Studio/main/install.sh | bash
```
Installer không hỏi gì, in ra link thiết lập lần đầu (dùng trong 30 phút). Lệnh nhanh: `genstudio start|stop|status|logs|update|backup|restore|uninstall|mcp|password|lang|open|token|agent-login`.

## Kết nối agent
Mọi agent **xin quyền và chờ bạn bấm Duyệt** trên giao diện trước khi gọi được MCP; agent không bao giờ tự cấp quyền cho mình (chỉ phiên đăng nhập của chủ xưởng duyệt được; chỉ được **hạ** phạm vi `read|compose|run`, không nâng).

- **Claude Code trên máy** (đường chính): `claude mcp add --transport http gen-studio http://localhost:7490/mcp`. Claude Code tự mở trình duyệt vào trang **Cấp phép** (OAuth 2.1 + PKCE); bạn Duyệt là xong. Token truy cập sống 1 giờ và tự làm mới.
- **claude.ai Connectors / Claude Code cloud**: cần địa chỉ **HTTPS** (tunnel hoặc tên miền riêng; đặt `GS_PUBLIC_URL`), rồi thêm `https://…/mcp` vào Connectors. Cùng trang Cấp phép; vì yêu cầu đến từ ngoài máy, trang luôn hỏi "bạn vừa tự bấm kết nối?". Ghép bằng mã **không** phục vụ qua địa chỉ công khai.
- **Agent nội bộ** chạy trong container `agent` riêng (luôn chạy): **không** mount dữ liệu, **không** có secret của studio, chỉ nói chuyện với `/mcp` và `/oauth/*`. Đăng nhập Claude Code chính chủ một lần trên máy chủ: `genstudio agent-login`. Rồi ở bước **Agent** của thiết lập (hoặc **Agent & MCP › Chờ duyệt**) bấm **Bật agent nội bộ**: runner xin quyền (ghép thiết bị), bạn Duyệt, token nằm trong volume riêng của agent (`/agent-state`, không ghi vào `.env`). Ở **Agent & MCP** (tab Agent) có thẻ **Agent nội bộ** hiện trạng thái runner: **Tắt agent nội bộ** thu hồi quyền (runner không tự xin lại), **Bật agent nội bộ** mở lại cửa sổ ghép 10 phút (một cú Duyệt thì cửa sổ đóng). Tổng quan nhắc khi agent nội bộ đang tắt.
- **Đứng sau proxy/tunnel ("Đưa lên mạng")**: đặt `GS_TRUST_PROXY=1` để hạn tần suất theo nguồn dùng `cf-connecting-ip` (hoặc bước nhảy phải nhất của `X-Forwarded-For`). Mặc định **không** tin các header này (nguồn là địa chỉ socket), vì client tự đặt được; chỉ bật khi proxy của chính bạn luôn ghi đè chúng. Ở **Chờ duyệt**, nút **Từ chối tất cả yêu cầu ngoài** dọn ngay một đợt yêu cầu rác.
- **Nâng cao**: token tay không hết hạn — **Agent & MCP › Nâng cao** hoặc `genstudio token create "Tên" --scopes read,compose`; cầu stdio `claude mcp add gen-studio -- genstudio mcp --token <token>`; ghép CLI bằng mã thiết bị (bạn **tự gõ** mã CLI in ra ở `#/pair`).

> **Thay đổi phá vỡ so với bản nháp trước:** lệnh `genstudio agent-token <token>` (ghi token vào `.env`) đã bị bỏ; runner không đọc `GS_AGENT_TOKEN`. Cấp token tay dùng `genstudio token create`.

> Repo đang private: installer cần `GS_GITHUB_TOKEN` để tải bản phát hành. Image Docker và installer **chưa được chạy thử trên máy sạch** — xem mục Giới hạn.

## Kiểm thử
```bash
bash tools/test.sh          # kiểm repo + node --test test/*.test.js (gồm e2e trọn vòng với Chromium + ffmpeg thật)
```

## Giới hạn đã biết của MVP
- Chưa chạy thử `install.sh` / image Docker trên máy sạch; chưa thử `claude mcp add --transport http` bằng Claude Code thật và claude.ai Connectors qua tunnel (giao thức đã có test cấp HTTP).
- Đăng nhập Claude Code của agent nội bộ vẫn làm trên máy chủ (`genstudio agent-login`); giao diện chưa chuyển tiếp được bước này.
- Gemini TTS gói miễn phí ~10 lượt/ngày/model; ra clip hằng ngày cần gói trả phí.
- Render ~11 khung/giây ở 1080p30 (clip 45 s ≈ 2 phút).
- Chưa có màn tạo nhân vật trên giao diện: agent tạo nhân vật qua MCP (`save_cast_member`); agent giả tự tạo 2 nhân vật mẫu khi kênh chưa có.
- Mốc từng từ lấy từ giám khảo Gemini; khi không có thì ước theo ký tự (lệch ~±0,3 s).

## Tài liệu
Kiến trúc và hợp đồng giữa các gói: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). Ý đồ, spec, thiết kế, database: Second-Brain `01-projects/xuong-video/` — tóm tắt ở [`docs/README.md`](docs/README.md).

© 2026 Gen Labs — All rights reserved.
