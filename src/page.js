// The dashboard page (public/index.html) with the parts of settings.yaml that must be in the
// HTML itself, for browsers and crawlers that do not run the page's script: the title, the
// meta description, the favicon and the web app manifest (site.webmanifest). Values are
// HTML-escaped and secrets (values filled in from {{HD_VAR_*}}) are replaced by ***
// (hard rule 1); nothing else is templated.

import { resolveIcon } from './layout.js';

// Shade 800 of each colour palette (PALETTES in index.html; a test keeps them equal): the
// manifest's theme and background colour, as the dark theme shows it.
export const SHADE_800 = {
  slate: '#1e293b', gray: '#1f2937', zinc: '#27272a', neutral: '#262626', stone: '#292524', red: '#991b1b',
  orange: '#9a3412', amber: '#92400e', yellow: '#854d0e', lime: '#3f6212', green: '#166534', emerald: '#065f46',
  teal: '#115e59', cyan: '#155e75', sky: '#075985', blue: '#1e40af', indigo: '#3730a3', violet: '#5b21b6',
  purple: '#6b21a8', fuchsia: '#86198f', pink: '#9d174d', rose: '#9f1239',
};

/** An icon URL without the page's #hd-mask marker, and /icons/… relative (for settings.base). */
const plainIcon = (icon) => resolveIcon(icon)?.split('#')[0].replace(/^\/icons\//, 'icons/') ?? null;

const scrub = (value, secrets) => [...secrets].reduce((s, secret) => s.split(secret).join('***'), String(value));

const escapeHtml = (value) =>
  String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** `html` with the head filled in from normalized `settings`. */
export function renderIndex(html, settings, secrets = new Set()) {
  const clean = (value) => escapeHtml(scrub(value, secrets));
  const head = [];
  // settings.base first, so every relative URL after it resolves under it
  if (settings.base) head.push(`<base href="${clean(settings.base)}">`);
  head.push('<link rel="manifest" href="site.webmanifest">');
  if (settings.disableIndexing === true) head.push('<meta name="robots" content="noindex, nofollow">');
  if (settings.description) head.push(`<meta name="description" content="${clean(settings.description)}">`);
  const favicon = plainIcon(settings.favicon);
  if (favicon) head.push(`<link rel="icon" href="${clean(favicon)}">`);
  return html
    .replace(/<title>[^<]*<\/title>/, `<title>${clean(settings.title)}</title>`)
    .replace('</head>', head.map((line) => `${line}\n`).join('') + '</head>');
}

/** The web app manifest: installable as an app, with the icons and shortcuts of `pwa:`. */
export function renderManifest(settings, secrets = new Set()) {
  const text = (value) => scrub(value, secrets);
  const color = SHADE_800[settings.color] ?? SHADE_800.slate;
  const favicon = plainIcon(settings.favicon);
  const icons = settings.pwa?.icons?.length
    ? settings.pwa.icons.map((i) => ({ ...i, src: text(plainIcon(i.src) ?? i.src) }))
    : favicon ? [{ src: text(favicon), sizes: 'any' }] : [];
  return {
    name: text(settings.title),
    short_name: text(settings.title),
    ...(settings.description ? { description: text(settings.description) } : {}),
    start_url: text(settings.startUrl ?? '/'),
    display: 'standalone',
    theme_color: color,
    background_color: color,
    icons,
    ...(settings.pwa?.shortcuts?.length
      ? { shortcuts: settings.pwa.shortcuts.map((s) => Object.fromEntries(Object.entries(s).map(([k, v]) => [k, text(v)]))) }
      : {}),
  };
}

/** robots.txt: everything allowed, or nothing with disableIndexing (as in homepage). */
export function renderRobots(settings) {
  return settings.disableIndexing === true ? 'User-agent: *\nDisallow: /\n' : 'User-agent: *\nAllow: /\n';
}
