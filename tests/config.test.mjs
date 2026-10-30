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
  for (const [name, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), text);
  }
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
    'docker.yaml': 'local:\n  socket: /var/run/docker.sock\nremote:\n  host: 10.0.0.2\n  port: 2376\nbad: {}\nswarm:\n  socket: /var/run/docker.sock\n  swarm: true\n',
    'widgets.yaml': '- datetime:\n    locale: nl\n- search:\n',
  }));
  assert.deepEqual(cfg.docker, [
    { name: 'local', socket: '/var/run/docker.sock', discover: true },
    { name: 'remote', url: 'http://10.0.0.2:2376', discover: true },
    { name: 'swarm', socket: '/var/run/docker.sock', discover: true, swarm: true },
  ]);
  assert.equal(cfg.errors.length, 1);
  assert.deepEqual(cfg.widgets.map((w) => [w.type, w.options]), [['datetime', { locale: 'nl' }], ['search', {}]]);
});

test('docker.yaml tls: homepage\'s caFile, certFile and keyFile, read relative to the config folder', () => {
  const pem = (f) => fs.readFileSync(path.resolve('tests/fixtures/tls', f), 'utf8');
  const cfg = loadConfig(configDir({
    'tls/ca.pem': pem('ca.crt'),
    'tls/cert.pem': pem('client.crt'),
    'tls/key.pem': pem('client.key'),
    'docker.yaml': `
remote:
  host: docker.lan
  port: 2376
  tls: { caFile: tls/ca.pem, certFile: tls/cert.pem, keyFile: tls/key.pem }
caonly:
  host: ca.lan
  tls: { caFile: tls/ca.pem }
missing:
  host: m.lan
  tls: { caFile: tls/nope.pem }
half:
  host: h.lan
  tls: { certFile: tls/cert.pem }
`,
  }));
  assert.deepEqual(cfg.docker.map((s) => [s.name, s.url, Object.keys(s.tls ?? {})]), [
    ['remote', 'https://docker.lan:2376', ['ca', 'cert', 'key']],
    ['caonly', 'https://ca.lan:2375', ['ca']],
  ]);
  assert.equal(cfg.docker[0].tls.key, pem('client.key'));
  assert.deepEqual(cfg.errors.map((e) => [e.file, e.path]), [['docker.yaml', 'missing.tls.caFile'], ['docker.yaml', 'half.tls']]);
  assert.match(cfg.errors[0].message, /cannot read tls\/nope.pem: ENOENT/);
});

test('services: weight is a number, as in homepage', () => {
  const cfg = loadConfig(configDir({ 'services.yaml': '- G:\n    - A: { weight: 50 }\n    - B: { weight: "7" }\n    - C: { weight: soon }\n' }));
  assert.deepEqual(cfg.services[0].services.map((s) => s.weight), [50, 7, undefined]);
  assert.deepEqual(cfg.warnings.map((w) => w.path), ['[0].G[2].C.weight']);
});

test('proxmox.yaml: per node, or homepage\'s older flat form for every node', () => {
  const perNode = loadConfig(configDir({ 'proxmox.yaml': 'pve:\n  url: https://pve.lan:8006\n  token: a@pam!t\n  secret: s\n  insecure: false\nbad: { url: x }\n' }));
  assert.deepEqual(perNode.proxmox, { pve: { url: 'https://pve.lan:8006', token: 'a@pam!t', secret: 's', insecure: false } });
  assert.deepEqual(perNode.errors.map((e) => [e.file, e.path]), [['proxmox.yaml', 'bad']]);
  const flat = loadConfig(configDir({ 'proxmox.yaml': 'url: https://pve.lan:8006\ntoken: a@pam!t\nsecret: s\n' }));
  assert.deepEqual(Object.keys(flat.proxmox), ['']);
  const svc = loadConfig(configDir({ 'services.yaml': '- G:\n    - A: { proxmoxNode: pve, proxmoxVMID: 101, proxmoxType: docker }\n' }));
  assert.deepEqual([svc.services[0].services[0].proxmoxVMID, svc.services[0].services[0].proxmoxType], ['101', undefined]);
  assert.deepEqual(svc.warnings.map((w) => w.path), ['[0].G[0].A.proxmoxType']);
});

test('kubernetes.yaml: mode default (a kubeconfig, as in homepage) with kubeconfig and context', () => {
  const cfg = loadConfig(configDir({ 'kubernetes.yaml': 'mode: default\nkubeconfig: kube/config\ncontext: lab\n' }));
  assert.equal(cfg.kubernetes.mode, 'default');
  assert.ok(path.isAbsolute(cfg.kubernetes.kubeconfig) && cfg.kubernetes.kubeconfig.endsWith(path.join('kube', 'config')));
  assert.equal(cfg.kubernetes.context, 'lab');
  assert.match(loadConfig(configDir({ 'kubernetes.yaml': 'mode: kubeconfig\n' })).errors[0].message, /mode: default/);
  const kinds = loadConfig(configDir({ 'kubernetes.yaml': 'mode: cluster\ningress: false\ntraefik: true\ngateway: yes please\n' }));
  assert.deepEqual(kinds.kubernetes, { mode: 'cluster', ingress: false, traefik: true });
  assert.deepEqual(kinds.warnings.map((w) => w.path), ['gateway']);
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

test('a {{NAME}} that is not a variable is reported with the form that works', () => {
  const out = substitute({ password: '{{SHELLY_PASSWORD}}', tpl: '{{ states.switch | count }}', ok: '{{HD_VAR_X}}' }, { env: { HD_VAR_X: 'x1' } });
  assert.equal(out.value.password, '{{SHELLY_PASSWORD}}', 'left as written');
  assert.deepEqual(out.warnings, ['{{SHELLY_PASSWORD}} is not filled in: only {{HD_VAR_*}} and {{HD_FILE_*}} are. Write {{HD_VAR_SHELLY_PASSWORD}} and set the environment variable HD_VAR_SHELLY_PASSWORD']);
});

test('homepage placeholders work like HD_ ones', () => {
  const out = substitute({ a: '{{HOMEPAGE_VAR_KEY}}' }, { env: { HOMEPAGE_VAR_KEY: 'pk' } });
  assert.equal(out.value.a, 'pk');
  assert.ok(out.secrets.has('pk'));
});

test('!include: the services of a group from another file, groups spliced into the list', () => {
  const cfg = loadConfig(configDir({
    'services.yaml': '- Media: !include services/media.yaml\n- !include services/more-groups.yaml\n',
    'services/media.yaml': '- Plex:\n    href: http://plex.lan\n- Radarr:\n    href: http://radarr.lan\n',
    'services/more-groups.yaml': '- Network:\n    - Router:\n        href: http://router.lan\n- Tools: []\n',
  }));
  assert.deepEqual(cfg.errors, []);
  assert.deepEqual(cfg.services.map((g) => g.name), ['Media', 'Network', 'Tools']);
  assert.deepEqual(cfg.services[0].services.map((s) => s.name), ['Plex', 'Radarr']);
  assert.equal(cfg.services[1].services[0].href, 'http://router.lan');
});

test('!include: relative to the including file, nested, and variables become secrets', () => {
  const cfg = loadConfig(configDir({
    'services.yaml': '- Media: !include groups/media.yaml\n',
    'groups/media.yaml': '- Radarr: !include radarr.yaml\n',
    'groups/radarr.yaml': 'href: http://radarr.lan\nwidget:\n  type: radarr\n  key: "{{HD_VAR_RADARR}}"\n',
  }), { env: { HD_VAR_RADARR: 'k3y' } });
  assert.deepEqual(cfg.errors, []);
  assert.equal(cfg.services[0].services[0].widgets[0].options.key, 'k3y');
  assert.ok(cfg.secrets.has('k3y'));
});

test('!include: missing, outside, wrong type, cycles and YAML errors are messages, not crashes', () => {
  const cfg = loadConfig(configDir({
    'services.yaml': [
      '- Missing: !include nope.yaml',
      '- Outside: !include ../../etc/passwd.yaml',
      '- Absolute: !include /etc/hosts.yaml',
      '- Keys: !include keys/token.txt',
      '- Loop: !include loop-a.yaml',
      '- Broken: !include broken.yaml',
      '- Fine:',
      '    - App: { href: http://app.lan }',
      '',
    ].join('\n'),
    'loop-a.yaml': '- B: !include loop-b.yaml\n',
    'loop-b.yaml': '- A: !include loop-a.yaml\n',
    'broken.yaml': '- [unclosed\n',
  }));
  const messages = cfg.errors.map((e) => `${e.file} › ${e.path}: ${e.message}`);
  const has = (re) => assert.ok(messages.some((m) => re.test(m)), `${re} in\n${messages.join('\n')}`);
  has(/^services\.yaml › \[0\]\.Missing: !include nope\.yaml: file not found$/);
  has(/^services\.yaml › \[1\]\.Outside: .*outside the config folder$/);
  has(/^services\.yaml › \[2\]\.Absolute: .*relative to this file/);
  has(/^services\.yaml › \[3\]\.Keys: .*only \.yaml and \.yml/);
  has(/^loop-b\.yaml › \[0\]\.A: !include loop-a\.yaml: includes itself \(services\.yaml → loop-a\.yaml → loop-b\.yaml → loop-a\.yaml\)$/);
  has(/^broken\.yaml › line \d+: /);
  has(/^services\.yaml › \[5\]\.Broken: .*YAML error$/);
  assert.equal(cfg.services.find((g) => g.name === 'Fine').services[0].name, 'App');
});

test('!include works in the other files too, and a whole file can be one include', () => {
  const cfg = loadConfig(configDir({
    'bookmarks.yaml': '!include shared/bookmarks.yaml\n',
    'shared/bookmarks.yaml': '- Developer:\n    - GitHub:\n        - href: https://github.com\n',
    'widgets.yaml': '- datetime: !include shared/clock.yaml\n',
    'shared/clock.yaml': 'dateStyle: full\n',
  }));
  assert.deepEqual(cfg.errors, []);
  assert.equal(cfg.bookmarks[0].bookmarks[0].href, 'https://github.com');
  assert.equal(cfg.widgets[0].options.dateStyle, 'full');
});

test('background: a URL as before, or homepage\'s map with filters; cardBlur in pixels', () => {
  assert.deepEqual(loadConfig(configDir({ 'settings.yaml': 'background: https://example.com/a.jpg\n' })).settings.background, { image: 'https://example.com/a.jpg' });
  const cfg = loadConfig(configDir({ 'settings.yaml': [
    'background:', '  image: /icons/wall.jpg', '  blur: sm', '  saturate: 50', '  brightness: 250', '  opacity: 40', 'cardBlur: xl', '',
  ].join('\n') }));
  assert.deepEqual(cfg.settings.background, { image: '/icons/wall.jpg', blur: 8, saturate: 50, opacity: 40 });
  assert.equal(cfg.settings.cardBlur, 24);
  assert.deepEqual(cfg.warnings.map((w) => w.path), ['background.brightness']);
  const bad = loadConfig(configDir({ 'settings.yaml': 'background: { blur: sm }\ncardBlur: huge\n' }));
  assert.equal(bad.settings.background, null);
  assert.equal(bad.settings.cardBlur, null);
  assert.deepEqual(bad.warnings.map((w) => w.path).sort(), ['background', 'cardBlur']);
});

test('nested groups: an entry whose value is a list is a group inside the group (homepage format)', () => {
  const cfg = loadConfig(configDir({ 'services.yaml': [
    '- Group A:', '    - Service A:', '        href: http://a.lan', '    - Group B:', '        - Service B:', '            href: http://b.lan',
    '        - Group C:', '            - Service C: { href: http://c.lan }', '',
  ].join('\n') }));
  assert.deepEqual(cfg.errors, []);
  const a = cfg.services[0];
  assert.deepEqual(a.services.map((s) => s.name), ['Service A']);
  assert.equal(a.groups[0].name, 'Group B');
  assert.deepEqual(a.groups[0].services.map((s) => s.href), ['http://b.lan']);
  assert.equal(a.groups[0].groups[0].services[0].name, 'Service C');
});

test('width, column and collapse settings: types are checked', () => {
  const good = loadConfig(configDir({ 'settings.yaml': 'fullWidth: true\nmaxGroupColumns: 6\nuseEqualHeights: true\ndisableCollapse: false\n' }));
  assert.deepEqual(good.warnings, []);
  assert.equal(good.settings.maxGroupColumns, 6);
  const bad = loadConfig(configDir({ 'settings.yaml': 'fullWidth: yes please\nmaxGroupColumns: 12\nmaxBookmarkGroupColumns: two\ngroupsInitiallyCollapsed: 1\n' }));
  assert.deepEqual(bad.warnings.map((w) => w.path).sort(), ['fullWidth', 'groupsInitiallyCollapsed', 'maxBookmarkGroupColumns', 'maxGroupColumns']);
  assert.equal(bad.settings.maxGroupColumns, undefined);
});

test('headerStyle, cardStyle, blockStyle and font take homepage\'s values', () => {
  const good = loadConfig(configDir({ 'settings.yaml': 'headerStyle: boxedWidgets\ncardStyle: hairline\nblockStyle: refined\nfont: plex\n' }));
  assert.deepEqual(good.warnings, []);
  assert.equal(good.settings.headerStyle, 'boxedWidgets');
  const bad = loadConfig(configDir({ 'settings.yaml': 'headerStyle: fancy\ncardStyle: thick\nfont: comic\n' }));
  assert.deepEqual(bad.warnings.map((w) => w.path).sort(), ['cardStyle', 'font', 'headerStyle']);
  assert.equal(bad.settings.headerStyle, 'boxed');
});

test('quicklaunch settings are checked; provider custom needs a url', () => {
  const cfg = loadConfig(configDir({ 'settings.yaml': 'quicklaunch:\n  searchDescriptions: true\n  provider: brave\n  mobileButtonPosition: top-left\n' }));
  assert.deepEqual(cfg.warnings, []);
  assert.deepEqual(cfg.settings.quicklaunch, { searchDescriptions: true, provider: 'brave', mobileButtonPosition: 'top-left' });
  const bad = loadConfig(configDir({ 'settings.yaml': 'quicklaunch:\n  provider: custom\n  hideVisitURL: maybe\n  mobileButtonPosition: middle\n' }));
  assert.deepEqual(bad.warnings.map((w) => w.path).sort(), ['quicklaunch.hideVisitURL', 'quicklaunch.mobileButtonPosition', 'quicklaunch.url']);
  assert.deepEqual(bad.settings.quicklaunch, {});
});

test('base: a full URL, given a trailing slash; anything else is ignored with a warning', () => {
  assert.equal(loadConfig(configDir({ 'settings.yaml': 'base: https://lab.example.com/dashboard\n' })).settings.base, 'https://lab.example.com/dashboard/');
  const bad = loadConfig(configDir({ 'settings.yaml': 'base: /dashboard\n' }));
  assert.equal(bad.settings.base, undefined);
  assert.deepEqual(bad.warnings.map((w) => w.path), ['base']);
});

test('language zh-CN is read as zh-Hans, as in homepage', () => {
  assert.equal(loadConfig(configDir({ 'settings.yaml': 'language: zh-CN\n' })).settings.language, 'zh-Hans');
});

test('plugins: with every entry commented out is an empty list, not an error', () => {
  const cfg = loadConfig(configDir({ 'settings.yaml': 'plugins:\n  # - source: git+https://github.com/someone/widgets#v1.0.0\n' }));
  assert.deepEqual(cfg.settings.plugins, []);
  assert.deepEqual(cfg.errors, []);
  assert.match(loadConfig(configDir({ 'settings.yaml': 'plugins: radarr\n' })).errors[0].message, /expected a list/);
});

test('pluginUpdateInterval: every hour by default, a duration, false to turn off, at least a minute', () => {
  const ms = (yaml) => loadConfig(configDir({ 'settings.yaml': yaml }));
  assert.equal(ms('title: x\n').settings.pluginUpdateMs, 3_600_000);
  assert.equal(ms('pluginUpdateInterval: 15m\n').settings.pluginUpdateMs, 900_000);
  assert.equal(ms('pluginUpdateInterval: false\n').settings.pluginUpdateMs, 0);
  const fast = ms('pluginUpdateInterval: 10s\n');
  assert.equal(fast.settings.pluginUpdateMs, 60_000);
  assert.match(fast.warnings[0].message, /at least 1m/);
  const bad = ms('pluginUpdateInterval: soon\n');
  assert.equal(bad.settings.pluginUpdateMs, 3_600_000);
  assert.match(bad.warnings[0].message, /invalid duration "soon".*checking every hour/);
});
