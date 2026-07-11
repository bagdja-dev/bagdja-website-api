# Bagdja Website API (NestJS) — build image untuk deploy di Coolify.
# Pola sama dengan service lain di ekosistem Bagdja (lihat app/bagdja-pos/api):
# 2-stage alpine build, tanpa reinstall di stage production (pakai
# node_modules yang sudah di-prune).
#
# CATATAN: base image node:22 (BUKAN node:20) — @supabase/supabase-js versi
# yang dipakai di sini mensyaratkan Node >=22 (EBADENGINE warning di Node 20).

# Stage 1: build + prune dev deps
#
# CATATAN: `npm install`, BUKAN `npm ci` — supaya build tidak gagal kalau
# package-lock.json belum 100% sinkron (mis. optional dependency
# platform-specific yang beda antara mesin dev dan base image Linux ini).
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install --include=dev --no-audit --no-fund
COPY . .
RUN npm run build
RUN npm prune --omit=dev

# Stage 2: production
FROM node:22-alpine AS production
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

# Default; bisa dioverride lewat env var Coolify. Harus cocok dengan
# core/docs/port.md (bagdja-website-api = 5003).
ENV PORT=5003
EXPOSE 5003

# Healthcheck Coolify: GET /health (lihat src/modules/health/health.controller.ts)
#
# CATATAN: entry point di sini `dist/src/main.js` (BUKAN `dist/main.js`
# seperti `start:prod` di package.json) — tsconfig.json tidak set `rootDir`,
# dan `scripts/run-migration.ts` (di luar src/, ikut ter-compile karena ada
# di tsconfig include default) bikin TypeScript hitung common root = folder
# project, jadi struktur src/ tetap dipertahankan di bawah dist/.
CMD ["node", "dist/src/main.js"]
