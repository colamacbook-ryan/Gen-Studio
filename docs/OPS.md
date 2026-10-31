# Runbook vận hành Gen-Studio (GCP)

© 2026 Gen Labs — All rights reserved.

Máy chủ: VM `gen-studio` (project `gen-studio-ryan`, zone `us-west1-b`). Prod: `/opt/gen-studio` (user `genstudio`, cổng 7490,
container `gen-studio-studio-1`/`gen-studio-agent-1`, `gs-caddy` trước mặt). Xưởng/dev: user `gsdev`, `~gsdev/genlabs`, cổng 7491
(cách ly khỏi `genstudio` — xem mục "Cách ly dev/prod"). Script vận hành ở `/opt/gs-deploy/`.

SSH: `timeout 60 gcloud compute ssh gen-studio --zone us-west1-b --project gen-studio-ryan --quiet --command '…'`

## 1. VM chết / không SSH được
1. Console GCP → Compute Engine → kiểm trạng thái VM. `RUNNING` nhưng không SSH được → `gcloud compute instances reset gen-studio --zone us-west1-b`.
2. Không chạy → `gcloud compute instances start gen-studio --zone us-west1-b`. Có snapshot schedule `gs-daily` (giữ 7 ngày) — xấu nhất dựng lại
   ổ từ snapshot gần nhất (Console → Snapshots → Create disk → gắn vào VM mới).
3. Sau khi VM lên lại: `sudo google_metadata_script_runner startup` rồi kiểm `docker compose ps` dưới `/opt/gen-studio`.

## 2. Chứng chỉ HTTPS (Caddy) fail
- `sudo docker logs gs-caddy --tail 50`. Thường do DNS `asset.genos.top` chưa trỏ đúng IP VM, hoặc rate-limit Let's Encrypt (đợi 1h, Caddy tự thử lại).
- Khởi động lại: `sudo docker restart gs-caddy`.
- Đổi tên miền: `sudo GS_HOST_NAME=<domain> bash /opt/gs-deploy/setup-vm.sh` (sinh lại Caddyfile).

## 3. Đĩa đầy
- `df -h /` — ngưỡng cảnh báo tự động 80% (timer `gs-health`, mỗi 15 phút, gửi `alert.sh`).
- Thủ phạm thường gặp: log Docker (đã giới hạn `max-size 10m x 3` từ bản vá này), `data/backups/` tích tụ (chỉ giữ gần nhất, xem
  `backup-offsite.sh`), `/var/log/gs-*.log` (có `logrotate.d/gs-ops`, xoay hằng tuần giữ 8 bản).
- Dọn tay khẩn cấp: `sudo docker system prune -f` (không xoá volume), `sudo journalctl --vacuum-size=200M`.

## 4. Khôi phục dữ liệu
- **Khôi phục thử tự động** (không đụng dữ liệu đang chạy): `restore-test.sh` chạy mỗi Chủ nhật 20:30 UTC — chỉ kiểm tar hợp lệ + SQLite
  `integrity_check`.
- **Diễn tập khôi phục THẬT** (dựng app chạy được, không đụng app đang chạy): `sudo -u genstudio GS_BUCKET=gs://gen-studio-ryan-gs-backup
  GS_HOME=/opt/gen-studio /opt/gs-deploy/restore-drill.sh`. Đã chạy thật 31/10/2026 trên VM:
  - **RTO đo được: ~18 giây** (tải bản sao lưu + dựng container + chờ `/api/health` 200), phần dựng container riêng ~8 giây — với image đã
    có sẵn trong cache Docker của máy. **Lần đầu trên máy mới (chưa có cache build)** sẽ lâu hơn đáng kể (build Chromium/ffmpeg từ đầu,
    ước ~3–5 phút theo kinh nghiệm cài VM lần đầu — chưa đo tách riêng).
  - **RPO: phụ thuộc lịch sao lưu** — `backup-offsite.sh` chạy 1 lần/ngày (19:30 UTC). Worst case mất dữ liệu của **~24 giờ** gần nhất.
    Muốn RPO ngắt hơn: tăng tần suất cron trong `/etc/cron.d/gs-backup`.
- **Khôi phục THẬT vào prod** (ghi đè dữ liệu đang chạy, có hỏi xác nhận):
  ```
  gsutil cp gs://gen-studio-ryan-gs-backup/backups/<tên>.tar.gz /tmp/
  cd /opt/gen-studio && sudo -u genstudio ./cli/genstudio restore /tmp/<tên>.tar.gz
  ```
- Snapshot ổ đĩa (GCP, lịch `gs-daily`, giữ 7 ngày, độc lập với sao lưu ứng dụng — đường lùi khi SQLite hỏng theo cách sao lưu ứng dụng
  không bắt được): Console → Compute Engine → Snapshots.

## 5. Cập nhật / Rollback (`genstudio update` / `genstudio rollback`)
- `cd /opt/gen-studio && sudo -u genstudio ./cli/genstudio update`:
  1. Sao lưu dữ liệu (`do_backup`) 2. Đánh dấu commit hiện tại bằng tag `pre-update-<timestamp>` 3. `git pull --ff-only` 4. `docker compose
     build && up -d` 5. Chờ `/api/health` 200 6. `deploy/gcp/smoke.sh` (health nội bộ 200, `/` qua Caddy 401, `GET /mcp` 405).
  - Bất kỳ bước 4–6 fail ⇒ **tự động gọi `genstudio rollback <tag>`** — `rollback` dùng `git reset --hard <tag>` (không `checkout` rời
    nhánh): đưa HEAD nhánh hiện tại về đúng commit cũ, xoá sạch file mới hơn tag đó, giữ nguyên `data/` (không theo dõi git); vẫn ở trên
    nhánh nên lần `update` kế tiếp `git pull --ff-only` chạy bình thường (không kẹt detached HEAD).
  - `update`/`rollback`/`backup`/`restore` dùng chung khoá (`flock`) — chạy tay lúc cron sao lưu đang chạy sẽ tự đợi tới 120s rồi báo lỗi
    nếu vẫn bận, không chạy chồng.
  - Đã kiểm chạy thật trên VM 31/10/2026 (và kiểm lại sau review GĐ1): `update` đạt toàn bộ (smoke 3/3 ✓), `rollback` về tag cũ đạt (HEAD
    đúng tag, file mới bị xoá, health 200).
  - **Lưu ý:** `data/` KHÔNG tự rollback theo mã nguồn — nếu migration DB đã chạy và cần lùi dữ liệu, dùng bản sao lưu tạo ở bước 1:
    `genstudio restore data/backups/<tên lúc đó>.tar.gz`.
- Rollback tay (không qua update trước đó): `genstudio rollback [tag]` — bỏ trống `tag` thì tự lấy `pre-update-*` mới nhất.

## 6. Thu hồi token Muse / agent ngoài
- Giao diện chủ xưởng → Token → Thu hồi. Hoặc tạo token mới trước rồi thu hồi token cũ: `genstudio token create "tên mới"`.
- Nghi lộ `drive-sa.json` (Muse Drive/Sheet): tạo khoá mới trong GCP Console (IAM → `gs-drive`) → thay `/opt/gs-deploy/drive-sa.json` → xoá
  khoá cũ trên Console. Xem `docs/SECRETS.md`.

## 7. Hết credit GCP
- Credit ước hết: **29/01/2027**. Nhắc trước 2 tuần: **15/01/2027** — kiểm số dư tại Console → Billing → gen-studio-ryan.
- Chi phí định kỳ hiện tại: VM e2-standard-2 + IP tĩnh + ổ 50 GB (~60 USD/tháng theo ước tính lúc tạo) + snapshot 7 ngày (<2 USD/tháng) +
  bucket sao lưu (nhỏ, lifecycle 30 ngày). Uptime check + alert policy nằm trong hạn mức miễn phí Cloud Monitoring.
- Hành động trước khi hết credit: chuyển sang billing thật hoặc tắt VM (`gcloud compute instances stop gen-studio`) để dừng tính phí
  compute (ổ + IP tĩnh vẫn tính phí nhỏ khi dừng — xoá nếu ngừng dùng hẳn).

## 8. Log các timer/cron vận hành
| Việc | Lịch | Log |
|---|---|---|
| `backup-offsite.sh` | 19:30 UTC hằng ngày (cron) | `/var/log/gs-backup.log` |
| `restore-test.sh` | 20:30 UTC Chủ nhật (cron) | `/var/log/gs-backup.log` |
| `gs-health.timer` | mỗi 15 phút | `/var/log/gs-health.log` |
| `gs-drive-sync.timer` | mỗi 5 phút | `/var/log/gs-drive-sync.log` |
| `gs-tickets-sync.timer` | mỗi 10 phút | `/var/log/gs-tickets.log` |
| Cảnh báo hỏng (mọi việc trên) | theo sự kiện | `/var/log/gs-alert.log` + cờ `/var/lib/gs-ops/ALERT` nếu chưa cấu hình Telegram |
| Xem tất cả timer | — | `systemctl list-timers \| grep gs-` |
- Bật cảnh báo Telegram: điền `GS_ALERT_TG_TOKEN`/`GS_ALERT_TG_CHAT` vào `/opt/gs-deploy/alert.env` (root:gs-ops 640, tạo bot qua @BotFather).
- `alert.sh` được gọi bởi cả tiến trình root (gs-health) lẫn không-root (cron/systemd `User=genstudio`: backup-offsite, restore-test,
  drive-sync, tickets-sync) ⇒ quyền đọc `alert.env`/ghi log/cờ dựa vào **group `gs-ops`** (không phải chỉ root): `setup-vm.sh` tự thêm
  `genstudio` + `gsdev` vào nhóm này. Thêm user khác cần gọi alert: `usermod -aG gs-ops <user>`.
- `health-check.sh` có dedup — mỗi loại lỗi (health/đĩa/RAM/container) chỉ gửi Telegram lại sau **6 giờ** kể từ lần báo trước (trạng thái ở
  `/var/lib/gs-ops/last-alert-*`), tránh spam mỗi 15 phút khi lỗi còn treo. Container "Restarting" chỉ báo khi thấy **2 lần kiểm liên
  tiếp** (30 phút) — 1 lần là bình thường lúc `genstudio update` đang dựng lại container.
- Uptime check GCP: `gs-uptime` (5 phút/lần, `https://asset.genos.top/.well-known/oauth-authorization-server`) + chính sách báo động
  `gs-uptime-down` (REDUCE_COUNT_TRUE, ngưỡng "số lần qua < 1", đợi 300s mới báo) nối email tài khoản gcloud hiện tại.
  Kênh email mới tạo có thể ở trạng thái **chưa xác minh** — `gcp-create.sh` tự kiểm và in cảnh báo nếu vậy; nếu thấy cảnh báo đó, Ryan
  vào `console.cloud.google.com/monitoring/alerting/notifications` bấm xác minh email (nếu không, cảnh báo có thể không tới nơi dù policy
  đã đúng).
- Khoá đồng thời: `genstudio backup/update/rollback/restore` dùng `flock` chung một file (`data/.gs-ops.lock`) — cron `backup-offsite.sh`
  (gọi `genstudio backup` bên trong) và thao tác tay không chạy chồng nhau, tránh dừng/khởi động studio đạp lên nhau.
- Bản sao lưu chụp trước khi `update` đặt tên `pre-update-<lúc>.tar.gz` (khác mẫu `gen-studio-*.tar.gz`) ⇒ **không** bị prune nội bộ (giữ
  2 bản mới nhất) của `backup-offsite.sh` xoá theo — vẫn còn đó để `genstudio restore` nếu `rollback` mã xong mà dữ liệu cũng cần lùi. Các
  bản này không tự dọn — dọn tay định kỳ (`rm data/backups/pre-update-*.tar.gz` các bản cũ) nếu đĩa căng.

## 9. Đường hầm MCP shell cấp cứu
- Chỉ `127.0.0.1:7777` trên VM, dùng khi Claude Code hết quota. Token: `sudo cat /opt/gs-deploy/shell-token`.
- Nối từ máy Ryan: `bash deploy/gcp/tunnel-local.sh --install`.
- Trạng thái: `systemctl status gs-shell-mcp` · log: `/var/log/gs-shell-mcp.log`.

## 10. Tailscale
- SSH qua tailnet không mở cổng 22 công khai: `sudo bash /opt/gs-deploy/tailscale.sh` (lần đầu in link đăng nhập).
- Quyền SSH đặt tại admin console Tailscale → Access controls → mục `ssh`.
- Đổi tài khoản/đăng xuất: `sudo tailscale logout` rồi chạy lại script.

## Cách ly dev ↔ prod
- Prod chạy dưới user `genstudio` tại `/opt/gen-studio`; xưởng (Claude Code + dev stack cổng 7491) chạy dưới user riêng **`gsdev`** tại
  `~gsdev/genlabs` — hai user khác uid/gid, `gsdev` không có quyền đọc `data/` prod (`chmod 700`, chủ `genstudio`).
- Bản cài trước bản vá này (xưởng từng chạy chung user `genstudio`) được `setup-vm.sh` tự di chuyển sang `gsdev` một lần, idempotent, giữ
  nguyên dữ liệu dev.
- **Đánh đổi còn lại (chưa khắc phục ở GĐ1):** cả hai user đều ở trong group `docker` ⇒ về lý thuyết `gsdev` có thể chạy container mount
  `/opt/gen-studio/data` nếu cố tình (docker group tương đương root trên host). Mức cách ly hiện tại chặn truy cập **vô tình** (lỗi code,
  tool đọc nhầm thư mục) chứ không chặn **cố ý leo quyền qua docker**. Nâng cấp thật (rootless Docker hoặc VM riêng cho dev) để ở phạm vi
  sau.

## Kiểm nhanh "mọi thứ còn sống"
```
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:7490/api/health   # 200
curl -s -o /dev/null -w '%{http_code}\n' https://asset.genos.top/            # 401 (qua mật khẩu cổng)
curl -s -o /dev/null -w '%{http_code}\n' https://asset.genos.top/.well-known/oauth-authorization-server   # 200
systemctl list-timers | grep gs-
```
Hoặc `bash deploy/gcp/smoke.sh` (chạy trong `/opt/gen-studio`, đọc `.env`).
