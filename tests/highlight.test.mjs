// Block highlighting (src/highlight.js), homepage's rule format.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { numberIn, evaluate, highlightBlocks } from '../src/highlight.js';

test('numberIn: numbers in formatted values', () => {
  assert.equal(numberIn(12), 12);
  assert.equal(numberIn(' 12.5 '), 12.5);
  assert.equal(numberIn('12,5 %'), 12.5);
  assert.equal(numberIn('1,234,567 queries'), 1234567);
  assert.equal(numberIn('1.234,5 GB'), 1234.5);
  assert.equal(numberIn('1,234.5 GB'), 1234.5);
  assert.equal(numberIn('3.14159'), 3.14159);
  assert.equal(numberIn('2 of 5'), undefined, 'two numbers: no single value');
  assert.equal(numberIn('healthy'), undefined);
  assert.equal(numberIn(null), undefined);
});

test('numeric rules: comparisons, between/outside with min and max, negate; the first match wins', () => {
  const rules = { numeric: [
    { level: 'danger', when: 'gte', value: 20 },
    { level: 'warn', when: 'between', min: 5, max: 19 },
    { level: 'good', when: 'eq', value: 0 },
  ] };
  assert.equal(evaluate(rules, 25).level, 'danger');
  assert.equal(evaluate(rules, '7 items').level, 'warn');
  assert.equal(evaluate(rules, 0).level, 'good');
  assert.equal(evaluate(rules, 3), null);
  assert.equal(evaluate({ numeric: { level: 'warn', when: 'outside', min: 10, max: 90 } }, 95).level, 'warn');
  assert.equal(evaluate({ numeric: { level: 'warn', when: 'outside', max: 90 } }, 50), null);
  assert.equal(evaluate({ numeric: [{ level: 'good', when: 'gt', value: 0, negate: true }] }, 0).level, 'good');
  assert.equal(evaluate({ numeric: [{ level: 'nope', when: 'gt', value: 0 }] }, 5), null, 'unknown levels are skipped');
});

test('string rules: equals, includes, startsWith, endsWith, regex, case and negate; numeric goes first', () => {
  const rules = { string: [
    { level: 'danger', when: 'regex', value: '(failed|import) pending' },
    { level: 'good', when: 'equals', value: 'All good' },
    { level: 'warn', when: 'startsWith', value: 'Deg', caseSensitive: true },
  ] };
  assert.equal(evaluate(rules, 'Import pending').level, 'danger');
  assert.equal(evaluate(rules, ' all GOOD ').level, 'good');
  assert.equal(evaluate(rules, 'degraded'), null, 'caseSensitive');
  assert.equal(evaluate({ string: [{ level: 'warn', when: 'includes', value: 'up', negate: true }] }, 'down').level, 'warn');
  assert.equal(evaluate({ string: [{ level: 'warn', when: 'regex', value: '^5\\d{2}$' }] }, 503).level, 'warn', 'numbers are matched as text too');
  assert.equal(evaluate({ string: [{ level: 'warn', when: 'regex', value: '(' }] }, 'x'), null, 'a broken regex never matches');
  const both = { numeric: [{ level: 'good', when: 'lt', value: 10 }], string: [{ level: 'danger', when: 'includes', value: '5' }] };
  assert.equal(evaluate(both, '5').level, 'good');
  assert.deepEqual(evaluate({ valueOnly: true, numeric: [{ level: 'warn', when: 'gt', value: 1 }] }, 2), { level: 'warn', valueOnly: true });
});

test('highlightBlocks: by block key (or label), also as <type>.<key>', () => {
  const data = { blocks: [{ key: 'queued', label: 'queued', value: 25 }, { label: 'wanted', value: 0 }, { key: 'series', label: 'series', value: 3 }] };
  const out = highlightBlocks(data, {
    queued: { numeric: [{ level: 'danger', when: 'gte', value: 20 }] },
    'sonarr.wanted': { numeric: [{ level: 'good', when: 'eq', value: 0 }] },
  }, 'sonarr');
  assert.deepEqual(out.blocks.map((b) => b.highlight?.level ?? null), ['danger', 'good', null]);
  assert.equal(highlightBlocks(data, null, 'sonarr'), data);
});
