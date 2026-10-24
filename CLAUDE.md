# CLAUDE.md

Context for Claude (and other developers) working on this project.

## What this is

Homelab Dashboard: a self-hosted start page for a homelab, in the spirit of
[homepage](https://gethomepage.dev). Everything is configured in YAML files (services, header
widgets, bookmarks, Docker/Kubernetes discovery). The difference: **widgets are packages that
anyone can publish outside this repository** (a git repo, an npm package or a local folder),
pulled in through `plugins:` in `settings.yaml`. A single Docker container, Node.js without a build step.

## Structure

| Path | What |
|---|---|
| `src/server.js` | Entry point: arguments, listen, signals. |
| `src/app.js` | Application state (config → plugins → registry → discovery → layout), HTTP routes, SSE reload. |
| `src/config/` | `load.js` (YAML files → normalized config, errors with file + path), `vars.js` (`{{HD_VAR_*}}`/`{{HD_FILE_*}}`), `include.js` (`!include`), `watch.js` (recursive, skips `plugins/`). |
| `src/plugins/` | `loader.js` (widget.yaml + server.js → registry), `options.js` (option schema, public/secret split), `runtime.js` (ctx, timeout, cache), `installer.js` (git/npm/path sources + lock file). |
| `src/discovery/` | `docker.js` (labels), `kubernetes.js` (Ingress annotations), `labels.js`, `index.js` (polling + merge with YAML). |
| `src/layout.js` | Widget instances (server side) and the layout JSON (browser side). |
| `public/index.html` | The dashboard. A single file, vanilla JS, no build step. |
| `widgets/` | Built-in widgets. Same contract as external ones (hard rule 3). Only generic ones and those behind a core feature (`container:`, `proxmoxNode:`, `app:`, `siteMonitor:`, `ping:`); a widget for an outside service goes in the collection. |
| `examples/widget-template/` | Copy-and-go template for widget authors; covered by tests. Its repository form is `../homelab-dashboard-widget-example` ([GitHub](https://github.com/stefanrenne/homelab-dashboard-widget-example)); keep the two in step. |
| `config.example/` | Example config: the default for an empty `/config` and for `npm run dev`. |
| `deploy/` | Your own installations (config, compose file, preview scripts). Ignored by git; never referenced from the rest of the codebase. |
| `tests/` | `node:test` for everything, jsdom for the frontend, fixtures in `tests/fixtures/`. |
| `docker/start.sh` | Image entrypoint: Docker socket group for `node`, example config into an empty `/config`, then the dashboard as `node`. |
| `scripts/pages.sh`, `scripts/pages-widgets.mjs` | Stage the GitHub Pages site: `docs/`, the README as home page, a page per widget. |
| `scripts/screenshots.mjs` | Recreates the README screenshots (Playwright, not in `package.json`). |
| `../homelab-dashboard-widgets` | Separate repo ([GitHub](https://github.com/stefanrenne/homelab-dashboard-widgets)): the homepage-style widgets (radarr, unraid, ...) as a collection. Not part of this codebase on purpose. |
| `.github/` | CI (tests, image smoke test, amd64+arm64 image to GHCR, release on a tag), Dependabot and its auto-merge. |
| `docs/` | Architecture, configuration, widgets (authoring, API reference, security), discovery, development, publishing, decisions. Published as a GitHub Pages site (`docs/_config.yml`: titles and menu order; `scripts/pages.sh` adds the README as home page). A new page gets an entry under `defaults:` in `_config.yml`. |
| `todo.md` / `completed.md` | Open and finished work. Update them when you pick something up or finish it. |
| `CHANGELOG.md` | What changed per version, for users. A user-visible change gets a line under `## [Unreleased]`. |

## Commands

```bash
npm ci && npm test            # all tests (package-lock.json is committed)
npm run dev                   # http://localhost:3000 with config.example, hot reload of the YAML
docker build -t homelab-dashboard .
```

Run the tests before every commit. CI (`.github/workflows/ci.yml`) does the same, then builds
the image and smoke-tests it.

## Hard rules

1. **Secrets never reach the browser.** Options marked `secret: true`, options a widget does not
   declare, and every value filled in from `{{HD_VAR_*}}`/`{{HD_FILE_*}}` exist only on the server.
   `/api/layout` carries public options only, and error messages are scrubbed. A test checks
   that a secret never appears in `/api/layout`; keep it passing.
2. **The widget API is a versioned contract** (`apiVersion` in widget.yaml). Within one version the
   `ctx` fields, the result format (`status`, `latency`, `blocks`) and the `client.js` properties
   (`data`, `options`, `t`, `error`) only change in a backward-compatible way. A breaking change
   means a new `apiVersion` next to the old one, which stays supported. Every change goes into
   `docs/widgets/api-reference.md` (with the version that introduced it).
3. **Built-in widgets use only the public widget API.** No imports from `src/`. If a built-in
   widget needs more, the API gets it first (documented, tested), so external authors get it too.
4. **A widget can never take down the server.** Every call has a timeout and a try/catch; a failure
   ends up on the widget's card. The same holds for broken packages, unknown types and bad options:
   they become messages, never exceptions.
5. **The user's files are never written.** The app only writes under `<config>/plugins/`
   (downloaded packages and `plugins.lock.yaml`), and a log file under `logpath` when the user
   sets one (`src/log.js`).
6. **Config files are a contract** with existing installations. Change them in a
   backward-compatible way only. When a key is renamed, the old one keeps working with a warning.
   Describe it under "Migration" in `docs/configuration.md`, and add a test with config in the old form.
7. **Minimal dependencies.** Runtime: only `yaml`. Anything else needs a reason in `docs/decisions.md`.
8. **Host paths, sockets and API URLs via module constants or parameters** (`DEFAULT_SOCKET`,
   `K8S_SA_DIR`, `configDir`, ...) so tests can replace them.
9. **Docker is read-only.** Only GET calls on the Docker API. Recommend a socket proxy in the docs.
10. **External code is run, never fetched implicitly.** Plugins are installed only from sources the
    user listed plus `DEFAULT_PLUGINS` (the project's own widgets collection, `#latest`), are pinned through the lock file, and arguments to `git`/`npm`/`ping` are
    validated and passed without a shell.
11. **Nothing installation-specific outside `deploy/`.** No host names, IP addresses, user names
    or personal config in `src/`, `public/`, `widgets/`, `docs/`, tests or examples; use
    `example.com`/`*.lan` and made-up data. `deploy/` is in `.gitignore`.

## Conventions

- **Every widget has a docs page** on the GitHub Pages site, generated by
  `scripts/pages-widgets.mjs` from `widgets/<id>/README.md` plus `widget.yaml`. The README holds,
  in this order:
  1. `# <name>`: exactly the `name` in widget.yaml.
  2. What it shows, and the setup the user must do: where to find the API key or token, which
     ids or names to fill in, required permissions or service versions, a socket proxy, ...
  3. `Learn more about [<service>](<url>).` for widgets of a third-party service.
  4. `## Fields`: every block `key` the widget can return, in backticks (or a sentence when the
     blocks are not fixed). A test checks them against `server.js`.
  5. `## Example`: a complete `services.yaml` (or `widgets.yaml`) entry with `type: <id>`, secrets
     through `{{HD_VAR_...}}`, made-up hosts (`*.lan`).
  The options table, version and source link are generated: every option in widget.yaml gets a
  line comment (`# e.g. http://radarr:7878`) when its name does not explain it. A new option,
  field or setup step updates the README in the same commit. The widgets collection follows the
  same format (its CLAUDE.md); the site shows the collection's newest release.
- Everything is **English**: code comments, log lines, Markdown docs, this file. Only UI texts in
  `I18N` (and widget `i18n.json`) are translated.
- The UI is multilingual (en, nl, fr, de, es, ca, he, hr, hu, it, nb-NO, pt, ru, sv, vi, zh-Hans,
  zh-Hant; homepage's set plus nl): all page texts live in `I18N` in `index.html` and go through
  `translate()`. A new text gets a key in **every** language; a test checks this, also for the
  `i18n.json` of built-in widgets. Hebrew is right-to-left: use logical CSS properties
  (`inset-inline-end`, `padding-inline-start`), not left/right.
- Config errors and warnings always name the file and a path into it (`services.yaml › [0].Network[1].Router`).
- Small, focused changes. New logic gets a test. Bugs get a test that fails without the fix.
- Frontend: no frameworks, no build step, no external assets except Google Fonts (with a system
  fallback) and the icon CDN for icons the user names. All text goes in through `textContent`.
- **Design minimums are tested** (`tests/design.test.mjs`): text in rem, status colours ≥ 4.5:1 in
  both appearances, no weight below 400 for content, labels ≥ 11px, targets ≥ 28px (touch) and
  32px footer buttons, Reduce Motion and Increase Contrast handled. Change the test only with a reason.
- **README screenshots must match the current dashboard.** A visible UI change refreshes
  `docs/images/` and the alt texts in the README in the same commit (`node scripts/screenshots.mjs`).
- New widget API features are shown in `examples/widget-template` when they are useful to authors.

## Pitfalls we already ran into

See `docs/decisions.md` for the background. In short:
- A path check must happen on the **resolved** path: `assets/../server.js` starts with `assets/`.
- The dashboard runs as `node` (uid 1000); `/var/run/docker.sock` is usually `root:root 660`.
  `docker/start.sh` starts as root, adds `node` to the socket's group and drops to `node` with
  su-exec. Started with `--user`, that step is skipped and discovery gets EACCES without
  `--group-add <gid of the socket>`. Never run `server.js` itself as root.
- BusyBox `ping` needs root; the image installs `iputils-ping`. macOS and Linux disagree on `-W`
  units, so the ping widget relies on the process timeout instead.
- `fs.watch` on macOS can report one save as several events spread beyond the debounce; tests
  must not count exact events.
- A widget package with a `package.json` needs `"type": "module"`, otherwise Node warns and reparses.
- `HEAD` must be answered like `GET`: status checks (including on this dashboard) use HEAD.
- `os.freemem()` on macOS only counts free pages, so memory looks almost full in development.
- Do not name a CSS class `row` or `column` for layout: `.row` is the widget row style.
- Node majors alternate LTS (even) and short-lived (odd). Dependabot once auto-merged
  `node:25-alpine`; Node majors are now ignored by Dependabot and bumped by hand to the next LTS.
- Docker's `label` filter is AND-only; discovery lists all containers and matches both
  `homelab.*` and `homepage.*` itself.
- Values in discovered labels must go through `substitute()` too, or `{{HOMEPAGE_VAR_*}}`
  stays literal and its value is not known as a secret.
