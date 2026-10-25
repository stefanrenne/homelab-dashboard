# Widget API reference

This is the contract between the dashboard and widget packages (hard rule 2 in CLAUDE.md).
Current widget API: **1**. Every addition is listed with the version that introduced it.

## Package layout

```
my-widget/
  widget.yaml   required   manifest
  server.js     optional   data on the server
  client.js     optional   custom rendering in the browser
  i18n.json     optional   translations
  assets/       optional   static files for client.js, served at /widgets/<id>/assets/...
  package.json  optional   only for npm publishing; must contain "type": "module"
```

Load assets relative to your module, not from an absolute path, so the widget also works when
the dashboard runs under a sub path (`base` in settings.yaml):
`new URL('./assets/icon.svg', import.meta.url)`.

A package without `server.js` is client-only (like `datetime` and `search`). A package
without `client.js` is rendered by the dashboard from `blocks`.

## widget.yaml

| Key | Required | Meaning |
|---|---|---|
| `id` | yes | Lowercase letters, digits and dashes, max 63. Used as `type:` in the config and as `hd-<id>` element name. |
| `name` | yes | Human-readable name. |
| `version` | yes | A string, e.g. `"1.2.0"`. Installed as `plugins/<id>@<version>`. |
| `apiVersion` | yes | The widget API this package targets. Supported: `1`. |
| `description` | no | One line, for docs and catalogues. |
| `refresh` | no | Cache time of a result: `500ms`, `10s`, `5m`, `1h` or seconds. Default `30s`. The browser polls at this rate (minimum 2 s). |
| `options` | no | Map of option name to schema (below). |
| `aliases` | no | Other names the widget answers to in `type:`, e.g. homepage's (`[customapi]`). Added after every real id, only where still free; the widget's `id` stays the one the page uses. |
| `defaultFields` | no | Block keys shown when the entry has no `fields`, e.g. `[cpu, memoryPercent]`. Without it every block shows. |
| `frames` | no | `url` options whose page the `client.js` shows in an `<iframe>`, e.g. `[src]`. The page's CSP allows the origin of each one's value (`frame-src`); only public options count, so a URL from a variable or a secret option is never framed. |
| `params` | no | Names a `client.js` may send its `server.js` through the `hd-widget-params` page event, e.g. `[latitude, longitude]`. They reach `ctx.params`; anything else is dropped. |

### Option schema

| Key | Meaning |
|---|---|
| `type` | `string` (a number or boolean becomes text), `url` (http/https only), `number`, `boolean`, `list` (a comma string is split), `object`, `enum`, `icon` (see below) |
| `values` | For `enum`: the allowed values. |
| `required` | `true` makes a missing option an error on the card and in the config messages. |
| `default` | Used when the option is missing. |
| `secret` | `true` keeps the option on the server. |

An `icon` option takes what a service's `icon:` takes (`plex.svg`, `mdi-home`, `si-ubuntu`,
`sh-plex`, `/icons/x.png`, a URL) and reaches the widget as a URL. A single-colour icon (`mdi-`,
`si-`) ends in `#hd-mask`, or `#hd-mask=<hex>` with its colour: draw it as a CSS mask over the
URL before the `#`, filled with that colour or a theme colour. An unknown name is an error.

**What reaches the browser:** only options that are declared, not `secret`, and not filled in
from a variable or file. Undeclared options are passed to `server.js` but never to the browser.

## server.js

```js
export default {
  async fetch(ctx) {
    return { blocks: [{ label: 'queries', value: 1234 }] };
  },
};
```

`fetch(ctx)` is called at most once per `refresh` per widget instance. Concurrent browser requests share one call.

Widgets run in a worker thread, apart from the dashboard: one
worker for all of them, with a memory limit. `ctx` is the same; what `fetch` returns must be plain
data (it is copied out of the worker), and module-level state is the worker's. A widget that does
not stop within a second after its timeout gets the worker restarted.

### ctx (API 1)

| Field | Meaning |
|---|---|
| `ctx.apiVersion` | `1` |
| `ctx.instanceId` | Stable id of this instance (group + service + position). |
| `ctx.options` | Validated options, secrets included. A copy: changing it has no effect. |
| `ctx.fetch(url, init)` | The standard `fetch`, plus: relative URLs resolve against `options.url`; the call is aborted with the widget; `init.socketPath` sends the request over a unix socket (used for Docker); `init.insecure: true` accepts a self-signed certificate for that request (only behind an option the user sets, off by default); `init.tls: { ca, cert, key }` (PEM text) trusts that CA and sends that client certificate, as for a Docker daemon with `--tlsverify`. `res.headers.getSetCookie()` lists every cookie. |
| `ctx.params` | What the page sent through `hd-widget-params`: only names in widget.yaml `params`, each a non-empty string of at most 100 characters; `{}` when nothing was sent. Comes from the browser, so treat it as untrusted input (validate, never put it in a URL path unchecked). Each set of params has its own cached result. |
| `ctx.signal` | `AbortSignal`, aborted when the call times out (10 s). |
| `ctx.cache` | A `Map` that survives between calls of this instance (e.g. the previous value for a delta). Cleared when the instance disappears from the config, and when the widget worker restarts (see below). |
| `ctx.log` | `info`, `warn`, `error`; prefixed with the widget type. |

Only `node:` built-ins can be imported. Bundle any other dependency into the file.

### Result (API 1)

An object; all fields are optional.

| Field | Meaning |
|---|---|
| `status` | `up`, `down`, `warn` or `unknown`. Used when the widget is a service's status check. |
| `latency` | Milliseconds, shown next to the status dot. |
| `statusText` | Text for the status label in the card corner instead of the latency (e.g. `healthy`). Translated when it is a key. |
| `blocks` | List of `{ key?, label, vars?, value, unit?, status? }`. `label` is a string, translated through `i18n.json` when it is a key; `vars` fill `{name}` placeholders in that translation (`{ label: 'poolUsed', vars: { pool: 'Trunk' } }` with `"poolUsed": "{pool} used"`). `value` is a string, number or `null` (shown as –). A string value is translated too when it is a key. `status` is `ok`, `warn`, `error` or `unknown`: warn and error get a colour and a shape (▲, ✕) and are announced to screen readers. `key` names the block for `fields` (default: the label). |
| `rows` | List of `{ label, vars?, value?, status?, icon?, progress? }`, shown below the blocks as label-left/value-right lines (a download queue, current streams, `display: list`). `status` marks a row like a block. `icon` (`play` or `pause`) is drawn before the label and spoken as a word. `progress` (0–100) fills the row's background. A row whose text does not fit opens on click, Enter or Space. A row labelled `moreItems` with `vars: { count }` closes a shortened list ("+3 more"). |

### Writing labels

Labels sit in blocks of about 65px on a phone when a card has four of them. Keep every
translation short: whole words (no abbreviations), at most two lines; the dashboard wraps and
hyphenates in the page language, and never cuts a label off. Show amounts in decimal units
(kB, MB, GB) and durations as `m:ss` or `h:mm:ss`. Mark counts that need someone's attention
(failures, pending requests, updates) with `status: 'warn'`.
| anything else | Free-form JSON for `client.js`. |

### Keys the dashboard keeps for itself

These keys in a widget entry are read by the dashboard and not passed to the widget, unless the
widget declares an option with the same name:

| Key | Meaning |
|---|---|
| `refreshInterval` | Refresh time of this instance in milliseconds (homepage's name). Minimum 1000. |
| `refresh` | The same as a duration: `5s`, `1h`. A bare number of 1000 or more is milliseconds (homepage's `refresh: 3000`); a smaller one is seconds. |
| `fields` | List of block keys to show, e.g. `[cpu, memoryPercent]`. The widget's order is kept. |
| `hideErrors` / `hide_errors` | `true` hides the error box of this widget. |
| `provider` | Fills options the entry leaves out from `settings.yaml` `providers.<name>`: a map fills the options it names, a text the first unset `secret: true` option. Every provider value is treated as a secret. A widget that declares its own `provider` option keeps it. |
| `highlight` | Colours blocks by their value, as in homepage: block `key` (or `<type>.<key>`) → `numeric` / `string` rules with a `level` (`good`, `warn`, `danger`). The dashboard adds the result to the block as `highlight: { level, valueOnly }`; `client.js` sees it in `data.blocks` and may use or ignore it. See [Configuration](../configuration.md). |

**References to another service** (homepage's calendar integrations): an object anywhere in a
widget's options (up to three levels deep) with `service_group` and `service_name` gets that
service's widget options (with `type`, the widget of that type) under its own keys, on the
server. Declare the option `secret: true` (or leave it undeclared): the merged options can hold
keys. An unknown service is a config message.

A thrown error (or a timeout) shows its message on the card. Secret values in it are replaced by `***`.

## client.js

A JavaScript module that defines a custom element named `hd-<id>`:

```js
class MyWidget extends HTMLElement {
  connectedCallback() { this.attachShadow({ mode: 'open' }); this.render(); }
  set data(v) { this._data = v; this.render(); }
  render() { /* ... */ }
}
customElements.define('hd-my-widget', MyWidget);
```

The dashboard sets these properties before the element is connected, and `data` and `error`
again after every refresh:

| Property | Meaning |
|---|---|
| `options` | Public options only. |
| `t(key)` | Translation from `i18n.json` for the dashboard language, falling back to English, then the key. |
| `data` | What `server.js` returned, or `null` (before the first result, or for a client-only widget). |
| `error` | Error message of the last refresh, or `null`. |
| `instanceId` | The id of this widget instance (for `api/suggest`). |

Theme CSS variables inherit into the shadow root: `--hd-text`, `--hd-muted`, `--hd-accent`,
`--hd-card`, `--hd-border`, `--hd-ok`, `--hd-warn`, `--hd-error`.

The page's Content-Security-Policy allows `connect-src 'self'`: get data through `server.js`, not
from the browser. Images may come from anywhere.

## Page events

A `client.js` may talk to the dashboard through DOM events that bubble out of its shadow root
(`bubbles: true, composed: true`):

| Event | `detail` | What the dashboard does |
|---|---|---|
| `hd-search-input` | `{ query }` | Shows only the services and bookmarks that match every word; empty shows all. |
| `hd-search-submit` | `{ query }` | Send it `cancelable: true`. With exactly one match the dashboard opens it and cancels the event; otherwise the widget may search elsewhere. |
| `hd-widget-params` | `{ name: value, ... }` | Fetches the widget again with these values (text) for `server.js`, and keeps sending them on every refresh. Only the names in widget.yaml `params` arrive. |

The collection's `search` widget uses the first two. The weather widgets of the
[collection](https://github.com/stefanrenne/homelab-dashboard-widgets) send `hd-widget-params`
with the viewer's location (`navigator.geolocation`, HTTPS only, rounded to two decimals) when
their options have no coordinates.

## Dashboard endpoints for client.js

| Request | Answer |
|---|---|
| `GET api/suggest?instance=<instanceId>&q=<text>` | `{ suggestions: [...] }`: search suggestions for this instance, when its options have `showSearchSuggestions: true` and a `provider` (google, duckduckgo, bing, baidu, brave) or `provider: custom` with a `suggestionUrl`. The server asks the search engine; the URL never comes from the request. Empty on any problem. |

Use relative URLs (`api/...`), so the widget also works under a sub path.

## i18n.json

```json
{ "en": { "queries": "Queries" }, "nl": { "queries": "Verzoeken" } }
```

Languages: `en`, `nl`, `fr`, `de`, `es`. Missing keys fall back to English, then the key itself.

## Changes

| API | Dashboard | Change |
|---|---|---|
| 1 | 0.1.0 | First version (including `vars`, row `status` and `defaultFields`). |
| 1 | next | Blocks can carry `highlight: { level, valueOnly }`, added by the dashboard from the entry's `highlight:` rules. Widgets need no change. |
| 1 | next | `provider: <name>` in an entry fills options from `settings.yaml` `providers`. Widgets need no change. |
| 1 | next | `client.js` gets `instanceId`; `GET api/suggest` for search suggestions. |
| 1 | next | Option type `icon`; `string` options accept numbers and booleans. |
| 1 | next | `aliases` in widget.yaml. |
| 1 | next | `ctx.fetch(url, { insecure: true })` for self-signed certificates. |
| 1 | next | `ctx.fetch(url, { tls: { ca, cert, key } })` for a CA and client certificate. |
| 1 | next | Options with `service_group` and `service_name` get the referenced widget's options. |
| 1 | next | `params` in widget.yaml, the `hd-widget-params` page event and `ctx.params`. |
| 1 | next | `frames` in widget.yaml: the page may frame the origin of these options. |
| 1 | next | Installed widgets run in a worker thread; their result must be plain data. Widgets that return plain data need no change. |
