FROM node:26-alpine AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev \
    && npm cache clean --force

FROM node:26-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

RUN addgroup -S -g 1001 app \
    && adduser -S -D -H -u 1001 -G app app

COPY --from=dependencies --chown=1001:1001 /app/node_modules ./node_modules
COPY --chown=1001:1001 package.json package-lock.json server.js ./
COPY --chown=1001:1001 public ./public

USER 1001:1001
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://<scrubbed-url-domain>/readyz >/dev/null || exit 1
CMD ["node", "server.js"]
