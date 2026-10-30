# Configuration

All configuration lives in one folder (`/config` in the container, `--config` or `HD_CONFIG_DIR`
otherwise). Every file is optional. The page reloads by itself when a `.yaml` file changes.
On a network share (NFS, SMB) changes made on another machine are not noticed; set
`HD_WATCH_POLL` to a number of seconds to check the files that often instead.
Problems are shown at the top of the page with the file and a path into it. A broken entry is
skipped and the rest keeps working.

| File | What |
|---|---|
| [`settings.yaml`](settings.md) | Title, language, theme, layout per group, discovery interval, plugins |
| [`bookmarks.yaml`](bookmarks.md) | Groups of links |
| [`widgets.yaml`](header-widgets.md) | Widgets in the header |
| [`services.yaml`](services.md) | Groups of services |
| [`kubernetes.yaml`](kubernetes.md) | Kubernetes discovery |
| [`docker.yaml`](docker.md) | Docker servers (status and discovery) |
| [`proxmox.yaml`](proxmox.md) | Proxmox nodes (VM and container status) |
| other `.yaml` files | Pulled in with `!include` (see [Including other files](#including-other-files)) |
| `icons/` | Your own icons, used as `icon: /icons/name.svg` (see [Images](images.md)) |
| [`custom.css`, `custom.js`](custom-css-js.md) | Your own style and script, loaded after the page's own |
| `plugins/` | Managed by the dashboard: downloaded widgets and `plugins.lock.yaml`. Older versions and removed sources are deleted after each sync |

## YAML in short

Every file is [YAML](https://yaml.org), a superset of JSON that is easy to read and write.

- **Indentation matters.** Nested keys go two spaces further in than their parent; never use tabs.
- **`key: value`**, with a space after the colon. A list item starts with `- `.
- **Quote strings** with special characters, and always API keys and `{{HD_VAR_...}}` values:
  `key: "{{HD_VAR_RADARR_KEY}}"`.
- A broken file is reported at the top of the page, with the file and a path into it. An online
  checker such as [YAML Lint](https://www.yamllint.com) helps to find the spot.

## Variables

Any value can contain `{{HD_VAR_NAME}}` (the environment variable `HD_VAR_NAME`) or
`{{HD_FILE_NAME}}` (the contents of the file whose path is in `HD_FILE_NAME`, e.g. a Docker
secret). homepage's `{{HOMEPAGE_VAR_*}}` and `{{HOMEPAGE_FILE_*}}` work the same, so an
existing homepage environment can be reused. Substituted values are treated as secrets: they
never reach the browser.

## Including other files

A long `services.yaml` can be split up. `!include <file>` puts the YAML of another file at that
spot, as if it were written there:

```yaml
# services.yaml
- Infrastructure:
    - Router:
        href: http://router.lan
- Media: !include services/media.yaml      # the services of one group
- !include services/home-automation.yaml   # whole groups
```

```yaml
# services/media.yaml: what would otherwise follow "- Media:"
- Plex:
    href: http://plex.lan:32400
    icon: plex
- Radarr: !include radarr.yaml             # relative to this file: services/radarr.yaml
```

```yaml
# services/home-automation.yaml: one or more groups, as in services.yaml
- Home automation:
    - Home Assistant:
        href: http://homeassistant.lan:8123
- Cameras: []
```

The rules:

- **Where**: as the value of a key (`- Media: !include ...`, `widget: !include ...`), as an item
  in a list, or as a whole file. It works in every config file, also `widgets.yaml` and
  `bookmarks.yaml`.
- **Lists are joined**: an include that is a list item and whose file holds a list adds those
  items in its place. That is how `- !include services/home-automation.yaml` adds two groups. A
  file that holds a map (one service, one widget) is added as one item.
- **Paths** are relative to the file with the `!include`, use `/`, and must stay inside the config
  folder. Only `.yaml` and `.yml` files can be included. Keep included files out of `plugins/`.
- **Nesting**: an included file can include others, up to 8 levels deep. A file that ends up
  including itself is reported.
- **Variables and secrets**: `{{HD_VAR_*}}` and `{{HD_FILE_*}}` work in included files, and
  their values stay secret, as in the main files.
- **Reloading**: saving an included file reloads the page, also in a subfolder.
- **Problems** never stop the dashboard. A missing file, a path outside the config folder, a
  YAML error or a loop is shown with the file and path of the `!include`
  (`services.yaml › [1].Media: !include services/media.yaml: file not found`); that spot stays
  empty and the rest works. A mistake *inside* the included services is shown with the path
  in the file that includes it.

Files are only read where an `!include` names them: a `media.yaml` next to `services.yaml` does
nothing by itself. `!include` is this dashboard's own; homepage does not read it.

## Environment variables

Settings of the container rather than of the page.

| Variable | What |
|---|---|
| `HD_VAR_*`, `HD_FILE_*` | Values for `{{HD_VAR_*}}` and `{{HD_FILE_*}}` (see [Variables](#variables)) |
| `HD_ALLOWED_HOSTS` | The host names the dashboard answers to (see [Allowed hosts](#allowed-hosts)) |
| `HD_WIDGET_MEMORY_MB`, `HD_WIDGET_ISOLATION` | The widget worker (see [Widget worker](#widget-worker)) |
| `HD_ALLOW_ROOT_SCRIPTS` | Button scripts as root (see [Scripts as root](#scripts-as-root)) |
| `HD_WATCH_POLL` | Check the config files every so many seconds, for network shares |
| `HD_CONFIG_DIR` | The config folder, when not run from the image |
| `LOG_TARGETS` | `both`, `stdout` or `file` (with `logpath` in [settings.yaml](settings.md)) |

### Allowed hosts

`HD_ALLOWED_HOSTS` (or homepage's `HOMEPAGE_ALLOWED_HOSTS`) lists the host names the dashboard
answers to, comma-separated, e.g. `HD_ALLOWED_HOSTS=dash.lan,dash.example.com:8443`. Any other
`Host` header gets a 403, which stops DNS rebinding: a web page that points its own domain at
your network cannot read the dashboard through your browser. An entry without a port allows any
port; `localhost` and `127.0.0.1` always work (the image's health check uses them). Unset, or
`*`, answers every host, as before. Unlike homepage the check is off until you set it.

### Widget worker

Installed widgets run in a worker thread with a memory limit, so one that hangs cannot stop the
dashboard. `HD_WIDGET_MEMORY_MB` sets the limit (default 256); `HD_WIDGET_ISOLATION=off` runs them
in the dashboard process instead.

### Scripts as root

The [button](../widgets/collection/button.html)
widget runs its script as the dashboard's user (`node`, uid 1000). A button with `user: root`
runs it as root inside the container, for scripts that write files owned by root. That only works
with `HD_ALLOW_ROOT_SCRIPTS: "true"` on the container: the image then lets `node` start one fixed
runner (`/usr/local/bin/hd-root`) through sudo. Without it such a button shows that it needs the
variable. The container must start as root (the default; not `--user 1000`), since that is when
the rule is written. Every installed widget could use the runner once it is on, and anyone who can
open the page can press the button, so turn it on only for a dashboard you trust and keep behind
authentication.

```yaml
# docker-compose.yml
services:
  homelab-dashboard:
    environment:
      HD_ALLOW_ROOT_SCRIPTS: "true"
```

## Migration

Changes to these formats stay backward compatible (hard rule 6). Each renamed or changed key is
listed here with the version, what the old form becomes, and the test that covers it.

### 0.7.2: the version is shown by default

The footer shows the version unless `hideVersion: true` (before: only with `hideVersion: false`,
which keeps working and changes nothing now). With the version shown the dashboard asks GitHub
once a day for a newer release; add `disableUpdateCheck: true` to keep it from doing so. Covered by
`tests/app.test.mjs` (the version is shown and checked for updates by default).

### 0.6.0: the built-in widgets moved to the widgets collection

Nothing to change. The dashboard has no built-in widgets any more: `datetime`, `search`,
`resources`, `http-status`, `ping`, `docker`, `custom-api` and the others are in the widgets
collection, which is always installed (0.4.0 or newer needed). Their types and options are the
same. With your own `plugins:` entry for the collection, `only:` gets the five widgets behind the
service fields added, and a pinned tag must be 0.4.0 or newer. Covered by
`tests/installer.test.mjs` (withDefaultPlugins) and `tests/app.test.mjs` (without the widgets
collection a service field says where its widget comes from).
