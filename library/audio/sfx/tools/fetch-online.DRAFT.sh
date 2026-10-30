#!/usr/bin/env bash
# © 2026 Gen Labs — All rights reserved (script). Âm thanh tải về giữ giấy phép gốc — xem sfx/online/sources.json.
# Tải bộ SFX "online" (Kenney CC0 + Mixkit Sound Effects Free License), cắt lặng đầu, đổi sang WAV 48 kHz stereo,
# chuẩn hoá đỉnh −1 dBFS (trần RMS −14 dBFS như bộ tổng hợp). Chạy lại được: bash src/fetch-online.sh
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=online; TMP=$(mktemp -d); mkdir -p "$OUT"
UA='Mozilla/5.0'

# ---- Kenney (CC0): lấy link ký tên từ kenney.nl/download-link/<hex("assets/<slug>")>
kenney() { # slug
  local slug=$1 id url
  [ -d "$TMP/k-$slug" ] && return
  id=$(python3 -c "print('assets/$slug'.encode().hex())")
  curl -sS -A "$UA" -c "$TMP/cj" -b "$TMP/cj" "https://kenney.nl/assets/$slug" -o /dev/null
  url=$(curl -sS -A "$UA" -c "$TMP/cj" -b "$TMP/cj" -H "Referer: https://kenney.nl/assets/$slug" "https://kenney.nl/download-link/$id" | python3 -c "import json,sys; print(json.load(sys.stdin)['url'])")
  curl -sSfL -A "$UA" -o "$TMP/$slug.zip" "$url"
  python3 -I -c "import zipfile,sys; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])" "$TMP/$slug.zip" "$TMP/k-$slug"
}
mixkit() { curl -sSf -A "$UA" -o "$TMP/mx-$1.mp3" "https://assets.mixkit.co/active_storage/sfx/$1/$1-preview.mp3"; }

# process <in> <out-name> [trim-seconds] [extra-filter]
process() {
  local in=$1 name=$2 dur=${3:-0} extra=${4:-anull}
  local f="silenceremove=start_periods=1:start_threshold=-50dB,${extra}"
  [ "$dur" != 0 ] && f="$f,atrim=0:$dur,afade=t=out:st=$(python3 -c "print(max(0,$dur-0.15))"):d=0.15"
  ffmpeg -loglevel error -y -i "$in" -af "$f,aresample=48000" -ac 2 -c:a pcm_s16le "$TMP/n.wav"
  python3 -I - "$TMP/n.wav" "$OUT/$name.wav" <<'EOF'
import sys, wave, numpy as np
w = wave.open(sys.argv[1]); a = np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(np.float64) / 32768
g = 10 ** (-1 / 20) / max(1e-9, np.abs(a).max()); a *= g
rms = 20 * np.log10(np.sqrt((a ** 2).mean()) + 1e-12)
if rms > -14: a *= 10 ** ((-14 - rms) / 20)
o = wave.open(sys.argv[2], "wb"); o.setnchannels(2); o.setsampwidth(2); o.setframerate(48000)
o.writeframes((np.clip(a, -1, 1) * 32767).round().astype(np.int16).tobytes())
EOF
}

kenney interface-sounds; kenney impact-sounds; kenney ui-audio
for id in 1489 1490 1486 2358 2357 2356 933 937 2908 948 2870 1530 1386; do mixkit $id; done
K1="$TMP/k-interface-sounds/Audio"; K2="$TMP/k-impact-sounds/Audio"; K3="$TMP/k-ui-audio/Audio"

process "$TMP/mx-1489.mp3" whoosh-soft
process "$TMP/mx-1490.mp3" whoosh-fast
process "$TMP/mx-1486.mp3" whoosh-heavy 3.5
process "$TMP/mx-2358.mp3" pop-1
process "$TMP/mx-2356.mp3" pop-2
process "$TMP/mx-2357.mp3" pop-3
process "$K3/click1.ogg" click
ffmpeg -loglevel error -y -i "$K3/click1.ogg" -i "$K3/click2.ogg" -filter_complex "[1]adelay=85|85[b];[0][b]amix=inputs=2:normalize=0" "$TMP/dbl.wav"; process "$TMP/dbl.wav" double-click
process "$TMP/mx-933.mp3" ding
process "$TMP/mx-937.mp3" chime
process "$K2/impactSoft_heavy_000.ogg" thud
process "$TMP/mx-2908.mp3" impact
process "$K1/tick_002.ogg" tick
process "$TMP/mx-948.mp3" error-buzz
process "$TMP/mx-2870.mp3" success
process "$K1/glitch_001.ogg" glitch
process "$TMP/mx-1530.mp3" paper
process "$TMP/mx-1386.mp3" typing-loop 4
process "$K1/confirmation_002.ogg" confirm-soft
process "$K2/impactPunch_medium_000.ogg" hit-soft
rm -rf "$TMP"
echo "online sfx: $(ls $OUT/*.wav | wc -l) files"
