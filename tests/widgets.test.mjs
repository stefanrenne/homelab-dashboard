// Built-in widgets, called through the public ctx contract only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { serve, fakeCtx, tmpDir } from './helpers.mjs';
import { widgetFetch } from '../src/plugins/runtime.js';
import { loadRegistry } from '../src/plugins/loader.js';
import httpStatus from '../widgets/http-status/server.js';
import customApi, { pick } from '../widgets/custom-api/server.js';
import docker, { cpuPercent } from '../widgets/docker/server.js';
import openmeteo, { API as OPEN_METEO, condition as wmoCondition } from '../widgets/openmeteo/server.js';
import resources, { PATHS as RESOURCE_PATHS, formatUptime, formatBytes } from '../widgets/resources/server.js';
import { parseLatency } from '../widgets/ping/server.js';

const LANGS = ['en', 'nl', 'fr', 'de', 'es', 'ca', 'he', 'hr', 'hu', 'it', 'nb-NO', 'pt', 'ru', 'sv', 'vi', 'zh-Hans', 'zh-Hant'];

test('every built-in widget has its i18n keys in every language', async () => {
  const { widgets } = await loadRegistry({ builtinDir: path.resolve('widgets') });
  for (const w of widgets.values()) {
    const langs = Object.keys(w.i18n);
    if (langs.length === 0) continue;
    const keys = Object.keys(w.i18n.en).sort();
    for (const lang of LANGS) assert.deepEqual(Object.keys(w.i18n[lang] ?? {}).sort(), keys, `${w.id} ${lang}`);
  }
});

test('every built-in widget has a README for its docs page: title, example, real fields', async () => {
  const { widgets } = await loadRegistry({ builtinDir: path.resolve('widgets') });
  for (const w of widgets.values()) {
    const dir = path.resolve('widgets', w.id);
    const readme = fs.readFileSync(path.join(dir, 'README.md'), 'utf8');
    assert.equal(readme.split('\n')[0], `# ${w.manifest.name}`, `${w.id}: the title is the manifest name`);
    const example = readme.split(/^## Example$/m)[1] ?? '';
    assert.match(example, new RegExp(`type: ${w.id}\\b|- ${w.id}:`), `${w.id}: an example that uses it`);
    const fields = readme.split(/^## Fields$/m)[1]?.split(/^## /m)[0] ?? '';
    const server = fs.existsSync(path.join(dir, 'server.js')) ? fs.readFileSync(path.join(dir, 'server.js'), 'utf8') : '';
    for (const [, key] of fields.matchAll(/`([a-z][A-Za-z]*)`/g)) {
      assert.ok(server.includes(`'${key}'`), `${w.id}: field ${key} is not a block of server.js`);
    }
  }
});

test('http-status: up, login wall, server error and offline', async () => {
  const codes = { '/ok': 200, '/login': 401, '/broken': 503, '/nohead': 405 };
  const srv = await serve((req, res) => {
    res.statusCode = req.url === '/nohead' && req.method === 'GET' ? 200 : codes[req.url];
    res.end();
  });
  try {
    const check = (p, method = 'HEAD') => httpStatus.fetch(fakeCtx({ url: srv.url + p, method }));
    assert.equal((await check('/ok')).status, 'up');
    assert.equal((await check('/login')).status, 'up');
    assert.equal((await check('/broken')).status, 'down');
    assert.equal((await check('/nohead')).blocks[0].value, 200);
  } finally {
    await srv.close();
  }
  const offline = await httpStatus.fetch(fakeCtx({ url: srv.url + '/ok', method: 'HEAD' }));
  assert.equal(offline.status, 'down');
});

test('custom-api maps JSON fields to blocks', async () => {
  const srv = await serve((req, res) => {
    assert.equal(req.headers['x-api-key'], 'k');
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ data: { count: 42, ratio: 0.25, items: [{ name: 'a' }] } }));
  });
  try {
    const out = await customApi.fetch(fakeCtx({
      url: srv.url, method: 'GET', headers: { 'x-api-key': 'k' },
      mappings: [
        { field: 'data.count', label: 'Count' },
        { field: 'data.ratio', label: 'Ratio', scale: 100, unit: '%' },
        { field: 'data.items.0.name', label: 'First' },
        { field: 'data.missing', label: 'Missing' },
      ],
    }));
    assert.deepEqual(out.blocks, [
      { label: 'Count', value: 42 },
      { label: 'Ratio', value: 25, unit: '%' },
      { label: 'First', value: 'a' },
      { label: 'Missing', value: null },
    ]);
  } finally {
    await srv.close();
  }
  assert.equal(pick({ a: [{ b: 1 }] }, 'a.0.b'), 1);
});

test('docker: running container over a unix socket', async () => {
  const socketPath = path.join(tmpDir('hd-sock-'), 'd.sock');
  const srv = await serve((req, res) => {
    res.setHeader('content-type', 'application/json');
    if (req.url === '/containers/plex/json') return res.end(JSON.stringify({ State: { Status: 'running', Health: { Status: 'healthy' } } }));
    if (req.url.startsWith('/containers/plex/stats')) {
      return res.end(JSON.stringify({
        cpu_stats: { cpu_usage: { total_usage: 300 }, system_cpu_usage: 2000, online_cpus: 2 },
        precpu_stats: { cpu_usage: { total_usage: 100 }, system_cpu_usage: 1000 },
        memory_stats: { usage: 300 * 1048576, stats: { inactive_file: 100 * 1048576 } },
      }));
    }
    res.statusCode = 404;
    res.end('{}');
  }, { socketPath });
  const ctxFor = (container) => {
    const signal = new AbortController().signal;
    return fakeCtx({ container, socket: socketPath }, { signal, fetch: (i, init) => widgetFetch(i, init, undefined, signal) });
  };
  try {
    const out = await docker.fetch(ctxFor('plex'));
    assert.equal(out.status, 'up');
    assert.deepEqual(out.blocks.map((b) => b.value), ['running (healthy)', 40, 210]);
    assert.equal((await docker.fetch(ctxFor('nope'))).status, 'down');
  } finally {
    await srv.close();
  }
  assert.equal(cpuPercent({}), null);
});

test('resources: memory and disk now, CPU from the second call on', async () => {
  const ctx = fakeCtx({ cpu: true, memory: true, disk: ['/'] });
  const first = await resources.fetch(ctx);
  assert.deepEqual(first.blocks.map((b) => b.label), ['cpu', 'memory', 'disk']);
  assert.equal(first.blocks[0].value, null);
  // CPU counters tick in ~10 ms steps; keep sampling until they have moved.
  let second;
  for (let tries = 0; tries < 50; tries++) {
    await new Promise((r) => setTimeout(r, 20));
    second = await resources.fetch(ctx);
    if (second.blocks[0].value !== null) break;
  }
  assert.equal(typeof second.blocks[0].value, 'number');
  assert.ok(second.blocks[2].value >= 0 && second.blocks[2].value <= 100);
});

test('ping: latency parsing for Linux, BusyBox and macOS output', () => {
  assert.equal(parseLatency('64 bytes from 1.1.1.1: icmp_seq=1 ttl=57 time=12.3 ms'), 12.3);
  assert.equal(parseLatency('64 bytes from 10.0.0.1: seq=0 ttl=64 time=0.512 ms'), 0.5);
  assert.equal(parseLatency('time<1 ms'), 1);
  assert.equal(parseLatency('Request timeout'), null);
});

test('client-only widgets ship a client.js that defines hd-<id>', () => {
  for (const id of ['datetime', 'search']) {
    const src = fs.readFileSync(path.resolve('widgets', id, 'client.js'), 'utf8');
    assert.match(src, new RegExp(`customElements\\.define\\('hd-${id}'`));
  }
});

test('custom-api: homepage mapping options and list display', async () => {
  const { mapValue } = await import('../widgets/custom-api/server.js');
  const remap = [{ value: 'PLAYING', to: 'Playing' }, { any: true, to: 'Other' }];
  assert.deepEqual(mapValue({ remap }, 'PLAYING'), { value: 'Playing', unit: undefined });
  assert.deepEqual(mapValue({ remap }, 'X'), { value: 'Other', unit: undefined });
  assert.deepEqual(mapValue({ suffix: '%' }, 24), { value: 24, unit: '%' });
  assert.deepEqual(mapValue({ format: 'bytes' }, 1536), { value: '1.5 kB', unit: undefined });
  assert.deepEqual(mapValue({ format: 'percent', scale: 100 }, 0.5), { value: 50, unit: '%' });
  assert.deepEqual(mapValue({ prefix: 'v' }, '2.0.1'), { value: 'v2.0.1', unit: undefined });
  assert.deepEqual(mapValue({}, ''), { value: null });

  const srv = await serve((req, res) => res.end(JSON.stringify({ playbackState: 'STOPPED', currentTrack: { artist: '' }, volume: 24 })));
  try {
    const out = await customApi.fetch(fakeCtx({
      url: srv.url, method: 'GET', display: 'list',
      mappings: [
        { field: 'playbackState', label: 'State', remap: [{ value: 'STOPPED', to: 'Stopped' }] },
        { field: 'currentTrack.artist', label: 'Artist' },
        { field: 'volume', label: 'Volume', suffix: '%' },
      ],
    }));
    assert.deepEqual(out.rows, [
      { label: 'State', value: 'Stopped' },
      { label: 'Artist', value: '' },
      { label: 'Volume', value: '24 %' },
    ]);
  } finally {
    await srv.close();
  }
});

test('ping: a homepage-style URL means its host', async () => {
  const { hostOf } = await import('../widgets/ping/server.js');
  assert.equal(hostOf('http://192.168.1.50'), '192.168.1.50');
  assert.equal(hostOf('https://nas.lan:8443/x'), 'nas.lan');
  assert.equal(hostOf('nas.lan'), 'nas.lan');
});

test('resources: meters with free space for the homepage look', async () => {
  const out = await resources.fetch(fakeCtx({ cpu: false, memory: true, disk: ['/'] }));
  assert.deepEqual(out.meters.map((m) => [m.kind, m.caption]), [['memory', 'free'], ['disk', 'free']]);
  assert.match(out.meters[1].text, /^\d+(\.\d)? (B|KB|MB|GB|TB|PB)$/);
});

// ---- browser parts of built-in widgets, in jsdom
async function clientPage(file) {
  const { JSDOM } = await import('jsdom');
  const dom = new JSDOM('<!doctype html><body></body>', { runScripts: 'outside-only', url: 'http://localhost/' });
  dom.window.eval(fs.readFileSync(path.resolve(file), 'utf8'));
  return dom.window;
}

test('search widget: filter events while typing, web search only when the page lets it', async () => {
  const w = await clientPage('widgets/search/client.js');
  const opened = [];
  w.open = (url) => opened.push(url);
  const events = [];
  w.document.addEventListener('hd-search-input', (e) => events.push(['input', e.detail.query]));
  let handled = true;
  w.document.addEventListener('hd-search-submit', (e) => { events.push(['submit', e.detail.query]); if (handled) e.preventDefault(); });
  const el = w.document.createElement('hd-search');
  el.options = { provider: 'google' };
  el.t = (k) => k;
  w.document.body.append(el);
  const input = el.shadowRoot.querySelector('input');
  const form = el.shadowRoot.querySelector('form');
  assert.equal(input.getAttribute('aria-label'), 'placeholderFilter');
  input.value = 'radarr';
  input.dispatchEvent(new w.Event('input'));
  form.dispatchEvent(new w.Event('submit', { cancelable: true }));
  assert.deepEqual(events, [['input', 'radarr'], ['submit', 'radarr']]);
  assert.deepEqual(opened, [], 'the page opened the match');
  handled = false;
  form.dispatchEvent(new w.Event('submit', { cancelable: true }));
  assert.deepEqual(opened, ['https://www.google.com/search?q=radarr']);
  input.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape' }));
  assert.deepEqual(events.at(-1), ['input', '']);
  w.close();
});

test('resources widget: meters are exposed with role, value and a spoken label', async () => {
  const w = await clientPage('widgets/resources/client.js');
  const el = w.document.createElement('hd-resources');
  el.options = { label: 'Media' };
  el.t = (k) => ({ free: 'Free', used: 'used', disk: 'Disk', notFound: 'not found' })[k] ?? k;
  w.document.body.append(el);
  el.data = { meters: [
    { kind: 'disk', text: '25.7 TB', caption: 'free', percent: 60.4, mount: '/media' },
    { kind: 'disk', text: '/gone', caption: 'notFound', percent: 0, mount: '/gone', missing: true },
  ] };
  const [ok, missing] = el.shadowRoot.querySelectorAll('[role="meter"]');
  assert.equal(ok.getAttribute('aria-valuenow'), '60');
  assert.equal(ok.getAttribute('aria-label'), 'Media Disk: 25.7 TB Free, 60% used');
  assert.equal(missing.getAttribute('aria-label'), 'Media Disk: /gone not found');
  assert.ok(missing.classList.contains('missing'));
  w.close();
});


test('resources: CPU temperature, uptime, network rates, expanded details and binary disk units', async () => {
  const fake = tmpDir('hd-sys-');
  const sys = path.join(fake, 'sys');
  const proc = path.join(fake, 'proc');
  const put = (rel, text) => { fs.mkdirSync(path.dirname(path.join(fake, rel)), { recursive: true }); fs.writeFileSync(path.join(fake, rel), text); };
  put('sys/class/thermal/thermal_zone0/temp', '48000\n');
  put('sys/class/thermal/thermal_zone1/temp', '61500\n');
  put('sys/class/net/lo/statistics/rx_bytes', '0');
  put('sys/class/net/eth0/statistics/rx_bytes', '1000000');
  put('sys/class/net/eth0/statistics/tx_bytes', '500000');
  put('proc/net/route', 'Iface\tDestination\tGateway\neth0\t00000000\t0101A8C0\n');
  const saved = { ...RESOURCE_PATHS };
  Object.assign(RESOURCE_PATHS, { sys, proc });
  try {
    const opts = { cpu: false, memory: true, disk: [os.tmpdir()], cputemp: true, uptime: true, network: 'true', expanded: true, diskUnits: 'bbytes', units: 'metric' };
    const ctx = fakeCtx(opts);
    const first = await resources.fetch(ctx);
    const byKey = Object.fromEntries(first.blocks.map((b) => [b.key, b]));
    assert.deepEqual([byKey.cputemp.value, byKey.cputemp.unit], [61.5, '°C'], 'the hottest zone');
    assert.match(byKey.uptime.value, /^\d+(d \d+h|h \d+m|m)$/);
    assert.equal(byKey.rx.value, null, 'no rate before a second sample');
    const disk = first.meters.find((m) => m.kind === 'disk');
    assert.match(disk.text, /iB$/, 'diskUnits: bbytes');
    assert.match(disk.detail, /^[\d.]+ \w*iB \/ [\d.]+ \w*iB$/, 'expanded: used / total');
    assert.ok(first.meters.find((m) => m.kind === 'memory').detail.includes(' / '));
    assert.equal(first.meters.find((m) => m.kind === 'network').caption, 'eth0', 'the default route');

    // a second sample one second later: 2 MB in, 1 MB out
    ctx.cache.set('net:eth0', { ...ctx.cache.get('net:eth0'), at: Date.now() - 1000 });
    put('sys/class/net/eth0/statistics/rx_bytes', '3000000');
    put('sys/class/net/eth0/statistics/tx_bytes', '1500000');
    const second = await resources.fetch(ctx);
    const rx = second.blocks.find((b) => b.key === 'rx').value;
    assert.match(rx, /^(1\.9|2|2\.\d) MB\/s$/);

    const f = await resources.fetch(fakeCtx({ disk: [], cputemp: true, units: 'imperial', tempmin: 50, tempmax: 200 }));
    assert.deepEqual([f.blocks[0].value, f.blocks[0].unit], [142.7, '°F']);
    assert.equal(Math.round(f.meters[0].percent), 62);

    Object.assign(RESOURCE_PATHS, { sys: path.join(fake, 'none'), proc: path.join(fake, 'none') });
    const none = await resources.fetch(fakeCtx({ disk: [], cputemp: true, network: 'true' }));
    assert.deepEqual(none.blocks.map((b) => [b.key, b.value]), [['cputemp', null], ['rx', null], ['tx', null]], 'macOS: no readings, no crash');
  } finally {
    Object.assign(RESOURCE_PATHS, saved);
  }
  assert.equal(formatUptime(93784), '1d 2h');
  assert.equal(formatUptime(3700), '1h 1m');
  assert.equal(formatBytes(1536, true), '1.5 KiB');
});

/** A client-only widget's element, rendered in jsdom with the given options. */
async function renderClient(id, options, props = {}) {
  const { JSDOM } = await import('jsdom');
  const dom = new JSDOM('<!doctype html><html lang="en"><body></body></html>', { runScripts: 'outside-only', url: 'http://localhost/' });
  dom.window.eval(fs.readFileSync(path.resolve('widgets', id, 'client.js'), 'utf8'));
  const el = dom.window.document.createElement(`hd-${id}`);
  Object.assign(el, { options, t: (k) => k, ...props });
  dom.window.document.body.append(el);
  return { el, window: dom.window };
}

test('greeting: the text, in homepage\'s sizes', async () => {
  const { el } = await renderClient('greeting', { text: 'Welcome <home>', text_size: '3xl' });
  const box = el.shadowRoot.querySelector('.text');
  assert.equal(box.textContent, 'Welcome <home>');
  assert.equal(box.style.fontSize, '1.875rem');
  const plain = await renderClient('greeting', { text: 'Hi' });
  assert.equal(plain.el.shadowRoot.querySelector('.text').style.fontSize, '1.25rem');
});

test('logo: its own mark, an image, or a single-colour icon as a mask', async () => {
  const mark = await renderClient('logo', {});
  assert.ok(mark.el.shadowRoot.querySelector('svg.logo'));
  const img = await renderClient('logo', { icon: '/icons/logo.png' });
  assert.equal(img.el.shadowRoot.querySelector('img.logo').getAttribute('src'), 'icons/logo.png');
  const mask = await renderClient('logo', { icon: 'https://cdn.example.com/home.svg#hd-mask=38bdf8' });
  const span = mask.el.shadowRoot.querySelector('.logo.mask');
  assert.equal(span.style.getPropertyValue('--mask'), 'url("https://cdn.example.com/home.svg")');
  assert.equal(span.style.getPropertyValue('--fill'), '#38bdf8');
});


test('openmeteo: the current weather, units, the cache in minutes, and errors', async () => {
  const asked = [];
  let status = 200;
  const srv = await serve((req, res) => {
    asked.push(new URL(req.url, 'http://x').searchParams);
    res.statusCode = status;
    res.end(JSON.stringify({ current: { temperature_2m: 10.3, weather_code: 53, is_day: 0 } }));
  });
  const saved = OPEN_METEO.url;
  OPEN_METEO.url = `${srv.url}/v1/forecast`;
  try {
    const ctx = fakeCtx({ latitude: 52.37, longitude: 4.89, label: 'Amsterdam', units: 'metric', cache: 5 });
    const out = await openmeteo.fetch(ctx);
    assert.deepEqual(out.blocks, [{ key: 'temperature', label: 'temperature', value: 10.3, unit: '°C' }, { key: 'condition', label: 'condition', value: 'drizzle' }]);
    assert.deepEqual(out.weather, { temperature: 10.3, unit: '°C', condition: 'drizzle', day: false, label: 'Amsterdam', format: null });
    assert.equal(asked[0].get('latitude'), '52.37');
    assert.equal(asked[0].get('timezone'), 'auto');
    assert.equal(asked[0].get('temperature_unit'), null);
    await openmeteo.fetch(ctx);
    assert.equal(asked.length, 1, 'within cache minutes no new call');
    await openmeteo.fetch(fakeCtx({ latitude: 1, longitude: 2, units: 'imperial', cache: 5, timezone: 'Europe/Amsterdam' }));
    assert.equal(asked[1].get('temperature_unit'), 'fahrenheit');
    assert.equal(asked[1].get('timezone'), 'Europe/Amsterdam');
    status = 429;
    await assert.rejects(openmeteo.fetch(fakeCtx({ latitude: 1, longitude: 2, units: 'metric', cache: 5 })), /Open-Meteo answered 429/);
  } finally {
    OPEN_METEO.url = saved;
    await srv.close();
  }
  assert.deepEqual([0, 2, 3, 45, 51, 63, 81, 73, 95, 7].map(wmoCondition),
    ['clear', 'partlyCloudy', 'cloudy', 'fog', 'drizzle', 'rain', 'showers', 'snow', 'thunderstorm', 'unknown']);
});

test('openmeteo client: an icon, the temperature in the page language, label and condition', async () => {
  const { el, window } = await renderClient('openmeteo', {});
  window.document.documentElement.lang = 'nl';
  el.t = (k) => ({ drizzle: 'Motregen' })[k] ?? k;
  el.data = { weather: { temperature: 10.35, unit: '°C', condition: 'drizzle', day: false, label: 'Amsterdam', format: null } };
  const root = el.shadowRoot;
  assert.equal(root.querySelector('.temp').textContent, '10,4°C');
  assert.equal(root.querySelector('.cond').textContent, 'Amsterdam · Motregen');
  assert.ok(root.querySelector('svg'));
  assert.equal(root.querySelector('.w').getAttribute('aria-label'), 'Amsterdam, 10,4°C, Motregen');
});
