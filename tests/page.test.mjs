// The server-rendered parts of the dashboard page (src/page.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { renderIndex } from '../src/page.js';

const HTML = fs.readFileSync('public/index.html', 'utf8');

test('renderIndex: title, description and favicon in the head, escaped', () => {
  const out = renderIndex(HTML, { title: 'Lab <&>', description: 'My "lab"', favicon: 'https://example.com/f.png' });
  assert.match(out, /<title>Lab &lt;&amp;&gt;<\/title>/);
  assert.match(out, /<meta name="description" content="My &quot;lab&quot;">\n<\/head>|<meta name="description" content="My &quot;lab&quot;">\n<link/);
  assert.match(out, /<link rel="icon" href="https:\/\/example\.com\/f\.png">\n<\/head>/);
  assert.equal((out.match(/<title>/g) ?? []).length, 1);
});

test('renderIndex: favicon as a dashboard-icons name or a config icon, nothing when unset', () => {
  assert.match(renderIndex(HTML, { title: 'x', favicon: 'proxmox.svg' }), /<link rel="icon" href="https:\/\/cdn\.jsdelivr\.net\/[^"]+\/svg\/proxmox\.svg">/);
  assert.match(renderIndex(HTML, { title: 'x', favicon: '/icons/lab.png' }), /<link rel="icon" href="icons\/lab\.png">/);
  const plain = renderIndex(HTML, { title: 'x' });
  assert.ok(!plain.includes('rel="icon"') && !plain.includes('name="description"'));
});

test('renderIndex: a secret in the description never reaches the page', () => {
  const out = renderIndex(HTML, { title: 'x', description: 'key s3cret here' }, new Set(['s3cret']));
  assert.ok(!out.includes('s3cret'));
  assert.match(out, /content="key \*\*\* here"/);
});

test('SHADE_800 matches shade 800 of every palette in index.html', async () => {
  const { SHADE_800 } = await import('../src/page.js');
  const block = HTML.slice(HTML.indexOf('const PALETTES = {'), HTML.indexOf('};', HTML.indexOf('const PALETTES = {')));
  const fromPage = Object.fromEntries([...block.matchAll(/^\s+([a-z]+): '([^']+)'/gm)].map((m) => [m[1], m[2].split(' ')[8]]));
  assert.deepEqual(SHADE_800, fromPage);
});

test('renderManifest: name, start_url, colours, icons from pwa or the favicon, shortcuts', async () => {
  const { renderManifest } = await import('../src/page.js');
  const plain = renderManifest({ title: 'Lab', color: 'emerald', pwa: {} });
  assert.deepEqual(plain, { name: 'Lab', short_name: 'Lab', start_url: '/', display: 'standalone', theme_color: '#065f46', background_color: '#065f46', icons: [] });
  assert.deepEqual(renderManifest({ title: 'Lab', favicon: '/icons/lab.svg', pwa: {} }).icons, [{ src: 'icons/lab.svg', sizes: 'any' }]);

  const full = renderManifest({
    title: 'Lab', description: 'My lab', startUrl: '/#media', color: 'nope',
    pwa: { icons: [{ src: 'proxmox.png', sizes: '192x192', type: 'image/png' }], shortcuts: [{ name: 'Media', url: '/#media', description: 'tab' }] },
  }, new Set());
  assert.equal(full.start_url, '/#media');
  assert.equal(full.description, 'My lab');
  assert.equal(full.theme_color, '#1e293b', 'an unknown colour falls back to slate');
  assert.match(full.icons[0].src, /\/png\/proxmox\.png$/);
  assert.deepEqual(full.shortcuts, [{ name: 'Media', url: '/#media', description: 'tab' }]);
  assert.ok(renderIndex(HTML, { title: 'x' }).includes('<link rel="manifest" href="site.webmanifest">'));
});

test('renderIndex: settings.base as the first tag in the head', () => {
  const out = renderIndex(HTML, { title: 'x', base: 'https://lab.example.com/dashboard/' });
  const injected = out.slice(out.indexOf('<base'), out.indexOf('</head>'));
  assert.ok(injected.startsWith('<base href="https://lab.example.com/dashboard/">\n<link rel="manifest"'));
});
