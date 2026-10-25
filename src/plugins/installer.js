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
// without network access until a sync with `update` is asked for. Folders the lock file no
// longer points at (older versions, removed sources) are deleted after each sync. The app writes
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
// atLeast: the release this dashboard needs; a #latest locked below it moves on by itself.
// label: its name in the footer.
export const DEFAULT_PLUGINS = [{ source: 'git+https://github.com/stefanrenne/homelab-dashboard-widgets#latest', atLeast: 'v0.4.0', label: 'widgets' }];
// The collection's widgets behind a service's siteMonitor:, ping:, container:, app: and
// proxmoxNode: (src/layout.js). `only:` on a default's repository keeps them.
export const CORE_WIDGETS = ['http-status', 'ping', 'docker', 'kubernetes-pods', 'proxmoxvm'];

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

/**
 * The user's entries followed by the defaults; a user entry for a default's repository replaces
 * it, and its `only:` list gets CORE_WIDGETS added, so the service fields keep working. With
 * #latest it also takes the default's `atLeast`, and it keeps the default's footer `label`.
 */
export function withDefaultPlugins(entries, defaults = DEFAULT_PLUGINS) {
  const own = new Set(entries.map(repoOf).filter(Boolean));
  const kept = entries.map((e) => {
    const d = defaults.find((x) => repoOf(x) && repoOf(x) === repoOf(e));
    if (!d) return e;
    const out = { ...e };
    if (Array.isArray(e.only) && !e.subdir) out.only = [...new Set([...e.only, ...CORE_WIDGETS])];
    if (d.atLeast && String(e.source).endsWith(`#${LATEST_REF}`)) out.atLeast = d.atLeast;
    if (d.label && !e.subdir) out.label = d.label;
    return out;
  });
  return [...kept, ...defaults.filter((d) => !own.has(repoOf(d))).map((d) => ({ ...d, yields: true }))];
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

/** A local folder's version: its widget.yaml (one widget) or package.json (a collection), else null. */
function localVersion(dir) {
  try {
    if (fs.existsSync(path.join(dir, 'widget.yaml'))) return readManifest(dir).version ?? null;
    return JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).version ?? null;
  } catch {
    return null;
  }
}

/** A public GitHub repository's web address, from a git URL; null for anything else (another host, credentials). */
function githubRepo(url) {
  try {
    const u = new URL(url);
    const m = /^\/([\w.-]+)\/([\w.-]+?)(\.git)?\/?$/.exec(u.pathname);
    if (u.protocol !== 'https:' || u.hostname !== 'github.com' || u.username || u.password || u.search || !m) return null;
    return `https://github.com/${m[1]}/${m[2]}`;
  } catch {
    return null;
  }
}

/**
 * The name, version and link of an installed source, for the footer: the label (the widgets
 * collection's "widgets") or the repository, npm package or folder name; the tag, version or short
 * commit; its GitHub release or commit, or its npm page. Never the source URL itself (it can hold
 * a token): a link is only made for a public GitHub repository or an npm package.
 */
export function packageInfo(entry, src, record, dir) {
  if (src.kind === 'path') return { name: entry.label ?? path.basename(dir), version: localVersion(dir), url: null };
  if (src.kind === 'npm') {
    const url = `https://www.npmjs.com/package/${src.name}/v/${encodeURIComponent(record.version)}`;
    return { name: entry.label ?? (src.subdir ? `${src.name}/${path.basename(src.subdir)}` : src.name), version: record.version, url };
  }
  const repo = path.basename(src.url.replace(/\/+$/, '')).replace(/\.git$/, '');
  const tag = record.tag ?? (!src.floating && !/^[0-9a-f]{40}$/.test(src.ref) ? src.ref : null);
  const web = githubRepo(src.url);
  const url = web && (tag ? `${web}/releases/tag/${encodeURIComponent(tag)}` : `${web}/commit/${record.commit}`);
  return { name: entry.label ?? (src.subdir ? `${repo}/${path.basename(src.subdir)}` : repo), version: tag ?? record.commit.slice(0, 7), url };
}

/**
 * Makes sure every source in `entries` is installed. Returns
 * { installed: [{ dir, source }], packages: [{ name, version, url }], errors: [{ source, message }], warnings: [...] }.
 * With `keepUnused: true` the folders no longer in the lock stay until `removeUnused()` (returned)
 * is called. With `update: true` git and npm sources are resolved again even when locked; with
 * `update: 'moving'` only the ones that can move (#latest, a branch, an npm range).
 */
export async function syncPlugins({ configDir, entries, update = false, keepUnused = false, run = defaultRun, log = console }) {
  const pluginsRoot = path.join(configDir, PLUGINS_DIR);
  const lock = readLock(configDir);
  const nextLock = {};
  const installed = [];
  const packages = [];
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
        packages.push(packageInfo(entry, src, null, dir));
        continue;
      }
      if (src.floating) {
        warnings.push({
          source: label,
          message: `not pinned to a version (${src.kind === 'git' ? 'use a tag or commit' : 'use an exact version'}); the lock file keeps it stable`,
        });
      }
      const locked = lock[src.key];
      const lockedHere = Boolean(locked?.dir && fs.existsSync(path.join(pluginsRoot, locked.dir)));
      // a #latest locked below the release this dashboard needs is updated, as with `update`
      const behind = Boolean(src.latest && entry.atLeast && locked?.tag && olderTag(locked.tag, entry.atLeast));
      if (behind) log.info(`plugins: ${label} is locked at ${locked.tag}, this dashboard needs ${entry.atLeast} or newer; updating`);
      const refresh = update === true || (update === 'moving' && (src.latest || src.floating)) || behind;
      let record;
      if (!refresh && lockedHere) {
        record = locked;
      } else {
        try {
          record = src.kind === 'git'
            ? await installGit(src, pluginsRoot, run, refresh ? null : locked)
            : await installNpm(src, pluginsRoot, run, refresh ? null : locked);
          log.info(`plugins: installed ${label} as ${record.dir}`);
        } catch (err) {
          if (!lockedHere) throw err;
          // an update that fails (offline, a bad release) keeps the version that worked
          errors.push({ source: label, message: `update failed, keeping ${locked.dir}: ${err.message}` });
          record = locked;
        }
      }
      nextLock[src.key] = record;
      const root = path.join(pluginsRoot, record.dir, src.subdir);
      for (const d of packageDirs(root, Boolean(src.subdir), entry.only, label, warnings)) installed.push({ dir: d, source: label, yields: Boolean(entry.yields) });
      packages.push(packageInfo(entry, src, record));
    } catch (err) {
      errors.push({ source: label, message: err.message });
    }
  }

  if (entries.some((e) => !e.path) || Object.keys(lock).length) writeLock(configDir, nextLock);
  // keepUnused: the caller removes the old folders once the new widgets are live (removeUnused),
  // so a widget call that still has an old path does not find it gone
  const removeUnused = () => removeUnlocked(pluginsRoot, nextLock, log, warnings);
  if (keepUnused) return { installed, packages, errors, warnings, removeUnused };
  removeUnused();
  return { installed, packages, errors, warnings };
}

/**
 * Deletes the package folders in <config>/plugins that the lock file no longer points at:
 * older versions after an update, and sources that were removed from settings.yaml. A folder
 * that cannot be removed (owned by another user) is a warning: the plugins still load.
 */
function removeUnlocked(pluginsRoot, lock, log, warnings) {
  if (!fs.existsSync(pluginsRoot)) return;
  const keep = new Set(Object.values(lock).map((r) => r.dir));
  for (const entry of fs.readdirSync(pluginsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || keep.has(entry.name)) continue;
    try {
      fs.rmSync(path.join(pluginsRoot, entry.name), { recursive: true, force: true });
      if (entry.name !== '.tmp') log.info(`plugins: removed ${entry.name}, no longer in the lock file`);
    } catch (err) {
      const message = `could not remove ${PLUGINS_DIR}/${entry.name}, which is no longer in use (${err.code ?? err.message}); delete it by hand`;
      log.warn(`plugins: ${message}`);
      warnings.push({ source: PLUGINS_DIR, message });
    }
  }
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

/**
 * The git sources that can move (#latest, a branch) and have a newer version than the lock: their
 * labels. One `git ls-remote` each, nothing is downloaded; a source that cannot be asked (offline)
 * has no news. Pinned tags and commits never change, so they are not asked.
 */
export async function pluginUpdates({ configDir, entries, run = defaultRun }) {
  const lock = readLock(configDir);
  const news = [];
  for (const entry of entries) {
    if (entry.path) continue;
    try {
      const src = parseSource(entry);
      if (src.kind !== 'git' || !(src.latest || src.floating)) continue;
      const locked = lock[src.key];
      const now = src.latest
        ? await resolveLatestTag(src.url, run)
        : (await run('git', ['ls-remote', '--', src.url, src.ref || 'HEAD'])).split(/\s/)[0];
      if (now && now !== (src.latest ? locked?.tag : locked?.commit)) news.push(entry.source);
    } catch {
      // offline or gone: the next check asks again
    }
  }
  return news;
}

/** True when release tag `tag` is older than `min` (both v1.2.3 or 1.2.3). */
export function olderTag(tag, min) {
  const a = RELEASE_TAG.exec(tag)?.slice(1).map(Number);
  const b = RELEASE_TAG.exec(min)?.slice(1).map(Number);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] < b[i];
  return false;
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
