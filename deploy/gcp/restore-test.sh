#!/usr/bin/env bash
# Khôi phục THỬ bản sao lưu mới nhất từ bucket vào thư mục tạm — không đụng dữ liệu đang chạy. © 2026 Gen Labs — All rights reserved.
# Đạt khi: tải được, tar chỉ chứa data/ (không đường tuyệt đối, không ..), SQLite integrity_check = ok và có bảng assets.
# Khôi phục THẬT: tải file về rồi `genstudio restore <file>` (có hỏi xác nhận).
set -euo pipefail
: "${GS_BUCKET:?thiếu GS_BUCKET}"
B="${GS_BUCKET#gs://}"
echo "== restore-test $(date -Is)"
TOKEN="$(curl -fsS -H 'Metadata-Flavor: Google' \
  http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token \
  | python3 -I -c 'import json,sys; print(json.load(sys.stdin)["access_token"])')"
NAME="$(curl -fsS -H "Authorization: Bearer $TOKEN" "https://storage.googleapis.com/storage/v1/b/$B/o?prefix=backups/" \
  | python3 -I -c 'import json,sys; it=json.load(sys.stdin).get("items",[]); print(max(it,key=lambda o:o["updated"])["name"] if it else "")')"
[ -n "$NAME" ] || { echo "✗ bucket chưa có bản sao lưu nào" >&2; exit 1; }
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
curl -fsS -H "Authorization: Bearer $TOKEN" -o "$T/b.tar.gz" \
  "https://storage.googleapis.com/storage/v1/b/$B/o/$(python3 -I -c 'import sys,urllib.parse; print(urllib.parse.quote(sys.argv[1], safe=""))' "$NAME")?alt=media"
bad="$(tar -tzf "$T/b.tar.gz" | grep -Ev '^data/' || true)$(tar -tzf "$T/b.tar.gz" | grep -E '(^/|(^|/)\.\.(/|$))' || true)"
[ -z "$bad" ] || { echo "✗ bản sao lưu có mục lạ: $(printf '%s' "$bad" | head -c 200)" >&2; exit 1; }
mkdir "$T/x"; tar -xzf "$T/b.tar.gz" -C "$T/x" --no-same-owner
python3 -I - "$T/x/data/studio.db" <<'PY'
import sqlite3, sys
c = sqlite3.connect(f"file:{sys.argv[1]}?mode=ro", uri=True)
ok = c.execute("PRAGMA integrity_check").fetchone()[0]
n = c.execute("SELECT count(*) FROM assets").fetchone()[0]
if ok != "ok": sys.exit(f"✗ integrity_check: {ok}")
print(f"✓ khôi phục thử đạt — integrity ok, {n} asset")
PY
echo "  bản: $NAME"
