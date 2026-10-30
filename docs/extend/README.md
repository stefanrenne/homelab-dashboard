# Extend

Every widget on the dashboard is a package: a folder with a `widget.yaml` and usually a
`server.js`. Even the widgets behind the dashboard's own service fields (`siteMonitor:`,
`container:`, ...) come from the [widgets collection](https://github.com/stefanrenne/homelab-dashboard-widgets)
this way, so anything they do, a widget of yours can do too. Nobody has to merge a pull request
here first.

```
my-widget/
  widget.yaml     the manifest: id, name, apiVersion, options
  server.js       fetch(ctx): asks your service, returns blocks
  client.js       optional: a Web Component for a look of its own
  i18n.json       optional: labels in the dashboard's languages
```

```js
// server.js
export default {
  async fetch(ctx) {
    const res = await ctx.fetch('/api/summary', { headers: { 'X-Api-Key': ctx.options.key } });
    if (!res.ok) throw new Error(`answered ${res.status}`);
    const s = await res.json();
    return { blocks: [{ label: 'queries', value: s.queries }, { label: 'blocked', value: s.blocked }] };
  },
};
```

A widget can live in two places:

| | Where | For |
|---|---|---|
| [A local widget](local.md) | A folder next to your config, `path: ./my-widgets/x` | Something only you need, or trying out a widget while you write it |
| [A remote widget](remote.md) | A git repository or an npm package, `source: git+https://...#v1.0.0` | Sharing it: others install it with one line, pinned to a version |

Both are listed under `plugins:` in [settings.yaml](../configuration/settings.md#plugins).

| Page | What |
|---|---|
| [API reference](api-reference.md) | `widget.yaml`, the `ctx` passed to `server.js`, the result format, `client.js` |
| [Security](security.md) | What a widget can do, how secrets stay on the server, advice for users |
| [Contributing](contributing/README.md) | Working on the dashboard itself |
