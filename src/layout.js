// Builds the widget instances (server side) and the layout (sent to the browser).
//
// The layout only ever carries public options (hard rule 1); the instances keep the
// full options for the runtime.

import { validateOptions } from './plugins/options.js';
import { DEFAULT_REFRESH_MS } from './plugins/loader.js';
import { stableId, parseDuration, isPlainObject } from './util.js';
import { DEFAULT_LEVELS } from './highlight.js';

/**
 * Keys of a widget entry that belong to the dashboard, not to the widget (unless the
 * widget declares an option with that name): how often to refresh, which blocks to show
 * and whether to hide errors. `refreshInterval` (ms) and `hide_errors` are homepage's names.
 */
export const INSTANCE_KEYS = ['refresh', 'refreshInterval', 'fields', 'hideErrors', 'hide_errors', 'highlight'];
export const MIN_REFRESH_MS = 1000;

function splitInstanceKeys(schema, raw) {
  const own = {};
  const options = {};
  for (const [key, value] of Object.entries(raw)) {
    if (INSTANCE_KEYS.includes(key) && !(key in schema)) own[key] = value;
    else options[key] = value;
  }
  return { own, options };
}

export const DASHBOARD_ICONS = 'https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons';

export const SIMPLE_ICONS = 'https://cdn.jsdelivr.net/npm/simple-icons@v13/icons';
export const MDI_ICONS = 'https://cdn.jsdelivr.net/npm/@mdi/svg@7.4.47/svg';
export const SELFHST_ICONS = 'https://cdn.jsdelivr.net/gh/selfhst/icons';

/**
 * `plex.svg` / `plex.png` / `plex.webp` -> dashboard-icons CDN, a bare `plex` -> its png
 * (as in homepage), `si-plex` -> Simple Icons, `mdi-flask` -> Material Design Icons (both with
 * an optional colour, `mdi-flask-#f0d453`), `sh-plex` / `sh-plex.svg` -> selfh.st icons,
 * `/icons/x.svg` -> the config's icons folder, `http(s)://...` as is. Anything else has no image.
 */
export function resolveIcon(icon) {
  if (!icon) return null;
  if (/^https?:\/\//.test(icon) || icon.startsWith('/icons/')) return icon;
  // Single-colour icons (Material Design, Simple Icons) are drawn as a mask in the page; the
  // #hd-mask fragment says so, with an optional colour (homepage's mdi-name-#f0d453).
  const mono = /^(mdi|si)-([a-z0-9][a-z0-9-]*?)(?:-#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8}))?$/i.exec(icon);
  if (mono) {
    const base = mono[1] === 'mdi' ? MDI_ICONS : SIMPLE_ICONS;
    return `${base}/${mono[2].toLowerCase()}.svg#hd-mask${mono[3] ? `=${mono[3].toLowerCase()}` : ''}`;
  }
  const selfhst = /^sh-([a-z0-9][a-z0-9-]*)(?:\.(svg|png|webp))?$/.exec(icon);
  if (selfhst) return `${SELFHST_ICONS}/${selfhst[2] ?? 'png'}/${selfhst[1]}.${selfhst[2] ?? 'png'}`;
  const match = /^([a-z0-9][a-z0-9-]*)(?:\.(svg|png|webp))?$/.exec(icon);
  if (!match) return null;
  const ext = match[2] ?? 'png';
  return `${DASHBOARD_ICONS}/${ext}/${match[1]}.${ext}`;
}

export function buildState({ config, registry, groups, extraErrors = [], extraWarnings = [], secrets = config.secrets }) {
  const instances = new Map();
  const actions = new Map(); // serviceId -> { name, href }: services the dashboard calls for the viewer
  const errors = [...config.errors, ...extraErrors];
  const warnings = [...config.warnings, ...extraWarnings];
  const usedTypes = new Set();

  const addInstance = (id, type, rawOptions, where) => {
    const widget = registry.get(type);
    usedTypes.add(type);
    if (!widget) {
      errors.push({ ...where, message: `unknown widget type "${type}"` });
      instances.set(id, { type, options: {}, secretValues: [], refreshMs: DEFAULT_REFRESH_MS, errors: [`unknown widget type "${type}"`] });
      return { instanceId: id, type, options: {}, known: false };
    }
    const { own, options: widgetOptions } = splitInstanceKeys(widget.manifest.options, rawOptions);
    const { options, publicOptions, errors: optionErrors } = validateOptions(widget.manifest.options, widgetOptions, secrets);
    let refreshMs = widget.manifest.refreshMs;
    try {
      if (own.refreshInterval !== undefined) refreshMs = Number(own.refreshInterval);
      else if (own.refresh !== undefined) refreshMs = parseDuration(own.refresh);
      if (!Number.isFinite(refreshMs)) throw new Error(`invalid refreshInterval "${own.refreshInterval}"`);
    } catch (err) {
      optionErrors.push(err.message);
      refreshMs = widget.manifest.refreshMs;
    }
    refreshMs = Math.max(MIN_REFRESH_MS, refreshMs);
    // No `fields` in the entry: the blocks the widget shows by default (widget.yaml defaultFields).
    const fields = Array.isArray(own.fields) ? own.fields.map(String) : widget.manifest.defaultFields ?? null;
    const hideErrors = own.hideErrors === true || own.hide_errors === true;
    for (const e of optionErrors) errors.push({ ...where, message: `${type}: ${e}` });
    const secretValues = [...secrets];
    for (const [name, def] of Object.entries(widget.manifest.options)) {
      if (def.secret && options[name] !== undefined) secretValues.push(...stringsIn(options[name]));
    }
    for (const [name, value] of Object.entries(options)) {
      if (!(name in widget.manifest.options)) secretValues.push(...stringsIn(value));
    }
    if (own.highlight !== undefined && !isPlainObject(own.highlight)) {
      errors.push({ ...where, message: `${type}: highlight: expected a map of block key to rules` });
    }
    const highlight = isPlainObject(own.highlight) ? own.highlight : null;
    instances.set(id, { type, options, secretValues, refreshMs, fields, highlight, errors: optionErrors });
    return {
      instanceId: id,
      type,
      options: publicOptions,
      known: true,
      server: Boolean(widget.server),
      refreshMs,
      ...(hideErrors ? { hideErrors } : {}),
    };
  };

  // Every check that is set gets its own status label, like homepage: HTTP, ping, container.
  const statusesFor = (group, service, where) => {
    const out = [];
    const id = (kind) => stableId('s', group.name, service.name, kind);
    if (service.siteMonitor) out.push({ kind: 'siteMonitor', ...addInstance(id('site'), 'http-status', { url: service.siteMonitor }, where) });
    if (service.ping) out.push({ kind: 'ping', ...addInstance(id('ping'), 'ping', { host: service.ping }, where) });
    if (service.container) {
      const server =
        config.docker.find((s) => s.name === service.server) ?? (config.docker.length === 1 ? config.docker[0] : null);
      const conn = server?.url ? { url: server.url } : server?.socket ? { socket: server.socket } : {};
      out.push({ kind: 'container', ...addInstance(id('container'), 'docker', { container: service.container, ...conn }, where) });
    }
    return out;
  };

  // A group's own layout keys (nested groups' layouts left out), with its category icon resolved.
  const groupLayout = (own) => {
    const layout = Object.fromEntries(Object.entries(isPlainObject(own) ? own : {}).filter(([, v]) => !isPlainObject(v)));
    if (layout.icon !== undefined) layout.icon = resolveIcon(String(layout.icon));
    return layout;
  };

  // `key` is the group's path ("Parent/Nested") for ids; top-level ids stay as they were.
  // A nested group's layout sits inside its parent's (homepage's format) and inherits its tab.
  const layoutGroup = (group, configured, key, parentTab) => {
    const own = isPlainObject(configured) ? configured : {};
    const layout = groupLayout(own);
    if (parentTab && !layout.tab) layout.tab = parentTab;
    return {
      name: group.name,
      layout,
      services: layoutServices({ ...group, name: key }),
      groups: (group.groups ?? []).map((g) => layoutGroup(g, own[g.name], `${key}/${g.name}`, layout.tab)),
    };
  };

  const layoutServices = (group) =>
    group.services.map((service) => {
      const where = { file: service.discovered ?? 'services.yaml', path: `${group.name}.${service.name}` };
      const id = stableId('svc', group.name, service.name);
      // homepage's `target: hidden-iframe` (a webhook): the server calls it and reports back.
      const target = service.target ?? config.settings.target;
      if (target === 'hidden-iframe' && /^https?:\/\//.test(service.href ?? '')) actions.set(id, { name: service.name, href: service.href });
      return {
        id,
        name: service.name,
        href: service.href ?? null,
        target: service.target ?? config.settings.target,
        icon: resolveIcon(service.icon),
        description: service.description ?? null,
        discovered: service.discovered ?? null,
        statusStyle: service.statusStyle ?? config.settings.statusStyle ?? null,
        showStats: service.showStats ?? config.settings.showStats ?? false,
        statuses: statusesFor(group, service, where),
        widgets: service.widgets.map((w, i) =>
          addInstance(stableId('w', group.name, service.name, String(i)), w.type, w.options, {
            file: where.file,
            path: w.path ?? where.path,
          }),
        ),
      };
    });

  // Groups follow the order of the layout block (homepage's sorting); the others come after,
  // in their own order. `order` lets the page put a bookmark group between service groups.
  const layoutNames = Object.keys(config.settings.layout);
  const orderOf = (name) => (layoutNames.includes(name) ? layoutNames.indexOf(name) : null);
  const byLayout = (list) =>
    list
      .map((item, i) => ({ item, i, order: orderOf(item.name) }))
      .sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity) || a.i - b.i)
      .map(({ item, order }) => ({ ...item, order }));
  const layoutGroups = byLayout(groups.map((group) => layoutGroup(group, config.settings.layout[group.name], group.name)));

  const header = config.widgets.map((w, i) =>
    addInstance(stableId('h', String(i), w.type), w.type, w.options, { file: 'widgets.yaml', path: w.path }),
  );

  const widgetTypes = {};
  for (const type of usedTypes) {
    const widget = registry.get(type);
    if (!widget) continue;
    const lang = config.settings.language;
    widgetTypes[type] = {
      name: widget.manifest.name,
      version: widget.manifest.version,
      source: widget.source,
      client: widget.hasClient ? `/widgets/${type}/client.js?v=${encodeURIComponent(widget.manifest.version)}` : null,
      i18n: { ...(widget.i18n.en ?? {}), ...(widget.i18n[lang] ?? {}) },
    };
  }

  const scrubbed = (list) =>
    list.map((m) => ({ ...m, message: [...secrets].reduce((s, secret) => s.split(secret).join('***'), m.message) }));

  // homepage's tabs: on when a layout group has `tab`, in the order of the layout block
  const tabs = [...new Set(Object.values(config.settings.layout).map((l) => l?.tab).filter((t) => typeof t === 'string' && t))];

  const layout = {
    tabs,
    settings: {
      title: config.settings.title,
      language: config.settings.language,
      theme: config.settings.theme,
      color: config.settings.color,
      background: config.settings.background ?? null,
      cardBlur: config.settings.cardBlur ?? null,
      bookmarksStyle: config.settings.bookmarksStyle ?? null,
      iconStyle: config.settings.iconStyle ?? 'gradient',
      cardStyle: config.settings.cardStyle ?? null,
      quicklaunch: config.settings.quicklaunch ?? {},
      highlightLevels: { ...DEFAULT_LEVELS, ...(config.settings.blockHighlights?.levels ?? {}) },
      blockStyle: config.settings.blockStyle ?? null,
      font: config.settings.font ?? null,
      fullWidth: config.settings.fullWidth === true,
      maxGroupColumns: config.settings.maxGroupColumns ?? null,
      maxBookmarkGroupColumns: config.settings.maxBookmarkGroupColumns ?? null,
      useEqualHeights: config.settings.useEqualHeights === true,
      disableCollapse: config.settings.disableCollapse === true,
      groupsInitiallyCollapsed: config.settings.groupsInitiallyCollapsed === true,
      showTitle: config.settings.showTitle,
      headerStyle: config.settings.headerStyle,
    },
    header,
    groups: layoutGroups,
    bookmarks: byLayout(config.bookmarks.map((g) => ({
      name: g.name,
      layout: groupLayout(config.settings.layout[g.name]),
      bookmarks: g.bookmarks.map((b) => ({ ...b, icon: resolveIcon(b.icon) })),
    }))),
    widgetTypes,
    messages: { errors: scrubbed(errors), warnings: scrubbed(warnings) },
  };
  return { instances, layout, actions };
}

function stringsIn(value) {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(stringsIn);
  if (value && typeof value === 'object') return Object.values(value).flatMap(stringsIn);
  return [];
}
