import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import YAML from 'yaml';
import { syncPlugins, parseSource, readLock, latestTag, withDefaultPlugins, DEFAULT_PLUGINS } from '../src/plugins/installer.js';
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
    const pinned = { source, only: ['radarr'] };
    assert.deepEqual(withDefaultPlugins([pinned], def), [pinned], source);
  }
  assert.equal(DEFAULT_PLUGINS[0].source, 'git+https://github.com/stefanrenne/homelab-dashboard-widgets#latest');
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
    assert.deepEqual(first.data.blocks, [{ label: 'value', value: 10 }, { label: 'change', value: null }]);
    now += 60_000;
    const second = await rt.get('i');
    assert.deepEqual(second.data.blocks, [{ label: 'value', value: 11 }, { label: 'change', value: 1 }]);
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
