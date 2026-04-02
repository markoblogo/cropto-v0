FROM node:22-bookworm-slim AS build

WORKDIR /app

# Playwright runtime deps (kept even if IGC is disabled; safe and avoids surprise crashes)
RUN apt-get update && apt-get install -y --no-install-recommends \
  ca-certificates \
  libglib2.0-0 \
  libnss3 \
  libnspr4 \
  libatk1.0-0 \
  libatk-bridge2.0-0 \
  libcups2 \
  libdbus-1-3 \
  libdrm2 \
  libx11-6 \
  libx11-xcb1 \
  libxkbcommon0 \
  libxcomposite1 \
  libxdamage1 \
  libxext6 \
  libxfixes3 \
  libxrandr2 \
  libgbm1 \
  libasound2 \
  libpango-1.0-0 \
  libpangocairo-1.0-0 \
  libcairo2 \
  libatspi2.0-0 \
  libgtk-3-0 \
  fonts-liberation \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

ENV NODE_ENV=production
EXPOSE 8080

CMD ["node","dist/index.js"]
