#!/usr/bin/env bash
# Bật nhập kho định kỳ (hàng Drive → DB Gen Kit). © 2026 Gen Labs — All rights reserved.
# Chạy trên VM:  sudo bash /opt/gs-deploy/import-setup.sh      (chạy lại an toàn)
# Cần trước: drive-setup.sh đã chạy (kéo hàng Drive về $DEST) — gói C.2 (Gen, bổ sung cổng): KHÔNG gì tự nhập
# hàng Drive vào DB tới khi có timer này; `genstudio import --source` CHỈ chạy tay trước đó.
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "✗ Chạy bằng sudo" >&2; exit 1; }
D=/opt/gs-deploy
APP=/opt/gen-studio
U=genstudio
SRC="${GS_DRIVE_DEST:-/opt/gen-studio/data/inbox/drive}"
LOG=/var/log/gs-import.log
LOCK=/run/gs-import.lock

[ -x "$APP/cli/genstudio" ] || { echo "✗ Không thấy $APP/cli/genstudio — cài Gen-Studio trước" >&2; exit 1; }

touch "$LOG"; chown "$U:$U" "$LOG"; chmod 600 "$LOG"

# flock (mục 2 — Gen): timer chạy mỗi 10 phút, một lần nhập kho có thể chạy lâu hơn (nhiều file) — khoá tránh hai
# lượt chồng nhau ghi cùng DB. `-n` (non-blocking): lượt sau thấy khoá đang giữ thì bỏ qua êm (exit 0), không xếp hàng.
cat > /etc/systemd/system/gs-import.service <<EOF
[Unit]
Description=Gen-Studio: nhập kho hàng Drive vào DB Gen Kit (genstudio import --source)
After=network-online.target gs-drive-sync.service

[Service]
Type=oneshot
User=$U
ExecStart=/usr/bin/flock -n $LOCK $APP/cli/genstudio import --source $SRC --allow-errors
StandardOutput=append:$LOG
StandardError=append:$LOG
EOF

cat > /etc/systemd/system/gs-import.timer <<'EOF'
[Unit]
Description=Chạy gs-import định kỳ (10 phút)

[Timer]
OnBootSec=3min
OnUnitActiveSec=10min
Persistent=true

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable --now gs-import.timer >/dev/null

echo "✓ gs-import.timer bật — nhập kho $SRC mỗi 10 phút, log $LOG"
echo "  Kiểm tay:  sudo -u $U $APP/cli/genstudio import --source $SRC --allow-errors"
echo "  Xem lịch:  systemctl list-timers gs-import.timer"
