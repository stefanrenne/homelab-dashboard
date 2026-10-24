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
| other `.yaml` files | Pulled in with `!include` (see [Including other files](#including-other-files)) |
| `icons/` | Your own icons, used as `icon: /icons/name.svg` |
| `custom.css`, `custom.js` | Your own style and script, loaded after the page's own (as in homepage). Refresh the browser after a change |
| `plugins/` | Managed by the dashboard: downloaded widgets and `plugins.lock.yaml`. Older versions and removed sources are deleted after each sync |

## Variables

Any value can contain `{{HD_VAR_NAME}}` (the environment variable `HD_VAR_NAME`) or
`{{HD_FILE_NAME}}` (the contents of the file whose path is in `HD_FILE_NAME`, e.g. a Docker
secret). homepage's `{{HOMEPAGE_VAR_*}}` and `{{HOMEPAGE_FILE_*}}` work the same, so an
existing homepage environment can be reused. Substituted values are treated as secrets: they
never reach the browser.

## Including other files

A long `services.yaml` can be split up. `!include <file>` puts the YAML of another file at that
spot, as if it were written there:

```yaml
# services.yaml
- Infrastructure:
    - Router:
        href: http://router.lan
- Media: !include services/media.yaml      # the services of one group
- !include services/home-automation.yaml   # whole groups
```

```yaml
# services/media.yaml: what would otherwise follow "- Media:"
- Plex:
    href: http://plex.lan:32400
    icon: plex
- Radarr: !include radarr.yaml             # relative to this file: services/radarr.yaml
```

```yaml
# services/home-automation.yaml: one or more groups, as in services.yaml
- Home automation:
    - Home Assistant:
        href: http://homeassistant.lan:8123
- Cameras: []
```

The rules:

- **Where**: as the value of a key (`- Media: !include ...`, `widget: !include ...`), as an item
  in a list, or as a whole file. It works in every config file, also `widgets.yaml` and
  `bookmarks.yaml`.
- **Lists are joined**: an include that is a list item and whose file holds a list adds those
  items in its place. That is how `- !include services/home-automation.yaml` adds two groups. A
  file that holds a map (one service, one widget) is added as one item.
- **Paths** are relative to the file with the `!include`, use `/`, and must stay inside the config
  folder. Only `.yaml` and `.yml` files can be included. Keep included files out of `plugins/`.
- **Nesting**: an included file can include others, up to 8 levels deep. A file that ends up
  including itself is reported.
- **Variables and secrets**: `{{HD_VAR_*}}` and `{{HD_FILE_*}}` work in included files, and
  their values stay secret, as in the main files.
- **Reloading**: saving an included file reloads the page, also in a subfolder.
- **Problems** never stop the dashboard. A missing file, a path outside the config folder, a
  YAML error or a loop is shown with the file and path of the `!include`
  (`services.yaml › [1].Media: !include services/media.yaml: file not found`); that spot stays
  empty and the rest works. A mistake *inside* the included services is shown with the path
  in the file that includes it.

Files are only read where an `!include` names them: a `media.yaml` next to `services.yaml` does
nothing by itself. `!include` is this dashboard's own; homepage does not read it.

## settings.yaml

```yaml
title: Homelab
description: The start page of my homelab   # meta description, for link previews and search engines
favicon: /icons/lab.svg   # a URL, a dashboard-icons name (proxmox.svg) or a file in config/icons
startUrl: /               # where the installed app opens
pwa:                      # installing the dashboard as an app (site.webmanifest)
  icons:                  # without icons, the favicon is the app icon
    - { src: /icons/app-192.png, sizes: 192x192, type: image/png }
    - { src: /icons/app-512.png, sizes: 512x512, type: image/png }
  shortcuts:              # long-press menu of the app icon
    - { name: Media, url: "/#media", description: The media group }
language: en        # en, nl, fr, de, es, ca, he, hr, hu, it, nb-NO, pt, ru, sv, vi, zh-Hans, zh-Hant (zh-CN works too)
theme: auto         # auto, dark, light
color: slate        # a Tailwind colour: slate, gray, zinc, neutral, stone, red, orange, amber, yellow, lime,
                    # green, emerald, teal, cyan, sky, blue, indigo, violet, purple, fuchsia, pink, rose
showTitle: true     # false: the title is only the browser tab title (as in homepage)
headerStyle: boxed  # boxed, clean, underlined (a line under the header) or boxedWidgets (a box per widget)
cardStyle: hairline # a thin border instead of the shadow
blockStyle: refined # heavier, larger values in widget blocks
font: plexData      # IBM Plex Mono for values, the clock and status labels; plex: for everything
quicklaunch:        # start typing anywhere on the page to find a service, bookmark or web search
  searchDescriptions: true    # also match descriptions (name matches come first)
  provider: duckduckgo        # google, duckduckgo, bing, baidu, brave, startpage or custom (+ url);
                              # default: the search widget's provider; none: no web search
  # url: https://search.lan/?q=   # for custom: the query is appended, or put where {q} is
  target: _blank              # where the web search opens
  showSearchSuggestions: true # suggestions from the search engine (default: the search widget's setting)
  # suggestionUrl: https://ac.search.lan/?q=   # for custom: an OpenSearch suggestion URL
  hideInternetSearch: false   # true: no web search entry
  hideVisitURL: false         # true: no "open <url>" entry for typed addresses
  mobileButtonPosition: bottom-right   # a search button on phones: top-left, top-right, bottom-left, bottom-right
providers:          # shared keys and logins; a widget entry uses one with provider: <name>
  openweathermap: "{{HD_VAR_OWM_KEY}}"   # a text fills the widget's first secret option left empty (its key)
  longhorn:                               # a map fills the options it names
    url: https://longhorn.lan
    username: admin
    password: "{{HD_VAR_LONGHORN_PASSWORD}}"
instanceName: internal   # for discovery labels meant for one dashboard (homelab.instance.internal.href)
hideVersion: false  # show the version in the footer (hidden by default, unlike homepage)
disableUpdateCheck: true   # with the version shown: do not ask GitHub once a day for a newer release
disableIndexing: true      # ask search engines not to index the page (robots.txt and a robots meta tag)
base: https://lab.example.com/dashboard/   # behind a reverse proxy under a sub path: the page's address
logpath: /config    # also log to <logpath>/logs/homelab-dashboard.log, rotated at 10 MiB, five files kept;
                    # without it the log goes to stdout only. LOG_TARGETS (env): both, stdout or file
showStats: true     # container stats open from the start instead of on a click; a service can set its own
statusStyle: dot    # status labels: dot (a coloured dot) or basic (Online/Offline for siteMonitor and ping);
                    # default: the response time and container state. A service can set its own.
target: _blank      # default link target of services
background: https://example.com/wallpaper.jpg   # optional; or a map, as in homepage:
# background:
#   image: https://example.com/wallpaper.jpg
#   blur: sm          # xs, sm, md, lg, xl, 2xl, 3xl
#   saturate: 50      # 0-200 (%)
#   brightness: 75    # 0-200 (%)
#   opacity: 50       # 0-100 (%)
cardBlur: md        # frosted cards over the background: xs, sm, md, lg, xl, 2xl, 3xl
bookmarksStyle: icons   # every bookmark group as icons only (a group can set iconsOnly: false)
iconStyle: gradient # mdi- and si- icons: gradient (default) or theme (flat, in the theme colour)
fullWidth: true     # use the whole window width (default: at most 1280px)
maxGroupColumns: 6  # groups side by side on wide screens (1536px and up), up to 8
maxBookmarkGroupColumns: 8   # the same for bookmark groups
useEqualHeights: true        # cards in a row equally high; a group can override it
disableCollapse: true        # group titles are plain titles, not fold buttons
groupsInitiallyCollapsed: true   # every group starts folded; a group's initiallyCollapsed wins
layout:
  Media:
    columns: 3      # cards per row (2 on tablets, 1 on phones); the group spans the full width
    header: false   # hide the group title
    initiallyCollapsed: true   # start folded; viewers fold and unfold groups by clicking the title
    icon: plex.svg  # category icon before the title: an icon name, /icons/..., or a URL
    useEqualHeights: false   # overrides the global setting for this group
  Developer:        # a bookmark group
    iconsOnly: true # only the icons, the name as tooltip
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
it to the newest release. The folder of the previous version is then deleted. An update that
fails (offline, a broken release) keeps the version that worked and says so in the messages. A branch named `latest` can no longer be used as `#latest`.

A source without `widget.yaml` at its root is a **collection**: every folder with a
`widget.yaml` directly in it, or in its `widgets/` folder, is installed.

**Order**, as in homepage: groups appear in the order of the `layout` block, discovered
groups too; groups that are not in it follow, in their own order. Service and bookmark groups
can be mixed: a bookmark group listed between service groups is shown there. The `layout`
block can also be a list, which reads more naturally when it is only about the order:

```yaml
layout:
  - Media:
  - Developer:        # a bookmark group, shown between Media and Infrastructure
  - Infrastructure:
      style: row
```

**Tabs**, as in homepage: give layout groups a `tab` and the page shows a tab bar. Tabs come
in the order of the `layout` block. Service and bookmark groups without a `tab` show on every
tab. Each tab has its own address: `#` plus its name in lowercase (`http://dashboard.lan/#media`).

```yaml
layout:
  Infrastructure:
    tab: Home
  Developer:          # a bookmark group
    tab: Home
  Media:
    tab: Media
  Tools:              # no tab: on every tab
    style: row
```

Viewers can pick light, dark or "follow the system" and another colour with the buttons in the
footer; that choice is remembered in their browser and overrides `theme` and `color`.

## services.yaml

```yaml
- Group name:
    - Service name:
        href: http://app.lan          # link of the card
        icon: app.svg                 # dashboard-icons name (.svg/.png/.webp), /icons/..., or a URL
        description: One line
        statusStyle: dot              # overrides settings.statusStyle for this service
        showStats: true               # overrides settings.showStats for this service
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

**Nested groups**, as in homepage: an entry whose value is a list (instead of a map) is a group
inside the group. Its layout goes inside the parent's layout in settings.yaml, and it is on the
parent's tab.

```yaml
# services.yaml
- Infrastructure:
    - Router:
        href: http://router.lan
    - Network:                  # a nested group
        - Access point:
            href: http://ap.lan
        - Switch:
            href: http://switch.lan
```

```yaml
# settings.yaml
layout:
  Infrastructure:
    style: row
    Network:                    # the nested group's layout
      columns: 2
```

**Block highlighting**, as in homepage: `highlight:` on a widget entry colours blocks by their
value. Keys are block keys (the names `fields:` uses). The first matching rule wins; numeric
rules are tried before string rules.

```yaml
widget:
  type: sonarr
  url: http://sonarr.lan:8989
  key: "{{HD_VAR_SONARR_KEY}}"
  highlight:
    queued:
      valueOnly: true                # colour the value only, not the whole block
      numeric:
        - { level: danger, when: gte, value: 20 }
        - { level: warn, when: between, min: 5, max: 19 }
        - { level: good, when: eq, value: 0 }
    status:
      string:
        - { level: danger, when: regex, value: "(failed|import) pending" }
```

Numeric `when`: `gt`, `gte`, `lt`, `lte`, `eq`, `ne` (with `value`), `between` and `outside`
(with `min` and/or `max`); numbers are read from formatted values such as `1,234 GB`. String
`when`: `equals`, `includes`, `startsWith`, `endsWith` (case-insensitive unless
`caseSensitive: true`) and `regex` (`flags`, default `i`). Every rule takes `negate: true`.
The colours per level can be changed in settings.yaml with homepage's Tailwind classes; colours
outside the dashboard's palettes are ignored:

```yaml
blockHighlights:
  levels:
    good: "bg-emerald-500/40 text-emerald-950 dark:bg-emerald-900/60 dark:text-emerald-400"
    warn: "bg-amber-300/30 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200"
    danger: "bg-rose-700/45 text-rose-200 dark:bg-rose-950/70 dark:text-rose-400"
```

Every check that is set gets its own label in the card's top-right corner, as in homepage:
the response time (or "down") for `siteMonitor` and `ping`, the container state for `container`.
Click a container label to see the container's CPU and memory. `ping` also accepts a URL
(`ping: http://192.168.1.2`).

Icons, as in homepage:

| Form | Source |
|---|---|
| `plex`, `plex.svg`, `plex.webp` | [dashboard-icons](https://github.com/homarr-labs/dashboard-icons) (png without an extension) |
| `mdi-flask-outline` | [Material Design Icons](https://pictogrammers.com/library/mdi/) |
| `si-plex` | [Simple Icons](https://simpleicons.org) |
| `sh-plex`, `sh-plex.svg` | [selfh.st icons](https://selfh.st/icons/) (png without an extension) |
| `/icons/<file>` | the `icons` folder in your config |
| `https://...` | any URL |

`mdi-` and `si-` icons are single-coloured: they follow `iconStyle` (`gradient`, the default, or
`theme` in settings.yaml), or take their own colour as a suffix: `mdi-flask-outline-#f0d453`.

## widgets.yaml

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

The Docker servers, for `container:` status labels and for [discovery](discovery.md) of
labelled containers. Each top-level key is a name you choose (`local`, `green`, `nas`, ...):

```yaml
green:
  socket: /var/run/docker.sock   # the socket as mounted in the dashboard's container
nas:
  host: 192.168.1.20             # a Docker API or docker-socket-proxy
  port: 2375
  protocol: http
  discover: false                # only for container status, do not add its containers
```

| Key | Default | What |
|---|---|---|
| `socket` | | Path of a Docker socket inside the container. Mount it: `/var/run/docker.sock:/var/run/docker.sock:ro` |
| `host` | | Host name or IP of a Docker API or socket proxy (instead of `socket`) |
| `port` | `2375` | Port of that API |
| `protocol` | `http` | `http` or `https` |
| `discover` | `true` | `false`: use the server for `container:` status only, without adding its containers |

The name is what `server:` refers to in `services.yaml`, and what config messages show.

- **No servers here** (no file, or only comments): a socket mounted at `/var/run/docker.sock`
  is used as the server `local` by itself. For a single Docker host on the same machine,
  mounting the socket is all it takes.
- **One or more servers here**: only those are used. To use the mounted socket next to another
  server, list it too, as `green` above.
- **One server**: services with `container:` use it; `server:` is optional.
  **Several servers**: give such services `server: <name>`. Discovered containers always
  carry the server they were found on.

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
| `greeting` | `text` (required), `text_size` (`xs` … `4xl`) |
| `logo` | `icon` (optional; the dashboard's own mark without it) |
| `openmeteo` | `latitude`, `longitude` (required), `label`, `timezone`, `units` (`metric`/`imperial`), `cache` (minutes), `format` |
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
