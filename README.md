<div align="center">

<h1>Homelab Dashboard</h1>

<p>A fast, self-hosted start page for your homelab, configured in YAML,<br>
with 170+ widgets and room for the ones <strong>you</strong> publish.</p>

<picture>
  <source media="(prefers-color-scheme: light)" srcset="docs/images/screenshot-light.png">
  <img alt="The dashboard: a header with a greeting, the time, system meters, the weather and search; cards with live numbers from Plex, Radarr, Sonarr, SABnzbd, Seerr, Proxmox, Unraid, Pi-hole, What's up Docker, Traefik, Immich, Paperless-ngx, Nextcloud, Uptime Kuma and Speedtest, and buttons such as Reboot node, Stop the array, Pause downloads and Update all containers" src="docs/images/screenshot-dark.png">
</picture>

[Documentation](https://stefanrenne.github.io/homelab-dashboard/) ·
[Widgets](https://stefanrenne.github.io/homelab-dashboard/widgets/) ·
[Write a widget](https://stefanrenne.github.io/homelab-dashboard/extend/)

</div>

## Features

- **170+ widgets** for the services you run: Radarr, Sonarr, Plex, Proxmox, Unraid, Pi-hole,
  Home Assistant, Immich and many more, installed and kept up to date by themselves.
- **Widgets anyone can publish**: a manifest and one function in your own git repository or npm
  package, added by others with one line of YAML.
- **YAML configuration** that reloads on save, with mistakes shown on the page.
- **Auto-discovery** from Docker labels and Kubernetes annotations.
- **Secrets stay on the server**: API keys never reach the browser.
- **homepage-compatible**: its config files, labels and `{{HOMEPAGE_VAR_*}}` variables work as they are.
- Dark and light themes, accent colours, tabs, 17 languages, installable as an app.

## Getting started

```bash
docker run -d -p 3000:3000 -v ./config:/config ghcr.io/stefanrenne/homelab-dashboard:latest
```

Or with Docker Compose:

```yaml
# compose.yaml
services:
  dashboard:
    image: ghcr.io/stefanrenne/homelab-dashboard:latest
    ports:
      - "3000:3000"
    volumes:
      - ./config:/config
    restart: unless-stopped
    healthcheck:                 # the image has the same one built in; here to tune it
      test: ["CMD", "wget", "-q", "-O", "/dev/null", "http://127.0.0.1:3000/api/health"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 20s
```
Open `http://localhost:3000`, then edit the YAML files in `config`: the page follows.

## Documentation

Everything else is on **[stefanrenne.github.io/homelab-dashboard](https://stefanrenne.github.io/homelab-dashboard/)**:
[configuration](https://stefanrenne.github.io/homelab-dashboard/configuration/),
[every widget](https://stefanrenne.github.io/homelab-dashboard/widgets/) and how to
[write your own](https://stefanrenne.github.io/homelab-dashboard/extend/).
The same pages are in [docs/](docs/README.md).

## License

[MIT](LICENSE)
