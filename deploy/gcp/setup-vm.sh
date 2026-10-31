#!/usr/bin/env bash
# Cài Gen-Studio trên VM Google Cloud + HTTPS + sao lưu ra bucket. © 2026 Gen Labs — All rights reserved.
# Chạy trên VM:  sudo bash /opt/gs-deploy/setup-vm.sh      (chạy lại an toàn — dùng để cập nhật)
# Tên miền riêng thay sslip.io: sudo GS_HOST_NAME=studio.genos.top bash /opt/gs-deploy/setup-vm.sh
#   (đổi GS_HOST_NAME giữa 2 lần chạy ⇒ Caddyfile sinh lại theo tên mới)
# Chế độ xưởng (mặc định BẬT — máy vừa chạy prod vừa là nơi Claude Code làm việc; tắt bằng GS_WORKSHOP=0):
#   cài tmux/git/Node 22/gh/Claude Code CLI ở mức hệ thống + clone ~genstudio/genlabs/{Second-Brain,Gen-Studio}
#   (nhánh main) rồi dựng dev stack riêng ở cổng 7491 (lần đầu).
# Hỏi đúng 1 thứ: token GitHub đọc repo Gen-Studio/Second-Brain (gõ ẩn, không lưu xuống đĩa, không lưu vào remote URL).
# Ra Internet chỉ có /mcp, /oauth/*, /.well-known/*; mọi trang khác (UI chủ xưởng) phải qua mật khẩu cổng (basic auth) + đăng nhập chủ xưởng.
# Nhánh lấy mã nguồn prod: mặc định main. Lần đầu chạy (trước khi PR #30 gộp deploy/ vào main) phải đặt:
#   sudo GS_BRANCH=claude/wip/0.3.0/f-ops bash /opt/gs-deploy/setup-vm.sh    (bỏ biến này sau khi PR #30 merge)
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "✗ Chạy bằng sudo" >&2; exit 1; }
D=/opt/gs-deploy; APP=/opt/gen-studio; U=genstudio; PORT=7490; CADDY=caddy:2.8.4
WORKSHOP="${GS_WORKSHOP:-1}"
GS_BRANCH="${GS_BRANCH:-main}"
MD=http://metadata.google.internal/computeMetadata/v1
md() { curl -fsS -H 'Metadata-Flavor: Google' "$MD/$1"; }
# Gọi git kèm header token qua STDIN (không qua argv) — argv lộ qua `ps`/`/var/log/auth.log`, stdin thì không.
# Dùng: printf '%s\n' "$AUTHHDR" | git_with_token "$U" -C "$DIR" fetch origin "$GS_BRANCH"
git_with_token() {
  local gu="$1"; shift
  sudo -u "$gu" -H bash -c 'read -r h; exec git -c http.extraheader="$h" "$@"' _ "$@"
}
command -v docker >/dev/null || { echo "✗ Chưa có Docker — đợi startup script xong (xem /var/log/gs-startup.log) rồi chạy lại" >&2; exit 1; }

IP="$(md instance/network-interfaces/0/access-configs/0/external-ip)"
VMNAME="$(md instance/name)"
VMZONE="$(md instance/zone | sed 's#.*/##')"
HOST="${GS_HOST_NAME:-$(echo "$IP" | tr . -).sslip.io}"
BUCKET="$(md instance/attributes/gs-bucket)"
echo "Máy chủ: https://$HOST · sao lưu: $BUCKET · xưởng: $([ "$WORKSHOP" = 1 ] && echo bật || echo tắt)"

# 1. user chạy dịch vụ (không chạy container bằng root) — cũng là user xưởng (tmux + Claude Code)
id "$U" >/dev/null 2>&1 || useradd --system --create-home --shell /bin/bash "$U"
usermod -aG docker "$U"
GHOME="$(getent passwd "$U" | cut -d: -f6)"
mkdir -p "$APP" && chown "$U:$U" "$APP"

# 1.5 công cụ xưởng (idempotent — chỉ cài khi thiếu), mức hệ thống, chạy ở root
if [ "$WORKSHOP" = 1 ]; then
  echo "› Công cụ xưởng (tmux, git, Node 22, gh, Claude Code)"
  APTGET() { apt-get -o DPkg::Lock::Timeout=300 "$@"; }  # VM mới boot còn unattended-upgrades giữ lock ⇒ đợi thay vì chết
  APTGET update -qq
  NEED=()
  for p in tmux git curl ca-certificates gnupg; do dpkg -s "$p" >/dev/null 2>&1 || NEED+=("$p"); done
  [ "${#NEED[@]}" -eq 0 ] || APTGET install -y -qq "${NEED[@]}"

  NODE_OK=0
  if command -v node >/dev/null 2>&1; then
    NV="$(node -v 2>/dev/null | sed -E 's/^v([0-9]+).*/\1/')"
    case "$NV" in ''|*[!0-9]*) ;; *) [ "$NV" -ge 22 ] && NODE_OK=1 ;; esac
  fi
  if [ "$NODE_OK" = 0 ]; then
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null
    APTGET install -y -qq nodejs
  fi

  if ! command -v gh >/dev/null 2>&1; then
    mkdir -p -m 755 /etc/apt/keyrings
    GHKEY="$(mktemp)"
    curl -fsSL -o "$GHKEY" https://cli.github.com/packages/githubcli-archive-keyring.gpg
    cat "$GHKEY" > /etc/apt/keyrings/githubcli-archive-keyring.gpg
    rm -f "$GHKEY"
    chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
      | tee /etc/apt/sources.list.d/github-cli.list >/dev/null
    APTGET update -qq
    APTGET install -y -qq gh
  fi

  command -v claude >/dev/null 2>&1 || npm install -g @anthropic-ai/claude-code >/dev/null
  echo "✓ công cụ xưởng sẵn sàng"
fi

# 2. mã nguồn Gen-Studio prod từ git (clone lần đầu, fetch+pull khi đã có) — token KHÔNG lưu vào remote URL hay đĩa
read -rsp "Dán token GitHub (đọc repo Gen-Studio$([ "$WORKSHOP" = 1 ] && echo /Second-Brain)), Enter: " TOK; echo
[ -n "$TOK" ] || { echo "✗ Token rỗng" >&2; exit 1; }
AUTHHDR="AUTHORIZATION: bearer $TOK"

echo "› Mã nguồn prod: $APP (nhánh $GS_BRANCH)"
if [ -d "$APP/.git" ]; then
  { printf '%s\n' "$AUTHHDR" | git_with_token "$U" -C "$APP" fetch origin "$GS_BRANCH" \
    && sudo -u "$U" -H git -C "$APP" checkout "$GS_BRANCH" \
    && printf '%s\n' "$AUTHHDR" | git_with_token "$U" -C "$APP" pull --ff-only origin "$GS_BRANCH"; } \
    || { echo "✗ Không cập nhật được $APP từ git — token sai hoặc thiếu quyền" >&2; exit 1; }
else
  if [ -n "$(ls -A "$APP" 2>/dev/null)" ]; then
    # bản cài kiểu cũ (tải tarball, không có .git) ⇒ giữ .env + data/, clone lại mã nguồn từ git
    BAK="$APP.pre-git.$(date +%s)"
    mv "$APP" "$BAK"
    mkdir -p "$APP" && chown "$U:$U" "$APP"
  fi
  printf '%s\n' "$AUTHHDR" | git_with_token "$U" clone --branch "$GS_BRANCH" \
    https://github.com/colamacbook-ryan/Gen-Studio.git "$APP" \
    || { echo "✗ Không clone được Gen-Studio — token sai hoặc thiếu quyền" >&2; exit 1; }
  if [ -n "${BAK:-}" ]; then
    [ -f "$BAK/.env" ] && mv "$BAK/.env" "$APP/.env"
    [ -d "$BAK/data" ] && mv "$BAK/data" "$APP/data"
    echo "  (giữ $BAK — xoá tay sau khi xác nhận prod chạy tốt)"
  fi
fi
chown -R "$U:$U" "$APP"
sudo -u "$U" -H git config --global --get-all safe.directory 2>/dev/null | grep -qx "$APP" \
  || sudo -u "$U" -H git config --global --add safe.directory "$APP"

sudo -u "$U" -H bash "$APP/install.sh" --dir "$APP" --port "$PORT"

# 2.5 xưởng: kéo kho mã làm việc dưới genstudio + dev stack riêng cổng 7491 (Claude Code làm việc ở đây)
if [ "$WORKSHOP" = 1 ]; then
  echo "› Xưởng: kho mã làm việc + dev stack cổng 7491"
  mkdir -p "$GHOME/genlabs" && chown "$U:$U" "$GHOME/genlabs"
  for repo in Second-Brain Gen-Studio; do
    WDIR="$GHOME/genlabs/$repo"
    if [ -d "$WDIR/.git" ]; then
      { printf '%s\n' "$AUTHHDR" | git_with_token "$U" -C "$WDIR" fetch origin main \
        && sudo -u "$U" -H git -C "$WDIR" checkout main \
        && printf '%s\n' "$AUTHHDR" | git_with_token "$U" -C "$WDIR" pull --ff-only origin main; } \
        || echo "⚠ Không cập nhật được $WDIR từ git — bỏ qua, kiểm tay sau"
    else
      printf '%s\n' "$AUTHHDR" | git_with_token "$U" clone --branch main \
        "https://github.com/colamacbook-ryan/$repo.git" "$WDIR" \
        || echo "⚠ Không clone được $repo — bỏ qua, kiểm tay sau"
    fi
  done
  # dev stack cổng 7491: chỉ cài lần đầu (chưa có .env) — không đụng nếu đã có, Claude Code có thể đang sửa dở
  if [ -d "$GHOME/genlabs/Gen-Studio" ] && [ ! -f "$GHOME/genlabs/Gen-Studio/.env" ]; then
    # .env dev tối thiểu TRƯỚC khi install.sh chạy: COMPOSE_PROJECT_NAME riêng — /opt/gen-studio (prod) và
    # ~/genlabs/Gen-Studio (dev) ra cùng project "gen-studio" theo mặc định docker compose ⇒ đạp container/volume prod
    { echo "COMPOSE_PROJECT_NAME=gen-studio-dev"; echo "GS_VERSION=dev"; } > "$GHOME/genlabs/Gen-Studio/.env"
    chown "$U:$U" "$GHOME/genlabs/Gen-Studio/.env"; chmod 600 "$GHOME/genlabs/Gen-Studio/.env"
    # install.sh sẽ tự ghi đè GS_VERSION theo file VERSION trong repo (giống hệt prod) ⇒ export lại qua biến môi
    # trường shell: biến môi trường thắng giá trị trong .env khi docker compose thay thế ${GS_VERSION}, nên image
    # dev vẫn lên tag "dev" lúc build dù dòng GS_VERSION trong .env bị install.sh sửa lại.
    sudo -u "$U" -H env GS_VERSION=dev bash "$GHOME/genlabs/Gen-Studio/install.sh" --dir "$GHOME/genlabs/Gen-Studio" --port 7491
  fi
fi
unset TOK AUTHHDR

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
sudo -u "$U" -H docker compose up -d studio >/dev/null  # agent do install.sh lo; liệt kê rõ để agent build hỏng không kéo Caddy chết theo

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
touch /var/log/gs-backup.log && chown "$U" /var/log/gs-backup.log && chmod 600 /var/log/gs-backup.log

# 6. kiểm ngay: sao lưu 1 bản + khôi phục thử + đường công khai/đường bị chặn
sudo -u "$U" -H env GS_HOME="$APP" GS_BUCKET="$BUCKET" "$D/backup-offsite.sh"
sudo -u "$U" -H env GS_BUCKET="$BUCKET" "$D/restore-test.sh"

# 7. xưởng: MCP shell cấp cứu — chỉ loopback 127.0.0.1:7777, vào qua đường hầm SSH khi Claude hết quota
# Bọc trong hàm riêng: lỗi bên trong (npm hỏng mạng, systemd, …) chỉ làm bước này bị bỏ qua, không giết cả script.
SHELLMCP_OK=0
setup_shell_mcp() {
  echo "› Xưởng: MCP shell cấp cứu (127.0.0.1:7777)"
  if [ ! -d "$APP/deploy/gcp/shell-mcp" ]; then
    echo "  ⚠ bỏ qua MCP shell (nhánh chưa có deploy/)"
    return 0
  fi
  if ! command -v node >/dev/null 2>&1; then
    echo "  ⚠ Chưa có node — bỏ qua MCP shell cấp cứu (bước 1.5 lẽ ra đã cài)"
    return 0
  fi
  if [ ! -f "$D/shell-token" ]; then
    head -c 32 /dev/urandom | base64 | tr '+/' '-_' | tr -d '=\n' > "$D/shell-token"
    chmod 600 "$D/shell-token"; chown "$U" "$D/shell-token"
  fi
  mkdir -p "$D/shell-mcp"
  if command -v rsync >/dev/null 2>&1; then
    rsync -a --delete "$APP/deploy/gcp/shell-mcp/" "$D/shell-mcp/"
  else
    rm -rf "$D/shell-mcp" && mkdir -p "$D/shell-mcp" && cp -a "$APP/deploy/gcp/shell-mcp/." "$D/shell-mcp/"
  fi
  chown -R "$U:$U" "$D/shell-mcp"
  if [ -f "$D/shell-mcp/package-lock.json" ]; then
    sudo -u "$U" -H npm --prefix "$D/shell-mcp" ci --omit=dev >/dev/null \
      || { echo "  ⚠ npm ci hỏng — bỏ qua MCP shell"; return 0; }
  else
    sudo -u "$U" -H npm --prefix "$D/shell-mcp" install --omit=dev >/dev/null \
      || { echo "  ⚠ npm ci hỏng — bỏ qua MCP shell"; return 0; }
  fi
  touch /var/log/gs-shell-mcp.log && chown "$U" /var/log/gs-shell-mcp.log && chmod 600 /var/log/gs-shell-mcp.log

  cat > /etc/systemd/system/gs-shell-mcp.service <<EOF
[Unit]
Description=Gen-Studio MCP shell cấp cứu (chỉ 127.0.0.1:7777)
After=network.target

[Service]
User=$U
WorkingDirectory=$D/shell-mcp
ExecStart=/usr/bin/node server.mjs
Environment=GS_SHELL_TOKEN_FILE=$D/shell-token
Environment=GS_SHELL_LOG=/var/log/gs-shell-mcp.log
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF
  systemctl daemon-reload
  systemctl enable --now gs-shell-mcp >/dev/null

  for _ in $(seq 1 20); do curl -s -o /dev/null --max-time 2 -X POST http://127.0.0.1:7777/mcp && break; sleep 1; done
  TOK="$(cat "$D/shell-token")"
  code_ok="$(curl -s -o /dev/null -w '%{http_code}' -X POST http://127.0.0.1:7777/mcp \
    -H "Authorization: Bearer $TOK" -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
    -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"setup-vm","version":"0"}}}')" || code_ok=000
  code_bad="$(curl -s -o /dev/null -w '%{http_code}' -X POST http://127.0.0.1:7777/mcp \
    -H 'Authorization: Bearer sai-token' -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
    -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}')" || code_bad=000
  if [ "$code_ok" = 200 ] && [ "$code_bad" = 401 ]; then
    echo "  ✓ MCP shell cấp cứu đang chạy (token đúng → 200, token sai → 401)"
    SHELLMCP_OK=1
  else
    echo "  ⚠ MCP shell cấp cứu kiểm chưa đạt (token đúng → $code_ok, token sai → $code_bad) — xem: journalctl -u gs-shell-mcp -n 50"
  fi
}
[ "$WORKSHOP" = 1 ] && { setup_shell_mcp || echo "⚠ MCP shell chưa lên — xem /var/log/gs-shell-mcp.log"; }

echo
echo "✓ Gen-Studio đã cài — https://$HOST"
echo "  MCP cho Muse:  https://$HOST/mcp"
echo "  Mật khẩu cổng (trình duyệt hỏi khi mở UI): user = owner"
if [ "${NEWPW:-0}" = 1 ]; then echo "  pass = $(cat "$D/gate-password")   ← cất vào trình quản lý mật khẩu"; fi
echo "  Xem lại mật khẩu cổng bất cứ lúc nào: sudo cat $D/gate-password"
echo "  Khoá chủ (GS_MASTER_KEY) KHÔNG nằm trong sao lưu: sudo cat $APP/data/.env → cất vào trình quản lý mật khẩu."
if ! curl -fsS "http://127.0.0.1:$PORT/api/setup/state" 2>/dev/null | grep -q '"owner":true'; then
  echo "  Thiết lập lần đầu: https://$HOST/#/setup?k=$(cat "$APP/data/run/admin-key" 2>/dev/null)"
fi
echo "  Cập nhật prod sau này: sudo bash /opt/gs-deploy/setup-vm.sh (hỏi token)"
echo "    hoặc trong xưởng (cần genstudio đã gh auth setup-git): cd /opt/gen-studio && git pull --ff-only && bash install.sh --dir /opt/gen-studio"
if [ "$SHELLMCP_OK" = 1 ]; then
  echo "  MCP shell cấp cứu: chỉ 127.0.0.1:7777 · token: sudo cat /opt/gs-deploy/shell-token · nối từ máy Ryan: bash deploy/gcp/tunnel-local.sh --install"
fi

if [ "$WORKSHOP" = 1 ]; then
  echo
  echo "› Xưởng đã sẵn sàng trên máy này. Làm 1 lần:"
  echo "  1) sudo -iu genstudio   rồi  gh auth login   rồi  gh auth setup-git   (đẩy GitHub bằng token đọc+ghi)"
  echo "  2) claude login   (đăng nhập Claude Code, một lần)"
  echo "  3) vào xưởng:  sudo -iu genstudio tmux new -A -s gen"
  echo "     rồi:        cd ~/genlabs/Second-Brain && claude --add-dir ../Gen-Studio"
  echo "  Xem dev stack (cổng 7491, chỉ 127.0.0.1) — chạy lệnh này ở Cloud Shell/máy Ryan (không phải trên VM):"
  echo "    gcloud compute ssh $VMNAME --zone $VMZONE --ssh-flag=\"-L 7491:127.0.0.1:7491\""
fi

echo "› Kiểm rào metadata cho container"
iptables -N DOCKER-USER 2>/dev/null || true
iptables -C DOCKER-USER -d 169.254.169.254/32 -j REJECT 2>/dev/null \
  || iptables -I DOCKER-USER -d 169.254.169.254/32 -j REJECT 2>/dev/null || true
# phải gọi đúng đường có header, nếu không metadata trả 403 ⇒ tưởng nhầm là đã chặn
if docker run --rm --entrypoint sh "$CADDY" -c \
     "wget -q -T2 --header='Metadata-Flavor: Google' -O- http://169.254.169.254/computeMetadata/v1/instance/id" >/dev/null 2>&1; then
  echo "  ⚠ container VẪN gọi được metadata server — token sao lưu có thể bị container lấy. Xử lý trước khi mở cho người ngoài."
else
  echo "  ✓ container không gọi được metadata server"
fi

echo "› Đợi chứng chỉ HTTPS…"
for _ in $(seq 1 30); do curl -fsS -o /dev/null "https://$HOST/.well-known/oauth-authorization-server" && break; sleep 4; done
code_pub="$(curl -s -o /dev/null -w '%{http_code}' "https://$HOST/.well-known/oauth-authorization-server")"
code_ui="$(curl -s -o /dev/null -w '%{http_code}' "https://$HOST/")"
code_api="$(curl -s -o /dev/null -w '%{http_code}' "https://$HOST/api/health")"
echo "  công khai /.well-known → $code_pub (cần 200) · UI / → $code_ui (cần 401) · /api → $code_api (cần 401)"
[ "$code_pub" = 200 ] && [ "$code_ui" = 401 ] && [ "$code_api" = 401 ] || { echo "✗ Kiểm đường không đạt — xem: docker logs gs-caddy" >&2; exit 1; }

echo "✓ Tất cả đạt."
