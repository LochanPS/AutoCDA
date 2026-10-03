# AutoCDA Verification API — small always-on Node service.
# ngspice runs server-side (wasm inside eecircuit-engine); no native/system deps.
FROM node:20-alpine

WORKDIR /app
ENV NODE_ENV=production

# Install deps first for layer caching. No devDependencies in this project,
# so --omit=dev installs exactly the runtime set.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

# App source the API reuses (design/verify/spec/sim) + the server itself.
COPY server ./server
COPY src ./src

# Hosts (Render/Railway/Fly) inject PORT; apiServer reads process.env.PORT.
ENV PORT=3002
EXPOSE 3002

# Container-level health probe hits the unauthenticated, unthrottled endpoint.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT:-3002}/api/health" >/dev/null 2>&1 || exit 1

CMD ["npm", "run", "verify-api"]
