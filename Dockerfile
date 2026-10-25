# homelab-dashboard: one Node process, config in /config.
# An LTS line (even major). Dependabot only bumps within it; a new LTS is a manual change.
FROM node:24-alpine

# git: installs widget packages from git sources. iputils-ping: the ping widget
# (busybox ping needs root; iputils' ping works for the unprivileged user). su-exec: the
# entrypoint drops from root to `node` after giving it the Docker socket's group.
# bash, curl, jq, docker-cli, docker-cli-compose: for the scripts a button widget runs.
RUN apk add --no-cache git iputils-ping tini su-exec bash curl jq docker-cli docker-cli-compose

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY src ./src
COPY public ./public
COPY config.example ./config.example

# The version reported by /api/health: 1.2.3 for a release, main-<sha> for other builds (CI sets it).
ARG VERSION=dev
ENV HD_VERSION=${VERSION} \
    NODE_ENV=production \
    HD_CONFIG_DIR=/config \
    PORT=3000 \
    HOST=0.0.0.0

# docker/start.sh: Docker socket group, then the dashboard as `node` (never as root).
COPY docker/start.sh /usr/local/bin/start
RUN mkdir -p /config && chown node:node /config && chmod +x /usr/local/bin/start

VOLUME /config
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD wget -qO- http://127.0.0.1:3000/api/health >/dev/null || exit 1
ENTRYPOINT ["/sbin/tini", "--", "start"]
