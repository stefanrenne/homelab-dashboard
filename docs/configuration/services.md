# Services

`services.yaml` holds the cards: groups of services, each with a link, an icon, a status check
and any number of [widgets](../widgets/README.md). Services can also be
[discovered](docker.md#discovery) from Docker labels and [Kubernetes](kubernetes.md#discovery) annotations.

```yaml
- Group name:
    - Service name:
        href: http://app.lan          # link of the card
        icon: app.svg                 # dashboard-icons name (.svg/.png/.webp), /icons/..., or a URL
        description: One line
        statusStyle: dot              # overrides settings.statusStyle for this service
        showStats: true               # overrides settings.showStats for this service
        weight: 50                    # order within the group, low first; default (position + 1) x 100
        filter: widget.update == false  # hide the card while this is true (see Filtering services)
        target: _self                 # overrides settings.target; hidden-iframe: the dashboard
                                      # server calls the URL (a webhook) and shows how it went
        # status check, the first one that is set:
        siteMonitor: http://app.lan   # HTTP check (http-status widget)
        ping: app.lan                 # ICMP ping (ping widget)
        container: app                # Docker container state (docker widget)
        server: local                 # which docker.yaml server; optional with one server
        proxmoxNode: pve              # Proxmox VM or container state (proxmoxvm widget, proxmox.yaml)
        proxmoxVMID: 101
        proxmoxType: qemu             # qemu (a VM, default) or lxc (a container)
        app: app                      # Kubernetes: the pods labelled app.kubernetes.io/name=app (kubernetes-pods widget)
        namespace: apps               # their namespace (default: default)
        podSelector: tier=web         # another label selector instead of app's
        external: true                # no pod status for this app
        # widgets:
        widget:
          type: custom-api
          url: http://app.lan/api
          mappings: [{ field: users, label: Users }]
        widgets:                      # or several
          - type: ping
            host: app.lan
            refreshInterval: 5000     # dashboard keys, for every widget: refreshInterval (ms) or
            fields: [latency]         # refresh (5s), fields (which blocks), hide_errors
```

**Nested groups**, as in homepage: an entry whose value is a list (instead of a map) is a group
inside the group. Its layout goes inside the parent's layout in settings.yaml, and it is on the
parent's tab.

```yaml
# services.yaml
- Infrastructure:
    - Router:
        href: http://router.lan
    - Network:                  # a nested group
        - Access point:
            href: http://ap.lan
        - Switch:
            href: http://switch.lan
```

```yaml
# settings.yaml
layout:
  Infrastructure:
    style: row
    Network:                    # the nested group's layout
      columns: 2
```

**Block highlighting**, as in homepage: `highlight:` on a widget entry colours blocks by their
value. Keys are block keys (the names `fields:` uses). The first matching rule wins; numeric
rules are tried before string rules.

```yaml
widget:
  type: sonarr
  url: http://sonarr.lan:8989
  key: "{{HD_VAR_SONARR_KEY}}"
  highlight:
    queued:
      valueOnly: true                # colour the value only, not the whole block
      numeric:
        - { level: danger, when: gte, value: 20 }
        - { level: warn, when: between, min: 5, max: 19 }
        - { level: good, when: eq, value: 0 }
    status:
      string:
        - { level: danger, when: regex, value: "(failed|import) pending" }
```

Numeric `when`: `gt`, `gte`, `lt`, `lte`, `eq`, `ne` (with `value`), `between` and `outside`
(with `min` and/or `max`); numbers are read from formatted values such as `1,234 GB`. String
`when`: `equals`, `includes`, `startsWith`, `endsWith` (case-insensitive unless
`caseSensitive: true`) and `regex` (`flags`, default `i`). Every rule takes `negate: true`.
The colours per level can be changed in settings.yaml with homepage's Tailwind classes; colours
outside the dashboard's palettes are ignored:

```yaml
blockHighlights:
  levels:
    good: "bg-emerald-500/40 text-emerald-950 dark:bg-emerald-900/60 dark:text-emerald-400"
    warn: "bg-amber-300/30 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200"
    danger: "bg-rose-700/45 text-rose-200 dark:bg-rose-950/70 dark:text-rose-400"
```

Every check that is set gets its own label in the card's top-right corner, as in homepage:
the response time (or "down") for `siteMonitor` and `ping`, the container state for `container`.
Click a container label to see the container's CPU and memory. `ping` also accepts a URL
(`ping: http://192.168.1.2`).

Icons: a dashboard-icons name, an `mdi-`, `si-` or `sh-` icon, a file in `config/icons` or a URL;
see [Images](images.md).

## Filtering services

`filter:` on a service hides its card while an expression is true. The expression reads the
**attributes** its widgets publish: public values a widget declares for this (the Attributes table
on each [widget's page](../widgets/README.md) lists them), apart from the blocks it shows. For
example, a Shelly device that only appears while a firmware update is waiting:

```yaml
- Devices:
    - Shelly Bureau:
        href: http://shelly-bureau.lan
        filter: widget.update == false          # hidden while there is no update
        widget:
          type: shelly
          url: http://shelly-bureau.lan
          password: "{{HD_VAR_SHELLY_PASSWORD}}"
```

- **An attribute**: `widget.<name>` reads the attributes of all the service's widgets together,
  so it works the same with one widget or several. When two widgets publish the same name, the
  first one on the card counts. To read one widget only: `widgets[1].<name>` (by position,
  from 0) or `widgets.shelly.<name>` (the first widget of that type).
- **A value**: `true`, `false`, `null`, a number, `'text'` or `"text"`.
- **Comparing**: `==`, `!=`, `<`, `<=`, `>`, `>=` (`<` and `>` only between numbers).
- **Combining**: `&&` (and), `||` (or), `!` (not), and parentheses:
  `filter: widget.update == false && widget.queued == 0`.

An attribute no widget sent counts as `null`, so `widget.update == false` is not true
before the widget knows. Until the widgets the filter reads have answered, the card stays hidden;
when one of them fails, the card is shown, so a broken service never disappears quietly. A group
whose cards are all hidden is hidden too, and a hidden card is no search hit.

A mistake in the expression (`widget.update false`), a widget that is not on the service
(`widgets.radarr.queued` on a Shelly) or a secret in it are config errors; the service is then
shown unfiltered. An attribute the widget does not publish is a warning. The filter goes to the
browser, so it cannot hold a `{{HD_VAR_*}}` value.

Discovered services take it as a label (`homelab.filter`) or an annotation
(`homelab.dev/filter`). The quotes and `&&` of an expression are easiest in Compose's list form:
`- homelab.filter=widget.update == false`.

