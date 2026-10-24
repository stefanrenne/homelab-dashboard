// The connection to a Kubernetes API: the pod's service account (`mode: cluster`) or a
// kubeconfig file (`mode: default`, as in homepage: $KUBECONFIG, else ~/.kube/config). Only
// what a kubeconfig can hold without running anything: a token, a client certificate or a
// user name and password. Credential plugins (`exec`, `auth-provider`) are refused.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parse } from 'yaml';

export const K8S_SA_DIR = '/var/run/secrets/kubernetes.io/serviceaccount';

export function k8sApiUrl(env = process.env) {
  const host = env.KUBERNETES_SERVICE_HOST;
  if (!host) throw new Error('not running in a Kubernetes cluster (KUBERNETES_SERVICE_HOST is not set)');
  return `https://${host.includes(':') ? `[${host}]` : host}:${env.KUBERNETES_SERVICE_PORT ?? 443}`;
}

/** The kubeconfig to read: kubernetes.yaml `kubeconfig` (relative to the config folder), $KUBECONFIG or ~/.kube/config. */
export function kubeconfigPath({ file, configDir = '.', env = process.env, home = os.homedir() } = {}) {
  if (file) return path.resolve(configDir, file);
  const first = env.KUBECONFIG?.split(path.delimiter).find(Boolean);
  return first ?? path.join(home, '.kube', 'config');
}

/**
 * A kubeconfig's current context (or `context`) as { url, token?, ca?, cert?, key?,
 * username?, password?, insecure? }; files in it are relative to the kubeconfig itself.
 */
export function readKubeconfig(file, { context } = {}) {
  let doc;
  try {
    doc = parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    throw new Error(`kubeconfig ${file}: ${err.code || err.message}`);
  }
  const named = (list, name, what) => {
    const found = (Array.isArray(list) ? list : []).find((x) => x?.name === name);
    if (!found) throw new Error(`kubeconfig ${file}: ${what} "${name}" not found`);
    return found;
  };
  const contextName = context ?? doc?.['current-context'];
  if (!contextName) throw new Error(`kubeconfig ${file}: no current-context`);
  const ctx = named(doc.contexts, contextName, 'context').context ?? {};
  const cluster = named(doc.clusters, ctx.cluster, 'cluster').cluster ?? {};
  const user = ctx.user ? named(doc.users, ctx.user, 'user').user ?? {} : {};
  if (user.exec || user['auth-provider']) {
    throw new Error(`kubeconfig ${file}: user "${ctx.user}" uses a credential plugin, which the dashboard does not run; use a token or a client certificate`);
  }
  const dir = path.dirname(file);
  // `<name>-data` is base64 PEM, `<name>` a file next to the kubeconfig
  const pem = (from, name) => {
    if (from[`${name}-data`]) return Buffer.from(String(from[`${name}-data`]), 'base64').toString('utf8');
    if (from[name]) return fs.readFileSync(path.resolve(dir, String(from[name])), 'utf8');
    return undefined;
  };
  if (!cluster.server) throw new Error(`kubeconfig ${file}: cluster "${ctx.cluster}" has no server`);
  const out = { url: String(cluster.server) };
  const ca = pem(cluster, 'certificate-authority');
  if (ca) out.ca = ca;
  if (cluster['insecure-skip-tls-verify'] === true) out.insecure = true;
  const cert = pem(user, 'client-certificate');
  const key = pem(user, 'client-key');
  if (cert && key) Object.assign(out, { cert, key });
  const token = user.token ?? (user.tokenFile ? fs.readFileSync(path.resolve(dir, String(user.tokenFile)), 'utf8').trim() : undefined);
  if (token) out.token = String(token);
  else if (user.username && user.password) Object.assign(out, { username: String(user.username), password: String(user.password) });
  return out;
}

/** The connection for kubernetes.yaml: { mode, kubeconfig?, context? }. */
export function k8sConnection(config = {}, { configDir = '.', env = process.env, home = os.homedir(), saDir = K8S_SA_DIR } = {}) {
  if (config.mode === 'default') {
    return readKubeconfig(kubeconfigPath({ file: config.kubeconfig, configDir, env, home }), { context: config.context });
  }
  return {
    url: k8sApiUrl(env),
    token: fs.readFileSync(`${saDir}/token`, 'utf8').trim(),
    ...(fs.existsSync(`${saDir}/ca.crt`) ? { ca: fs.readFileSync(`${saDir}/ca.crt`, 'utf8') } : {}),
  };
}

/** The request headers for a connection: a bearer token or basic authentication. */
export function k8sHeaders(conn) {
  if (conn.token) return { authorization: `Bearer ${conn.token}` };
  if (conn.username) return { authorization: `Basic ${Buffer.from(`${conn.username}:${conn.password ?? ''}`).toString('base64')}` };
  return {};
}
