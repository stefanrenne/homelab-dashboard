# Custom CSS & JS

A `custom.css` and a `custom.js` in the config folder are loaded after the page's own style and
script, as in homepage. Refresh the browser after a change: unlike the YAML files, they do not
reload the open pages.

```css
/* custom.css */
:root {
  --hd-card: rgb(30 41 59 / 0.6);   /* the card background */
}
.card {
  border-radius: 12px;
}
```

```js
// custom.js
document.title = `${document.title} · lab`;
```

The page's colours are CSS variables on `:root` (`--hd-bg`, `--hd-card`, `--hd-text`,
`--hd-muted`, `--hd-accent`, `--hd-ok`, `--hd-warn`, `--hd-error`, ...), set for the light and the
dark theme. Override them in `custom.css` for a theme of your own. Class names of the page may change
between versions; variables are the steadier hook.

Both files are your own code on your own page: the page's Content Security Policy allows them
like the page's own script. Only put in what you trust.
