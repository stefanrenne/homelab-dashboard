# Widget security

## Trust model

A widget's `server.js` runs **with the dashboard's rights**: network, files in the container,
environment variables. Installing a widget means trusting its author, like
choosing a Docker image. The dashboard limits the damage where it can:

- Plugins come **only from sources listed in `settings.yaml`**, plus the project's own
  [widgets collection](https://github.com/stefanrenne/homelab-dashboard-widgets) (`#latest`), which
  is always installed. The page cannot add a source; `POST /api/plugins/sync` only re-reads the config.
- Sources are **pinned**. A git tag or commit, `#latest` (the newest release tag at install
  time), or an exact npm version, is recommended; a branch or range gives a warning. `plugins/plugins.lock.yaml` records the commit or the npm tarball
  integrity, so a restart installs exactly the same code without network access. A changed npm
  tarball for a locked version is refused.
- `npm pack` runs with `--ignore-scripts`; nothing from a package runs during installation.
- `git`, `npm` and `ping` get validated arguments without a shell (no `-`-prefixed refs or names).
- A built-in widget id cannot be taken over by a plugin.
- The dashboard, and so every widget, runs as the unprivileged `node` user. The entrypoint is
  root only to give `node` a mounted Docker socket's group, before the dashboard starts.
- A mounted Docker socket gives every widget the whole Docker API (`:ro` does not limit it).
  Use a docker-socket-proxy with `CONTAINERS=1` when you install widgets you do not fully trust.

- Installed widgets' `server.js` runs in a **worker thread** with a memory limit
  (`HD_WIDGET_MEMORY_MB`, default 256): a widget stuck in a loop or eating memory stops the
  worker, which starts again, not the dashboard. A worker thread is not a security boundary: it
  has the same network, files and environment. `HD_WIDGET_ISOLATION=off` runs installed widgets
  in the dashboard process, as before.

## Secrets

- Options marked `secret: true`, undeclared options, and every value from `{{HD_VAR_*}}` /
  `{{HD_FILE_*}}` stay on the server. `/api/layout` contains public options only (tested).
- Error messages from widgets and config messages have secret values replaced by `***`.
- The page's Content-Security-Policy restricts `connect-src` to the dashboard itself.

## Recommendations for users

- Prefer widgets whose source you can read; pin tags or commits.
- Put secrets in variables (`HD_VAR_*`) or files (`HD_FILE_*`, e.g. Docker secrets), not in the YAML.
- Do not expose the dashboard to the internet without authentication in front of it (a reverse
  proxy with SSO). It has no login of its own.
- Give Docker access through a socket proxy that only allows reading containers.
