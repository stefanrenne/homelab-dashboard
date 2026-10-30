# A local widget

A local widget is a folder on the machine that runs the dashboard. The dashboard runs it as it
is: no repository, no release. It is the quickest way to a widget of your own, and the way to try
one out while you write it.

## 1. Make the folder

Copy [`examples/widget-template`](../../examples/widget-template) into your config folder, for
example as `my-widgets/my-nas`. Or, in a clone of the dashboard:

```bash
npm run new-widget -- my-nas ./config/my-widgets/my-nas
```

That copies the template with `example-counter` renamed to `my-nas` everywhere: the `id` and
`name` in `widget.yaml`, the `hd-<id>` element in `client.js`, the README and the tests.

## 2. Declare the options

Every option you read goes into `options:` in `widget.yaml`. Mark API keys, passwords and tokens
`secret: true`. Users fill them in with `{{HD_VAR_...}}`, but the flag is what keeps them out of the
browser even when someone types the key in directly.

```yaml
# widget.yaml
id: my-nas
name: My NAS
version: 1.0.0
apiVersion: 1
description: Free space and running jobs of the NAS.
options:
  url: { type: url, required: true }     # e.g. http://nas.lan:5000
  key: { type: string, secret: true, required: true }
```

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

## 5. Add it to the dashboard

```yaml
# settings.yaml
plugins:
  - path: ./my-widgets/my-nas        # relative to the config folder, or absolute
```

```yaml
# services.yaml
- Storage:
    - NAS:
        href: http://nas.lan:5000
        widget:
          type: my-nas
          url: http://nas.lan:5000
          key: "{{HD_VAR_NAS_KEY}}"
```

A `path:` widget is read again whenever a YAML file is saved: save `settings.yaml` after changing
`server.js` and the open page shows the new version. A broken manifest or an unsupported
`apiVersion` appears at the top of the page. A local widget with the same id as one in the
widgets collection takes its place, which is how you try a change to a collection widget.

`npm run dev` in the dashboard repository (with `--config` pointing at a test config) is handy
while writing one.

## 6. Test it

Test `fetch` without the dashboard by calling it with a fake `ctx`; the template's tests show how.
`tests/installer.test.mjs` in the dashboard repository tests the template end to end.

Ready to share it? Make it [a remote widget](remote.md).
