#!/usr/bin/env bash
# Gửi cảnh báo khi một việc vận hành hỏng (sao lưu, khôi phục thử, đồng bộ Drive, health...). © 2026 Gen Labs — All rights reserved.
# Dùng: deploy/gcp/alert.sh "<thông điệp>"
# Có /opt/gs-deploy/alert.env (root:gs-ops, 640, GS_ALERT_TG_TOKEN + GS_ALERT_TG_CHAT) ⇒ gửi Telegram.
# Không có/không gửi được ⇒ ghi /var/log/gs-alert.log (660, group gs-ops) + tạo cờ /var/lib/gs-ops/ALERT (dir 775 root:gs-ops)
# để người vận hành (hoặc user không-root trong group gs-ops) thấy ngay có lỗi mà không cần đọc log.
# Caller thường chạy KHÔNG phải root (cron user genstudio, systemd User=genstudio) ⇒ group gs-ops phải được
# setup-vm.sh thêm genstudio + gsdev vào, log/cờ phải ghi được bởi group đó (không chỉ root).
# Không bao giờ thoát ≠ 0 — gọi bằng `|| alert.sh "..."` thì không được làm hỏng luồng gọi.
set -uo pipefail
MSG="${1:-(không có thông điệp)}"
ENVFILE="/opt/gs-deploy/alert.env"
LOG="/var/log/gs-alert.log"
FLAGDIR="/var/lib/gs-ops"
FLAG="$FLAGDIR/ALERT"
TS="$(date -Is)"

mkdir -p "$FLAGDIR" 2>/dev/null || true
echo "$TS $MSG" >> "$LOG" 2>/dev/null || true

TOKEN=""; CHAT=""
if [ -r "$ENVFILE" ]; then
  TOKEN="$(sed -n 's/^GS_ALERT_TG_TOKEN=//p' "$ENVFILE" | head -1)"
  CHAT="$(sed -n 's/^GS_ALERT_TG_CHAT=//p' "$ENVFILE" | head -1)"
fi

if [ -n "$TOKEN" ] && [ -n "$CHAT" ]; then
  HOST="$(hostname 2>/dev/null || echo gen-studio)"
  TEXT="⚠ Gen-Studio ($HOST): $MSG"
  # token KHÔNG qua argv/URL (lộ qua `ps`) — truyền qua --config đọc từ stdin.
  # escape \ và " theo cú pháp file config của curl (nội dung MSG do caller nội bộ đặt, nhưng escape cho chắc).
  esc() { printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'; }
  if printf 'url = "https://api.telegram.org/bot%s/sendMessage"\ndata-urlencode = "chat_id=%s"\ndata-urlencode = "text=%s"\n' \
       "$(esc "$TOKEN")" "$(esc "$CHAT")" "$(esc "$TEXT")" | curl -fsS --max-time 10 -X POST --config - >/dev/null 2>&1; then
    echo "$TS đã gửi Telegram" >> "$LOG" 2>/dev/null || true
  else
    echo "$TS gửi Telegram thất bại" >> "$LOG" 2>/dev/null || true
    echo "$TS $MSG" > "$FLAG" 2>/dev/null || true
  fi
else
  echo "$TS (chưa cấu hình $ENVFILE — chỉ ghi log + cờ)" >> "$LOG" 2>/dev/null || true
  echo "$TS $MSG" > "$FLAG" 2>/dev/null || true
fi

exit 0
