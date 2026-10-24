# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG VITE_BRAND_NAME="YJ Creator Studio"
ENV VITE_BRAND_NAME=$VITE_BRAND_NAME
RUN npm run build

FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.container.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
