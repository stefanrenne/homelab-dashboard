#!/usr/bin/env node
// A new widget package from examples/widget-template:
//   npm run new-widget -- <id> [folder] [--name "Display name"]
// Copies the template to <folder> (default ./<id>) and renames example-counter, ExampleCounter
// and "Example counter" everywhere. The repository form, homelab-dashboard-widget-example, has
// the same rename as `npm run rename`.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const TEMPLATE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'examples', 'widget-template');
const ID = /^[a-z0-9][a-z0-9-]{0,62}$/; // as src/plugins/loader.js
const SKIP = new Set(['node_modules', '.git']);

/** Renames the template's widget in every text file under `dir`. */
export function renameWidget(dir, id, name = id.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase())) {
  if (!ID.test(id)) throw new Error(`"${id}" is not a widget id: lowercase letters, digits and dashes`);
  const pascal = id.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('').replace(/^(\d)/, 'W$1');
  const changed = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) {
        if (!SKIP.has(e.name)) walk(p);
        continue;
      }
      if (!/\.(js|mjs|json|ya?ml|md)$/.test(e.name) || e.name === 'package-lock.json') continue;
      const before = fs.readFileSync(p, 'utf8');
      const after = before.replaceAll('Example counter (widget template)', name).replaceAll('example-counter', id).replaceAll('ExampleCounter', pascal).replaceAll('Example counter', name);
      if (after !== before) {
        fs.writeFileSync(p, after);
        changed.push(path.relative(dir, p));
      }
    }
  };
  walk(dir);
  return changed;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: { name: { type: 'string' } } });
  const [id, folder] = positionals;
  if (!id) {
    console.error('usage: npm run new-widget -- <id> [folder] [--name "Display name"]');
    process.exit(2);
  }
  try {
    if (!ID.test(id)) throw new Error(`"${id}" is not a widget id: lowercase letters, digits and dashes`);
    const target = path.resolve(folder ?? id);
    if (fs.existsSync(target)) throw new Error(`${target} already exists`);
    fs.cpSync(TEMPLATE, target, { recursive: true });
    renameWidget(target, id, values.name);
    console.log(`${target}: widget "${id}". Next: options in widget.yaml, fetch() in server.js; install it with plugins: - path: ${target}`);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
