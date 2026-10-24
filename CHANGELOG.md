# Changelog

All user-visible changes. The format follows [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

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
