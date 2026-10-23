// Installs external widget packages listed under `plugins:` in settings.yaml.
//
//   - source: git+https://github.com/someone/hd-widget-x#v1.2.0   (tag, branch or commit)
//   - source: npm:hd-widget-y@2.0.1
//   - path: ./my-widgets/z                                        (relative to the config dir)
//   any of them with `subdir: widgets/x` for a repository that holds several widgets.
//
// Downloads land in <config>/plugins/<id>@<version>. plugins.lock.yaml records what a
// source resolved to (commit or tarball integrity), so later starts reuse the same files
// without network access until a sync with `update` is asked for. The app writes
// nowhere else in the config dir (hard rule 5).

import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import YAML from 'yaml';
import { readManifest } from './loader.js';
import { safeJoin } from '../util.js';

export const PLUGINS_DIR = 'plugins';
export const LOCK_FILE = 'plugins.lock.yaml';

const GIT_URL = /^(https?:\/\/|ssh:\/\/|file:\/\/|git@)[^\s]+$/;
const NPM_NAME = /^(@[a-z0-9][\w.-]*\/)?[a-z0-9][\w.-]*$/;
const PINNED_REF = /^([0-9a-f]{40}|v?\d+\.\d+\.\d+([-+][\w.-]+)?)$/;
const PINNED_VERSION = /^\d+\.\d+\.\d+([-+][\w.-]+)?$/;

/** Parses a plugin entry from settings.yaml. Throws on anything unsafe or unknown. */
export function parseSource(entry) {
  const subdir = entry.subdir ? String(entry.subdir) : '';
  if (subdir && (path.isAbsolute(subdir) || subdir.split(/[\\/]/).includes('..'))) {
    throw new Error(`subdir "${subdir}" must be a relative path inside the package`);
  }
  if (entry.path) return { kind: 'path', key: `path:${entry.path}`, path: String(entry.path), subdir };
  const source = String(entry.source);
  if (source.startsWith('git+')) {
    const [url, ref = ''] = source.slice(4).split('#');
    if (!GIT_URL.test(url)) throw new Error(`"${source}": unsupported git URL`);
    if (ref.startsWith('-') || /\s/.test(ref)) throw new Error(`"${source}": invalid ref`);
    return { kind: 'git', key: source + (subdir ? `:${subdir}` : ''), url, ref, subdir, floating: !PINNED_REF.test(ref) };
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
        const dir = path.resolve(configDir, src.path, src.subdir);
        readManifest(dir);
        installed.push({ dir, source: label });
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
      if (!update && locked && locked.dir && fs.existsSync(path.join(pluginsRoot, locked.dir, 'widget.yaml'))) {
        record = locked;
      } else {
        record = src.kind === 'git'
          ? await installGit(src, pluginsRoot, run, update ? null : locked)
          : await installNpm(src, pluginsRoot, run, update ? null : locked);
        log.info(`plugins: installed ${label} as ${record.dir}`);
      }
      nextLock[src.key] = record;
      installed.push({ dir: path.join(pluginsRoot, record.dir, src.subdir), source: label });
    } catch (err) {
      errors.push({ source: label, message: err.message });
    }
  }

  if (entries.some((e) => !e.path) || Object.keys(lock).length) writeLock(configDir, nextLock);
  return { installed, errors, warnings };
}

function freshTmp(pluginsRoot) {
  const tmp = path.join(pluginsRoot, '.tmp');
  fs.mkdirSync(tmp, { recursive: true });
  return fs.mkdtempSync(path.join(tmp, 'x-'));
}

/** Moves an unpacked package into place as <id>@<version> and returns that folder name. */
function place(pkgRoot, subdir, pluginsRoot) {
  const widgetDir = subdir ? safeJoin(pkgRoot, subdir) : pkgRoot;
  if (!widgetDir) throw new Error(`subdir "${subdir}" is outside the package`);
  const manifest = readManifest(widgetDir);
  const name = `${manifest.id}@${manifest.version}`.replace(/[^\w@.-]/g, '_');
  const target = path.join(pluginsRoot, name);
  fs.rmSync(target, { recursive: true, force: true });
  fs.renameSync(pkgRoot, target);
  return name;
}

async function installGit(src, pluginsRoot, run, locked) {
  const tmp = freshTmp(pluginsRoot);
  const checkout = path.join(tmp, 'repo');
  try {
    const commit = locked?.commit;
    if (commit || /^[0-9a-f]{40}$/.test(src.ref)) {
      await run('git', ['clone', '--quiet', '--', src.url, checkout]);
      await run('git', ['-C', checkout, 'checkout', '--quiet', '--detach', commit ?? src.ref]);
    } else {
      const branch = src.ref ? ['--branch', src.ref] : [];
      await run('git', ['clone', '--quiet', '--depth', '1', ...branch, '--', src.url, checkout]);
    }
    const resolved = (await run('git', ['-C', checkout, 'rev-parse', 'HEAD'])).trim();
    fs.rmSync(path.join(checkout, '.git'), { recursive: true, force: true });
    const dir = place(checkout, src.subdir, pluginsRoot);
    return { dir, commit: resolved };
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
    const dir = place(path.join(unpack, 'package'), src.subdir, pluginsRoot);
    return { dir, version: info.version, integrity: info.integrity };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
