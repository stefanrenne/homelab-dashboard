// Recreates the README screenshots from config.example (see docs/development.md).
// Playwright is deliberately not in package.json: only needed when the screenshots are refreshed.
//   npm install --no-save playwright && npx playwright install chromium
//   node scripts/screenshots.mjs
import { chromium } from 'playwright';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { createApp } from '../src/app.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const out = root + 'docs/images/';
const quiet = { info() {}, warn() {}, error() {} };

const app = await createApp({ configDir: root + 'config.example', log: quiet, defaultPlugins: [], dockerSocket: null });
const server = http.createServer(app.handler).listen(0, '127.0.0.1');
await new Promise((r) => server.once('listening', r));
const url = `http://127.0.0.1:${server.address().port}/`;

// Stable widget data, so the screenshots do not depend on the network or this machine.
const byType = {};
for (const g of app.layout.groups) for (const s of g.services) for (const w of [...s.statuses, ...s.widgets]) byType[w.instanceId] = w.type;
for (const w of app.layout.header) byType[w.instanceId] = w.type;
const fake = {
  'http-status': { status: 'up', latency: 18, blocks: [{ label: 'status', value: 200, status: 'ok' }] },
  ping: { status: 'up', latency: 2.4, blocks: [] },
  resources: {
    blocks: [],
    meters: [
      { kind: 'cpu', text: '8%', caption: 'cpu', percent: 8 },
      { kind: 'memory', text: '9.4 GB', caption: 'free', percent: 41 },
      { kind: 'disk', text: '1.2 TB', caption: 'free', percent: 63 },
    ],
  },
  'custom-api': { blocks: [{ label: 'Version', value: '0.1.0' }, { label: 'Healthy', value: 'true' }] },
};

const browser = await chromium.launch();
for (const scheme of ['dark', 'light']) {
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 760 }, deviceScaleFactor: 2, colorScheme: scheme, locale: 'en-US', timezoneId: 'Europe/Amsterdam' });
  await ctx.addInitScript(() => {
    const fixed = new Date('2026-10-23T09:41:00+02:00').getTime();
    const RealDate = Date;
    globalThis.Date = class extends RealDate { constructor(...a) { super(...(a.length ? a : [fixed])); } static now() { return fixed; } };
  });
  const page = await ctx.newPage();
  await page.route('**/api/widgets/*', (route) => {
    const id = route.request().url().split('/').pop();
    route.fulfill({ json: { ok: true, data: fake[byType[id]] ?? {}, fetchedAt: 0 } });
  });
  await page.route('https://cdn.jsdelivr.net/**', (route) => route.continue());
  await page.goto(url);
  await page.waitForSelector('.card');
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1500); // icons and widget data
  await page.screenshot({ path: `${out}screenshot-${scheme}.png`, fullPage: true });
  await ctx.close();
}
await browser.close();
app.close();
server.close();
console.log('written to', out);
