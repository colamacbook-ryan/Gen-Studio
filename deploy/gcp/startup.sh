#!/usr/bin/env bash
# Startup script của VM Gen-Studio (chạy mỗi lần máy khởi động, chạy lại an toàn). © 2026 Gen Labs — All rights reserved.
# Chỉ chuẩn bị máy: swap 2 GB, Docker, bộ script triển khai ở /opt/gs-deploy. Không cài Gen-Studio (cần token GitHub của chủ).
set -euo pipefail
exec > >(tee -a /var/log/gs-startup.log) 2>&1
echo "== gs-startup $(date -Is)"

if ! swapon --show | grep -q /swapfile; then
  [ -f /swapfile ] || { fallocate -l 2G /swapfile; chmod 600 /swapfile; mkswap /swapfile; }
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

command -v docker >/dev/null 2>&1 || { curl -fsSL https://get.docker.com | sh; systemctl enable --now docker; }

# bộ script triển khai do gcp-create.sh đính vào metadata VM (khoá gs-file-<tên>) → /opt/gs-deploy
MD=http://metadata.google.internal/computeMetadata/v1/instance/attributes
mkdir -p /opt/gs-deploy
for k in setup-vm.sh backup-offsite.sh restore-test.sh Caddyfile.tpl; do
  curl -fsS -H 'Metadata-Flavor: Google' "$MD/gs-file-$k" -o "/opt/gs-deploy/$k" || echo "! thiếu metadata gs-file-$k"
done
chmod 755 /opt/gs-deploy/*.sh 2>/dev/null || true
echo "== gs-startup xong $(date -Is)"
