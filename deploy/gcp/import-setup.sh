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
# review opus PR #38 mục 1 [chặn]: hàng Drive thật nằm ở <GS_DRIVE_DEST>/03_Hoan-thanh/<Mã phiếu>/<file> (xem
# docs/MUSE-CONNECT.md, tickets-sheet.py DATA_INBOX_DIR.glob) — trỏ thẳng GS_DRIVE_DEST (thiếu "03_Hoan-thanh")
# quét ra 0 thư mục MR, trước đây thoát êm mã 0 mỗi lượt. Mặc định đúng đường con.
SRC="${GS_IMPORT_SRC:-${GS_DRIVE_DEST:-/opt/gen-studio/data/inbox/drive}/03_Hoan-thanh}"
LOG=/var/log/gs-import.log
LOCK=/opt/gen-studio/data/.gs-import.lock

[ -x "$APP/cli/genstudio" ] || { echo "✗ Không thấy $APP/cli/genstudio — cài Gen-Studio trước" >&2; exit 1; }
[ -f "$D/import-run.sh" ] || { echo "✗ Không thấy $D/import-run.sh — copy thiếu file (xem gcp-create.sh/startup.sh)" >&2; exit 1; }
[ -f "$D/alert.sh" ] || { echo "✗ Không thấy $D/alert.sh — cài đặt chưa đủ bộ" >&2; exit 1; }

chmod 755 "$D/import-run.sh"
touch "$LOG"; chown "$U:$U" "$LOG"; chmod 600 "$LOG"
mkdir -p "$(dirname "$LOCK")"; chown "$U:$U" "$(dirname "$LOCK")"

# review opus PR #38 mục 2 [chặn]: khoá chống chồng lượt + gọi alert.sh khi hỏng thật (mục 3 [major]) nằm trong
# import-run.sh (lock ở data/, ghi được bởi $U — không cần RuntimeDirectory/quyền /run).
cat > /etc/systemd/system/gs-import.service <<EOF
[Unit]
Description=Gen-Studio: nhập kho hàng Drive vào DB Gen Kit (genstudio import --source)
After=network-online.target gs-drive-sync.service

[Service]
Type=oneshot
User=$U
Environment="GS_IMPORT_SRC=$SRC"
Environment="GS_IMPORT_LOCK=$LOCK"
ExecStart=$D/import-run.sh
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
