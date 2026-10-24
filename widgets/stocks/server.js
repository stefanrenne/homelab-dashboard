// Prices from Finnhub's quote API (https://finnhub.io/docs/api/quote): current price and the
// change since the previous close, for up to eight symbols (as in homepage).

export const API = { url: 'https://finnhub.io/api/v1/quote' }; // replaceable in tests
export const MAX_SYMBOLS = 8;

export default {
  async fetch(ctx) {
    const o = ctx.options;
    const cached = ctx.cache.get('quotes');
    if (cached && Date.now() - cached.at < Math.max(1, o.cache) * 60_000) return cached.data;

    const symbols = o.watchlist.map((s) => String(s).trim().toUpperCase()).filter(Boolean).slice(0, MAX_SYMBOLS);
    const quotes = await Promise.all(symbols.map(async (symbol) => {
      const url = new URL(API.url);
      url.search = new URLSearchParams({ symbol, token: o.apiKey }).toString();
      const res = await ctx.fetch(url, { headers: { accept: 'application/json' } });
      if (!res.ok) throw new Error(`Finnhub answered ${res.status}`);
      const q = await res.json();
      // Finnhub answers 0 for a symbol it does not know
      const known = typeof q.c === 'number' && q.c !== 0;
      return { symbol, price: known ? q.c : null, change: known && typeof q.dp === 'number' ? Math.round(q.dp * 100) / 100 : null };
    }));
    const data = {
      blocks: quotes.map((q) => ({ key: q.symbol, label: q.symbol, value: q.price })),
      quotes,
      color: o.color !== false,
    };
    ctx.cache.set('quotes', { at: Date.now(), data });
    return data;
  },
};
