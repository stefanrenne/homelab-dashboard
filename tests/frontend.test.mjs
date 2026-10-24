// The dashboard page in jsdom, with fetch stubbed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';

const HTML = fs.readFileSync(path.resolve('public/index.html'), 'utf8');

const LAYOUT = {
  version: '0.1.0',
  settings: { title: 'My Lab', language: 'nl', theme: 'dark', color: 'emerald', background: null, showTitle: false, headerStyle: 'boxed' },
  header: [],
  groups: [
    {
      name: 'Network',
      layout: { columns: 2 },
      services: [
        {
          id: 'svc-1', name: 'Router', href: 'http://router.lan', target: '_blank', icon: null, description: 'Gateway', discovered: null,
          statuses: [
            { kind: 'siteMonitor', instanceId: 's-1', type: 'http-status', options: {}, known: true, server: true, refreshMs: 30000 },
            { kind: 'container', instanceId: 's-2', type: 'docker', options: {}, known: true, server: true, refreshMs: 30000 },
          ],
          widgets: [{ instanceId: 'w-1', type: 'resources', options: {}, known: true, server: true, refreshMs: 5000 }],
        },
        {
          id: 'svc-2', name: 'Evil', href: 'javascript:alert(1)', target: '_blank', icon: null, description: null, discovered: 'docker:local',
          statuses: [],
          widgets: [{ instanceId: 'w-2', type: 'missing', options: {}, known: false }],
        },
        {
          id: 'svc-3', name: 'Radarr', href: null, target: '_blank', icon: null, description: null, discovered: null,
          statuses: [{ kind: 'ping', instanceId: 's-3', type: 'ping', options: {}, known: true, server: true, refreshMs: 30000 }],
          widgets: [
            { instanceId: 'w-3', type: 'custom-api', options: {}, known: true, server: true, refreshMs: 5000 },
            { instanceId: 'w-4', type: 'custom-api', options: {}, known: true, server: true, refreshMs: 5000, hideErrors: true },
            { instanceId: 'w-5', type: 'custom-api', options: {}, known: true, server: true, refreshMs: 5000 },
          ],
        },
      ],
    },
    { name: 'Empty', layout: {}, services: [] },
    { name: 'Hidden title', layout: { header: false }, services: [
      { id: 'svc-4', name: 'Script', href: 'https://hook.lan/run', target: 'hidden-iframe', icon: null, description: null, discovered: null, statuses: [], widgets: [] },
    ] },
  ],
  bookmarks: [{ name: 'Dev', bookmarks: [{ name: 'GitHub', href: 'https://github.com', abbr: 'GH', icon: null }] }],
  widgetTypes: {
    'http-status': { name: 'HTTP', client: null, i18n: { status: 'Status', latency: 'Latentie' } },
    docker: { name: 'Docker', client: null, i18n: { cpu: 'CPU', memory: 'Geheugen' } },
    ping: { name: 'Ping', client: null, i18n: {} },
    resources: { name: 'Resources', client: null, i18n: { cpu: 'CPU', memory: 'Geheugen' } },
    'custom-api': { name: 'Custom API', client: null, i18n: {} },
  },
  messages: { errors: [{ file: 'services.yaml', path: '[0].G', message: 'expected a list' }], warnings: [] },
};

const RESULTS = {
  '/api/layout': LAYOUT,
  '/api/widgets/s-1': { ok: true, data: { status: 'up', latency: 78.4, blocks: [] } },
  '/api/widgets/s-2': { ok: true, data: { status: 'up', statusText: 'healthy', blocks: [{ label: 'cpu', value: 3, unit: '%' }] } },
  '/api/widgets/s-3': { ok: true, data: { status: 'down', blocks: [] } },
  '/api/widgets/w-1': { ok: true, data: { blocks: [{ label: 'cpu', value: 12.25, unit: '%', status: 'ok' }, { label: 'memory', value: null, unit: '%' }] } },
  '/api/widgets/w-3': { ok: true, data: { blocks: [{ label: 'Wanted', value: 8 }], rows: [{ label: 'The Social Reckoning', value: 'import blocked - 00:00:00' }, { label: 'Silo', value: '03:54', progress: 40 }] } },
  '/api/widgets/w-4': { ok: false, error: 'hidden failure' },
  '/api/widgets/w-5': { ok: false, error: 'connect ECONNREFUSED' },
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

test('renders groups, cards, status labels, blocks, rows and bookmarks in the configured language', async () => {
  const w = await page();
  const doc = w.document;
  assert.equal(doc.title, 'My Lab');
  assert.equal(doc.getElementById('title').hidden, true);
  assert.equal(doc.documentElement.lang, 'nl');
  assert.equal(doc.documentElement.dataset.theme, 'dark');
  assert.equal(doc.documentElement.style.getPropertyValue('--t800'), '#065f46', 'emerald palette');
  assert.deepEqual([...doc.querySelectorAll('#groups .group h2')].map((h) => h.textContent), ['Network']);
  assert.equal(doc.querySelector('[data-group="Network"]').className, 'group layout-row');
  const router = doc.querySelector('[data-service="svc-1"]');
  assert.equal(router.querySelector('a').getAttribute('href'), 'http://router.lan');
  assert.deepEqual([...router.querySelectorAll('.tag')].map((t) => [t.textContent, t.className]), [['78 ms', 'tag up'], ['healthy', 'tag up']]);
  assert.deepEqual([...router.querySelectorAll('.block .l')].map((n) => n.textContent), ['CPU', 'Geheugen']);
  assert.deepEqual([...router.querySelectorAll('.block .v')].map((n) => n.textContent), ['12,3%', '–']);
  const radarr = doc.querySelector('[data-service="svc-3"]');
  assert.deepEqual([...radarr.querySelectorAll('.tag')].map((t) => t.textContent), ['Offline']);
  assert.deepEqual([...radarr.querySelectorAll('.row')].map((r) => [r.querySelector('.rl').textContent, r.querySelector('.rv').textContent]), [
    ['The Social Reckoning', 'import blocked - 00:00:00'], ['Silo', '03:54'],
  ]);
  assert.equal(radarr.querySelector('.row .progress').style.width, '40%');
  assert.equal(radarr.querySelectorAll('.api-error').length, 1, 'hideErrors hides one of the two failures');
  assert.match(radarr.querySelector('.api-error').textContent, /API-foutinformatie.*ECONNREFUSED/);
  assert.equal(doc.querySelector('.bm .bn').textContent, 'GitHub');
  assert.match(doc.querySelector('.msg').textContent, /Fouten in de configuratie \(1\)/);
  w.close();
});

test('clicking a container label shows the container stats', async () => {
  const w = await page();
  const router = w.document.querySelector('[data-service="svc-1"]');
  const tag = router.querySelectorAll('.tag')[1];
  tag.click();
  assert.deepEqual([...router.querySelectorAll('.container-stats .block .v')].map((n) => n.textContent), ['3%']);
  tag.click();
  assert.equal(router.querySelector('.container-stats'), null);
  w.close();
});

test('hidden-iframe services call their URL without leaving the page', async () => {
  const w = await page();
  const link = w.document.querySelector('[data-service="svc-4"] a');
  link.click();
  const frame = w.document.querySelector('iframe[hidden]');
  assert.equal(frame.getAttribute('src'), 'https://hook.lan/run');
  assert.equal(w.document.getElementById('toast').textContent, 'Gestart');
  w.close();
});

test('theme toggle and colour choice are remembered per viewer', async () => {
  const w = await page();
  w.document.getElementById('theme-btn').click();
  assert.equal(w.document.documentElement.dataset.theme, 'light');
  w.document.querySelector('.swatch[title="rose"]').click();
  assert.equal(w.document.documentElement.style.getPropertyValue('--t800'), '#9f1239');
  assert.equal(w.localStorage.getItem('hd-theme'), 'light');
  w.close();
});

test('unsafe links are dropped and unknown widgets explain themselves', async () => {
  const w = await page();
  const evil = w.document.querySelector('[data-service="svc-2"]');
  assert.equal(evil.querySelector('a'), null);
  assert.match(evil.querySelector('.api-error').textContent, /Onbekend widgettype: missing/);
  assert.match(evil.querySelector('.name').title, /gevonden via: docker:local/);
  w.close();
});

test('an empty dashboard shows how to add services', async () => {
  const w = await page({ ...RESULTS, '/api/layout': { ...LAYOUT, settings: { ...LAYOUT.settings, language: 'en' }, groups: [], bookmarks: [] } });
  assert.match(w.document.querySelector('.empty').textContent, /services\.yaml/);
  w.close();
});

test('every UI text exists in every language', async () => {
  const w = await page();
  const { I18N, PALETTES } = w.HD;
  const keys = Object.keys(I18N.en).sort();
  for (const lang of ['en', 'nl', 'fr', 'de', 'es']) assert.deepEqual(Object.keys(I18N[lang]).sort(), keys, lang);
  for (const [name, shades] of Object.entries(PALETTES)) assert.equal(shades.split(' ').length, 11, name);
  assert.equal(w.HD.safeHref(' JavaScript:alert(1)'), null);
  assert.equal(w.HD.safeHref('smb://nas/share'), 'smb://nas/share');
  w.close();
});
