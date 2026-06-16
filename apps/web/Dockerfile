# Multi-stage Dockerfile for ORR Pulse Web (Next.js)
# Requirement 13.2: Multi-stage Dockerfiles for optimized production images

# --- Stage 1: Install dependencies ---
FROM node:20-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/web/package.json ./apps/web/

RUN npm ci --workspace=apps/web --workspace=packages/shared --include-workspace-root

# --- Stage 2: Build ---
FROM node:20-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules

COPY package.json tsconfig.json ./
COPY packages/shared ./packages/shared
COPY apps/web ./apps/web

RUN npm run build --workspace=apps/web

# --- Stage 3: Production ---
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Next.js standalone output
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public

USER node

EXPOSE 3000

CMD ["node", "apps/web/server.js"]
