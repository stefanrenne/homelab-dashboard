# Decisions

Why things are the way they are. Newest first.

## Widgets may run actions; the button widget runs scripts (2026-10-25)
A separate webhook container ran the homelab's scripts (bash with curl, jq and docker). The widget
API got `action(ctx)` so a widget can do something on a press, and the collection's `button`
widget uses it to run a script file or an inline command in the dashboard container (bash, curl,
jq, docker-cli and compose are in the image for it). The script is the user's own code, from the
config, never from the request; it runs as `node` with an empty environment unless the button
says `inheritEnv: true`, and its output passes the secret scrubbing. The hard rules are about the
dashboard's own code: its Docker calls stay GET-only (rule 9) and it writes only its plugins
folder (rule 5); what a configured script does with the socket or files is up to the user. There
is no login, so anyone who can open the page can press the button: that is the user's choice
(documented in the widget's README and in security.md). One action at a time per instance, at
most an hour; the button keeps its own `timeout` (5 minutes by default).

## Every widget in the widgets collection (2026-10-25)
The dashboard had built-in widgets: the generic and header ones, and the ones behind a
service's `siteMonitor:`, `ping:`, `container:`, `app:` and `proxmoxNode:`. They moved to the
widgets collection, so a widget has one place, one release cycle and one test suite, and the
dashboard is only the core. The core still creates those five widgets by id and fills in their
options (`CORE_WIDGETS` in `src/plugins/installer.js`); their ids and options are a contract
with the collection. The price: the first start needs network access to download the collection
(the lock file covers later starts), the five run in the worker thread like any installed
widget, and `only:` on the collection gets them added so the service fields keep working.

## One worker thread for installed widgets (2026-10-24)
A widget's `fetch` used to run in the dashboard's event loop, so a loop without end froze the
whole page and a leak took the process down, against hard rule 4. Installed widgets now run in a
worker thread with `resourceLimits`; a call that ignores its timeout gets the worker terminated
and started again. One worker for all of them rather than one per widget: a worker costs about
10 MB, and a homelab easily uses thirty widget types. Built-in widgets stay in the process (they
are ours and some, like docker, are called very often). It is not a sandbox for hostile code: a
worker has the same network and files.

## Frames only for the configured origins (2026-10-24)
homepage's iframe widget needs `frame-src` to allow the framed page. A blanket `frame-src *`
would let any injected markup frame anything; instead widget.yaml names the options that hold a
framed URL (`frames: [src]`), and the page's CSP lists only the origins of their public values.
Without an iframe widget the page keeps `frame-src 'none'`; API responses always do.

## Webhooks through the server, not a hidden frame (2026-10-24)
homepage's `target: hidden-iframe` loads a webhook in an invisible frame, which can never tell
whether it worked, and needs a permissive `frame-src`. The dashboard server now calls the URL
(only URLs from the config, never from the request; same header check as plugin sync) and the
page shows "done" or the reason it failed. The CSP is back to `frame-src 'none'`.

## Accessibility over a pixel-exact homepage copy (2026-10-24)
An audit against Apple's HIG found homepage's 8px status labels, 80%-opacity status colours
(2.8:1) and thin weights below the minimums. The look stays homepage's; the sizes, weights and
colours follow the minimums, and `tests/design.test.mjs` checks them from the CSS. The
appearance switch got an "auto" position because a two-way switch could never return to
following the system.

## homepage compatibility as a migration path (2026-10-23)
The first real installation replaces a homepage. Reading `homepage.*` labels,
`{{HOMEPAGE_VAR_*}}`, homepage's widget keys (`refreshInterval`, `fields`, `hide_errors`) and
its look means a homepage setup moves over without relabelling containers or renaming
secrets. The homepage-specific widgets (radarr, unraid, ...) still live outside this
repository, in a collection, to keep the core small and to prove the plugin model.

## Several status labels per service (2026-10-23)
homepage shows a label per check (site monitor, ping, container). A single dot hid which check
failed, so `statuses` is a list and each check is its own widget instance.

## Path checks on resolved paths (2026-10-23)
`/widgets/<id>/assets/..%2Fserver.js` passed a "starts with assets/" check on the raw path. Every
check is now done on the result of `safeJoin`, and a test covers the traversal.

## HEAD is answered like GET (2026-10-23)
The `http-status` widget uses HEAD. The dashboard monitoring itself showed "degraded" because
only GET was routed.

## Widgets run in-process (2026-10-23)
A `worker_thread` per widget would limit memory and isolate crashes, but not network or file
access (Node has no per-thread permissions). For v1 the trust model is explicit (security.md)
and every call has a timeout. Workers are on the to-do list for resource isolation.

## Status checks are widgets (2026-10-23)
`siteMonitor`, `ping` and `container` map to the `http-status`, `ping` and `docker` widgets.
The status dot and widgets then share one runtime, cache and error handling, and a third-party
widget can serve as a status check by returning `status`.

## A log file only with logpath (2026-10-24)
homepage writes a log file into the config folder by default. Hard rule 5 keeps the app out of
the user's files, so here the log goes to stdout (docker logs) unless `logpath` asks for a file;
then the rotation is homepage's (10 MiB, five files) and `LOG_TARGETS` works the same.

## The version is shown by default, as in homepage (2026-10-25)
At first the version was hidden unless `hideVersion: false` (2026-10-24: the HIG audit called it
noise for the people using the page). Since every widget comes from the widgets collection, the
footer also tells which collection release runs, which matters when something looks off; so
the version is shown again by default, as in homepage, and `hideVersion: true` hides it. The
update check (once a day, GitHub's newest release) runs only while the version is shown, and
never with `disableUpdateCheck`.

## A mounted Docker socket works without a proxy (2026-10-24)
Mounting `/var/run/docker.sock` is what people try first, and it used to fail with EACCES
because the image ran as `node`. The entrypoint now starts as root, adds `node` to the socket's
group and drops to `node` (su-exec) before anything else runs; with no servers in docker.yaml
the mounted socket is used as `local`. The docker-socket-proxy stays the recommendation: `:ro`
does not limit the Docker API, and widget code runs in the same process.

## The widgets collection is always installed (2026-10-24)
Radarr, Sonarr, Unraid and the rest should work without first finding and adding a plugin
source. The collection stays a separate repository (its own releases, the same contract as any
third-party package), but `DEFAULT_PLUGINS` installs it at `#latest`, locked like any source.
Listing the repository in `settings.yaml` replaces the default, to pin it or use `only:`.
Bundling it in the image was rejected: every widget release would need a new image.

## Lock file instead of always fetching (2026-10-23)
A start must not depend on GitHub or npm being reachable, and must not silently pick up new
code. `plugins.lock.yaml` records the commit or integrity; `?update=1` moves floating refs.
`#latest` is resolved to a release tag once and locked like one, so it saves users from editing a
version without picking up code on a restart.

## Node.js without a build step, one runtime dependency (2026-10-23)
Widget authors write the server and client in the same language. `yaml` is the only runtime
dependency: YAML is the core of the configuration, and a hand-written parser is not worth the bugs.
Docker and Kubernetes are reached with `node:http(s)`, so no SDKs are needed.

## Blocks as the default rendering (2026-10-23)
Most widgets show a few numbers. With declarative `blocks` they need no browser code, look
consistent, and cannot break the page. `client.js` (a Web Component in shadow DOM) is the escape hatch.
