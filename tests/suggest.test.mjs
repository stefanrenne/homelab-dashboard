// Search suggestions (src/suggest.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { suggestUrl, fetchSuggestions, SUGGEST_URLS } from '../src/suggest.js';

test('suggestUrl: only when on; a known provider, or the box\'s own suggestionUrl for custom', () => {
  assert.equal(suggestUrl({ provider: 'google' }), null);
  assert.equal(suggestUrl({ showSearchSuggestions: true, provider: 'google' }), SUGGEST_URLS.google);
  assert.equal(suggestUrl({ showSearchSuggestions: true, provider: 'startpage' }), null, 'no suggestion URL known');
  assert.equal(suggestUrl({ showSearchSuggestions: true, provider: 'custom', suggestionUrl: 'https://ac.lan/?q=' }), 'https://ac.lan/?q=');
  assert.equal(suggestUrl({ showSearchSuggestions: true, provider: 'custom', suggestionUrl: 'file:///etc/passwd' }), null);
});

test('fetchSuggestions: OpenSearch answers, query appended or at {q}, at most eight', async () => {
  const asked = [];
  const fetchImpl = async (url) => {
    asked.push(url);
    return { ok: true, text: async () => JSON.stringify(['pl', ['plex', 'plex pass', '', 3, ...Array.from({ length: 10 }, (_, i) => `p${i}`)]]) };
  };
  const list = await fetchSuggestions('https://ac.lan/?q=', 'pl ex', { fetchImpl });
  assert.deepEqual(list, ['plex', 'plex pass', 'p0', 'p1', 'p2', 'p3', 'p4', 'p5']);
  await fetchSuggestions('https://ac.lan/s?query={q}&n=5', 'a&b', { fetchImpl });
  assert.deepEqual(asked, ['https://ac.lan/?q=pl%20ex', 'https://ac.lan/s?query=a%26b&n=5']);
  await assert.rejects(fetchSuggestions('https://x/', 'q', { fetchImpl: async () => ({ ok: false, status: 500 }) }), /answered 500/);
});
