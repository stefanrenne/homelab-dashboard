# Your whole homelab on one page

A fast, self-hosted start page for your homelab. Write a few lines of YAML and every service
gets a card with its live numbers: the queue of Radarr, the VMs on Proxmox, the blocked queries of
Pi-hole, the photos in Immich. And when a widget for your service does not exist yet, you can
**publish one yourself**, from your own repository, without waiting for anyone.
{: .fs-6 .fw-300 }

[Get started](#get-started-in-a-minute){: .btn .btn-primary .fs-5 .mb-4 .mb-md-0 .mr-2 }
[Browse the widgets](widgets/README.md){: .btn .fs-5 .mb-4 .mb-md-0 }

![The dashboard in dark mode: a header with a greeting, the time, CPU, memory and disk meters, the weather and a search box; three groups of cards (Media, Infrastructure, Home) with live numbers from Plex, Radarr with its download queue, Sonarr, SABnzbd, Seerr, Proxmox, Unraid, Pi-hole, What's up Docker, Traefik, Immich, Paperless-ngx, Nextcloud, Uptime Kuma and Speedtest, green status dots, buttons on the cards (Import finished downloads, Pause downloads for an hour, Reboot node, Stop the array, Pause blocking for 5 minutes, Update all containers, Back up now, Run a speed test now) and a row of bookmark icons](images/screenshot-dark.png)

## Why you will like it

**170+ widgets, ready to go.** Radarr, Sonarr, Plex, Jellyfin, Proxmox, Unraid, TrueNAS,
Pi-hole, AdGuard, Home Assistant, Immich, Portainer, UniFi, Traefik and many more, plus the
weather, stocks and a generic JSON mapper for anything with an API. They are installed with the
dashboard and keep themselves up to date. [See them all](widgets/README.md).

**Widgets anyone can publish.** Every widget is a small package: a manifest and one function.
Put it in a git repository or on npm, and others add it with one line of YAML. No pull request
to get merged, no release to wait for. [Write your own](extend/README.md).

**Configured in YAML, live on save.** Services, header widgets, bookmarks: plain files you can
keep in git. Save one and every open page updates by itself. A mistake is shown on the page, with
the file and the spot in it, and the rest keeps working. [Configuration](configuration/README.md).

**Finds your services by itself.** Label a Docker container or annotate a Kubernetes Ingress and
it appears on the page, with its status. Docker Swarm, Traefik IngressRoutes and the Gateway API
too. [Docker](configuration/docker.md) · [Kubernetes](configuration/kubernetes.md).

**Buttons for the jobs you repeat.** Pull new images, pause downloads, start a backup, reboot a
node: a button on a card runs a script or command on the server, and shows the output when it
fails. [Button widget](widgets/collection/button.html).

**Your keys stay on your server.** API keys and passwords go in variables and never reach the
browser; widgets run in a worker with a timeout, so one broken service never takes the page down.
[Security](extend/security.md).

**Feels at home.** Coming from [homepage](https://gethomepage.dev)? Its `services.yaml`,
`widgets.yaml`, Docker labels and `{{HOMEPAGE_VAR_*}}` variables work as they are. Dark and
light themes, 22 accent colours, tabs, 17 languages, and it installs as an app on your phone.

## Get started in a minute

```bash
docker run -d -p 3000:3000 -v ./config:/config ghcr.io/stefanrenne/homelab-dashboard:latest
```

Open `http://localhost:3000`. The empty `config` folder is filled with an example to start from;
edit `services.yaml` and watch the page follow:

```yaml
# services.yaml
- Media:
    - Radarr:
        href: http://radarr.lan
        icon: radarr.svg
        siteMonitor: http://radarr.lan
        widget:
          type: radarr
          url: http://radarr.lan:7878
          key: "{{HD_VAR_RADARR_KEY}}"
```

<details><summary>With Docker Compose</summary>

```yaml
# compose.yaml
services:
  dashboard:
    image: ghcr.io/stefanrenne/homelab-dashboard:latest
    ports:
      - "3000:3000"
    volumes:
      - ./config:/config
      - /var/run/docker.sock:/var/run/docker.sock:ro   # optional: Docker status and discovery
    environment:
      HD_VAR_RADARR_KEY: your-api-key
    restart: unless-stopped
```

For Docker discovery through a read-only socket proxy, see
[docker-compose.example.yml](../docker-compose.example.yml).

</details>

Images are built for amd64 and arm64: `latest` follows `main`, and every release has its own tag.

## Where to next

| | |
|---|---|
| [Configuration](configuration/README.md) | Every file and key: settings, services, bookmarks, Docker, Kubernetes, Proxmox, images |
| [Widgets](widgets/README.md) | Every widget, with its options, fields, an example and how it looks |
| [Extend](extend/README.md) | Write a widget of your own, locally or as a package for others |

![The same dashboard in light mode](images/screenshot-light.png)
