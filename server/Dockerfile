# Build context is the repo root (the server also serves consultoria-ia.html and chat-widget.js).
# Stage 1 builds the DeepSeek Harness at the pinned tag and provisions the `sdk` profile.
FROM node:24-bookworm AS harness
ARG DSH_TAG=dsh-v0.2.2-alpha.2
ENV CI=1 DSH_HOME=/opt/dsh/.dsh-home
RUN git clone --depth 1 --branch ${DSH_TAG} https://github.com/deepseek-ai/deepseek-harness.git /opt/dsh
WORKDIR /opt/dsh
RUN corepack enable && corepack prepare pnpm@11.28.5 --activate \
 && pnpm install --frozen-lockfile && pnpm run build
RUN mkdir -p /opt/dsh/.dsh-home/profiles/sdk
WORKDIR /opt/dsh/.dsh-home/profiles/sdk
COPY server/scripts/link-profile.cjs /tmp/link-profile.cjs
RUN node /tmp/link-profile.cjs && pnpm install --ignore-workspace
# Slim the checkout for the VPS (small disk): drop repo history/docs and heavy packages the
# chat agent never loads (other model CLIs, office/browser/diagram/voice tooling).
WORKDIR /opt/dsh
RUN rm -rf .git docs snapshots .agents website benchmarks \
 && cd node_modules/.pnpm \
 && rm -rf @openai+codex* @anthropic-ai+claude-agent-sdk* @deepseek-ai+libreoffice-kit-wasm* \
    chrome-devtools-frontend* mermaid* @trycua* sherpa-onnx* electron* @electron*

FROM node:24-bookworm-slim
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8787 \
    DSH_HARNESS=/opt/dsh DSH_HOME=/opt/dsh/.dsh-home
# curl: Coolify's container health check shells out to it.
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
COPY --from=harness --chown=node:node /opt/dsh /opt/dsh
WORKDIR /app/server
RUN chown node:node /app /app/server
USER node
COPY --chown=node:node server/package.json server/package-lock.json ./
RUN npm ci --omit=dev
COPY --chown=node:node server/src ./src
COPY --chown=node:node server/public ./public
COPY --chown=node:node consultoria-ia.html chat-widget.js /app/
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s CMD node -e "fetch('http://127.0.0.1:8787/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "src/server.mjs"]
