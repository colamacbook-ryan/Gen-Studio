#!/usr/bin/env bash
# Chạy một lượt nhập kho (gọi bởi gs-import.service, mỗi 10 phút). © 2026 Gen Labs — All rights reserved.
# Chạy dưới user genstudio (không sudo):  /opt/gs-deploy/import-run.sh
# Review opus PR #38 mục 2/3: khoá ở data/ (ghi được bởi user genstudio — không cần quyền /run như trước, tránh
# "Permission denied" mỗi lượt); lock bận = lượt trước chưa xong (bình thường, bỏ qua êm); import.js THẬT SỰ
# lỗi (exit ≠ 0, kể cả có --allow-errors — xem cli/import-kit.js report.configErrors) mới gọi alert.sh.
set -uo pipefail
D=/opt/gs-deploy
APP=/opt/gen-studio
SRC="${GS_IMPORT_SRC:-/opt/gen-studio/data/inbox/drive/03_Hoan-thanh}"
LOCK="${GS_IMPORT_LOCK:-/opt/gen-studio/data/.gs-import.lock}"

exec 9>"$LOCK"
if ! flock -n 9; then
  echo "$(date -Is) lượt nhập kho trước còn đang chạy — bỏ qua lượt này"
  exit 0
fi

"$APP/cli/genstudio" import --source "$SRC" --allow-errors
rc=$?
if [ "$rc" != 0 ]; then
  "$D/alert.sh" "gs-import hỏng (exit $rc, source=$SRC) — xem /var/log/gs-import.log"
fi
exit "$rc"
