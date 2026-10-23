// Small helpers shared by the server modules.

import { createHash } from 'node:crypto';
import path from 'node:path';

const UNITS = { ms: 1, s: 1000, m: 60_000, h: 3_600_000 };

/** Parses `500ms`, `10s`, `5m`, `1h` or a number of seconds into milliseconds. */
export function parseDuration(value, fallbackMs) {
  if (value === undefined || value === null || value === '') return fallbackMs;
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return value * 1000;
  const match = /^(\d+(?:\.\d+)?)\s*(ms|s|m|h)$/.exec(String(value).trim());
  if (!match) throw new Error(`invalid duration "${value}" (use e.g. 500ms, 10s, 5m, 1h)`);
  return Number(match[1]) * UNITS[match[2]];
}

/** A short, stable id derived from the given parts. */
export function stableId(prefix, ...parts) {
  return prefix + '-' + createHash('sha1').update(parts.join('\u0000')).digest('hex').slice(0, 10);
}

/** Resolves `rel` inside `root`; returns null if the result would escape `root`. */
export function safeJoin(root, rel) {
  const resolved = path.resolve(root, '.' + path.sep + rel);
  const base = path.resolve(root);
  if (resolved !== base && !resolved.startsWith(base + path.sep)) return null;
  return resolved;
}

export function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
