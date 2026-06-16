# Multi-stage Dockerfile for ORR Pulse Ingestor
# Requirement 13.2: Multi-stage Dockerfiles for optimized production images

# --- Stage 1: Install dependencies ---
FROM node:20-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/ingestor/package.json ./apps/ingestor/

RUN npm ci --workspace=apps/ingestor --workspace=packages/shared --include-workspace-root

# --- Stage 2: Build ---
FROM node:20-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=deps /app/apps/ingestor/node_modules ./apps/ingestor/node_modules

COPY package.json tsconfig.json ./
COPY packages/shared ./packages/shared
COPY apps/ingestor ./apps/ingestor

RUN npx tsc --project apps/ingestor/tsconfig.json

# --- Stage 3: Production ---
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=deps /app/apps/ingestor/node_modules ./apps/ingestor/node_modules
COPY --from=builder /app/apps/ingestor/dist ./apps/ingestor/dist
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY package.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/ingestor/package.json ./apps/ingestor/

USER node

CMD ["node", "apps/ingestor/dist/index.js"]
