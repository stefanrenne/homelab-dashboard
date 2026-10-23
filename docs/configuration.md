# Configuration

All configuration lives in one folder (`/config` in the container, `--config` or `HD_CONFIG_DIR`
otherwise). Every file is optional. The page reloads by itself when a `.yaml` file changes.
Problems are shown at the top of the page with the file and a path into it. A broken entry is
skipped and the rest keeps working.

| File | What |
|---|---|
| `settings.yaml` | Title, language, theme, layout per group, discovery interval, plugins |
| `services.yaml` | Groups of services |
| `widgets.yaml` | Widgets in the header |
| `bookmarks.yaml` | Groups of links |
| `docker.yaml` | Docker servers (status and discovery) |
| `kubernetes.yaml` | Kubernetes discovery |
| `icons/` | Your own icons, used as `icon: /icons/name.svg` |
| `plugins/` | Managed by the dashboard: downloaded widgets and `plugins.lock.yaml` |

## Variables

Any value can contain `{{HD_VAR_NAME}}` (the environment variable `HD_VAR_NAME`) or
`{{HD_FILE_NAME}}` (the contents of the file whose path is in `HD_FILE_NAME`, e.g. a Docker
secret). Substituted values are treated as secrets: they never reach the browser.

## settings.yaml

```yaml
title: Homelab
language: en        # en, nl, fr, de, es
theme: auto         # auto, dark, light
color: slate        # slate, blue, sky, emerald, green, violet, purple, rose, red, amber, orange, teal, zinc
target: _blank      # default link target of services
background: https://example.com/wallpaper.jpg   # optional
layout:
  Media:
    columns: 3      # cards per row for this group (the group then spans the full width)
discovery:
  interval: 30s
plugins:
  - source: git+https://github.com/someone/hd-widget-x#v1.0.0   # tag, branch or 40-char commit
  - source: npm:hd-widget-y@2.0.1
  - source: git+https://github.com/someone/widgets#v3.0.0
    subdir: widgets/z                                           # a repo with several widgets
  - path: ./my-widgets/w                                        # relative to the config folder
```

## services.yaml

```yaml
- Group name:
    - Service name:
        href: http://app.lan          # link of the card
        icon: app.svg                 # dashboard-icons name (.svg/.png/.webp), /icons/..., or a URL
        description: One line
        target: _self                 # overrides settings.target
        # status check, the first one that is set:
        siteMonitor: http://app.lan   # HTTP check (http-status widget)
        ping: app.lan                 # ICMP ping (ping widget)
        container: app                # Docker container state (docker widget)
        server: local                 # which docker.yaml server; optional with one server
        # widgets:
        widget:
          type: custom-api
          url: http://app.lan/api
          mappings: [{ field: users, label: Users }]
        widgets:                      # or several
          - type: ping
            host: app.lan
```

## widgets.yaml

```yaml
- datetime:
    dateStyle: full     # full, long, medium, short, none
    timeStyle: short
- resources:
    cpu: true
    memory: true
    disk: ["/", "/mnt/data"]
- search:
    provider: duckduckgo   # duckduckgo, google, bing, startpage, custom (+ url: https://x/?q={q})
```

## bookmarks.yaml

```yaml
- Developer:
    - GitHub:
        - abbr: GH
          href: https://github.com
          icon: github.svg
```

The homepage form (a one-item list) and a plain map (`GitHub: { href: ... }`) both work.

## docker.yaml

```yaml
local:
  socket: /var/run/docker.sock
nas:
  host: 192.168.1.20      # a Docker API or docker-socket-proxy
  port: 2375
  protocol: http
  discover: false         # only for container status, do not add its containers
```

## kubernetes.yaml

```yaml
mode: cluster   # or disabled (default)
```

## Built-in widgets

| Type | Options |
|---|---|
| `datetime` | `locale`, `dateStyle`, `timeStyle` |
| `search` | `provider`, `url`, `target` |
| `resources` | `cpu`, `memory`, `disk` (list of mount points) |
| `http-status` | `url` (required), `method` (`HEAD`/`GET`) |
| `ping` | `host` (required) |
| `docker` | `container` (required), `socket` or `url` |
| `custom-api` | `url` (required), `method`, `headers` (secret), `mappings` (required: `field`, `label`, `unit`, `scale`) |

## Migration

Changes to these formats stay backward compatible (hard rule 6). Each renamed or changed key is
listed here with the version, what the old form becomes, and the test that covers it.

_No migrations yet._
