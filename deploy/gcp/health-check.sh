#!/usr/bin/env bash
# Kiểm sức khoẻ định kỳ (gọi bởi timer systemd gs-health, mỗi 15 phút): health API, dung lượng ổ, container Restarting. © 2026 Gen Labs — All rights reserved.
# Hỏng ⇒ gọi /opt/gs-deploy/alert.sh. Không giữ trạng thái — mỗi lần chạy kiểm lại từ đầu (không spam vì alert.sh
# chỉ gửi 1 lần/lỗi tới Telegram; khi chưa cấu hình Telegram, cờ ALERT bị ghi đè mỗi 15 phút nhưng không gây hại).
set -uo pipefail
PORT="${GS_PORT:-7490}"
ALERT=/opt/gs-deploy/alert.sh
[ -x "$ALERT" ] || ALERT="$(cd "$(dirname "$0")" && pwd)/alert.sh"

bad=0

code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "http://127.0.0.1:$PORT/api/health" 2>/dev/null || echo 000)"
if [ "$code" != 200 ]; then
  "$ALERT" "health check: /api/health → $code (cần 200)"
  bad=1
fi

pct="$(df -P / | awk 'NR==2{gsub("%","",$5); print $5}')"
if [ -n "$pct" ] && [ "$pct" -gt 80 ] 2>/dev/null; then
  "$ALERT" "health check: ổ đĩa / đầy ${pct}% (ngưỡng 80%)"
  bad=1
fi

if command -v docker >/dev/null 2>&1; then
  RESTARTING="$(docker ps --filter status=restarting --format '{{.Names}}' 2>/dev/null || true)"
  if [ -n "$RESTARTING" ]; then
    "$ALERT" "health check: container đang Restarting: $RESTARTING"
    bad=1
  fi
fi

[ "$bad" = 0 ] && echo "$(date -Is) ✓ health ok (đĩa ${pct:-?}%)"
exit 0
