# Writing a widget

A widget is a folder that you keep in your own repository. The dashboard never needs a change to run it.

## 1. Start from the template

Start from [homelab-dashboard-widget-example](https://github.com/stefanrenne/homelab-dashboard-widget-example) (**Use this template** on GitHub): the
same widget as [`examples/widget-template`](../../examples/widget-template), set up as a
repository with tests that run without the dashboard and CI that releases a version tag, so
users can install it with `#latest`. Then give it your widget's id:

```bash
npm run rename -- my-nas --name "My NAS"
```

That renames `example-counter` everywhere: the `id` and `name` in `widget.yaml`, the `hd-<id>`
element in `client.js`, `name` in `package.json` (`hd-widget-<id>`), the README and the tests.

Without GitHub, `npm run new-widget -- my-nas [folder]` in a clone of the dashboard copies
`examples/widget-template` to a new folder with the same renaming.

## 2. Declare the options

Every option you read goes into `options:` in `widget.yaml`. Mark API keys, passwords and tokens
`secret: true`. Users fill them in with `{{HD_VAR_...}}`, but the flag is what keeps them out of the
browser even when someone types the key in directly.

## 3. Write `fetch(ctx)`

Fetch from the service with `ctx.fetch`, then return `blocks`:

```js
export default {
  async fetch(ctx) {
    const res = await ctx.fetch('/api/summary', { headers: { 'X-Api-Key': ctx.options.key } });
    if (!res.ok) throw new Error(`answered ${res.status}`);
    const s = await res.json();
    return {
      status: 'up',
      blocks: [
        { label: 'queries', value: s.queries },
        { label: 'blocked', value: s.blocked_percentage, unit: '%' },
      ],
    };
  },
};
```

Guidelines:
- Throw an error with a short, useful message. It appears on the card.
- Keep it fast; the call is aborted after 10 seconds. Pass `ctx.signal` on to anything long-running.
- Return `null` for values that are unknown, rather than 0.
- Keep 2–5 blocks. A card is small.

## 4. Optional: a custom look

Add `client.js` when blocks are not enough (a chart, a list, a progress bar). See the
[API reference](api-reference.md#clientjs). Render in the shadow root and use the theme variables.

## 5. Try it locally

```yaml
# settings.yaml of a test config
plugins:
  - path: /absolute/path/to/your/widget
```

`npm run dev` in the dashboard repository (with `--config` pointing at your test config) reloads the
widget whenever you save a YAML file. A broken manifest or an unsupported `apiVersion` appears
at the top of the page.

Test `fetch` without the dashboard by calling it with a fake ctx. `tests/installer.test.mjs` in
the dashboard repo shows how the template is tested end to end.

## 6. Document it

Give the widget a `README.md` in its folder, in the format the built-in widgets and the
[widgets collection](https://github.com/stefanrenne/homelab-dashboard-widgets) use, so users find
the same things in the same place:

1. `# <name>`, as in `widget.yaml`.
2. What it shows, and what the user must set up in the service: where the API key is, which ids
   to fill in, when an option is only needed with authentication on.
3. `## Fields`: every block `key`, so users know what to put in `fields:`.
4. `## Example`: a complete `services.yaml` entry, with the key through `{{HD_VAR_...}}`.

Give each option in `widget.yaml` a line comment when its name does not explain it
(`url: { type: url, required: true }   # e.g. http://radarr:7878`).

## 7. Publish

- **git**: push, tag `v1.0.0` (match `version` in widget.yaml). Users add
  `source: git+https://github.com/you/hd-widget-x#v1.0.0`. Several widgets in one repo:
  users add `subdir: widgets/x`.
- **npm**: `npm publish` (add the keyword `homelab-dashboard-widget`). Users add
  `source: npm:hd-widget-x@1.0.0`.

Bump `version` on every release; the dashboard installs each version in its own folder.
