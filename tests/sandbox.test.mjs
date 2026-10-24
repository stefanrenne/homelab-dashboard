// Installed widgets in the worker thread: the same ctx, and a widget that hangs or eats memory
// stops the worker, not the dashboard.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadWidget } from '../src/plugins/loader.js';
import { WidgetRuntime } from '../src/plugins/runtime.js';
import { WidgetSandbox } from '../src/plugins/sandbox.js';
import { tmpDir, writeWidget, serve } from './helpers.mjs';

const base = { name: 'T', version: '1.0.0', apiVersion: 1 };

async function setup(id, serverJs, { timeoutMs = 5000, memoryMb, source = 'path', options = {}, secretValues = [] } = {}) {
  const widget = await loadWidget(writeWidget(tmpDir(), { ...base, id, options: { url: { type: 'url' }, key: { type: 'string', secret: true } } }, { 'server.js': serverJs }), { source });
  const logs = [];
  const log = { info: (...a) => logs.push(a.join(' ')), warn: (...a) => logs.push(a.join(' ')), error: (...a) => logs.push(a.join(' ')) };
  const sandbox = new WidgetSandbox({ log, memoryMb, graceMs: 200 });
  const runtime = new WidgetRuntime({ registry: new Map([[id, widget]]), timeoutMs, log, sandbox });
  runtime.setInstances(new Map([['i1', { type: id, options, secretValues, refreshMs: 0 }]]));
  return { runtime, sandbox, logs, get: () => runtime.get('i1') };
}

test('sandbox: the ctx of the API, ctx.cache kept per instance, logs and fetch', async () => {
  const api = await serve((req, res) => res.end(JSON.stringify({ n: 7, auth: req.headers.authorization })));
  const { sandbox, logs, get } = await setup('iso', `
    import { isMainThread } from 'node:worker_threads';
    export default { async fetch(ctx) {
      const calls = (ctx.cache.get('calls') ?? 0) + 1;
      ctx.cache.set('calls', calls);
      ctx.log.info('called', calls);
      const r = await (await ctx.fetch('/x', { headers: { authorization: ctx.options.key } })).json();
      return { blocks: [{ label: 'n', value: r.n }, { label: 'auth', value: r.auth }, { label: 'calls', value: calls }, { label: 'main', value: String(isMainThread) }, { label: 'v', value: ctx.apiVersion }] };
    } };`, { options: { url: api.url, key: 'k3y' } });
  try {
    const first = await get();
    assert.deepEqual(first.data.blocks.map((b) => b.value), [7, 'k3y', 1, 'false', 1]);
    assert.equal((await get()).data.blocks[2].value, 2, 'ctx.cache lives on in the worker');
    assert.ok(logs.some((l) => l === 'widget iso: called 1'));
  } finally {
    sandbox.close();
    api.close();
  }
});

test('sandbox: a widget stuck in a loop is stopped; the dashboard keeps answering, the next call works', async () => {
  const flag = `${tmpDir()}/fixed`;
  const { sandbox, get } = await setup('loop', `
    import fs from 'node:fs';
    export default { async fetch(ctx) { let n = 0; if (!fs.existsSync(ctx.options.url)) for (;;) n++; return { blocks: [{ label: 'ok', value: 1 }] }; } };`, { options: { url: flag }, timeoutMs: 400 });
  try {
    let ticks = 0;
    const timer = setInterval(() => ticks++, 20);
    const stuck = await get();
    clearInterval(timer);
    assert.equal(stuck.ok, false);
    assert.match(stuck.error, /timed out after 400 ms/);
    assert.ok(ticks >= 10, 'the event loop kept running');
    await new Promise((r) => setTimeout(r, 300));
    assert.equal(sandbox.restarts, 1, 'the worker was restarted');
    (await import('node:fs')).writeFileSync(flag, '');
    const again = await get();
    assert.deepEqual([again.ok, again.data?.blocks[0].value], [true, 1], 'a fresh worker answers');
  } finally {
    sandbox.close();
  }
});

test('sandbox: a memory hog ends the worker with a message, not the dashboard', async () => {
  const { sandbox, get } = await setup('hog', `
    export default { async fetch() { const a = []; for (;;) a.push(new Array(1e5).fill(Math.random())); } };`, { timeoutMs: 20000, memoryMb: 32 });
  try {
    const out = await get();
    assert.equal(out.ok, false);
    assert.match(out.error, /widget worker stopped \(out of memory, the limit is 32 MB\)/);
  } finally {
    sandbox.close();
  }
});

test('sandbox: errors are scrubbed, non-plain data refused, built-ins stay in the process', async () => {
  const bad = await setup('bad', `export default { async fetch(ctx) { throw new Error('denied for ' + ctx.options.key); } };`, { options: { key: 's3cr3t' }, secretValues: ['s3cr3t'] });
  const fn = await setup('fn', `export default { async fetch() { return { blocks: [], f: () => 1 }; } };`);
  const builtin = await setup('own', `import { isMainThread } from 'node:worker_threads'; export default { async fetch() { return { blocks: [{ label: 'main', value: String(isMainThread) }] }; } };`, { source: 'builtin' });
  try {
    assert.equal((await bad.get()).error, 'denied for ***');
    assert.match((await fn.get()).error, /fetch\(\) must return plain data/);
    assert.equal((await builtin.get()).data.blocks[0].value, 'true');
  } finally {
    for (const s of [bad, fn, builtin]) s.sandbox.close();
  }
});
