#!/usr/bin/env bash
# Kiểm khói sau khi cập nhật/khôi phục: health nội bộ 200; nếu có Caddy công khai thì / phải 401, /mcp (GET) phải 405. © 2026 Gen Labs — All rights reserved.
# Dùng: deploy/gcp/smoke.sh   (đọc GS_PORT, GS_PUBLIC_URL từ .env ở thư mục hiện tại nếu có; biến môi trường ghi đè)
# Thoát ≠ 0 khi có bước không đạt — gọi từ `genstudio update` để tự rollback.
set -euo pipefail
envget() { sed -n "s/^$1=//p" .env 2>/dev/null | head -1; }
PORT="${GS_PORT:-$(envget GS_PORT)}"; PORT="${PORT:-7490}"
PUBLIC_URL="${GS_PUBLIC_URL:-$(envget GS_PUBLIC_URL)}"

fail=0
echo "== smoke $(date -Is)"

ok=0
for _ in $(seq 1 15); do
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 "http://127.0.0.1:$PORT/api/health" || echo 000)"
  [ "$code" = 200 ] && { ok=1; break; }
  sleep 2
done
if [ "$ok" = 1 ]; then echo "✓ /api/health nội bộ → 200"; else echo "✗ /api/health nội bộ → $code (cần 200)"; fail=1; fi

if [ -n "$PUBLIC_URL" ]; then
  # retry 3 lần (set -e + curl lỗi mạng thoáng qua không được làm cả smoke fail oan — rollback 1 bản tốt vì 1 lần nghẽn mạng là tệ)
  code_ui=000
  for _ in 1 2 3; do
    code_ui="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$PUBLIC_URL/" || echo 000)"
    [ "$code_ui" = 401 ] && break
    sleep 2
  done
  if [ "$code_ui" = 401 ]; then echo "✓ / qua Caddy → 401 (sau mật khẩu cổng)"; else echo "✗ / qua Caddy → $code_ui (cần 401)"; fail=1; fi

  code_mcp=000
  for _ in 1 2 3; do
    code_mcp="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 -X GET "$PUBLIC_URL/mcp" || echo 000)"
    [ "$code_mcp" = 405 ] && break
    sleep 2
  done
  if [ "$code_mcp" = 405 ]; then echo "✓ GET /mcp → 405 (chỉ nhận POST)"; else echo "✗ GET /mcp → $code_mcp (cần 405)"; fail=1; fi
else
  echo "… GS_PUBLIC_URL trống — bỏ qua kiểm Caddy (máy dev/local không có Caddy)"
fi

[ "$fail" = 0 ] && { echo "✓ smoke đạt"; exit 0; } || { echo "✗ smoke KHÔNG đạt" >&2; exit 1; }
