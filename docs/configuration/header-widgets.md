# Header widgets

`widgets.yaml` holds the widgets in the page's header, above the groups: the date and time,
system resources, a search box, the weather, and so on. Each list item is one widget, with its
type as the key and its options below it. Every type is listed under [Widgets](../widgets/README.md).

```yaml
- datetime:
    dateStyle: full     # full, long, medium, short, none
    timeStyle: short
- resources:
    cpu: true
    memory: true
    disk: ["/", "/mnt/data"]
    cputemp: true       # also uptime, network (true or an interface), expanded, units, diskUnits
- search:
    provider: duckduckgo   # duckduckgo, google, bing, startpage, baidu, brave, custom (+ url: https://x/?q={q})
    showSearchSuggestions: true   # suggestions while typing (google, duckduckgo, bing, baidu, brave; custom needs suggestionUrl)
```

## Widgets without a service

These widgets of the [widgets collection](https://github.com/stefanrenne/homelab-dashboard-widgets)
are not tied to a service. Each widget has its own page with fields and an example under
[Widgets](../widgets/README.md).

| Type | Options |
|---|---|
| `datetime` | `locale`, `dateStyle`, `timeStyle` |
| `greeting` | `text` (required), `text_size` (`xs` … `4xl`) |
| `iframe` | `src` (required; its origin is allowed in the page's CSP), `name`, `height` or homepage's `classes`, `referrerPolicy`, `allowPolicy`, `allowFullscreen`, `loadingStrategy`, `allowScrolling`, `refreshInterval` |
| `logo` | `icon` (optional; the dashboard's own mark without it) |
| `kubernetes` | `cluster` (`show`, `cpu`, `memory`, `showLabel`, `label`), `nodes` (`show`, `cpu`, `memory`, `showLabel`); needs metrics-server and RBAC on nodes |
| `search` | `provider`, `url`, `target`, `filter` (default true: typing filters the services, Enter opens the only match) |
| `resources` | `cpu`, `memory` (both off by default), `disk` (list of mount points), `label` |
| `http-status` | `url` (required), `method` (`HEAD`/`GET`) |
| `ping` | `host` (required; a name, IP or URL) |
| `docker` | `container` (required), `socket` or `url`, `swarm`, `tlsCa`/`tlsCert`/`tlsKey` (secret) |
| `kubernetes-pods` | `namespace`, `app` or `podSelector`, and the connection from kubernetes.yaml (`url`, `token`, `tlsCa`, ...) |
| `proxmoxvm` | `node`, `vmid` (required), `type` (`qemu`/`lxc`), and `url`, `token`, `secret` (secret), `insecure` from proxmox.yaml when left out |
| `custom-api` | `url` (required), `method`, `headers` (secret), `body`, `display` (`block`/`list`), `mappings` (required: `field`, `label`, `format` (`number`/`percent`/`bytes`/`text`), `scale`, `prefix`, `suffix`, `remap: [{ value, to }, { any: true, to }]`) |

The collection also has a widget for the weather (openmeteo, openweathermap), stocks, and every
service homepage supports (radarr, sonarr, Unraid, Portainer, ...).
