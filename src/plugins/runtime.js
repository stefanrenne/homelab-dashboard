// Runs the server part of widget instances: builds `ctx`, enforces the timeout,
// caches results per instance and keeps failures inside the widget (hard rule 4).

import http from 'node:http';
import https from 'node:https';
import { highlightBlocks } from '../highlight.js';

export const DEFAULT_TIMEOUT_MS = 10_000;
export const BLOCK_STATUSES = ['ok', 'warn', 'error', 'unknown'];
export const SERVICE_STATUSES = ['up', 'down', 'warn', 'unknown'];
export const ROW_ICONS = ['play', 'pause'];

export class WidgetRuntime {
  /** `sandbox` (a WidgetSandbox) runs installed widgets in a worker thread; null runs them here. */
  constructor({ registry, timeoutMs = DEFAULT_TIMEOUT_MS, log = console, now = Date.now, sandbox = null }) {
    this.registry = registry;
    this.sandbox = sandbox;
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
    this.sandbox?.keep(instances.keys());
  }

  /**
   * The result of an instance. `params` come from the page (a client.js asked for them): only
   * the names the widget declares in widget.yaml `params`, as short text; each set of params
   * has its own cached result.
   */
  async get(instanceId, params = {}) {
    const instance = this.instances.get(instanceId);
    if (!instance) return { ok: false, error: 'unknown widget instance' };
    const allowed = this.registry.get(instance.type)?.manifest.params ?? [];
    const clean = Object.fromEntries(allowed.filter((k) => typeof params[k] === 'string' && params[k] && params[k].length <= 100).sort().map((k) => [k, params[k]]));
    const key = Object.keys(clean).length ? `${instanceId}?${new URLSearchParams(clean)}` : instanceId;
    const cached = this.cache.get(key);
    if (cached && cached.expires > this.now()) return cached.result;
    if (this.pending.has(key)) return this.pending.get(key);
    const promise = this.#run(instanceId, instance, clean, key).finally(() => this.pending.delete(key));
    this.pending.set(key, promise);
    return promise;
  }

  async #run(instanceId, instance, params = {}, key = instanceId) {
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
        const isolated = this.sandbox && widget.source !== 'builtin' && widget.serverUrl;
        const call = isolated
          ? () => this.sandbox.run({ url: widget.serverUrl, instanceId, options: structuredClone(instance.options), params, signal: controller.signal, log: this.#log(instance) })
          : () => widget.server.fetch(this.#context(instanceId, instance, controller.signal, params));
        const data = await Promise.race([
          Promise.resolve().then(call),
          new Promise((_, reject) => controller.signal.addEventListener('abort', () => reject(controller.signal.reason))),
        ]);
        const selected = selectFields(checkData(data ?? {}), instance.fields);
        result = { ok: true, data: highlightBlocks(selected, instance.highlight, instance.type), fetchedAt: this.now() };
      } catch (err) {
        const message = scrub(describeError(err), instance.secretValues);
        this.log.warn(`widget ${instance.type} (${instanceId}): ${message}`);
        result = { ok: false, error: message, fetchedAt: this.now() };
      } finally {
        clearTimeout(timer);
        controller.abort();
      }
    }
    if (this.instances.get(instanceId) === instance) {
      // many viewers' params could pile up: drop what has expired once the cache grows
      if (this.cache.size > 500) for (const [k, v] of this.cache) if (v.expires <= this.now()) this.cache.delete(k);
      this.cache.set(key, { result, expires: this.now() + instance.refreshMs });
    }
    return result;
  }

  #log(instance) {
    const prefix = `widget ${instance.type}:`;
    return {
      info: (...a) => this.log.info(prefix, ...a),
      warn: (...a) => this.log.warn(prefix, ...a),
      error: (...a) => this.log.error(prefix, ...a),
    };
  }

  #context(instanceId, instance, signal, params = {}) {
    if (!this.stores.has(instanceId)) this.stores.set(instanceId, new Map());
    const log = this.#log(instance);
    return Object.freeze({
      apiVersion: 1,
      instanceId,
      options: structuredClone(instance.options),
      params: Object.freeze({ ...params }),
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
  // insecure: true accepts a self-signed certificate for this request (an option the user sets);
  // tls: { ca, cert, key } (PEM text) trusts a CA and/or sends a client certificate (Docker over TLS)
  if ((init.insecure || init.tls) && new URL(String(url)).protocol === 'https:') return httpsFetch(new URL(String(url)), { ...init, signal: merged });
  const { insecure, tls, ...rest } = init;
  return fetch(url, { ...rest, signal: merged });
}

function httpsFetch(url, { method = 'GET', headers = {}, body, signal, insecure, tls }) {
  const { ca, cert, key } = tls ?? {};
  const certs = Object.fromEntries(Object.entries({ ca, cert, key }).filter(([, v]) => typeof v === 'string' && v));
  return new Promise((resolve, reject) => {
    const req = https.request(url, { method, headers: plainHeaders(headers), signal, ...certs, ...(insecure ? { rejectUnauthorized: false } : {}) }, (res) => resolve(collect(res)));
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function plainHeaders(headers) {
  return headers instanceof Headers ? Object.fromEntries(headers.entries()) : headers;
}

/** A Node response as a fetch Response; Set-Cookie stays a list (headers.getSetCookie()). */
function collect(res) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    res.on('data', (c) => chunks.push(c));
    res.on('end', () => {
      const status = res.statusCode ?? 500;
      const noBody = status === 204 || status === 304;
      resolve(new Response(noBody ? null : Buffer.concat(chunks), { status, headers: headerList(res.headers) }));
    });
    res.on('error', reject);
  });
}

function headerList(headers) {
  const out = [];
  for (const [k, v] of Object.entries(headers)) {
    if (v === undefined) continue;
    for (const one of Array.isArray(v) ? v : [v]) out.push([k, String(one)]);
  }
  return out;
}

function unixSocketFetch(pathAndQuery, { socketPath, method = 'GET', headers = {}, body, signal }) {
  return new Promise((resolve, reject) => {
    const req = http.request({ socketPath, path: pathAndQuery, method, headers: { host: 'localhost', ...plainHeaders(headers) }, signal }, (res) => resolve(collect(res)));
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

/** Validates what a widget returned; throws with a message meant for the widget author. */
export function checkData(data) {
  if (typeof data !== 'object' || Array.isArray(data)) throw new Error('fetch() must return an object');
  if (data.status !== undefined && !SERVICE_STATUSES.includes(data.status)) {
    throw new Error(`status must be one of ${SERVICE_STATUSES.join(', ')}`);
  }
  if (data.statusText !== undefined && typeof data.statusText !== 'string') throw new Error('statusText must be text');
  if (data.rows !== undefined) {
    if (!Array.isArray(data.rows)) throw new Error('rows must be a list');
    data.rows.forEach((r, i) => {
      if (typeof r !== 'object' || r === null || typeof r.label !== 'string') throw new Error(`rows[${i}]: needs a "label"`);
      if (r.value !== undefined && r.value !== null && !['string', 'number'].includes(typeof r.value)) throw new Error(`rows[${i}]: value must be text, a number or null`);
      if (r.progress !== undefined && !(typeof r.progress === 'number' && r.progress >= 0 && r.progress <= 100)) throw new Error(`rows[${i}]: progress must be 0-100`);
      if (r.status !== undefined && !BLOCK_STATUSES.includes(r.status)) throw new Error(`rows[${i}]: unknown status "${r.status}"`);
      if (r.icon !== undefined && !ROW_ICONS.includes(r.icon)) throw new Error(`rows[${i}]: icon must be one of ${ROW_ICONS.join(', ')}`);
      checkVars(r.vars, `rows[${i}]`);
    });
  }
  if (data.blocks !== undefined) {
    if (!Array.isArray(data.blocks)) throw new Error('blocks must be a list');
    data.blocks.forEach((b, i) => {
      if (typeof b !== 'object' || b === null || typeof b.label !== 'string') throw new Error(`blocks[${i}]: needs a "label"`);
      if (b.value !== null && !['string', 'number'].includes(typeof b.value)) throw new Error(`blocks[${i}]: value must be text, a number or null`);
      if (b.status !== undefined && !BLOCK_STATUSES.includes(b.status)) throw new Error(`blocks[${i}]: unknown status "${b.status}"`);
      if (b.key !== undefined && typeof b.key !== 'string') throw new Error(`blocks[${i}]: key must be text`);
      checkVars(b.vars, `blocks[${i}]`);
    });
  }
  return data;
}

/** `vars` fill `{name}` placeholders in a translated label: a map of text or numbers. */
function checkVars(vars, where) {
  if (vars === undefined) return;
  if (typeof vars !== 'object' || vars === null || Array.isArray(vars)) throw new Error(`${where}: vars must be a map`);
  for (const [k, v] of Object.entries(vars)) {
    if (!['string', 'number'].includes(typeof v)) throw new Error(`${where}: vars.${k} must be text or a number`);
  }
}

/** Keeps only the blocks named in `fields` (by `key`, else `label`), in the widget's order. */
export function selectFields(data, fields) {
  if (!fields || !Array.isArray(data.blocks)) return data;
  return { ...data, blocks: data.blocks.filter((b) => fields.includes(b.key ?? b.label)) };
}

/**
 * The message of an error plus the low-level cause Node hides behind "fetch failed"
 * ("fetch failed (ECONNREFUSED)"), so the dashboard can tell "unreachable" from "wrong key".
 */
export function describeError(err) {
  const message = err?.message ?? String(err);
  const cause = err?.cause?.code ?? err?.cause?.errors?.[0]?.code ?? err?.cause?.message;
  return cause && !message.includes(cause) ? `${message} (${cause})` : message;
}

/** Removes secret values from a message before it is logged or sent to the browser. */
export function scrub(message, secretValues = []) {
  let out = message;
  for (const s of secretValues) if (s && s.length >= 3) out = out.split(s).join('***');
  return out;
}
