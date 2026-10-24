// The dashboard page (public/index.html) with the parts of settings.yaml that must be in the
// HTML itself, for browsers and crawlers that do not run the page's script: the title, the
// meta description and the favicon. Values are HTML-escaped and secrets (values filled in
// from {{HD_VAR_*}}) are replaced by *** (hard rule 1); nothing else is templated.

import { resolveIcon } from './layout.js';

const escapeHtml = (value) =>
  String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** `html` with the head filled in from normalized `settings`. */
export function renderIndex(html, settings, secrets = new Set()) {
  const clean = (value) => escapeHtml([...secrets].reduce((s, secret) => s.split(secret).join('***'), String(value)));
  const head = [];
  if (settings.description) head.push(`<meta name="description" content="${clean(settings.description)}">`);
  const favicon = resolveIcon(settings.favicon);
  if (favicon) head.push(`<link rel="icon" href="${clean(favicon)}">`);
  return html
    .replace(/<title>[^<]*<\/title>/, `<title>${clean(settings.title)}</title>`)
    .replace('</head>', head.map((line) => `${line}\n`).join('') + '</head>');
}
