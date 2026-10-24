import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createApp } from '../src/app.js';
import { watchConfig } from '../src/config/watch.js';
import { tmpDir, serve, silentLog } from './helpers.mjs';

const SECRET = 'super-secret-api-key-123';

async function startApp(files, env = {}) {
  const configDir = tmpDir('hd-app-');
  for (const [name, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(configDir, name)), { recursive: true });
    fs.writeFileSync(path.join(configDir, name), text);
  }
  const app = await createApp({ configDir, env, log: silentLog });
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
    'docker.yaml': 'local:\n  socket: /tmp/none.sock\n  discover: false\n',
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
    assert.deepEqual(services[2].statuses[0].options, { container: 'c', socket: '/tmp/none.sock' });
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

test('secrets from discovered labels stay out of the layout', async () => {
  const configDir = tmpDir('hd-app-');
  fs.writeFileSync(path.join(configDir, 'docker.yaml'), 'local:\n  socket: /tmp/x.sock\n');
  const app = await createApp({
    configDir,
    env: { HOMEPAGE_VAR_KEY: SECRET },
    log: silentLog,
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

test('static files: index, client.js, assets, icons, and no path traversal', async () => {
  const t = await startApp({
    'settings.yaml': `plugins:\n  - path: ${path.resolve('examples/widget-template')}\n`,
    'icons/my.svg': '<svg xmlns="http://www.w3.org/2000/svg"/>',
  });
  try {
    const index = await t.get('/');
    assert.equal(index.status, 200);
    assert.match(index.headers.get('content-security-policy'), /connect-src 'self'/);
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
