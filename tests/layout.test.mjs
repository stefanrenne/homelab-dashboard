import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveIcon } from '../src/layout.js';

test('icons: names, extensions, Simple Icons, Material Design, selfh.st, colours, local and URLs', () => {
  const base = 'https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons';
  assert.equal(resolveIcon('unraid'), `${base}/png/unraid.png`);
  assert.equal(resolveIcon('plex.svg'), `${base}/svg/plex.svg`);
  assert.equal(resolveIcon('si-sonos'), 'https://cdn.jsdelivr.net/npm/simple-icons@v13/icons/sonos.svg#hd-mask');
  assert.equal(resolveIcon('si-sonos-#A712A2'), 'https://cdn.jsdelivr.net/npm/simple-icons@v13/icons/sonos.svg#hd-mask=a712a2');
  assert.equal(resolveIcon('mdi-flask-outline'), 'https://cdn.jsdelivr.net/npm/@mdi/svg@7.4.47/svg/flask-outline.svg#hd-mask');
  assert.equal(resolveIcon('mdi-flask-outline-#f0d453'), 'https://cdn.jsdelivr.net/npm/@mdi/svg@7.4.47/svg/flask-outline.svg#hd-mask=f0d453');
  assert.equal(resolveIcon('sh-plex'), 'https://cdn.jsdelivr.net/gh/selfhst/icons/png/plex.png');
  assert.equal(resolveIcon('sh-plex.svg'), 'https://cdn.jsdelivr.net/gh/selfhst/icons/svg/plex.svg');
  assert.equal(resolveIcon('/icons/x.png'), '/icons/x.png');
  assert.equal(resolveIcon('https://a/b.png'), 'https://a/b.png');
  assert.equal(resolveIcon('Not An Icon!'), null);
  assert.equal(resolveIcon(undefined), null);
});
