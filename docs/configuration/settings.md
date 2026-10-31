# Settings

`settings.yaml` holds everything about the page itself: title, language, look, the order and
layout of the groups, and the widget packages to install. Every key is optional.

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
hideVersion: true   # hide the versions in the footer (shown by default, as in homepage):
                    # `core v0.7.3 | widgets v0.4.1`, each linking to its release or commit
pluginUpdateInterval: 1h   # how often #latest and branch plugins are checked for a newer version (false: never)
disableUpdateCheck: true   # do not ask GitHub once a day for a newer release (only asked while the version is shown)
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

## Plugins

The [widgets collection](https://github.com/stefanrenne/homelab-dashboard-widgets) is always
installed, as `git+https://github.com/stefanrenne/homelab-dashboard-widgets#latest`; the entries
under `plugins:` extend it. To pin it or take only some of its widgets, list that repository
yourself (with a tag, `only:` or `subdir:`): your entry then takes its place. A widget of your
own with the same id as one in the collection (for example a local checkout under `path:`) wins.

Every widget comes from the collection, also the ones behind a service's `siteMonitor:`
(`http-status`), `ping:` (`ping`), `container:` (`docker`), `app:` (`kubernetes-pods`) and
`proxmoxNode:` (`proxmoxvm`). An `only:` list for the collection always gets those five added,
so the service fields keep working. An entry pinned to a release too old for them says so in
the messages. The first start downloads the collection, so it needs
network access once; after that the lock file keeps it without network.

`#latest` installs the highest release tag (`v1.2.3` or `1.2.3`; pre-releases such as
`v2.0.0-beta.1` are skipped) and records it in `plugins/plugins.lock.yaml`. A restart keeps
that release; `POST /api/plugins/sync?update=1` (or deleting its entry from the lock file) moves
it to the newest release. The folder of the previous version is then deleted. An update that
fails (offline, a broken release) keeps the version that worked and says so in the messages. A branch named `latest` can no longer be used as `#latest`.
The widgets collection is the exception: when its `#latest` is locked at a release older than
the one this dashboard needs (0.4.0 for 0.6), the next start moves it to the newest release by itself.

`pluginUpdateInterval` (default `1h`, at least `1m`, `false` turns it off) is how often the
sources that can move (`#latest`, a branch) are asked for a newer version: one `git ls-remote`
each, nothing is downloaded. Only a newer version is installed, which reloads the open pages;
pinned tags and commits are never asked. `plugins.lock.yaml` then records the new version.
The widgets collection is the exception: when its `#latest` is locked at a release older than
the one this dashboard needs (0.4.0 for 0.6), the next start moves it to the newest release by itself.

A source without `widget.yaml` at its root is a **collection**: every folder with a
`widget.yaml` directly in it, or in its `widgets/` folder, is installed.

## Layout

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

To write a widget package of your own, see [Extend](../extend/README.md).
