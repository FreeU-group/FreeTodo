FROM node:20.19.2-alpine3.21 AS base

# Stage 1: Install dependencies
FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml ./

RUN corepack enable pnpm
RUN pnpm config set registry https://registry.npmmirror.com
RUN pnpm install --frozen-lockfile

# Stage 2: Build the application
FROM base AS builder
WORKDIR /app

ARG NEXT_PUBLIC_API_URL
ARG API_REWRITE_URL

ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV API_REWRITE_URL=${API_REWRITE_URL:-${NEXT_PUBLIC_API_URL}}

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN corepack enable pnpm
RUN pnpm config set registry https://registry.npmmirror.com

RUN pnpm build

# Stage 3: Production server
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

EXPOSE 3001

CMD ["node", "server.js"]
