#!/usr/bin/env bash
# Cài venv Python + bật đồng bộ định kỳ phiếu Muse lên Google Sheet. © 2026 Gen Labs — All rights reserved.
# Chạy trên VM:  sudo bash /opt/gs-deploy/tickets-setup.sh      (chạy lại an toàn)
# Cần trước: /opt/gs-deploy/drive-sa.json (khoá tài khoản dịch vụ Google, 600, chủ genstudio) đã có sẵn,
# và Sheet đích đã chia sẻ quyền Chỉnh sửa cho gs-drive@<project>.iam.gserviceaccount.com (qua thư mục Drive).
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "✗ Chạy bằng sudo" >&2; exit 1; }
D=/opt/gs-deploy
U=genstudio
VENV="$D/venv"
LOG=/var/log/gs-tickets.log

command -v python3 >/dev/null 2>&1 || { echo "✗ Thiếu python3" >&2; exit 1; }
python3 -c "import ensurepip" >/dev/null 2>&1 || { echo "› Cài python3-venv"; apt-get update -qq && apt-get install -yqq python3-venv >/dev/null; }
[ -x "$VENV/bin/python" ] || { echo "› Tạo venv $VENV"; python3 -m venv "$VENV"; }
"$VENV/bin/pip" install --quiet --upgrade pip
"$VENV/bin/pip" install --quiet google-auth google-api-python-client
chown -R "$U:$U" "$VENV"

chmod 755 "$D/tickets-sheet.py" 2>/dev/null || true
touch "$LOG"; chown "$U:$U" "$LOG"; chmod 600 "$LOG"

cat > /etc/systemd/system/gs-tickets-sync.service <<EOF
[Unit]
Description=Gen-Studio: đồng bộ trạng thái phiếu Muse lên Google Sheet
After=network-online.target

[Service]
Type=oneshot
User=$U
ExecStart=/bin/sh -c '$VENV/bin/python $D/tickets-sheet.py sync || $D/alert.sh "gs-tickets-sync hỏng"'
StandardOutput=append:$LOG
StandardError=append:$LOG
EOF

cat > /etc/systemd/system/gs-tickets-sync.timer <<'EOF'
[Unit]
Description=Chạy gs-tickets-sync định kỳ

[Timer]
OnBootSec=5min
OnUnitActiveSec=10min
Persistent=true

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable --now gs-tickets-sync.timer >/dev/null

echo "✓ xong — venv: $VENV · timer: systemctl list-timers | grep gs-tickets-sync · log: sudo tail -f $LOG"
echo "  Chạy tay: sudo -u $U $VENV/bin/python $D/tickets-sheet.py init|seed|sync|status"
