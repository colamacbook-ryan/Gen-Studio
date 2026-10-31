#!/usr/bin/env bash
# Đường hầm SSH máy Ryan (Fedora) → MCP shell cấp cứu trên VM gen-studio. © 2026 Gen Labs — All rights reserved.
# CHẠY TRÊN MÁY RYAN (cần gcloud CLI, đã `gcloud auth login`) — KHÔNG chạy script này trên VM.
# Dùng khi Claude Code trên VM hết quota: mở đường hầm rồi nối agy CLI / Gen-hub vào MCP shell cấp cứu
# (chỉ nghe loopback 127.0.0.1:7777 trên VM, không mở cổng công khai, không qua Caddy).
#
# Cách dùng:
#   bash deploy/gcp/tunnel-local.sh --install [--bind-docker]   cài + bật systemd user unit, tự khởi động lại
#   bash deploy/gcp/tunnel-local.sh --status                    xem trạng thái unit + thử gọi /mcp (mong 401)
#   bash deploy/gcp/tunnel-local.sh --remove                    tắt + gỡ unit
#
# Biến môi trường (đều có mặc định):
#   GS_VM=gen-studio  GS_ZONE=us-west1-b  GS_PROJECT=$(gcloud config get-value project)
set -euo pipefail

VM="${GS_VM:-gen-studio}"
ZONE="${GS_ZONE:-us-west1-b}"
PROJECT="${GS_PROJECT:-$(gcloud config get-value project 2>/dev/null || true)}"
UNIT_NAME=gs-tunnel.service
UNIT_DIR="$HOME/.config/systemd/user"
UNIT="$UNIT_DIR/$UNIT_NAME"

usage() {
  cat <<EOF
Dùng: $0 --install [--bind-docker] | --status | --remove
EOF
}

print_connect_help() {
  cat <<EOF

Nối MCP shell cấp cứu từ agy CLI / Gen-hub (đường hầm phải đang bật — kiểm bằng --status):
  agy CLI: thêm "MCP tùy chỉnh" (bật tuỳ chọn "cho phép mạng riêng"/private network)
    → URL: http://127.0.0.1:7777/mcp
  Gen-hub chạy trong Docker: đường hầm chỉ bind 127.0.0.1 trên máy Ryan nên container KHÔNG thấy được —
    dùng http://host.docker.internal:7777/mcp (hoặc http://172.17.0.1:7777/mcp nếu Docker không hỗ trợ host.docker.internal).
    Nếu vẫn không nối được: chạy lại "$0 --install --bind-docker" để đường hầm bind thêm 172.17.0.1:7777
    (rủi ro: container nào trên máy Ryan cũng gọi được cổng này — vẫn cần đúng token mới chạy lệnh được).
  Luôn cần header: Authorization: Bearer <token>
    (lấy token: ssh vào VM rồi  sudo cat /opt/gs-deploy/shell-token)
EOF
}

[ $# -ge 1 ] || { usage; exit 1; }

case "$1" in
  --install)
    BIND_DOCKER=0
    [ "${2:-}" = "--bind-docker" ] && BIND_DOCKER=1
    [ -n "$PROJECT" ] || { echo "✗ Chưa chọn project — chạy: gcloud config set project <ID> (hoặc đặt GS_PROJECT)" >&2; exit 1; }
    command -v gcloud >/dev/null 2>&1 || { echo "✗ Chưa có gcloud CLI trên máy này" >&2; exit 1; }
    GCLOUD_BIN="$(command -v gcloud)"
    mkdir -p "$UNIT_DIR"

    SSH_ARGS=(-N -L 127.0.0.1:7777:127.0.0.1:7777 -o ServerAliveInterval=30 -o ExitOnForwardFailure=yes)
    if [ "$BIND_DOCKER" = 1 ]; then
      SSH_ARGS=(-N -L 127.0.0.1:7777:127.0.0.1:7777 -L 172.17.0.1:7777:127.0.0.1:7777 -o ServerAliveInterval=30 -o ExitOnForwardFailure=yes)
      echo "⚠ --bind-docker: cổng 7777 sẽ lộ cho mọi container Docker trên máy này (vẫn cần đúng token mới chạy lệnh được)"
    fi

    cat > "$UNIT" <<EOF
[Unit]
Description=Đường hầm SSH tới MCP shell cấp cứu VM $VM
After=network-online.target
Wants=network-online.target

[Service]
ExecStart=$GCLOUD_BIN compute ssh $VM --zone $ZONE --project $PROJECT --quiet -- ${SSH_ARGS[@]}
Restart=always
RestartSec=5

[Install]
WantedBy=default.target
EOF

    systemctl --user daemon-reload
    systemctl --user enable --now "$UNIT_NAME"
    loginctl enable-linger "$USER" 2>/dev/null \
      || echo "⚠ không tự bật được linger — chạy tay: sudo loginctl enable-linger $USER (để tunnel sống cả khi chưa đăng nhập)"

    echo "✓ Đã cài + bật $UNIT_NAME (VM=$VM ZONE=$ZONE PROJECT=$PROJECT bind-docker=$BIND_DOCKER)"
    print_connect_help
    ;;

  --status)
    systemctl --user status "$UNIT_NAME" --no-pager 2>&1 || true
    echo
    CODE="$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 -X POST http://127.0.0.1:7777/mcp 2>/dev/null || echo 000)"
    echo "Gọi thử POST http://127.0.0.1:7777/mcp (không token) → HTTP $CODE (mong 401 — nghĩa là tunnel sống và MCP đòi token đúng)"
    [ "$CODE" = 401 ] || echo "  ⚠ Không phải 401 — tunnel có thể chưa lên, hoặc MCP trên VM chưa chạy (xem --status unit ở trên)"
    ;;

  --remove)
    systemctl --user disable --now "$UNIT_NAME" 2>/dev/null || true
    rm -f "$UNIT"
    systemctl --user daemon-reload
    echo "✓ Đã gỡ $UNIT_NAME"
    ;;

  -h|--help) usage ;;
  *) usage; exit 1 ;;
esac
