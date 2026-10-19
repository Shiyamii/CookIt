# syntax=docker/dockerfile:1

# Bun is the build tool only; the final image runs on Node.
ARG BUN_VERSION=1.3.10
ARG NODE_VERSION=24

FROM oven/bun:${BUN_VERSION} AS manifests
WORKDIR /app
COPY package.json bun.lock bunfig.toml ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/

FROM manifests AS build
RUN bun install --frozen-lockfile --ignore-scripts
COPY . .
RUN bun run build

FROM manifests AS prod-deps
RUN bun install --frozen-lockfile --ignore-scripts --production

FROM node:${NODE_VERSION}-slim AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    STATIC_DIR=./public
WORKDIR /app
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/apps/server/package.json ./apps/server/
COPY --from=build /app/apps/server/dist ./apps/server/dist
COPY --from=build /app/apps/web/dist ./apps/server/public
WORKDIR /app/apps/server
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://localhost:' + process.env.PORT + '/healthz').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "dist/index.js"]
