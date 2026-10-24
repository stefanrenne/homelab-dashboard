# homelab-dashboard: one Node process, config in /config.
FROM node:25-alpine

# git: installs widget packages from git sources. iputils-ping: the ping widget
# (busybox ping needs root; iputils' ping works for the unprivileged user).
RUN apk add --no-cache git iputils-ping tini

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY src ./src
COPY public ./public
COPY widgets ./widgets
COPY config.example ./config.example

# The version reported by /api/health: 1.2.3 for a release, main-<sha> for other builds (CI sets it).
ARG VERSION=dev
ENV HD_VERSION=${VERSION} \
    NODE_ENV=production \
    HD_CONFIG_DIR=/config \
    PORT=3000 \
    HOST=0.0.0.0

# Start with the example config when /config is empty.
RUN mkdir -p /config && chown node:node /config \
 && printf '#!/bin/sh\nset -e\nif [ -z "$(ls -A /config 2>/dev/null)" ]; then cp -r /app/config.example/. /config/; fi\nexec node /app/src/server.js "$@"\n' > /usr/local/bin/start \
 && chmod +x /usr/local/bin/start

USER node
VOLUME /config
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD wget -qO- http://127.0.0.1:3000/api/health >/dev/null || exit 1
ENTRYPOINT ["/sbin/tini", "--", "start"]
