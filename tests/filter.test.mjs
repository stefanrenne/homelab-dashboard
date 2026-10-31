// A service's `filter:` expression (src/filter.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFilter, bindFilter, evalFilter, filterRefs } from '../src/filter.js';

const run = (text, widgets, results) => {
  const { tree, errors } = bindFilter(parseFilter(text), widgets);
  assert.deepEqual(errors, []);
  return evalFilter(tree, (i, attr) => results[i]?.[attr]);
};
const shelly = [{ type: 'shelly', attributes: { update: { type: 'boolean' }, version: { type: 'string' } } }];

test('parseFilter: the user\'s example and the three path forms', () => {
  assert.deepEqual(parseFilter('widget.update == false'), { op: '==', a: { ref: { widget: { index: 0 }, attr: 'update' } }, b: { lit: false } });
  assert.deepEqual(filterRefs(parseFilter('widgets[1].count > 2 || widgets.custom-api.ok')), [
    { widget: { index: 1 }, attr: 'count' },
    { widget: { type: 'custom-api' }, attr: 'ok' },
  ]);
});

test('parseFilter: && binds tighter than ||, ! tighter than both, parentheses win', () => {
  assert.deepEqual(parseFilter('true || false && false'), { op: '||', a: { lit: true }, b: { op: '&&', a: { lit: false }, b: { lit: false } } });
  assert.deepEqual(parseFilter('!(true || false)'), { op: '!', a: { op: '||', a: { lit: true }, b: { lit: false } } });
  assert.deepEqual(parseFilter("widget.version != 'v1' && widget.n >= -1.5"), {
    op: '&&',
    a: { op: '!=', a: { ref: { widget: { index: 0 }, attr: 'version' } }, b: { lit: 'v1' } },
    b: { op: '>=', a: { ref: { widget: { index: 0 }, attr: 'n' } }, b: { lit: -1.5 } },
  });
});

test('parseFilter: mistakes give a message that says where', () => {
  assert.throws(() => parseFilter('widget.update false'), /expected an operator at "false"/);
  assert.throws(() => parseFilter('update == false'), /"update" is not a value: use widget\.<attribute>/);
  assert.throws(() => parseFilter('widget.update =='), /the expression ends too early/);
  assert.throws(() => parseFilter('(widget.update'), /expected "\)" at the end/);
  assert.throws(() => parseFilter("widget.v == 'x"), /not closed/);
  assert.throws(() => parseFilter('widget.a = 1'), /unexpected "=" at position 10/);
  assert.throws(() => parseFilter(''), /expected an expression/);
  assert.throws(() => parseFilter(true), /expected an expression/);
});

test('bindFilter: types become positions; unknown widgets are errors, unknown attributes warnings', () => {
  const widgets = [{ type: 'button', attributes: undefined }, ...shelly];
  const bound = bindFilter(parseFilter('widgets.shelly.update && widget.x'), widgets);
  assert.deepEqual(filterRefs(bound.tree), [{ index: 1, attr: 'update' }, { index: 0, attr: 'x' }]);
  assert.deepEqual(bound.errors, []);
  assert.deepEqual(bindFilter(parseFilter('widgets.radarr.x || widgets[3].y'), widgets).errors, [
    'no "radarr" widget on this service',
    'the service has no widget 3 (it has 2, counted from 0)',
  ]);
  assert.deepEqual(bindFilter(parseFilter('widget.updates'), shelly).warnings, ['shelly has no attribute "updates" (it has update, version)']);
  assert.deepEqual(bindFilter(parseFilter('widget.x'), [{ type: 'ping', attributes: {} }]).warnings, ['ping has no attribute "x" (it publishes none)']);
});

test('evalFilter: strict comparisons, missing is null, numbers only for < and >', () => {
  assert.equal(run('widget.update == false', shelly, [{ update: false }]), true);
  assert.equal(run('widget.update == false', shelly, [{ update: true }]), false);
  assert.equal(run('widget.update == false', shelly, [{}]), false, 'missing is null, not false');
  assert.equal(run('widget.update == null', shelly, [{}]), true);
  assert.equal(run('!widget.update', shelly, [{ update: false }]), true);
  assert.equal(run("widget.version == '1.4.2'", shelly, [{ version: '1.4.2' }]), true);
  assert.equal(run('widget.n > 2', shelly, [{ n: 3 }]), true);
  assert.equal(run('widget.n > 2', shelly, [{ n: '3' }]), false, 'a string is not a number');
  assert.equal(run('widget.n <= 2 || widget.update', shelly, [{ n: 5, update: true }]), true);
});
