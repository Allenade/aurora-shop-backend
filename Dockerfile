# ================================
# Stage 1: Build
# ================================
FROM node:22-alpine AS builder

RUN npm install -g pnpm@10.15.0

WORKDIR /app

COPY package.json pnpm-lock.yaml ./

RUN pnpm install --frozen-lockfile --ignore-scripts

COPY . .

RUN pnpm run build

# ================================
# Stage 2: Production
# ================================
FROM node:22-alpine AS production

RUN npm install -g pnpm@10.15.0

WORKDIR /app

COPY package.json pnpm-lock.yaml ./

RUN pnpm install --frozen-lockfile --prod --ignore-scripts

COPY --from=builder /app/dist ./dist

ENV NODE_ENV=production

EXPOSE 4000

CMD ["node", "dist/apps/server/main.js"]
