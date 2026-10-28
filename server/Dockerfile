# Build context is the repo root (the server also serves consultoria-ia.html and chat-widget.js).
# Stage 1 builds the DeepSeek Harness at the pinned tag and provisions the `sdk` profile.
FROM node:24-bookworm AS harness
ARG DSH_TAG=dsh-v0.2.2-alpha.2
ENV CI=1 DSH_HOME=/opt/dsh/.dsh-home
RUN git clone --depth 1 --branch ${DSH_TAG} https://github.com/deepseek-ai/deepseek-harness.git /opt/dsh
WORKDIR /opt/dsh
RUN corepack enable && corepack prepare pnpm@11.28.5 --activate \
 && pnpm install --frozen-lockfile && pnpm run build
RUN node apps/cli/lib/bin.js plugin --profile sdk add @deepseek-ai/dsh-sdk-app
WORKDIR /opt/dsh/.dsh-home/profiles/sdk
COPY server/scripts/link-profile.cjs /tmp/link-profile.cjs
RUN node /tmp/link-profile.cjs && pnpm install --ignore-workspace

FROM node:24-bookworm-slim
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8787 \
    DSH_HARNESS=/opt/dsh DSH_HOME=/opt/dsh/.dsh-home
# curl: Coolify's container health check shells out to it.
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
COPY --from=harness /opt/dsh /opt/dsh
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev
COPY server/src ./src
COPY server/public ./public
COPY consultoria-ia.html chat-widget.js /app/
RUN chown -R node:node /opt/dsh/.dsh-home /app
USER node
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s CMD node -e "fetch('http://127.0.0.1:8787/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "src/server.mjs"]
