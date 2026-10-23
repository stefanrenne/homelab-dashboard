// Runs the server part of widget instances: builds `ctx`, enforces the timeout,
// caches results per instance and keeps failures inside the widget (hard rule 4).

import http from 'node:http';

export const DEFAULT_TIMEOUT_MS = 10_000;
export const BLOCK_STATUSES = ['ok', 'warn', 'error', 'unknown'];
export const SERVICE_STATUSES = ['up', 'down', 'warn', 'unknown'];

export class WidgetRuntime {
  constructor({ registry, timeoutMs = DEFAULT_TIMEOUT_MS, log = console, now = Date.now }) {
    this.registry = registry;
    this.timeoutMs = timeoutMs;
    this.log = log;
    this.now = now;
    this.instances = new Map(); // instanceId -> { type, options, secretValues, refreshMs }
    this.cache = new Map(); // instanceId -> { result, expires }
    this.pending = new Map(); // instanceId -> Promise
    this.stores = new Map(); // instanceId -> Map for ctx.cache
  }

  /** Replaces the set of instances; keeps ctx.cache stores of instances that still exist. */
  setInstances(instances, registry = this.registry) {
    this.registry = registry;
    this.instances = instances;
    this.cache.clear();
    for (const id of this.stores.keys()) if (!instances.has(id)) this.stores.delete(id);
  }

  async get(instanceId) {
    const instance = this.instances.get(instanceId);
    if (!instance) return { ok: false, error: 'unknown widget instance' };
    const cached = this.cache.get(instanceId);
    if (cached && cached.expires > this.now()) return cached.result;
    if (this.pending.has(instanceId)) return this.pending.get(instanceId);
    const promise = this.#run(instanceId, instance).finally(() => this.pending.delete(instanceId));
    this.pending.set(instanceId, promise);
    return promise;
  }

  async #run(instanceId, instance) {
    const widget = this.registry.get(instance.type);
    let result;
    if (!widget) {
      result = { ok: false, error: `unknown widget type "${instance.type}"` };
    } else if (instance.errors?.length) {
      result = { ok: false, error: `invalid options: ${instance.errors.join('; ')}` };
    } else if (!widget.server) {
      result = { ok: true, data: null, fetchedAt: this.now() };
    } else {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(new Error(`timed out after ${this.timeoutMs} ms`)), this.timeoutMs);
      try {
        const ctx = this.#context(instanceId, instance, controller.signal);
        const data = await Promise.race([
          Promise.resolve().then(() => widget.server.fetch(ctx)),
          new Promise((_, reject) => controller.signal.addEventListener('abort', () => reject(controller.signal.reason))),
        ]);
        result = { ok: true, data: checkData(data ?? {}), fetchedAt: this.now() };
      } catch (err) {
        const message = scrub(err?.message ?? String(err), instance.secretValues);
        this.log.warn(`widget ${instance.type} (${instanceId}): ${message}`);
        result = { ok: false, error: message, fetchedAt: this.now() };
      } finally {
        clearTimeout(timer);
        controller.abort();
      }
    }
    if (this.instances.get(instanceId) === instance) {
      this.cache.set(instanceId, { result, expires: this.now() + instance.refreshMs });
    }
    return result;
  }

  #context(instanceId, instance, signal) {
    if (!this.stores.has(instanceId)) this.stores.set(instanceId, new Map());
    const prefix = `widget ${instance.type}:`;
    const log = {
      info: (...a) => this.log.info(prefix, ...a),
      warn: (...a) => this.log.warn(prefix, ...a),
      error: (...a) => this.log.error(prefix, ...a),
    };
    return Object.freeze({
      apiVersion: 1,
      instanceId,
      options: structuredClone(instance.options),
      signal,
      cache: this.stores.get(instanceId),
      log,
      fetch: (input, init = {}) => widgetFetch(input, init, instance.options.url, signal),
    });
  }
}

/**
 * fetch() for widgets: relative URLs resolve against the `url` option, the call is
 * cancelled with the widget, and `socketPath` talks HTTP over a unix socket (Docker).
 */
export function widgetFetch(input, init, baseUrl, signal) {
  const merged = init.signal ? AbortSignal.any([signal, init.signal]) : signal;
  if (init.socketPath) return unixSocketFetch(String(input), { ...init, signal: merged });
  const url = baseUrl && !/^[a-z][a-z0-9+.-]*:/i.test(String(input)) ? new URL(String(input), baseUrl) : input;
  return fetch(url, { ...init, signal: merged });
}

function unixSocketFetch(pathAndQuery, { socketPath, method = 'GET', headers = {}, body, signal }) {
  return new Promise((resolve, reject) => {
    const req = http.request({ socketPath, path: pathAndQuery, method, headers: { host: 'localhost', ...headers }, signal }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const status = res.statusCode ?? 500;
        const noBody = status === 204 || status === 304;
        resolve(new Response(noBody ? null : Buffer.concat(chunks), { status, headers: flatHeaders(res.headers) }));
      });
      res.on('error', reject);
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function flatHeaders(headers) {
  const out = {};
  for (const [k, v] of Object.entries(headers)) if (v !== undefined) out[k] = Array.isArray(v) ? v.join(', ') : String(v);
  return out;
}

/** Validates what a widget returned; throws with a message meant for the widget author. */
export function checkData(data) {
  if (typeof data !== 'object' || Array.isArray(data)) throw new Error('fetch() must return an object');
  if (data.status !== undefined && !SERVICE_STATUSES.includes(data.status)) {
    throw new Error(`status must be one of ${SERVICE_STATUSES.join(', ')}`);
  }
  if (data.blocks !== undefined) {
    if (!Array.isArray(data.blocks)) throw new Error('blocks must be a list');
    data.blocks.forEach((b, i) => {
      if (typeof b !== 'object' || b === null || typeof b.label !== 'string') throw new Error(`blocks[${i}]: needs a "label"`);
      if (b.value !== null && !['string', 'number'].includes(typeof b.value)) throw new Error(`blocks[${i}]: value must be text, a number or null`);
      if (b.status !== undefined && !BLOCK_STATUSES.includes(b.status)) throw new Error(`blocks[${i}]: unknown status "${b.status}"`);
    });
  }
  return data;
}

/** Removes secret values from a message before it is logged or sent to the browser. */
export function scrub(message, secretValues = []) {
  let out = message;
  for (const s of secretValues) if (s && s.length >= 3) out = out.split(s).join('***');
  return out;
}
