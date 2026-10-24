# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci
COPY prisma ./prisma
RUN npx prisma generate
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build \
 && npx tsc prisma/seed.ts --outDir dist/prisma --module commonjs --target es2022 --esModuleInterop --skipLibCheck \
 && npm prune --omit=dev

FROM node:22-bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/* && useradd -r -u 1001 app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY package.json ./
RUN mkdir -p /data/uploads && chown -R app /data/uploads
USER app
ENV UPLOAD_DIR=/data/uploads
EXPOSE 4000
# Apply migrations, then start
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
