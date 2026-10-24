// Loads widget packages (built-in and external) into a registry.
//
// A widget package is a folder with widget.yaml and optionally server.js, client.js,
// i18n.json and assets/. See docs/widgets/api-reference.md for the contract.

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import YAML from 'yaml';
import { checkSchema } from './options.js';
import { parseDuration, isPlainObject } from '../util.js';

/** Widget API versions this core can run. Never drop one without a major release. */
export const SUPPORTED_API_VERSIONS = [1];
export const DEFAULT_REFRESH_MS = 30_000;
export const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,62}$/;

export function readManifest(dir) {
  const file = path.join(dir, 'widget.yaml');
  let manifest;
  try {
    manifest = YAML.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    throw new Error(`${file}: ${err.code === 'ENOENT' ? 'missing widget.yaml' : err.message.split('\n')[0]}`);
  }
  const problems = [];
  if (!isPlainObject(manifest)) throw new Error(`${file}: expected a map`);
  if (!ID_PATTERN.test(manifest.id ?? '')) problems.push('id: lowercase letters, digits and dashes');
  if (typeof manifest.name !== 'string') problems.push('name: required');
  if (typeof manifest.version !== 'string') problems.push('version: required (a string like "1.0.0")');
  if (!Number.isInteger(manifest.apiVersion)) problems.push('apiVersion: required (an integer)');
  problems.push(...checkSchema(manifest.options));
  if (manifest.defaultFields !== undefined && (!Array.isArray(manifest.defaultFields) || manifest.defaultFields.some((f) => typeof f !== 'string'))) {
    problems.push('defaultFields: a list of block keys');
  }
  try {
    manifest.refreshMs = parseDuration(manifest.refresh, DEFAULT_REFRESH_MS);
  } catch (err) {
    problems.push(`refresh: ${err.message}`);
  }
  if (problems.length) throw new Error(`${file}: ${problems.join('; ')}`);
  manifest.options ??= {};
  return manifest;
}

/**
 * Loads one widget folder. Throws with a readable message when the package is broken
 * or needs a widget API version this core does not support.
 */
export async function loadWidget(dir, { source = 'builtin' } = {}) {
  const manifest = readManifest(dir);
  if (!SUPPORTED_API_VERSIONS.includes(manifest.apiVersion)) {
    throw new Error(
      `widget "${manifest.id}" needs widget API ${manifest.apiVersion}, ` +
        `this dashboard supports ${SUPPORTED_API_VERSIONS.join(', ')}`,
    );
  }
  let server = null;
  const serverFile = path.join(dir, 'server.js');
  if (fs.existsSync(serverFile)) {
    // The mtime in the URL makes a changed file load again after a config reload.
    const url = pathToFileURL(serverFile).href + '?v=' + fs.statSync(serverFile).mtimeMs;
    const mod = await import(url);
    server = mod.default;
    if (!server || typeof server.fetch !== 'function') {
      throw new Error(`${serverFile}: must "export default { async fetch(ctx) { ... } }"`);
    }
  }
  let i18n = {};
  const i18nFile = path.join(dir, 'i18n.json');
  if (fs.existsSync(i18nFile)) {
    try {
      i18n = JSON.parse(fs.readFileSync(i18nFile, 'utf8'));
    } catch (err) {
      throw new Error(`${i18nFile}: ${err.message}`);
    }
  }
  return {
    id: manifest.id,
    manifest,
    dir,
    source,
    server,
    hasClient: fs.existsSync(path.join(dir, 'client.js')),
    i18n,
  };
}

/** Lists the widget folders directly inside `root` (folders that contain widget.yaml). */
export function widgetDirs(root) {
  let entries;
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((e) => e.isDirectory() && fs.existsSync(path.join(root, e.name, 'widget.yaml')))
    .map((e) => path.join(root, e.name))
    .sort();
}

/**
 * Builds the registry from built-in widgets and external packages. The first widget with
 * an id wins, so an external package can never replace a built-in one. A package with
 * `yields` (a default plugin) quietly gives way to a widget id that is already there.
 * Returns { widgets: Map<id, widget>, errors: [{ source, message }] }.
 */
export async function loadRegistry({ builtinDir, external = [] }) {
  const widgets = new Map();
  const errors = [];
  const candidates = [
    ...widgetDirs(builtinDir).map((dir) => ({ dir, source: 'builtin' })),
    ...external,
  ];
  for (const { dir, source, yields } of candidates) {
    try {
      const widget = await loadWidget(dir, { source });
      if (widgets.has(widget.id) && yields) continue;
      if (widgets.has(widget.id)) {
        errors.push({ source, message: `widget id "${widget.id}" is already used by ${widgets.get(widget.id).source}` });
        continue;
      }
      widgets.set(widget.id, widget);
    } catch (err) {
      errors.push({ source, message: err.message });
    }
  }
  return { widgets, errors };
}
