import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createApp } from '../src/app.js';
import { watchConfig } from '../src/config/watch.js';
import { execFileSync } from 'node:child_process';
import { tmpDir, serve, silentLog, writeWidget } from './helpers.mjs';
import { readLock } from '../src/plugins/installer.js';

const SECRET = 'super-secret-api-key-123';

async function startApp(files, env = {}) {
  const configDir = tmpDir('hd-app-');
  for (const [name, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(configDir, name)), { recursive: true });
    fs.writeFileSync(path.join(configDir, name), text);
  }
  const app = await createApp({ configDir, env, log: silentLog, defaultPlugins: [], dockerSocket: null });
  const server = http.createServer(app.handler);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  return {
    app, configDir, base,
    get: (p, init) => fetch(base + p, init),
    json: (p) => fetch(base + p).then((r) => r.json()),
    close: () => { app.close(); return new Promise((r) => server.close(r)); },
  };
}

test('secrets from variables and secret options never reach /api/layout', async () => {
  const upstream = await serve((req, res) => {
    assert.equal(req.headers.authorization, `Bearer ${SECRET}`);
    res.end(JSON.stringify({ count: 7 }));
  });
  const t = await startApp({
    'settings.yaml': `plugins:\n  - path: ${path.resolve('examples/widget-template')}\n`,
    'services.yaml': `
- Apps:
    - Counter:
        href: http://counter.lan
        widget:
          type: example-counter
          url: ${upstream.url}/
          key: "{{HD_VAR_COUNTER_KEY}}"
    - Api:
        widget:
          type: custom-api
          url: ${upstream.url}/
          headers: { authorization: "Bearer {{HD_VAR_COUNTER_KEY}}" }
          mappings: [{ field: count, label: Count }]
`,
  }, { HD_VAR_COUNTER_KEY: SECRET });
  try {
    const raw = await t.get('/api/layout').then((r) => r.text());
    assert.equal(raw.includes(SECRET), false, 'secret leaked into the layout');
    const layout = JSON.parse(raw);
    assert.deepEqual(layout.messages.errors, []);
    const [counter, api] = layout.groups[0].services;
    assert.deepEqual(Object.keys(counter.widgets[0].options).sort(), ['field', 'max', 'url']);
    assert.equal(layout.widgetTypes['example-counter'].source, path.resolve('examples/widget-template'));
    const data = await t.json(`/api/widgets/${counter.widgets[0].instanceId}`);
    assert.equal(data.ok, true);
    assert.equal(data.data.value, 7);
    const apiData = await t.json(`/api/widgets/${api.widgets[0].instanceId}`);
    assert.deepEqual(apiData.data.blocks, [{ label: 'Count', value: 7 }]);
  } finally {
    await t.close();
    await upstream.close();
  }
});

test('status checks come from siteMonitor, ping and container', async () => {
  const t = await startApp({
    'docker.yaml': 'local:\n  socket: /tmp/none.sock\n  discover: false\n  swarm: true\n',
    'services.yaml': `
- G:
    - A: { siteMonitor: "http://a.lan" }
    - B: { ping: b.lan }
    - C: { container: c }
    - D: { href: "http://d.lan" }
    - E: { siteMonitor: "http://e.lan", container: e }
`,
  });
  try {
    const services = t.app.layout.groups[0].services;
    assert.deepEqual(services.map((s) => s.statuses.map((x) => `${x.kind}:${x.type}`)), [
      ['siteMonitor:http-status'], ['ping:ping'], ['container:docker'], [], ['siteMonitor:http-status', 'container:docker'],
    ]);
    assert.deepEqual(services[2].statuses[0].options, { container: 'c', socket: '/tmp/none.sock', swarm: true });
  } finally {
    await t.close();
  }
});

test('container: over Docker TLS, the certificates reach the docker widget but never /api/layout', async () => {
  const https = await import('node:https');
  const pem = (f) => fs.readFileSync(path.resolve('tests/fixtures/tls', f), 'utf8');
  const daemon = https.createServer({ key: pem('server.key'), cert: pem('server.crt'), ca: pem('ca.crt'), requestCert: true, rejectUnauthorized: true }, (req, res) => {
    res.end(JSON.stringify(req.url.startsWith('/containers/c/json') ? { State: { Status: 'exited' } } : {}));
  });
  await new Promise((r) => daemon.listen(0, '127.0.0.1', r));
  const t = await startApp({
    'tls/ca.pem': pem('ca.crt'),
    'tls/cert.pem': pem('client.crt'),
    'tls/key.pem': pem('client.key'),
    'docker.yaml': `remote:\n  host: localhost\n  port: ${daemon.address().port}\n  discover: false\n  tls: { caFile: tls/ca.pem, certFile: tls/cert.pem, keyFile: tls/key.pem }\n`,
    'services.yaml': '- G:\n    - C: { container: c }\n',
  });
  try {
    const layout = await (await t.get('/api/layout')).text();
    assert.ok(!layout.includes('PRIVATE KEY') && !layout.includes('CERTIFICATE'), 'no PEM text in the layout');
    const status = t.app.layout.groups[0].services[0].statuses[0];
    const data = await t.json(`/api/widgets/${status.instanceId}`);
    assert.equal(data.ok, true, data.error);
    assert.equal(data.data.statusText, 'exited');
  } finally {
    await t.close();
    daemon.close();
  }
});

test('proxmoxNode and proxmoxVMID: a status from proxmox.yaml per node, its secret never in /api/layout', async () => {
  const t = await startApp({
    'proxmox.yaml': 'pve:\n  url: https://pve.lan:8006\n  token: api@pam!dash\n  secret: pve-secret-value\n',
    'services.yaml': `
- G:
    - VM: { proxmoxNode: pve, proxmoxVMID: 101 }
    - CT: { proxmoxNode: pve, proxmoxVMID: 200, proxmoxType: lxc }
    - Other: { proxmoxNode: pve2, proxmoxVMID: 1 }
    - Widget:
        widget: { type: proxmoxvm, node: pve, vmid: 102 }
`,
  });
  try {
    const [vm, ct, other, widget] = t.app.layout.groups[0].services;
    assert.deepEqual(vm.statuses.map((s) => [s.kind, s.type]), [['proxmox', 'proxmoxvm']]);
    assert.deepEqual(vm.statuses[0].options, { url: 'https://pve.lan:8006', node: 'pve', vmid: '101', type: 'qemu', insecure: true });
    assert.equal(ct.statuses[0].options.type, 'lxc');
    assert.equal(widget.widgets[0].options.url, 'https://pve.lan:8006', 'homepage\'s proxmoxvm widget: the connection from proxmox.yaml');
    assert.equal(other.statuses[0].type, 'proxmoxvm');
    const layout = await (await t.get('/api/layout')).text();
    assert.ok(!layout.includes('pve-secret-value') && !layout.includes('api@pam'), 'token and secret stay on the server');
    assert.ok(t.app.layout.messages.errors.some((e) => /proxmoxNode "pve2" is not in proxmox.yaml/.test(e.message)));
  } finally {
    await t.close();
  }
});

test('kubernetes.yaml mode: default: the kubernetes widget reads the cluster through the kubeconfig', async () => {
  const pem = (f) => fs.readFileSync(path.resolve('tests/fixtures/tls', f), 'utf8');
  const b64 = (f) => Buffer.from(pem(f)).toString('base64');
  const api = await serve((req, res) => {
    assert.equal(req.headers.authorization, 'Bearer kube-token-value');
    if (req.url === '/api/v1/nodes') return res.end(JSON.stringify({ items: [{ metadata: { name: 'n1' }, status: { allocatable: { cpu: '4', memory: '8Gi' }, conditions: [{ type: 'Ready', status: 'True' }] } }] }));
    res.end(JSON.stringify({ items: [{ metadata: { name: 'n1' }, usage: { cpu: '1', memory: '2Gi' } }] }));
  });
  const t = await startApp({
    'kube/config': `current-context: c
clusters: [{ name: c, cluster: { server: "${api.url}", certificate-authority-data: ${b64('ca.crt')} } }]
users: [{ name: u, user: { token: kube-token-value } }]
contexts: [{ name: c, context: { cluster: c, user: u } }]
`,
    'kubernetes.yaml': 'mode: default\nkubeconfig: kube/config\n',
    'widgets.yaml': '- kubernetes:\n    nodes: { show: false }\n',
  });
  try {
    const layout = await (await t.get('/api/layout')).text();
    assert.ok(!layout.includes('kube-token-value') && !layout.includes('CERTIFICATE'), 'the token and CA stay on the server');
    const data = await t.json(`/api/widgets/${t.app.layout.header[0].instanceId}`);
    assert.equal(data.ok, true, data.error);
    assert.deepEqual(data.data.blocks.map((b) => b.value), [25, 25, 1, 1]);
  } finally {
    await t.close();
    await api.close();
  }
});

test('app, namespace and podSelector: a pods status label, as in homepage; external leaves it out', async () => {
  const t = await startApp({
    'services.yaml': `
- G:
    - A: { app: jellyfin, namespace: media }
    - B: { app: matrix, namespace: comms, podSelector: "app.kubernetes.io/instance in (a, b)" }
    - C: { app: outside, external: true }
`,
  });
  try {
    const [a, b, c] = t.app.layout.groups[0].services;
    assert.deepEqual(a.statuses.map((s) => [s.kind, s.type, s.options.app, s.options.namespace]), [['pods', 'kubernetes-pods', 'jellyfin', 'media']]);
    assert.equal(b.statuses[0].options.podSelector, 'app.kubernetes.io/instance in (a, b)');
    assert.deepEqual(c.statuses, []);
  } finally {
    await t.close();
  }
});

test('service_group and service_name pull another service\'s widget options in, on the server only', async () => {
  const dir = tmpDir('hd-refs-');
  writeWidget(dir, { id: 'agenda', name: 'Agenda', version: '1.0.0', apiVersion: 1, options: { integrations: { type: 'list', secret: true } } },
    { 'server.js': 'export default { fetch: (ctx) => ({ blocks: [{ label: "n", value: JSON.stringify(ctx.options.integrations) }] }) };' });
  const t = await startApp({
    'settings.yaml': `plugins:\n  - path: ${dir}\n`,
    'services.yaml': `
- Media:
    - Sonarr:
        widget: { type: custom-api, url: "http://sonarr.lan", headers: { x-api-key: "{{HD_VAR_SONARR_KEY}}" }, mappings: [] }
- Home:
    - Calendar:
        widget:
          type: agenda
          integrations:
            - { type: custom-api, service_group: Media, service_name: Sonarr, color: teal }
            - { service_group: Media, service_name: Nope }
`,
  }, { HD_VAR_SONARR_KEY: 'sonarr-secret-key' });
  try {
    const raw = await t.get('/api/layout').then((r) => r.text());
    assert.equal(raw.includes('sonarr-secret-key'), false);
    const cal = t.app.layout.groups[1].services[0].widgets[0];
    const data = await t.json(`/api/widgets/${cal.instanceId}`);
    const [first] = JSON.parse(data.data.blocks[0].value);
    assert.deepEqual([first.url, first.headers['x-api-key'], first.color, first.service_name], ['http://sonarr.lan', 'sonarr-secret-key', 'teal', 'Sonarr']);
    assert.ok(t.app.layout.messages.errors.some((e) => /no service "Nope" in group "Media"/.test(e.message)));
  } finally {
    await t.close();
  }
});

test('refreshInterval, fields and hide_errors belong to the dashboard, not the widget', async () => {
  const upstream = await serve((req, res) => res.end(JSON.stringify({ a: 1, b: 2, c: 3 })));
  const t = await startApp({
    'services.yaml': `
- G:
    - S:
        widget:
          type: custom-api
          url: ${upstream.url}/
          refreshInterval: 5000
          hide_errors: true
          fields: [A, C]
          mappings: [{ field: a, label: A }, { field: b, label: B }, { field: c, label: C }]
    - T:
        widget: { type: ping, host: x.lan, refresh: 1ms }
`,
  });
  try {
    const [s, tt] = t.app.layout.groups[0].services;
    assert.equal(s.widgets[0].refreshMs, 5000);
    assert.equal(s.widgets[0].hideErrors, true);
    assert.equal('fields' in s.widgets[0].options, false);
    assert.equal(tt.widgets[0].refreshMs, 1000, 'clamped to the minimum');
    const data = await t.json(`/api/widgets/${s.widgets[0].instanceId}`);
    assert.deepEqual(data.data.blocks.map((b) => b.label), ['A', 'C']);
  } finally {
    await t.close();
    await upstream.close();
  }
});

test('without fields, a widget shows its defaultFields; fields in the entry win', async () => {
  const dir = path.join(tmpDir('hd-df-'), 'df');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'widget.yaml'), 'id: df\nname: DF\nversion: 1.0.0\napiVersion: 1\ndefaultFields: [a, c]\n');
  fs.writeFileSync(path.join(dir, 'server.js'), 'export default { async fetch() { return { blocks: [{ key: "a", label: "A", value: 1 }, { key: "b", label: "B", value: 2 }, { key: "c", label: "C", value: 3 }] } } }');
  const t = await startApp({
    'settings.yaml': `plugins:\n  - path: ${dir}\n`,
    'services.yaml': '- G:\n    - D: { widget: { type: df } }\n    - E: { widget: { type: df, fields: [b] } }\n',
  });
  try {
    const [d, e] = t.app.layout.groups[0].services;
    assert.deepEqual((await t.json(`/api/widgets/${d.widgets[0].instanceId}`)).data.blocks.map((b) => b.key), ['a', 'c']);
    assert.deepEqual((await t.json(`/api/widgets/${e.widgets[0].instanceId}`)).data.blocks.map((b) => b.key), ['b']);
  } finally {
    await t.close();
  }
});

test('secrets from discovered labels stay out of the layout', async () => {
  const configDir = tmpDir('hd-app-');
  fs.writeFileSync(path.join(configDir, 'docker.yaml'), 'local:\n  socket: /tmp/x.sock\n');
  const app = await createApp({
    configDir,
    env: { HOMEPAGE_VAR_KEY: SECRET },
    log: silentLog,
    defaultPlugins: [],
    dockerSocket: null,
    discovery: {
      docker: async () => [{ group: 'G', name: 'S', weight: 0,
        def: { href: 'http://s.lan', widget: { type: 'custom-api', url: 'http://s.lan/', mappings: [{ field: 'a' }], extra: '{{HOMEPAGE_VAR_KEY}}' } } }],
    },
  });
  try {
    const raw = JSON.stringify(app.layout);
    assert.equal(raw.includes(SECRET), false);
    assert.equal(app.layout.groups[0].services[0].name, 'S');
  } finally {
    app.close();
  }
});

test('config problems show up as messages, never as a crash', async () => {
  const t = await startApp({
    'services.yaml': '- G:\n    - A:\n        widget: { type: nope }\n    - B:\n        widget: { type: http-status }\n',
    'settings.yaml': 'plugins:\n  - source: ftp://x\n',
  });
  try {
    const msgs = t.app.layout.messages.errors.map((e) => e.message);
    assert.ok(msgs.includes('unknown widget type "nope"'));
    assert.ok(msgs.includes('http-status: url: required'));
    assert.ok(msgs.some((m) => /starts with "git\+" or "npm:"/.test(m)));
    const b = t.app.layout.groups[0].services[1];
    const data = await t.json(`/api/widgets/${b.widgets[0].instanceId}`);
    assert.match(data.error, /invalid options: url: required/);
  } finally {
    await t.close();
  }
});

test('the iframe widget: its origin, and only that, in frame-src', async () => {
  const t = await startApp({
    'services.yaml': [
      '- Monitoring:',
      '    - Power:',
      '        widget: { type: iframe, src: "https://grafana.lan:3000/d-solo/power?panelId=2" }',
      '    - Hidden:',
      '        widget: { type: iframe, src: "{{HD_VAR_PAGE}}" }',
      '    - Broken:',
      '        widget: { type: iframe, src: "javascript:alert(1)" }',
    ].join('\n') + '\n',
  }, { HD_VAR_PAGE: 'https://secret.lan/page' });
  try {
    const csp = (await t.get('/')).headers.get('content-security-policy');
    assert.match(csp, /frame-src https:\/\/grafana\.lan:3000; frame-ancestors 'self'/);
    assert.ok(!csp.includes('secret.lan'), 'a src from a variable is never public, so never framed');
    assert.match((await t.get('/api/layout')).headers.get('content-security-policy'), /frame-src 'none'/, 'only the page frames');
    const layout = await t.json('/api/layout');
    assert.ok(layout.messages.errors.some((e) => /src:/.test(e.message) && e.path.includes('Broken')), JSON.stringify(layout.messages.errors));
  } finally {
    await t.close();
  }
});

test('static files: index, client.js, assets, icons, and no path traversal', async () => {
  const t = await startApp({
    'settings.yaml': `plugins:\n  - path: ${path.resolve('examples/widget-template')}\n`,
    'icons/my.svg': '<svg xmlns="http://www.w3.org/2000/svg"/>',
  });
  try {
    const index = await t.get('/');
    assert.equal(index.status, 200);
    assert.match(index.headers.get('content-security-policy'), /connect-src 'self'/);
    assert.match(index.headers.get('content-security-policy'), /frame-src 'none'/);
    assert.equal((await t.get('/widgets/datetime/client.js')).headers.get('content-type'), 'text/javascript; charset=utf-8');
    assert.equal((await t.get('/widgets/example-counter/assets/README.md')).status, 200);
    assert.equal((await t.get('/widgets/example-counter/server.js')).status, 404);
    assert.equal((await t.get('/widgets/example-counter/assets/..%2Fserver.js')).status, 404);
    assert.equal((await t.get('/icons/my.svg')).headers.get('content-type'), 'image/svg+xml');
    assert.equal((await t.get('/icons/..%2Fsettings.yaml')).status, 404);
    assert.deepEqual(await t.json('/api/health').then((h) => h.ok), true);
  } finally {
    await t.close();
  }
});

test('hidden-iframe services run through /api/run with the configured URL only', async () => {
  let hits = 0;
  const hook = await serve((req, res) => {
    hits++;
    res.statusCode = req.url === '/broken' ? 500 : 200;
    res.end('ok');
  });
  const t = await startApp({
    'services.yaml': `
- Scripts:
    - Run: { href: "${hook.url}/run", target: hidden-iframe }
    - Broken: { href: "${hook.url}/broken", target: hidden-iframe }
    - Link: { href: "${hook.url}/link" }
`,
  });
  try {
    const [run, broken, link] = t.app.layout.groups[0].services;
    const post = (id, headers = { 'x-requested-with': 'homelab-dashboard' }) => t.get(`/api/run/${id}`, { method: 'POST', headers });
    assert.equal((await post(run.id, {})).status, 403, 'needs the header');
    assert.equal(hits, 0);
    assert.deepEqual(await post(run.id).then((r) => r.json()), { ok: true, status: 200 });
    assert.deepEqual(await post(broken.id).then((r) => r.json()), { ok: false, status: 500 });
    assert.equal((await post(link.id)).status, 404, 'an ordinary link is not an action');
    assert.equal((await post('svc-nonexistent')).status, 404);
    assert.equal(hits, 2);
  } finally {
    await t.close();
    await hook.close();
  }
  const t2 = await startApp({ 'services.yaml': '- S:\n    - Down: { href: "http://127.0.0.1:1/x", target: hidden-iframe }\n' });
  try {
    const id = t2.app.layout.groups[0].services[0].id;
    const out = await t2.get(`/api/run/${id}`, { method: 'POST', headers: { 'x-requested-with': 'homelab-dashboard' } }).then((r) => r.json());
    assert.equal(out.ok, false);
    assert.match(out.error, /fetch failed/);
  } finally {
    await t2.close();
  }
});

test('plugin sync needs the X-Requested-With header', async () => {
  const t = await startApp({});
  try {
    assert.equal((await t.get('/api/plugins/sync', { method: 'POST' })).status, 403);
    const ok = await t.get('/api/plugins/sync', { method: 'POST', headers: { 'x-requested-with': 'homelab-dashboard' } });
    assert.equal(ok.status, 200);
  } finally {
    await t.close();
  }
});

test('reload picks up edited YAML and tells browsers through /api/events', async () => {
  const t = await startApp({ 'settings.yaml': 'title: Before\n' });
  try {
    const events = await new Promise((resolve) => http.get(t.base + '/api/events', resolve));
    let received = '';
    events.on('data', (c) => (received += c));
    fs.writeFileSync(path.join(t.configDir, 'settings.yaml'), 'title: After\n');
    await t.app.reload();
    assert.equal(t.app.layout.settings.title, 'After');
    await new Promise((r) => setTimeout(r, 50));
    assert.match(received, /event: reload/);
    events.destroy();
  } finally {
    await t.close();
  }
});

test('watchConfig reacts to YAML changes only', async () => {
  const dir = tmpDir();
  let calls = 0;
  const w = watchConfig(dir, () => calls++, { debounceMs: 30, log: silentLog });
  fs.writeFileSync(path.join(dir, 'notes.txt'), 'x');
  await new Promise((r) => setTimeout(r, 150));
  assert.equal(calls, 0);
  fs.writeFileSync(path.join(dir, 'services.yaml'), '[]');
  await new Promise((r) => setTimeout(r, 300));
  w.close();
  // macOS can report one write as two events further apart than the debounce under load.
  assert.ok(calls >= 1);
});

test('HEAD is answered like GET', async () => {
  const t = await startApp({});
  try {
    assert.equal((await t.get('/api/health', { method: 'HEAD' })).status, 200);
  } finally {
    await t.close();
  }
});

test('the default plugins are installed without settings.yaml, and settings.yaml extends them', async () => {
  const repo = path.join(tmpDir('hd-repo-'), 'widget');
  fs.cpSync(path.resolve('examples/widget-template'), repo, { recursive: true });
  const git = (...args) => execFileSync('git', ['-C', repo, ...args], { stdio: 'pipe' });
  git('init', '-q', '-b', 'main');
  git('-c', 'user.name=t', '-c', 'user.email=t@t', 'add', '.');
  git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'v1');
  git('tag', 'v1.0.0');
  const defaultPlugins = [{ source: `git+file://${repo}#latest` }];

  const configDir = tmpDir('hd-app-');
  const app = await createApp({ configDir, log: silentLog, defaultPlugins, dockerSocket: null });
  assert.deepEqual(Object.keys(readLock(configDir)), [defaultPlugins[0].source]);
  assert.deepEqual(app.layout.messages.errors, []);
  app.close();

  fs.writeFileSync(path.join(configDir, 'settings.yaml'), 'plugins:\n  - path: ./missing\n');
  const extended = await createApp({ configDir, log: silentLog, defaultPlugins, dockerSocket: null });
  assert.deepEqual(Object.keys(readLock(configDir)), [defaultPlugins[0].source]);
  assert.ok(extended.layout.messages.errors.some((e) => e.path === 'plugins: ./missing'), JSON.stringify(extended.layout.messages.errors));
  extended.close();
});

test('a widget of your own wins over the same id in the default plugins, without an error', async () => {
  const repo = path.join(tmpDir('hd-repo-'), 'widget');
  fs.cpSync(path.resolve('examples/widget-template'), repo, { recursive: true });
  const git = (...args) => execFileSync('git', ['-C', repo, ...args], { stdio: 'pipe' });
  git('init', '-q', '-b', 'main');
  git('-c', 'user.name=t', '-c', 'user.email=t@t', 'add', '.');
  git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'v1');
  git('tag', 'v1.0.0');

  const configDir = tmpDir('hd-app-');
  const local = path.join(configDir, 'local-counter');
  fs.cpSync(path.resolve('examples/widget-template'), local, { recursive: true });
  fs.writeFileSync(path.join(configDir, 'settings.yaml'), 'plugins:\n  - path: ./local-counter\n');
  const app = await createApp({ configDir, log: silentLog, defaultPlugins: [{ source: `git+file://${repo}#latest` }], dockerSocket: null });
  assert.deepEqual(app.layout.messages.errors, []);
  assert.equal(app.runtime.registry.get('example-counter').source, './local-counter');
  app.close();
});

test('a mounted Docker socket is discovered without docker.yaml', async () => {
  const socketPath = path.join(tmpDir('hd-sock-'), 'docker.sock');
  const srv = await serve((req, res) => {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify([{ Id: 'a1', Names: ['/grafana'], State: 'running', Labels: { 'homelab.name': 'Grafana', 'homelab.group': 'Monitoring' } }]));
  }, { socketPath });
  const configDir = tmpDir('hd-app-');
  fs.writeFileSync(path.join(configDir, 'docker.yaml'), '# only comments, like config.example\n');
  const app = await createApp({ configDir, log: silentLog, defaultPlugins: [], dockerSocket: socketPath });
  try {
    for (let i = 0; i < 50 && !JSON.stringify(app.layout).includes('Grafana'); i++) await new Promise((r) => setTimeout(r, 20));
    const group = app.layout.groups.find((g) => g.name === 'Monitoring');
    assert.equal(group?.services[0].name, 'Grafana');
    assert.deepEqual(app.layout.messages.errors, []);
  } finally {
    app.close();
    await srv.close();
  }
});

test('watchConfig: YAML in subfolders reloads (includes), plugins/ does not', async () => {
  const { isConfigChange } = await import('../src/config/watch.js');
  assert.equal(isConfigChange('services.yaml'), true);
  assert.equal(isConfigChange('services/media.yaml'), true);
  assert.equal(isConfigChange('services\\media.yml'), true);
  assert.equal(isConfigChange('plugins/plugins.lock.yaml'), false);
  assert.equal(isConfigChange('plugins/x@1.0.0/widget.yaml'), false);
  assert.equal(isConfigChange('keys/token.txt'), false);

  const dir = tmpDir();
  fs.mkdirSync(path.join(dir, 'services'));
  let calls = 0;
  const w = watchConfig(dir, () => calls++, { debounceMs: 30, log: silentLog });
  await new Promise((r) => setTimeout(r, 100));
  fs.writeFileSync(path.join(dir, 'services', 'media.yaml'), '[]');
  await new Promise((r) => setTimeout(r, 400));
  w.close();
  assert.ok(calls >= 1);
});

test('the page carries description and favicon from settings.yaml', async () => {
  const t = await startApp({ 'settings.yaml': 'title: My lab\ndescription: Start page of the lab\nfavicon: /icons/lab.svg\n' });
  try {
    const res = await t.get('/');
    const html = await res.text();
    assert.equal(res.headers.get('content-type'), 'text/html; charset=utf-8');
    assert.match(html, /<title>My lab<\/title>/);
    assert.match(html, /<meta name="description" content="Start page of the lab">/);
    assert.match(html, /<link rel="icon" href="icons\/lab\.svg">/);
  } finally {
    await t.close();
  }
});

test('/site.webmanifest from settings.yaml, with pwa icons and shortcuts', async () => {
  const t = await startApp({ 'settings.yaml': [
    'title: My lab', 'startUrl: /#media', 'color: teal',
    'pwa:', '  icons:', '    - { src: /icons/app-192.png, sizes: 192x192, type: image/png }', '    - { nosrc: x }',
    '  shortcuts:', '    - { name: Media, url: "/#media" }', '',
  ].join('\n') });
  try {
    const res = await t.get('/site.webmanifest');
    assert.equal(res.headers.get('content-type'), 'application/manifest+json');
    const m = await res.json();
    assert.equal(m.name, 'My lab');
    assert.equal(m.start_url, '/#media');
    assert.equal(m.theme_color, '#115e59');
    assert.deepEqual(m.icons, [{ src: 'icons/app-192.png', sizes: '192x192', type: 'image/png' }]);
    assert.deepEqual(m.shortcuts, [{ name: 'Media', url: '/#media' }]);
    const warnings = (await (await t.get('/api/layout')).json()).messages.warnings;
    assert.ok(warnings.some((w) => w.path === 'pwa.icons[1]'), JSON.stringify(warnings));
  } finally {
    await t.close();
  }
});

test('tabs come from layout.<group>.tab in the order of the layout block; bookmark groups get their layout', async () => {
  const t = await startApp({
    'settings.yaml': 'layout:\n  Bookmarks A:\n    tab: Second\n  Media:\n    tab: First\n  Infra:\n    tab: Second\n  Always:\n    style: row\n',
    'services.yaml': '- Media:\n    - Plex: { href: http://plex.lan }\n- Infra:\n    - Router: { href: http://router.lan }\n- Always:\n    - Wiki: { href: http://wiki.lan }\n',
    'bookmarks.yaml': '- Bookmarks A:\n    - GitHub:\n        - href: https://github.com\n',
  });
  try {
    const layout = await (await t.get('/api/layout')).json();
    assert.deepEqual(layout.tabs, ['Second', 'First']);
    assert.equal(layout.groups.find((g) => g.name === 'Media').layout.tab, 'First');
    assert.equal(layout.bookmarks[0].layout.tab, 'Second');
  } finally {
    await t.close();
  }
});

test('nested groups get their layout from inside the parent layout, and the parent tab', async () => {
  const t = await startApp({
    'settings.yaml': 'layout:\n  Group A:\n    tab: Home\n    style: row\n    Group B:\n      columns: 2\n',
    'services.yaml': '- Group A:\n    - Service A: { href: http://a.lan }\n    - Group B:\n        - Service B: { href: http://b.lan }\n',
  });
  try {
    const layout = await (await t.get('/api/layout')).json();
    const a = layout.groups[0];
    assert.deepEqual(a.layout, { tab: 'Home', style: 'row' }, 'the nested layout is not part of the parent layout');
    assert.deepEqual(a.groups[0].layout, { columns: 2, tab: 'Home' });
    assert.equal(a.groups[0].services[0].name, 'Service B');
    assert.notEqual(a.groups[0].services[0].id, a.services[0].id);
  } finally {
    await t.close();
  }
});

test('category icons are resolved like service icons; bookmarksStyle reaches the page', async () => {
  const t = await startApp({
    'settings.yaml': 'bookmarksStyle: icons\nlayout:\n  Media:\n    icon: plex.svg\n  Dev:\n    icon: /icons/dev.svg\n',
    'services.yaml': '- Media:\n    - Plex: { href: http://plex.lan }\n',
    'bookmarks.yaml': '- Dev:\n    - GitHub:\n        - href: https://github.com\n',
  });
  try {
    const layout = await (await t.get('/api/layout')).json();
    assert.match(layout.groups[0].layout.icon, /\/svg\/plex\.svg$/);
    assert.equal(layout.bookmarks[0].layout.icon, '/icons/dev.svg');
    assert.equal(layout.settings.bookmarksStyle, 'icons');
  } finally {
    await t.close();
  }
});

test('groups follow the order of the layout block, also as a list; bookmark groups get their place', async () => {
  const t = await startApp({
    'settings.yaml': 'layout:\n  - Media:\n  - Developer:\n  - Infra:\n      style: row\n',
    'services.yaml': '- Infra:\n    - Router: { href: http://router.lan }\n- Extra:\n    - X: { href: http://x.lan }\n- Media:\n    - Plex: { href: http://plex.lan }\n',
    'bookmarks.yaml': '- Docs:\n    - Wiki:\n        - href: http://wiki.lan\n- Developer:\n    - GitHub:\n        - href: https://github.com\n',
  });
  try {
    const layout = await (await t.get('/api/layout')).json();
    assert.deepEqual(layout.messages.warnings, []);
    assert.deepEqual(layout.groups.map((g) => [g.name, g.order]), [['Media', 0], ['Infra', 2], ['Extra', null]]);
    assert.deepEqual(layout.groups[1].layout, { style: 'row' });
    assert.deepEqual(layout.bookmarks.map((g) => [g.name, g.order]), [['Developer', 1], ['Docs', null]]);
  } finally {
    await t.close();
  }
});

test('statusStyle: the service setting wins over the global one', async () => {
  const t = await startApp({
    'settings.yaml': 'statusStyle: dot\n',
    'services.yaml': '- G:\n    - A: { href: http://a.lan }\n    - B: { href: http://b.lan, statusStyle: basic }\n    - C: { href: http://c.lan, statusStyle: fancy }\n',
  });
  try {
    const layout = await (await t.get('/api/layout')).json();
    assert.deepEqual(layout.groups[0].services.map((s) => s.statusStyle), ['dot', 'basic', 'dot']);
    assert.ok(layout.messages.warnings.some((w) => w.path.endsWith('C.statusStyle')));
  } finally {
    await t.close();
  }
});

test('highlight rules on a widget entry reach the blocks through the runtime, not the widget', async () => {
  const srv = await serve((req, res) => res.end(JSON.stringify({ count: 42 })));
  const t = await startApp({
    'settings.yaml': 'blockHighlights:\n  levels:\n    warn: bg-sky-500/30 text-sky-900\n    nope: x\n',
    'services.yaml': [
      '- G:', '    - App:', '        widget:', '          type: custom-api', `          url: ${srv.url}/`,
      '          mappings: [{ field: count, label: Count }]', '          highlight:', '            Count:',
      '              numeric:', '                - { level: warn, when: gt, value: 40 }', '',
    ].join('\n'),
  });
  try {
    const layout = await (await t.get('/api/layout')).json();
    const w = layout.groups[0].services[0].widgets[0];
    assert.equal(w.options.highlight, undefined, 'highlight is the dashboard\'s, not a widget option');
    const result = await (await t.get(`/api/widgets/${w.instanceId}`)).json();
    assert.deepEqual(result.data.blocks[0].highlight, { level: 'warn', valueOnly: false });
    assert.equal(layout.settings.highlightLevels.warn, 'bg-sky-500/30 text-sky-900');
    assert.match(layout.settings.highlightLevels.good, /emerald/, 'defaults for the levels not set');
    assert.ok(layout.messages.warnings.some((m) => m.path === 'blockHighlights.levels.nope'));
  } finally {
    await t.close();
    await srv.close();
  }
});

test('showStats: the service setting wins over the global one', async () => {
  const t = await startApp({
    'settings.yaml': 'showStats: true\n',
    'services.yaml': '- G:\n    - A: { href: http://a.lan, container: a }\n    - B: { href: http://b.lan, container: b, showStats: false }\n',
  });
  try {
    const layout = await (await t.get('/api/layout')).json();
    assert.deepEqual(layout.groups[0].services.map((s) => s.showStats), [true, false]);
  } finally {
    await t.close();
  }
});

test('providers: shared keys and options fill widget entries, and stay secret', async () => {
  let auth;
  const srv = await serve((req, res) => { auth = req.headers.authorization; res.end(JSON.stringify({ count: 7 })); });
  const template = path.resolve('examples/widget-template');
  const t = await startApp({
    'settings.yaml': [
      'plugins:', `  - path: ${template}`,
      'providers:', '  counterkey: s3cret-provider-key', '  counterhost:', `    url: ${srv.url}/api/`, '',
    ].join('\n'),
    'services.yaml': [
      '- G:',
      '    - A:', '        widget: { type: example-counter, provider: counterkey, url: "' + srv.url + '/api/" }',
      '    - B:', '        widget: { type: example-counter, provider: counterhost, key: own-key }',
      '    - C:', '        widget: { type: example-counter, provider: nope, url: "' + srv.url + '/api/" }', '',
    ].join('\n'),
  });
  try {
    const res = await t.get('/api/layout');
    const raw = await res.text();
    const layout = JSON.parse(raw);
    assert.ok(!raw.includes('s3cret-provider-key'), 'the provider key never reaches the browser');
    const [a, b] = layout.groups[0].services.map((s) => s.widgets[0]);
    assert.equal(a.options.provider, undefined);
    await (await t.get(`/api/widgets/${a.instanceId}`)).json();
    assert.equal(auth, 'Bearer s3cret-provider-key', 'a text provider fills the first secret option');
    const rb = await (await t.get(`/api/widgets/${b.instanceId}`)).json();
    assert.equal(rb.ok, true, 'a map provider fills url');
    assert.equal(auth, 'Bearer own-key', 'options in the entry win');
    assert.ok(layout.messages.errors.some((e) => /provider "nope" is not in settings\.yaml providers/.test(e.message)));
  } finally {
    await t.close();
    await srv.close();
  }
});

test('hideVersion: false shows the version and checks for updates; nothing is fetched otherwise', async () => {
  let calls = 0;
  const gh = await serve((req, res) => { calls++; res.end(JSON.stringify({ tag_name: 'v99.0.0', html_url: 'https://github.com/example/releases/tag/v99.0.0' })); });
  const make = async (settings) => {
    const configDir = tmpDir('hd-app-');
    fs.writeFileSync(path.join(configDir, 'settings.yaml'), settings);
    return createApp({ configDir, log: silentLog, defaultPlugins: [], dockerSocket: null, releasesUrl: `${gh.url}/latest` });
  };
  try {
    const quiet = await make('title: x\n');
    assert.equal(quiet.layout.showVersion, false);
    quiet.close();
    const off = await make('hideVersion: false\ndisableUpdateCheck: true\n');
    assert.equal(off.layout.showVersion, true);
    assert.equal(off.layout.update, null);
    off.close();
    assert.equal(calls, 0, 'no request without the version shown, or with disableUpdateCheck');

    const on = await make('hideVersion: false\n');
    for (let i = 0; i < 50 && !on.layout.update; i++) await new Promise((r) => setTimeout(r, 20));
    assert.equal(calls, 1);
    assert.deepEqual(on.layout.update, { version: '99.0.0', url: 'https://github.com/example/releases/tag/v99.0.0' });
    on.close();
  } finally {
    await gh.close();
  }
});

test('disableIndexing: a robots meta tag and a robots.txt that disallows everything', async () => {
  const off = await startApp({});
  const on = await startApp({ 'settings.yaml': 'disableIndexing: true\n' });
  try {
    assert.equal(await (await off.get('/robots.txt')).text(), 'User-agent: *\nAllow: /\n');
    assert.ok(!(await (await off.get('/')).text()).includes('name="robots"'));
    const robots = await on.get('/robots.txt');
    assert.equal(robots.headers.get('content-type'), 'text/plain; charset=utf-8');
    assert.equal(await robots.text(), 'User-agent: *\nDisallow: /\n');
    assert.match(await (await on.get('/')).text(), /<meta name="robots" content="noindex, nofollow">/);
  } finally {
    await off.close();
    await on.close();
  }
});

test('custom.css and custom.js from the config folder are served and linked, only when they exist', async () => {
  const none = await startApp({});
  const both = await startApp({ 'custom.css': 'body { --hd-accent: hotpink; }', 'custom.js': 'window.customRan = true;' });
  try {
    const plain = await (await none.get('/')).text();
    assert.ok(!plain.includes('custom.css') && !plain.includes('custom.js'));
    assert.equal((await none.get('/custom.css')).status, 404);
    const html = await (await both.get('/')).text();
    assert.match(html, /<link rel="stylesheet" href="custom\.css">\n<\/head>/, 'after the page\'s own style');
    assert.match(html, /<script src="custom\.js" defer><\/script>\n<\/body>/);
    const css = await both.get('/custom.css');
    assert.equal(css.headers.get('content-type'), 'text/css; charset=utf-8');
    assert.equal(await css.text(), 'body { --hd-accent: hotpink; }');
    assert.equal((await both.get('/custom.js')).headers.get('content-type'), 'text/javascript; charset=utf-8');
  } finally {
    await none.close();
    await both.close();
  }
});

test('/api/suggest: a search widget\'s own settings, quicklaunch falling back to it, and never an error', async () => {
  let fail = false;
  const asked = [];
  const ac = await serve((req, res) => {
    asked.push(req.url);
    if (fail) { res.statusCode = 500; return res.end(); }
    res.end(JSON.stringify(['pl', ['plex', 'plex pass']]));
  });
  const t = await startApp({
    'widgets.yaml': `- search:\n    provider: custom\n    url: https://search.lan/?q={q}\n    showSearchSuggestions: true\n    suggestionUrl: ${ac.url}/ac?q=\n`,
    'settings.yaml': 'quicklaunch:\n  searchDescriptions: true\n',
  });
  try {
    const layout = await (await t.get('/api/layout')).json();
    const id = layout.header[0].instanceId;
    assert.deepEqual(await (await t.get(`/api/suggest?instance=${id}&q=pl`)).json(), { suggestions: ['plex', 'plex pass'] });
    assert.deepEqual(await (await t.get('/api/suggest?for=quicklaunch&q=pl')).json(), { suggestions: ['plex', 'plex pass'] });
    assert.deepEqual(asked, ['/ac?q=pl', '/ac?q=pl']);
    assert.deepEqual(await (await t.get('/api/suggest?instance=nope&q=pl')).json(), { suggestions: [] });
    assert.deepEqual(await (await t.get(`/api/suggest?instance=${id}&q=`)).json(), { suggestions: [] });
    fail = true;
    assert.deepEqual(await (await t.get(`/api/suggest?instance=${id}&q=pl`)).json(), { suggestions: [] }, 'a broken engine gives no suggestions');
  } finally {
    await t.close();
    await ac.close();
  }
});

test('refresh: a bare number of 1000 or more is milliseconds (homepage), smaller is seconds', async () => {
  const t = await startApp({ 'widgets.yaml': '- resources:\n    cpu: true\n    refresh: 3000\n- datetime:\n    refresh: 30\n' });
  try {
    const layout = await (await t.get('/api/layout')).json();
    assert.deepEqual(layout.header.map((w) => w.refreshMs), [3000, 30000]);
  } finally {
    await t.close();
  }
});

test('type: icon options reach the widget as URLs, resolved like service icons', async () => {
  const t = await startApp({ 'widgets.yaml': '- logo:\n    icon: mdi-home-#38bdf8\n- logo:\n    icon: Not An Icon!\n' });
  try {
    const layout = await (await t.get('/api/layout')).json();
    assert.equal(layout.header[0].options.icon, 'https://cdn.jsdelivr.net/npm/@mdi/svg@7.4.47/svg/home.svg#hd-mask=38bdf8');
    assert.equal(layout.header[1].options.icon, undefined);
    assert.ok(layout.messages.errors.some((e) => /icon: "Not An Icon!" is not an icon name or URL/.test(e.message)));
  } finally {
    await t.close();
  }
});

test('homepage\'s widget names work as aliases: type customapi is the custom-api widget', async () => {
  const t = await startApp({ 'services.yaml': '- G:\n    - A:\n        widget: { type: customapi, url: "http://a.lan/", mappings: [{ field: x }] }\n' });
  try {
    const layout = await (await t.get('/api/layout')).json();
    assert.equal(layout.groups[0].services[0].widgets[0].type, 'custom-api');
    assert.equal(layout.groups[0].services[0].widgets[0].known, true);
    assert.ok(layout.widgetTypes['custom-api']);
  } finally {
    await t.close();
  }
});
