# © 2026 Gen Labs — All rights reserved.
# Image `studio`: máy chủ + dựng hình (Chromium) + trộn (ffmpeg). Không npm ở runtime. Chạy user không root.
FROM node:22-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update \
 && apt-get install -y --no-install-recommends chromium ffmpeg fonts-noto-core fontconfig ca-certificates curl \
 && rm -rf /var/lib/apt/lists/*

# Font OFL (ASSET_MANIFEST): IBM Plex Sans/Mono, Be Vietnam Pro, Patrick Hand — vendor trong repo (vendor/fonts, ghim commit google/fonts),
# không tải mạng lúc build: cài được cả khi mạng chập chờn/sau proxy, và bản dựng nào cũng cùng phông.
COPY vendor/fonts/ /tmp/gs-fonts/
RUN set -eux; d=/usr/share/fonts/truetype/gen-studio; mkdir -p "$d"; \
    cp /tmp/gs-fonts/*/*.ttf "$d/"; rm -rf /tmp/gs-fonts; fc-cache -f

WORKDIR /app
COPY . /app
# trang sân khấu của Chromium dùng font cục bộ (không phụ thuộc mạng)
RUN mkdir -p /app/render/stage/fonts && cp /usr/share/fonts/truetype/gen-studio/*.ttf /app/render/stage/fonts/ \
 && mkdir -p /data && chown -R node:node /data /app

ENV NODE_ENV=production \
    DATA_DIR=/data \
    GS_HOST=0.0.0.0 \
    GS_PORT=7490 \
    GS_CHROMIUM_PATH=/usr/bin/chromium \
    GS_FFMPEG_PATH=/usr/bin/ffmpeg \
    HOME=/tmp

USER node
VOLUME /data
EXPOSE 7490
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.GS_PORT||7490)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/main.js"]
