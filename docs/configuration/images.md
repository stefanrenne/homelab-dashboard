# Images

Wherever the config takes an icon (a service's `icon`, a bookmark, a group's `icon` in `layout`,
`favicon`, a widget option of type `icon`), it takes the same forms, as in homepage. Most icons
come from a free icon set on a CDN; the browser loads them from there, the dashboard itself does
not.

| Form | Provider | Browse |
|---|---|---|
| `plex`, `plex.svg`, `plex.webp` | [Dashboard Icons](https://github.com/homarr-labs/dashboard-icons) by Homarr: logos of self-hosted apps (png without an extension) | [dashboardicons.com](https://dashboardicons.com) |
| `sh-plex`, `sh-plex.svg`, `sh-plex.webp` | [selfh.st icons](https://github.com/selfhst/icons): logos of self-hosted apps (png without an extension) | [selfh.st/icons](https://selfh.st/icons/) |
| `mdi-flask-outline` | [Material Design Icons](https://github.com/Templarian/MaterialDesign) by Pictogrammers: general-purpose symbols | [pictogrammers.com/library/mdi](https://pictogrammers.com/library/mdi/) |
| `si-plex` | [Simple Icons](https://github.com/simple-icons/simple-icons): brand logos | [simpleicons.org](https://simpleicons.org) |
| `/icons/<file>` | Your own: a file in the `icons` folder of your config | |
| `https://...` | Any image on the web | |

```yaml
# services.yaml
- Media:
    - Plex:
        icon: plex.svg                  # Dashboard Icons, as svg
    - Jellyfin:
        icon: sh-jellyfin               # selfh.st icons, as png
    - Backups:
        icon: mdi-backup-restore-#4ade80   # Material Design Icons, in green
    - GitHub:
        icon: si-github                 # Simple Icons
    - Garage door:
        icon: /icons/garage.svg         # config/icons/garage.svg
    - Camera:
        icon: https://example.com/camera.png
```

## Colours of single-colour icons

`mdi-` and `si-` icons are single-coloured. They follow `iconStyle` in
[settings.yaml](settings.md): `gradient` (the default, the accent colour as a gradient) or
`theme` (flat, in the theme's text colour). Or give one its own colour as a suffix:
`mdi-flask-outline-#f0d453`, `si-plex-#e5a00d`.

## Your own icons

Put image files (svg, png, webp, ...) in an `icons` folder in your config folder and use them as
`/icons/<file>`, also in subfolders (`/icons/brands/nas.svg`). The dashboard serves only that
folder. Nothing is fetched from elsewhere, so this also works without internet access.

## Background image

`background` in [settings.yaml](settings.md) takes a URL or a file in `icons/`
(`background: /icons/wallpaper.jpg`), with optional blur, saturation, brightness and opacity.
`cardBlur` frosts the cards over it.
