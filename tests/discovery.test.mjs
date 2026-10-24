import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { servicesFromContainers, discoverDocker, withMountedSocket } from '../src/discovery/docker.js';
import { servicesFromIngresses, k8sApiUrl } from '../src/discovery/kubernetes.js';
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
