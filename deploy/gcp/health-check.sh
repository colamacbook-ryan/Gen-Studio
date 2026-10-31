#!/usr/bin/env bash
# Kiểm sức khoẻ định kỳ (gọi bởi timer systemd gs-health, mỗi 15 phút): health API, đĩa, RAM/swap, container Restarting. © 2026 Gen Labs — All rights reserved.
# Hỏng ⇒ gọi /opt/gs-deploy/alert.sh. Có dedup (6h/lỗi, trạng thái /var/lib/gs-ops) để không spam Telegram mỗi 15 phút.
# Container Restarting chỉ báo khi thấy ≥2 lần liên tiếp (so với lần chạy trước) — tránh báo giả lúc `genstudio update`
# đang dựng lại container (vài giây Restarting là bình thường).
set -uo pipefail
PORT="${GS_PORT:-7490}"
ALERT=/opt/gs-deploy/alert.sh
[ -x "$ALERT" ] || ALERT="$(cd "$(dirname "$0")" && pwd)/alert.sh"
STATE_DIR=/var/lib/gs-ops
mkdir -p "$STATE_DIR" 2>/dev/null || true
DEDUP_SEC=$((6 * 3600))

# alert_once <khoá> <thông điệp> — chỉ gọi alert.sh nếu lần báo gần nhất cho khoá này cách đây > 6h
alert_once() {
  key="$1"; msg="$2"
  f="$STATE_DIR/last-alert-$key"
  now="$(date +%s)"
  last=0
  [ -r "$f" ] && last="$(cat "$f" 2>/dev/null || echo 0)"
  if [ $((now - last)) -ge "$DEDUP_SEC" ]; then
    "$ALERT" "$msg"
    echo "$now" > "$f" 2>/dev/null || true
  fi
}

bad=0

code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "http://127.0.0.1:$PORT/api/health" 2>/dev/null || echo 000)"
if [ "$code" != 200 ]; then
  alert_once health "health check: /api/health → $code (cần 200)"
  bad=1
else
  rm -f "$STATE_DIR/last-alert-health" 2>/dev/null || true
fi

pct="$(df -P / | awk 'NR==2{gsub("%","",$5); print $5}')"
if [ -n "$pct" ] && [ "$pct" -gt 80 ] 2>/dev/null; then
  alert_once disk "health check: ổ đĩa / đầy ${pct}% (ngưỡng 80%)"
  bad=1
fi

# RAM + swap: cảnh báo khi cả hai cùng căng (RAM gần hết VÀ đang phải dùng nhiều swap — dấu hiệu máy sắp OOM)
if command -v free >/dev/null 2>&1; then
  read -r MEM_PCT SWAP_PCT < <(free | awk '
    /^Mem:/ { mt=$2; mu=$3 }
    /^Swap:/ { st=$2; su=$3 }
    END { mp=(mt>0)?int(mu*100/mt):0; sp=(st>0)?int(su*100/st):0; print mp, sp }
  ')
  if [ "${MEM_PCT:-0}" -gt 90 ] 2>/dev/null && [ "${SWAP_PCT:-0}" -gt 50 ] 2>/dev/null; then
    alert_once mem "health check: RAM ${MEM_PCT}% + swap ${SWAP_PCT}% — máy có thể sắp hết bộ nhớ"
    bad=1
  fi
fi

if command -v docker >/dev/null 2>&1; then
  RESTARTING="$(docker ps --filter status=restarting --format '{{.Names}}' 2>/dev/null | sort || true)"
  PREV_FILE="$STATE_DIR/restarting-prev"
  PREV="$(cat "$PREV_FILE" 2>/dev/null || true)"
  if [ -n "$RESTARTING" ]; then
    # chỉ báo tên container xuất hiện ở CẢ lần này lẫn lần trước (liên tiếp ⇒ thật sự kẹt, không phải lúc đang recreate)
    REPEAT="$(comm -12 <(printf '%s\n' "$RESTARTING") <(printf '%s\n' "$PREV") 2>/dev/null || true)"
    if [ -n "$REPEAT" ]; then
      alert_once restarting "health check: container Restarting ≥2 lần liên tiếp: $(printf '%s' "$REPEAT" | tr '\n' ' ')"
      bad=1
    fi
  else
    rm -f "$STATE_DIR/last-alert-restarting" 2>/dev/null || true
  fi
  printf '%s\n' "$RESTARTING" > "$PREV_FILE" 2>/dev/null || true
fi

[ "$bad" = 0 ] && echo "$(date -Is) ✓ health ok (đĩa ${pct:-?}% · RAM ${MEM_PCT:-?}% · swap ${SWAP_PCT:-?}%)"
exit 0
