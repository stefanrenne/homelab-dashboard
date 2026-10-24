# Search

A search box. Typing filters the dashboard's services; Enter opens the only match, or searches
the web with the `provider` when nothing matches. Meant for the header in `widgets.yaml`.

For a search engine of your own, set `provider: custom` and a `url` with `{q}` where the
search terms go.

`showSearchSuggestions: true` shows the search engine's suggestions while typing. The dashboard
asks the engine for the page; for `provider: custom` give a `suggestionUrl` that answers in the
OpenSearch format. Brave limits these requests and may answer none.

## Example

```yaml
# widgets.yaml
- search:
    provider: custom
    url: https://search.lan/?q={q}
    target: _self
```
