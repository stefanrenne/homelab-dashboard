# Completed

Finished work, newest first.

- 2026-10-23: First version: config core, widget runtime with seven built-in widgets, plugin
  installer (git/npm/path + lock file), widget template, Docker and Kubernetes discovery,
  single-file dashboard, Docker image and CI.
- 2026-10-23: homepage look and compatibility, statuses per check, rows, plugin collections,
  and the widget collection repo (12 widgets).
- 2026-10-24: Apple HIG audits of the dashboard and the widgets; all findings fixed (Critical to Low).
- 2026-10-24: homepage parity, phase 1: `description` and `favicon` in settings.yaml.
- 2026-10-24: homepage parity, phase 1: `startUrl` and the PWA manifest (`pwa.icons`, `pwa.shortcuts`).
- 2026-10-24: homepage parity, phase 1: `background` with filters and `cardBlur`.
- 2026-10-24: homepage parity, phase 1: tabs (`layout.<group>.tab`).
- 2026-10-24: homepage parity, phase 1: nested groups.
- 2026-10-24: homepage parity, phase 1: icons-only bookmarks and category icons.
- 2026-10-24: homepage parity, phase 1: `mdi-`/`sh-` icons, icon colours and `iconStyle`.
- 2026-10-24: homepage parity, phase 1: fullWidth, max group columns, equal heights, disableCollapse, groupsInitiallyCollapsed.
- 2026-10-24: homepage parity, phase 1: group order from the layout block, mixed with bookmark groups.
- 2026-10-24: homepage parity, phase 1: header styles, cardStyle, blockStyle, font.
- 2026-10-24: homepage parity, phase 1: `statusStyle` (global and per service).
- 2026-10-24: homepage parity, phase 1: block highlighting and `blockHighlights` levels.
- 2026-10-24: homepage parity, phase 1: quick launch.
- 2026-10-24: homepage parity, phase 1: `showStats` (global and per service).
- 2026-10-24: homepage parity, phase 1: `providers`.
- 2026-10-24: homepage parity, phase 1: `instanceName` and homepage's label notation for discovery.
- 2026-10-24: homepage parity, phase 1: `hideVersion` and the update check.
- 2026-10-24: homepage parity, phase 1: `disableIndexing`.
- 2026-10-24: homepage parity, phase 1: `base` (sub path behind a reverse proxy).
- 2026-10-24: homepage parity, phase 1: `custom.css` and `custom.js`.
- 2026-10-24: homepage parity, phase 1: twelve more languages (homepage's set), right-to-left for Hebrew.
- 2026-10-24: homepage parity, phase 1: `logpath` and `LOG_TARGETS`.
- 2026-10-24: homepage parity, phase 1: search suggestions (search widget and quick launch).
- 2026-10-24: homepage parity, phase 1: resources widget (cputemp, uptime, network, expanded, diskUnits). Phase 1 done.
- 2026-10-24: homepage parity, phase 2: greeting widget.
- 2026-10-24: homepage parity, phase 2: logo widget and the `icon` option type.
- 2026-10-24: homepage parity, phase 2: Open-Meteo weather widget.
- 2026-10-24: homepage parity, phase 2: OpenWeatherMap widget (not checked against the live API: needs a key).
- 2026-10-24: homepage parity, phase 2: stocks widget (Finnhub; not checked against the live API: needs a key).
- 2026-10-24: homepage parity, phase 2: Kubernetes widget (tested against a fake API, not a live cluster).
- 2026-10-24: homepage parity, phase 2: glances, longhorn and unifi (also unifi_console) in the widgets collection. Phase 2 done but the weather's browser location.
- 2026-10-24: homepage parity, phase 2: weather without coordinates uses the viewer's location (`params` in the widget API, documented in the API reference). Phase 2 done.
