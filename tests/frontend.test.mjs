// The dashboard page in jsdom, with fetch stubbed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';

const HTML = fs.readFileSync(path.resolve('public/index.html'), 'utf8');

const LAYOUT = {
  version: '0.1.0',
  settings: { title: 'My Lab', language: 'nl', theme: 'dark', color: 'emerald', background: null },
  header: [],
  groups: [
    {
      name: 'Network',
      layout: { columns: 2 },
      services: [
        {
          id: 'svc-1', name: 'Router', href: 'http://router.lan', target: '_blank', icon: null, description: 'Gateway', discovered: null,
          status: { instanceId: 's-1', type: 'http-status', options: {}, known: true, server: true, refreshMs: 30000 },
          widgets: [{ instanceId: 'w-1', type: 'resources', options: {}, known: true, server: true, refreshMs: 5000 }],
        },
        {
          id: 'svc-2', name: 'Evil', href: 'javascript:alert(1)', target: '_blank', icon: null, description: null, discovered: 'docker:local',
          status: null,
          widgets: [{ instanceId: 'w-2', type: 'missing', options: {}, known: false }],
        },
      ],
    },
    { name: 'Empty', layout: {}, services: [] },
  ],
  bookmarks: [{ name: 'Dev', bookmarks: [{ name: 'GitHub', href: 'https://github.com', abbr: 'GH', icon: null }] }],
  widgetTypes: {
    'http-status': { name: 'HTTP', client: null, i18n: { status: 'Status', latency: 'Latentie' } },
    resources: { name: 'Resources', client: null, i18n: { cpu: 'CPU', memory: 'Geheugen' } },
  },
  messages: { errors: [{ file: 'services.yaml', path: '[0].G', message: 'expected a list' }], warnings: [] },
};

const RESULTS = {
  '/api/layout': LAYOUT,
  '/api/widgets/s-1': { ok: true, data: { status: 'up', latency: 12.4, blocks: [] } },
  '/api/widgets/w-1': { ok: true, data: { blocks: [{ label: 'cpu', value: 12.25, unit: '%', status: 'ok' }, { label: 'memory', value: null, unit: '%' }] } },
};

async function page(results = RESULTS) {
  const dom = new JSDOM(HTML, {
    runScripts: 'dangerously',
    url: 'http://localhost/',
    beforeParse(window) {
      window.fetch = async (url) => ({ json: async () => structuredClone(results[url] ?? { ok: false, error: 'nope' }) });
    },
  });
  await new Promise((r) => setTimeout(r, 30));
  return dom.window;
}

test('renders groups, cards, status, blocks and bookmarks in the configured language', async () => {
  const w = await page();
  const doc = w.document;
  assert.equal(doc.title, 'My Lab');
  assert.equal(doc.documentElement.lang, 'nl');
  assert.deepEqual([...doc.querySelectorAll('.group h2')].map((h) => h.textContent), ['Network', 'Dev']);
  const router = doc.querySelector('[data-service="svc-1"]');
  assert.equal(router.querySelector('a').getAttribute('href'), 'http://router.lan');
  assert.equal(router.querySelector('.dot').className, 'dot up');
  assert.equal(router.querySelector('.status span').textContent, '12 ms');
  assert.deepEqual([...router.querySelectorAll('.block .l')].map((n) => n.textContent), ['CPU', 'Geheugen']);
  assert.deepEqual([...router.querySelectorAll('.block .v')].map((n) => n.textContent), ['12,3 %', '–']);
  assert.equal(doc.querySelector('.bm span:last-child').textContent, 'GitHub');
  assert.match(doc.querySelector('.msg').textContent, /Fouten in de configuratie \(1\)/);
  w.close();
});

test('unsafe links are dropped and unknown widgets explain themselves', async () => {
  const w = await page();
  const evil = w.document.querySelector('[data-service="svc-2"]');
  assert.equal(evil.querySelector('a'), null);
  assert.match(evil.querySelector('.widget-error').textContent, /Onbekend widgettype: missing/);
  assert.equal(evil.querySelector('.badge').textContent, 'auto');
  w.close();
});

test('an empty dashboard shows how to add services', async () => {
  const w = await page({ ...RESULTS, '/api/layout': { ...LAYOUT, settings: { ...LAYOUT.settings, language: 'en' }, groups: [], bookmarks: [] } });
  assert.match(w.document.querySelector('.empty').textContent, /services\.yaml/);
  w.close();
});

test('every UI text exists in every language', async () => {
  const w = await page();
  const { I18N } = w.HD;
  const keys = Object.keys(I18N.en).sort();
  for (const lang of ['en', 'nl', 'fr', 'de', 'es']) assert.deepEqual(Object.keys(I18N[lang]).sort(), keys, lang);
  assert.equal(w.HD.safeHref(' JavaScript:alert(1)'), null);
  assert.equal(w.HD.safeHref('smb://nas/share'), 'smb://nas/share');
  w.close();
});
