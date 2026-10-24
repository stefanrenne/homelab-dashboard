# Changelog

All user-visible changes. The format follows [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

### Added
- YAML configuration: settings, services, header widgets, bookmarks, Docker and Kubernetes,
  with `{{HD_VAR_*}}`/`{{HD_FILE_*}}` variables and hot reload.
- Built-in widgets: datetime, resources, search, http-status, ping, docker, custom-api.
- Third-party widgets from git, npm or a local folder, pinned in `plugins/plugins.lock.yaml`.
- Docker label and Kubernetes Ingress discovery.
- Dashboard in five languages with dark, light and auto theme.
- homepage look: Manrope, Tailwind colour palettes, status labels in the card corners
  (response time, "down", container state; click a container label for its stats), rows for
  queues and lists, an error box per widget, and footer buttons for theme, colour and refresh.
- homepage compatibility: `homepage.*` Docker labels, `gethomepage.dev/*` annotations,
  `{{HOMEPAGE_VAR_*}}`, bare icon names, `ping` with a URL, `target: hidden-iframe`, and per
  widget `refreshInterval`, `fields` and `hide_errors`.
- custom-api: `display: list`, `remap`, `prefix`, `suffix`, `format`, `body`.
- Plugin collections: one source installs every widget in a repository (or `only:` some).
