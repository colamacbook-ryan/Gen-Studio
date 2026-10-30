#!/usr/bin/env bash
# Kiểm bằng mắt: dựng vài khung của một composition rồi ghép thành 1 ảnh lưới.
# Dùng: bash tools/stills.sh <CompositionId> <out.png> <frame> [frame...]   (cần đã `npx remotion bundle --out-dir build`)
set -euo pipefail
cd "$(dirname "$0")/.."
ID=$1; OUT=$2; shift 2
TMP=$(mktemp -d)
for fr in "$@"; do npx remotion still build "$ID" "$TMP/$(printf %05d $fr).png" --frame="$fr" --log=error >/dev/null; done
n=$#; cols=$(( n < 3 ? n : 3 )); rows=$(( (n + cols - 1) / cols ))
ffmpeg -loglevel error -y -pattern_type glob -i "$TMP/*.png" -vf "scale=960:-1,tile=${cols}x${rows}" -frames:v 1 "$OUT"
rm -rf "$TMP"; echo "$OUT"
