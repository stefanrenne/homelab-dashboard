import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { servicesFromContainers, discoverDocker, withMountedSocket } from '../src/discovery/docker.js';
import { servicesFromIngresses, k8sApiUrl, discoverKubernetes, ingressRouteHref, httpRouteHref, listenerScheme } from '../src/discovery/kubernetes.js';
import { readKubeconfig, kubeconfigPath, k8sConnection } from '../src/discovery/kubeconfig.js';
import { Discovery, mergeDiscovered } from '../src/discovery/index.js';
import { serviceFromLabels } from '../src/discovery/labels.js';
import { serve, tmpDir, silentLog } from './helpers.mjs';

const containers = JSON.parse(fs.readFileSync(path.resolve('tests/fixtures/docker-containers.json'), 'utf8'));
const ingresses = JSON.parse(fs.readFileSync(path.resolve('tests/fixtures/k8s-ingresses.json'), 'utf8'));

test('labels: fields, nested widget options and JSON values', () => {
  const svc = serviceFromLabels({
    'homelab.name': 'Grafana',
    'homelab.href': 'http://grafana.lan',
    'homelab.weight': '5',
    'homelab.widget.type': 'custom-api',
    'homelab.widget.url': 'http://grafana:3000/api/health',
    'homelab.widget.headers.X-Token': 'abc',
    'homelab.widget.mappings': '[{"field":"version","label":"Version"}]',
    'other.label': 'x',
  }, 'homelab.');
  assert.deepEqual(svc, {
    group: null, name: 'Grafana', weight: 5,
    def: {
      href: 'http://grafana.lan',
      widget: { type: 'custom-api', url: 'http://grafana:3000/api/health', headers: { 'X-Token': 'abc' }, mappings: [{ field: 'version', label: 'Version' }] },
    },
  });
  assert.equal(serviceFromLabels({ 'homelab.group': 'x' }, 'homelab.'), null);
});

test('docker: containers with labels become services with container and server', () => {
  const out = servicesFromContainers(containers, { name: 'local' });
  assert.deepEqual(out.map((s) => [s.group, s.name, s.def.container, s.def.server]), [
    ['Media', 'Plex', 'plex', 'local'],
    ['Docker', 'Uptime Kuma', 'uptime-kuma', 'local'],
    ['Media', 'Radarr', 'radarr', 'local'],
  ]);
  const radarr = out[2];
  assert.equal(radarr.def.widget.type, 'radarr');
  assert.equal(radarr.def.widget.key, '{{HOMEPAGE_VAR_RADARR_KEY}}');
});

test('docker: discovery over a unix socket', async () => {
  const socketPath = path.join(tmpDir('hd-sock-'), 'd.sock');
  let seen;
  const srv = await serve((req, res) => {
    seen = decodeURIComponent(req.url);
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(containers));
  }, { socketPath });
  try {
    const out = await discoverDocker({ name: 'local', socket: socketPath });
    assert.equal(out.length, 3);
    assert.equal(seen, '/containers/json?all=1');
  } finally {
    await srv.close();
  }
});

test('docker: discovery over TLS with a client certificate (dockerd --tlsverify)', async () => {
  const https = await import('node:https');
  const pem = (f) => fs.readFileSync(path.resolve('tests/fixtures/tls', f), 'utf8');
  const daemon = https.createServer({ key: pem('server.key'), cert: pem('server.crt'), ca: pem('ca.crt'), requestCert: true, rejectUnauthorized: true }, (req, res) => {
    res.end(JSON.stringify(req.url.startsWith('/containers/json') ? containers : {}));
  });
  await new Promise((r) => daemon.listen(0, '127.0.0.1', r));
  const url = `https://localhost:${daemon.address().port}`;
  try {
    const services = await discoverDocker({ name: 'remote', url, tls: { ca: pem('ca.crt'), cert: pem('client.crt'), key: pem('client.key') } });
    assert.ok(services.length > 0);
    assert.equal(services[0].def.server, 'remote');
    await assert.rejects(discoverDocker({ name: 'remote', url, tls: { ca: pem('ca.crt') } }), 'without a client certificate the daemon hangs up');
    await assert.rejects(discoverDocker({ name: 'remote', url }), 'the daemon\'s CA is not trusted by default');
  } finally {
    daemon.close();
  }
});

test('docker: a Swarm lists its services, with their (deploy) labels, as in homepage', async () => {
  const socketPath = path.join(tmpDir('hd-sock-'), 'd.sock');
  const srv = await serve((req, res) => {
    assert.equal(req.url, '/services');
    res.end(JSON.stringify([
      { ID: 'a', Spec: { Name: 'media_jellyfin', Labels: { 'homepage.group': 'Media', 'homepage.name': 'Jellyfin', 'homepage.href': 'http://jellyfin.lan', 'com.docker.stack.namespace': 'media' } } },
      { ID: 'b', Spec: { Name: 'media_worker', Labels: { 'com.docker.stack.namespace': 'media' } } },
      { ID: 'c', Spec: { Name: 'tools_grafana', Labels: { 'homelab.name': 'Grafana' } } },
    ]));
  }, { socketPath });
  try {
    const services = await discoverDocker({ name: 'swarm', socket: socketPath, swarm: true });
    assert.deepEqual(services.map((s) => [s.group, s.name, s.def.container, s.def.server]), [
      ['Media', 'Jellyfin', 'media_jellyfin', 'swarm'],
      ['Docker', 'Grafana', 'tools_grafana', 'swarm'],
    ]);
  } finally {
    await srv.close();
  }
});

test('docker: a mounted socket is the server "local" only when docker.yaml has none', () => {
  const yes = () => true;
  const no = () => false;
  const nas = [{ name: 'nas', url: 'http://nas:2375', discover: true }];
  assert.deepEqual(withMountedSocket([], '/var/run/docker.sock', yes), [{ name: 'local', socket: '/var/run/docker.sock', discover: true, implicit: true }]);
  assert.deepEqual(withMountedSocket([], '/var/run/docker.sock', no), []);
  assert.equal(withMountedSocket(nas, '/var/run/docker.sock', yes), nas);
  assert.deepEqual(withMountedSocket([], null, yes), []);
});

test('kubernetes: enabled ingresses with href derived from rules and TLS', () => {
  const out = servicesFromIngresses(ingresses);
  assert.deepEqual(out.map((s) => [s.group, s.name, s.def.href]), [
    ['Monitoring', 'Grafana', 'https://grafana.example.com/'],
    ['apps', 'wiki', 'http://wiki.lan/docs'],
  ]);
  assert.throws(() => k8sApiUrl({}), /not running in a Kubernetes cluster/);
  assert.equal(k8sApiUrl({ KUBERNETES_SERVICE_HOST: '10.0.0.1', KUBERNETES_SERVICE_PORT: '6443' }), 'https://10.0.0.1:6443');
});

const pemOf = (f) => fs.readFileSync(path.resolve('tests/fixtures/tls', f), 'utf8');
const b64 = (f) => Buffer.from(pemOf(f)).toString('base64');

test('kubeconfig: the current context or a named one, data and file fields, token, refusing plugins', () => {
  const dir = tmpDir('hd-kube-');
  fs.writeFileSync(path.join(dir, 'ca.crt'), pemOf('ca.crt'));
  fs.writeFileSync(path.join(dir, 'token'), 'file-token\n');
  const file = path.join(dir, 'config');
  fs.writeFileSync(file, `
apiVersion: v1
kind: Config
current-context: home
clusters:
  - name: home
    cluster: { server: "https://k8s.lan:6443", certificate-authority-data: ${b64('ca.crt')} }
  - name: lab
    cluster: { server: "https://lab.lan:6443", certificate-authority: ca.crt }
  - name: test
    cluster: { server: "https://test.lan:6443", insecure-skip-tls-verify: true }
users:
  - name: admin
    user: { client-certificate-data: ${b64('client.crt')}, client-key-data: ${b64('client.key')} }
  - name: reader
    user: { tokenFile: token }
  - name: basic
    user: { username: u, password: p }
  - name: cloud
    user: { exec: { command: aws } }
contexts:
  - { name: home, context: { cluster: home, user: admin } }
  - { name: lab, context: { cluster: lab, user: reader } }
  - { name: test, context: { cluster: test, user: basic } }
  - { name: eks, context: { cluster: home, user: cloud } }
`);
  const home = readKubeconfig(file);
  assert.deepEqual([home.url, home.ca, home.cert, home.key, home.token], ['https://k8s.lan:6443', pemOf('ca.crt'), pemOf('client.crt'), pemOf('client.key'), undefined]);
  assert.deepEqual(readKubeconfig(file, { context: 'lab' }), { url: 'https://lab.lan:6443', ca: pemOf('ca.crt'), token: 'file-token' });
  assert.deepEqual(readKubeconfig(file, { context: 'test' }), { url: 'https://test.lan:6443', insecure: true, username: 'u', password: 'p' });
  assert.throws(() => readKubeconfig(file, { context: 'eks' }), /credential plugin/);
  assert.throws(() => readKubeconfig(file, { context: 'nope' }), /context "nope" not found/);
  assert.throws(() => readKubeconfig(path.join(dir, 'missing')), /ENOENT/);
  assert.equal(kubeconfigPath({ env: { KUBECONFIG: `/a/one${path.delimiter}/a/two` } }), '/a/one');
  assert.equal(kubeconfigPath({ env: {}, home: '/home/x' }), path.join('/home/x', '.kube', 'config'));
  assert.equal(kubeconfigPath({ file: 'kube/config', configDir: '/config' }), path.resolve('/config/kube/config'));
  assert.equal(k8sConnection({ mode: 'default', kubeconfig: file, context: 'lab' }).token, 'file-token');
  const sa = tmpDir('hd-sa-');
  fs.writeFileSync(path.join(sa, 'token'), 'sa-token\n');
  assert.deepEqual(k8sConnection({ mode: 'cluster' }, { env: { KUBERNETES_SERVICE_HOST: '10.0.0.1' }, saDir: sa }), { url: 'https://10.0.0.1:443', token: 'sa-token' });
});

test('kubernetes: discovery through a kubeconfig, with a client certificate and a path prefix', async () => {
  const https = await import('node:https');
  const api = https.createServer({ key: pemOf('server.key'), cert: pemOf('server.crt'), ca: pemOf('ca.crt'), requestCert: true, rejectUnauthorized: true }, (req, res) => {
    assert.equal(req.url, '/k8s/clusters/c-1/apis/networking.k8s.io/v1/ingresses');
    res.end(JSON.stringify(ingresses));
  });
  await new Promise((r) => api.listen(0, '127.0.0.1', r));
  const dir = tmpDir('hd-kube-');
  const file = path.join(dir, 'config');
  fs.writeFileSync(file, `current-context: c
clusters: [{ name: c, cluster: { server: "https://localhost:${api.address().port}/k8s/clusters/c-1/", certificate-authority-data: ${b64('ca.crt')} } }]
users: [{ name: u, user: { client-certificate-data: ${b64('client.crt')}, client-key-data: ${b64('client.key')} } }]
contexts: [{ name: c, context: { cluster: c, user: u } }]
`);
  try {
    const out = await discoverKubernetes({ config: { mode: 'default', kubeconfig: file } });
    assert.deepEqual(out.map((s) => s.name), ['Grafana', 'wiki']);
  } finally {
    api.close();
  }
});

test('kubernetes: links from Traefik IngressRoutes and Gateway API HTTPRoutes', () => {
  assert.equal(ingressRouteHref({ spec: { tls: {}, routes: [{ match: 'Host(`grafana.lan`) && PathPrefix(`/ui`)' }] } }), 'https://grafana.lan/ui');
  assert.equal(ingressRouteHref({ spec: { routes: [{ match: 'PathPrefix(`/x`)' }, { match: 'Host( `wiki.lan` )' }] } }), 'http://wiki.lan/');
  assert.equal(ingressRouteHref({ spec: { routes: [{ match: 'HostRegexp(`.+`)' }] } }), null);
  const route = { metadata: { namespace: 'apps' }, spec: { hostnames: ['app.lan'], parentRefs: [{ name: 'gw', namespace: 'infra', sectionName: 'websecure' }], rules: [{ matches: [{ path: { type: 'PathPrefix', value: '/app' } }] }] } };
  assert.equal(httpRouteHref(route, new Map([['infra/gw/websecure', 'https']])), 'https://app.lan/app');
  assert.equal(httpRouteHref(route), 'http://app.lan/app', 'an unknown gateway: http, as in homepage');
  assert.equal(httpRouteHref({ ...route, spec: { ...route.spec, rules: [{ matches: [{ path: { type: 'RegularExpression', value: '/.*' } }] }] } }), null);
  assert.equal(httpRouteHref({ ...route, spec: { ...route.spec, hostnames: ['*.lan'] } }), null);
  const gateway = { spec: { listeners: [{ name: 'web', protocol: 'HTTP' }, { name: 'websecure', protocol: 'HTTPS' }] } };
  assert.deepEqual([listenerScheme(gateway, 'websecure'), listenerScheme(gateway, 'nope'), listenerScheme(null)], ['https', 'http', 'http']);
});

test('kubernetes: discovery lists Ingresses, IngressRoutes of both Traefik groups and HTTPRoutes, as kubernetes.yaml says', async () => {
  const annotated = (name, extra = {}) => ({ uid: name, name, namespace: 'apps', annotations: { 'gethomepage.dev/enabled': 'true', ...extra } });
  const asked = [];
  const api = await serve((req, res) => {
    asked.push(req.url);
    const send = (body) => res.end(JSON.stringify(body));
    switch (req.url) {
      case '/apis/networking.k8s.io/v1/ingresses': return send(ingresses);
      case '/apis/traefik.io/v1alpha1/ingressroutes': return send({ items: [
        { metadata: annotated('dash'), spec: { tls: {}, routes: [{ match: 'Host(`dash.lan`)' }] } },
        { metadata: annotated('both'), spec: { routes: [{ match: 'Host(`both.lan`)' }] } },
      ] });
      case '/apis/traefik.containo.us/v1alpha1/ingressroutes': return send({ items: [{ metadata: annotated('both'), spec: { routes: [{ match: 'Host(`both.lan`)' }] } }] });
      case '/apis/gateway.networking.k8s.io/v1/httproutes': return send({ items: [
        { metadata: annotated('route', { 'gethomepage.dev/name': 'Route' }), spec: { hostnames: ['route.lan'], parentRefs: [{ name: 'gw' }], rules: [{ matches: [{ path: { type: 'PathPrefix', value: '/' } }] }] } },
        { metadata: annotated('plain'), spec: { hostnames: ['plain.lan'], parentRefs: [{ name: 'gw' }] } },
      ] });
      case '/apis/gateway.networking.k8s.io/v1/namespaces/apps/gateways/gw': return send({ spec: { listeners: [{ name: 'https', protocol: 'HTTPS' }] } });
      default: res.statusCode = 404; return res.end('{}');
    }
  });
  const connection = { url: api.url, token: 't' };
  try {
    const all = await discoverKubernetes({ connection, config: { traefik: true, gateway: true } });
    assert.deepEqual(all.map((s) => [s.name, s.def.href]), [
      ['Grafana', 'https://grafana.example.com/'], ['wiki', 'http://wiki.lan/docs'],
      ['dash', 'https://dash.lan/'], ['both', 'http://both.lan/'],
      ['Route', 'https://route.lan/'], ['plain', 'https://plain.lan/'],
    ]);
    assert.equal(asked.filter((u) => u.includes('/gateways/')).length, 1, 'one Gateway lookup per parent');
    assert.deepEqual([all[0].def.app, all[0].def.namespace], ['grafana', 'monitoring'], 'the app\'s pods, as in homepage');
    asked.length = 0;
    assert.deepEqual((await discoverKubernetes({ connection, config: { ingress: false } })).length, 0);
    assert.deepEqual(asked, [], 'ingress: false lists nothing');
  } finally {
    await api.close();
  }
  const noCrd = await serve((req, res) => { res.statusCode = req.url.includes('traefik') ? 404 : 200; res.end(JSON.stringify({ items: [] })); });
  try {
    assert.deepEqual(await discoverKubernetes({ connection: { url: noCrd.url }, config: { traefik: true } }), [], 'Traefik not installed is no error');
  } finally {
    await noCrd.close();
  }
});

test('kubernetes: app, pod-selector and external annotations, as in homepage', () => {
  const ing = (annotations) => ({ items: [{ metadata: { name: 'web', namespace: 'apps', annotations: { 'gethomepage.dev/enabled': 'true', ...annotations } }, spec: {} }] });
  assert.deepEqual(servicesFromIngresses(ing({}))[0].def, { app: 'web', namespace: 'apps' });
  assert.deepEqual(servicesFromIngresses(ing({ 'gethomepage.dev/app': 'site', 'gethomepage.dev/pod-selector': '' }))[0].def, { app: 'site', namespace: 'apps', podSelector: '' });
  assert.deepEqual(servicesFromIngresses(ing({ 'gethomepage.dev/external': 'true' }))[0].def, { external: true });
});

test('kubernetes: gethomepage.dev annotations work too', () => {
  const out = servicesFromIngresses({ items: [{
    metadata: { name: 'x', namespace: 'n', annotations: { 'gethomepage.dev/enabled': 'true', 'gethomepage.dev/name': 'X', 'gethomepage.dev/group': 'G' } },
    spec: { rules: [{ host: 'x.lan' }] },
  }] });
  assert.deepEqual(out.map((s) => [s.group, s.name, s.def.href]), [['G', 'X', 'http://x.lan/']]);
});

test('Discovery substitutes variables in labels and records them as secrets', async () => {
  const d = new Discovery({
    log: silentLog,
    env: { HOMEPAGE_VAR_K: 'k-123' },
    docker: async () => [{ group: 'G', name: 'S', def: { widget: { type: 'x', key: '{{HOMEPAGE_VAR_K}}' } }, weight: 0 }],
  });
  await d.configure({ settings: { discovery: { interval: '1h' } }, docker: [{ name: 'l', discover: true }], kubernetes: { mode: 'disabled' } });
  d.stop();
  assert.equal(d.found[0].def.widget.key, 'k-123');
  assert.deepEqual([...d.secrets], ['k-123']);
});

test('merge: weight orders a group as in homepage: YAML (position + 1) x 100, discovered 0, ties by name', () => {
  const yaml = [{
    name: 'G',
    services: [{ name: 'First', widgets: [] }, { name: 'Second', widgets: [] }, { name: 'Last', weight: 1000, widgets: [] }],
    groups: [{ name: 'Nested', services: [{ name: 'Z', weight: 5, widgets: [] }, { name: 'Y', widgets: [] }], groups: [] }],
  }];
  const { groups } = mergeDiscovered(yaml, [
    { group: 'G', name: 'Unweighted', def: {}, weight: 0, origin: 'docker:local' },
    { group: 'G', name: 'Between', def: {}, weight: 150, origin: 'docker:local' },
    { group: 'G', name: 'Also200', def: {}, weight: 200, origin: 'kubernetes' },
  ]);
  assert.deepEqual(groups[0].services.map((s) => [s.name, s.weight]), [
    ['Unweighted', 0], ['First', 100], ['Between', 150], ['Also200', 200], ['Second', 200], ['Last', 1000],
  ]);
  assert.deepEqual(groups[0].groups[0].services.map((s) => s.name), ['Z', 'Y'], 'nested groups by weight too');
});

test('merge: YAML wins, new groups are added, weight orders discovered services', () => {
  const yaml = [{ name: 'Media', services: [{ name: 'Plex', href: 'http://yaml', widgets: [] }] }];
  const { groups } = mergeDiscovered(yaml, [
    { group: 'Media', name: 'Plex', def: { href: 'http://discovered' }, weight: 0, origin: 'docker:local' },
    { group: 'Tools', name: 'B', def: {}, weight: 0, origin: 'docker:local' },
    { group: 'Tools', name: 'A', def: {}, weight: 9, origin: 'docker:local' },
  ]);
  assert.equal(groups[0].services.length, 1);
  assert.equal(groups[0].services[0].href, 'http://yaml');
  assert.deepEqual(groups[1].services.map((s) => [s.name, s.discovered]), [['B', 'docker:local'], ['A', 'docker:local']]);
  assert.equal(yaml[0].services.length, 1, 'input is not modified');
});

test('Discovery: errors per source, onChange only when something changed', async () => {
  let changes = 0;
  let fail = true;
  const d = new Discovery({
    log: silentLog,
    onChange: () => changes++,
    docker: async () => {
      if (fail) throw new Error('socket missing');
      return [{ group: 'G', name: 'S', def: {}, weight: 0 }];
    },
    kubernetes: async () => [],
  });
  const config = { settings: { discovery: { interval: '1h' } }, docker: [{ name: 'local', discover: true }], kubernetes: { mode: 'disabled' } };
  await d.configure(config);
  assert.equal(d.errors[0].message, 'discovery: socket missing');
  fail = false;
  await d.poll();
  await d.poll();
  assert.equal(d.found.length, 1);
  assert.equal(changes, 2);
  d.stop();
});

test('labels: index notation for widgets and mappings, more fields (homepage\'s examples)', () => {
  const svc = serviceFromLabels({
    'homepage.group': 'Media', 'homepage.name': 'Emby', 'homepage.icon': 'emby.png', 'homepage.href': 'http://emby.home/',
    'homepage.statusStyle': 'dot', 'homepage.showStats': 'true', 'homepage.target': '_self',
    'homepage.widgets[0].type': 'emby', 'homepage.widgets[0].url': 'http://emby.home', 'homepage.widgets[0].key': 'k',
    'homepage.widgets[1].type': 'customapi', 'homepage.widgets[1].url': 'http://argus.service/api',
    'homepage.widgets[1].mappings[0].label': 'Deployed Version', 'homepage.widgets[1].mappings[0].field.status': 'deployed_version',
    'homepage.widgets[1].mappings[1].label': 'Latest Version', 'homepage.widgets[1].headers.X-Auth-Key': 'secret',
  }, 'homepage.');
  assert.equal(svc.def.statusStyle, 'dot');
  assert.equal(svc.def.showStats, true);
  assert.equal(svc.def.target, '_self');
  assert.deepEqual(svc.def.widgets[0], { type: 'emby', url: 'http://emby.home', key: 'k' });
  assert.deepEqual(svc.def.widgets[1].mappings, [{ label: 'Deployed Version', field: { status: 'deployed_version' } }, { label: 'Latest Version' }]);
  assert.deepEqual(svc.def.widgets[1].headers, { 'X-Auth-Key': 'secret' });
});

test('labels: instance labels win for this dashboard and are ignored by others', () => {
  const labels = {
    'homepage.group': 'Media', 'homepage.name': 'Emby', 'homepage.href': 'http://emby.default/',
    'homepage.instance.internal.href': 'http://emby.lan/', 'homepage.instance.public.href': 'https://emby.example.com/',
    'homepage.instance.public.description': 'Public only',
  };
  assert.equal(serviceFromLabels(labels, 'homepage.', 'internal').def.href, 'http://emby.lan/');
  const pub = serviceFromLabels(labels, 'homepage.', 'public');
  assert.equal(pub.def.href, 'https://emby.example.com/');
  assert.equal(pub.def.description, 'Public only');
  const none = serviceFromLabels(labels, 'homepage.');
  assert.equal(none.def.href, 'http://emby.default/');
  assert.equal(none.def.description, undefined);
});

test('Discovery passes settings.instanceName to the sources', async () => {
  const seen = [];
  const d = new Discovery({
    log: silentLog,
    docker: async (server) => { seen.push(['docker', server.instanceName]); return []; },
    kubernetes: async (opts) => { seen.push(['kubernetes', opts.instanceName]); return []; },
  });
  await d.configure({ settings: { instanceName: 'public', discovery: { interval: '1h' } }, docker: [{ name: 'local', socket: '/x', discover: true }], kubernetes: { mode: 'cluster' } });
  d.stop();
  assert.deepEqual(seen, [['docker', 'public'], ['kubernetes', 'public']]);
});
