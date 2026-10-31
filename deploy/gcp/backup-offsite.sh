#!/usr/bin/env bash
# Sao lưu Gen-Studio rồi đẩy bản mới nhất lên bucket Cloud Storage. © 2026 Gen Labs — All rights reserved.
# Dùng service account của VM (metadata), không cần gcloud. Giữ 7 bản trên máy; bucket tự xoá bản > 30 ngày.
# Biến: GS_HOME (thư mục cài), GS_BUCKET (gs://…). Lỗi ⇒ thoát ≠ 0 (cron ghi /var/log/gs-backup.log).
set -euo pipefail
: "${GS_HOME:?thiếu GS_HOME}" "${GS_BUCKET:?thiếu GS_BUCKET}"
B="${GS_BUCKET#gs://}"
echo "== backup $(date -Is)"
cd "$GS_HOME"
./cli/genstudio backup >/dev/null
f="$(ls -1t data/backups/gen-studio-*.tar.gz | head -1)"
tar -tzf "$f" >/dev/null   # file hỏng thì dừng, không đẩy lên
TOKEN="$(curl -fsS -H 'Metadata-Flavor: Google' \
  http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token \
  | python3 -I -c 'import json,sys; print(json.load(sys.stdin)["access_token"])')"
curl -fsS -X POST -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/gzip' --data-binary "@$f" \
  "https://storage.googleapis.com/upload/storage/v1/b/$B/o?uploadType=media&name=backups/$(basename "$f")" >/dev/null
echo "✓ đã đẩy $(basename "$f") ($(du -h "$f" | cut -f1)) → $GS_BUCKET/backups/"
ls -1t data/backups/gen-studio-*.tar.gz | tail -n +8 | xargs -r rm -f
