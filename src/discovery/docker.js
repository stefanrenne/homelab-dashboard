// Docker discovery: containers with a `homelab.name` label become services. Containers
// labelled for homepage (`homepage.name` + `homepage.group`) work too, so an existing
// setup carries over. Only GET calls on the Docker API (hard rule 9).

import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import { serviceFromLabels } from './labels.js';

export const DEFAULT_SOCKET = '/var/run/docker.sock';
export const LABEL_PREFIX = 'homelab.';
export const HOMEPAGE_PREFIX = 'homepage.';

/**
 * With no servers in docker.yaml, a socket mounted at `socket` is used as the server `local`,
 * so mounting /var/run/docker.sock is all it takes. `socket: null` turns this off.
 */
export function withMountedSocket(servers, socket = DEFAULT_SOCKET, exists = fs.existsSync) {
  if (servers.length > 0 || !socket || !exists(socket)) return servers;
  return [{ name: 'local', socket, discover: true, implicit: true }];
}

export function dockerGet(server, path, { timeoutMs = 5000 } = {}) {
  return new Promise((resolve, reject) => {
    const target = server.url ? new URL(path, server.url) : null;
    const options = target
      ? { method: 'GET', timeout: timeoutMs }
      : { method: 'GET', socketPath: server.socket || DEFAULT_SOCKET, path, headers: { host: 'localhost' }, timeout: timeoutMs };
    const lib = target?.protocol === 'https:' ? https : http;
    const req = (target ? lib.request(target, options) : lib.request(options)).on('response', (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString();
        if (res.statusCode !== 200) return reject(new Error(`Docker API ${path} answered ${res.statusCode}`));
        try {
          resolve(JSON.parse(body));
        } catch (err) {
          reject(err);
        }
      });
    });
    req.on('timeout', () => req.destroy(new Error(`Docker API timed out after ${timeoutMs} ms`)));
    req.on('error', reject);
    req.end();
  });
}

/** Pure mapping from `GET /containers/json` output to discovered services. */
export function servicesFromContainers(containers, server) {
  const out = [];
  for (const c of containers) {
    const labels = c.Labels ?? {};
    // homepage only discovers containers that have both a name and a group.
    const svc = labels[LABEL_PREFIX + 'name']
      ? serviceFromLabels(labels, LABEL_PREFIX, server.instanceName)
      : labels[HOMEPAGE_PREFIX + 'group']
        ? serviceFromLabels(labels, HOMEPAGE_PREFIX, server.instanceName)
        : null;
    if (!svc) continue;
    const container = (c.Names?.[0] ?? '').replace(/^\//, '');
    svc.group ??= 'Docker';
    svc.def.container ??= container;
    svc.def.server ??= server.name;
    out.push(svc);
  }
  return out;
}

export async function discoverDocker(server) {
  // Docker's label filter is AND-only, so both prefixes are matched here instead.
  const containers = await dockerGet(server, '/containers/json?all=1');
  return servicesFromContainers(containers, server);
}
