#!/usr/bin/env bash
# Gửi cảnh báo khi một việc vận hành hỏng (sao lưu, khôi phục thử, đồng bộ Drive, health...). © 2026 Gen Labs — All rights reserved.
# Dùng: deploy/gcp/alert.sh "<thông điệp>"
# Có /opt/gs-deploy/alert.env (600, GS_ALERT_TG_TOKEN + GS_ALERT_TG_CHAT) ⇒ gửi Telegram.
# Không có ⇒ ghi /var/log/gs-alert.log + tạo cờ /opt/gs-deploy/ALERT (người vận hành kiểm tay thấy ngay có cờ là biết đang có lỗi).
# Không bao giờ thoát ≠ 0 — gọi bằng `|| alert.sh "..."` thì không được làm hỏng luồng gọi.
set -uo pipefail
MSG="${1:-(không có thông điệp)}"
ENVFILE="/opt/gs-deploy/alert.env"
LOG="/var/log/gs-alert.log"
FLAG="/opt/gs-deploy/ALERT"
TS="$(date -Is)"

echo "$TS $MSG" >> "$LOG" 2>/dev/null || true

if [ -r "$ENVFILE" ]; then
  # shellcheck disable=SC1090
  . "$ENVFILE"
fi

if [ -n "${GS_ALERT_TG_TOKEN:-}" ] && [ -n "${GS_ALERT_TG_CHAT:-}" ]; then
  HOST="$(hostname 2>/dev/null || echo gen-studio)"
  TEXT="⚠ Gen-Studio ($HOST): $MSG"
  if curl -fsS --max-time 10 -X POST "https://api.telegram.org/bot${GS_ALERT_TG_TOKEN}/sendMessage" \
    --data-urlencode "chat_id=${GS_ALERT_TG_CHAT}" \
    --data-urlencode "text=${TEXT}" >/dev/null 2>&1; then
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
