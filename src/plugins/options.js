// Validation of widget options against the `options:` schema in widget.yaml.

import { isPlainObject } from '../util.js';

export const OPTION_TYPES = ['string', 'url', 'number', 'boolean', 'list', 'object', 'enum'];

/** Checks the schema itself; returns a list of problems. */
export function checkSchema(schema) {
  const problems = [];
  if (schema === undefined) return problems;
  if (!isPlainObject(schema)) return ['options: expected a map of option name to { type, ... }'];
  for (const [name, def] of Object.entries(schema)) {
    if (!isPlainObject(def) || !OPTION_TYPES.includes(def.type)) {
      problems.push(`options.${name}: type must be one of ${OPTION_TYPES.join(', ')}`);
    } else if (def.type === 'enum' && (!Array.isArray(def.values) || def.values.length === 0)) {
      problems.push(`options.${name}: an enum needs "values"`);
    }
  }
  return problems;
}

function coerce(def, value) {
  switch (def.type) {
    case 'string':
      return typeof value === 'string' || typeof value === 'number' ? { value: String(value) } : { error: 'expected text' };
    case 'url':
      try {
        const url = new URL(String(value));
        return ['http:', 'https:'].includes(url.protocol) ? { value: String(value) } : { error: 'expected an http(s) URL' };
      } catch {
        return { error: 'expected a URL' };
      }
    case 'number': {
      const n = typeof value === 'number' ? value : Number(value);
      return Number.isFinite(n) ? { value: n } : { error: 'expected a number' };
    }
    case 'boolean':
      if (typeof value === 'boolean') return { value };
      if (value === 'true' || value === 'false') return { value: value === 'true' };
      return { error: 'expected true or false' };
    case 'list':
      if (Array.isArray(value)) return { value };
      if (typeof value === 'string') return { value: value.split(',').map((s) => s.trim()).filter(Boolean) };
      return { error: 'expected a list' };
    case 'object':
      return isPlainObject(value) ? { value } : { error: 'expected a map' };
    case 'enum':
      return def.values.includes(value) ? { value } : { error: `expected one of ${def.values.join(', ')}` };
    default:
      return { error: 'unknown type' };
  }
}

/**
 * Validates `raw` options. Returns { options, publicOptions, errors }.
 *
 * Only options that are declared in the schema, not `secret: true` and not filled
 * from a variable or file (`secrets`) are public. Undeclared options are passed to the
 * server part but never to the browser.
 */
export function validateOptions(schema = {}, raw = {}, secrets = new Set()) {
  const options = {};
  const publicOptions = {};
  const errors = [];
  for (const [name, def] of Object.entries(schema)) {
    let value = raw[name];
    if (value === undefined || value === null) {
      if (def.default !== undefined) value = structuredClone(def.default);
      else {
        if (def.required) errors.push(`${name}: required`);
        continue;
      }
    }
    const result = coerce(def, value);
    if (result.error) {
      errors.push(`${name}: ${result.error}`);
      continue;
    }
    options[name] = result.value;
    if (!def.secret && !containsSecret(result.value, secrets)) publicOptions[name] = result.value;
  }
  for (const [name, value] of Object.entries(raw)) {
    if (!(name in schema)) options[name] = value;
  }
  return { options, publicOptions, errors };
}

function containsSecret(value, secrets) {
  if (secrets.size === 0) return false;
  const text = JSON.stringify(value);
  for (const s of secrets) if (text.includes(s)) return true;
  return false;
}
