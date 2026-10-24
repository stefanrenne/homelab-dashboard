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
  assert.match(renderIndex(HTML, { title: 'x', favicon: '/icons/lab.png' }), /<link rel="icon" href="\/icons\/lab\.png">/);
  const plain = renderIndex(HTML, { title: 'x' });
  assert.ok(!plain.includes('rel="icon"') && !plain.includes('name="description"'));
});

test('renderIndex: a secret in the description never reaches the page', () => {
  const out = renderIndex(HTML, { title: 'x', description: 'key s3cret here' }, new Set(['s3cret']));
  assert.ok(!out.includes('s3cret'));
  assert.match(out, /content="key \*\*\* here"/);
});
