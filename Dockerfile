FROM node:26-alpine AS dependencies
WORKDIR /app
RUN apk upgrade --no-cache
COPY package.json package-lock.json ./
RUN npm ci --omit=dev \
    && npm cache clean --force

FROM node:26-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

RUN apk upgrade --no-cache \
    && rm -rf /usr/local/lib/node_modules/npm \
              /usr/local/bin/npm \
              /usr/local/bin/npx \
              /usr/local/bin/corepack \
              /usr/local/bin/yarn \
              /usr/local/bin/yarnpkg \
              /root/.npm \
    && addgroup -S -g 1001 app \
    && adduser -S -D -H -u 1001 -G app app

COPY --from=dependencies --chown=1001:1001 /app/node_modules ./node_modules
COPY --chown=1001:1001 package.json package-lock.json server.js ./
COPY --chown=1001:1001 public ./public
# Idempotent upgrades for a one-shot schema-upgrade service that runs this image with owner credentials.
COPY --chown=1001:1001 scripts/schema-upgrades ./scripts/schema-upgrades

USER 1001:1001
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://<scrubbed-url-domain>/readyz >/dev/null || exit 1
CMD ["node", "server.js"]
