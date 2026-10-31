#!/usr/bin/env bash
# Kéo file Muse nộp trong Google Drive về máy chủ Gen-Studio (copy, KHÔNG xoá). © 2026 Gen Labs — All rights reserved.
# Chạy dưới user genstudio (không sudo):  /opt/gs-deploy/drive-sync.sh
# Cần: rclone đã cài + /opt/gs-deploy/drive-sa.json (khoá tài khoản dịch vụ, 600, chủ genstudio) — do drive-setup.sh lo.
# Thư mục Drive "Gen-Studio-Inbox" phải đã được chia sẻ (Viewer) cho gs-drive@gen-studio-ryan.iam.gserviceaccount.com,
# tài khoản dịch vụ thấy nó trong "Shared with me" ⇒ bật RCLONE_CONFIG_GDRIVE_SHARED_WITH_ME=true.
# Kho là nguồn sự thật: dùng `copy` (không `sync`) ⇒ Muse xoá file trên Drive thì VPS vẫn giữ bản đã tải.
set -euo pipefail
SA_FILE="${GS_DRIVE_SA_FILE:-/opt/gs-deploy/drive-sa.json}"
DEST="${GS_DRIVE_DEST:-/opt/gen-studio/data/inbox/drive}"
FOLDER="${GS_DRIVE_FOLDER:-Gen-Studio-Inbox}"
LOG="${GS_DRIVE_LOG:-/var/log/gs-drive-sync.log}"

[ -f "$SA_FILE" ] || { echo "✗ Thiếu khoá tài khoản dịch vụ: $SA_FILE" >&2; exit 1; }
command -v rclone >/dev/null 2>&1 || { echo "✗ Chưa có rclone — chạy: sudo bash /opt/gs-deploy/drive-setup.sh" >&2; exit 1; }

mkdir -p "$DEST"
touch "$LOG" 2>/dev/null || true
chmod 600 "$LOG" 2>/dev/null || true

export RCLONE_CONFIG_GDRIVE_TYPE=drive
export RCLONE_CONFIG_GDRIVE_SCOPE=drive.readonly
export RCLONE_CONFIG_GDRIVE_SERVICE_ACCOUNT_FILE="$SA_FILE"
export RCLONE_CONFIG_GDRIVE_SHARED_WITH_ME=true

BEFORE="$(find "$DEST" -type f 2>/dev/null | wc -l)"
{
  echo "== drive-sync $(date -Is)"
  rclone copy "gdrive:$FOLDER" "$DEST" --create-empty-src-dirs=false --max-size 500M --exclude ".*" --log-level NOTICE
} >> "$LOG" 2>&1
AFTER="$(find "$DEST" -type f 2>/dev/null | wc -l)"
NEW=$((AFTER - BEFORE))
echo "✓ đồng bộ xong — file mới: $NEW (tổng $AFTER) → $DEST" | tee -a "$LOG"
