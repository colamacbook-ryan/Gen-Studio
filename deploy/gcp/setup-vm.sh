#!/usr/bin/env bash
# Cài Gen-Studio trên VM Google Cloud + HTTPS + sao lưu ra bucket. © 2026 Gen Labs — All rights reserved.
# Chạy trên VM:  sudo bash /opt/gs-deploy/setup-vm.sh      (chạy lại an toàn — dùng để cập nhật)
# Hỏi đúng 1 thứ: token GitHub CHỈ ĐỌC repo gen-studio (gõ ẩn, không lưu xuống đĩa).
# Ra Internet chỉ có /mcp, /oauth/*, /.well-known/*; mọi trang khác (UI chủ xưởng) phải qua mật khẩu cổng (basic auth) + đăng nhập chủ xưởng.
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "✗ Chạy bằng sudo" >&2; exit 1; }
D=/opt/gs-deploy; APP=/opt/gen-studio; U=genstudio; PORT=7490; CADDY=caddy:2.8.4
MD=http://metadata.google.internal/computeMetadata/v1
md() { curl -fsS -H 'Metadata-Flavor: Google' "$MD/$1"; }
command -v docker >/dev/null || { echo "✗ Chưa có Docker — đợi startup script xong (xem /var/log/gs-startup.log) rồi chạy lại" >&2; exit 1; }

IP="$(md instance/network-interfaces/0/access-configs/0/external-ip)"
HOST="${GS_HOST_NAME:-$(echo "$IP" | tr . -).sslip.io}"
BUCKET="$(md instance/attributes/gs-bucket)"
echo "Máy chủ: https://$HOST · sao lưu: $BUCKET"

# 1. user chạy dịch vụ (không chạy container bằng root)
id "$U" >/dev/null 2>&1 || useradd --system --create-home --shell /bin/bash "$U"
usermod -aG docker "$U"
mkdir -p "$APP" && chown "$U:$U" "$APP"

# 2. tải + cài Gen-Studio bản phát hành mới nhất (repo riêng tư ⇒ cần token chỉ đọc)
read -rsp "Dán token GitHub (chỉ đọc gen-studio), Enter: " TOK; echo
[ -n "$TOK" ] || { echo "✗ Token rỗng" >&2; exit 1; }
curl -fsSL -H "Authorization: Bearer $TOK" -H "Accept: application/vnd.github.raw" \
  -o /tmp/gs-install.sh "https://api.github.com/repos/colamacbook-ryan/gen-studio/contents/install.sh?ref=main" \
  || { echo "✗ Không tải được install.sh — token sai hoặc thiếu quyền Contents: Read" >&2; exit 1; }
chmod 644 /tmp/gs-install.sh
sudo -u "$U" -H env GS_GITHUB_TOKEN="$TOK" bash /tmp/gs-install.sh --dir "$APP" --port "$PORT"
unset TOK; rm -f /tmp/gs-install.sh

# 3. cấu hình đứng sau proxy: địa chỉ công khai + tin header của Caddy (file override không nằm trong repo, cập nhật không ghi đè)
cd "$APP"
envset() { if grep -q "^$1=" .env; then sed -i "s|^$1=.*|$1=$2|" .env; else echo "$1=$2" >> .env; fi; }
envset GS_PUBLIC_URL "https://$HOST"
cat > docker-compose.override.yml <<'EOF'
# Tạo bởi deploy/gcp/setup-vm.sh — chỉ có trên máy chủ GCP. Studio đứng sau Caddy (cùng máy) ⇒ tin X-Forwarded-For.
services:
  studio:
    environment:
      GS_TRUST_PROXY: "1"
EOF
chown "$U:$U" .env docker-compose.override.yml
sudo -u "$U" -H docker compose up -d >/dev/null

# 4. Caddy: HTTPS tự động (Let's Encrypt), allowlist đường công khai, UI sau mật khẩu cổng
if [ ! -f "$D/gate-password" ]; then
  head -c 24 /dev/urandom | base64 | tr -d '+/=\n' | head -c 24 > "$D/gate-password"; chmod 600 "$D/gate-password"; NEWPW=1
fi
HASH="$(docker run --rm "$CADDY" caddy hash-password --plaintext "$(cat "$D/gate-password")")"
sed -e "s|__HOST__|$HOST|g" -e "s|__PORT__|$PORT|g" -e "s|__HASH__|$HASH|g" "$D/Caddyfile.tpl" > "$D/Caddyfile"
docker rm -f gs-caddy >/dev/null 2>&1 || true
docker run -d --name gs-caddy --restart unless-stopped --network host \
  -v "$D/Caddyfile:/etc/caddy/Caddyfile:ro" -v gs-caddy-data:/data -v gs-caddy-config:/config "$CADDY" >/dev/null

# 5. sao lưu hằng đêm 02:30 giờ VN (19:30 UTC) ra bucket + thử khôi phục mỗi chủ nhật
cat > /etc/cron.d/gs-backup <<EOF
GS_HOME=$APP
GS_BUCKET=$BUCKET
30 19 * * * $U /opt/gs-deploy/backup-offsite.sh >> /var/log/gs-backup.log 2>&1
30 20 * * 0 $U /opt/gs-deploy/restore-test.sh >> /var/log/gs-backup.log 2>&1
EOF
touch /var/log/gs-backup.log && chown "$U" /var/log/gs-backup.log

# 6. kiểm ngay: sao lưu 1 bản + khôi phục thử + đường công khai/đường bị chặn
sudo -u "$U" -H env GS_HOME="$APP" GS_BUCKET="$BUCKET" "$D/backup-offsite.sh"
sudo -u "$U" -H env GS_BUCKET="$BUCKET" "$D/restore-test.sh"
echo "› Đợi chứng chỉ HTTPS…"
for _ in $(seq 1 30); do curl -fsS -o /dev/null "https://$HOST/.well-known/oauth-authorization-server" && break; sleep 4; done
code_pub="$(curl -s -o /dev/null -w '%{http_code}' "https://$HOST/.well-known/oauth-authorization-server")"
code_ui="$(curl -s -o /dev/null -w '%{http_code}' "https://$HOST/")"
code_api="$(curl -s -o /dev/null -w '%{http_code}' "https://$HOST/api/health")"
echo "  công khai /.well-known → $code_pub (cần 200) · UI / → $code_ui (cần 401) · /api → $code_api (cần 401)"
[ "$code_pub" = 200 ] && [ "$code_ui" = 401 ] && [ "$code_api" = 401 ] || { echo "✗ Kiểm đường không đạt — xem: docker logs gs-caddy" >&2; exit 1; }

echo
echo "✓ Gen-Studio chạy tại https://$HOST"
echo "  MCP cho Muse:  https://$HOST/mcp"
echo "  Mật khẩu cổng (trình duyệt hỏi khi mở UI): user = owner"
[ "${NEWPW:-0}" = 1 ] && echo "  pass = $(cat "$D/gate-password")   ← cất vào trình quản lý mật khẩu; xem lại: sudo cat $D/gate-password"
grep -q '"owner":true' <(curl -fsS "http://127.0.0.1:$PORT/api/setup/state" 2>/dev/null) \
  || echo "  Thiết lập lần đầu: https://$HOST/#/setup?k=$(cat "$APP/data/run/admin-key" 2>/dev/null)"
echo "  Khoá chủ (GS_MASTER_KEY) KHÔNG nằm trong sao lưu: sudo cat $APP/data/.env → cất vào trình quản lý mật khẩu."
