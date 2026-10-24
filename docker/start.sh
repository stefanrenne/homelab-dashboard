#!/bin/sh
# Entrypoint of the image. Started as root (the default), it gives the `node` user the group of
# a mounted Docker socket, so `-v /var/run/docker.sock:/var/run/docker.sock:ro` works without
# --group-add, and then runs the dashboard as `node`. Started as another user (--user 1000,
# Kubernetes runAsUser), it skips that and runs the dashboard directly.
set -e

if [ "$(id -u)" = 0 ]; then
  socket=/var/run/docker.sock   # DEFAULT_SOCKET in src/discovery/docker.js
  if [ -S "$socket" ]; then
    gid=$(stat -c %g "$socket")
    group=$(getent group "$gid" | cut -d: -f1)
    if [ -z "$group" ]; then
      group=docker-host
      addgroup -g "$gid" "$group"
    fi
    addgroup node "$group" 2>/dev/null || true
  fi
  exec su-exec node "$0" "$@"
fi

# Start with the example config when /config is empty.
if [ -z "$(ls -A /config 2>/dev/null)" ]; then cp -r /app/config.example/. /config/; fi
exec node /app/src/server.js "$@"
