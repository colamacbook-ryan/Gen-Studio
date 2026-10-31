#!/usr/bin/env bash
# Tailscale trên VM Gen-Studio: SSH qua mạng nội bộ Tailscale (tailnet), không mở thêm cổng công khai. © 2026 Gen Labs — All rights reserved.
# Chạy trên VM:  sudo bash /opt/gs-deploy/tailscale.sh      (chạy lại an toàn)
# Lần đầu in ra 1 link đăng nhập — chủ xưởng mở link, đăng nhập tài khoản Tailscale của mình. Không cần auth key.
# --ssh: Tailscale SSH — ai trong tailnet được ACL cho phép thì `ssh genstudio@gen-studio` không cần khoá; quyền đặt ở
#   https://login.tailscale.com/admin/acls (mục "ssh"). Cổng 22 công khai vẫn đóng (firewall GCE chỉ mở 80/443).
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "✗ Chạy bằng sudo" >&2; exit 1; }
HOSTNAME_TS="${GS_TS_HOSTNAME:-gen-studio}"
command -v tailscale >/dev/null 2>&1 || { curl -fsSL https://tailscale.com/install.sh | sh >/dev/null; }
systemctl enable --now tailscaled >/dev/null 2>&1 || true
if tailscale status >/dev/null 2>&1; then
  echo "✓ Tailscale đã nối: $(tailscale ip -4 2>/dev/null | head -1) · $(tailscale status --json 2>/dev/null | python3 -c 'import json,sys;d=json.load(sys.stdin);print(d["Self"]["DNSName"].rstrip("."))' 2>/dev/null || true)"
  tailscale set --ssh --hostname "$HOSTNAME_TS" --accept-dns=false >/dev/null 2>&1 || true
else
  echo "› Chưa đăng nhập — mở link dưới đây trong trình duyệt rồi đăng nhập (chờ tối đa 5 phút):"
  timeout 300 tailscale up --ssh --hostname "$HOSTNAME_TS" --accept-dns=false || { echo "✗ Chưa đăng nhập xong — chạy lại script này sau khi mở link" >&2; exit 1; }
  echo "✓ Đã nối Tailscale: $(tailscale ip -4 | head -1)"
fi
echo "  SSH từ máy trong tailnet:  ssh genstudio@$HOSTNAME_TS   (hoặc ssh genstudio@$(tailscale ip -4 | head -1))"
echo "  Quyền SSH đặt tại admin console → Access controls → mục \"ssh\"."
