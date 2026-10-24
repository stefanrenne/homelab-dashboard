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

/**
 * Annotated resources (Ingress, IngressRoute, HTTPRoute) to discovered services. `hrefOf`
 * derives the link when the annotations give none.
 */
export function servicesFromResources(list, instanceName = null, hrefOf = () => null) {
  const out = [];
  for (const res of list.items ?? []) {
    const ann = res.metadata?.annotations ?? {};
    const prefix = [ANNOTATION_PREFIX, HOMEPAGE_PREFIX].find((p) => ann[p + 'enabled'] === 'true');
    if (!prefix) continue;
    const labels = { [prefix + 'name']: res.metadata.name, ...ann };
    const svc = serviceFromLabels(labels, prefix, instanceName);
    svc.group ??= res.metadata.namespace ?? 'Kubernetes';
    if (!svc.def.href) {
      const href = hrefOf(res);
      if (href) svc.def.href = href;
    }
    out.push(svc);
  }
  return out;
}

/** An Ingress's link: its first rule's host and path, https when TLS covers that host. */
export function ingressHref(ing) {
  const rule = ing.spec?.rules?.find((r) => r.host);
  if (!rule) return null;
  const tls = (ing.spec.tls ?? []).some((t) => (t.hosts ?? []).includes(rule.host));
  return `${tls ? 'https' : 'http'}://${rule.host}${rule.http?.paths?.[0]?.path ?? '/'}`;
}

/** Pure mapping from an IngressList to discovered services. */
export function servicesFromIngresses(list, instanceName = null) {
  return servicesFromResources(list, instanceName, ingressHref);
}

/**
 * A Traefik IngressRoute's link from its first route's match: Host(`a`) (or HostSNI) and
 * Path/PathPrefix(`/p`), https with spec.tls. homepage needs an href annotation here; this
 * derives one when it is missing.
 */
export function ingressRouteHref(route) {
  const match = (route.spec?.routes ?? []).map((r) => r.match).find((m) => typeof m === 'string' && /Host\(/.test(m));
  if (!match) return null;
  const host = /Host\(\s*`([^`]+)`/.exec(match)?.[1];
  if (!host || host.includes('*')) return null;
  const p = /Path(?:Prefix)?\(\s*`([^`]+)`/.exec(match)?.[1] ?? '/';
  return `${route.spec.tls ? 'https' : 'http'}://${host}${p}`;
}

/**
 * A Gateway API HTTPRoute's link: its first hostname and first path match (not a regular
 * expression), with the scheme of the Gateway listener it attaches to (`protocols` maps
 * "<namespace>/<gateway>[/<section>]" to http or https), as in homepage.
 */
export function httpRouteHref(route, protocols = new Map()) {
  const host = route.spec?.hostnames?.[0];
  if (!host || host.includes('*')) return null;
  const match = route.spec.rules?.[0]?.matches?.[0]?.path;
  if (match?.type === 'RegularExpression') return null;
  const parent = route.spec.parentRefs?.[0];
  const ns = parent?.namespace ?? route.metadata?.namespace;
  const scheme = parent ? protocols.get(`${ns}/${parent.name}/${parent.sectionName ?? ''}`) ?? 'http' : 'http';
  return `${scheme}://${host}${match?.value ?? '/'}`;
}

/** The scheme of a Gateway's listener: the named section, else the first listener. */
export function listenerScheme(gateway, sectionName) {
  const listeners = gateway?.spec?.listeners ?? [];
  const listener = listeners.find((l) => l.name === sectionName) ?? listeners[0];
  return ['HTTPS', 'TLS'].includes(String(listener?.protocol).toUpperCase()) ? 'https' : 'http';
}

// A resource kind whose CRD is not installed answers 404: nothing to discover there.
const orNone = (err) => {
  if (/answered 404/.test(err.message)) return { items: [] };
  throw err;
};

export const TRAEFIK_GROUPS = ['traefik.io', 'traefik.containo.us'];

/** opts: { config (kubernetes.yaml: ingress, traefik, gateway), instanceName, connection (tests) }. */
export async function discoverKubernetes(opts = {}) {
  const config = opts.config ?? {};
  const connection = opts.connection ?? k8sConnection(config);
  const get = (path) => k8sGet(path, { connection });
  const out = [];
  if (config.ingress !== false) {
    out.push(...servicesFromIngresses(await get('/apis/networking.k8s.io/v1/ingresses'), opts.instanceName));
  }
  if (config.traefik) {
    const seen = new Set();
    for (const group of TRAEFIK_GROUPS) {
      const list = await get(`/apis/${group}/v1alpha1/ingressroutes`).catch(orNone);
      // the same route can be served under both groups during Traefik's migration
      const items = (list.items ?? []).filter((r) => !seen.has(r.metadata?.uid ?? `${r.metadata?.namespace}/${r.metadata?.name}`));
      for (const r of items) seen.add(r.metadata?.uid ?? `${r.metadata?.namespace}/${r.metadata?.name}`);
      out.push(...servicesFromResources({ items }, opts.instanceName, ingressRouteHref));
    }
  }
  if (config.gateway) {
    const routes = await get('/apis/gateway.networking.k8s.io/v1/httproutes').catch(orNone);
    const protocols = new Map();
    for (const route of routes.items ?? []) {
      const parent = route.spec?.parentRefs?.[0];
      if (!parent?.name) continue;
      const ns = parent.namespace ?? route.metadata?.namespace;
      const key = `${ns}/${parent.name}/${parent.sectionName ?? ''}`;
      if (protocols.has(key)) continue;
      const gateway = await get(`/apis/gateway.networking.k8s.io/v1/namespaces/${encodeURIComponent(ns)}/gateways/${encodeURIComponent(parent.name)}`).catch(() => null);
      protocols.set(key, listenerScheme(gateway, parent.sectionName));
    }
    out.push(...servicesFromResources(routes, opts.instanceName, (r) => httpRouteHref(r, protocols)));
  }
  return out;
}
