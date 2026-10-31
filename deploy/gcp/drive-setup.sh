#!/usr/bin/env bash
# Cài rclone + bật đồng bộ định kỳ Google Drive → máy chủ Gen-Studio. © 2026 Gen Labs — All rights reserved.
# Chạy trên VM:  sudo bash /opt/gs-deploy/drive-setup.sh      (chạy lại an toàn)
# Cần trước: /opt/gs-deploy/drive-sa.json (khoá tài khoản dịch vụ Google, 600, chủ genstudio) đã có sẵn trên VM,
# và Ryan đã chia sẻ thư mục Drive "Muse Workspace" (Viewer) cho gs-drive@gen-studio-ryan.iam.gserviceaccount.com.
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "✗ Chạy bằng sudo" >&2; exit 1; }
D=/opt/gs-deploy
U=genstudio
DEST="${GS_DRIVE_DEST:-/opt/gen-studio/data/inbox/drive}"
FOLDER="${GS_DRIVE_FOLDER:-Muse Workspace}"
LOG=/var/log/gs-drive-sync.log

command -v rclone >/dev/null 2>&1 || { echo "› Cài rclone"; curl -fsSL https://rclone.org/install.sh | bash >/dev/null; }

mkdir -p "$DEST"
chown -R "$U:$U" "$DEST"
touch "$LOG"; chown "$U:$U" "$LOG"; chmod 600 "$LOG"
chmod 755 "$D/drive-sync.sh" 2>/dev/null || true

cat > /etc/systemd/system/gs-drive-sync.service <<EOF
[Unit]
Description=Gen-Studio: kéo file Muse từ Google Drive về máy chủ
After=network-online.target

[Service]
Type=oneshot
User=$U
Environment="GS_DRIVE_DEST=$DEST"
Environment="GS_DRIVE_FOLDER=$FOLDER"
ExecStart=$D/drive-sync.sh
EOF

cat > /etc/systemd/system/gs-drive-sync.timer <<'EOF'
[Unit]
Description=Chạy gs-drive-sync định kỳ

[Timer]
OnBootSec=2min
OnUnitActiveSec=5min
Persistent=true

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable --now gs-drive-sync.timer >/dev/null

echo "› Kiểm thư mục Drive đã chia sẻ chưa"
SA_FILE="${GS_DRIVE_SA_FILE:-$D/drive-sa.json}"
if [ -f "$SA_FILE" ]; then
  if sudo -u "$U" -H env \
    RCLONE_CONFIG_GDRIVE_TYPE=drive \
    RCLONE_CONFIG_GDRIVE_SCOPE=drive.readonly \
    RCLONE_CONFIG_GDRIVE_SERVICE_ACCOUNT_FILE="$SA_FILE" \
    RCLONE_CONFIG_GDRIVE_SHARED_WITH_ME=true \
    rclone lsd gdrive: 2>/dev/null | grep -q "$FOLDER"; then
    echo "✓ thấy thư mục $FOLDER"
  else
    echo "⚠ chưa thấy $FOLDER — Ryan cần chia sẻ thư mục cho gs-drive@gen-studio-ryan.iam.gserviceaccount.com"
  fi
else
  echo "⚠ chưa thấy $SA_FILE — chưa kiểm được thư mục"
fi

echo "› Chạy thử đồng bộ 1 lần"
systemctl start gs-drive-sync.service || echo "⚠ chạy thử lỗi — xem: sudo tail -20 $LOG"
tail -5 "$LOG" 2>/dev/null || true

echo "✓ xong — timer: systemctl list-timers | grep gs-drive-sync · log: sudo tail -f $LOG"
