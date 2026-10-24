// Block highlighting, as in homepage: `highlight:` on a widget entry maps a block key to rules,
// and the first rule that matches the block's value gives the block a level (good, warn,
// danger). Numeric rules are tried before string rules.
//
//   highlight:
//     queued:
//       valueOnly: true                       # colour the value, not the whole block
//       numeric:
//         - { level: danger, when: gte, value: 20 }
//         - { level: good, when: between, min: 0, max: 2 }
//       string:
//         - { level: warn, when: regex, value: "(failed|import) pending" }
//
// Numeric: gt, gte, lt, lte, eq, ne (value), between and outside (min and/or max).
// String: equals, includes, startsWith, endsWith (case-insensitive unless caseSensitive: true)
// and regex (flags, default "i"). Any rule takes negate: true.

import { isPlainObject } from './util.js';

export const LEVELS = ['good', 'warn', 'danger'];

// homepage's default colours per level, as Tailwind classes; settings.blockHighlights.levels
// overrides them per level and the page turns them into CSS with its palettes.
export const DEFAULT_LEVELS = {
  good: 'bg-emerald-500/40 text-emerald-950 dark:bg-emerald-900/60 dark:text-emerald-400',
  warn: 'bg-amber-300/30 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200',
  danger: 'bg-rose-700/45 text-rose-200 dark:bg-rose-950/70 dark:text-rose-400',
};

const COMPARE = {
  gt: (v, t) => v > t,
  gte: (v, t) => v >= t,
  lt: (v, t) => v < t,
  lte: (v, t) => v <= t,
  eq: (v, t) => v === t,
  ne: (v, t) => v !== t,
};

const TEXT = {
  equals: (v, t) => v === t,
  includes: (v, t) => v.includes(t),
  startsWith: (v, t) => v.startsWith(t),
  endsWith: (v, t) => v.endsWith(t),
};

const num = (value) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const n = Number(value.trim());
  return Number.isNaN(n) ? undefined : n;
};

/**
 * The number in a block value: a number, or a string with one number in it ("1.234 GB",
 * "12,5 %", "1,234,567"). A comma followed by one or two digits is a decimal comma; groups of
 * three after a comma or dot are thousands. Undefined when there is no single number.
 */
export function numberIn(value) {
  const direct = num(value);
  if (direct !== undefined || typeof value !== 'string') return direct;
  const found = value.match(/[-+]?\d[\d\s.,]*/g);
  if (!found || found.length !== 1) return undefined;
  const token = found[0].replace(/\s+/g, '').replace(/[.,]$/, '');
  const commas = (token.match(/,/g) ?? []).length;
  const dots = (token.match(/\./g) ?? []).length;
  let plain = token;
  if (commas && dots) {
    // the later separator is the decimal one
    plain = token.lastIndexOf(',') > token.lastIndexOf('.') ? token.replace(/\./g, '').replace(',', '.') : token.replace(/,/g, '');
  } else if (commas || dots) {
    const sep = commas ? ',' : '.';
    const parts = token.split(sep);
    const thousands = parts.length > 1 && parts.slice(1).every((p) => p.length === 3);
    if (parts.length === 2 && parts[1].length <= 2) plain = parts.join('.');
    else if (thousands) plain = parts.join('');
    else if (sep === ',') return undefined;
  }
  return num(plain);
}

function numericMatch(value, rule) {
  let hit;
  if (COMPARE[rule.when]) {
    const target = num(rule.value);
    if (target === undefined) return false;
    hit = COMPARE[rule.when](value, target);
  } else if (rule.when === 'between' || rule.when === 'outside') {
    const min = num(rule.min ?? rule.value?.min);
    const max = num(rule.max ?? rule.value?.max);
    if (min === undefined && max === undefined) return false;
    const inside = value >= (min ?? -Infinity) && value <= (max ?? Infinity);
    hit = rule.when === 'between' ? inside : !inside;
  } else return false;
  return rule.negate ? !hit : hit;
}

function textMatch(value, rule) {
  if (typeof rule.value !== 'string') return false;
  let hit;
  if (rule.when === 'regex') {
    try {
      hit = new RegExp(rule.value, rule.flags ?? (rule.caseSensitive ? '' : 'i')).test(value);
    } catch {
      return false;
    }
  } else if (TEXT[rule.when]) {
    const fold = (s) => (rule.caseSensitive ? s : s.toLowerCase());
    hit = TEXT[rule.when](fold(value), fold(rule.value));
  } else return false;
  return rule.negate ? !hit : hit;
}

const list = (value) => (Array.isArray(value) ? value : value === undefined || value === null ? [] : [value]);

/** The highlight of one block value under one field's rules: { level, valueOnly } or null. */
export function evaluate(rules, value) {
  if (!isPlainObject(rules)) return null;
  const n = numberIn(value);
  if (n !== undefined) {
    for (const rule of list(rules.numeric)) {
      if (isPlainObject(rule) && LEVELS.includes(rule.level) && numericMatch(n, rule)) return { level: rule.level, valueOnly: rules.valueOnly === true };
    }
  }
  const text = typeof value === 'string' ? value.trim() : typeof value === 'number' || typeof value === 'boolean' ? String(value) : undefined;
  if (text !== undefined) {
    for (const rule of list(rules.string)) {
      if (isPlainObject(rule) && LEVELS.includes(rule.level) && textMatch(text, rule)) return { level: rule.level, valueOnly: rules.valueOnly === true };
    }
  }
  return null;
}

/**
 * Adds `highlight` ({ level, valueOnly }) to the blocks of a widget result that `highlight`
 * (the entry's rules, keyed by block key or "<type>.<key>") matches.
 */
export function highlightBlocks(data, highlight, type) {
  if (!isPlainObject(highlight) || !Array.isArray(data.blocks)) return data;
  return {
    ...data,
    blocks: data.blocks.map((b) => {
      const key = b.key ?? b.label;
      const rules = highlight[key] ?? highlight[`${type}.${key}`];
      const hit = rules ? evaluate(rules, b.value) : null;
      return hit ? { ...b, highlight: hit } : b;
    }),
  };
}
