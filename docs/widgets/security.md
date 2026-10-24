# Widget security

## Trust model

A widget's `server.js` runs **inside the dashboard process with the same rights**: network, files
in the container, environment variables. Installing a widget means trusting its author, like
choosing a Docker image. The dashboard limits the damage where it can:

- Plugins come **only from sources listed in `settings.yaml`**. The page cannot add a source;
  `POST /api/plugins/sync` only re-reads the config.
- Sources are **pinned**. A git tag or commit, `#latest` (the newest release tag at install
  time), or an exact npm version, is recommended; a branch or range gives a warning. `plugins/plugins.lock.yaml` records the commit or the npm tarball
  integrity, so a restart installs exactly the same code without network access. A changed npm
  tarball for a locked version is refused.
- `npm pack` runs with `--ignore-scripts`; nothing from a package runs during installation.
- `git`, `npm` and `ping` get validated arguments without a shell (no `-`-prefixed refs or names).
- A built-in widget id cannot be taken over by a plugin.
- The container runs as an unprivileged user.

Not (yet) done: running `server.js` in a separate worker with its own limits. See `todo.md`.

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
