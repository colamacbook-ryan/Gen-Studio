# Sổ bí mật Gen-Studio

© 2026 Gen Labs — All rights reserved.

Không chứa giá trị thật. Chỉ ghi: tên · nằm ở đâu · ai/cái gì dùng · hạn · cách xoay.
Quy ước quyền: mọi file bí mật trên VM = `chmod 600`, chủ đúng user dùng nó (không phải root trừ khi ghi chú).

| Tên | Nằm ở đâu | Dùng để | Hạn | Cách xoay |
|---|---|---|---|---|
| `GS_MASTER_KEY` | `data/.env` (dev) / `/opt/gen-studio/data/.env` (prod), chủ `genstudio`, 600. **KHÔNG** nằm trong bản sao lưu `.tar.gz` (backup loại trừ `data/.env`) | Mã hoá khoá nhà cung cấp AI (OpenAI, v.v.) lưu trong SQLite | Không hết hạn — mất là mất luôn khoá nhà cung cấp đã lưu | Không tự xoay (đổi ⇒ toàn bộ khoá nhà cung cấp đã lưu phải nhập lại). Sao lưu riêng vào trình quản lý mật khẩu ngay sau khi cài lần đầu |
| `GS_PAIRING_SECRET` | `.env` ở thư mục cài, chủ instance | Ghép agent nội bộ với studio (biến môi trường container, không phải file mount) | Không hết hạn | `genstudio` tự sinh lại nếu trống; xoá dòng trong `.env` rồi `genstudio start` để sinh mới (agent phải ghép lại) |
| Token tay `gst_…` | Chỉ hiện 1 lần lúc tạo (`genstudio token create`), lưu trong DB (hash) | Agent ngoài gọi MCP qua token cố định | Không hết hạn (tạo bằng tay) | Thu hồi/ tạo lại qua giao diện chủ xưởng → Token, hoặc `genstudio token create` tạo token mới rồi thu hồi token cũ trên UI |
| Mật khẩu cổng Caddy | `/opt/gs-deploy/gate-password` (VM, root, 600) | Basic auth chắn UI/API trước khi tới đăng nhập chủ xưởng | Không hết hạn | `rm /opt/gs-deploy/gate-password && sudo bash /opt/gs-deploy/setup-vm.sh` (sinh mật khẩu mới, Caddy dựng lại hash) |
| Token MCP shell cấp cứu | `/opt/gs-deploy/shell-token` (VM, chủ `genstudio`, 600) | Xác thực cầu MCP shell loopback `127.0.0.1:7777` dùng khi Claude Code hết quota | Không hết hạn | Xoá file, chạy lại `setup-vm.sh` (sinh token mới) rồi `systemctl restart gs-shell-mcp` |
| `drive-sa.json` (khoá tài khoản dịch vụ Google) | `/opt/gs-deploy/drive-sa.json` (VM, chủ `genstudio`, 600) | `drive-sync.sh` (đọc Drive "Muse Workspace") + `tickets-sheet.py` (ghi Google Sheet phiếu Muse) | Theo chính sách tổ chức Google Cloud (mặc định không hết hạn, nhưng nên xoay định kỳ) | Tạo khoá mới trong GCP Console (IAM → tài khoản dịch vụ `gs-drive`) → thay file → xoá khoá cũ trên Console |
| `GS_ALERT_TG_TOKEN` / `GS_ALERT_TG_CHAT` | `/opt/gs-deploy/alert.env` (VM, root, 600) | `alert.sh` gửi cảnh báo qua Telegram khi sao lưu/khôi phục/đồng bộ/health hỏng | Token bot không tự hết hạn | Tạo bot mới qua @BotFather, thay token trong `alert.env`; xoá bot cũ nếu nghi lộ |
| Service account `gs-backup` (gắn vào VM) | Không phải file khoá tĩnh — VM dùng metadata server (ADC), không có JSON khoá để lộ | `backup-offsite.sh`/`restore-test.sh`/`restore-drill.sh` đọc/ghi bucket sao lưu | Không hết hạn (vòng đời VM) | Thu hồi quyền: `gcloud storage buckets remove-iam-policy-binding` role của SA này |
| Token GitHub (đọc/ghi repo) | **Không lưu trên đĩa** — `setup-vm.sh` hỏi tay qua stdin mỗi lần chạy, không ghi vào remote URL/log. User xưởng dùng `gh auth login` (lưu trong keyring của `gsdev`, không phải `genstudio`) | Clone/pull mã nguồn prod + repo xưởng | Theo hạn token cá nhân đặt khi tạo (khuyến nghị 90 ngày) | Thu hồi trên GitHub → Settings → Developer settings → Tokens; tạo token mới, nhập lại khi `setup-vm.sh` hỏi |
| Khoá bí mật trên máy Ryan | `~/.config/gen/secrets/` (ngoài VM, trên máy Ryan) | Kho bí mật nghiên cứu dùng `gen-secret` | Xem tài liệu Second-Brain `02-areas/engineering/secrets.md` | Theo quy trình `gen-secret` (không thuộc phạm vi tài liệu này) |
| Tailscale | Không có khoá tĩnh — đăng nhập OAuth qua trình duyệt (`tailscale.sh`), phiên lưu trong `/var/lib/tailscale` | SSH qua tailnet không mở cổng 22 công khai | Theo phiên đăng nhập tài khoản Tailscale | `tailscale logout` rồi `sudo bash /opt/gs-deploy/tailscale.sh` đăng nhập lại |

## Lịch xoay định kỳ đề xuất (chưa tự động hoá — làm tay theo lịch)
- Token GitHub cá nhân: mỗi 90 ngày (nhắc trong `docs/OPS.md`).
- `drive-sa.json`: mỗi 180 ngày hoặc khi nghi có người ngoài truy cập máy.
- Mật khẩu cổng Caddy: khi có người rời dự án biết mật khẩu, hoặc mỗi 180 ngày.

## Quy tắc chung
- Không bao giờ đưa giá trị bí mật vào commit, log, hay tin nhắn ra ngoài.
- Mọi file bí mật trên VM: chủ đúng user cần dùng, quyền 600, không nằm trong thư mục được Caddy phục vụ công khai.
- Bản sao lưu ứng dụng (`genstudio backup`, `backup-offsite.sh`) **không chứa** `GS_MASTER_KEY` và `.env` — mất ổ không tự động lộ khoá chủ, nhưng cũng nghĩa là khôi phục ở máy khác cần nhập lại khoá chủ hoặc chấp nhận `master_key_mismatch`.
