# Example counter (widget template)

A starting point for your own homelab-dashboard widget. Copy this folder into its own
repository, change `id`, `name` and the code, and publish it.

## Use it

```yaml
# settings.yaml
plugins:
  - source: git+https://github.com/you/hd-widget-example-counter#v1.0.0
  # or: - source: npm:hd-widget-example-counter@1.0.0
  # or, while developing: - path: ./my-widgets/example-counter

# services.yaml
- Apps:
    - My app:
        href: http://app.lan
        widget:
          type: example-counter
          url: http://app.lan/api/
          key: "{{HD_VAR_APP_KEY}}"
```

## Files

| File | Required | What |
|---|---|---|
| `widget.yaml` | yes | Manifest: id, version, apiVersion, refresh, options schema |
| `server.js` | no | Fetches data on the server; may use secret options |
| `client.js` | no | Custom rendering as a Web Component `hd-<id>`; without it the dashboard renders `blocks` |
| `i18n.json` | no | Labels per language (`en`, `nl`, `fr`, `de`, `es`) |
| `assets/` | no | Static files for `client.js`, served at `/widgets/<id>/assets/` |

Release by tagging a version (`git tag v1.0.0`) or `npm publish`, and bump `version` in
`widget.yaml` at the same time. See the dashboard's `docs/widgets/authoring.md` for the full guide.
