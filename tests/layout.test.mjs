import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveIcon } from '../src/layout.js';

test('icons: names, extensions, Simple Icons, local and URLs', () => {
  const base = 'https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons';
  assert.equal(resolveIcon('unraid'), `${base}/png/unraid.png`);
  assert.equal(resolveIcon('plex.svg'), `${base}/svg/plex.svg`);
  assert.equal(resolveIcon('si-sonos'), 'https://cdn.jsdelivr.net/npm/simple-icons@v13/icons/sonos.svg');
  assert.equal(resolveIcon('/icons/x.png'), '/icons/x.png');
  assert.equal(resolveIcon('https://a/b.png'), 'https://a/b.png');
  assert.equal(resolveIcon('Not An Icon!'), null);
  assert.equal(resolveIcon(undefined), null);
});
