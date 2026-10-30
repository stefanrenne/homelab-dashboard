// Recreates the README and home page screenshots from scripts/showcase (see
// docs/extend/contributing/development.md): its widgets ask the fake homelab of a widgets
// collection checkout (HD_COLLECTION_DIR, else ../homelab-dashboard-widgets), which answers from
// the collection's fixtures. Status checks and system resources are stubbed, so the screenshots
// do not depend on the network or this machine.
// Playwright is deliberately not in package.json: only needed when the screenshots are refreshed.
//   npm install --no-save playwright && npx playwright install chromium
//   node scripts/screenshots.mjs
import { chromium } from 'playwright';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from '../src/app.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const out = root + 'docs/images/';
const quiet = { info() {}, warn() {}, error() {} };

const collection = path.resolve(process.env.HD_COLLECTION_DIR ?? path.join(root, '../homelab-dashboard-widgets'));
const { startMock } = await import(path.join(collection, 'scripts/mock-homelab.mjs'));
const mock = await startMock();

// the showcase with its widgets pointed at the mock
const configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hd-showcase-'));
for (const file of fs.readdirSync(root + 'scripts/showcase')) {
  const text = fs.readFileSync(path.join(root, 'scripts/showcase', file), 'utf8');
  fs.writeFileSync(path.join(configDir, file), text.replaceAll('http://mock.lan', mock.url));
}

const app = await createApp({ configDir, log: quiet, defaultPlugins: [{ path: collection, label: 'widgets' }], dockerSocket: null, releasesUrl: null });
const server = http.createServer(app.handler).listen(0, '127.0.0.1');
await new Promise((r) => server.once('listening', r));
const url = `http://127.0.0.1:${server.address().port}/`;

// Stable data for what would otherwise ask the network or this machine.
const byType = {};
for (const g of app.layout.groups) for (const s of g.services) for (const w of [...s.statuses, ...s.widgets]) byType[w.instanceId] = w.type;
for (const w of app.layout.header) byType[w.instanceId] = w.type;
let latency = 11;
const fake = {
  'http-status': () => ({ status: 'up', latency: (latency += 7) % 60, blocks: [{ label: 'status', value: 200, status: 'ok' }] }),
  ping: () => ({ status: 'up', latency: 2.4, blocks: [] }),
  resources: () => ({
    blocks: [],
    meters: [
      { kind: 'cpu', text: '8%', caption: 'cpu', percent: 8 },
      { kind: 'memory', text: '9.4 GB', caption: 'free', percent: 41 },
      { kind: 'disk', text: '1.2 TB', caption: 'free', percent: 63 },
    ],
  }),
};

const browser = await chromium.launch();
for (const scheme of ['dark', 'light']) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, colorScheme: scheme, locale: 'en-US', timezoneId: 'Europe/Amsterdam' });
  await ctx.addInitScript(() => {
    const fixed = new Date('2026-10-23T09:41:00+02:00').getTime();
    const RealDate = Date;
    globalThis.Date = class extends RealDate { constructor(...a) { super(...(a.length ? a : [fixed])); } static now() { return fixed; } };
  });
  const page = await ctx.newPage();
  await page.route('**/api/widgets/*', (route) => {
    const id = route.request().url().split('?')[0].split('/').pop();
    const stub = fake[byType[id]];
    if (stub) return route.fulfill({ json: { ok: true, data: stub(), fetchedAt: 0 } });
    return route.continue();
  });
  await page.goto(url);
  await page.waitForSelector('.card');
  await page.evaluate(() => document.fonts.ready);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000); // icons and widget data
  await page.screenshot({ path: `${out}screenshot-${scheme}.png`, fullPage: true });
  await ctx.close();
}
await browser.close();
app.close();
server.close();
await mock.close();
fs.rmSync(configDir, { recursive: true, force: true });
console.log('written to', out);
