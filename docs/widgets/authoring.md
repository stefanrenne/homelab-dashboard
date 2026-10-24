# Writing a widget

A widget is a folder that you keep in your own repository. The dashboard never needs a change to run it.

## 1. Start from the template

Start from [homelab-dashboard-widget-example](https://github.com/stefanrenne/homelab-dashboard-widget-example) (**Use this template** on GitHub): the
same widget as [`examples/widget-template`](../../examples/widget-template), set up as a
repository with tests that run without the dashboard and CI that releases a version tag, so
users can install it with `#latest`. Then rename:

- `id`, `name` and `version` in `widget.yaml`
- `hd-example-counter` in `client.js` → `hd-<your id>`
- `name` in `package.json` (convention: `hd-widget-<id>`)

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

## 6. Publish

- **git**: push, tag `v1.0.0` (match `version` in widget.yaml). Users add
  `source: git+https://github.com/you/hd-widget-x#v1.0.0`. Several widgets in one repo:
  users add `subdir: widgets/x`.
- **npm**: `npm publish` (add the keyword `homelab-dashboard-widget`). Users add
  `source: npm:hd-widget-x@1.0.0`.

Bump `version` on every release; the dashboard installs each version in its own folder.
