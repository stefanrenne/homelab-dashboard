// Writes one documentation page per widget into the staged Pages site (see scripts/pages.sh):
// the widget's README.md (intro, fields, example) with its version, source and an options table
// taken from widget.yaml.
//   node scripts/pages-widgets.mjs <site> <builtin widgets dir> [<collection repo dir> <tag>]

import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';

const REPO = 'https://github.com/stefanrenne/homelab-dashboard';
const COLLECTION = 'https://github.com/stefanrenne/homelab-dashboard-widgets';

/** The widget folders (with a widget.yaml) directly in `dir`, sorted. */
export function widgetFolders(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((d) => fs.existsSync(path.join(dir, d, 'widget.yaml')))
    .sort()
    .map((d) => path.join(dir, d));
}

/** Options from widget.yaml, each with the comment at the end of its line as description. */
export function optionRows(yamlText) {
  const manifest = YAML.parse(yamlText);
  const comments = {};
  for (const line of yamlText.split('\n')) {
    const m = /^ {2}(\w+):.*?#\s*(.+)$/.exec(line);
    if (m) comments[m[1]] = m[2].trim().replace(/^\w/, (c) => c.toUpperCase());
  }
  return Object.entries(manifest.options ?? {}).map(([name, def]) => ({
    name,
    type: def.type === 'enum' ? def.values.join(' / ') : def.type,
    required: def.required === true,
    default: def.default,
    secret: def.secret === true,
    description: comments[name] ?? '',
  }));
}

const cell = (text) => String(text).replace(/\|/g, '\\|').replace(/\n/g, ' ');
const code = (value) => (value === undefined ? '' : `\`${cell(typeof value === 'string' ? value : JSON.stringify(value))}\``);

function optionsTable(rows) {
  if (rows.length === 0) return 'This widget has no options.\n';
  const lines = ['| Option | Type | Required | Default | Description |', '|---|---|---|---|---|'];
  for (const r of rows) {
    const description = [r.secret ? '**Secret**: stays on the server.' : '', cell(r.description)].filter(Boolean).join(' ');
    lines.push(`| \`${r.name}\` | ${cell(r.type)} | ${r.required ? 'yes' : ''} | ${code(r.default)} | ${description} |`);
  }
  return lines.join('\n') + '\n';
}

/**
 * The page for one widget folder. `source` is { kind: 'builtin' } or { kind: 'collection', tag }.
 * Returns { id, name, description, markdown } (markdown without front matter).
 */
export function widgetPage(dir, source) {
  const yamlText = fs.readFileSync(path.join(dir, 'widget.yaml'), 'utf8');
  const manifest = YAML.parse(yamlText);
  const readmeFile = path.join(dir, 'README.md');
  let readme = fs.existsSync(readmeFile) ? fs.readFileSync(readmeFile, 'utf8') : `# ${manifest.name}\n\n${manifest.description ?? ''}\n`;
  if (!/^# /.test(readme)) readme = `# ${manifest.name}\n\n${readme}`;

  const id = manifest.id;
  const where = source.kind === 'builtin'
    ? `Built in · [source](${REPO}/tree/main/widgets/${id})`
    : `[Widget collection](${COLLECTION}) ${source.tag} · [source](${COLLECTION}/tree/${source.tag}/widgets/${id})`;
  const info = `\`type: ${id}\` · version ${manifest.version} · widget API ${manifest.apiVersion} · ${where}\n{: .fs-3 .text-grey-dk-000 }\n`;
  const options = `## Options\n\n${optionsTable(optionRows(yamlText))}\nEvery widget also takes \`refresh\` (or \`refreshInterval\` in ms), \`fields\` and \`hideErrors\`; see [services.yaml](../../configuration.html#servicesyaml).\n`;

  // the title, then the info line; the options table goes before ## Example, or at the end
  const [title, ...rest] = readme.split('\n');
  let body = rest.join('\n');
  const example = body.search(/^## Example/m);
  body = example === -1 ? `${body.trimEnd()}\n\n${options}` : `${body.slice(0, example)}${options}\n${body.slice(example)}`;
  return { id, name: manifest.name, description: manifest.description ?? '', markdown: `${title}\n\n${info}${body}` };
}

function writePage(file, frontMatter, markdown) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  // raw: {{HD_VAR_*}} in the examples must reach the page as written
  fs.writeFileSync(file, `---\n${YAML.stringify(frontMatter)}---\n{% raw %}\n${markdown.trimEnd()}\n{% endraw %}\n`);
}

function section(site, folder, title, navOrder, intro, pages) {
  const table = ['| Widget | `type` | What it shows |', '|---|---|---|'];
  for (const p of pages) table.push(`| [${cell(p.name)}](${p.id}.html) | \`${p.id}\` | ${cell(p.description)} |`);
  writePage(path.join(site, 'widgets', folder, 'index.md'),
    { title, parent: 'Widgets', nav_order: navOrder, has_children: true, permalink: `/widgets/${folder}/` },
    `# ${title}\n\n${intro}\n\n${table.join('\n')}`);
  for (const p of pages) {
    writePage(path.join(site, 'widgets', folder, `${p.id}.md`), { title: p.name, parent: title, grand_parent: 'Widgets' }, p.markdown);
  }
}

export function writeWidgetPages({ site, builtinDir, collectionDir, collectionTag }) {
  const builtin = widgetFolders(builtinDir).map((d) => widgetPage(d, { kind: 'builtin' }));
  section(site, 'built-in', 'Built-in widgets', 4,
    'These widgets come with the dashboard. Use them under `widget:` in `services.yaml` or in `widgets.yaml` (the header).',
    builtin);
  if (!collectionDir) return { builtin: builtin.length, collection: 0 };
  const collection = widgetFolders(path.join(collectionDir, 'widgets')).map((d) => widgetPage(d, { kind: 'collection', tag: collectionTag }));
  section(site, 'collection', 'Widget collection', 5,
    `The [widgets collection](${COLLECTION}) is always installed at its newest release (this page: ${collectionTag}). ` +
      'To pin a release or take only some widgets, list it under `plugins:` yourself; see [Configuration](../../configuration.html).',
    collection);
  return { builtin: builtin.length, collection: collection.length };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [site, builtinDir, collectionDir, collectionTag] = process.argv.slice(2);
  const n = writeWidgetPages({ site, builtinDir, collectionDir, collectionTag });
  console.log(`widget pages: ${n.builtin} built-in, ${n.collection} from the collection`);
}
