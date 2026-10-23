import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { loadWidget, loadRegistry, readManifest } from '../src/plugins/loader.js';
import { validateOptions } from '../src/plugins/options.js';
import { WidgetRuntime, checkData, scrub, widgetFetch } from '../src/plugins/runtime.js';
import { tmpDir, writeWidget, silentLog, serve } from './helpers.mjs';

const base = { name: 'T', version: '1.0.0', apiVersion: 1 };

test('a broken manifest names every problem', () => {
  const dir = writeWidget(tmpDir(), { id: 'Bad Id', apiVersion: 'one', options: { x: { type: 'color' } } });
  assert.throws(() => readManifest(dir), /id:.*name: required.*version: required.*apiVersion.*options\.x/);
});

test('an unsupported apiVersion is refused with a clear message', async () => {
  const dir = writeWidget(tmpDir(), { ...base, id: 'future', apiVersion: 99 });
  await assert.rejects(loadWidget(dir), /needs widget API 99, this dashboard supports 1/);
});

test('server.js must export a fetch function', async () => {
  const dir = writeWidget(tmpDir(), { ...base, id: 'nofetch' }, { 'server.js': 'export default {}' });
  await assert.rejects(loadWidget(dir), /must "export default/);
});

test('registry: built-ins load and cannot be replaced by an external widget', async () => {
  const ext = writeWidget(tmpDir(), { ...base, id: 'ping' });
  const { widgets, errors } = await loadRegistry({
    builtinDir: path.resolve('widgets'),
    external: [{ dir: ext, source: 'git+https://example/x#v1' }],
  });
  for (const id of ['datetime', 'search', 'resources', 'http-status', 'ping', 'docker', 'custom-api']) {
    assert.ok(widgets.has(id), id);
  }
  assert.equal(widgets.get('ping').source, 'builtin');
  assert.equal(errors.length, 1);
  assert.match(errors[0].message, /already used by builtin/);
});

test('options: defaults, coercion, required and public/secret split', () => {
  const schema = {
    url: { type: 'url', required: true },
    key: { type: 'string', secret: true },
    token: { type: 'string' },
    fields: { type: 'list', default: ['a'] },
    n: { type: 'number' },
    mode: { type: 'enum', values: ['x', 'y'] },
  };
  const out = validateOptions(schema, { url: 'http://h', key: 'k', token: 'from-env', n: '3', extra: 1 }, new Set(['from-env']));
  assert.deepEqual(out.errors, []);
  assert.deepEqual(out.options, { url: 'http://h', key: 'k', token: 'from-env', fields: ['a'], n: 3, extra: 1 });
  assert.deepEqual(out.publicOptions, { url: 'http://h', fields: ['a'], n: 3 });
  const bad = validateOptions(schema, { url: 'ftp://h', mode: 'z' });
  assert.deepEqual(bad.errors, ['url: expected an http(s) URL', 'mode: expected one of x, y']);
  assert.deepEqual(validateOptions(schema, {}).errors, ['url: required']);
});

async function runtimeWith(serverJs, { timeoutMs = 1000, refresh = '10s', options = {}, secretValues = [] } = {}) {
  const dir = writeWidget(tmpDir(), { ...base, id: 'w', refresh }, { 'server.js': serverJs });
  const widget = await loadWidget(dir);
  const rt = new WidgetRuntime({ registry: new Map([['w', widget]]), timeoutMs, log: silentLog });
  rt.setInstances(new Map([['i1', { type: 'w', options, secretValues, refreshMs: widget.manifest.refreshMs }]]));
  return rt;
}

test('runtime: a throwing widget becomes an error result', async () => {
  const rt = await runtimeWith('export default { async fetch() { throw new Error("boom") } }');
  assert.deepEqual(await rt.get('i1').then((r) => [r.ok, r.error]), [false, 'boom']);
});

test('runtime: a hanging widget times out', async () => {
  const rt = await runtimeWith('export default { fetch() { return new Promise(() => {}) } }', { timeoutMs: 50 });
  const r = await rt.get('i1');
  assert.equal(r.ok, false);
  assert.match(r.error, /timed out after 50 ms/);
});

test('runtime: secrets are scrubbed from error messages', async () => {
  const rt = await runtimeWith('export default { async fetch(ctx) { throw new Error("bad key " + ctx.options.key) } }', {
    options: { key: 'hunter22' },
    secretValues: ['hunter22'],
  });
  assert.equal((await rt.get('i1')).error, 'bad key ***');
});

test('runtime: results are cached and concurrent calls share one fetch', async () => {
  globalThis.__calls = 0;
  const rt = await runtimeWith('export default { async fetch(ctx) { globalThis.__calls++; ctx.cache.set("n", globalThis.__calls); return { blocks: [{ label: "n", value: globalThis.__calls }] } } }');
  const [a, b] = await Promise.all([rt.get('i1'), rt.get('i1')]);
  await rt.get('i1');
  assert.equal(globalThis.__calls, 1);
  assert.equal(a, b);
  assert.equal(a.data.blocks[0].value, 1);
});

test('runtime: unknown instances and invalid data', async () => {
  const rt = await runtimeWith('export default { async fetch() { return { blocks: "nope" } } }');
  assert.equal((await rt.get('missing')).ok, false);
  assert.match((await rt.get('i1')).error, /blocks must be a list/);
  assert.throws(() => checkData({ status: 'sideways' }), /status must be/);
  assert.throws(() => checkData({ blocks: [{ label: 'x', value: {} }] }), /value must be/);
  assert.equal(scrub('a=xyz', ['xyz']), 'a=***');
});

test('ctx.fetch resolves relative URLs against the url option', async () => {
  const srv = await serve((req, res) => res.end(req.url));
  try {
    const res = await widgetFetch('/api/x?y=1', {}, srv.url + '/base/', new AbortController().signal);
    assert.equal(await res.text(), '/api/x?y=1');
  } finally {
    await srv.close();
  }
});
