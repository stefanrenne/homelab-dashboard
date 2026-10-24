// The dashboard application: state (config, widgets, discovery) and the HTTP handler.
// src/server.js only parses arguments and listens; tests use createApp directly.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './config/load.js';
import { watchConfig } from './config/watch.js';
import { loadRegistry } from './plugins/loader.js';
import { syncPlugins } from './plugins/installer.js';
import { WidgetRuntime } from './plugins/runtime.js';
import { Discovery, mergeDiscovered } from './discovery/index.js';
import { buildState } from './layout.js';
import { safeJoin } from './util.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const BUILTIN_WIDGETS = path.join(ROOT, 'widgets');
export const PUBLIC_DIR = path.join(ROOT, 'public');
export const VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

const SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'content-security-policy':
    "default-src 'self'; img-src * data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "font-src 'self' https://fonts.gstatic.com; script-src 'self' 'unsafe-inline'; connect-src 'self'; " +
    // frame-src: services with `target: hidden-iframe` call their URL in a hidden frame (homepage feature).
    "frame-src http: https:; frame-ancestors 'self'",
};

export async function createApp({
  configDir,
  builtinDir = BUILTIN_WIDGETS,
  publicDir = PUBLIC_DIR,
  env = process.env,
  log = console,
  watch = false,
  discovery: discoveryOptions = {},
  timeoutMs,
} = {}) {
  const sseClients = new Set();
  const runtime = new WidgetRuntime({ registry: new Map(), log, timeoutMs });
  const state = { config: null, registry: new Map(), pluginResult: { errors: [], warnings: [] }, registryErrors: [], layout: null };
  const discovery = new Discovery({ log, env, onChange: () => state.config && rebuild(), ...discoveryOptions });
  let chain = Promise.resolve();

  function rebuild() {
    const merged = mergeDiscovered(state.config.services, discovery.found);
    const pluginMessages = (list) =>
      list.map((e) => ({ file: 'settings.yaml', path: `plugins: ${e.source}`, message: e.message }));
    const { instances, layout } = buildState({
      config: state.config,
      registry: state.registry,
      groups: merged.groups,
      extraErrors: [...pluginMessages(state.pluginResult.errors), ...pluginMessages(state.registryErrors), ...discovery.errors],
      extraWarnings: [...pluginMessages(state.pluginResult.warnings), ...merged.warnings],
      secrets: new Set([...state.config.secrets, ...discovery.secrets]),
    });
    runtime.setInstances(instances, state.registry);
    state.layout = { ...layout, version: VERSION };
    broadcast('reload');
  }

  /** Reloads everything; calls are queued so two reloads never interleave. */
  function reload({ update = false } = {}) {
    chain = chain.then(async () => {
      const config = loadConfig(configDir, { env });
      const pluginResult = await syncPlugins({ configDir, entries: config.settings.plugins, update, log });
      const { widgets, errors } = await loadRegistry({ builtinDir, external: pluginResult.installed });
      Object.assign(state, { config, registry: widgets, pluginResult, registryErrors: errors });
      for (const e of [...config.errors, ...pluginResult.errors, ...errors]) {
        log.warn(`config: ${e.file ?? e.source}${e.path ? ` ${e.path}` : ''}: ${e.message}`);
      }
      await discovery.configure(config); // its first poll calls rebuild() when something was found
      rebuild();
    }).catch((err) => log.error(`reload failed: ${err.stack ?? err}`));
    return chain;
  }

  function broadcast(event) {
    for (const res of sseClients) res.write(`event: ${event}\ndata: {}\n\n`);
  }

  await reload();
  const watcher = watch ? watchConfig(configDir, () => reload(), { log }) : null;
  const heartbeat = setInterval(() => {
    for (const res of sseClients) res.write(': ping\n\n');
  }, 25_000).unref();

  function send(res, status, body, type = 'application/json') {
    const data = type === 'application/json' ? JSON.stringify(body) : body;
    res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store', ...SECURITY_HEADERS });
    res.end(data);
  }

  function sendFile(res, file, { cache = 'no-cache' } = {}) {
    fs.readFile(file, (err, data) => {
      if (err) return send(res, 404, { error: 'not found' });
      res.writeHead(200, {
        'content-type': TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
        'cache-control': cache,
        ...SECURITY_HEADERS,
      });
      res.end(data);
    });
  }

  async function handler(req, res) {
    const url = new URL(req.url, 'http://localhost');
    const p = decodeURIComponent(url.pathname);
    // HEAD is answered like GET (status checks of this dashboard use it); Node drops the body.
    const method = req.method === 'HEAD' ? 'GET' : req.method;
    try {
      if (method === 'GET' && (p === '/' || p === '/index.html')) return sendFile(res, path.join(publicDir, 'index.html'));
      if (method === 'GET' && p === '/api/health') return send(res, 200, { ok: true, version: VERSION });
      if (method === 'GET' && p === '/api/layout') return send(res, 200, state.layout);
      if (method === 'GET' && p.startsWith('/api/widgets/')) {
        return send(res, 200, await runtime.get(p.slice('/api/widgets/'.length)));
      }
      if (method === 'GET' && p === '/api/events') {
        res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
        res.write(': connected\n\n');
        sseClients.add(res);
        req.on('close', () => sseClients.delete(res));
        return;
      }
      if (method === 'POST' && p === '/api/plugins/sync') {
        // A custom header cannot be sent cross-site without a CORS preflight, which we never allow.
        if (req.headers['x-requested-with'] !== 'homelab-dashboard') return send(res, 403, { error: 'missing X-Requested-With' });
        await reload({ update: url.searchParams.get('update') === '1' });
        return send(res, 200, { errors: state.pluginResult.errors, warnings: state.pluginResult.warnings });
      }
      if (method === 'GET' && p.startsWith('/widgets/')) {
        const [, , type, ...rest] = p.split('/');
        const widget = state.registry.get(type);
        // Only client.js and assets/ are public; checked on the resolved path, so
        // "assets/../server.js" is refused too.
        const full = widget ? safeJoin(widget.dir, rest.join('/')) : null;
        const allowed =
          full && (full === path.join(widget.dir, 'client.js') || full.startsWith(path.join(widget.dir, 'assets') + path.sep));
        return allowed ? sendFile(res, full, { cache: 'public, max-age=3600' }) : send(res, 404, { error: 'not found' });
      }
      if (method === 'GET' && p.startsWith('/icons/')) {
        const full = safeJoin(path.join(configDir, 'icons'), p.slice('/icons/'.length));
        return full ? sendFile(res, full, { cache: 'public, max-age=86400' }) : send(res, 404, { error: 'not found' });
      }
      return send(res, 404, { error: 'not found' });
    } catch (err) {
      log.error(`${req.method} ${p}: ${err.stack ?? err}`);
      return send(res, 500, { error: 'internal error' });
    }
  }

  return {
    handler,
    reload,
    get layout() {
      return state.layout;
    },
    runtime,
    close() {
      watcher?.close();
      discovery.stop();
      clearInterval(heartbeat);
      for (const res of sseClients) res.end();
    },
  };
}
