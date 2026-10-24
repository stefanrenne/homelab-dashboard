# Logo

A logo in the header. Without `icon` it shows the dashboard's own mark in the theme colour; with
`icon` any icon the dashboard knows: a dashboard-icons name (`proxmox.svg`), `mdi-…`, `si-…`
(both in the theme colour, or with a colour suffix such as `mdi-home-#38bdf8`), `sh-…`, a file
in your config's `icons` folder (`/icons/logo.png`) or a URL.

## Example

```yaml
# widgets.yaml
- logo:
    icon: /icons/logo.svg
```
