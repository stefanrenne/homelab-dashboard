// Kubernetes discovery (in-cluster): Ingresses with `homelab.dev/enabled: "true"`
// become services. Needs RBAC to list ingresses; see docs/discovery.md.

import fs from 'node:fs';
import https from 'node:https';
import { serviceFromLabels } from './labels.js';

export const K8S_SA_DIR = '/var/run/secrets/kubernetes.io/serviceaccount';
export const ANNOTATION_PREFIX = 'homelab.dev/';
export const HOMEPAGE_PREFIX = 'gethomepage.dev/';

export function k8sApiUrl(env = process.env) {
  const host = env.KUBERNETES_SERVICE_HOST;
  if (!host) throw new Error('not running in a Kubernetes cluster (KUBERNETES_SERVICE_HOST is not set)');
  return `https://${host.includes(':') ? `[${host}]` : host}:${env.KUBERNETES_SERVICE_PORT ?? 443}`;
}

export function k8sGet(path, { apiUrl = k8sApiUrl(), saDir = K8S_SA_DIR, timeoutMs = 5000 } = {}) {
  const token = fs.readFileSync(`${saDir}/token`, 'utf8').trim();
  const ca = fs.readFileSync(`${saDir}/ca.crt`);
  return new Promise((resolve, reject) => {
    const req = https.request(new URL(path, apiUrl), { headers: { authorization: `Bearer ${token}` }, ca, timeout: timeoutMs }, (res) => {
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

export async function discoverKubernetes(opts = {}) {
  return servicesFromIngresses(await k8sGet('/apis/networking.k8s.io/v1/ingresses', opts), opts.instanceName);
}
