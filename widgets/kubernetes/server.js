// CPU and memory of a cluster: capacity from /api/v1/nodes (allocatable), usage from the
// metrics API (metrics.k8s.io, from metrics-server). Uses the pod's service account, like
// discovery, or the connection in the options (kubernetes.yaml mode: default fills them in from
// a kubeconfig); RBAC needs get/list on nodes and nodes.metrics.k8s.io.
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';

// Replaceable in tests: the service account folder and the API address (default from the env).
export const PATHS = { sa: '/var/run/secrets/kubernetes.io/serviceaccount', api: null };

function apiUrl() {
  if (PATHS.api) return PATHS.api;
  const host = process.env.KUBERNETES_SERVICE_HOST;
  if (!host) throw new Error('not running in a Kubernetes cluster (KUBERNETES_SERVICE_HOST is not set)');
  return `https://${host.includes(':') ? `[${host}]` : host}:${process.env.KUBERNETES_SERVICE_PORT ?? 443}`;
}

function get(path, signal) {
  const url = new URL(path, apiUrl());
  const token = fs.readFileSync(`${PATHS.sa}/token`, 'utf8').trim();
  const secure = url.protocol === 'https:';
  const ca = secure && fs.existsSync(`${PATHS.sa}/ca.crt`) ? fs.readFileSync(`${PATHS.sa}/ca.crt`) : undefined;
  return new Promise((resolve, reject) => {
    const req = (secure ? https : http).request(url, { headers: { authorization: `Bearer ${token}`, accept: 'application/json' }, ca, signal }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        if (res.statusCode !== 200) return reject(new Error(`Kubernetes API ${path} answered ${res.statusCode}`));
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString()));
        } catch (err) {
          reject(err);
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

/** A CPU quantity ("4", "250m", "123456789n") in cores. */
export function cores(q) {
  const m = /^([\d.]+)([numk]?)$/.exec(String(q ?? '').trim());
  if (!m) return 0;
  return Number(m[1]) * ({ n: 1e-9, u: 1e-6, m: 1e-3, k: 1e3, '': 1 }[m[2]]);
}

/** A memory quantity ("16Gi", "16384Ki", "1G", "1048576") in bytes. */
export function bytes(q) {
  const m = /^([\d.]+)([KMGTPE]i?)?$/.exec(String(q ?? '').trim());
  if (!m) return 0;
  const exp = { K: 1, M: 2, G: 3, T: 4, P: 5, E: 6 }[m[2]?.[0]] ?? 0;
  return Number(m[1]) * (m[2]?.endsWith('i') ? 1024 : 1000) ** exp;
}

/** GET through ctx.fetch with a connection in the options (a kubeconfig, filled in by the dashboard). */
async function getWith(ctx, path) {
  const { token, username, password, tlsCa, tlsCert, tlsKey, insecure } = ctx.options;
  const authorization = token ? `Bearer ${token}` : username ? `Basic ${Buffer.from(`${username}:${password ?? ''}`).toString('base64')}` : null;
  // joined, not resolved: an API server can sit under a path (Rancher's /k8s/clusters/<id>)
  const res = await ctx.fetch(`${ctx.options.url.replace(/\/+$/, '')}${path}`, {
    headers: { accept: 'application/json', ...(authorization ? { authorization } : {}) },
    ...(tlsCa || tlsCert ? { tls: { ca: tlsCa, cert: tlsCert, key: tlsKey } } : {}),
    insecure,
  });
  if (!res.ok) throw new Error(`Kubernetes API ${path} answered ${res.status}`);
  return res.json();
}

const pct = (used, total) => (total > 0 ? Math.round((1000 * used) / total) / 10 : null);

export default {
  async fetch(ctx) {
    const cluster = { show: true, cpu: true, memory: true, showLabel: true, label: 'cluster', ...(ctx.options.cluster ?? {}) };
    const nodeOpts = { show: true, cpu: true, memory: true, showLabel: true, ...(ctx.options.nodes ?? {}) };
    const load = (path) => (ctx.options.url ? getWith(ctx, path) : get(path, ctx.signal));
    const [nodeList, metricList] = await Promise.all([
      load('/api/v1/nodes'),
      load('/apis/metrics.k8s.io/v1beta1/nodes').catch((err) => {
        ctx.log.warn(`kubernetes metrics: ${err.message} (is metrics-server installed?)`);
        return { items: [] };
      }),
    ]);
    const usage = new Map((metricList.items ?? []).map((m) => [m.metadata?.name, m.usage ?? {}]));
    const nodes = (nodeList.items ?? []).map((n) => {
      const name = n.metadata?.name ?? '?';
      const alloc = n.status?.allocatable ?? {};
      const u = usage.get(name);
      const ready = (n.status?.conditions ?? []).some((c) => c.type === 'Ready' && c.status === 'True');
      return {
        name,
        ready,
        cpu: { used: u ? cores(u.cpu) : null, total: cores(alloc.cpu) },
        memory: { used: u ? bytes(u.memory) : null, total: bytes(alloc.memory) },
      };
    });
    const sum = (kind, part) => nodes.reduce((s, n) => s + (n[kind][part] ?? 0), 0);
    const measured = nodes.some((n) => n.cpu.used !== null);
    const total = {
      cpu: { used: measured ? sum('cpu', 'used') : null, total: sum('cpu', 'total') },
      memory: { used: measured ? sum('memory', 'used') : null, total: sum('memory', 'total') },
    };
    const blocks = [];
    if (cluster.show && cluster.cpu) blocks.push({ key: 'cpu', label: 'cpu', value: total.cpu.used === null ? null : pct(total.cpu.used, total.cpu.total), unit: '%' });
    if (cluster.show && cluster.memory) blocks.push({ key: 'memory', label: 'memory', value: total.memory.used === null ? null : pct(total.memory.used, total.memory.total), unit: '%' });
    blocks.push({ key: 'nodes', label: 'nodes', value: nodes.length }, { key: 'ready', label: 'ready', value: nodes.filter((n) => n.ready).length });
    return { blocks, cluster: { ...cluster, ...total }, nodeOptions: nodeOpts, nodes: nodeOpts.show ? nodes : [] };
  },
};
