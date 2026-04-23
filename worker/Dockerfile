# syntax=docker/dockerfile:1

FROM node:20-bullseye-slim AS base
WORKDIR /app

# sharp runtime deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    libcairo2 \
    libpango-1.0-0 \
    libjpeg62-turbo \
    libgif7 \
    librsvg2-2 \
    libpixman-1-0 \
    libglib2.0-0 \
    libpng16-16 \
    ca-certificates \
    fonts-wqy-zenhei \
    fonts-wqy-microhei \
    fonts-noto-cjk \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci

COPY . .

ENV NODE_ENV=production
CMD ["npx", "ts-node", "index.ts"]
