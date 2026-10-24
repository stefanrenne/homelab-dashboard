# To do

Open work, roughly in order of value. Move an item to `completed.md` when it is done.

## Feature parity with homepage

Goal: everything [homepage](https://gethomepage.dev) offers, with its config keys accepted as they
are where that makes sense (hard rule 6 still holds for our own keys). Compared on 2026-10-24
against homepage's docs: 164 service widgets, 13 info widgets, the settings page and the
services, docker, kubernetes, proxmox and custom CSS/JS pages.

### Phase 1: settings and layout (core, this repo)

Already there: title, theme, color, language (5 of homepage's ±40), target, background,
headerStyle, showTitle, layout per group (columns, row/column style, header, initiallyCollapsed),
hideErrors, status labels, container stats on click, search widget, bookmarks.


### Phase 2: info widgets (header)

Generic ones built in, service-specific ones in the widgets collection.


### Phase 3: integrations (core)


### Phase 4: service widgets (homelab-dashboard-widgets)


Each with a fixture, a test and a README (its CLAUDE.md). homepage's field names, so `fields:`
carries over.

Batch 1, the most used (39):

- [ ] Nextcloud
- [ ] Immich
- [ ] Paperless-ngx
- [ ] Uptime Kuma
- [ ] Traefik
- [ ] Nginx Proxy Manager
- [ ] TrueNas
- [ ] Synology Disk Station
- [ ] OpenMediaVault
- [ ] Speedtest Tracker
- [ ] Gitea
- [ ] Grafana
- [ ] Tailscale
- [ ] Authentik
- [ ] Audiobookshelf
- [ ] Navidrome
- [ ] Frigate
- [ ] Scrutiny
- [ ] Watchtower
- [ ] Syncthing
- [ ] Calendar

Batch 2, the rest (112):

- [ ] APC UPS Monitoring
- [ ] Arcane
- [ ] ArgoCD
- [ ] Atsumeru
- [ ] Autobrr
- [ ] Azure DevOps
- [ ] Backrest
- [ ] Booklore
- [ ] BookOrbit
- [ ] Beszel
- [ ] Caddy
- [ ] Calibre-web
- [ ] Changedetection.io
- [ ] Channels DVR Server
- [ ] Checkmk
- [ ] Cloudflare Tunnels
- [ ] Coin Market Cap
- [ ] Crowdsec
- [ ] DeveLanCacheUI
- [ ] Dispatcharr
- [ ] Dockhand
- [ ] Synology Download Station
- [ ] Duplicati
- [ ] ESPHome
- [ ] EVCC
- [ ] Feed
- [ ] Filebrowser
- [ ] Fileflows
- [ ] Firefly III
- [ ] Flood
- [ ] FreshRSS
- [ ] FRITZ!Box
- [ ] GameDig
- [ ] Gatus
- [ ] Ghostfolio
- [ ] Gitlab
- [ ] Gluetun
- [ ] Gotify
- [ ] HDHomerun
- [ ] Headscale
- [ ] Health checks
- [ ] Karakeep
- [ ] Homebox
- [ ] Homebridge
- [ ] iFrame
- [ ] JDownloader
- [ ] Jellystat
- [ ] Kavita
- [ ] Komga
- [ ] Komodo
- [ ] Kopia
- [ ] Linkwarden
- [ ] LubeLogger
- [ ] Mastodon
- [ ] Mailcow
- [ ] Maintainerr
- [ ] Mealie
- [ ] Medusa
- [ ] Mikrotik
- [ ] Minecraft
- [ ] Miniflux
- [ ] MJPEG
- [ ] Moonraker (Klipper)
- [ ] Mylar3
- [ ] MySpeed
- [ ] Netdata
- [ ] NetAlertX
- [ ] NetBird
- [ ] NextDNS
- [ ] ntfy
- [ ] OctoPrint
- [ ] Omada
- [ ] OpenDTU
- [ ] OPNSense
- [ ] OpenWRT
- [ ] Pangolin
- [ ] PeaNUT
- [ ] pfSense
- [ ] PhotoPrism
- [ ] Plant-it
- [ ] Prometheus
- [ ] Prometheus Metric
- [ ] Pterodactyl
- [ ] Pulse
- [ ] Pyload
- [ ] QNAP
- [ ] qui
- [ ] Romm
- [ ] ruTorrent
- [ ] Slskd
- [ ] SparkyFitness
- [ ] Spoolman
- [ ] Sportarr
- [ ] Stocks
- [ ] Suwayomi
- [ ] SWAG Dashboard
- [ ] Syncthing Relay Server
- [ ] Tandoor
- [ ] Technitium DNS Server
- [ ] Tracearr
- [ ] Trilium
- [ ] Tube Archivist
- [ ] UniFi Drive
- [ ] Unmanic
- [ ] UptimeRobot
- [ ] UrBackup
- [ ] Vikunja
- [ ] Wallos
- [ ] Wg-Easy
- [ ] Xteve
- [ ] Your Spotify
- [ ] Zabbix

## Other

- [ ] `HD_ALLOWED_HOSTS` check on the Host header (DNS rebinding), like homepage's `HOMEPAGE_ALLOWED_HOSTS`.
- [ ] Run widget `server.js` in a `worker_thread` with resource limits (see docs/widgets/security.md).
- [ ] A widget catalogue: an index (YAML in a separate repo) of known widget packages, shown in the docs.
- [ ] `hd widget new <id>` / `npm create` scaffolding from the template.
- [ ] Polling fallback for the config watcher on network file systems (`HD_WATCH_POLL`).
