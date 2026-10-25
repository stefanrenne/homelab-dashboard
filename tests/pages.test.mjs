// The widget pages of the documentation site (scripts/pages-widgets.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { optionRows, widgetPage, writeWidgetPages } from '../scripts/pages-widgets.mjs';
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
});

test('writeWidgetPages: the collection\'s section, menu front matter, examples kept literal', () => {
  const site = tmpDir('hd-site-');
  const collection = tmpDir('hd-collection-');
  fs.cpSync(path.resolve('examples/widget-template'), path.join(collection, 'widgets', 'example-counter'), { recursive: true });
  fs.writeFileSync(path.join(collection, 'widgets', 'example-counter', 'README.md'), '# Example counter\n\nIntro.\n\n## Example\n\n```yaml\nkey: "{{HD_VAR_KEY}}"\n```\n');

  const n = writeWidgetPages({ site, collectionDir: collection, collectionTag: 'v9.9.9' });
  assert.equal(n.collection, 1);

  const page = fs.readFileSync(path.join(site, 'widgets/collection/example-counter.md'), 'utf8');
  const [, front, body] = page.split(/^---$/m);
  assert.deepEqual(YAML.parse(front), { title: 'Example counter', parent: 'Widget collection', grand_parent: 'Widgets' });
  assert.match(body, /^\n\{% raw %\}\n/);
  assert.ok(body.includes('"{{HD_VAR_KEY}}"'));
  assert.ok(body.includes('**Secret**: stays on the server.'));
  assert.ok(body.includes('tree/v9.9.9/widgets/example-counter'));
  const index = fs.readFileSync(path.join(site, 'widgets/collection/index.md'), 'utf8');
  assert.match(index, /\| \[Example counter\]\(example-counter\.html\) \| `example-counter` \|/);
});
