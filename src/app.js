// The dashboard application: state (config, widgets, discovery) and the HTTP handler.
// src/server.js only parses arguments and listens; tests use createApp directly.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './config/load.js';
import { watchConfig } from './config/watch.js';
import { loadRegistry } from './plugins/loader.js';
import { syncPlugins, withDefaultPlugins, pluginUpdates, DEFAULT_PLUGINS } from './plugins/installer.js';
import { WidgetRuntime } from './plugins/runtime.js';
import { WidgetSandbox } from './plugins/sandbox.js';
import { Discovery, mergeDiscovered } from './discovery/index.js';
import { withMountedSocket, DEFAULT_SOCKET } from './discovery/docker.js';
import { buildState } from './layout.js';
import { renderIndex, renderManifest, renderRobots } from './page.js';
import { UpdateCheck, RELEASES_URL, isNewer } from './update.js';
import { suggestUrl, fetchSuggestions } from './suggest.js';
import { describeError, scrub } from './plugins/runtime.js';

export const ACTION_TIMEOUT_MS = 30_000;
export const CUSTOM_FILES = ['custom.css', 'custom.js'];
import { safeJoin } from './util.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PUBLIC_DIR = path.join(ROOT, 'public');
export const REPO_URL = 'https://github.com/stefanrenne/homelab-dashboard';
// HD_VERSION is set by the Docker build (1.2.3 or main-<sha>); otherwise package.json's version.
export const VERSION = process.env.HD_VERSION || JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;

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

/** The security headers; `frames` are the origins the page may frame (the iframe widget's src). */
export function securityHeaders(frames = []) {
  return {
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    'content-security-policy':
      "default-src 'self'; img-src * data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
      "font-src 'self' https://fonts.gstatic.com; script-src 'self' 'unsafe-inline'; connect-src 'self'; " +
      `frame-src ${frames.length ? frames.join(' ') : "'none'"}; frame-ancestors 'self'`,
  };
}
const SECURITY_HEADERS = securityHeaders();

/**
 * HD_ALLOWED_HOSTS (or homepage's HOMEPAGE_ALLOWED_HOSTS): the Host headers the dashboard answers,
 * comma-separated, against DNS rebinding. An entry without a port allows every port. Unset or
 * `*`: every host, as before. Loopback addresses are always allowed (the image's health check).
 */
export function allowedHosts(env = process.env) {
  const raw = env.HD_ALLOWED_HOSTS ?? env.HOMEPAGE_ALLOWED_HOSTS;
  if (raw === undefined || raw.trim() === '') return null;
  const list = raw.split(',').map((h) => h.trim().toLowerCase()).filter(Boolean);
  return list.includes('*') ? null : list;
}

const LOOPBACK = ['localhost', '127.0.0.1', '[::1]'];
export function hostAllowed(header, list) {
  if (!list) return true;
  const host = String(header ?? '').trim().toLowerCase();
  const name = host.replace(/:\d+$/, '');
  return LOOPBACK.includes(name) || list.includes(host) || list.includes(name);
}

/** The release (1.2.3) or commit (main-<sha>) page of this dashboard's version, or null. */
export function versionUrl(version) {
  if (/^\d+\.\d+\.\d+$/.test(version)) return `${REPO_URL}/releases/tag/v${version}`;
  const sha = /^main-([0-9a-f]{7,40})$/.exec(version)?.[1];
  return sha ? `${REPO_URL}/commit/${sha}` : null;
}

export async function createApp({
  configDir,
  // every widget comes from a plugin (the widgets collection by default); a folder of widgets
  // loaded in-process, before the plugins, is for tests
  builtinDir = null,
  publicDir = PUBLIC_DIR,
  env = process.env,
  log = console,
  watch = false,
  discovery: discoveryOptions = {},
  timeoutMs,
  defaultPlugins = DEFAULT_PLUGINS,
  dockerSocket = DEFAULT_SOCKET,
  releasesUrl = RELEASES_URL,
} = {}) {
  const sseClients = new Set();
  // installed widgets run in a worker thread (src/plugins/sandbox.js) unless HD_WIDGET_ISOLATION=off
  const sandbox = env.HD_WIDGET_ISOLATION === 'off' ? null : new WidgetSandbox({ log, memoryMb: Number(env.HD_WIDGET_MEMORY_MB) > 0 ? Number(env.HD_WIDGET_MEMORY_MB) : undefined });
  const runtime = new WidgetRuntime({ registry: new Map(), log, timeoutMs, sandbox, configDir: path.resolve(configDir) });
  const state = { config: null, registry: new Map(), pluginResult: { errors: [], warnings: [] }, registryErrors: [], layout: null, actions: new Map(), frames: [] };
  const updates = new UpdateCheck({ url: releasesUrl, log, onChange: () => state.config && rebuild() });
  const discovery = new Discovery({ log, env, onChange: () => state.config && rebuild(), ...discoveryOptions });
  let chain = Promise.resolve();

  function rebuild() {
    const merged = mergeDiscovered(state.config.services, discovery.found);
    const pluginMessages = (list) =>
      list.map((e) => ({ file: 'settings.yaml', path: `plugins: ${e.source}`, message: e.message }));
    const { instances, layout, actions, frames } = buildState({
      config: state.config,
      registry: state.registry,
      groups: merged.groups,
      extraErrors: [...pluginMessages(state.pluginResult.errors), ...pluginMessages(state.registryErrors), ...discovery.errors],
      extraWarnings: [...pluginMessages(state.pluginResult.warnings), ...merged.warnings],
      secrets: new Set([...state.config.secrets, ...discovery.secrets]),
    });
    runtime.setInstances(instances, state.registry, new Set([...state.config.secrets, ...discovery.secrets]));
    state.actions = actions;
    state.frames = frames;
    // the version is shown unless hideVersion: true, as in homepage
    const showVersion = state.config.settings.hideVersion !== true;
    if (showVersion && !state.config.settings.disableUpdateCheck) updates.start();
    else updates.stop();
    const latest = showVersion && !state.config.settings.disableUpdateCheck ? updates.latest : null;
    const update = latest && isNewer(latest.version, VERSION) ? latest : null;
    // the installed plugins (name and version) next to the version, behind the same setting
    const plugins = showVersion ? state.pluginResult.packages ?? [] : [];
    state.layout = { ...layout, version: VERSION, versionUrl: showVersion ? versionUrl(VERSION) : null, showVersion, update, plugins };
    broadcast('reload');
  }

  // pluginUpdateInterval: #latest and branch plugins are checked for a newer version, and only
  // a newer one is installed (and reloads the page)
  let pluginTimer = null;
  let pluginEvery = null;
  function schedulePluginChecks(ms) {
    if (ms === pluginEvery) return;
    pluginEvery = ms;
    clearInterval(pluginTimer);
    pluginTimer = ms > 0 ? setInterval(() => checkPluginUpdates().catch(() => {}), ms).unref() : null;
  }
  async function checkPluginUpdates() {
    if (!state.config) return [];
    const news = await pluginUpdates({ configDir, entries: withDefaultPlugins(state.config.settings.plugins, defaultPlugins) });
    if (news.length) {
      log.info(`plugins: a newer version of ${news.join(', ')}; updating`);
      await reload({ update: 'moving' });
    }
    return news;
  }

  /** Reloads everything; calls are queued so two reloads never interleave. */
  function reload({ update = false } = {}) {
    chain = chain.then(async () => {
      const config = loadConfig(configDir, { env });
      log.setLogPath?.(config.settings.logpath ? path.resolve(configDir, config.settings.logpath) : null);
      config.docker = withMountedSocket(config.docker, dockerSocket);
      schedulePluginChecks(config.settings.pluginUpdateMs);
      const entries = withDefaultPlugins(config.settings.plugins, defaultPlugins);
      const pluginResult = await syncPlugins({ configDir, entries, update, log });
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

  /**
   * Search suggestions for a search box: ?instance=<id> (a widget's own settings) or
   * ?for=quicklaunch (quicklaunch's settings, else the search widget's). Never fails: a
   * problem gives an empty list.
   */
  async function suggestions(params) {
    const q = (params.get('q') ?? '').trim().slice(0, 200);
    if (!q) return { suggestions: [] };
    const widgetOptions = (id) => runtime.instances.get(id)?.options ?? {};
    let source;
    if (params.get('for') === 'quicklaunch') {
      const ql = state.config.settings.quicklaunch ?? {};
      const searchWidget = (state.layout?.header ?? []).find((w) => w.type === 'search');
      const w = searchWidget ? widgetOptions(searchWidget.instanceId) : {};
      source = {
        showSearchSuggestions: ql.showSearchSuggestions ?? w.showSearchSuggestions,
        provider: ql.provider ?? w.provider,
        suggestionUrl: ql.provider ? ql.suggestionUrl : w.suggestionUrl,
      };
    } else source = widgetOptions(params.get('instance') ?? '');
    const base = suggestUrl(source);
    if (!base) return { suggestions: [] };
    try {
      return { suggestions: await fetchSuggestions(base, q) };
    } catch (err) {
      log.info(`suggestions: ${err.message}`);
      return { suggestions: [] };
    }
  }

  function broadcast(event) {
    for (const res of sseClients) res.write(`event: ${event}\ndata: {}\n\n`);
  }

  await reload();
  // HD_WATCH_POLL: seconds between checks for changes, for network file systems
  const pollSeconds = Number(env.HD_WATCH_POLL);
  if (env.HD_WATCH_POLL !== undefined && !(pollSeconds > 0)) log.warn(`HD_WATCH_POLL: "${env.HD_WATCH_POLL}" is not a number of seconds; watching as usual`);
  const watcher = watch ? watchConfig(configDir, () => reload(), { log, pollMs: pollSeconds > 0 ? Math.max(1, pollSeconds) * 1000 : 0 }) : null;
  const heartbeat = setInterval(() => {
    for (const res of sseClients) res.write(': ping\n\n');
  }, 25_000).unref();

  function send(res, status, body, type = 'application/json', headers = SECURITY_HEADERS) {
    const data = type === 'application/json' ? JSON.stringify(body) : body;
    res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store', ...headers });
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

  const hosts = allowedHosts(env);

  async function handler(req, res) {
    if (!hostAllowed(req.headers.host, hosts)) {
      log.warn(`refused a request for host "${String(req.headers.host ?? '').slice(0, 100)}" (not in HD_ALLOWED_HOSTS)`);
      return send(res, 403, 'Host not allowed; add it to HD_ALLOWED_HOSTS', 'text/plain; charset=utf-8');
    }
    const url = new URL(req.url, 'http://localhost');
    const p = decodeURIComponent(url.pathname);
    // HEAD is answered like GET (status checks of this dashboard use it); Node drops the body.
    const method = req.method === 'HEAD' ? 'GET' : req.method;
    try {
      // a first load that failed (see the log) leaves no config: say so instead of failing each request
      if (!state.config && p !== '/api/health') {
        return send(res, 503, 'The dashboard could not load its configuration; see its log.', 'text/plain; charset=utf-8');
      }
      if (method === 'GET' && (p === '/' || p === '/index.html')) {
        const html = await fs.promises.readFile(path.join(publicDir, 'index.html'), 'utf8');
        const custom = CUSTOM_FILES.filter((f) => fs.existsSync(path.join(configDir, f)));
        return send(res, 200, renderIndex(html, state.config.settings, state.config.secrets, custom), 'text/html; charset=utf-8', securityHeaders(state.frames));
      }
      if (method === 'GET' && p === '/robots.txt') return send(res, 200, renderRobots(state.config.settings), 'text/plain; charset=utf-8');
      if (method === 'GET' && p === '/site.webmanifest') {
        return send(res, 200, JSON.stringify(renderManifest(state.config.settings, state.config.secrets)), 'application/manifest+json');
      }
      if (method === 'GET' && p === '/api/health') return send(res, 200, { ok: true, version: VERSION });
      if (method === 'GET' && p === '/api/layout') return send(res, 200, state.layout);
      if (method === 'GET' && p === '/api/suggest') return send(res, 200, await suggestions(url.searchParams));
      if (method === 'GET' && p.startsWith('/api/widgets/')) {
        return send(res, 200, await runtime.get(p.slice('/api/widgets/'.length), Object.fromEntries(url.searchParams)));
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
      if (method === 'POST' && /^\/api\/widgets\/[^/]+\/action$/.test(p)) {
        // A custom header cannot be sent cross-site without a CORS preflight, which we never allow.
        if (req.headers['x-requested-with'] !== 'homelab-dashboard') return send(res, 403, { error: 'missing X-Requested-With' });
        const out = await runtime.action(p.split('/')[3]);
        return send(res, out.busy ? 409 : out.missing ? 404 : 200, out);
      }
      if (method === 'POST' && p.startsWith('/api/run/')) {
        // A custom header cannot be sent cross-site without a CORS preflight, which we never allow.
        if (req.headers['x-requested-with'] !== 'homelab-dashboard') return send(res, 403, { error: 'missing X-Requested-With' });
        const action = state.actions.get(p.slice('/api/run/'.length));
        if (!action) return send(res, 404, { error: 'no such action' });
        return send(res, 200, await runAction(action));
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
      // homepage's custom.css / custom.js from the config folder (the user's own, so 'self' in the CSP)
      if (method === 'GET' && CUSTOM_FILES.includes(p.slice(1))) return sendFile(res, path.join(configDir, p.slice(1)));
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

  /** Calls a `target: hidden-iframe` URL (configured, never from the request) and reports the outcome. */
  async function runAction(action) {
    const secrets = [...(state.config?.secrets ?? [])];
    try {
      const res = await fetch(action.href, { signal: AbortSignal.timeout(ACTION_TIMEOUT_MS), redirect: 'follow' });
      await res.body?.cancel();
      log.info(`action ${action.name}: ${res.status}`);
      return { ok: res.ok, status: res.status };
    } catch (err) {
      const error = scrub(describeError(err), secrets);
      log.warn(`action ${action.name}: ${error}`);
      return { ok: false, error };
    }
  }

  return {
    handler,
    reload,
    get layout() {
      return state.layout;
    },
    runtime,
    checkPluginUpdates,
    close() {
      clearInterval(pluginTimer);
      updates.stop();
      watcher?.close();
      discovery.stop();
      clearInterval(heartbeat);
      sandbox?.close();
      for (const res of sseClients) res.end();
    },
  };
}
