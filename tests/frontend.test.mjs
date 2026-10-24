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
            { instanceId: 'w-6', type: 'queue', options: {}, known: true, server: true, refreshMs: 5000 },
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
    queue: { name: 'Queue', client: null, i18n: { pool: '{pool} gebruikt', importBlocked: 'Import geblokkeerd', moreItems: '+{count} meer' } },
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
  '/api/widgets/w-6': { ok: true, data: {
    blocks: [{ label: 'pool', vars: { pool: 'Trunk' }, value: 35, unit: '%' }, { label: 'Failed', value: 2, status: 'warn' }, { label: 'Errors', value: 1, status: 'error' }],
    rows: [{ label: 'Blocked movie', value: 'importBlocked', status: 'warn' }, { label: 'moreItems', vars: { count: 3 } }],
  } },
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
  assert.ok(doc.getElementById('title').classList.contains('sr-only'), 'title hidden visually, kept for screen readers');
  assert.equal(doc.documentElement.lang, 'nl');
  assert.equal(doc.documentElement.dataset.theme, 'dark');
  assert.equal(doc.documentElement.style.getPropertyValue('--t800'), '#065f46', 'emerald palette');
  assert.deepEqual([...doc.querySelectorAll('#groups .group h2:not(.sr-only)')].map((h) => h.textContent), ['Network']);
  assert.deepEqual([...doc.querySelectorAll('#groups .group h2.sr-only')].map((h) => h.textContent), ['Hidden title']);
  assert.equal(doc.querySelector('[data-group="Network"]').className, 'group layout-row');
  const router = doc.querySelector('[data-service="svc-1"]');
  assert.equal(router.querySelector('a').getAttribute('href'), 'http://router.lan');
  assert.deepEqual([...router.querySelectorAll('.tag')].map((t) => [t.textContent, t.className]), [['78 ms', 'tag up'], ['healthy', 'tag up']]);
  assert.deepEqual([...router.querySelectorAll('.block .l')].map((n) => n.textContent), ['CPU', 'Geheugen']);
  assert.deepEqual([...router.querySelectorAll('.block .v')].map((n) => n.textContent), ['12,3%', '–']);
  const radarr = doc.querySelector('[data-service="svc-3"]');
  assert.deepEqual([...radarr.querySelectorAll('.tag')].map((t) => t.textContent), ['Offline']);
  assert.deepEqual([...radarr.querySelector('.widget').querySelectorAll('.row')].map((r) => [r.querySelector('.rl').textContent, r.querySelector('.rv').textContent]), [
    ['The Social Reckoning', 'import blocked - 00:00:00'], ['Silo', '03:54'],
  ]);
  assert.equal(radarr.querySelector('.row .progress').style.width, '40%');
  assert.equal(radarr.querySelectorAll('.api-error').length, 1, 'hideErrors hides one of the two failures');
  assert.equal(radarr.querySelector('.api-error summary').textContent, 'Radarr is niet bereikbaar. Draait het, en klopt "url"?');
  assert.match(radarr.querySelector('.api-error div').textContent, /ECONNREFUSED/);
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

test('hidden-iframe services run through the server and report how it went', async () => {
  const w = await page({ ...RESULTS, '/api/run/svc-4': { ok: true, status: 200 } });
  const doc = w.document;
  doc.querySelector('[data-service="svc-4"] a').click();
  assert.equal(doc.querySelector('iframe'), null, 'no hidden frame any more');
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(doc.getElementById('toast-text').textContent, 'Script: klaar');
  assert.equal(doc.getElementById('toast').classList.contains('error'), false);
  w.close();

  const failing = await page({ ...RESULTS, '/api/run/svc-4': { ok: false, status: 500 } });
  failing.document.querySelector('[data-service="svc-4"] a').click();
  await new Promise((r) => setTimeout(r, 20));
  const toastEl = failing.document.getElementById('toast');
  assert.equal(failing.document.getElementById('toast-text').textContent, 'Script mislukt: HTTP 500');
  assert.ok(toastEl.classList.contains('error'));
  assert.equal(toastEl.getAttribute('aria-live'), 'assertive');
  await new Promise((r) => setTimeout(r, 50));
  assert.ok(toastEl.classList.contains('show'), 'an error stays until it is closed');
  failing.document.dispatchEvent(new failing.KeyboardEvent('keydown', { key: 'Escape' }));
  assert.equal(toastEl.classList.contains('show'), false);
  failing.close();
});

test('groups fold and unfold, remember it per viewer, and open while searching', async () => {
  const collapsedLayout = { ...LAYOUT, groups: LAYOUT.groups.map((g) => g.name === 'Network' ? { ...g, layout: { ...g.layout, initiallyCollapsed: true } } : g) };
  const w = await page({ ...RESULTS, '/api/layout': collapsedLayout });
  const doc = w.document;
  const section = doc.querySelector('[data-group="Network"]');
  const toggle = section.querySelector('.group-toggle');
  assert.ok(section.classList.contains('collapsed'), 'initiallyCollapsed');
  assert.equal(toggle.getAttribute('aria-expanded'), 'false');
  assert.equal(toggle.getAttribute('aria-controls'), section.querySelector('.cards').id);
  toggle.click();
  assert.equal(section.classList.contains('collapsed'), false);
  assert.deepEqual(JSON.parse(w.localStorage.getItem('hd-collapsed')), { Network: false });
  toggle.click();
  doc.dispatchEvent(new w.CustomEvent('hd-search-input', { detail: { query: 'router' } }));
  assert.ok(doc.getElementById('groups').classList.contains('searching'), 'search looks inside folded groups');
  assert.equal(doc.querySelector('[data-group="Hidden title"] .group-toggle'), null, 'no toggle without a visible header');
  w.close();
});

test('row icons are drawn, and spoken as words', async () => {
  const w = await page({ ...RESULTS, '/api/widgets/w-3': { ok: true, data: { rows: [{ label: 'Silo', icon: 'play', value: '3:54 / 58:00' }] } } });
  const label = w.document.querySelector('[data-service="svc-3"] .row .rl');
  assert.equal(label.querySelector('.sym').textContent, '▶');
  assert.equal(label.querySelector('.sym').getAttribute('aria-hidden'), 'true');
  assert.equal(label.querySelector('.sr-only').textContent, 'Speelt af: ');
  w.close();
});

test('lows: no version in the footer, safe areas and a browser colour that follows the theme', async () => {
  const w = await page();
  const doc = w.document;
  assert.equal(doc.getElementById('version'), null);
  assert.match(doc.querySelector('meta[name="viewport"]').content, /viewport-fit=cover/);
  assert.equal(doc.getElementById('theme-color').content, '#065f46', 'emerald-800 in dark');
  doc.querySelector('[data-appearance="light"]').click();
  assert.equal(doc.getElementById('theme-color').content, '#ecfdf5');
  w.close();
});

test('appearance: light, dark and back to following the system; colour remembered', async () => {
  const w = await page();
  const doc = w.document;
  const pressed = () => [...doc.querySelectorAll('[data-appearance]')].filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.dataset.appearance);
  assert.deepEqual(pressed(), ['dark'], 'settings.yaml says dark');
  doc.querySelector('[data-appearance="light"]').click();
  assert.equal(doc.documentElement.dataset.theme, 'light');
  assert.equal(w.localStorage.getItem('hd-theme'), 'light');
  doc.querySelector('[data-appearance="auto"]').click();
  assert.deepEqual(pressed(), ['auto']);
  assert.equal(doc.documentElement.dataset.theme, 'dark', 'jsdom has no light system preference');
  for (const b of doc.querySelectorAll('[data-appearance]')) assert.ok(b.getAttribute('aria-label'), 'icon-only buttons are labelled');
  doc.querySelector('.swatch[title="rose"]').click();
  assert.equal(doc.documentElement.style.getPropertyValue('--t800'), '#9f1239');
  w.close();
});

test('search events filter services, and Enter with one match opens it', async () => {
  const w = await page();
  const doc = w.document;
  const send = (name, query) => doc.dispatchEvent(new w.CustomEvent(name, { detail: { query }, cancelable: true }));
  send('hd-search-input', 'rout');
  const visible = () => [...doc.querySelectorAll('.card')].filter((c) => !c.hidden).map((c) => c.dataset.name);
  assert.deepEqual(visible(), ['Router']);
  assert.equal(doc.querySelector('[data-group="Hidden title"]').hidden, true, 'groups without matches disappear');
  assert.equal(doc.getElementById('search-status').textContent, '1 services gevonden');
  let opened = null;
  doc.querySelector('[data-service="svc-1"] a').addEventListener('click', (e) => { e.preventDefault(); opened = 'router'; });
  assert.equal(send('hd-search-submit', 'rout'), false, 'the dashboard handled it');
  assert.equal(opened, 'router');
  assert.equal(send('hd-search-submit', 'zzz'), true, 'no match: the widget searches the web');
  assert.equal(doc.getElementById('search-status').textContent, 'Geen services gevonden');
  send('hd-search-input', '');
  assert.equal(visible().length, 4);
  w.close();
});

test('error summaries say what to check', async () => {
  const w = await page();
  const { explainError } = w.HD;
  assert.equal(explainError('Radarr', 'Radarr movie answered 401'), 'Radarr: de API-key is geweigerd. Controleer "key".');
  assert.equal(explainError('Radarr', 'fetch failed (ENOTFOUND)'), 'Radarr is niet bereikbaar. Draait het, en klopt "url"?');
  assert.equal(explainError('Portainer', 'Portainer has no environment 9'), 'Portainer: adres niet gevonden. Controleer "url".');
  assert.equal(explainError('X', 'invalid options: url: required'), 'X: de configuratie bevat een fout.');
  assert.equal(explainError('X', 'something odd'), 'X: gegevens konden niet geladen worden.');
  w.close();
});

test('unsafe links are dropped and unknown widgets explain themselves', async () => {
  const w = await page();
  const evil = w.document.querySelector('[data-service="svc-2"]');
  assert.equal(evil.querySelector('a'), null);
  assert.equal(evil.querySelector('.api-error summary').textContent, 'Evil: de configuratie bevat een fout.');
  assert.match(evil.querySelector('.api-error div').textContent, /unknown widget type "missing"/);
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

test('labels with vars, a shape next to warn/error colours, and "+N more" rows', async () => {
  const w = await page();
  const card = w.document.querySelector('[data-service="svc-3"]');
  const widget = [...card.querySelectorAll('.widget')].at(-1);
  const blocks = [...widget.querySelectorAll('.block')];
  assert.equal(blocks[0].querySelector('.l').textContent, 'Trunk gebruikt');
  assert.equal(blocks[0].querySelector('.sym'), null, 'no symbol without a status');
  assert.equal(blocks[1].querySelector('.sym').textContent, '▲');
  assert.equal(blocks[1].querySelector('.sym').getAttribute('aria-hidden'), 'true');
  assert.equal(blocks[1].querySelector('.sr-only').textContent, 'Vraagt aandacht: ');
  assert.equal(blocks[2].querySelector('.sym').textContent, '✕');
  const rows = [...widget.querySelectorAll('.row')];
  assert.equal(rows[0].className, 'row warn');
  assert.equal(rows[0].querySelector('.rv').textContent, 'Import geblokkeerd');
  assert.match(rows[0].querySelector('.rl').textContent, /^▲Vraagt aandacht: Blocked movie$/);
  assert.equal(rows[1].className, 'row more');
  assert.equal(rows[1].querySelector('.rl').textContent, '+3 meer');
  w.close();
});

test('a row opens to show its full text', async () => {
  const w = await page();
  const row = w.document.querySelector('[data-service="svc-3"] .row');
  row.click();
  assert.ok(row.classList.contains('expanded'));
  assert.equal(row.getAttribute('aria-expanded'), 'true');
  row.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter' }));
  assert.equal(row.classList.contains('expanded'), false);
  w.close();
});

test('background image with filters on its own layer, and card blur', async () => {
  const layout = structuredClone(LAYOUT);
  layout.settings.background = { image: 'https://example.com/wall paper.jpg', blur: 8, saturate: 50, brightness: 75, opacity: 40 };
  layout.settings.cardBlur = 12;
  const w = await page({ ...RESULTS, '/api/layout': layout });
  const bg = w.document.getElementById('bg');
  assert.equal(bg.hidden, false);
  assert.equal(bg.style.backgroundImage, 'url("https://example.com/wall%20paper.jpg")');
  assert.equal(bg.style.filter, 'blur(8px) saturate(50%) brightness(75%)');
  assert.equal(bg.style.opacity, '0.4');
  assert.ok(w.document.body.classList.contains('card-blur'));
  assert.equal(w.document.body.style.getPropertyValue('--hd-card-blur'), '12px');

  const plain = await page();
  assert.equal(plain.document.getElementById('bg').hidden, true);
  assert.ok(!plain.document.body.classList.contains('card-blur'));
});

test('tabs: a tab bar, groups without a tab on every tab, the hash picks the tab', async () => {
  const layout = structuredClone(LAYOUT);
  layout.tabs = ['First', 'Second Tab'];
  layout.groups[0].layout.tab = 'Second Tab';       // Network
  layout.groups[2].layout.tab = 'First';            // Hidden title
  layout.bookmarks[0].layout = { tab: 'First' };    // Dev
  const shown = (doc) => [...doc.querySelectorAll('#groups .group, #bookmarks .group')].filter((s) => !s.hidden).map((s) => s.dataset.group ?? s.querySelector('h2').textContent);

  const w = await page({ ...RESULTS, '/api/layout': layout });
  const doc = w.document;
  assert.equal(doc.getElementById('tabs').hidden, false);
  assert.equal(doc.getElementById('tabs').getAttribute('aria-label'), 'Tabbladen');
  assert.deepEqual([...doc.querySelectorAll('#tabs a')].map((a) => [a.textContent, a.getAttribute('href')]), [['First', '#first'], ['Second Tab', '#second%20tab']]);
  assert.equal(doc.querySelector('#tabs a[aria-current="page"]').textContent, 'First');
  assert.deepEqual(shown(doc), ['Hidden title', 'Dev']);

  w.location.hash = '#second%20tab';
  w.dispatchEvent(new w.HashChangeEvent('hashchange'));
  assert.equal(doc.querySelector('#tabs a[aria-current="page"]').textContent, 'Second Tab');
  assert.deepEqual(shown(doc), ['Network']);

  const none = await page();
  assert.equal(none.document.getElementById('tabs').hidden, true);
  assert.ok([...none.document.querySelectorAll('#groups .group')].every((s) => !s.hidden));
});
