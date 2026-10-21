# Render worker image. Fonts are part of the image: a template renders identically only when every
# worker has the same font files, so never rely on whatever the host happens to have installed.
FROM node:22-bookworm-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends fontconfig fonts-noto-core fonts-noto-color-emoji ffmpeg \
 && rm -rf /var/lib/apt/lists/*

# Brand fonts offered in the editor (Poppins, Montserrat, Mukta, Hind ...) go in ./fonts.
COPY fonts/ /usr/share/fonts/truetype/brand/
RUN fc-cache -f

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY schemas ./schemas

ENV NODE_ENV=production PORT=7070 RENDER_CONCURRENCY=4 UV_THREADPOOL_SIZE=8
USER node
EXPOSE 7070
CMD ["node", "src/server.js"]
