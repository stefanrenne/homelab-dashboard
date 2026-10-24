# Changelog

All user-visible changes. The format follows [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

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

### Changed
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
