#!/usr/bin/env bash
# © 2026 Gen Labs — All rights reserved.
# Tách nền chroma (#00B140, Veo trả ~#01B141) → ghép lên nền → nối 3 clip bằng cắt thẳng (crossfade 0).
# Bỏ khung cuối của mỗi clip (khung cuối ≈ khung đầu ≈ ảnh trung tính) để vòng lặp không đứng hình 1 khung.
# Dùng: bash src/loop.sh <nền.png> <ra.mp4> clip1.mp4 clip2.mp4 clip3.mp4 ...
set -euo pipefail
BG=$1; OUT=$2; shift 2
KEY="chromakey=0x01B141:similarity=0.13:blend=0.05"   # không despill: viền trắng của sticker đã chặn loang xanh; despill làm nơ vàng ngả cam
inputs=(); fc=""; i=0
for c in "$@"; do
  inputs+=(-i "$c")
  fc+="[$i:v]trim=end_frame=95,setpts=PTS-STARTPTS,format=yuva420p,$KEY[k$i];"
  i=$((i+1))
done
n=$i
cat=""; for ((j=0;j<n;j++)); do cat+="[k$j]"; done
fc+="${cat}concat=n=$n:v=1:a=0[fg];[$n:v]scale=1280:720,format=yuv420p[bg];[bg][fg]overlay=0:0:shortest=1,format=yuv420p[v]"
ffmpeg -loglevel error -y "${inputs[@]}" -loop 1 -framerate 24 -i "$BG" -filter_complex "$fc" -map "[v]" -r 24 -c:v libx264 -crf 18 -preset medium -movflags +faststart "$OUT"
echo "wrote $OUT"
