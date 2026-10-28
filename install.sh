#!/usr/bin/env bash
# gen-studio — cài một lệnh (Linux, macOS). Không hỏi câu nào; mỗi bước một dòng.
#   curl -fsSL https://raw.githubusercontent.com/colamacbook-ryan/gen-studio/main/install.sh | bash
# Tuỳ chọn: --dir <thư mục> (mặc định ~/gen-studio) · --port <cổng> (7490) · --version vX.Y.Z (mặc định: mới nhất)
# Repo riêng tư: đặt GS_GITHUB_TOKEN (fine-grained, Contents: Read-only); token không bao giờ được in ra hay ghi vào .env.
# © 2026 Gen Labs — All rights reserved.
set -euo pipefail

REPO="colamacbook-ryan/gen-studio"
DIR="$HOME/gen-studio"; PORT=7490; VERSION=""
while [ $# -gt 0 ]; do
  case "$1" in
    --dir) DIR="${2:?--dir cần một thư mục}"; shift 2 ;;
    --port) PORT="${2:?--port cần một cổng}"; shift 2 ;;
    --version) VERSION="${2:?--version cần vX.Y.Z}"; shift 2 ;;
    -h|--help) sed -n 2,6p "$0"; exit 0 ;;
    *) echo "✗ Tuỳ chọn lạ: $1 — chạy: bash install.sh --help" >&2; exit 2 ;;
  esac
done
case "$PORT" in ''|*[!0-9]*) echo "✗ Cổng không hợp lệ: $PORT — dùng số, ví dụ --port 7490" >&2; exit 2 ;; esac

step() { printf '◐ %s\n' "$1"; }
done_() { printf '✓ %s\n' "$1"; }
warn() { printf '⚠ %s\n' "$1" >&2; }
die() { printf '✗ %s\n   → %s\n' "$1" "$2" >&2; exit 1; }

# ---- 1. OS / arch
step "Kiểm hệ điều hành"
OS="$(uname -s)"; ARCH="$(uname -m)"
case "$OS" in Linux|Darwin) ;; *) die "Hệ điều hành $OS chưa hỗ trợ." "dùng Linux hoặc macOS (WSL2 trên Windows)" ;; esac
case "$ARCH" in x86_64|amd64|arm64|aarch64) ;; *) die "Kiến trúc $ARCH chưa hỗ trợ." "dùng máy x86_64 hoặc arm64" ;; esac
done_ "$OS · $ARCH"

# ---- 2. Docker
step "Kiểm Docker"
SUDO=""
if ! command -v docker >/dev/null 2>&1; then
  if [ "$OS" = "Darwin" ]; then
    die "Chưa có Docker." "cài Docker Desktop (https://www.docker.com/products/docker-desktop), mở nó một lần, rồi chạy lại lệnh cài"
  fi
  step "Cài Docker (get.docker.com)"
  [ "$(id -u)" -eq 0 ] || command -v sudo >/dev/null 2>&1 || die "Cần quyền root để cài Docker." "chạy lại với sudo hoặc tự cài Docker trước"
  [ "$(id -u)" -eq 0 ] || SUDO="sudo"
  curl -fsSL https://get.docker.com | $SUDO sh >/dev/null 2>&1 || die "Cài Docker thất bại." "xem https://docs.docker.com/engine/install/ rồi chạy lại"
  $SUDO systemctl enable --now docker >/dev/null 2>&1 || true
fi
if ! docker info >/dev/null 2>&1; then
  if [ "$OS" = "Linux" ] && command -v sudo >/dev/null 2>&1 && sudo docker info >/dev/null 2>&1; then SUDO="sudo"
  else die "Docker chưa chạy hoặc user chưa có quyền." "Linux: sudo usermod -aG docker \$USER rồi đăng nhập lại · macOS: mở Docker Desktop"; fi
fi
docker compose version >/dev/null 2>&1 || $SUDO docker compose version >/dev/null 2>&1 || die "Thiếu docker compose v2." "cài plugin: https://docs.docker.com/compose/install/"
DC() { $SUDO docker compose "$@"; }
done_ "Docker sẵn sàng"

# ---- 3. Mã nguồn
step "Chuẩn bị thư mục $DIR"
mkdir -p "$DIR"
if [ -f "$(dirname "$0")/docker-compose.yml" ] && [ "$(cd "$(dirname "$0")" && pwd)" = "$(cd "$DIR" && pwd)" ]; then
  done_ "Đang chạy trong thư mục cài"
else
  step "Tải bản phát hành"
  AUTH=(); [ -n "${GS_GITHUB_TOKEN:-}" ] && AUTH=(-H "Authorization: Bearer ${GS_GITHUB_TOKEN}")
  if [ -z "$VERSION" ]; then
    VERSION="$(curl -fsSL ${AUTH[@]+"${AUTH[@]}"} "https://api.github.com/repos/$REPO/releases/latest" | sed -n 's/.*"tag_name": *"\([^"]*\)".*/\1/p' | head -1)" \
      || die "Không lấy được bản mới nhất." "kiểm mạng hoặc đặt --version vX.Y.Z"
    [ -n "$VERSION" ] || die "Chưa có bản phát hành nào." "đặt --version vX.Y.Z hoặc đặt GS_GITHUB_TOKEN nếu repo riêng tư"
  fi
  TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
  curl -fsSL ${AUTH[@]+"${AUTH[@]}"} -H "Accept: application/vnd.github+json" -o "$TMP/src.tgz" "https://api.github.com/repos/$REPO/tarball/$VERSION" \
    || die "Tải $VERSION thất bại." "kiểm tên bản (vX.Y.Z) và mạng"
  tar -xzf "$TMP/src.tgz" -C "$DIR" --strip-components=1 || die "Giải nén thất bại." "xoá $DIR rồi chạy lại"
  done_ "Đã tải ${VERSION}"
fi
cd "$DIR"
VER="$(tr -d ' \n' < VERSION 2>/dev/null || echo local)"

# ---- 4. .env (chỉ tạo khi chưa có; giữ nguyên cấu hình cũ)
step "Ghi cấu hình"
if [ ! -f .env ]; then
  { echo "GS_PORT=$PORT"; echo "GS_VERSION=$VER"; echo "GS_UID=$(id -u)"; echo "GS_GID=$(id -g)"; } > .env
  chmod 600 .env
else
  grep -q '^GS_PORT=' .env || echo "GS_PORT=$PORT" >> .env
  [ "$PORT" = 7490 ] || sed -i.bak "s/^GS_PORT=.*/GS_PORT=$PORT/" .env && rm -f .env.bak
  grep -q '^GS_VERSION=' .env && sed -i.bak "s/^GS_VERSION=.*/GS_VERSION=$VER/" .env && rm -f .env.bak || echo "GS_VERSION=$VER" >> .env
fi
# bí mật ghép nội bộ (studio + agent): sinh một lần, giữ nguyên khi cập nhật
grep -q '^GS_PAIRING_SECRET=.' .env || echo "GS_PAIRING_SECRET=gsp_$(head -c 32 /dev/urandom | base64 | tr '+/' '-_' | tr -d '=\n')" >> .env
PORT="$(sed -n 's/^GS_PORT=//p' .env | head -1)"
done_ "Cổng $PORT"

# ---- 5. Khoá thiết lập một lần
step "Sinh khoá thiết lập"
mkdir -p data/run
KEYF="data/run/admin-key"
if [ ! -s "$KEYF" ]; then
  umask 077
  if command -v openssl >/dev/null 2>&1; then openssl rand -hex 24 > "$KEYF"; else head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n' > "$KEYF"; fi
fi
chmod 600 "$KEYF"
done_ "Khoá nằm ở data/run/admin-key"

# ---- 6. Build + chạy
step "Dựng image (lần đầu vài phút)"
DC build studio >/dev/null 2>&1 || { DC build studio 2>&1 | tail -5 >&2; die "Dựng image thất bại." "chạy: cd $DIR && docker compose build studio để xem lỗi đầy đủ"; }
done_ "Image studio sẵn sàng"
# agent nội bộ (runner luôn chạy, chờ chủ xưởng bấm "Bật agent nội bộ"); dựng hỏng thì studio vẫn chạy, báo cách sửa
AGENT=1
step "Dựng image agent (Claude Code CLI)"
if DC build agent >/dev/null 2>&1; then done_ "Image agent sẵn sàng"
else AGENT=0; warn "Chưa dựng được image agent — xưởng vẫn chạy; agent nội bộ bật sau bằng: genstudio update"; fi
step "Khởi động"
if [ "$AGENT" = 1 ]; then DC up -d >/dev/null 2>&1 || die "Không khởi động được." "chạy: cd $DIR && docker compose up để xem lỗi"
else DC up -d studio >/dev/null 2>&1 || die "Không khởi động được." "chạy: cd $DIR && docker compose up studio để xem lỗi"; fi
done_ "Đã chạy nền"

# ---- 7. Healthcheck
step "Chờ máy chủ sẵn sàng"
ok=0
for _ in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1; then ok=1; break; fi
  sleep 2
done
[ "$ok" = 1 ] || die "Máy chủ chưa trả lời sau 2 phút." "xem: cd $DIR && docker compose logs studio"
done_ "Máy chủ khoẻ"

# ---- 8. Cài lệnh genstudio (nếu ghi được)
if [ -f cli/genstudio ]; then
  chmod +x cli/genstudio
  BIN="/usr/local/bin"
  if [ -w "$BIN" ]; then ln -sf "$DIR/cli/genstudio" "$BIN/genstudio" && done_ "Lệnh genstudio ở $BIN"
  else mkdir -p "$HOME/.local/bin" && ln -sf "$DIR/cli/genstudio" "$HOME/.local/bin/genstudio" && done_ "Lệnh genstudio ở ~/.local/bin (thêm vào PATH nếu chưa có)"; fi
fi

echo
echo "Mở liên kết này để thiết lập chủ sở hữu (dùng một lần):"
echo "  http://localhost:$PORT/#/setup?k=$(cat "$KEYF")"
echo "Quản lý: genstudio status · logs · backup · update"
