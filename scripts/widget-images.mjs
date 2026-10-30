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
 * `demo`, url options `<mockUrl>/<id>` (where the mock serves the widget's fixture).
 * Returns { kind: 'service', service } or { kind: 'header', entry }, plus `providers` from a
 * settings.yaml in the example; null without a usable example.
 */
export function exampleEntry(dir, mockUrl) {
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
    return out;
  };
  for (const [, block] of readme.slice(at).matchAll(/```ya?ml\n([\s\S]*?)```/g)) {
    const files = splitFiles(block.replace(/\{\{(HD|HOMEPAGE)_(VAR|FILE)_\w+\}\}/g, 'demo'));
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

// Widgets that show another page (nothing of the mock worth a picture), and examples that need
// this machine's details changed to look like a homelab.
const SKIP = new Set(['iframe', 'mjpeg']);
const OPTIONS = { resources: { cpu: true, memory: true, disk: ['/'], uptime: true } };

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

  const widgetsDir = path.join(collectionDir, 'widgets');
  const ids = fs.readdirSync(widgetsDir).filter((d) => fs.existsSync(path.join(widgetsDir, d, 'widget.yaml'))).sort();
  const services = [];
  const header = [];
  const providers = {};
  for (const id of ids) {
    if (SKIP.has(id)) continue;
    const example = exampleEntry(path.join(widgetsDir, id), mock.url);
    if (!example) continue;
    if (OPTIONS[id] && example.kind === 'header') example.entry = { [Object.keys(example.entry)[0]]: OPTIONS[id] };
    if (OPTIONS[id] && example.kind === 'service') example.service.widget = { type: example.service.widget.type, ...OPTIONS[id] };
    Object.assign(providers, example.providers);
    if (example.kind === 'header') header.push({ id, entry: example.entry });
    else services.push({ id, service: example.service });
  }

  const configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hd-widget-images-'));
  const write = (file, data) => fs.writeFileSync(path.join(configDir, file), YAML.stringify(data));
  write('settings.yaml', { title: 'Widgets', theme: 'dark', color: 'slate', language: 'en', hideVersion: true, disableUpdateCheck: true, layout: { Widgets: { header: false } }, providers });
  // names are unique within a group: a second "Proxmox" gets its widget id
  const names = new Set();
  const entries = services.map(({ id, service }) => {
    const name = names.has(service.name) ? `${service.name} (${id})` : service.name;
    names.add(name);
    return { [name]: { href: service.href, icon: service.icon, widget: service.widget } };
  });
  write('services.yaml', [{ Widgets: entries }]);
  write('widgets.yaml', header.map((h) => h.entry));

  const quiet = { info() {}, warn() {}, error() {} };
  const app = await createApp({ configDir, log: quiet, defaultPlugins: [{ path: collectionDir, label: 'widgets' }], dockerSocket: null, releasesUrl: null });
  const server = http.createServer(app.handler).listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));

  // which widgets got data: the others are left without an image
  const ok = new Set();
  const instances = [
    ...app.layout.groups.flatMap((g) => g.services.flatMap((s) => s.widgets)),
    ...app.layout.header,
  ];
  for (const w of instances) {
    const result = await app.runtime.get(w.instanceId, {});
    if (showsData(result)) ok.add(w.instanceId);
  }

  fs.mkdirSync(out, { recursive: true });
  const written = [];
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 460, height: 900 }, deviceScaleFactor: 2, colorScheme: 'dark', locale: 'en-US', timezoneId: 'Europe/Amsterdam' });
  const page = await ctx.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForSelector('.card');
  await page.evaluate(() => document.fonts.ready);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000); // icons and widget data

  const cards = await page.$$('.card');
  const serviceWidgets = app.layout.groups.flatMap((g) => g.services.map((s) => s.widgets[0]));
  for (const [i, { id }] of services.entries()) {
    if (!cards[i] || !ok.has(serviceWidgets[i]?.instanceId)) continue;
    await cards[i].scrollIntoViewIfNeeded();
    await cards[i].screenshot({ path: path.join(out, `${id}.png`) });
    written.push(id);
  }
  const headerWidgets = await page.$$('#header-widgets > .hw');
  for (const [i, { id }] of header.entries()) {
    const w = app.layout.header[i];
    // widgets without server.js (datetime, greeting, ...) have nothing to fetch
    if (!headerWidgets[i] || (!ok.has(w.instanceId) && fs.existsSync(path.join(widgetsDir, id, 'server.js')))) continue;
    await headerWidgets[i].screenshot({ path: path.join(out, `${id}.png`) });
    written.push(id);
  }

  await browser.close();
  app.close();
  server.close();
  await mock.close();
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
