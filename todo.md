# To do

Open work, roughly in order of value. Move an item to `completed.md` when it is done.

## Feature parity with homepage

Goal: everything [homepage](https://gethomepage.dev) offers, with its config keys accepted as they
are where that makes sense (hard rule 6 still holds for our own keys). Compared on 2026-10-24
against homepage's docs: 164 service widgets, 13 info widgets, the settings page and the
services, docker, kubernetes, proxmox and custom CSS/JS pages.

### Phase 4: service widgets (homelab-dashboard-widgets)

Phases 1 to 3 (settings and layout, info widgets, integrations) are done; see `completed.md`.

Each with a fixture, a test and a README (its CLAUDE.md). homepage's field names, so `fields:`
carries over.

Batch 2, the rest (79):

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
