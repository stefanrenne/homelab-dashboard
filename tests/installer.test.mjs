import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import YAML from 'yaml';
import { syncPlugins, parseSource, readLock, latestTag, withDefaultPlugins, DEFAULT_PLUGINS, CORE_WIDGETS, olderTag, pluginUpdates, packageInfo } from '../src/plugins/installer.js';
import { loadWidget } from '../src/plugins/loader.js';
import { WidgetRuntime } from '../src/plugins/runtime.js';
import { validateOptions } from '../src/plugins/options.js';
import { tmpDir, silentLog, serve } from './helpers.mjs';

const TEMPLATE = path.resolve('examples/widget-template');

/** A git repo containing the widget template, tagged v1.0.0, with a later commit on main. */
function templateRepo() {
  const repo = path.join(tmpDir('hd-repo-'), 'widget');
  fs.cpSync(TEMPLATE, repo, { recursive: true });
  const git = (...args) => execFileSync('git', ['-C', repo, ...args], { stdio: 'pipe' });
  git('init', '-q', '-b', 'main');
  git('-c', 'user.name=t', '-c', 'user.email=t@t', 'add', '.');
  git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'v1');
  git('tag', 'v1.0.0');
  const v1 = git('rev-parse', 'HEAD').toString().trim();
  fs.writeFileSync(path.join(repo, 'widget.yaml'), fs.readFileSync(path.join(repo, 'widget.yaml'), 'utf8').replace('version: 1.0.0', 'version: 1.1.0'));
  git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qam', 'v1.1');
  return { repo, url: 'file://' + repo, v1, git };
}

test('parseSource: kinds, pinning and unsafe input', () => {
  assert.equal(parseSource({ source: 'git+https://github.com/a/b#v1.2.0' }).floating, false);
  assert.equal(parseSource({ source: 'git+https://github.com/a/b#main' }).floating, true);
  assert.equal(parseSource({ source: 'git+https://github.com/a/b' }).floating, true);
  assert.equal(parseSource({ source: 'git+https://github.com/a/b#latest' }).floating, false);
  assert.equal(parseSource({ source: 'git+https://github.com/a/b#latest' }).latest, true);
  assert.equal(parseSource({ source: 'npm:@scope/hd-widget@1.0.0' }).name, '@scope/hd-widget');
  assert.equal(parseSource({ source: 'npm:hd-widget@^1.0.0' }).floating, true);
  assert.throws(() => parseSource({ source: 'git+--upload-pack=x' }), /unsupported git URL/);
  assert.throws(() => parseSource({ source: 'git+https://a/b#--evil' }), /invalid ref/);
  assert.throws(() => parseSource({ source: 'npm:-x' }), /invalid npm/);
  assert.throws(() => parseSource({ source: 'https://a/b' }), /starts with/);
  assert.throws(() => parseSource({ path: 'x', subdir: '../y' }), /inside the package/);
});

test('path source is used in place and writes nothing', async () => {
  const configDir = tmpDir();
  const out = await syncPlugins({ configDir, entries: [{ path: TEMPLATE }], log: silentLog });
  assert.deepEqual(out.errors, []);
  assert.equal(out.installed[0].dir, TEMPLATE);
  assert.equal(fs.existsSync(path.join(configDir, 'plugins')), false);
});

test('git source at a tag installs <id>@<version> and locks the commit', async () => {
  const { url, v1 } = templateRepo();
  const configDir = tmpDir();
  const out = await syncPlugins({ configDir, entries: [{ source: `git+${url}#v1.0.0` }], log: silentLog });
  assert.deepEqual(out.errors, []);
  assert.deepEqual(out.warnings, []);
  assert.equal(path.basename(out.installed[0].dir), 'example-counter@1.0.0');
  assert.equal(fs.existsSync(path.join(out.installed[0].dir, '.git')), false);
  const lock = readLock(configDir);
  assert.deepEqual(lock[`git+${url}#v1.0.0`], { dir: 'example-counter@1.0.0', commit: v1 });
  const widget = await loadWidget(out.installed[0].dir, { source: 'git' });
  assert.equal(widget.id, 'example-counter');
});

test('a floating ref warns, stays on the locked commit, and moves only on update', async () => {
  const { url, repo, git } = templateRepo();
  const configDir = tmpDir();
  const entries = [{ source: `git+${url}#main` }];
  const first = await syncPlugins({ configDir, entries, log: silentLog });
  assert.equal(first.warnings.length, 1);
  assert.equal(path.basename(first.installed[0].dir), 'example-counter@1.1.0');

  // Upstream moves on; the lock keeps the installed version, even without the download.
  fs.writeFileSync(path.join(repo, 'widget.yaml'), fs.readFileSync(path.join(repo, 'widget.yaml'), 'utf8').replace('1.1.0', '1.2.0'));
  git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qam', 'v1.2');
  fs.rmSync(first.installed[0].dir, { recursive: true });
  const again = await syncPlugins({ configDir, entries, log: silentLog });
  assert.equal(path.basename(again.installed[0].dir), 'example-counter@1.1.0');

  const updated = await syncPlugins({ configDir, entries, update: true, log: silentLog });
  assert.equal(path.basename(updated.installed[0].dir), 'example-counter@1.2.0');
});

test('latestTag: highest release by number, no pre-releases or other tags', () => {
  assert.equal(latestTag(['v1.2.0', 'v1.10.0', 'v1.9.3', 'v2.0.0-beta.1', 'nightly']), 'v1.10.0');
  assert.equal(latestTag(['1.0.0', 'v0.9.0']), '1.0.0');
  assert.equal(latestTag(['main', 'v2.0.0-rc.1']), undefined);
});

test('#latest installs the newest release tag, not main, and moves only on update', async () => {
  const { url, repo, git } = templateRepo();
  const configDir = tmpDir();
  const entries = [{ source: `git+${url}#latest` }];
  const first = await syncPlugins({ configDir, entries, log: silentLog });
  assert.deepEqual(first.errors, []);
  assert.deepEqual(first.warnings, []);
  assert.equal(path.basename(first.installed[0].dir), 'example-counter@1.0.0');
  assert.equal(readLock(configDir)[`git+${url}#latest`].tag, 'v1.0.0');

  // A new release; the lock keeps the installed one until an update.
  fs.writeFileSync(path.join(repo, 'widget.yaml'), fs.readFileSync(path.join(repo, 'widget.yaml'), 'utf8').replace('1.1.0', '1.2.0'));
  git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qam', 'v1.2');
  git('tag', 'v1.2.0');
  git('tag', 'v1.3.0-beta.1');
  const again = await syncPlugins({ configDir, entries, log: silentLog });
  assert.equal(path.basename(again.installed[0].dir), 'example-counter@1.0.0');

  const updated = await syncPlugins({ configDir, entries, update: true, log: silentLog });
  assert.equal(path.basename(updated.installed[0].dir), 'example-counter@1.2.0');
  assert.equal(readLock(configDir)[`git+${url}#latest`].tag, 'v1.2.0');
});

test('#latest without a release tag is an error on the widget, not a crash', async () => {
  const { url, git } = templateRepo();
  git('tag', '-d', 'v1.0.0');
  const out = await syncPlugins({ configDir: tmpDir(), entries: [{ source: `git+${url}#latest` }], log: silentLog });
  assert.equal(out.installed.length, 0);
  assert.match(out.errors[0].message, /no release tag/);
});

test('withDefaultPlugins: own entries come first, an entry for the same repository replaces a default', () => {
  const def = [{ source: 'git+https://github.com/a/widgets#latest' }];
  const yielding = [{ ...def[0], yields: true }];
  const own = { source: 'npm:hd-widget-y@2.0.1' };
  assert.deepEqual(withDefaultPlugins([], def), yielding);
  assert.deepEqual(withDefaultPlugins([own, { path: './x' }], def), [own, { path: './x' }, ...yielding]);
  for (const source of ['git+https://github.com/a/widgets#v0.2.0', 'git+https://GitHub.com/a/widgets.git', 'git+git@github.com:a/widgets.git#latest']) {
    assert.deepEqual(withDefaultPlugins([{ source }], def), [{ source }], source);
    // only: keeps the widgets behind the service fields
    assert.deepEqual(withDefaultPlugins([{ source, only: ['radarr', 'ping'] }], def), [{ source, only: ['radarr', 'ping', 'http-status', 'docker', 'kubernetes-pods', 'proxmoxvm'] }], source);
  }
  const one = { source: def[0].source, subdir: 'widgets/radarr' };
  assert.deepEqual(withDefaultPlugins([one], def), [one], 'a subdir is the user\'s choice of one widget');
  assert.deepEqual(withDefaultPlugins([{ source: 'git+https://github.com/b/other', only: ['x'] }], def)[0].only, ['x'], 'another repository keeps its list');
  assert.deepEqual(CORE_WIDGETS, ['http-status', 'ping', 'docker', 'kubernetes-pods', 'proxmoxvm']);
  assert.equal(DEFAULT_PLUGINS[0].source, 'git+https://github.com/stefanrenne/homelab-dashboard-widgets#latest');
});

test('a sync removes the folders the lock file no longer points at', async () => {
  const { url, repo, git } = templateRepo();
  const configDir = tmpDir();
  const pluginsRoot = path.join(configDir, 'plugins');
  const entries = [{ source: `git+${url}#main` }];
  await syncPlugins({ configDir, entries, log: silentLog });
  fs.writeFileSync(path.join(repo, 'widget.yaml'), fs.readFileSync(path.join(repo, 'widget.yaml'), 'utf8').replace('1.1.0', '1.2.0'));
  git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qam', 'v1.2');

  await syncPlugins({ configDir, entries, update: true, log: silentLog });
  assert.deepEqual(fs.readdirSync(pluginsRoot).sort(), ['example-counter@1.2.0', 'plugins.lock.yaml']);

  // the source is taken out of settings.yaml: its folder goes too
  await syncPlugins({ configDir, entries: [], log: silentLog });
  assert.deepEqual(fs.readdirSync(pluginsRoot), ['plugins.lock.yaml']);
  assert.deepEqual(readLock(configDir), {});
});

test('a failed update keeps the locked version, its folder and its lock entry', async () => {
  const { url, repo } = templateRepo();
  const configDir = tmpDir();
  const entries = [{ source: `git+${url}#v1.0.0` }];
  await syncPlugins({ configDir, entries, log: silentLog });
  const before = readLock(configDir);
  fs.rmSync(repo, { recursive: true }); // the source is gone (offline, deleted)

  const out = await syncPlugins({ configDir, entries, update: true, log: silentLog });
  assert.match(out.errors[0].message, /^update failed, keeping example-counter@1\.0\.0: /);
  assert.equal(path.basename(out.installed[0].dir), 'example-counter@1.0.0');
  assert.deepEqual(readLock(configDir), before);
  assert.ok(fs.existsSync(path.join(configDir, 'plugins', 'example-counter@1.0.0')));
});

test('a locked source needs no network on the next start', async () => {
  const { url, repo } = templateRepo();
  const configDir = tmpDir();
  const entries = [{ source: `git+${url}#v1.0.0` }];
  await syncPlugins({ configDir, entries, log: silentLog });
  fs.rmSync(repo, { recursive: true });
  const out = await syncPlugins({ configDir, entries, log: silentLog });
  assert.deepEqual(out.errors, []);
});

test('npm source: pack, unpack, lock integrity and refuse a changed tarball', async () => {
  const pack = tmpDir('hd-pack-');
  let integrity = 'sha512-first';
  const run = async (cmd, args) => {
    if (cmd === 'npm') {
      const dest = args[args.indexOf('--pack-destination') + 1];
      fs.cpSync(TEMPLATE, path.join(pack, 'package'), { recursive: true });
      execFileSync('tar', ['-czf', path.join(dest, 'w.tgz'), '-C', pack, 'package']);
      return JSON.stringify([{ filename: 'w.tgz', version: '1.0.0', integrity }]);
    }
    return execFileSync(cmd, args).toString();
  };
  const configDir = tmpDir();
  const entries = [{ source: 'npm:hd-widget-example-counter@1.0.0' }];
  const out = await syncPlugins({ configDir, entries, run, log: silentLog });
  assert.deepEqual(out.errors, []);
  assert.equal(path.basename(out.installed[0].dir), 'example-counter@1.0.0');
  assert.equal(readLock(configDir)['npm:hd-widget-example-counter@1.0.0'].integrity, 'sha512-first');

  fs.rmSync(out.installed[0].dir, { recursive: true });
  integrity = 'sha512-tampered';
  const bad = await syncPlugins({ configDir, entries, run, log: silentLog });
  assert.match(bad.errors[0].message, /integrity .* changed/);
});

test('errors are per source and do not stop the others', async () => {
  const configDir = tmpDir();
  const out = await syncPlugins({
    configDir,
    entries: [{ source: 'git+file:///does/not/exist#v1.0.0' }, { path: TEMPLATE }, { path: './missing' }],
    log: silentLog,
  });
  assert.equal(out.installed.length, 1);
  assert.equal(out.errors.length, 2);
  assert.ok(YAML.parse(fs.readFileSync(path.join(configDir, 'plugins', 'plugins.lock.yaml'), 'utf8')));
});

test('the widget template works end to end through the runtime', async () => {
  let count = 10;
  const srv = await serve((req, res) => {
    assert.equal(req.url, '/api/stats.json');
    assert.equal(req.headers.authorization, 'Bearer k3y');
    res.end(JSON.stringify({ count: count++ }));
  });
  try {
    const widget = await loadWidget(TEMPLATE, { source: 'path' });
    const { options, publicOptions, errors } = validateOptions(widget.manifest.options, { url: srv.url + '/api/', key: 'k3y' });
    assert.deepEqual(errors, []);
    assert.equal('key' in publicOptions, false);
    let now = 0;
    const rt = new WidgetRuntime({ registry: new Map([[widget.id, widget]]), log: silentLog, now: () => now });
    rt.setInstances(new Map([['i', { type: widget.id, options, secretValues: ['k3y'], refreshMs: widget.manifest.refreshMs }]]));
    const first = await rt.get('i');
    assert.deepEqual(first.data.blocks, [{ key: 'value', label: 'value', value: 10 }, { key: 'change', label: 'change', value: null }]);
    now += 60_000;
    const second = await rt.get('i');
    assert.deepEqual(second.data.blocks, [{ key: 'value', label: 'value', value: 11 }, { key: 'change', label: 'change', value: 1 }]);
  } finally {
    await srv.close();
  }
});

/** A collection repo: widgets/a and widgets/b, both copies of the template with their own id. */
function collectionRepo() {
  const repo = path.join(tmpDir('hd-coll-'), 'my-widgets');
  for (const id of ['alpha', 'beta']) {
    const dir = path.join(repo, 'widgets', id);
    fs.cpSync(TEMPLATE, dir, { recursive: true });
    const yaml = fs.readFileSync(path.join(dir, 'widget.yaml'), 'utf8').replace('id: example-counter', `id: ${id}`);
    fs.writeFileSync(path.join(dir, 'widget.yaml'), yaml);
  }
  return repo;
}

test('a path to a collection installs every widget in it, or the ones in only', async () => {
  const repo = collectionRepo();
  const all = await syncPlugins({ configDir: tmpDir(), entries: [{ path: repo }], log: silentLog });
  assert.deepEqual(all.errors, []);
  assert.deepEqual(all.installed.map((i) => path.basename(i.dir)), ['alpha', 'beta']);
  const some = await syncPlugins({ configDir: tmpDir(), entries: [{ path: repo, only: ['beta', 'gamma'] }], log: silentLog });
  assert.deepEqual(some.installed.map((i) => path.basename(i.dir)), ['beta']);
  assert.match(some.warnings[0].message, /no widget folder "gamma"/);
});

test('a git collection is installed once and locked as <repo>@<commit>', async () => {
  const repo = collectionRepo();
  const git = (...args) => execFileSync('git', ['-C', repo, ...args], { stdio: 'pipe' });
  git('init', '-q', '-b', 'main');
  git('-c', 'user.name=t', '-c', 'user.email=t@t', 'add', '.');
  git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'c');
  git('tag', 'v0.1.0');
  const configDir = tmpDir();
  const entries = [{ source: `git+file://${repo}#v0.1.0` }];
  const out = await syncPlugins({ configDir, entries, log: silentLog });
  assert.deepEqual(out.errors, []);
  assert.deepEqual(out.installed.map((i) => path.basename(i.dir)), ['alpha', 'beta']);
  const record = Object.values(readLock(configDir))[0];
  assert.match(record.dir, /^my-widgets@[0-9a-f]{12}$/);
  const again = await syncPlugins({ configDir, entries, log: silentLog });
  assert.equal(again.installed.length, 2);
});

test('only must be a list of names', () => {
  assert.throws(() => parseSource({ path: 'x', only: 'radarr' }), /only: expected a list/);
});

test('scripts/new-widget: the template under a new id loads, with nothing of example-counter left', async () => {
  const { renameWidget } = await import('../scripts/new-widget.mjs');
  const dir = path.join(tmpDir('hd-new-'), 'my-nas');
  fs.cpSync(TEMPLATE, dir, { recursive: true });
  const changed = renameWidget(dir, 'my-nas', 'My NAS');
  assert.ok(changed.includes('widget.yaml') && changed.includes('client.js'));
  const widget = await loadWidget(dir, { source: 'path' });
  assert.deepEqual([widget.id, widget.manifest.name], ['my-nas', 'My NAS']);
  const all = fs.readdirSync(dir, { recursive: true }).filter((f) => fs.statSync(path.join(dir, f)).isFile()).map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');
  assert.ok(!/example-counter|ExampleCounter|Example counter/.test(all));
  assert.match(all, /customElements\.define\('hd-my-nas', MyNas\)/);
  assert.match(fs.readFileSync(path.join(dir, 'README.md'), 'utf8'), /^# My NAS\n/);
  assert.throws(() => renameWidget(dir, 'My Widget'), /not a widget id/);
});

test('syncPlugins reports each source by name and version, never its URL', async () => {
  const { url } = templateRepo();
  const configDir = tmpDir();
  fs.cpSync(TEMPLATE, path.join(configDir, 'my-widget'), { recursive: true });
  fs.cpSync(TEMPLATE, path.join(configDir, 'my-collection', 'widgets', 'a'), { recursive: true });
  fs.writeFileSync(path.join(configDir, 'my-collection', 'package.json'), '{ "version": "0.4.0" }');
  fs.mkdirSync(path.join(configDir, 'bare', 'widgets'), { recursive: true });
  fs.cpSync(TEMPLATE, path.join(configDir, 'bare', 'widgets', 'b'), { recursive: true });
  const entries = [{ source: `git+${url}#latest` }, { source: `git+${url}#v1.0.0` }, { source: `git+${url}#main` }, { path: './my-widget' }, { path: './my-collection' }, { path: './bare' }];
  const out = await syncPlugins({ configDir, entries, log: silentLog });
  assert.deepEqual(out.errors, []);
  const [latest, tag, main, ...folders] = out.packages;
  assert.deepEqual([latest, tag], [{ name: 'widget', version: 'v1.0.0', url: null }, { name: 'widget', version: 'v1.0.0', url: null }], 'file:// is no public repository: no link');
  const template = YAML.parse(fs.readFileSync(path.join(TEMPLATE, 'widget.yaml'), 'utf8')).version;
  assert.deepEqual(folders, [{ name: 'my-widget', version: template, url: null }, { name: 'my-collection', version: '0.4.0', url: null }, { name: 'bare', version: null, url: null }], 'a folder: its widget.yaml or package.json');
  assert.match(main.version, /^[0-9a-f]{7}$/, 'a branch shows its commit');
  assert.ok(!JSON.stringify(out.packages).includes('file://'));
});

test('a folder that cannot be removed is a warning, and the plugins still load', async (t) => {
  if (process.getuid?.() === 0) return t.skip('root removes anything');
  const configDir = tmpDir();
  const old = path.join(configDir, 'plugins', 'old@1.0.0');
  fs.mkdirSync(path.join(old, 'sub'), { recursive: true });
  fs.writeFileSync(path.join(old, 'sub', 'f'), 'x');
  fs.chmodSync(old, 0o500); // as a folder written by another user: its contents cannot be removed
  try {
    const out = await syncPlugins({ configDir, entries: [{ path: TEMPLATE }], log: silentLog });
    assert.equal(out.installed.length, 1);
    assert.deepEqual(out.errors, []);
    assert.match(out.warnings.map((w) => w.message).join('\n'), /could not remove plugins\/old@1\.0\.0, which is no longer in use \(E\w+\); delete it by hand/);
  } finally {
    fs.chmodSync(old, 0o700);
  }
});

test('a #latest locked below atLeast (the release this dashboard needs) moves on without update', async () => {
  const { url, repo, git } = templateRepo();
  const configDir = tmpDir();
  const key = `git+${url}#latest`;
  await syncPlugins({ configDir, entries: [{ source: key }], log: silentLog });
  assert.equal(readLock(configDir)[key].tag, 'v1.0.0');
  fs.writeFileSync(path.join(repo, 'widget.yaml'), fs.readFileSync(path.join(repo, 'widget.yaml'), 'utf8').replace('1.1.0', '1.2.0'));
  git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qam', 'v1.2');
  git('tag', 'v1.2.0');

  const kept = await syncPlugins({ configDir, entries: [{ source: key, atLeast: 'v1.0.0' }], log: silentLog });
  assert.equal(path.basename(kept.installed[0].dir), 'example-counter@1.0.0', 'new enough: the lock wins');
  const moved = await syncPlugins({ configDir, entries: [{ source: key, atLeast: 'v1.2.0' }], log: silentLog });
  assert.deepEqual(moved.errors, []);
  assert.equal(path.basename(moved.installed[0].dir), 'example-counter@1.2.0');
  assert.equal(readLock(configDir)[key].tag, 'v1.2.0');

  assert.equal(olderTag('v0.3.0', 'v0.4.0'), true);
  assert.equal(olderTag('0.4.0', 'v0.4.0'), false);
  assert.equal(olderTag('v0.10.0', 'v0.4.0'), false);
  assert.ok(DEFAULT_PLUGINS[0].atLeast, 'the default collection names the release it needs');
  const def = [{ source: 'git+https://github.com/a/widgets#latest', atLeast: 'v2.0.0' }];
  assert.equal(withDefaultPlugins([{ source: 'git+https://github.com/a/widgets#latest', only: ['x'] }], def)[0].atLeast, 'v2.0.0', 'your own #latest entry keeps it');
  assert.equal(withDefaultPlugins([{ source: 'git+https://github.com/a/widgets#v1.0.0' }], def)[0].atLeast, undefined, 'a pinned tag is your choice');
});

test('pluginUpdates: #latest and branches that moved, never pinned tags; update moving installs only those', async () => {
  const { url, repo, git } = templateRepo();
  const configDir = tmpDir();
  const latest = `git+${url}#latest`;
  const branch = `git+${url}#main`;
  const pinned = `git+${url}#v1.0.0`;
  const entries = [{ source: latest }, { source: branch }, { source: pinned }];
  await syncPlugins({ configDir, entries, log: silentLog });
  assert.deepEqual(await pluginUpdates({ configDir, entries }), [], 'nothing new');

  fs.writeFileSync(path.join(repo, 'widget.yaml'), fs.readFileSync(path.join(repo, 'widget.yaml'), 'utf8').replace('1.1.0', '1.2.0'));
  git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qam', 'v1.2');
  git('tag', 'v1.2.0');
  assert.deepEqual(await pluginUpdates({ configDir, entries }), [latest, branch]);

  const out = await syncPlugins({ configDir, entries, update: 'moving', log: silentLog });
  assert.deepEqual(out.installed.map((i) => path.basename(i.dir)), ['example-counter@1.2.0', 'example-counter@1.2.0', 'example-counter@1.0.0']);
  assert.deepEqual(await pluginUpdates({ configDir, entries }), [], 'the lock caught up');
  assert.deepEqual(await pluginUpdates({ configDir, entries: [{ source: 'git+file:///nowhere/at/all#latest' }] }), [], 'offline is no news');
});

test('packageInfo: a label, and links to a public GitHub release or commit or an npm page only', () => {
  const commit = 'abcdef0123456789abcdef0123456789abcdef01';
  const git = (source, record, entry = {}) => packageInfo({ source, ...entry }, parseSource({ source }), { commit, ...record });
  assert.deepEqual(git('git+https://github.com/a/widgets#latest', { tag: 'v0.4.1' }, { label: 'widgets' }),
    { name: 'widgets', version: 'v0.4.1', url: 'https://github.com/a/widgets/releases/tag/v0.4.1' });
  assert.deepEqual(git('git+https://github.com/a/widgets.git#v1.0.0', {}), { name: 'widgets', version: 'v1.0.0', url: 'https://github.com/a/widgets/releases/tag/v1.0.0' });
  assert.deepEqual(git('git+https://github.com/a/widgets#main', {}), { name: 'widgets', version: 'abcdef0', url: `https://github.com/a/widgets/commit/${commit}` });
  assert.equal(git('git+https://user:t0ken@github.com/a/widgets#v1.0.0', {}).url, null, 'credentials: no link, the token stays on the server');
  assert.equal(git('git+https://gitea.lan/a/widgets#v1.0.0', {}).url, null);
  assert.equal(git('git+git@github.com:a/widgets.git#v1.0.0', {}).url, null);
  const npm = packageInfo({ source: 'npm:hd-widget-y@2.0.1' }, parseSource({ source: 'npm:hd-widget-y@2.0.1' }), { version: '2.0.1' });
  assert.deepEqual(npm, { name: 'hd-widget-y', version: '2.0.1', url: 'https://www.npmjs.com/package/hd-widget-y/v/2.0.1' });
  assert.equal(withDefaultPlugins([{ source: 'git+https://github.com/a/widgets#v1.0.0' }], [{ source: 'git+https://github.com/a/widgets#latest', label: 'widgets' }])[0].label, 'widgets', 'your own entry for the collection keeps its name');
  assert.equal(DEFAULT_PLUGINS[0].label, 'widgets');
});
