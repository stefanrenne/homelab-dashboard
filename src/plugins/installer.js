// Installs external widget packages listed under `plugins:` in settings.yaml.
//
//   - source: git+https://github.com/someone/hd-widget-x#v1.2.0   (tag, branch or commit)
//   - source: git+https://github.com/someone/hd-widget-x#latest   (the newest release tag)
//   - source: npm:hd-widget-y@2.0.1
//   - path: ./my-widgets/z                                        (relative to the config dir)
//   any of them with `subdir: widgets/x` for one widget out of a repository.
//
// DEFAULT_PLUGINS are always installed; the entries in settings.yaml extend them. An entry
// for the same git repository (another ref, `only`, `subdir`) takes the default's place, and a
// widget id the user's own sources already provide is skipped from the defaults (`yields`).
//
// A source without widget.yaml at its root is a collection: every folder with a
// widget.yaml directly inside it (or inside its widgets/ folder) is installed, or only
// the folders named in `only: [radarr, sonarr]`.
//
// Downloads land in <config>/plugins/<id>@<version>. plugins.lock.yaml records what a
// source resolved to (commit or tarball integrity), so later starts reuse the same files
// without network access until a sync with `update` is asked for. The app writes
// nowhere else in the config dir (hard rule 5).

import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import YAML from 'yaml';
import { readManifest, widgetDirs } from './loader.js';
import { safeJoin } from '../util.js';

export const PLUGINS_DIR = 'plugins';
export const LOCK_FILE = 'plugins.lock.yaml';

const GIT_URL = /^(https?:\/\/|ssh:\/\/|file:\/\/|git@)[^\s]+$/;
const NPM_NAME = /^(@[a-z0-9][\w.-]*\/)?[a-z0-9][\w.-]*$/;
const PINNED_REF = /^([0-9a-f]{40}|v?\d+\.\d+\.\d+([-+][\w.-]+)?)$/;
const PINNED_VERSION = /^\d+\.\d+\.\d+([-+][\w.-]+)?$/;
const RELEASE_TAG = /^v?(\d+)\.(\d+)\.(\d+)$/;
export const LATEST_REF = 'latest';
export const DEFAULT_PLUGINS = [{ source: 'git+https://github.com/stefanrenne/homelab-dashboard-widgets#latest' }];

/** Parses a plugin entry from settings.yaml. Throws on anything unsafe or unknown. */
export function parseSource(entry) {
  const subdir = entry.subdir ? String(entry.subdir) : '';
  if (subdir && (path.isAbsolute(subdir) || subdir.split(/[\\/]/).includes('..'))) {
    throw new Error(`subdir "${subdir}" must be a relative path inside the package`);
  }
  if (entry.only !== undefined && (!Array.isArray(entry.only) || entry.only.some((x) => typeof x !== 'string'))) {
    throw new Error('only: expected a list of widget folder names');
  }
  if (entry.path) return { kind: 'path', key: `path:${entry.path}`, path: String(entry.path), subdir };
  const source = String(entry.source);
  if (source.startsWith('git+')) {
    const [url, ref = ''] = source.slice(4).split('#');
    if (!GIT_URL.test(url)) throw new Error(`"${source}": unsupported git URL`);
    if (ref.startsWith('-') || /\s/.test(ref)) throw new Error(`"${source}": invalid ref`);
    // #latest resolves to the newest release tag; the lock pins it like a tag, so no warning
    const latest = ref === LATEST_REF;
    return { kind: 'git', key: source + (subdir ? `:${subdir}` : ''), url, ref, subdir, latest, floating: !latest && !PINNED_REF.test(ref) };
  }
  if (source.startsWith('npm:')) {
    const spec = source.slice(4);
    const at = spec.lastIndexOf('@');
    const name = at > 0 ? spec.slice(0, at) : spec;
    const version = at > 0 ? spec.slice(at + 1) : '';
    if (!NPM_NAME.test(name) || /[\s]/.test(version) || version.startsWith('-')) throw new Error(`"${source}": invalid npm package`);
    return { kind: 'npm', key: source + (subdir ? `:${subdir}` : ''), name, version, subdir, floating: !PINNED_VERSION.test(version) };
  }
  throw new Error(`"${source}": a source starts with "git+" or "npm:"`);
}

/** A git URL without scheme noise, for comparing two sources of the same repository. */
function repoOf(entry) {
  const source = typeof entry.source === 'string' ? entry.source : '';
  if (!source.startsWith('git+')) return null;
  return source.slice(4).split('#')[0].toLowerCase().replace(/^(https?|ssh|git):\/\/(git@)?/, '').replace(/^git@/, '')
    .replace(':', '/').replace(/\.git$/, '').replace(/\/+$/, '');
}

/** The user's entries followed by the defaults; a user entry for a default's repository replaces it. */
export function withDefaultPlugins(entries, defaults = DEFAULT_PLUGINS) {
  const own = new Set(entries.map(repoOf).filter(Boolean));
  return [...entries, ...defaults.filter((d) => !own.has(repoOf(d))).map((d) => ({ ...d, yields: true }))];
}

function defaultRun(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: 120_000, maxBuffer: 10 * 1024 * 1024, ...opts }, (err, stdout, stderr) => {
      if (err) {
        const detail = String(stderr || err.message).trim().split('\n').slice(-2).join(' ');
        reject(new Error(`${cmd} ${args[0]} failed: ${detail}`));
      } else resolve(String(stdout));
    });
  });
}

export function readLock(configDir) {
  try {
    const lock = YAML.parse(fs.readFileSync(path.join(configDir, PLUGINS_DIR, LOCK_FILE), 'utf8'));
    return lock?.plugins && typeof lock.plugins === 'object' ? lock.plugins : {};
  } catch {
    return {};
  }
}

function writeLock(configDir, plugins) {
  const file = path.join(configDir, PLUGINS_DIR, LOCK_FILE);
  const text =
    '# Managed by the dashboard: what each plugin source resolved to. Do not edit;\n' +
    '# delete an entry (or sync with update) to fetch that source again.\n' +
    YAML.stringify({ plugins });
  fs.writeFileSync(file, text);
}

/**
 * Makes sure every source in `entries` is installed. Returns
 * { installed: [{ dir, source }], errors: [{ source, message }], warnings: [...] }.
 * With `update: true` git and npm sources are resolved again even when locked.
 */
export async function syncPlugins({ configDir, entries, update = false, run = defaultRun, log = console }) {
  const pluginsRoot = path.join(configDir, PLUGINS_DIR);
  const lock = readLock(configDir);
  const nextLock = {};
  const installed = [];
  const errors = [];
  const warnings = [];
  if (entries.some((e) => !e.path)) fs.mkdirSync(pluginsRoot, { recursive: true });

  for (const entry of entries) {
    const label = entry.source ?? entry.path;
    try {
      const src = parseSource(entry);
      if (src.kind === 'path') {
        const dir = path.resolve(configDir, src.path.replace(/^~(?=\/)/, process.env.HOME ?? '~'), src.subdir);
        for (const d of packageDirs(dir, Boolean(src.subdir), entry.only, label, warnings)) installed.push({ dir: d, source: label, yields: Boolean(entry.yields) });
        continue;
      }
      if (src.floating) {
        warnings.push({
          source: label,
          message: `not pinned to a version (${src.kind === 'git' ? 'use a tag or commit' : 'use an exact version'}); the lock file keeps it stable`,
        });
      }
      const locked = lock[src.key];
      let record;
      if (!update && locked && locked.dir && fs.existsSync(path.join(pluginsRoot, locked.dir))) {
        record = locked;
      } else {
        record = src.kind === 'git'
          ? await installGit(src, pluginsRoot, run, update ? null : locked)
          : await installNpm(src, pluginsRoot, run, update ? null : locked);
        log.info(`plugins: installed ${label} as ${record.dir}`);
      }
      nextLock[src.key] = record;
      const root = path.join(pluginsRoot, record.dir, src.subdir);
      for (const d of packageDirs(root, Boolean(src.subdir), entry.only, label, warnings)) installed.push({ dir: d, source: label, yields: Boolean(entry.yields) });
    } catch (err) {
      errors.push({ source: label, message: err.message });
    }
  }

  if (entries.some((e) => !e.path) || Object.keys(lock).length) writeLock(configDir, nextLock);
  return { installed, errors, warnings };
}

/** The widget folders of a package: the package itself, or the widgets of a collection. */
export function collectionDirs(root) {
  return [...widgetDirs(root), ...widgetDirs(path.join(root, 'widgets'))];
}

function packageDirs(root, single, only, label, warnings) {
  if (single || fs.existsSync(path.join(root, 'widget.yaml'))) {
    readManifest(root);
    return [root];
  }
  if (!fs.existsSync(root)) throw new Error(`${root} does not exist`);
  let dirs = collectionDirs(root);
  if (dirs.length === 0) throw new Error(`no widget.yaml in ${root} or in its folders`);
  if (only) {
    const names = new Set(dirs.map((d) => path.basename(d)));
    for (const name of only) if (!names.has(name)) warnings.push({ source: label, message: `only: no widget folder "${name}"` });
    dirs = dirs.filter((d) => only.includes(path.basename(d)));
  }
  return dirs;
}

function freshTmp(pluginsRoot) {
  const tmp = path.join(pluginsRoot, '.tmp');
  fs.mkdirSync(tmp, { recursive: true });
  return fs.mkdtempSync(path.join(tmp, 'x-'));
}

/**
 * Moves an unpacked package into place and returns that folder name: <id>@<version> for a
 * widget, `collectionName` for a collection.
 */
function place(pkgRoot, subdir, pluginsRoot, collectionName) {
  const widgetDir = subdir ? safeJoin(pkgRoot, subdir) : pkgRoot;
  if (!widgetDir) throw new Error(`subdir "${subdir}" is outside the package`);
  let name;
  if (subdir || fs.existsSync(path.join(widgetDir, 'widget.yaml'))) {
    const manifest = readManifest(widgetDir);
    name = `${manifest.id}@${manifest.version}`;
  } else {
    if (collectionDirs(widgetDir).length === 0) throw new Error('no widget.yaml at the root of the package or in its folders');
    name = collectionName;
  }
  name = name.replace(/[^\w@.-]/g, '_');
  const target = path.join(pluginsRoot, name);
  fs.rmSync(target, { recursive: true, force: true });
  fs.renameSync(pkgRoot, target);
  return name;
}

/** The highest release tag (v1.2.3 or 1.2.3, no pre-releases) out of `names`, or undefined. */
export function latestTag(names) {
  const version = (name) => RELEASE_TAG.exec(name)?.slice(1).map(Number);
  const newer = (a, b) => {
    for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
    return false;
  };
  let best;
  for (const name of names) {
    const v = version(name);
    if (v && (!best || newer(v, version(best)))) best = name;
  }
  return best;
}

async function resolveLatestTag(url, run) {
  const out = await run('git', ['ls-remote', '--tags', '--refs', '--', url]);
  const names = out.split('\n').map((line) => line.split('refs/tags/')[1]).filter(Boolean);
  const tag = latestTag(names);
  if (!tag) throw new Error(`${url} has no release tag (v1.2.3) for #${LATEST_REF}`);
  return tag;
}

async function installGit(src, pluginsRoot, run, locked) {
  const tmp = freshTmp(pluginsRoot);
  const checkout = path.join(tmp, 'repo');
  let tag = locked?.tag;
  try {
    const commit = locked?.commit;
    if (commit || /^[0-9a-f]{40}$/.test(src.ref)) {
      await run('git', ['clone', '--quiet', '--', src.url, checkout]);
      await run('git', ['-C', checkout, 'checkout', '--quiet', '--detach', commit ?? src.ref]);
    } else {
      tag = src.latest ? await resolveLatestTag(src.url, run) : undefined;
      const ref = tag ?? src.ref;
      const branch = ref ? ['--branch', ref] : [];
      await run('git', ['clone', '--quiet', '--depth', '1', ...branch, '--', src.url, checkout]);
    }
    const resolved = (await run('git', ['-C', checkout, 'rev-parse', 'HEAD'])).trim();
    fs.rmSync(path.join(checkout, '.git'), { recursive: true, force: true });
    const repo = path.basename(src.url.replace(/\/+$/, '')).replace(/\.git$/, '');
    const dir = place(checkout, src.subdir, pluginsRoot, `${repo}@${resolved.slice(0, 12)}`);
    return tag ? { dir, commit: resolved, tag } : { dir, commit: resolved };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

async function installNpm(src, pluginsRoot, run, locked) {
  const tmp = freshTmp(pluginsRoot);
  try {
    const spec = `${src.name}@${locked?.version ?? (src.version || 'latest')}`;
    const out = JSON.parse(await run('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', tmp, spec]));
    const info = Array.isArray(out) ? out[0] : out;
    if (locked?.integrity && info.integrity !== locked.integrity) {
      throw new Error(`integrity of ${spec} changed (${info.integrity} instead of ${locked.integrity}); refusing to install`);
    }
    const unpack = path.join(tmp, 'unpack');
    fs.mkdirSync(unpack);
    await run('tar', ['-xzf', path.join(tmp, info.filename), '-C', unpack]);
    const dir = place(path.join(unpack, 'package'), src.subdir, pluginsRoot, `${src.name}@${info.version}`);
    return { dir, version: info.version, integrity: info.integrity };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
