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

async function page(results = RESULTS, calls = []) {
  const dom = new JSDOM(HTML, {
    runScripts: 'dangerously',
    url: 'http://localhost/',
    beforeParse(window) {
      // the page asks relative URLs (api/layout); resolve them as the browser does
      window.fetch = async (url) => {
        calls.push(String(url));
        return { json: async () => structuredClone(results[new URL(url, 'http://localhost/').pathname] ?? { ok: false, error: 'nope' }) };
      };
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
  assert.ok(doc.querySelector('[data-group="Hidden title"]').classList.contains('no-header'), 'no room for a hidden title, as in homepage');
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

test('a proxmoxNode label opens the VM\'s CPU and memory too, with its own widget\'s labels', async () => {
  const layout = structuredClone(LAYOUT);
  layout.groups[0].services[2].statuses.push({ kind: 'proxmox', instanceId: 's-9', type: 'proxmoxvm', options: {}, known: true, server: true, refreshMs: 15000 });
  layout.widgetTypes.proxmoxvm = { name: 'Proxmox VM', client: null, i18n: { status: 'Status', cpu: 'CPU', memory: 'Geheugen', running: 'actief' } };
  const w = await page({ ...RESULTS, '/api/layout': layout, '/api/widgets/s-9': { ok: true, data: { status: 'up', statusText: 'running', blocks: [{ key: 'cpu', label: 'cpu', value: 4.5, unit: '%' }, { key: 'mem', label: 'memory', value: 2.1, unit: 'GB' }] } } });
  const radarr = w.document.querySelector('[data-service="svc-3"]');
  const tag = radarr.querySelectorAll('.tag')[1];
  assert.equal(tag.textContent, 'actief');
  assert.equal(tag.title, 'VM-statistieken tonen');
  tag.click();
  assert.deepEqual([...radarr.querySelectorAll('.container-stats .block .l')].map((n) => n.textContent), ['CPU', 'Geheugen']);
  assert.equal(tag.getAttribute('aria-expanded'), 'true');
  w.close();
});

test('clicking a container label shows the container stats above the widgets, without the state', async () => {
  const w = await page({ ...RESULTS, '/api/widgets/s-2': { ok: true, data: { status: 'up', statusText: 'healthy', blocks: [
    { label: 'status', value: 'running (healthy)', status: 'ok' }, { label: 'cpu', value: 3, unit: '%' }, { key: 'rx', label: 'rx', value: 55.5, unit: 'MB' }] } } });
  const router = w.document.querySelector('[data-service="svc-1"]');
  const tag = router.querySelectorAll('.tag')[1];
  tag.click();
  assert.deepEqual([...router.querySelectorAll('.container-stats .block .v')].map((n) => n.textContent), ['3%', '55,5 MB'], 'no state block: the label shows it');
  const widgets = [...router.querySelectorAll(':scope > .widget')];
  assert.ok(widgets.length > 1 && widgets[0].classList.contains('container-stats'), 'above the service widget, as in homepage');
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

test('nested groups render inside their parent with an h3, and search finds their services', async () => {
  const layout = structuredClone(LAYOUT);
  layout.groups[0].groups = [{ name: 'Wireless', layout: { columns: 2 }, groups: [], services: [
    { id: 'svc-9', name: 'Access point', href: 'http://ap.lan', target: '_blank', icon: null, description: null, discovered: null, statuses: [], widgets: [] },
  ] }];
  const w = await page({ ...RESULTS, '/api/layout': layout });
  const doc = w.document;
  const network = doc.querySelector('[data-group="Network"]');
  const nested = network.querySelector('.subgroups [data-group="Wireless"]');
  assert.ok(nested.classList.contains('nested'));
  assert.equal(nested.querySelector('h3').textContent, 'Wireless');
  assert.equal(nested.querySelector('[data-service="svc-9"] a').getAttribute('href'), 'http://ap.lan');
  assert.equal(nested.dataset.tab, undefined, 'tabs are decided on the top-level group');

  const matches = w.HD.filterServices('access');
  assert.equal(matches.length, 1);
  assert.equal(network.hidden, false);
  assert.equal(nested.hidden, false);
});

test('bookmarks as icons only (per group or bookmarksStyle) and category icons', async () => {
  const layout = structuredClone(LAYOUT);
  layout.groups[0].layout.icon = 'https://example.com/net.png';
  layout.bookmarks[0].layout = { iconsOnly: true, icon: '/icons/dev.svg' };
  layout.bookmarks[0].bookmarks[0].description = 'Code';
  const w = await page({ ...RESULTS, '/api/layout': layout });
  const doc = w.document;
  assert.equal(doc.querySelector('[data-group="Network"] h2 .group-icon').getAttribute('src'), 'https://example.com/net.png');
  const dev = doc.querySelector('#bookmarks .group');
  assert.ok(dev.classList.contains('icons-only'));
  assert.equal(dev.querySelector('h2 .group-icon').getAttribute('src'), 'icons/dev.svg', 'relative, for settings.base');
  const link = dev.querySelector('.bm');
  assert.ok(link.querySelector('.bn').classList.contains('sr-only'), 'the name stays for screen readers');
  assert.equal(link.title, 'GitHub – Code');

  const global = structuredClone(LAYOUT);
  global.settings.bookmarksStyle = 'icons';
  global.bookmarks[0].layout = {};
  const g = await page({ ...RESULTS, '/api/layout': global });
  assert.ok(g.document.querySelector('#bookmarks .group').classList.contains('icons-only'));
  global.bookmarks[0].layout = { iconsOnly: false };
  const off = await page({ ...RESULTS, '/api/layout': global });
  assert.ok(!off.document.querySelector('#bookmarks .group').classList.contains('icons-only'), 'a group can opt out');
});

test('single-colour icons are masks: their own colour, or iconStyle gradient/theme', async () => {
  const layout = structuredClone(LAYOUT);
  layout.groups[0].services[0].icon = 'https://cdn.example.com/svg/flask.svg#hd-mask=f0d453';
  layout.groups[0].services[2].icon = 'https://cdn.example.com/svg/sonos.svg#hd-mask';
  layout.groups[0].services[1].icon = 'https://cdn.example.com/png/plex.png';
  layout.settings.iconStyle = 'theme';
  const w = await page({ ...RESULTS, '/api/layout': layout });
  const doc = w.document;
  const flask = doc.querySelector('[data-service="svc-1"] .icon .mask-icon');
  assert.equal(flask.style.getPropertyValue('--mask'), 'url("https://cdn.example.com/svg/flask.svg")');
  assert.equal(flask.style.getPropertyValue('--fill'), '#f0d453');
  const sonos = doc.querySelector('[data-service="svc-3"] .icon .mask-icon');
  assert.equal(sonos.style.getPropertyValue('--fill'), '', 'no colour: the iconStyle fill');
  assert.ok(doc.body.classList.contains('icon-style-theme'));
  assert.equal(doc.querySelector('[data-service="svc-2"] .icon img').getAttribute('src'), 'https://cdn.example.com/png/plex.png');
});

test('fullWidth, maxGroupColumns, maxBookmarkGroupColumns, useEqualHeights, disableCollapse, groupsInitiallyCollapsed', async () => {
  const layout = structuredClone(LAYOUT);
  Object.assign(layout.settings, { fullWidth: true, maxGroupColumns: 6, maxBookmarkGroupColumns: 8, useEqualHeights: true, groupsInitiallyCollapsed: true });
  layout.groups[2].layout = { header: true, useEqualHeights: false, initiallyCollapsed: false };
  const w = await page({ ...RESULTS, '/api/layout': layout });
  const doc = w.document;
  assert.ok(doc.body.classList.contains('full-width'));
  assert.equal(doc.body.style.getPropertyValue('--max-group-cols'), '6');
  assert.equal(doc.body.style.getPropertyValue('--max-bookmark-cols'), '8');
  const network = doc.querySelector('[data-group="Network"]');
  const hidden = doc.querySelector('[data-group="Hidden title"]');
  assert.ok(network.classList.contains('equal-heights'), 'the global setting');
  assert.ok(!hidden.classList.contains('equal-heights'), 'a group can turn it off');
  assert.ok(network.classList.contains('collapsed'), 'groupsInitiallyCollapsed');
  assert.ok(!hidden.classList.contains('collapsed'), 'initiallyCollapsed on the group wins');

  layout.settings.disableCollapse = true;
  const fixed = await page({ ...RESULTS, '/api/layout': layout });
  const net = fixed.document.querySelector('[data-group="Network"]');
  assert.equal(net.querySelector('.group-toggle'), null);
  assert.equal(net.querySelector('h2.group-title').textContent, 'Network');
  assert.ok(!net.classList.contains('collapsed'));
});

test('a bookmark group listed between service groups in the layout block is shown there', async () => {
  const layout = structuredClone(LAYOUT);
  layout.groups[0].order = 0;   // Network
  layout.groups[2].order = 2;   // Hidden title
  layout.bookmarks[0].order = 1; // Dev
  layout.bookmarks[0].layout = {};
  const w = await page({ ...RESULTS, '/api/layout': layout });
  const doc = w.document;
  const names = [...doc.querySelectorAll('#groups > .group')].map((s) => s.dataset.group ?? s.querySelector('h2').textContent);
  assert.deepEqual(names, ['Network', 'Dev', 'Hidden title']);
  assert.ok(doc.querySelector('#groups .bookmark-group .bm'), 'the bookmark group keeps its look');
  assert.equal(doc.querySelectorAll('#bookmarks .group').length, 0);
});

test('headerStyle underlined/boxedWidgets, cardStyle hairline, blockStyle refined, font plex/plexData', async () => {
  const layout = structuredClone(LAYOUT);
  Object.assign(layout.settings, { headerStyle: 'underlined', cardStyle: 'hairline', blockStyle: 'refined', font: 'plexData' });
  const w = await page({ ...RESULTS, '/api/layout': layout });
  const doc = w.document;
  assert.equal(doc.getElementById('header-widgets').className, 'info underlined');
  for (const cls of ['card-hairline', 'block-refined', 'font-plex-data']) assert.ok(doc.body.classList.contains(cls), cls);
  assert.ok(!doc.body.classList.contains('font-plex'));
  assert.match(doc.getElementById('font-plex').getAttribute('href'), /^https:\/\/fonts\.googleapis\.com\/css2\?family=IBM\+Plex\+Mono/);

  layout.settings.headerStyle = 'boxedWidgets';
  layout.settings.font = null;
  const b = await page({ ...RESULTS, '/api/layout': layout });
  assert.equal(b.document.getElementById('header-widgets').className, 'info boxed-widgets');
  assert.equal(b.document.getElementById('font-plex'), null, 'the font is only loaded when asked for');
});

test('statusStyle dot shows a dot (with an accessible name), basic shows Online/Offline for checks', async () => {
  const layout = structuredClone(LAYOUT);
  layout.groups[0].services[0].statusStyle = 'dot';    // Router: siteMonitor up + container
  layout.groups[0].services[2].statusStyle = 'basic';  // Radarr: ping down
  const w = await page({ ...RESULTS, '/api/layout': layout });
  const doc = w.document;
  const tags = [...doc.querySelectorAll('[data-service="svc-1"] .tag')];
  assert.ok(tags.every((t) => t.classList.contains('dot') && t.querySelector('.status-dot')));
  assert.equal(tags[0].textContent, '');
  assert.equal(tags[0].getAttribute('aria-label'), 'Online: 78 ms');
  const radarr = doc.querySelector('[data-service="svc-3"] .tag');
  assert.equal(radarr.textContent, 'Offline');

  layout.groups[0].services[0].statusStyle = 'basic';
  const basic = await page({ ...RESULTS, '/api/layout': layout });
  const [site, container] = basic.document.querySelectorAll('[data-service="svc-1"] .tag');
  assert.equal(site.textContent, 'Online', 'a check shows up/down');
  assert.equal(container.textContent, 'healthy', 'a container keeps its state');
});

test('highlighted blocks get a level class (block or value only), coloured from the levels', async () => {
  const layout = structuredClone(LAYOUT);
  layout.settings.highlightLevels = { good: 'bg-emerald-500/40 text-emerald-950 dark:text-emerald-400', warn: 'bg-nope-500 text-white', danger: '' };
  const results = structuredClone(RESULTS);
  results['/api/widgets/w-1'].data.blocks[0].highlight = { level: 'good', valueOnly: false };
  results['/api/widgets/w-1'].data.blocks[1].highlight = { level: 'warn', valueOnly: true };
  results['/api/layout'] = layout;
  const w = await page(results);
  const doc = w.document;
  const [cpu, mem] = doc.querySelectorAll('[data-service="svc-1"] .widget .block');
  assert.ok(cpu.classList.contains('hl-good'));
  assert.ok(!mem.classList.contains('hl-warn') && mem.querySelector('.v').classList.contains('hl-warn'));
  const css = doc.getElementById('hl-levels').textContent;
  assert.match(css, /:root\[data-theme="dark"\] \.hl-good\{background:color-mix\(in srgb, #10b981 40%, transparent\);color:#34d399\}/);
  assert.match(css, /:root\[data-theme="light"\] \.hl-warn\{color:#ffffff\}/, 'an unknown colour is dropped, the rest kept');
  assert.ok(!css.includes('hl-danger'));
});

test('quicklaunch: typing opens it; services, bookmarks, a URL and the web search; keys and descriptions', async () => {
  const layout = structuredClone(LAYOUT);
  layout.header = [{ instanceId: 'h-1', type: 'search', options: { provider: 'google' }, known: true, server: false }];
  layout.widgetTypes.search = { name: 'Search', client: null, i18n: {} };
  layout.settings.quicklaunch = {};
  const w = await page({ ...RESULTS, '/api/layout': layout });
  const doc = w.document;
  const opened = [];
  w.open = (url, target) => opened.push([url, target]);
  const press = (key, target = doc.body) => target.dispatchEvent(new w.KeyboardEvent('keydown', { key, bubbles: true }));
  const items = () => [...doc.querySelectorAll('#ql-list li')].map((li) => li.querySelector('.ql-name')?.textContent ?? li.textContent);

  press('r');
  const box = doc.getElementById('quicklaunch');
  const input = doc.getElementById('ql-input');
  assert.equal(box.hidden, false);
  assert.equal(input.value, 'r');
  assert.equal(box.getAttribute('aria-label'), 'Snel starten');
  assert.deepEqual(items(), ['Router', 'Script', 'Zoek “r” met Google'], 'Evil (unsafe link) and Radarr (no link) are left out');

  input.value = 'git';
  input.dispatchEvent(new w.Event('input'));
  assert.deepEqual(items(), ['GitHub', 'Zoek “git” met Google']);
  press('Enter', input);
  assert.deepEqual(opened.pop(), ['https://github.com', '_blank']);
  assert.equal(box.hidden, true);

  press('e');
  input.value = 'example.lan/admin';
  input.dispatchEvent(new w.Event('input'));
  assert.deepEqual(items(), ['https://example.lan/admin openen', 'Zoek “example.lan/admin” met Google']);
  press('ArrowDown', input);
  press('Enter', input);
  assert.match(opened.pop()[0], /^https:\/\/www\.google\.com\/search\?q=example\.lan%2Fadmin$/);

  press('g');
  input.value = 'gateway';
  input.dispatchEvent(new w.Event('input'));
  assert.deepEqual(items(), ['Zoek “gateway” met Google'], 'descriptions are not searched by default');
  press('Escape', input);
  assert.equal(box.hidden, true);

  const typing = doc.createElement('input');
  doc.body.append(typing);
  typing.focus();
  press('x', typing);
  assert.equal(box.hidden, true, 'typing in a field does not open it');
});

test('quicklaunch: searchDescriptions, its own provider, hideInternetSearch, hideVisitURL and the mobile button', async () => {
  const layout = structuredClone(LAYOUT);
  layout.settings.quicklaunch = { searchDescriptions: true, provider: 'custom', url: 'https://search.lan/?q=', hideVisitURL: true, mobileButtonPosition: 'bottom-right' };
  const w = await page({ ...RESULTS, '/api/layout': layout });
  const doc = w.document;
  const button = doc.getElementById('ql-button');
  assert.equal(button.hidden, false);
  assert.ok(button.classList.contains('bottom-right'));
  button.click();
  const input = doc.getElementById('ql-input');
  input.value = 'gateway.lan';
  input.dispatchEvent(new w.Event('input'));
  const names = [...doc.querySelectorAll('#ql-list .ql-name')].map((n) => n.textContent);
  assert.deepEqual(names, ['Zoek “gateway.lan” met Web']);
  input.value = 'gateway';
  input.dispatchEvent(new w.Event('input'));
  assert.deepEqual([...doc.querySelectorAll('#ql-list .ql-name')].map((n) => n.textContent), ['Router', 'Zoek “gateway” met Web'], 'found by its description');

  layout.settings.quicklaunch = { hideInternetSearch: true };
  const quiet = await page({ ...RESULTS, '/api/layout': layout });
  quiet.document.body.dispatchEvent(new quiet.KeyboardEvent('keydown', { key: 'z', bubbles: true }));
  assert.deepEqual([...quiet.document.querySelectorAll('#ql-list li')].map((li) => li.textContent), ['Geen services gevonden']);
  assert.equal(quiet.document.getElementById('ql-button').hidden, true);
});

test('quicklaunch opens a service through its card, so a hidden-iframe webhook runs through the server', async () => {
  const w = await page({ ...RESULTS, '/api/run/svc-4': { ok: true, status: 200 } });
  const doc = w.document;
  const opened = [];
  w.open = (url) => opened.push(url);
  doc.body.dispatchEvent(new w.KeyboardEvent('keydown', { key: 's', bubbles: true }));
  const input = doc.getElementById('ql-input');
  input.value = 'script';
  input.dispatchEvent(new w.Event('input'));
  input.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(doc.getElementById('toast-text').textContent, 'Script: klaar');
  assert.deepEqual(opened, [], 'the webhook URL is not opened in a tab');
});

test('showStats opens the container stats from the start; the label still folds them', async () => {
  const layout = structuredClone(LAYOUT);
  layout.groups[0].services[0].showStats = true;
  const w = await page({ ...RESULTS, '/api/layout': layout });
  const doc = w.document;
  const router = doc.querySelector('[data-service="svc-1"]');
  const tag = router.querySelectorAll('.tag')[1];
  assert.ok(router.querySelector('.container-stats'), 'open without a click');
  assert.equal(tag.getAttribute('aria-expanded'), 'true');
  tag.click();
  assert.equal(router.querySelector('.container-stats'), null);
  assert.equal(tag.getAttribute('aria-expanded'), 'false');
});

test('the footer: core and plugin versions linked to their release or commit, and a newer release', async () => {
  const layout = structuredClone(LAYOUT);
  layout.showVersion = true;
  layout.update = { version: '0.9.0', url: 'https://github.com/example/releases/tag/v0.9.0' };
  layout.versionUrl = 'https://github.com/example/releases/tag/v0.1.0';
  layout.plugins = [
    { name: 'widgets', version: 'v0.4.0', url: 'https://github.com/example/widgets/releases/tag/v0.4.0' },
    { name: 'hd-widget-y', version: '2.0.1', url: 'https://www.npmjs.com/package/hd-widget-y/v/2.0.1' },
    { name: 'my-widgets', version: null, url: null },
    { name: 'odd', version: 'abc1234', url: 'javascript:alert(1)' },
  ];
  const w = await page({ ...RESULTS, '/api/layout': layout });
  const box = w.document.getElementById('version-box');
  assert.equal(box.hidden, false);
  assert.equal(box.textContent, 'core v0.1.0 · v0.9.0 beschikbaar | widgets v0.4.0 | hd-widget-y v2.0.1 | my-widgets | odd abc1234');
  assert.deepEqual([...box.querySelectorAll('a')].map((a) => [a.textContent, a.getAttribute('href')]), [
    ['core v0.1.0', 'https://github.com/example/releases/tag/v0.1.0'],
    ['v0.9.0 beschikbaar', 'https://github.com/example/releases/tag/v0.9.0'],
    ['widgets v0.4.0', 'https://github.com/example/widgets/releases/tag/v0.4.0'],
    ['hd-widget-y v2.0.1', 'https://www.npmjs.com/package/hd-widget-y/v/2.0.1'],
  ], 'only safe links; a plugin without one is text');
  const plain = await page();
  assert.equal(plain.document.getElementById('version-box').hidden, true);
});

test('17 languages: Hebrew turns the page right-to-left, the others left-to-right', async () => {
  const keys = Object.keys((await page()).HD.I18N.en).sort();
  const w = await page();
  for (const lang of ['ca', 'he', 'hr', 'hu', 'it', 'nb-NO', 'pt', 'ru', 'sv', 'vi', 'zh-Hans', 'zh-Hant']) {
    assert.deepEqual(Object.keys(w.HD.I18N[lang] ?? {}).sort(), keys, lang);
  }
  const he = structuredClone(LAYOUT);
  he.settings.language = 'he';
  const r = await page({ ...RESULTS, '/api/layout': he });
  assert.equal(r.document.documentElement.dir, 'rtl');
  assert.equal(r.document.documentElement.lang, 'he');
  assert.equal(r.document.getElementById('refresh-btn').getAttribute('aria-label'), 'רענון');
  assert.equal(w.document.documentElement.dir, 'ltr');
});

test('quicklaunch shows search suggestions with showSearchSuggestions', async () => {
  const layout = structuredClone(LAYOUT);
  layout.settings.quicklaunch = { provider: 'duckduckgo', showSearchSuggestions: true };
  const w = await page({ ...RESULTS, '/api/layout': layout, '/api/suggest': { suggestions: ['zebra', 'zebra crossing'] } });
  const doc = w.document;
  doc.body.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'z', bubbles: true }));
  await new Promise((r) => setTimeout(r, 400));
  const names = [...doc.querySelectorAll('#ql-list .ql-name')].map((n) => n.textContent);
  assert.deepEqual(names, ['Zoek “z” met DuckDuckGo', 'Zoek “zebra” met DuckDuckGo', 'Zoek “zebra crossing” met DuckDuckGo']);
});


test('a widget\'s hd-widget-params makes the page ask again with those params', async () => {
  const calls = [];
  const w = await page(RESULTS, calls);
  const box = w.document.querySelector('[data-service="svc-1"] .widget');
  box.dispatchEvent(new w.CustomEvent('hd-widget-params', { detail: { latitude: '52.37', longitude: '4.89' }, bubbles: true }));
  await new Promise((r) => setTimeout(r, 10));
  assert.ok(calls.includes('api/widgets/w-1?latitude=52.37&longitude=4.89'), calls.join('\n'));
});

test('hd-widget-action: one POST at a time, then a dialog with how it went, the exit code and the output', async () => {
  const calls = [];
  const results = { ...RESULTS, '/api/widgets/w-1/action': { ok: true, data: { status: 'error', output: 'line 1\n<b>line 2</b>', exitCode: 3 } } };
  const w = await page(results, calls);
  const box = w.document.querySelector('[data-service="svc-1"] .widget');
  box.dispatchEvent(new w.CustomEvent('hd-widget-action', { bubbles: true, composed: true, detail: { title: 'Gen Swag' } }));
  box.dispatchEvent(new w.CustomEvent('hd-widget-action', { bubbles: true, composed: true, detail: { title: 'Gen Swag' } }));
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(calls.filter((c) => c.endsWith('/action')).length, 1, 'a second press while it runs is ignored');
  const dialog = w.document.querySelector('dialog.action-result');
  assert.ok(dialog);
  assert.equal(dialog.querySelector('h2').textContent, 'Gen Swag');
  assert.equal(dialog.querySelector('.status').textContent, 'Gen Swag mislukt: Exitcode 3');
  assert.ok(dialog.querySelector('.status').classList.contains('error'));
  assert.equal(dialog.querySelector('pre').textContent, 'line 1\n<b>line 2</b>', 'output as text, never HTML');
  assert.equal(dialog.querySelector('pre b'), null);
  assert.equal(dialog.querySelector('.close').getAttribute('aria-label'), 'Sluiten', 'an × in the corner, with a name');
  dialog.querySelector('.close').click();
  assert.equal(w.document.querySelector('dialog.action-result'), null, 'Close removes it');

  results['/api/widgets/w-1/action'] = { ok: true, data: { status: 'ok', exitCode: 0 } };
  box.dispatchEvent(new w.CustomEvent('hd-widget-action', { bubbles: true, composed: true }));
  await new Promise((r) => setTimeout(r, 20));
  const ok = w.document.querySelector('dialog.action-result');
  assert.equal(ok.querySelector('.status').textContent, 'Router: klaar · Exitcode 0', 'no title: the service name');
  assert.equal(ok.querySelector('.empty').textContent, 'Geen uitvoer');
  results['/api/widgets/w-1/action'] = { ok: false, busy: true, error: 'already running' };
  box.dispatchEvent(new w.CustomEvent('hd-widget-action', { bubbles: true, composed: true }));
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(w.document.querySelectorAll('dialog.action-result').length, 1, 'one dialog at a time');
  assert.equal(w.document.querySelector('dialog.action-result .status').textContent, 'Router mislukt: het draait nog');
  w.close();
});

test('the action dialog copies the output to the clipboard, and has no copy button without output', async () => {
  const results = { ...RESULTS, '/api/widgets/w-1/action': { ok: true, data: { status: 'ok', output: 'line 1\nline 2', exitCode: 0 } } };
  const w = await page(results);
  const copied = [];
  Object.defineProperty(w.navigator, 'clipboard', { value: { writeText: async (t) => { copied.push(t); } }, configurable: true });
  const box = w.document.querySelector('[data-service="svc-1"] .widget');
  box.dispatchEvent(new w.CustomEvent('hd-widget-action', { bubbles: true, composed: true }));
  await new Promise((r) => setTimeout(r, 20));
  const copy = w.document.querySelector('dialog.action-result .output .copy');
  assert.equal(copy.getAttribute('aria-label'), 'Uitvoer kopiëren', 'an icon in the output block, with a name');
  copy.click();
  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(copied, ['line 1\nline 2']);
  assert.equal(copy.getAttribute('aria-label'), 'Gekopieerd');
  assert.ok(copy.classList.contains('done'), 'a check while it says so');
  w.document.querySelector('dialog.action-result .close').click();

  results['/api/widgets/w-1/action'] = { ok: true, data: { status: 'ok', exitCode: 0 } };
  box.dispatchEvent(new w.CustomEvent('hd-widget-action', { bubbles: true, composed: true }));
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(w.document.querySelector('dialog.action-result .copy'), null, 'nothing to copy');
  w.close();
});

test('hd-widget-action with showResult failure: no toast or dialog on success, the dialog on failure', async () => {
  const calls = [];
  const results = { ...RESULTS, '/api/widgets/w-1/action': { ok: true, data: { status: 'ok', output: 'fine', exitCode: 0 } } };
  const w = await page(results, calls);
  const box = w.document.querySelector('[data-service="svc-1"] .widget');
  const press = () => box.dispatchEvent(new w.CustomEvent('hd-widget-action', { bubbles: true, composed: true, detail: { title: 'Gen Swag', showResult: 'failure' } }));
  press();
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(calls.filter((c) => c.endsWith('/action')).length, 1);
  assert.equal(w.document.querySelector('dialog.action-result'), null, 'success: the widget shows it itself');
  assert.equal(w.document.getElementById('toast').classList.contains('show'), false, 'no running toast either');
  results['/api/widgets/w-1/action'] = { ok: true, data: { status: 'error', output: 'broke', exitCode: 2 } };
  press();
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(w.document.querySelector('dialog.action-result .status').textContent, 'Gen Swag mislukt: Exitcode 2');
  w.close();
});
