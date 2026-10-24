// Search suggestions for the search widget and quick launch (homepage's showSearchSuggestions).
// The page's CSP keeps it from calling a search engine, so the server asks on its behalf: only
// a provider's known suggestion URL, or a suggestionUrl from the config, never one the request
// brings along. Answers are OpenSearch suggestions: [query, [suggestion, ...]].

export const SUGGEST_URLS = {
  google: 'https://www.google.com/complete/search?client=chrome&q=',
  duckduckgo: 'https://duckduckgo.com/ac/?type=list&q=',
  bing: 'https://api.bing.com/osjson.aspx?query=',
  baidu: 'https://suggestion.baidu.com/su?action=opensearch&ie=utf-8&wd=',
  brave: 'https://search.brave.com/api/suggest?q=',
};
export const MAX_SUGGESTIONS = 8;

/**
 * Where suggestions come from for one search box: its provider's URL, or its own suggestionUrl
 * for provider custom. Null when suggestions are off or there is no URL.
 */
export function suggestUrl({ showSearchSuggestions, provider, suggestionUrl } = {}) {
  if (!showSearchSuggestions) return null;
  if (provider === 'custom') return typeof suggestionUrl === 'string' && /^https?:\/\//.test(suggestionUrl) ? suggestionUrl : null;
  return SUGGEST_URLS[provider] ?? null;
}

/** The suggestions for `query` from `base` (the query is appended, or put where {q} is). */
export async function fetchSuggestions(base, query, { fetchImpl = fetch, timeoutMs = 3000 } = {}) {
  const q = encodeURIComponent(query);
  const url = base.includes('{q}') ? base.replace('{q}', q) : base + q;
  const res = await fetchImpl(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`suggestions answered ${res.status}`);
  const body = JSON.parse(await res.text());
  const list = Array.isArray(body) && Array.isArray(body[1]) ? body[1] : [];
  return list.filter((s) => typeof s === 'string' && s.trim()).slice(0, MAX_SUGGESTIONS);
}
