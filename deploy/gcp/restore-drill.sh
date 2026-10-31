#!/usr/bin/env bash
# Diễn tập khôi phục THẬT: tải bản sao lưu mới nhất từ bucket, dựng app tạm (cổng 7495), đo RPO/RTO, rồi dọn sạch. © 2026 Gen Labs — All rights reserved.
# Khác restore-test.sh (chỉ kiểm tar + SQLite integrity): script này DỰNG APP THẬT chạy được, không đụng app/dữ liệu đang chạy
# (project compose riêng "gs-drill", volume/network riêng, cổng riêng 127.0.0.1:7495).
# Dùng trên VM:  sudo -u genstudio GS_BUCKET=gs://... /opt/gs-deploy/restore-drill.sh   (cần docker, GS_HOME có mã nguồn)
set -euo pipefail
: "${GS_BUCKET:?thiếu GS_BUCKET}"
GS_HOME="${GS_HOME:-/opt/gen-studio}"
PORT="${GS_DRILL_PORT:-7495}"
PROJECT="gs-drill"
B="${GS_BUCKET#gs://}"
T0="$(date +%s)"
echo "== restore-drill $(date -Is)"

[ -f "$GS_HOME/docker-compose.yml" ] || { echo "✗ Không thấy $GS_HOME/docker-compose.yml — đặt GS_HOME" >&2; exit 1; }

TOKEN="$(curl -fsS -H 'Metadata-Flavor: Google' \
  http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token \
  | python3 -I -c 'import json,sys; print(json.load(sys.stdin)["access_token"])')"
LIST_JSON="$(curl -fsS -H "Authorization: Bearer $TOKEN" "https://storage.googleapis.com/storage/v1/b/$B/o?prefix=backups/")"
NAME="$(printf '%s' "$LIST_JSON" | python3 -I -c 'import json,sys; it=json.load(sys.stdin).get("items",[]); print(max(it,key=lambda o:o["updated"])["name"] if it else "")')"
UPDATED="$(printf '%s' "$LIST_JSON" | python3 -I -c 'import json,sys; it=json.load(sys.stdin).get("items",[]); print(max(it,key=lambda o:o["updated"])["updated"] if it else "")')"
[ -n "$NAME" ] || { echo "✗ bucket chưa có bản sao lưu nào" >&2; exit 1; }
echo "  bản mới nhất: $NAME (lưu lúc $UPDATED)"

T="$(mktemp -d)"
cleanup() {
  (cd "$T/stage" 2>/dev/null && docker compose -p "$PROJECT" down -v --remove-orphans >/dev/null 2>&1) || true
  rm -rf "$T"
}
trap cleanup EXIT

curl -fsS -H "Authorization: Bearer $TOKEN" -o "$T/b.tar.gz" \
  "https://storage.googleapis.com/storage/v1/b/$B/o/$(python3 -I -c 'import sys,urllib.parse; print(urllib.parse.quote(sys.argv[1], safe=""))' "$NAME")?alt=media"

bad="$(tar -tzf "$T/b.tar.gz" | grep -Ev '^data/' || true)$(tar -tzf "$T/b.tar.gz" | grep -E '(^/|(^|/)\.\.(/|$))' || true)"
[ -z "$bad" ] || { echo "✗ bản sao lưu có mục lạ: $(printf '%s' "$bad" | head -c 200)" >&2; exit 1; }

mkdir -p "$T/stage"
# mã nguồn: y hệt commit đang chạy ở GS_HOME (git archive — không phụ thuộc .gitignore/build phụ)
if [ -d "$GS_HOME/.git" ]; then
  git -C "$GS_HOME" archive HEAD | tar -x -C "$T/stage"
else
  rsync -a --exclude data --exclude .git "$GS_HOME/" "$T/stage/" 2>/dev/null || cp -a "$GS_HOME/." "$T/stage/"
fi
rm -rf "$T/stage/data"
tar -xzf "$T/b.tar.gz" -C "$T/stage" --no-same-owner   # ghi đè data/ bằng bản sao lưu — file thuộc user đang chạy script này
cat > "$T/stage/.env" <<EOF
GS_PORT=$PORT
GS_VERSION=drill
COMPOSE_PROJECT_NAME=$PROJECT
GS_UID=$(id -u)
GS_GID=$(id -g)
EOF

echo "› Dựng app tạm (cổng 127.0.0.1:$PORT, project $PROJECT)…"
T1="$(date +%s)"
(cd "$T/stage" && docker compose -p "$PROJECT" up -d --build studio >/dev/null)

ok=0
for _ in $(seq 1 60); do
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 2 "http://127.0.0.1:$PORT/api/health" || echo 000)"
  [ "$code" = 200 ] && { ok=1; break; }
  sleep 2
done
T2="$(date +%s)"

RTO_BUILD=$((T2 - T0))
RTO_UP=$((T2 - T1))

if [ "$ok" = 1 ]; then
  echo "✓ app khôi phục thử trả lời /api/health = 200"
  echo "  RTO (tải+dựng+chờ khoẻ, tính từ lúc bắt đầu): ${RTO_BUILD}s"
  echo "  RTO (chỉ phần dựng container, có sẵn image/cache): ${RTO_UP}s"
  echo "  RPO (tuổi bản sao lưu dùng để khôi phục): xem UPDATED=$UPDATED so với giờ hiện tại $(date -Is)"
else
  echo "✗ app khôi phục thử KHÔNG lên được sau $(( $(date +%s) - T1 ))s — xem: docker compose -p $PROJECT logs" >&2
  exit 1
fi
echo "› Dọn sạch…"
