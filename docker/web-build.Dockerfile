# syntax=docker/dockerfile:1
# Production Next.js build inside Linux (avoids Windows FAT32/exFAT readlink / webpack EISDIR).
# From repo root:  docker build -f docker/web-build.Dockerfile -t pos-web-build:local .

FROM node:22-bookworm-slim AS web-build

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /repo

COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY apps ./apps

WORKDIR /repo/apps/web

ENV NEXT_TELEMETRY_DISABLED=1

RUN npm ci
RUN npm run build
