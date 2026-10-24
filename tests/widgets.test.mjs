// Built-in widgets, called through the public ctx contract only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { serve, fakeCtx, tmpDir } from './helpers.mjs';
import { widgetFetch } from '../src/plugins/runtime.js';
import { loadRegistry } from '../src/plugins/loader.js';
import httpStatus from '../widgets/http-status/server.js';
import customApi, { pick } from '../widgets/custom-api/server.js';
import docker, { cpuPercent } from '../widgets/docker/server.js';
import resources from '../widgets/resources/server.js';
import { parseLatency } from '../widgets/ping/server.js';

const LANGS = ['en', 'nl', 'fr', 'de', 'es'];

test('every built-in widget has its i18n keys in every language', async () => {
  const { widgets } = await loadRegistry({ builtinDir: path.resolve('widgets') });
  for (const w of widgets.values()) {
    const langs = Object.keys(w.i18n);
    if (langs.length === 0) continue;
    const keys = Object.keys(w.i18n.en).sort();
    for (const lang of LANGS) assert.deepEqual(Object.keys(w.i18n[lang] ?? {}).sort(), keys, `${w.id} ${lang}`);
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
    assert.deepEqual(out.blocks.map((b) => b.value), ['running (healthy)', 40, 200]);
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
  assert.deepEqual(mapValue({ format: 'bytes' }, 1536), { value: '1.5 KB', unit: undefined });
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
