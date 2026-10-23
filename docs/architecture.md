# Architecture

```
            settings.yaml ─┐
            services.yaml ─┤ loadConfig ──► config ──┬─► syncPlugins ──► installed dirs ─┐
  widgets / bookmarks / …  ┘   (+ variables)         │                                   ▼
                                                     │                 loadRegistry (built-in + plugins)
                                                     ├─► Discovery (Docker, K8s) ──┐     │
                                                     ▼                             ▼     ▼
                                              mergeDiscovered ──────────────► buildState
                                                                           │            │
                                                     instances (full options)          layout (public)
                                                                ▼                       ▼
                                                     WidgetRuntime ◄── /api/widgets/:id   /api/layout ──► index.html
```

- **Reload** (`app.reload`): on start, on a YAML change (`fs.watch`, debounced) and on
  `POST /api/plugins/sync`. Reloads are queued, never interleaved. After a reload the server sends
  `event: reload` on `/api/events` (SSE) and open pages fetch the layout again.
- **Discovery** polls on its own interval and calls `rebuild()` only when its result changed.
- **Instances**: each service widget, each status check (`siteMonitor`/`ping`/`container` map to
  the `http-status`/`ping`/`docker` widgets) and each header widget gets a stable id from
  group/service/position. The runtime caches each instance's result for its `refresh`.
- **Layout**: what the browser gets. Public options, resolved icon URLs, per widget type the
  `client.js` URL and the strings for the configured language, and config messages.

## HTTP

| Route | What |
|---|---|
| `GET /` | `public/index.html` |
| `GET /api/layout` | Layout JSON |
| `GET /api/widgets/:instanceId` | `{ ok, data, fetchedAt }` or `{ ok: false, error }` |
| `GET /api/events` | Server-sent events: `reload` |
| `GET /api/health` | `{ ok, version }` (Docker healthcheck) |
| `POST /api/plugins/sync[?update=1]` | Re-sync plugins; needs `X-Requested-With: homelab-dashboard` |
| `GET /widgets/:type/client.js`, `/widgets/:type/assets/*` | Widget browser files |
| `GET /icons/*` | `<config>/icons` |

`HEAD` is answered like `GET`.
