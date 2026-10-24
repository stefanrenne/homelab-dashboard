// Substitution of `{{HD_VAR_*}}` and `{{HD_FILE_*}}` placeholders in config values.
//
// HD_VAR_NAME  -> the value of the environment variable HD_VAR_NAME
// HD_FILE_NAME -> the trimmed contents of the file whose path is in HD_FILE_NAME
// HOMEPAGE_VAR_* and HOMEPAGE_FILE_* work the same, so a homepage config can be reused.
//
// Every substituted value is recorded in `secrets`, so the layout builder can keep
// them out of anything sent to the browser (hard rule 1).

import fs from 'node:fs';
import { isPlainObject } from '../util.js';

const PLACEHOLDER = /\{\{\s*((?:HD|HOMEPAGE)_(?:VAR|FILE)_[A-Z0-9_]+)\s*\}\}/g;

export function substitute(value, { env = process.env, readFile = (p) => fs.readFileSync(p, 'utf8') } = {}) {
  const secrets = new Set();
  const warnings = [];

  const replaceString = (str) =>
    str.replace(PLACEHOLDER, (whole, name) => {
      const raw = env[name];
      if (raw === undefined) {
        warnings.push(`${whole} is used but ${name} is not set`);
        return whole;
      }
      let out = raw;
      if (/^(HD|HOMEPAGE)_FILE_/.test(name)) {
        try {
          out = readFile(raw).trim();
        } catch (err) {
          warnings.push(`${whole}: cannot read ${raw} (${err.code || err.message})`);
          return whole;
        }
      }
      if (out !== '') secrets.add(out);
      return out;
    });

  const walk = (node) => {
    if (typeof node === 'string') return replaceString(node);
    if (Array.isArray(node)) return node.map(walk);
    if (isPlainObject(node)) {
      const result = {};
      for (const [key, child] of Object.entries(node)) result[key] = walk(child);
      return result;
    }
    return node;
  };

  return { value: walk(value), secrets, warnings };
}
