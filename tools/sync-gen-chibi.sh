#!/usr/bin/env bash
# © 2026 Gen Labs — All rights reserved.
# Đồng bộ engine Gen-Chibi vào vendor/gen-chibi/ (khoá phiên bản; không sửa tay trong vendor).
# Dùng: tools/sync-gen-chibi.sh <đường dẫn Gen-Chibi> [phiên bản mong đợi, mặc định 0.25.1]
set -euo pipefail
src="${1:?cần đường dẫn Gen-Chibi}"
want="${2:-0.25.1}"
dst="$(cd "$(dirname "$0")/.." && pwd)/vendor/gen-chibi"
have="$(tr -d '[:space:]' < "$src/VERSION")"
[[ "$have" == "$want" ]] || { echo "Gen-Chibi là $have, vendor khoá $want — sửa ASSET_MANIFEST rồi truyền phiên bản mới" >&2; exit 1; }
files=(engine/core.js engine/i18n.js engine/voices.js engine/sounds.js engine/audio.js engine/choreo.js
       kinds/character/gen.core.js kinds/khung/gen.khung.js kinds/character/gen.choreo.js)
rm -rf "$dst"; mkdir -p "$dst"
for f in "${files[@]}"; do mkdir -p "$dst/$(dirname "$f")"; cp "$src/$f" "$dst/$f"; done
cp "$src/VERSION" "$dst/VERSION"
echo "đã chép ${#files[@]} tệp Gen-Chibi $have vào $dst"
