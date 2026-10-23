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
