// Writes one documentation page per widget into the staged Pages site (see scripts/pages.sh):
// the widget's README.md (intro, fields, example) with its version, source, an example image
// (made by scripts/widget-images.mjs, when there is one) and an options table taken from
// widget.yaml. Widgets are split, as in homepage, into service widgets and header widgets (those
// whose example is a widgets.yaml entry), and all of them are listed on the Widgets page.
//   node scripts/pages-widgets.mjs <site> <collection repo dir> <tag>

import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { exampleEntry } from './widget-images.mjs';

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
/** The line comments of the keys directly under a top-level `section:` of widget.yaml. */
function lineComments(yamlText, section) {
  const comments = {};
  let inside = false;
  for (const line of yamlText.split('\n')) {
    if (/^\S/.test(line)) inside = line.startsWith(`${section}:`);
    const m = inside && /^ {2}(\w+):.*?#\s*(.+)$/.exec(line);
    if (m) comments[m[1]] = m[2].trim().replace(/^\w/, (c) => c.toUpperCase());
  }
  return comments;
}

/** Attributes from widget.yaml (for a service's `filter:`), each with its line comment. */
export function attributeRows(yamlText) {
  const comments = lineComments(yamlText, 'attributes');
  return Object.entries(YAML.parse(yamlText).attributes ?? {}).map(([name, def]) => ({ name, type: def?.type, description: comments[name] ?? '' }));
}

export function optionRows(yamlText) {
  const manifest = YAML.parse(yamlText);
  const comments = lineComments(yamlText, 'options');
  return Object.entries(manifest.options ?? {}).map(([name, def]) => ({
    name,
    type: def.type === 'enum' ? def.values.join(' / ') : def.type,
    required: def.required === true,
    default: def.default,
    secret: def.secret === true,
    description: comments[name] ?? '',
  }));
}

// Addresses of the site before Configuration got a page per file; collection READMEs may still
// use them, and an anchor does not survive a redirect.
const MOVED = [
  [/\]\(\.\.\/\.\.\/configuration\.html#(settings|services|bookmarks|docker|kubernetes|proxmox)yaml\)/g, (_, f) => `](../../configuration/${f}.html)`],
  [/\]\(\.\.\/\.\.\/configuration\.html#widgetsyaml\)/g, () => '](../../configuration/header-widgets.html)'],
  [/\]\(\.\.\/\.\.\/configuration\.html(#[a-z-]+)?\)/g, (_, a) => `](../../configuration/${a ?? ''})`],
  [/\]\(\.\.\/\.\.\/discovery\.html#docker[a-z-]*\)/g, () => '](../../configuration/docker.html#discovery)'],
  [/\]\(\.\.\/\.\.\/discovery\.html#kubernetes\)/g, () => '](../../configuration/kubernetes.html#discovery)'],
];
export const movedLinks = (markdown) => MOVED.reduce((md, [re, to]) => md.replace(re, to), markdown);

const cell = (text) => String(text).replace(/\|/g, '\\|').replace(/\n/g, ' ');
const code = (value) => (value === undefined ? '' : `\`${cell(typeof value === 'string' ? value : JSON.stringify(value))}\``);

function attributesTable(rows) {
  const lines = ['| Attribute | Type | Description |', '|---|---|---|'];
  for (const r of rows) lines.push(`| \`${r.name}\` | ${cell(r.type)} | ${cell(r.description)} |`);
  return lines.join('\n') + '\n';
}

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
 * The page for one widget folder of the collection at `source.tag`.
 * Returns { id, name, description, markdown } (markdown without front matter).
 */
export function widgetPage(dir, source, image = null) {
  const yamlText = fs.readFileSync(path.join(dir, 'widget.yaml'), 'utf8');
  const manifest = YAML.parse(yamlText);
  const readmeFile = path.join(dir, 'README.md');
  let readme = fs.existsSync(readmeFile) ? fs.readFileSync(readmeFile, 'utf8') : `# ${manifest.name}\n\n${manifest.description ?? ''}\n`;
  if (!/^# /.test(readme)) readme = `# ${manifest.name}\n\n${readme}`;
  readme = movedLinks(readme);

  const id = manifest.id;
  const where = `[Widget collection](${COLLECTION}) ${source.tag} · [source](${COLLECTION}/tree/${source.tag}/widgets/${id})`;
  const also = (manifest.aliases ?? []).map((a) => ` (or \`${a}\`)`).join('');
  const info = `\`type: ${id}\`${also} · version ${manifest.version} · widget API ${manifest.apiVersion} · ${where}\n{: .fs-3 .text-grey-dk-000 }\n` +
    (image ? `\n![${manifest.name} with example data](${image})\n` : '');
  const attributes = attributeRows(yamlText);
  const published = attributes.length
    ? `\n## Attributes\n\nPublic values a service's \`filter:\` can read, as \`widget.<attribute>\`; see [Filtering services](../../configuration/services.html#filtering-services).\n\n${attributesTable(attributes)}`
    : '';
  const options = `## Options\n\n${optionsTable(optionRows(yamlText))}\nEvery widget also takes \`refresh\` (or \`refreshInterval\` in ms), \`fields\` and \`hideErrors\`; see [Services](../../configuration/services.html).\n${published}`;

  // the title, then the info line; the options table goes before ## Example, or at the end
  const [title, ...rest] = readme.split('\n');
  let body = rest.join('\n');
  const example = body.search(/^## Example/m);
  body = example === -1 ? `${body.trimEnd()}\n\n${options}` : `${body.slice(0, example)}${options}\n${body.slice(example)}`;
  const kind = exampleEntry(dir, 'http://example.lan')?.kind === 'header' ? 'header' : 'service';
  return { id, name: manifest.name, description: manifest.description ?? '', kind, markdown: `${title}\n\n${info}${body}` };
}

function writePage(file, frontMatter, markdown) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  // raw: {{HD_VAR_*}} in the examples must reach the page as written
  fs.writeFileSync(file, `---\n${YAML.stringify(frontMatter)}---\n{% raw %}\n${markdown.trimEnd()}\n{% endraw %}\n`);
}

function table(pages, prefix) {
  const rows = ['| Widget | `type` | What it shows |', '|---|---|---|'];
  for (const p of pages) rows.push(`| [${cell(p.name)}](${prefix}${p.id}.html) | \`${p.id}\` | ${cell(p.description)} |`);
  return rows.join('\n');
}

// Pages stay at widgets/collection/<id>.html whatever their section: other sites link there.
function section(site, { folder, title, navOrder, intro, pages }) {
  writePage(path.join(site, 'widgets', folder, 'index.md'),
    { title, parent: 'Widgets', nav_order: navOrder, has_children: true, permalink: `/widgets/${folder}/` },
    `# ${title}\n\n${intro}\n\n${table(pages, '../collection/')}`);
  for (const p of pages) {
    writePage(path.join(site, 'widgets', 'collection', `${p.id}.md`),
      { title: p.name, parent: title, grand_parent: 'Widgets', permalink: `/widgets/collection/${p.id}.html` }, p.markdown);
  }
}

/**
 * The widget pages, their two sections and the list on the Widgets page (`widgets/README.md` of
 * the staged site, when there). `<site>/widgets/collection/images/<id>.png` is a widget's image.
 */
export function writeWidgetPages({ site, collectionDir, collectionTag }) {
  const images = path.join(site, 'widgets', 'collection', 'images');
  const all = widgetFolders(path.join(collectionDir, 'widgets')).map((d) => {
    const id = path.basename(d);
    const image = fs.existsSync(path.join(images, `${id}.png`)) ? `images/${id}.png` : null;
    return widgetPage(d, { kind: 'collection', tag: collectionTag }, image);
  });
  const service = all.filter((p) => p.kind === 'service');
  const header = all.filter((p) => p.kind === 'header');
  const from = `From the [widgets collection](${COLLECTION}) ${collectionTag}, always installed.`;
  section(site, { folder: 'collection', title: 'Service widgets', navOrder: 1, pages: service,
    intro: `Widgets on a service's card, under \`widget:\` in [services.yaml](../../configuration/services.html). ${from}` });
  section(site, { folder: 'header', title: 'Header widgets', navOrder: 2, pages: header,
    intro: `Widgets in the page's header, in [widgets.yaml](../../configuration/header-widgets.html). ${from}` });

  const index = path.join(site, 'widgets', 'README.md');
  if (fs.existsSync(index)) {
    const list = `\n{% raw %}\n## Service widgets\n\n${table(service, 'collection/')}\n\n## Header widgets\n\n${table(header, 'collection/')}\n{% endraw %}\n`;
    fs.appendFileSync(index, list);
  }
  return { collection: all.length, service: service.length, header: header.length, images: all.filter((p) => p.markdown.includes('](images/')).length };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [site, collectionDir, collectionTag] = process.argv.slice(2);
  const n = writeWidgetPages({ site, collectionDir, collectionTag });
  console.log(`widget pages: ${n.service} service and ${n.header} header widgets, ${n.images} with an image`);
}
