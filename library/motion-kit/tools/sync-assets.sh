#!/usr/bin/env bash
# Chép SFX / nhạc / ảnh nhân vật từ thư viện (../sfx ../music ../characters) vào public/ để Remotion staticFile() đọc được.
# Bản sao không commit (xem .gitignore) — nguồn sự thật là thư mục gốc của asset-lib.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p public/sfx public/music public/characters
cp ../audio/sfx/synth/*.wav public/sfx/
cp ../audio/music/procedural/*.flac public/music/
cp ../characters/nhi/stills/*.png ../characters/vy/stills/*.png public/characters/
mkdir -p public/lib && rm -rf public/lib/audio && mkdir -p public/lib/audio && cp -r ../audio/sfx ../audio/music public/lib/audio/
mkdir -p public/clips && cp ../characters/*/clips/*.webm public/clips/
echo "synced: $(ls public/sfx | wc -l) sfx, $(ls public/music | wc -l) music, $(ls public/characters | wc -l) character png"
