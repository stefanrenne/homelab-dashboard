// The worker thread that runs installed widgets' server.js (see sandbox.js). It builds the same
// ctx as the dashboard process: options, params, a signal, a cache per instance, a log and
// fetch. Results go back as plain data; anything else becomes the widget's error.

import { parentPort } from 'node:worker_threads';
import { widgetFetch, describeError } from './runtime.js';

const modules = new Map(); // server.js URL (with its mtime) -> the module's default export
const stores = new Map(); // instanceId -> Map for ctx.cache
const controllers = new Map(); // call id -> AbortController

const reply = (message) => {
  try {
    parentPort.postMessage(message);
  } catch (err) {
    parentPort.postMessage({ type: 'error', id: message.id, error: `fetch() must return plain data (${err.message})` });
  }
};

parentPort.on('message', async (m) => {
  if (m.type === 'abort') return controllers.get(m.id)?.abort(new Error(m.reason));
  if (m.type === 'keep') {
    for (const id of stores.keys()) if (!m.ids.includes(id)) stores.delete(id);
    return undefined;
  }
  if (m.type !== 'run') return undefined;
  const controller = new AbortController();
  controllers.set(m.id, controller);
  try {
    let server = modules.get(m.url);
    if (!server) {
      server = (await import(m.url)).default;
      if (!server || typeof server.fetch !== 'function') throw new Error('server.js must "export default { async fetch(ctx) { ... } }"');
      modules.set(m.url, server);
    }
    if (!stores.has(m.instanceId)) stores.set(m.instanceId, new Map());
    const log = Object.fromEntries(['info', 'warn', 'error'].map((level) => [level, (...a) => parentPort.postMessage({ type: 'log', id: m.id, level, text: a.map((x) => (typeof x === 'string' ? x : describeError(x))).join(' ') })]));
    const ctx = Object.freeze({
      apiVersion: 1,
      instanceId: m.instanceId,
      options: m.options,
      params: Object.freeze({ ...m.params }),
      signal: controller.signal,
      cache: stores.get(m.instanceId),
      log,
      fetch: (input, init = {}) => widgetFetch(input, init, m.options.url, controller.signal),
    });
    const data = await server.fetch(ctx);
    reply({ type: 'result', id: m.id, data: data ?? {} });
  } catch (err) {
    reply({ type: 'error', id: m.id, error: describeError(err) });
  } finally {
    controllers.delete(m.id);
  }
  return undefined;
});
