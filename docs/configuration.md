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
secret). homepage's `{{HOMEPAGE_VAR_*}}` and `{{HOMEPAGE_FILE_*}}` work the same, so an
existing homepage environment can be reused. Substituted values are treated as secrets: they
never reach the browser.

## settings.yaml

```yaml
title: Homelab
language: en        # en, nl, fr, de, es
theme: auto         # auto, dark, light
color: slate        # a Tailwind colour: slate, gray, zinc, neutral, stone, red, orange, amber, yellow, lime,
                    # green, emerald, teal, cyan, sky, blue, indigo, violet, purple, fuchsia, pink, rose
showTitle: true     # false: the title is only the browser tab title (as in homepage)
headerStyle: boxed  # boxed or clean
target: _blank      # default link target of services
background: https://example.com/wallpaper.jpg   # optional
layout:
  Media:
    columns: 3      # cards per row (2 on tablets, 1 on phones); the group spans the full width
    header: false   # hide the group title
    initiallyCollapsed: true   # start folded; viewers fold and unfold groups by clicking the title
  Tools:
    style: column   # default without columns: groups side by side, cards stacked
discovery:
  interval: 30s
plugins:
  - source: git+https://github.com/someone/hd-widget-x#v1.0.0   # tag, branch or 40-char commit
  - source: git+https://github.com/someone/hd-widget-v#latest   # the newest release tag
  - source: npm:hd-widget-y@2.0.1
  - source: git+https://github.com/someone/widgets#v3.0.0
    subdir: widgets/z                                           # a repo with several widgets
  - path: ./my-widgets/w                                        # relative to the config folder
  - source: git+https://github.com/someone/widgets#v1.0.0      # a collection: every widget in it,
    only: [radarr, sonarr]                                      # or only these folders
```

The [widgets collection](https://github.com/stefanrenne/homelab-dashboard-widgets) is always
installed, as `git+https://github.com/stefanrenne/homelab-dashboard-widgets#latest`; the entries
under `plugins:` extend it. To pin it or take only some of its widgets, list that repository
yourself (with a tag, `only:` or `subdir:`): your entry then takes its place. A widget of your
own with the same id as one in the collection (for example a local checkout under `path:`) wins.

`#latest` installs the highest release tag (`v1.2.3` or `1.2.3`; pre-releases such as
`v2.0.0-beta.1` are skipped) and records it in `plugins/plugins.lock.yaml`. A restart keeps
that release; `POST /api/plugins/sync?update=1` (or deleting its entry from the lock file) moves
it to the newest release. A branch named `latest` can no longer be used as `#latest`.

A source without `widget.yaml` at its root is a **collection**: every folder with a
`widget.yaml` directly in it, or in its `widgets/` folder, is installed.

Viewers can pick light, dark or "follow the system" and another colour with the buttons in the
footer; that choice is remembered in their browser and overrides `theme` and `color`.

## services.yaml

```yaml
- Group name:
    - Service name:
        href: http://app.lan          # link of the card
        icon: app.svg                 # dashboard-icons name (.svg/.png/.webp), /icons/..., or a URL
        description: One line
        target: _self                 # overrides settings.target; hidden-iframe: the dashboard
                                      # server calls the URL (a webhook) and shows how it went
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
            refreshInterval: 5000     # dashboard keys, for every widget: refreshInterval (ms) or
            fields: [latency]         # refresh (5s), fields (which blocks), hide_errors
```

Every check that is set gets its own label in the card's top-right corner, as in homepage:
the response time (or "down") for `siteMonitor` and `ping`, the container state for `container`.
Click a container label to see the container's CPU and memory. `ping` also accepts a URL
(`ping: http://192.168.1.2`).

Icons: a dashboard-icons name with or without extension (`plex`, `plex.svg`), `si-<name>`
for Simple Icons, `/icons/<file>` from the config folder, or any URL.

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

Without servers here, a socket mounted at `/var/run/docker.sock` is used as `local`
(see [Discovery](discovery.md)).

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

Each has its own page with fields and an example under
[Built-in widgets](https://stefanrenne.github.io/homelab-dashboard/widgets/built-in/); the
collection's widgets under [Widget collection](https://stefanrenne.github.io/homelab-dashboard/widgets/collection/).

| Type | Options |
|---|---|
| `datetime` | `locale`, `dateStyle`, `timeStyle` |
| `search` | `provider`, `url`, `target`, `filter` (default true: typing filters the services, Enter opens the only match) |
| `resources` | `cpu`, `memory` (both off by default), `disk` (list of mount points), `label` |
| `http-status` | `url` (required), `method` (`HEAD`/`GET`) |
| `ping` | `host` (required; a name, IP or URL) |
| `docker` | `container` (required), `socket` or `url` |
| `custom-api` | `url` (required), `method`, `headers` (secret), `body`, `display` (`block`/`list`), `mappings` (required: `field`, `label`, `format` (`number`/`percent`/`bytes`/`text`), `scale`, `prefix`, `suffix`, `remap: [{ value, to }, { any: true, to }]`) |

Widgets for radarr, sonarr, bazarr, prowlarr, sabnzbd, seerr, stash, tautulli, tdarr, What's
up Docker, Portainer and Unraid are in the separate
[homelab-dashboard-widgets](https://github.com/stefanrenne/homelab-dashboard-widgets) collection.

## Migration

Changes to these formats stay backward compatible (hard rule 6). Each renamed or changed key is
listed here with the version, what the old form becomes, and the test that covers it.

_No migrations yet._
