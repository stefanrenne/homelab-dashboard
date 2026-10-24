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

A package without `server.js` is client-only (like `datetime` and `search`). A package
without `client.js` is rendered by the dashboard from `blocks`.

## widget.yaml

| Key | Required | Meaning |
|---|---|---|
| `id` | yes | Lowercase letters, digits and dashes, max 63. Used as `type:` in the config and as `hd-<id>` element name. Built-in ids cannot be taken. |
| `name` | yes | Human-readable name. |
| `version` | yes | A string, e.g. `"1.2.0"`. Installed as `plugins/<id>@<version>`. |
| `apiVersion` | yes | The widget API this package targets. Supported: `1`. |
| `description` | no | One line, for docs and catalogues. |
| `refresh` | no | Cache time of a result: `500ms`, `10s`, `5m`, `1h` or seconds. Default `30s`. The browser polls at this rate (minimum 2 s). |
| `options` | no | Map of option name to schema (below). |

### Option schema

| Key | Meaning |
|---|---|
| `type` | `string`, `url` (http/https only), `number`, `boolean`, `list` (a comma string is split), `object`, `enum` |
| `values` | For `enum`: the allowed values. |
| `required` | `true` makes a missing option an error on the card and in the config messages. |
| `default` | Used when the option is missing. |
| `secret` | `true` keeps the option on the server. |

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

### ctx (API 1)

| Field | Meaning |
|---|---|
| `ctx.apiVersion` | `1` |
| `ctx.instanceId` | Stable id of this instance (group + service + position). |
| `ctx.options` | Validated options, secrets included. A copy: changing it has no effect. |
| `ctx.fetch(url, init)` | The standard `fetch`, plus: relative URLs resolve against `options.url`; the call is aborted with the widget; `init.socketPath` sends the request over a unix socket (used for Docker). |
| `ctx.signal` | `AbortSignal`, aborted when the call times out (10 s). |
| `ctx.cache` | A `Map` that survives between calls of this instance (e.g. the previous value for a delta). Cleared when the instance disappears from the config. |
| `ctx.log` | `info`, `warn`, `error`; prefixed with the widget type. |

Only `node:` built-ins can be imported. Bundle any other dependency into the file.

### Result (API 1)

An object; all fields are optional.

| Field | Meaning |
|---|---|
| `status` | `up`, `down`, `warn` or `unknown`. Used when the widget is a service's status check. |
| `latency` | Milliseconds, shown next to the status dot. |
| `statusText` | Text for the status label in the card corner instead of the latency (e.g. `healthy`). Translated when it is a key. |
| `blocks` | List of `{ key?, label, value, unit?, status? }`. `label` is a string, translated through `i18n.json` when it is a key. `value` is a string, number or `null` (shown as –). A string value is translated too when it is a key. `status` is `ok`, `warn`, `error` or `unknown` and colours the value. `key` names the block for `fields` (default: the label). |
| `rows` | List of `{ label, value?, progress? }`, shown below the blocks as label-left/value-right lines (a download queue, current streams, `display: list`). `progress` (0–100) fills the row's background. |
| anything else | Free-form JSON for `client.js`. |

### Keys the dashboard keeps for itself

These keys in a widget entry are read by the dashboard and not passed to the widget, unless the
widget declares an option with the same name:

| Key | Meaning |
|---|---|
| `refreshInterval` | Refresh time of this instance in milliseconds (homepage's name). Minimum 1000. |
| `refresh` | The same as a duration: `5s`, `1h`. |
| `fields` | List of block keys to show, e.g. `[cpu, memoryPercent]`. The widget's order is kept. |
| `hideErrors` / `hide_errors` | `true` hides the error box of this widget. |

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

Theme CSS variables inherit into the shadow root: `--hd-text`, `--hd-muted`, `--hd-accent`,
`--hd-card`, `--hd-border`, `--hd-ok`, `--hd-warn`, `--hd-error`.

The page's Content-Security-Policy allows `connect-src 'self'`: get data through `server.js`, not
from the browser. Images may come from anywhere.

## i18n.json

```json
{ "en": { "queries": "Queries" }, "nl": { "queries": "Verzoeken" } }
```

Languages: `en`, `nl`, `fr`, `de`, `es`. Missing keys fall back to English, then the key itself.

## Changes

| API | Dashboard | Change |
|---|---|---|
| 1 | 0.1.0 | First version. |
