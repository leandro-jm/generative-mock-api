# Mock API: servidor (Fastify, TypeScript rodando direto no Node 24) servindo também o painel já construído.
FROM node:25-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true
RUN corepack enable
WORKDIR /app

FROM base AS build
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @mock/web build
# Só o servidor com as dependências de produção (sem Vite, React, Vitest...).
RUN pnpm --filter @mock/server deploy --prod --legacy /prod/server

FROM base AS runtime
# Fontes usadas para converter as imagens geradas (SVG → PNG).
RUN apt-get update -y && apt-get install -y --no-install-recommends fonts-dejavu-core && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production PORT=4310 DATA_DIR=/app/data WEB_DIST=/app/web
COPY --from=build /prod/server /app/server
COPY --from=build /app/apps/web/dist /app/web
# Banco SQLite, segredo gerado e nada mais: a única pasta gravável, montada como volume.
RUN mkdir -p /app/data && chown node:node /app/data
USER node
WORKDIR /app/server
EXPOSE 4310
VOLUME ["/app/data"]
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:4310/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
# exec direto no node: o SIGTERM do docker stop chega no processo e o SQLite fecha limpo.
CMD ["node", "src/main.ts"]
