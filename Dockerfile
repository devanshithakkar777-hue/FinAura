# ---- web build ----
FROM node:22-alpine AS web
WORKDIR /app/finaura
COPY finaura/package*.json ./
RUN npm ci
COPY finaura/ ./
RUN npm run build

# ---- API deps ----
FROM node:22-alpine AS deps
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci --omit=dev

# ---- runtime ----
FROM node:22-alpine
ENV NODE_ENV=production SERVE_WEB=true PORT=8080
WORKDIR /app/server
COPY --from=deps /app/server/node_modules ./node_modules
COPY server/ ./
COPY --from=web /app/finaura/dist /app/finaura/dist
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:8080/health || exit 1
CMD ["node", "src/index.js"]
