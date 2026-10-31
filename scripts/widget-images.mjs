// An example image per widget of the widgets collection, for its page on the documentation site
// (see scripts/pages.sh). Each widget runs with the example from its README.md against the
// collection's fake homelab (scripts/mock-homelab.mjs, its fixtures), in a real dashboard, and
// its card (or header widget) is photographed. A widget whose example gets no data is skipped:
// its page then has no image.
// Playwright is deliberately not in package.json, as for scripts/screenshots.mjs:
//   npm install --no-save playwright && npx playwright install chromium
//   node scripts/widget-images.mjs <out dir> [<collection checkout>]

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import YAML from 'yaml';

/** The YAML files in a README code block that holds several (`# settings.yaml` ... `# services.yaml` ...). */
export function splitFiles(block) {
  const files = {};
  let name = null;
  for (const line of block.split('\n')) {
    const m = /^# ([\w.-]+\.ya?ml)\b/.exec(line);
    if (m) name = m[1].replace(/\.yml$/, '.yaml');
    if (name) files[name] = (files[name] ?? '') + line + '\n';
  }
  return files;
}

/** The first service in a services.yaml list (nested groups too) with a widget of one of `types`. */
function findService(groups, types) {
  for (const group of groups ?? []) {
    for (const items of Object.values(group ?? {})) {
      if (!Array.isArray(items)) continue;
      for (const item of items) {
        const [name, def] = Object.entries(item ?? {})[0] ?? [];
        if (Array.isArray(def)) {
          const nested = findService([{ [name]: def }], types);
          if (nested) return nested;
        } else if (def && typeof def === 'object') {
          const widget = [def.widget, ...(def.widgets ?? [])].find((w) => w && types.includes(w.type));
          if (widget) return { name, icon: def.icon, href: def.href, widget };
        }
      }
    }
  }
  return null;
}

/**
 * The example of one widget folder, ready for a config pointing at `mockUrl`: secrets become
 * `test-key` (as in the collection's tests), url options `<mockUrl>/<id>` (where the mock serves the widget's fixture), and
 * `required` (the collection's scripts/fakes.mjs exampleOptions for this widget: the ids its
 * fixture uses, the fake services' addresses) is laid over the example's options.
 * Returns { kind: 'service', service } or { kind: 'header', entry }, plus `providers` from a
 * settings.yaml in the example; null without a usable example.
 */
export function exampleEntry(dir, mockUrl, required = null) {
  const manifest = YAML.parse(fs.readFileSync(path.join(dir, 'widget.yaml'), 'utf8'));
  const readmeFile = path.join(dir, 'README.md');
  if (!fs.existsSync(readmeFile)) return null;
  const readme = fs.readFileSync(readmeFile, 'utf8');
  const at = readme.search(/^## Example/m);
  if (at === -1) return null;
  const types = [manifest.id, ...(manifest.aliases ?? [])];
  const urlOptions = Object.entries(manifest.options ?? {}).filter(([, d]) => d?.type === 'url').map(([k]) => k);
  const fix = (options) => {
    const out = { ...options };
    for (const k of urlOptions) if (k in out) out[k] = `${mockUrl}/${manifest.id}`;
    // with the collection's options, every widget asks the mock, as in the collection's tests
    if (required) return { url: `${mockUrl}/${manifest.id}`, key: 'test-key', ...out, ...required };
    return out;
  };
  for (const [, block] of readme.slice(at).matchAll(/```ya?ml\n([\s\S]*?)```/g)) {
    const files = splitFiles(block.replace(/\{\{(HD|HOMEPAGE)_(VAR|FILE)_\w+\}\}/g, 'test-key'));
    let parsed;
    try {
      parsed = Object.fromEntries(Object.entries(files).map(([f, text]) => [f, YAML.parse(text)]));
    } catch {
      continue;
    }
    const providers = parsed['settings.yaml']?.providers;
    if (Array.isArray(parsed['widgets.yaml'])) {
      const entry = parsed['widgets.yaml'].find((e) => types.includes(Object.keys(e ?? {})[0]));
      if (entry) {
        const [type, options] = Object.entries(entry)[0];
        return { kind: 'header', entry: { [type]: fix(options ?? {}) }, providers };
      }
    }
    const service = findService(parsed['services.yaml'], types);
    if (service) return { kind: 'service', service: { ...service, widget: fix(service.widget) }, providers };
  }
  return null;
}

// Examples that need other options to look like a homelab: this machine's disks, or an icon from a
// CDN instead of one in the user's own icons folder.
const SKIP = new Set();
const OPTIONS = { resources: { cpu: true, memory: true, disk: ['/'], uptime: true }, logo: { icon: 'proxmox.svg' } };

// Widgets that show another page or a camera get a made-up one from a small local server.
const DEMO = { iframe: (base) => ({ src: `${base}/panel.html` }), mjpeg: (base) => ({ stream: `${base}/camera.svg` }) };
const PANEL = `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;height:100%;background:#181b1f;color:#ccccdc;font:13px system-ui,sans-serif}
h1{font-size:13px;font-weight:500;margin:8px 10px}svg{display:block;width:100%;height:calc(100% - 34px)}</style>
<h1>Power use (W)</h1><svg viewBox="0 0 400 140" preserveAspectRatio="none"><g stroke="#2c3235">${[20, 50, 80, 110].map((y) => `<line x1="0" x2="400" y1="${y}" y2="${y}"/>`).join('')}</g>
<path d="M0 100 L30 96 L60 104 L90 70 L120 76 L150 52 L180 60 L210 88 L240 84 L270 40 L300 46 L330 92 L360 86 L400 90 L400 140 L0 140Z" fill="#73bf6933"/>
<path d="M0 100 L30 96 L60 104 L90 70 L120 76 L150 52 L180 60 L210 88 L240 84 L270 40 L300 46 L330 92 L360 86 L400 90" fill="none" stroke="#73bf69" stroke-width="2"/></svg>`;
const CAMERA = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180"><rect width="320" height="180" fill="#2b2f36"/>
<rect x="40" y="132" width="240" height="14" fill="#555c66"/><rect x="60" y="28" width="12" height="104" fill="#3d434c"/><rect x="248" y="28" width="12" height="104" fill="#3d434c"/>
<rect x="60" y="28" width="200" height="10" fill="#4a515b"/><rect x="138" y="38" width="28" height="22" rx="3" fill="#6b7480"/><path d="M148 60h8l-4 10z" fill="#f2a33a"/>
<path d="M118 132 l14 -40 h56 l14 40z" fill="#3a8ee6"/><path d="M132 92 h56 l-3 8 h-50z" fill="#64a9f0"/>
<text x="10" y="18" fill="#d8dde3" font-family="monospace" font-size="11">CAM 1  2026-10-23 09:41:00</text></svg>`;

/** True when an image drawn by a widget (in a shadow root, the element's own or below) failed to load. */
const brokenImage = (el) => el.evaluate((root) => {
  const images = [];
  const walk = (node) => {
    if (node.shadowRoot) walk(node.shadowRoot);
    for (const e of node.querySelectorAll('*')) {
      if (e.shadowRoot) walk(e.shadowRoot);
      if (e.tagName === 'IMG' && node instanceof ShadowRoot) images.push(e);
    }
  };
  walk(root);
  return images.some((img) => img.complete && img.naturalWidth === 0);
});

/**
 * A widget result worth a picture: data, and not a service that is down or not found (a status
 * of its own, or a `status` block in error). Other blocks in error are the fixture's way to show
 * what needs attention, and stay.
 */
export function showsData(result) {
  if (!result?.ok) return false;
  const data = result.data ?? {};
  if (data.status === 'error' || data.status === 'down') return false;
  return !(data.blocks ?? []).some((b) => (b?.key ?? b?.label) === 'status' && b.status === 'error');
}

/** Writes `<out>/<id>.png` per widget that shows data; returns the ids with an image. */
export async function writeWidgetImages({ out, collectionDir, log = console }) {
  const { chromium } = await import('playwright');
  const http = await import('node:http');
  const { createApp } = await import('../src/app.js');
  const { startMock } = await import(path.join(collectionDir, 'scripts/mock-homelab.mjs'));
  const mock = await startMock();
  // the collection's fake services and per-widget options (scripts/fakes.mjs), when it has them
  const fakesFile = path.join(collectionDir, 'scripts/fakes.mjs');
  const { startFakes, exampleOptions } = fs.existsSync(fakesFile) ? await import(fakesFile) : {};
  const fakes = startFakes ? await startFakes() : null;
  const required = fakes ? exampleOptions({ mockUrl: mock.url, fakes }) : null;
  const demo = http.createServer((req, res) => {
    const page = { '/panel.html': ['text/html; charset=utf-8', PANEL], '/camera.svg': ['image/svg+xml', CAMERA] }[req.url];
    res.writeHead(page ? 200 : 404, { 'content-type': page?.[0] ?? 'text/plain' }).end(page?.[1] ?? '');
  }).listen(0, '127.0.0.1');
  await new Promise((r) => demo.once('listening', r));
  const demoUrl = `http://127.0.0.1:${demo.address().port}`;

  const widgetsDir = path.join(collectionDir, 'widgets');
  const ids = fs.readdirSync(widgetsDir).filter((d) => fs.existsSync(path.join(widgetsDir, d, 'widget.yaml'))).sort();
  const hasServer = (id) => fs.existsSync(path.join(widgetsDir, id, 'server.js'));
  // one service per widget, under the example's name (made unique), or a header widget
  const services = new Map(); // id -> { name, href, icon, widget }
  const names = new Set();
  const header = new Map(); // id -> entry
  const providers = {};
  for (const id of ids) {
    if (SKIP.has(id)) continue;
    const example = exampleEntry(path.join(widgetsDir, id), mock.url, required ? required[id] ?? {} : null);
    if (!example) continue;
    if (OPTIONS[id] && example.kind === 'header') example.entry = { [Object.keys(example.entry)[0]]: OPTIONS[id] };
    if (OPTIONS[id] && example.kind === 'service') example.service.widget = { type: example.service.widget.type, ...OPTIONS[id] };
    if (DEMO[id] && example.kind === 'service') example.service.widget = { ...example.service.widget, ...DEMO[id](demoUrl) };
    Object.assign(providers, example.providers);
    if (example.kind === 'header') header.set(id, example.entry);
    else {
      const name = names.has(example.service.name) ? `${example.service.name} (${id})` : example.service.name;
      names.add(name);
      services.set(id, { name, href: example.service.href, icon: example.service.icon, widget: example.service.widget });
    }
  }

  const configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hd-widget-images-'));
  const write = (file, data) => fs.writeFileSync(path.join(configDir, file), YAML.stringify(data));
  const writeConfig = () => {
    write('settings.yaml', { title: 'Widgets', theme: 'dark', color: 'slate', language: 'en', hideVersion: true, disableUpdateCheck: true, layout: { Widgets: { header: false } }, providers });
    write('services.yaml', [{ Widgets: [...services.values()].map(({ name, ...s }) => ({ [name]: s })) }]);
    write('widgets.yaml', [...header.values()]);
  };
  writeConfig();
  const quiet = { info() {}, warn() {}, error() {} };
  const app = await createApp({ configDir, log: quiet, defaultPlugins: [{ path: collectionDir, label: 'widgets' }], dockerSocket: null, releasesUrl: null });

  // which widgets got data, by widget id: the others are left without an image
  const instanceOf = () => new Map([
    ...app.layout.groups.flatMap((g) => g.services.map((s) => [[...services].find(([, e]) => e.name === s.name)?.[0], s.widgets[0]])),
    ...app.layout.header.map((w) => [[...header].find(([, e]) => Object.keys(e)[0] === w.type)?.[0] ?? w.type, w]),
  ]);
  const working = async () => {
    const ok = new Set();
    for (const [id, w] of instanceOf()) {
      if (!w) continue;
      // header widgets without server.js (datetime, greeting, ...) have nothing to fetch
      if (!hasServer(id) || showsData(await app.runtime.get(w.instanceId, {}))) ok.add(id);
    }
    return ok;
  };
  let ok = await working();
  // an example whose options the fixture does not cover (a login, another API version): again
  // with the options the collection's tests run the widget with
  const retry = [...services.keys(), ...header.keys()].filter((id) => !ok.has(id) && required);
  if (retry.length) {
    for (const id of retry) {
      const options = { url: `${mock.url}/${id}`, key: 'test-key', ...(required[id] ?? {}) };
      if (services.has(id)) services.get(id).widget = { type: services.get(id).widget.type, ...options };
      else header.set(id, { [Object.keys(header.get(id))[0]]: options });
    }
    writeConfig();
    await app.reload();
    ok = await working();
  }

  const server = http.createServer(app.handler).listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  fs.mkdirSync(out, { recursive: true });
  const written = [];
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 460, height: 900 }, deviceScaleFactor: 2, colorScheme: 'dark', locale: 'en-US', timezoneId: 'Europe/Amsterdam' });
  // a fixed day in October 2026, the month of the fixtures' calendar events
  await ctx.addInitScript(() => {
    const fixed = new Date('2026-10-23T09:41:00+02:00').getTime();
    const RealDate = Date;
    globalThis.Date = class extends RealDate { constructor(...a) { super(...(a.length ? a : [fixed])); } static now() { return fixed; } };
  });
  const page = await ctx.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForSelector('.card');
  await page.evaluate(() => document.fonts.ready);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000); // icons and widget data

  for (const id of services.keys()) {
    const card = await page.$(`.card[data-name="${services.get(id).name.replace(/"/g, '\\"')}"]`);
    if (!card || !ok.has(id) || (await brokenImage(card))) continue;
    await card.scrollIntoViewIfNeeded();
    await card.screenshot({ path: path.join(out, `${id}.png`) });
    written.push(id);
  }
  for (const id of header.keys()) {
    const type = Object.keys(header.get(id))[0];
    const el = await page.$(`#header-widgets > .hw-${type}`);
    if (!el || !ok.has(id) || (await brokenImage(el))) continue;
    await el.screenshot({ path: path.join(out, `${id}.png`) });
    written.push(id);
  }

  await browser.close();
  app.close();
  server.close();
  await mock.close();
  fakes?.close();
  demo.close();
  fs.rmSync(configDir, { recursive: true, force: true });
  log.info?.(`widget images: ${written.length} of ${ids.length} widgets`);
  return written;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [out, collection] = process.argv.slice(2);
  const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
  const collectionDir = path.resolve(collection ?? process.env.HD_COLLECTION_DIR ?? path.join(root, '../homelab-dashboard-widgets'));
  const written = await writeWidgetImages({ out: path.resolve(out), collectionDir });
  console.log(`widget images: ${written.length} written to ${out}`);
  process.exit(0);
}
