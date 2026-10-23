// Builds the widget instances (server side) and the layout (sent to the browser).
//
// The layout only ever carries public options (hard rule 1); the instances keep the
// full options for the runtime.

import { validateOptions } from './plugins/options.js';
import { DEFAULT_REFRESH_MS } from './plugins/loader.js';
import { stableId } from './util.js';

export const DASHBOARD_ICONS = 'https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons';

/**
 * `plex.svg` / `plex.png` / `plex.webp` -> dashboard-icons CDN, `/icons/x.svg` -> the
 * config's icons folder, `http(s)://...` as is. Anything else has no image.
 */
export function resolveIcon(icon) {
  if (!icon) return null;
  if (/^https?:\/\//.test(icon) || icon.startsWith('/icons/')) return icon;
  const match = /^([a-z0-9][a-z0-9-]*)\.(svg|png|webp)$/.exec(icon);
  return match ? `${DASHBOARD_ICONS}/${match[2]}/${icon}` : null;
}

export function buildState({ config, registry, groups, extraErrors = [], extraWarnings = [] }) {
  const instances = new Map();
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
    const { options, publicOptions, errors: optionErrors } = validateOptions(widget.manifest.options, rawOptions, config.secrets);
    for (const e of optionErrors) errors.push({ ...where, message: `${type}: ${e}` });
    const secretValues = [...config.secrets];
    for (const [name, def] of Object.entries(widget.manifest.options)) {
      if (def.secret && options[name] !== undefined) secretValues.push(...stringsIn(options[name]));
    }
    for (const [name, value] of Object.entries(options)) {
      if (!(name in widget.manifest.options)) secretValues.push(...stringsIn(value));
    }
    instances.set(id, { type, options, secretValues, refreshMs: widget.manifest.refreshMs, errors: optionErrors });
    return {
      instanceId: id,
      type,
      options: publicOptions,
      known: true,
      server: Boolean(widget.server),
      refreshMs: widget.manifest.refreshMs,
    };
  };

  const statusFor = (group, service, where) => {
    const id = stableId('s', group.name, service.name);
    if (service.siteMonitor) return addInstance(id, 'http-status', { url: service.siteMonitor }, where);
    if (service.ping) return addInstance(id, 'ping', { host: service.ping }, where);
    if (service.container) {
      const server =
        config.docker.find((s) => s.name === service.server) ?? (config.docker.length === 1 ? config.docker[0] : null);
      const conn = server?.url ? { url: server.url } : server?.socket ? { socket: server.socket } : {};
      return addInstance(id, 'docker', { container: service.container, ...conn }, where);
    }
    return null;
  };

  const layoutGroups = groups.map((group) => ({
    name: group.name,
    layout: config.settings.layout[group.name] ?? {},
    services: group.services.map((service) => {
      const where = { file: service.discovered ?? 'services.yaml', path: `${group.name}.${service.name}` };
      return {
        id: stableId('svc', group.name, service.name),
        name: service.name,
        href: service.href ?? null,
        target: service.target ?? config.settings.target,
        icon: resolveIcon(service.icon),
        description: service.description ?? null,
        discovered: service.discovered ?? null,
        status: statusFor(group, service, where),
        widgets: service.widgets.map((w, i) =>
          addInstance(stableId('w', group.name, service.name, String(i)), w.type, w.options, {
            file: where.file,
            path: w.path ?? where.path,
          }),
        ),
      };
    }),
  }));

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
    list.map((m) => ({ ...m, message: [...config.secrets].reduce((s, secret) => s.split(secret).join('***'), m.message) }));

  const layout = {
    settings: {
      title: config.settings.title,
      language: config.settings.language,
      theme: config.settings.theme,
      color: config.settings.color,
      background: config.settings.background ?? null,
    },
    header,
    groups: layoutGroups,
    bookmarks: config.bookmarks.map((g) => ({
      name: g.name,
      bookmarks: g.bookmarks.map((b) => ({ ...b, icon: resolveIcon(b.icon) })),
    })),
    widgetTypes,
    messages: { errors: scrubbed(errors), warnings: scrubbed(warnings) },
  };
  return { instances, layout };
}

function stringsIn(value) {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(stringsIn);
  if (value && typeof value === 'object') return Object.values(value).flatMap(stringsIn);
  return [];
}
