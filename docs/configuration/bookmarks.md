# Bookmarks

`bookmarks.yaml` holds groups of plain links, shown below the service groups (or between them,
with `layout` in [settings.yaml](settings.md)).

```yaml
- Developer:
    - GitHub:
        - abbr: GH
          href: https://github.com
          icon: github.svg
```

The homepage form (a one-item list) and a plain map (`GitHub: { href: ... }`) both work.

`icon` takes the same forms as a service icon; see [Images](images.md). `abbr` is shown when
there is no icon. With `bookmarksStyle: icons` in settings.yaml, or `iconsOnly: true` on a group
in `layout`, a group shows only its icons.
