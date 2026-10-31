// The documentation site: staging (scripts/pages.sh), the widget pages (scripts/pages-widgets.mjs)
// and the examples behind the widget images (scripts/widget-images.mjs; the pictures themselves
// need Playwright and are not taken here).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { attributeRows, movedLinks, optionRows, widgetPage, writeWidgetPages } from '../scripts/pages-widgets.mjs';
import { exampleEntry, showsData, splitFiles } from '../scripts/widget-images.mjs';
import { tmpDir, COLLECTION_DIR } from './helpers.mjs';

test('optionRows: type, required, default, secret and the line comment', () => {
  const rows = optionRows(`id: x
options:
  url: { type: url, required: true }      # e.g. http://x:1
  key: { type: string, secret: true }
  mode: { type: enum, values: [a, b], default: a }
`);
  assert.deepEqual(rows, [
    { name: 'url', type: 'url', required: true, default: undefined, secret: false, description: 'E.g. http://x:1' },
    { name: 'key', type: 'string', required: false, default: undefined, secret: true, description: '' },
    { name: 'mode', type: 'a / b', required: false, default: 'a', secret: false, description: '' },
  ]);
});

test('widgetPage: info line, options table before the example', () => {
  const page = widgetPage(path.join(COLLECTION_DIR, 'widgets/docker'), { kind: 'collection', tag: 'v9.9.9' });
  assert.match(page.markdown, /^# Docker container\n\n`type: docker` · version \d+\.\d+\.\d+/);
  const options = page.markdown.indexOf('## Options');
  assert.ok(options > page.markdown.indexOf('## Fields') && options < page.markdown.indexOf('## Example'));
  assert.match(page.markdown, /\| `container` \| string \| yes \|/);
  assert.match(widgetPage(path.join(COLLECTION_DIR, 'widgets/custom-api'), { kind: 'collection', tag: 'v9.9.9' }).markdown, /`type: custom-api` \(or `customapi`\) · version/, 'aliases are named');
  assert.equal(page.kind, 'service');
  assert.equal(widgetPage(path.join(COLLECTION_DIR, 'widgets/datetime'), { kind: 'collection', tag: 'v9.9.9' }).kind, 'header', 'a widgets.yaml example makes a header widget');
});

test('attributeRows and the Attributes table, after the options; option comments stay their own', () => {
  const yaml = `id: x
options:
  version: { type: number }               # the API version
attributes:
  update: { type: boolean }               # true while an update waits
  version: { type: string }               # the installed firmware
`;
  assert.deepEqual(attributeRows(yaml), [
    { name: 'update', type: 'boolean', description: 'True while an update waits' },
    { name: 'version', type: 'string', description: 'The installed firmware' },
  ]);
  assert.equal(optionRows(yaml)[0].description, 'The API version', 'a same-named attribute does not take the option\'s comment');
  const dir = tmpDir('hd-attr-page-');
  fs.writeFileSync(path.join(dir, 'widget.yaml'), `name: X\nversion: 1.0.0\napiVersion: 1\n${yaml}`);
  fs.writeFileSync(path.join(dir, 'README.md'), '# X\n\nIntro.\n\n## Example\n\n```yaml\n- x: {}\n```\n');
  const md = widgetPage(dir, { kind: 'collection', tag: 'v1' }).markdown;
  assert.ok(md.indexOf('## Options') < md.indexOf('## Attributes') && md.indexOf('## Attributes') < md.indexOf('## Example'));
  assert.match(md, /\| `update` \| boolean \| True while an update waits \|/);
  assert.ok(!widgetPage(path.join(COLLECTION_DIR, 'widgets/radarr'), { kind: 'collection', tag: 'v1' }).markdown.includes('## Attributes'), 'none, no section');
});

test('widgetPage: the example image right after the info line', () => {
  const page = widgetPage(path.join(COLLECTION_DIR, 'widgets/radarr'), { kind: 'collection', tag: 'v9.9.9' }, 'images/radarr.png');
  assert.match(page.markdown, /\{: \.fs-3 \.text-grey-dk-000 \}\n\n!\[Radarr with example data\]\(images\/radarr\.png\)\n/);
  assert.ok(!widgetPage(path.join(COLLECTION_DIR, 'widgets/radarr'), { kind: 'collection', tag: 'v9.9.9' }).markdown.includes('!['), 'no image, no picture');
});

test('writeWidgetPages: the collection\'s section, menu front matter, examples kept literal', () => {
  const site = tmpDir('hd-site-');
  const collection = tmpDir('hd-collection-');
  fs.cpSync(path.resolve('examples/widget-template'), path.join(collection, 'widgets', 'example-counter'), { recursive: true });
  fs.writeFileSync(path.join(collection, 'widgets', 'example-counter', 'README.md'), '# Example counter\n\nIntro.\n\n## Example\n\n```yaml\nkey: "{{HD_VAR_KEY}}"\n```\n');

  fs.mkdirSync(path.join(site, 'widgets', 'collection', 'images'), { recursive: true });
  fs.writeFileSync(path.join(site, 'widgets', 'collection', 'images', 'example-counter.png'), '');
  fs.writeFileSync(path.join(site, 'widgets', 'README.md'), '# Widgets\n');
  const n = writeWidgetPages({ site, collectionDir: collection, collectionTag: 'v9.9.9' });
  assert.deepEqual(n, { collection: 1, service: 1, header: 0, images: 1 });

  const page = fs.readFileSync(path.join(site, 'widgets/collection/example-counter.md'), 'utf8');
  const [, front, body] = page.split(/^---$/m);
  assert.deepEqual(YAML.parse(front), { title: 'Example counter', parent: 'Service widgets', grand_parent: 'Widgets', permalink: '/widgets/collection/example-counter.html' });
  assert.ok(body.includes('](images/example-counter.png)'));
  assert.match(body, /^\n\{% raw %\}\n/);
  assert.ok(body.includes('"{{HD_VAR_KEY}}"'));
  assert.ok(body.includes('**Secret**: stays on the server.'));
  assert.ok(body.includes('tree/v9.9.9/widgets/example-counter'));
  const index = fs.readFileSync(path.join(site, 'widgets/collection/index.md'), 'utf8');
  assert.match(index, /\| \[Example counter\]\(\.\.\/collection\/example-counter\.html\) \| `example-counter` \|/);
  assert.match(fs.readFileSync(path.join(site, 'widgets/header/index.md'), 'utf8'), /^---\n[\s\S]*permalink: \/widgets\/header\//);
  const all = fs.readFileSync(path.join(site, 'widgets/README.md'), 'utf8');
  assert.match(all, /## Service widgets\n\n[\s\S]*\| \[Example counter\]\(collection\/example-counter\.html\) \|[\s\S]*## Header widgets/, 'the Widgets page lists them all');
});

test('movedLinks: old configuration addresses in a widget README go to the new pages', () => {
  assert.equal(movedLinks('see [Configuration](../../configuration.html#dockeryaml) and [x](../../configuration.html#widgetsyaml)'),
    'see [Configuration](../../configuration/docker.html) and [x](../../configuration/header-widgets.html)');
  assert.equal(movedLinks('[v](../../configuration.html#variables)'), '[v](../../configuration/#variables)');
  assert.equal(movedLinks('[k](../../discovery.html#kubernetes)'), '[k](../../configuration/kubernetes.html#discovery)');
});

test('splitFiles: a README code block with several files', () => {
  assert.deepEqual(splitFiles('# settings.yaml\nproviders:\n  x: y\n\n# widgets.yml\n- stocks: {}\n'), {
    'settings.yaml': '# settings.yaml\nproviders:\n  x: y\n\n',
    'widgets.yaml': '# widgets.yml\n- stocks: {}\n\n',
  });
});

test('exampleEntry: the README example, with url options at the mock and secrets made up', () => {
  const radarr = exampleEntry(path.join(COLLECTION_DIR, 'widgets/radarr'), 'http://127.0.0.1:9');
  assert.equal(radarr.kind, 'service');
  assert.equal(radarr.service.widget.type, 'radarr');
  assert.equal(radarr.service.widget.url, 'http://127.0.0.1:9/radarr');
  assert.ok(!JSON.stringify(radarr).includes('{{'), 'no variables left');
  const datetime = exampleEntry(path.join(COLLECTION_DIR, 'widgets/datetime'), 'http://127.0.0.1:9');
  assert.equal(datetime.kind, 'header');
  assert.deepEqual(Object.keys(datetime.entry), ['datetime']);
  const dir = tmpDir('hd-widget-');
  fs.writeFileSync(path.join(dir, 'widget.yaml'), 'id: x\nname: X\noptions: {}\n');
  assert.equal(exampleEntry(dir, 'http://m'), null, 'no README');
});

test('showsData: only results worth a picture', () => {
  assert.equal(showsData({ ok: true, data: { blocks: [{ label: 'a', value: 1 }] } }), true);
  assert.equal(showsData({ ok: false, error: 'answered 401' }), false);
  assert.equal(showsData({ ok: true, data: { status: 'error', blocks: [] } }), false);
  assert.equal(showsData({ ok: true, data: { blocks: [{ label: 'status', value: 'not found', status: 'error' }] } }), false);
  assert.equal(showsData({ ok: true, data: { blocks: [{ key: 'down', label: 'down', value: 1, status: 'error' }] } }), true, 'a count that needs attention is data');
});

test('pages.sh: links that leave docs/ go to GitHub, from every depth', () => {
  const out = path.join(tmpDir('hd-pages-'), 'site');
  execFileSync('sh', ['scripts/pages.sh', out, 'someone/repo']);
  const local = fs.readFileSync(path.join(out, 'extend/local.md'), 'utf8');
  assert.ok(local.includes('](https://github.com/someone/repo/tree/main/examples/widget-template)'));
  assert.ok(local.includes('](api-reference.md#clientjs)'), 'links inside docs/ stay');
  const home = fs.readFileSync(path.join(out, 'README.md'), 'utf8');
  assert.ok(home.includes('](https://github.com/someone/repo/tree/main/docker-compose.example.yml)'));
  assert.ok(home.includes('<details markdown="1">'));
  assert.match(home, /^---\n---\n\{% raw %\}\n/);
});

test('docs: every page has an entry in _config.yml, and relative links point at files', () => {
  const config = YAML.parse(fs.readFileSync('docs/_config.yml', 'utf8'));
  const scopes = new Set(config.defaults.map((d) => d.scope.path));
  const pages = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.md')) pages.push(path.relative('docs', p));
    }
  };
  walk('docs');
  for (const page of pages) {
    assert.ok(scopes.has(page), `${page} has no entry under defaults: in docs/_config.yml`);
    const text = fs.readFileSync(path.join('docs', page), 'utf8');
    for (const [, target] of text.matchAll(/\]\(([^)#\s]+\.md)(?:#[^)]*)?\)/g)) {
      if (/^https?:/.test(target)) continue;
      assert.ok(fs.existsSync(path.join('docs', path.dirname(page), target)), `${page} links to ${target}, which is not there`);
    }
  }
});

test('docs: no YAML key with [ ] or \', which the site\'s highlighter (Rouge) marks red, quoted or not', () => {
  const files = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.md')) files.push(p);
    }
  };
  walk('docs');
  const bad = [];
  for (const file of files) {
    for (const [, block] of fs.readFileSync(file, 'utf8').matchAll(/```ya?ml\n([\s\S]*?)```/g)) {
      for (const line of block.split('\n')) {
        const key = /^\s*(?:- )?("[^"]*"|'[^']*'|[^"'\s#{[][^:"#]*?)\s*:(?:\s|$)/.exec(line)?.[1];
        if (key && /[[\]']/.test(key.replace(/^'|'$/g, ''))) bad.push(`${file}: ${line.trim()}`);
      }
    }
  }
  assert.deepEqual(bad, [], 'labels as a list (- homelab.widgets[0].type=emby), or ’ for an apostrophe');
});
