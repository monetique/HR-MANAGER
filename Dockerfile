# ════════════════════════════════════════════════════════════
# STAGE 1 — Build du frontend React/Vite
# ════════════════════════════════════════════════════════════
FROM node:20-slim AS frontend-builder

WORKDIR /build

COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci

COPY frontend/index.html        ./index.html
COPY frontend/src/              ./src/
COPY frontend/postcss.config.js ./postcss.config.js
COPY frontend/tailwind.config.js ./tailwind.config.js
COPY frontend/vite.config.js    ./vite.config.js
COPY frontend/public/           ./public/

# Build → /build/dist (sera copié dans backend/public via vite.config outDir)
RUN npx vite build --outDir /build/dist --emptyOutDir

# ════════════════════════════════════════════════════════════
# STAGE 2 — Image de production
# ════════════════════════════════════════════════════════════
FROM node:20-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Dépendances backend
COPY backend/package.json backend/package-lock.json* ./
RUN npm ci --omit=dev

# Sources backend
COPY backend/server.js     ./
COPY backend/routes/       ./routes/
COPY backend/db/           ./db/
COPY backend/middleware/   ./middleware/
COPY backend/scripts/      ./scripts/
COPY backend/services/     ./services/
COPY backend/schema.sql    ./schema.sql

# Frontend buildé → public/ (servi par Express)
COPY --from=frontend-builder /build/dist/ ./public/
COPY --from=frontend-builder /build/public/ ./public/

EXPOSE 5005

HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD node -e "require('http').get('http://localhost:5005/api/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "server.js"]

