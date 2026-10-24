import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadConfig } from '../src/config/load.js';
import { substitute } from '../src/config/vars.js';
import { parseDuration, safeJoin } from '../src/util.js';

function configDir(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hd-config-'));
  for (const [name, text] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), text);
  return dir;
}

test('missing files give defaults and no errors', () => {
  const cfg = loadConfig(configDir({}));
  assert.equal(cfg.settings.title, 'Homelab');
  assert.deepEqual(cfg.services, []);
  assert.deepEqual(cfg.errors, []);
  assert.deepEqual(cfg.kubernetes, { mode: 'disabled' });
});

test('services in homepage format are normalized', () => {
  const cfg = loadConfig(configDir({
    'services.yaml': `
- Network:
    - Router:
        href: http://router.lan
        icon: unifi.svg
        siteMonitor: http://router.lan
        widget:
          type: http-status
          url: http://router.lan
    - Pi-hole:
        href: http://pihole.lan
        widgets:
          - type: custom-api
            url: http://pihole.lan/api
          - type: ping
            host: pihole.lan
`,
  }));
  assert.deepEqual(cfg.errors, []);
  assert.equal(cfg.services.length, 1);
  const [router, pihole] = cfg.services[0].services;
  assert.equal(router.name, 'Router');
  assert.equal(router.siteMonitor, 'http://router.lan');
  assert.deepEqual(router.widgets.map((w) => w.type), ['http-status']);
  assert.deepEqual(router.widgets[0].options, { url: 'http://router.lan' });
  assert.deepEqual(pihole.widgets.map((w) => w.type), ['custom-api', 'ping']);
});

test('errors name the file and the path into it', () => {
  const cfg = loadConfig(configDir({
    'services.yaml': `
- Network:
    - Router: just a string
    - Ok:
        href: http://ok
        widget: { url: http://no-type }
`,
  }));
  assert.deepEqual(cfg.errors.map((e) => [e.file, e.path]), [
    ['services.yaml', '[0].Network[0].Router'],
    ['services.yaml', '[0].Network[1].Ok.widget'],
  ]);
  assert.equal(cfg.services[0].services.length, 1);
});

test('a YAML syntax error is reported with its line', () => {
  const cfg = loadConfig(configDir({ 'settings.yaml': 'title: ok\n  bad: [\n' }));
  assert.equal(cfg.errors.length, 1);
  assert.equal(cfg.errors[0].file, 'settings.yaml');
  assert.match(cfg.errors[0].path, /^line \d+$/);
  assert.equal(cfg.settings.title, 'Homelab');
});

test('unknown service keys are warnings, not errors', () => {
  const cfg = loadConfig(configDir({ 'services.yaml': '- G:\n    - S:\n        href: x\n        colour: red\n' }));
  assert.deepEqual(cfg.errors, []);
  assert.equal(cfg.warnings[0].path, '[0].G[0].S.colour');
});

test('variables and files are substituted and recorded as secrets', () => {
  const dir = configDir({ 'token.txt': 'from-file\n' });
  const out = substitute(
    { a: 'key={{HD_VAR_KEY}}', b: ['{{ HD_FILE_TOKEN }}'], c: '{{HD_VAR_MISSING}}', d: 3 },
    { env: { HD_VAR_KEY: 's3cret', HD_FILE_TOKEN: path.join(dir, 'token.txt') } },
  );
  assert.deepEqual(out.value, { a: 'key=s3cret', b: ['from-file'], c: '{{HD_VAR_MISSING}}', d: 3 });
  assert.deepEqual([...out.secrets].sort(), ['from-file', 's3cret']);
  assert.equal(out.warnings.length, 1);
});

test('bookmarks accept homepage list form and plain maps', () => {
  const cfg = loadConfig(configDir({
    'bookmarks.yaml': `
- Dev:
    - GitHub:
        - abbr: GH
          href: https://github.com
    - Docs:
        href: https://example.com
    - Broken:
        - abbr: X
`,
  }));
  assert.deepEqual(cfg.bookmarks[0].bookmarks.map((b) => b.name), ['GitHub', 'Docs']);
  assert.equal(cfg.errors.length, 1);
});

test('docker servers and header widgets are normalized', () => {
  const cfg = loadConfig(configDir({
    'docker.yaml': 'local:\n  socket: /var/run/docker.sock\nremote:\n  host: 10.0.0.2\n  port: 2376\nbad: {}\n',
    'widgets.yaml': '- datetime:\n    locale: nl\n- search:\n',
  }));
  assert.deepEqual(cfg.docker, [
    { name: 'local', socket: '/var/run/docker.sock', discover: true },
    { name: 'remote', url: 'http://10.0.0.2:2376', discover: true },
  ]);
  assert.equal(cfg.errors.length, 1);
  assert.deepEqual(cfg.widgets.map((w) => [w.type, w.options]), [['datetime', { locale: 'nl' }], ['search', {}]]);
});

test('parseDuration and safeJoin', () => {
  assert.equal(parseDuration('10s'), 10_000);
  assert.equal(parseDuration('500ms'), 500);
  assert.equal(parseDuration(2), 2000);
  assert.equal(parseDuration(undefined, 7), 7);
  assert.throws(() => parseDuration('soon'));
  assert.equal(safeJoin('/a/b', '../c'), null);
  assert.equal(safeJoin('/a/b', 'c/d.svg'), path.resolve('/a/b/c/d.svg'));
});

test('homepage placeholders work like HD_ ones', () => {
  const out = substitute({ a: '{{HOMEPAGE_VAR_KEY}}' }, { env: { HOMEPAGE_VAR_KEY: 'pk' } });
  assert.equal(out.value.a, 'pk');
  assert.ok(out.secrets.has('pk'));
});
