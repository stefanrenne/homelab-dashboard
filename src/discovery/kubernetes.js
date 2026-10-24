// Kubernetes discovery (in the cluster or through a kubeconfig): Ingresses with `homelab.dev/enabled: "true"`
// become services. Needs RBAC to list ingresses; see docs/discovery.md.

import http from 'node:http';
import https from 'node:https';
import { serviceFromLabels } from './labels.js';
import { k8sConnection, k8sHeaders, k8sApiUrl, K8S_SA_DIR } from './kubeconfig.js';

export { k8sApiUrl, K8S_SA_DIR };
export const ANNOTATION_PREFIX = 'homelab.dev/';
export const HOMEPAGE_PREFIX = 'gethomepage.dev/';

/** GET on the Kubernetes API with a connection from k8sConnection(). */
export function k8sGet(path, { connection, timeoutMs = 5000 } = {}) {
  const conn = connection ?? k8sConnection();
  // joined, not resolved: an API server can sit under a path (Rancher's /k8s/clusters/<id>)
  const url = new URL(`${conn.url.replace(/\/+$/, '')}${path}`);
  const secure = url.protocol === 'https:';
  const tls = secure ? { ca: conn.ca, cert: conn.cert, key: conn.key, ...(conn.insecure ? { rejectUnauthorized: false } : {}) } : {};
  return new Promise((resolve, reject) => {
    const req = (secure ? https : http).request(url, { headers: { ...k8sHeaders(conn), accept: 'application/json' }, timeout: timeoutMs, ...tls }, (res) => {
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
    req.on('timeout', () => req.destroy(new Error(`Kubernetes API timed out after ${timeoutMs} ms`)));
    req.on('error', reject);
    req.end();
  });
}

/** Pure mapping from an IngressList to discovered services. */
export function servicesFromIngresses(list, instanceName = null) {
  const out = [];
  for (const ing of list.items ?? []) {
    const ann = ing.metadata?.annotations ?? {};
    const prefix = [ANNOTATION_PREFIX, HOMEPAGE_PREFIX].find((p) => ann[p + 'enabled'] === 'true');
    if (!prefix) continue;
    const labels = { [prefix + 'name']: ing.metadata.name, ...ann };
    const svc = serviceFromLabels(labels, prefix, instanceName);
    svc.group ??= ing.metadata.namespace ?? 'Kubernetes';
    if (!svc.def.href) {
      const rule = ing.spec?.rules?.find((r) => r.host);
      if (rule) {
        const tls = (ing.spec.tls ?? []).some((t) => (t.hosts ?? []).includes(rule.host));
        const p = rule.http?.paths?.[0]?.path ?? '/';
        svc.def.href = `${tls ? 'https' : 'http'}://${rule.host}${p}`;
      }
    }
    out.push(svc);
  }
  return out;
}

/** opts: { config (kubernetes.yaml), instanceName, connection (tests) }. */
export async function discoverKubernetes(opts = {}) {
  const connection = opts.connection ?? k8sConnection(opts.config);
  return servicesFromIngresses(await k8sGet('/apis/networking.k8s.io/v1/ingresses', { connection }), opts.instanceName);
}
