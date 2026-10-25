# Changelog

All user-visible changes. The format follows [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

## [0.10.2] - 2026-10-25

### Changed
- A status label shows a small spinner until its first result, instead of a dot.

## [0.10.1] - 2026-10-25

### Fixed
- After a plugin update, widgets briefly failed with "Cannot find module" because the old
  version's folder was removed before the new one was live. It is removed afterwards now.
- A container recreated with its old environment copied over (Portainer's Recreate) reported the
  old version. The image now keeps its version in a file, which wins over `HD_VERSION`.

## [0.10.0] - 2026-10-25

### Changed
- The action result dialog: a × in the corner instead of a Close button, and a copy icon in the
  corner of the output that shows on hover (always on touch screens).

### Added
- Widget API: `showResult: 'failure'` in `hd-widget-action` shows the dialog only when the action
  failed (and no running toast), and the element gets `actionResult` with how it went. The
  collection's `button` uses it for a spinner and a check.

## [0.9.0] - 2026-10-25

### Added
- `HD_ALLOW_ROOT_SCRIPTS=true` lets a `button` widget with `user: root` (widgets collection
  0.6.0) run its script as root in the container, for files that must stay owned by root. Off by
  default; the image gets sudo and a fixed runner (`/usr/local/bin/hd-root`) for it.

## [0.8.1] - 2026-10-25

### Added
- A "Copy output" button in the result dialog of a widget action (the button widget's script
  output), in every language; it says "Copied" when it worked.

## [0.8.0] - 2026-10-25

Pairs with the widgets collection 0.5.0, which has the `button` widget.

### Added
- Widget actions (widget API 1): a widget's server.js may have `action(ctx)` next to `fetch`,
  started when its client.js sends `hd-widget-action` (a button press). The page shows the result
  in a dialog with the status, exit code and output; one run at a time per widget, secrets
  scrubbed from the output. `ctx.configDir` gives widgets the config folder.
- The image has bash, curl, jq, docker-cli and docker compose, for the scripts the collection's
  `button` widget runs, so a separate webhook container is no longer needed.

## [0.7.3] - 2026-10-25

### Changed
- The footer reads `core v0.7.3 | widgets v0.4.1`: the widgets collection is called "widgets",
  and each version links to its GitHub release or commit (an npm plugin to its npm page). A
  plugin from elsewhere, or from a URL with credentials, gets no link.

## [0.7.2] - 2026-10-25

### Changed
- The version (and each plugin's) is shown in the footer by default, as in homepage;
  `hideVersion: true` hides it. With the version shown the dashboard asks GitHub once a day for
  a newer release; `disableUpdateCheck: true` turns that off.
- The image of a release commit names itself after the release (`0.7.2`), also as `latest`,
  instead of `main-<sha>`.

## [0.7.1] - 2026-10-25

### Changed
- A container, VM or pod label opens its stats above the card's widgets instead of below, without
  the state block (the label shows it), as in homepage. With the widgets collection 0.4.1 a
  container shows RX and TX too.

## [0.7.0] - 2026-10-25

### Added
- `pluginUpdateInterval` in settings.yaml (default `1h`, `false` turns it off): plugins on
  `#latest` or a branch, such as the widgets collection, are checked for a newer version and
  updated when there is one. Before, a `#latest` stayed at the release it was installed with.

## [0.6.2] - 2026-10-25

### Fixed
- An installation that had the widgets collection locked at 0.3.0 kept it after the update, so
  the service fields lost their widgets (`unknown widget type "docker"`). The collection's
  `#latest` now moves on by itself when it is locked below the release the dashboard needs.
- `plugins:` with every entry commented out is an empty list again, not "expected a list".

## [0.6.1] - 2026-10-25

### Fixed
- A plugin folder that cannot be removed (written by another user, for example by an earlier run
  as root) no longer stops the dashboard from loading: it is a warning to delete it by hand. The
  image's entrypoint, started as root, gives `/config/plugins` to the `node` user first.
- When the first load fails, pages answer 503 with a hint to the log instead of an error per
  request.

## [0.6.0] - 2026-10-25

Needs the widgets collection 0.4.0 (installed by default at its newest release), which now holds
every widget, also the ones that were built in.

### Added
- `hideVersion: false` also shows the installed plugins in the footer, each with its version:
  the widgets collection's release (`homelab-dashboard-widgets v0.4.0`), an npm version, a short
  commit for a branch. Only names and versions, never a source URL.

### Changed
- The built-in widgets (`datetime`, `greeting`, `logo`, `search`, `resources`, `iframe`,
  `custom-api`, `kubernetes`, and `http-status`, `ping`, `docker`, `kubernetes-pods`, `proxmoxvm`
  behind `siteMonitor:`, `ping:`, `container:`, `app:` and `proxmoxNode:`) moved to the widgets
  collection, with the same types and options. They now run in the widget worker thread. The first
  start downloads the collection, so it needs network access once.
- An `only:` list for the widgets collection in `settings.yaml` always keeps the five widgets
  behind the service fields.
- A service field whose widget is missing says it comes with the widgets collection.

## [0.5.0] - 2026-10-25

Needs the widgets collection 0.3.0 (installed by default at its newest release), which now holds
openmeteo, openweathermap and stocks and a widget for every service homepage supports.

### Added
- `description` and `favicon` in settings.yaml, as in homepage: the meta description and the
  browser tab icon, written into the page itself.
- `startUrl` and `pwa` (`icons`, `shortcuts`), as in homepage: a web app manifest at
  `/site.webmanifest`, so the dashboard installs as an app with its palette's colour.
- `background` as a map (`image`, `blur`, `saturate`, `brightness`, `opacity`) and `cardBlur`,
  as in homepage. `background: <url>` keeps working.
- Tabs: `layout.<group>.tab` for service and bookmark groups, as in homepage, with a tab bar and
  an address per tab (`#media`). Groups without a tab show on every tab.
- Nested groups in services.yaml (an entry whose value is a list), as in homepage, with their
  layout inside the parent's layout.
- Bookmarks as icons only (`layout.<group>.iconsOnly`, `bookmarksStyle: icons`) and category
  icons before group titles (`layout.<group>.icon`), as in homepage.
- Icons: `mdi-…` (Material Design Icons) and `sh-…` (selfh.st), a colour suffix for `mdi-`
  and `si-` icons (`mdi-flask-#f0d453`), and `iconStyle: gradient|theme`, as in homepage.
- `fullWidth`, `maxGroupColumns`, `maxBookmarkGroupColumns`, `useEqualHeights` (global and per
  group), `disableCollapse` and `groupsInitiallyCollapsed`, as in homepage.
- Groups follow the order of the `layout` block (which may also be a list), with bookmark
  groups placed between service groups where the block lists them, as in homepage.
- `headerStyle: underlined` and `boxedWidgets`, `cardStyle: hairline`, `blockStyle: refined` and
  `font: plex` / `plexData` (IBM Plex Mono), as in homepage.
- `statusStyle: dot|basic` for the status labels, in settings.yaml and per service, as in homepage.
- Block highlighting: `highlight:` on a widget entry (numeric and string rules per block key) and
  `blockHighlights.levels` for the colours, as in homepage.
- Quick launch, as in homepage: start typing anywhere to find services and bookmarks, open a typed
  address or search the web (`quicklaunch:` with `searchDescriptions`, `provider`,
  `hideInternetSearch`, `hideVisitURL`, `mobileButtonPosition`). The search widget gains the
  `baidu` and `brave` providers.
- `showStats`, in settings.yaml and per service: container stats open from the start, as in homepage.
- `providers` in settings.yaml: shared keys and logins that widget entries use with
  `provider: <name>`, as in homepage. Provider values never reach the browser.
- Discovery labels: homepage's index notation (`homelab.widgets[0].type`,
  `homelab.widget.mappings[0].label`), `target`, `statusStyle` and `showStats`, and labels per
  dashboard with `instanceName` (`homelab.instance.<name>.href`), as in homepage.
- `hideVersion: false` shows the version in the footer, with a daily check for a newer release
  (`disableUpdateCheck` turns that off). Hidden by default, unlike homepage.
- `disableIndexing`: a robots meta tag and a `/robots.txt` that disallows crawlers, as in homepage.
- `base` for running behind a reverse proxy under a sub path, as in homepage. The page now asks
  for its data and widget code with relative URLs.
- `custom.css` and `custom.js` in the config folder are loaded after the page's own, as in homepage.
- Twelve more languages, homepage's set: Catalan, Hebrew (right to left), Croatian, Hungarian,
  Italian, Norwegian Bokmål, Portuguese, Russian, Swedish, Vietnamese and Chinese (simplified and
  traditional; `zh-CN` works too). Widgets of the collection fall back to English until translated.
- `logpath` and `LOG_TARGETS`: a rotated log file (10 MiB, five files), as in homepage. Without
  `logpath` the log stays on stdout only.
- Search suggestions (`showSearchSuggestions`, `suggestionUrl`) in the search widget and quick launch,
  as in homepage; the server asks the search engine because of the page's CSP.
- Resources widget (1.4.0): `cputemp` (with `tempmin`, `tempmax`, `units`), `uptime`, `network`,
  `expanded` and `diskUnits`, as in homepage. A bare `refresh` of 1000 or more is milliseconds,
  homepage's form; a smaller number stays seconds.
- Greeting widget: a line of text in the header (`text`, `text_size`), as in homepage.
- Logo widget: the dashboard's own mark or any icon, as in homepage. Widgets can declare
  `type: icon` options, resolved like service icons.
- Weather (`openmeteo`, `openweathermap`) and `stocks` (Finnhub) header widgets, as in homepage.
  They are in the [widgets collection](https://github.com/stefanrenne/homelab-dashboard-widgets),
  which the dashboard installs by default: widgets for an outside service live there, not
  among the built-in ones.
- Kubernetes widget: CPU and memory of the cluster and per node (metrics-server), as in homepage.
- homepage's widget name `customapi` works (as `custom-api`); widgets can declare such `aliases`.
- Weather widgets without `latitude`/`longitude` use the viewer's location (HTTPS), as in homepage.
  Widget API: `params:` in widget.yaml, the `hd-widget-params` page event and `ctx.params`.
- Widget API: `ctx.fetch(url, { insecure: true })` accepts a self-signed certificate (for an
  option the user turns on), and cookies are kept apart (`headers.getSetCookie()`).
- Docker over TLS: `tls: { caFile, certFile, keyFile }` for a server in docker.yaml, as in
  homepage, for discovery and `container:` status. Widget API: `ctx.fetch(url, { tls: { ca,
  cert, key } })`.
- `weight` for services in services.yaml, as in homepage.
- Widget options can point to another service with `service_group` and `service_name`, as
  homepage's calendar integrations do; that service's widget options fill them in, on the server.
- Docker Swarm: `swarm: true` for a server in docker.yaml, as in homepage. Discovery lists the
  services (labels from `deploy.labels`), and `container:` shows a service's running tasks
  against its replicas.
- Proxmox: `proxmoxNode`, `proxmoxVMID` and `proxmoxType` on a service with `proxmox.yaml`, as in
  homepage: the VM's or container's state, CPU and memory. Also as homepage's `proxmoxvm` widget.
- Kubernetes outside the cluster: `mode: default` in kubernetes.yaml reads a kubeconfig, as in
  homepage (`kubeconfig:`, `$KUBECONFIG` or `~/.kube/config`; a token, client certificate or
  password, no credential plugins), for discovery and the kubernetes widget.
- Kubernetes discovery of Traefik IngressRoutes (`traefik: true`) and Gateway API HTTPRoutes
  (`gateway: true`), as in homepage, with a link from their host when `href` is not set.
  `ingress: false` skips Ingresses.
- Kubernetes pod status per service: `app`, `namespace` and `podSelector` (and `external`), as in
  homepage, with the pods' state, CPU and memory on a click; discovered Ingresses and routes get
  it too. Built-in `kubernetes-pods` widget.
- Installed widgets run in a worker thread with a memory limit (`HD_WIDGET_MEMORY_MB`, default
  256): a widget that hangs or leaks no longer stops the dashboard. `HD_WIDGET_ISOLATION=off` turns
  it off.
- `npm run new-widget -- <id>`: a new widget package from the template, renamed to your id.
- `HD_WATCH_POLL=<seconds>`: check the config files for changes that often, for a config folder on
  a network share. When the folder cannot be watched at all, it is checked every 5 seconds.
- `HD_ALLOWED_HOSTS` (and homepage's `HOMEPAGE_ALLOWED_HOSTS`): only the listed host names get
  an answer, against DNS rebinding. Off until set.
- Built-in `iframe` widget, as in homepage: another page in a frame on a card. Only the origins
  of configured frames are allowed in the page's Content-Security-Policy. For widget authors:
  `frames` in widget.yaml.

### Changed
- A group with `header: false` follows the previous group at card spacing, as in homepage, and
  groups have no padding below their cards (homepage's `pb-0`).
- Services in a group are ordered by weight, as in homepage: a services.yaml service weighs
  (its position + 1) × 100 unless it sets `weight`, a discovered one its `weight` label or 0,
  ties by name. Discovered services without a weight now come before the YAML ones; give them
  a `weight` label (e.g. `"1000"`) to keep them at the end.
- `si-…` icons follow the theme instead of showing in black (invisible on the dark theme).

## [0.4.0] - 2026-10-24

### Added
- `!include <file>` in the config files: `- Media: !include services/media.yaml` puts the YAML
  of another file at that spot. Lists are joined, includes nest, saving an included file
  reloads the page, and problems are shown with the file and path. See
  [Including other files](https://stefanrenne.github.io/homelab-dashboard/configuration.html#including-other-files).

### Fixed
- Old plugin versions piled up in `plugins/`: after each sync the folders the lock file no
  longer points at (older versions, removed sources) are deleted.
- A failed plugin update (offline, a broken release) dropped the plugin; it now keeps the
  version that worked and shows the error.

## [0.3.0] - 2026-10-24

### Added
- The [widgets collection](https://github.com/stefanrenne/homelab-dashboard-widgets) is always
  installed at its newest release; sources under `plugins:` extend it. Listing that repository
  yourself (pinned, or with `only:`) replaces the default.
- A mounted `/var/run/docker.sock` works by itself: no docker-socket-proxy, `--group-add` or
  `docker.yaml` needed (a proxy is still the safer choice).
- Documentation site: [stefanrenne.github.io/homelab-dashboard](https://stefanrenne.github.io/homelab-dashboard/),
  with a page per widget (built-in and the widgets collection): setup, fields, options and an example.
- A Docker Compose example with a healthcheck in the quick start.
- [homelab-dashboard-widget-example](https://github.com/stefanrenne/homelab-dashboard-widget-example):
  a complete widget repository (tests, CI releases, Dependabot) to start your own widget from.

### Changed
- The image starts as root to set up the Docker socket's group, then runs the dashboard as
  `node`. With Kubernetes `runAsNonRoot: true`, also set `runAsUser: 1000`.
- `examples/widget-template`: block keys, a clear error for a missing number, labels in all
  five languages.

## [0.2.0] - 2026-10-24

### Added
- `#latest` for git plugin sources: installs the newest release tag and locks it, so the
  widgets collection no longer needs an explicit version in `settings.yaml`.

### Changed
- The image runs on Node.js 24 (LTS) instead of 22.

## [0.1.0] - 2026-10-24

### Added
- YAML configuration: settings, services, header widgets, bookmarks, Docker and Kubernetes,
  with `{{HD_VAR_*}}`/`{{HD_FILE_*}}` variables and hot reload.
- Built-in widgets: datetime, resources, search, http-status, ping, docker, custom-api.
- Third-party widgets from git, npm or a local folder, pinned in `plugins/plugins.lock.yaml`.
- Docker label and Kubernetes Ingress discovery.
- Dashboard in five languages with dark, light and auto theme.
- Docker image for amd64 and arm64 on ghcr.io/stefanrenne/homelab-dashboard.
- homepage look: Manrope, Tailwind colour palettes, status labels in the card corners
  (response time, "down", container state; click a container label for its stats), rows for
  queues and lists, an error box per widget, and footer buttons for theme, colour and refresh.
- homepage compatibility: `homepage.*` Docker labels, `gethomepage.dev/*` annotations,
  `{{HOMEPAGE_VAR_*}}`, bare icon names, `ping` with a URL, `target: hidden-iframe`, and per
  widget `refreshInterval`, `fields` and `hide_errors`.
- custom-api: `display: list`, `remap`, `prefix`, `suffix`, `format`, `body`.
- Accessibility (Apple HIG audit): status labels 11px instead of 8px, status colours at 4.5:1 or
  more in both appearances, no thin weights, all text in rem so it follows the browser text
  size, larger targets for labels and footer buttons, Reduce Motion and Increase Contrast,
  meters exposed to screen readers, and headings kept for screen readers when hidden.
- The search box filters services as you type; Enter opens the only match or searches the web.
- Appearance can go back to following the system (light / auto / dark).
- Block labels wrap to two hyphenated lines instead of being cut off; long rows open on click.
- Warn and error values get a shape (▲, ✕) next to the colour, announced to screen readers.
- Widget API: `vars` in labels, `status` on rows, `defaultFields` in widget.yaml, "+N more" rows.
- docker: container states translated; memory in decimal MB. custom-api and resources: decimal units.
- `target: hidden-iframe` services (webhooks) run through the dashboard server and report done or
  failed; an error message stays until it is closed.
- Groups fold and unfold by their title (`initiallyCollapsed` in the layout), remembered per viewer.
- Row icons (play, pause) spoken as words; cards use masonry where the browser supports it; safe
  areas for phones and home-screen use; no version text in the footer.
- Widget errors say what to check ("the API key was refused", "unreachable"), with the raw
  message as detail; network errors include their cause (`fetch failed (ECONNREFUSED)`).
- Plugin collections: one source installs every widget in a repository (or `only:` some).
