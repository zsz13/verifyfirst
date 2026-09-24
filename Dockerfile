# syntax=docker/dockerfile:1
FROM node:22.22.0-bookworm-slim AS build
WORKDIR /app
# TrueForge's SQLite binding compiles on architectures without a prebuilt binary.
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY apps/web/package.json ./apps/web/package.json
RUN npm ci
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22.22.0-bookworm-slim AS runtime
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
COPY --from=build --chown=node:node /app /app
RUN mkdir -p /var/lib/verifyfirst /var/lib/trueforge \
    && chown node:node /var/lib/verifyfirst /var/lib/trueforge \
    && chmod 700 /var/lib/verifyfirst /var/lib/trueforge
USER node
# Node strips the wrapper's TypeScript natively; skipping tsx here saves ~60 MB of RSS per
# service. The MCP server still starts under tsx because it uses non-erasable syntax.
ENTRYPOINT ["node", "scripts/container.ts"]
CMD ["web"]
