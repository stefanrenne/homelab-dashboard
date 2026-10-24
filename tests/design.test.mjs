// Measurable design rules from the Apple HIG audit, checked on the CSS itself:
// contrast of status colours, minimum text and control sizes, rem units, and support
// for Reduce Motion and Increase Contrast.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const HTML = fs.readFileSync(path.resolve('public/index.html'), 'utf8');
const CSS = HTML.slice(HTML.indexOf('<style>'), HTML.indexOf('</style>'));
const CLIENTS = fs.readdirSync('widgets').map((d) => path.join('widgets', d, 'client.js')).filter((f) => fs.existsSync(f));

// ---- WCAG 2 contrast, with alpha compositing like the browser
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const over = (fg, a, bg) => fg.map((c, i) => c * a + bg[i] * (1 - a));
const lum = (rgb) => {
  const [r, g, b] = rgb.map((c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

function block(selector) {
  const start = CSS.indexOf(selector);
  assert.notEqual(start, -1, `${selector} missing`);
  return CSS.slice(start, CSS.indexOf('}', start));
}
const token = (theme, name) => hex(new RegExp(`--${name}: (#[0-9a-f]{6})`).exec(block(`:root[data-theme="${theme}"]`))[1]);
const SLATE = { 50: hex('#f8fafc'), 100: hex('#f1f5f9'), 200: hex('#e2e8f0'), 500: hex('#64748b'), 800: hex('#1e293b'), 900: hex('#0f172a') };

test('status colours reach 4.5:1 on cards, status tabs and blocks in both appearances', () => {
  const dark = (() => {
    const card = over([255, 255, 255], 0.05, SLATE[800]);
    return { card, tab: over(SLATE[900], 0.5, card), block: over(SLATE[900], 0.2, card) };
  })();
  const light = (() => {
    const card = hex(new RegExp('--hd-card: (#[0-9a-f]{6})').exec(block(':root[data-theme="light"]'))[1]);
    return { card, tab: over(SLATE[500], 0.1, card), block: over(SLATE[200], 0.5, card) };
  })();
  for (const [theme, surfaces] of [['dark', dark], ['light', light]]) {
    for (const name of ['hd-ok', 'hd-warn', 'hd-error']) {
      for (const [where, bg] of Object.entries(surfaces)) {
        const r = ratio(token(theme, name), bg);
        assert.ok(r >= 4.5, `${theme} ${name} on ${where}: ${r.toFixed(2)}:1`);
      }
    }
  }
});

test('status labels are at least 11px and not thin', () => {
  const tag = block('  .tag {');
  assert.match(tag, /font-size: \.6875rem/);
  assert.match(tag, /font-weight: 600/);
});

test('no thin or light weights for content text', () => {
  for (const selector of ['.block .v {', '.row .rl {', '.desc {']) {
    const weight = Number(/font-weight: (\d+)/.exec(block(selector))[1]);
    assert.ok(weight >= 400, `${selector} has weight ${weight}`);
  }
});

test('every font size is relative (rem/em), so text follows the browser setting', () => {
  for (const [file, text] of [['index.html', CSS], ...CLIENTS.map((f) => [f, fs.readFileSync(f, 'utf8')])]) {
    for (const m of text.matchAll(/font(?:-size)?:[^;]*?(\d+(?:\.\d+)?)px/g)) assert.fail(`${file}: px font size "${m[0]}"`);
  }
});

test('controls meet the minimum target sizes', () => {
  assert.match(block('  .icon-btn {'), /min-width: 32px; min-height: 32px/);
  assert.match(block('  .swatch {'), /width: 24px; height: 24px/);
  assert.match(block('  button.tag::before {'), /inset: -4px -4px -12px/, 'container labels get a ≥ 28px hit area');
  assert.match(fs.readFileSync('widgets/search/client.js', 'utf8'), /min-width: 28px; height: 28px/);
});

test('Reduce Motion and Increase Contrast have an answer', () => {
  assert.match(CSS, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(CSS, /@media \(prefers-contrast: more\)/);
  assert.match(fs.readFileSync('widgets/resources/client.js', 'utf8'), /prefers-reduced-motion/);
});

test('light cards are separated from the page by more than a shadow', () => {
  assert.match(block(':root[data-theme="light"]'), /--hd-card-border: var\(--t300\)/);
  assert.match(block('  .card {'), /border: 1px solid var\(--hd-card-border, transparent\)/);
});
