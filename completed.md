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
- 2026-10-24: homepage parity, phase 3: Docker over TLS (`tls` in docker.yaml; tested against a local TLS server with client certificates, not a real dockerd).
- 2026-10-24: homepage parity, phase 3: services ordered by weight within a group, as in homepage (`weight` in services.yaml too).
- 2026-10-24: homepage parity, phase 3: Docker Swarm services and stacks (`swarm: true`; tested against a fake API, not a live swarm).
- 2026-10-24: homepage parity, phase 3: Proxmox VM/LXC status and stats per service (`proxmox.yaml`, built-in `proxmoxvm`; tested against a fake API, not a live Proxmox).
- 2026-10-24: homepage parity, phase 3: Kubernetes outside the cluster (`mode: default`, a kubeconfig without dependencies; tested against local API servers, not a live cluster).
- 2026-10-24: homepage parity, phase 3: Kubernetes discovery of Traefik IngressRoutes and Gateway API HTTPRoutes (tested against a fake API).
- 2026-10-24: homepage parity, phase 3: Kubernetes pod status and stats per service (`app`, `namespace`, `podSelector`, built-in `kubernetes-pods`; tested against a fake API). Phase 3 done.
- 2026-10-24: openmeteo, openweathermap and stocks moved from the built-in widgets to the widgets collection (they need a collection release before this dashboard release).
- 2026-10-24: homepage parity, phase 4: the twelve new languages for the collection's widgets.
- 2026-10-24: homepage parity, phase 4, batch 1 in the collection: pihole, adguard, plex, jellyfin, emby, homeassistant, proxmox, proxmoxbackupserver, qbittorrent, transmission, deluge, nzbget, lidarr, readarr, jackett, ombi (glances and unifi were already there). Tested against fixtures, not live services.
- 2026-10-24: homepage parity, phase 4, batch 1 done in the collection: also nextcloud, immich, paperlessngx, uptimekuma, traefik, npm, truenas (REST and WebSocket API), diskstation, openmediavault, speedtest, gitea, grafana, tailscale, authentik, audiobookshelf, navidrome, frigate, scrutiny, watchtower, syncthing and calendar (with the dashboard's new service references). Tested against fixtures and local fakes, not live services.
- 2026-10-24: homepage parity, phase 4, batch 2 in the collection: apcups, arcane, argocd, atsumeru, autobrr, azuredevops, backrest, booklore, bookorbit, beszel, caddy, calibreweb, changedetectionio, channelsdvrserver, checkmk, cloudflared, coinmarketcap, crowdsec, develancacheui, dispatcharr, dockhand, downloadstation, duplicati, esphome, evcc, feed, filebrowser, fileflows, firefly, flood, freshrss and fritzbox (stocks was already there). Tested against fixtures, not live services.
- 2026-10-24: homepage parity, phase 4, batch 2 in the collection: gamedig (Valve's server query, without the gamedig library), gatus, ghostfolio, gitlab, gluetun, gotify, hdhomerun, headscale, healthchecks, karakeep, homebox, homebridge, jdownloader (My.JDownloader), jellystat and kavita. Tested against fixtures and local fakes, not live services.
- 2026-10-24: homepage parity, phase 4: built-in `iframe` widget, with `frames` in widget.yaml so the page's CSP allows only the configured frames' origins.
- 2026-10-24: homepage parity, phase 4, batch 2 in the collection: komga, komodo, kopia, linkwarden, lubelogger, mastodon, mailcow, maintainerr, mealie, medusa, mikrotik, minecraft (Server List Ping, without a library), miniflux, mjpeg (client only), moonraker, mylar, myspeed, netdata, netalertx, netbird, nextdns, ntfy, octoprint and omada (controllers 4 to 6). Tested against fixtures and local fakes, not live services.
- 2026-10-24: homepage parity, phase 4, batch 2 done in the collection: opendtu, opnsense, openwrt, pangolin, peanut, pfsense, photoprism, plantit, prometheus, prometheusmetric, pterodactyl, pulse, pyload, qnap, qui, romm, rutorrent, slskd, sparkyfitness, spoolman, sportarr, strelaysrv, suwayomi, swagdashboard, tandoor, technitium, tracearr, trilium, tubearchivist, unifi_drive, unmanic, uptimerobot, urbackup, vikunja, wallos, wgeasy, xteve, yourspotify and zabbix; seerr also answers to overseerr. Every homepage service widget now has a counterpart (built in or in the collection). Tested against fixtures and local fakes, not live services.
- 2026-10-24: `HD_ALLOWED_HOSTS` (and `HOMEPAGE_ALLOWED_HOSTS`): a Host header check against DNS rebinding, off until set, loopback always allowed.
- 2026-10-24: `HD_WATCH_POLL`: polling the config files for network file systems, and polling as the fallback when fs.watch cannot start.
- 2026-10-24: widget scaffolding: `npm run new-widget -- <id>` (dashboard) and `npm run rename -- <id>` (the example repo).
- 2026-10-24: installed widgets run in one worker thread with a memory limit; a hung widget restarts the worker (checked: all 164 collection widgets give the same results as in the process).
- 2026-10-25: released the widgets collection 0.3.0 and the dashboard 0.5.0.
- 2026-10-25: the built-in widgets moved to the widgets collection; the dashboard has none of its own any more.
- 2026-10-25: released the widgets collection 0.4.0 and the dashboard 0.6.0.
