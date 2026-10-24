# Stocks

The current price and the day's change of up to eight stocks, from [Finnhub](https://finnhub.io).
Sign up for a free API key at Finnhub, then put it once in settings.yaml under `providers` and use
`provider: finnhub` (as in homepage), or set `apiKey`. The key stays on the server. Up and down
are shown with ▲ and ▼; `color: false` leaves out the green and red. `cache` keeps the prices for
that many minutes (Finnhub's free tier allows 60 calls a minute, one per symbol).

Learn more about [Finnhub](https://finnhub.io/docs/api/quote).

## Fields

One block per symbol in the watchlist, named after it (`AAPL`)

## Example

```yaml
# settings.yaml
providers:
  finnhub: "{{HD_VAR_FINNHUB_KEY}}"

# widgets.yaml
- stocks:
    provider: finnhub
    color: true
    cache: 1
    watchlist: [AAPL, MSFT, NVDA, BRK.A]
```
