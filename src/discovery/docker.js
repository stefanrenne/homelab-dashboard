// Docker discovery: containers with a `homelab.name` label become services.
// Only GET calls on the Docker API (hard rule 9).

import http from 'node:http';
import https from 'node:https';
import { serviceFromLabels } from './labels.js';

export const DEFAULT_SOCKET = '/var/run/docker.sock';
export const LABEL_PREFIX = 'homelab.';

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
    const svc = serviceFromLabels(c.Labels ?? {}, LABEL_PREFIX);
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
  const filters = encodeURIComponent(JSON.stringify({ label: [`${LABEL_PREFIX}name`] }));
  const containers = await dockerGet(server, `/containers/json?all=1&filters=${filters}`);
  return servicesFromContainers(containers, server);
}
