# Widgets

A widget puts live data on the dashboard. There are two kinds, as in homepage:

- **Service widgets** go on a service's card in [services.yaml](../configuration/services.md),
  under `widget:` (or `widgets:` for several). They show the numbers of that service: the queue
  of Radarr, the blocked queries of Pi-hole, the VMs of Proxmox.

  ```yaml
  # services.yaml
  - Media:
      - Radarr:
          href: http://radarr.lan
          icon: radarr.svg
          widget:
            type: radarr
            url: http://radarr.lan:7878
            key: "{{HD_VAR_RADARR_KEY}}"
  ```

- **Header widgets** go in the page's header, in [widgets.yaml](../configuration/header-widgets.md):
  the date and time, system resources, search, the weather.

  ```yaml
  # widgets.yaml
  - openmeteo:
      label: Amsterdam
      latitude: 52.37
      longitude: 4.89
  ```

Every widget below comes from the [widgets collection](https://github.com/stefanrenne/homelab-dashboard-widgets),
which is always installed. Missing one? Any widget package can be added under `plugins:`; see
[Extend](../extend/README.md) to write your own.
