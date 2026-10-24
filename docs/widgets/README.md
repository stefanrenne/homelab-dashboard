# Widgets

A widget is a package: a folder with a `widget.yaml` and usually a `server.js`, kept in its own
repository and pulled in through `plugins:` in `settings.yaml`. The built-in widgets follow the
same contract, so anything they do, a third-party widget can do too.

| Page | What |
|---|---|
| [Writing a widget](authoring.md) | From the template to a released package, step by step |
| [API reference](api-reference.md) | `widget.yaml`, the `ctx` passed to `server.js`, the result format, `client.js` |
| [Security](security.md) | What a widget can do, how secrets stay on the server, advice for users |

Ready-made widgets:

- [homelab-dashboard-widgets](https://github.com/stefanrenne/homelab-dashboard-widgets): Radarr,
  Sonarr, Unraid, Portainer and more; always installed.
- [homelab-dashboard-widget-example](https://github.com/stefanrenne/homelab-dashboard-widget-example):
  a complete example repository to start your own from.
