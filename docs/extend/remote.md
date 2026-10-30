# A remote widget

A remote widget lives in a git repository or an npm package. Users add it with one line under
`plugins:`; the dashboard downloads it, pins the version in `plugins/plugins.lock.yaml` and runs
it. The widget is written as [a local one](local.md); this page is about the repository around it.

## 1. Start from the example repository

Start from [homelab-dashboard-widget-example](https://github.com/stefanrenne/homelab-dashboard-widget-example)
(**Use this template** on GitHub): the same widget as
[`examples/widget-template`](../../examples/widget-template), set up as a repository with tests
that run without the dashboard and CI that releases a version tag, so users can install it with
`#latest`. Then give it your widget's id:

```bash
npm run rename -- my-nas --name "My NAS"
```

That renames `example-counter` everywhere: the `id` and `name` in `widget.yaml`, the `hd-<id>`
element in `client.js`, `name` in `package.json` (`hd-widget-<id>`), the README and the tests.

While you write it, point a test dashboard at your clone with `path:` (see
[a local widget](local.md#5-add-it-to-the-dashboard)).

## 2. Document it

Give the widget a `README.md` in its folder, in the format of the
[widgets collection](https://github.com/stefanrenne/homelab-dashboard-widgets), so users find
the same things in the same place:

1. `# <name>`, as in `widget.yaml`.
2. What it shows, and what the user must set up in the service: where the API key is, which ids
   to fill in, when an option is only needed with authentication on.
3. `## Fields`: every block `key`, so users know what to put in `fields:`.
4. `## Example`: a complete `services.yaml` entry, with the key through `{{HD_VAR_...}}`.

Give each option in `widget.yaml` a line comment when its name does not explain it
(`url: { type: url, required: true }   # e.g. http://radarr:7878`).

## 3. Publish

- **git**: push, tag `v1.0.0` (match `version` in widget.yaml). The example repository's CI
  makes a GitHub release of each tag.
- **npm**: `npm publish` (add the keyword `homelab-dashboard-widget`). A package with a
  `package.json` needs `"type": "module"`.

Bump `version` on every release; the dashboard installs each version in its own folder.

## 4. How users install it

```yaml
# settings.yaml
plugins:
  - source: git+https://github.com/you/hd-widget-my-nas#v1.0.0    # a tag, a branch or a 40-character commit
  - source: git+https://github.com/you/hd-widget-my-nas#latest    # the newest release tag, checked hourly
  - source: npm:hd-widget-my-nas@1.0.0
  - source: git+https://github.com/you/widgets#v3.0.0
    subdir: widgets/my-nas                                        # one widget of a repository with several
  - source: git+https://github.com/you/widgets#v3.0.0
    only: [my-nas, my-router]                                     # a collection: only these folders
```

A repository without `widget.yaml` at its root is a collection: every folder with a
`widget.yaml` directly in it, or in its `widgets/` folder, is installed. See
[Plugins](../configuration/settings.md#plugins) for updates, the lock file and `pluginUpdateInterval`.

Users run your code on their server: see [Security](security.md) for what a widget can reach and
what to tell your users.
