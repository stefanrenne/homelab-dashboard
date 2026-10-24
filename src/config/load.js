// Loads and normalizes the YAML files in the config directory.
//
// The file formats are a contract with existing installations (hard rule 6): see
// docs/configuration.md. Problems never throw; they are collected as `errors`
// (the file or entry is skipped) and `warnings` (it is used anyway), each with the
// file and a path into it, so the dashboard can show them.

import fs from 'node:fs';
import path from 'node:path';
import { substitute } from './vars.js';
import { parseConfigYaml, resolveIncludes } from './include.js';
import { isPlainObject } from '../util.js';

export const CONFIG_FILES = ['settings', 'services', 'widgets', 'bookmarks', 'docker', 'kubernetes'];

export const DEFAULT_SETTINGS = {
  title: 'Homelab',
  language: 'en',
  theme: 'auto', // auto | dark | light
  color: 'slate',
  target: '_blank',
  showTitle: true,
  headerStyle: 'boxed', // boxed | clean
  layout: {},
  plugins: [],
  discovery: { interval: '30s' },
};

const SERVICE_KEYS = new Set([
  'href', 'icon', 'description', 'siteMonitor', 'ping', 'container', 'server', 'widget', 'widgets', 'target',
]);

export function loadConfig(dir, opts = {}) {
  const errors = [];
  const warnings = [];
  const secrets = new Set();
  const raw = {};

  for (const name of CONFIG_FILES) {
    const file = `${name}.yaml`;
    const full = path.join(dir, file);
    let text;
    try {
      text = fs.readFileSync(full, 'utf8');
    } catch (err) {
      if (err.code !== 'ENOENT') errors.push({ file, path: '', message: `cannot read: ${err.code || err.message}` });
      continue;
    }
    let parsed;
    try {
      parsed = parseConfigYaml(text);
    } catch (err) {
      const line = err.linePos?.[0]?.line;
      errors.push({ file, path: line ? `line ${line}` : '', message: err.message.split('\n')[0] });
      continue;
    }
    // includes first, so variables and secrets in included files are handled the same way
    parsed = resolveIncludes(parsed, { configDir: dir, file, errors });
    const sub = substitute(parsed, opts);
    for (const s of sub.secrets) secrets.add(s);
    for (const w of sub.warnings) warnings.push({ file, path: '', message: w });
    raw[name] = sub.value;
  }

  const ctx = {
    error: (file, p, message) => errors.push({ file, path: p, message }),
    warn: (file, p, message) => warnings.push({ file, path: p, message }),
  };

  return {
    settings: normalizeSettings(raw.settings, ctx),
    services: normalizeServices(raw.services, ctx),
    widgets: normalizeHeaderWidgets(raw.widgets, ctx),
    bookmarks: normalizeBookmarks(raw.bookmarks, ctx),
    docker: normalizeDocker(raw.docker, ctx),
    kubernetes: normalizeKubernetes(raw.kubernetes, ctx),
    errors,
    warnings,
    secrets,
  };
}

/** `- Key: value` entries: a list of single-key maps. Returns [[key, value, index]]. */
function singleKeyEntries(list, file, p, ctx) {
  if (list === undefined || list === null) return [];
  if (!Array.isArray(list)) {
    ctx.error(file, p, 'expected a list');
    return [];
  }
  const out = [];
  list.forEach((entry, i) => {
    if (!isPlainObject(entry) || Object.keys(entry).length !== 1) {
      ctx.error(file, `${p}[${i}]`, 'expected an entry like "- Name: ..."');
      return;
    }
    const [key, value] = Object.entries(entry)[0];
    out.push([key, value, i]);
  });
  return out;
}

export function normalizeSettings(raw, ctx) {
  const file = 'settings.yaml';
  if (raw === undefined || raw === null) raw = {};
  if (!isPlainObject(raw)) {
    ctx.error(file, '', 'expected a map of settings');
    raw = {};
  }
  const settings = { ...DEFAULT_SETTINGS, ...raw };
  settings.discovery = { ...DEFAULT_SETTINGS.discovery, ...(isPlainObject(raw.discovery) ? raw.discovery : {}) };
  if (!['auto', 'dark', 'light'].includes(settings.theme)) {
    ctx.warn(file, 'theme', `unknown theme "${settings.theme}", using auto`);
    settings.theme = 'auto';
  }
  if (!['boxed', 'clean'].includes(settings.headerStyle)) {
    ctx.warn(file, 'headerStyle', `unknown headerStyle "${settings.headerStyle}", using boxed`);
    settings.headerStyle = 'boxed';
  }
  settings.showTitle = settings.showTitle !== false;
  for (const key of ['description', 'favicon', 'startUrl']) {
    if (settings[key] === undefined || settings[key] === null) delete settings[key];
    else if (typeof settings[key] !== 'string') {
      ctx.warn(file, key, 'expected text, ignored');
      delete settings[key];
    } else settings[key] = settings[key].trim();
  }
  settings.pwa = normalizePwa(settings.pwa, file, ctx);
  for (const key of ['fullWidth', 'useEqualHeights', 'disableCollapse', 'groupsInitiallyCollapsed']) {
    if (settings[key] !== undefined && typeof settings[key] !== 'boolean') {
      ctx.warn(file, key, 'expected true or false, ignored');
      delete settings[key];
    }
  }
  for (const key of ['maxGroupColumns', 'maxBookmarkGroupColumns']) {
    if (settings[key] === undefined) continue;
    const n = Number(settings[key]);
    if (!Number.isInteger(n) || n < 1 || n > 8) {
      ctx.warn(file, key, 'expected a whole number up to 8, ignored');
      delete settings[key];
    } else settings[key] = n;
  }
  if (settings.iconStyle !== undefined && !['gradient', 'theme'].includes(settings.iconStyle)) {
    ctx.warn(file, 'iconStyle', 'expected gradient or theme, using gradient');
    delete settings.iconStyle;
  }
  if (settings.bookmarksStyle !== undefined && settings.bookmarksStyle !== 'icons') {
    ctx.warn(file, 'bookmarksStyle', 'expected "icons" (or leave it out), ignored');
    delete settings.bookmarksStyle;
  }
  settings.background = normalizeBackground(settings.background, file, ctx);
  settings.cardBlur = blurPx(settings.cardBlur, file, 'cardBlur', ctx);
  // homepage also takes the layout block as a list (- Group: {...}), to set the order
  if (Array.isArray(settings.layout)) {
    const map = {};
    settings.layout.forEach((entry, i) => {
      if (isPlainObject(entry) && Object.keys(entry).length === 1) {
        const [name, value] = Object.entries(entry)[0];
        map[name] = isPlainObject(value) ? value : {};
      } else if (typeof entry === 'string') map[entry] = {};
      else ctx.warn(file, `layout[${i}]`, 'expected an entry like "- Group name:", ignored');
    });
    settings.layout = map;
  }
  if (!isPlainObject(settings.layout)) {
    ctx.error(file, 'layout', 'expected a map of group name to layout');
    settings.layout = {};
  }
  for (const [name, value] of Object.entries(settings.layout)) if (value === null) settings.layout[name] = {};
  if (!Array.isArray(settings.plugins)) {
    ctx.error(file, 'plugins', 'expected a list');
    settings.plugins = [];
  }
  settings.plugins = settings.plugins.filter((p, i) => {
    if (isPlainObject(p) && (typeof p.source === 'string' || typeof p.path === 'string')) return true;
    ctx.error(file, `plugins[${i}]`, 'expected "source: <git+url#ref | npm:name@version>" or "path: <folder>"');
    return false;
  });
  return settings;
}

// homepage's blur sizes (Tailwind's scale) in pixels; '' is Tailwind's plain `blur`.
export const BLUR_PX = { none: 0, xs: 4, sm: 8, '': 8, md: 12, lg: 16, xl: 24, '2xl': 40, '3xl': 64 };

function blurPx(value, file, p, ctx) {
  if (value === undefined || value === null) return null;
  const px = BLUR_PX[String(value)];
  if (px === undefined) {
    ctx.warn(file, p, `unknown blur "${value}" (${Object.keys(BLUR_PX).filter(Boolean).join(', ')}), ignored`);
    return null;
  }
  return px;
}

/** `background: <url>` or homepage's `{ image, blur, saturate, brightness, opacity }`. */
function normalizeBackground(raw, file, ctx) {
  if (raw === undefined || raw === null || raw === '') return null;
  if (typeof raw === 'string') return { image: raw };
  if (!isPlainObject(raw) || typeof raw.image !== 'string') {
    ctx.warn(file, 'background', 'expected an image URL, or a map with image, blur, saturate, brightness, opacity; ignored');
    return null;
  }
  const background = { image: raw.image };
  const blur = blurPx(raw.blur, file, 'background.blur', ctx);
  if (blur !== null) background.blur = blur;
  for (const [key, max] of [['saturate', 200], ['brightness', 200], ['opacity', 100]]) {
    if (raw[key] === undefined || raw[key] === null) continue;
    const n = Number(raw[key]);
    if (!Number.isFinite(n) || n < 0 || n > max) ctx.warn(file, `background.${key}`, `expected a number from 0 to ${max}, ignored`);
    else background[key] = n;
  }
  return background;
}

/** homepage's `pwa:`: `icons` [{ src, type, sizes }] and `shortcuts` [{ name, url, description }]. */
function normalizePwa(raw, file, ctx) {
  if (raw === undefined || raw === null) return {};
  if (!isPlainObject(raw)) {
    ctx.warn(file, 'pwa', 'expected a map with icons and shortcuts, ignored');
    return {};
  }
  const list = (key, required, optional) => {
    if (raw[key] === undefined) return [];
    if (!Array.isArray(raw[key])) {
      ctx.warn(file, `pwa.${key}`, 'expected a list, ignored');
      return [];
    }
    return raw[key].flatMap((item, i) => {
      if (!isPlainObject(item) || required.some((k) => typeof item[k] !== 'string')) {
        ctx.warn(file, `pwa.${key}[${i}]`, `expected ${required.join(' and ')}, ignored`);
        return [];
      }
      return [Object.fromEntries([...required, ...optional].filter((k) => item[k] !== undefined).map((k) => [k, String(item[k])]))];
    });
  };
  return { icons: list('icons', ['src'], ['type', 'sizes', 'purpose']), shortcuts: list('shortcuts', ['name', 'url'], ['description']) };
}

export function normalizeServices(raw, ctx) {
  const file = 'services.yaml';
  return singleKeyEntries(raw, file, '', ctx).map(([name, list, gi]) => normalizeGroup(name, list, file, `[${gi}].${name}`, ctx));
}

/**
 * A group: its services, and nested groups (homepage's format: an entry whose value is a list
 * instead of a map), in { name, services, groups }.
 */
function normalizeGroup(name, list, file, p, ctx) {
  const group = { name: String(name), services: [], groups: [] };
  for (const [itemName, def, i] of singleKeyEntries(list, file, p, ctx)) {
    if (Array.isArray(def)) group.groups.push(normalizeGroup(itemName, def, file, `${p}[${i}].${itemName}`, ctx));
    else {
      const service = normalizeService(itemName, def ?? {}, file, `${p}[${i}].${itemName}`, ctx);
      if (service) group.services.push(service);
    }
  }
  return group;
}

export function normalizeService(name, def, file, p, ctx) {
  if (!isPlainObject(def)) {
    ctx.error(file, p, 'expected a map with href, icon, widget, ...');
    return null;
  }
  for (const key of Object.keys(def)) {
    if (!SERVICE_KEYS.has(key)) ctx.warn(file, `${p}.${key}`, 'unknown key, ignored');
  }
  const service = { name: String(name) };
  for (const key of ['href', 'icon', 'description', 'siteMonitor', 'ping', 'container', 'server', 'target']) {
    if (def[key] !== undefined && def[key] !== null) service[key] = String(def[key]);
  }
  const widgets = [];
  if (def.widget !== undefined) widgets.push([def.widget, `${p}.widget`]);
  if (def.widgets !== undefined) {
    if (Array.isArray(def.widgets)) def.widgets.forEach((w, i) => widgets.push([w, `${p}.widgets[${i}]`]));
    else ctx.error(file, `${p}.widgets`, 'expected a list');
  }
  service.widgets = [];
  for (const [w, wp] of widgets) {
    if (!isPlainObject(w) || typeof w.type !== 'string') {
      ctx.error(file, wp, 'a widget needs a "type"');
      continue;
    }
    const { type, ...options } = w;
    service.widgets.push({ type, options, path: wp });
  }
  return service;
}

export function normalizeHeaderWidgets(raw, ctx) {
  const file = 'widgets.yaml';
  return singleKeyEntries(raw, file, '', ctx).map(([type, options, i]) => {
    if (options !== null && options !== undefined && !isPlainObject(options)) {
      ctx.error(file, `[${i}].${type}`, 'expected a map of options');
      options = {};
    }
    return { type, options: options ?? {}, path: `[${i}].${type}` };
  });
}

export function normalizeBookmarks(raw, ctx) {
  const file = 'bookmarks.yaml';
  const groups = [];
  for (const [groupName, list, gi] of singleKeyEntries(raw, file, '', ctx)) {
    const group = { name: String(groupName), bookmarks: [] };
    for (const [name, def, bi] of singleKeyEntries(list, file, `[${gi}].${groupName}`, ctx)) {
      // homepage style is a one-item list (`- abbr: GH`), a plain map is accepted too.
      const body = Array.isArray(def) ? def[0] : def;
      if (!isPlainObject(body) || typeof body.href !== 'string') {
        ctx.error(file, `[${gi}].${groupName}[${bi}].${name}`, 'a bookmark needs an "href"');
        continue;
      }
      group.bookmarks.push({
        name: String(name),
        href: body.href,
        ...(body.abbr ? { abbr: String(body.abbr) } : {}),
        ...(body.icon ? { icon: String(body.icon) } : {}),
        ...(body.description ? { description: String(body.description) } : {}),
      });
    }
    groups.push(group);
  }
  return groups;
}

export function normalizeDocker(raw, ctx) {
  const file = 'docker.yaml';
  if (raw === undefined || raw === null) return [];
  if (!isPlainObject(raw)) {
    ctx.error(file, '', 'expected a map of server name to { socket } or { host, port }');
    return [];
  }
  const servers = [];
  for (const [name, def] of Object.entries(raw)) {
    if (!isPlainObject(def)) {
      ctx.error(file, name, 'expected { socket } or { host, port }');
      continue;
    }
    if (def.socket) servers.push({ name, socket: String(def.socket), discover: def.discover !== false });
    else if (def.host) {
      const protocol = def.protocol === 'https' ? 'https' : 'http';
      servers.push({ name, url: `${protocol}://${def.host}:${def.port ?? 2375}`, discover: def.discover !== false });
    } else ctx.error(file, name, 'needs "socket" or "host"');
  }
  return servers;
}

export function normalizeKubernetes(raw, ctx) {
  const file = 'kubernetes.yaml';
  if (raw === undefined || raw === null) return { mode: 'disabled' };
  if (!isPlainObject(raw) || !['disabled', 'cluster'].includes(raw.mode ?? 'disabled')) {
    ctx.error(file, 'mode', 'expected "mode: cluster" or "mode: disabled"');
    return { mode: 'disabled' };
  }
  return { mode: raw.mode ?? 'disabled' };
}
