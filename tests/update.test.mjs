// The update check behind hideVersion: false (src/update.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isNewer, UpdateCheck } from '../src/update.js';
import { silentLog } from './helpers.mjs';

test('isNewer compares releases by number, and never for non-releases', () => {
  assert.equal(isNewer('v0.10.0', '0.9.3'), true);
  assert.equal(isNewer('0.4.0', '0.4.0'), false);
  assert.equal(isNewer('v0.3.9', '0.4.0'), false);
  assert.equal(isNewer('v1.0.0', 'main-abc1234'), false, 'a main build does not nag');
  assert.equal(isNewer('nightly', '0.4.0'), false);
});

test('UpdateCheck keeps the latest release, reports changes, and survives failures', async () => {
  let answer = { ok: true, json: async () => ({ tag_name: 'v9.9.9', html_url: 'https://github.com/x/releases/tag/v9.9.9' }) };
  const changes = [];
  const check = new UpdateCheck({ fetchImpl: async () => answer, log: silentLog, onChange: (l) => changes.push(l.version) });
  await check.check();
  assert.deepEqual(check.latest, { version: '9.9.9', url: 'https://github.com/x/releases/tag/v9.9.9' });
  await check.check();
  assert.deepEqual(changes, ['9.9.9'], 'only a new version is a change');
  answer = { ok: false, status: 403 };
  await check.check();
  assert.equal(check.latest.version, '9.9.9', 'a failed check keeps what it knew');
  check.stop();
});
