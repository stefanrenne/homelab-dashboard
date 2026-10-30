# Development

Requirements: Node.js 22+, git. Docker for the image.

```bash
npm ci
npm test                 # node:test, all files in tests/
npm run dev              # http://localhost:3000 with config.example
node src/server.js --config ~/my-test-config --port 3001
```

- The tests load every widget from a checkout of the
  [widgets collection](https://github.com/stefanrenne/homelab-dashboard-widgets): clone it next to
  this repository (`../homelab-dashboard-widgets`) or point `HD_COLLECTION_DIR` at one.
- The YAML reloads on save; changes to `src/` or `public/` need a restart.
  `public/index.html` only needs a browser refresh.
- `tests/helpers.mjs` has `tmpDir`, `writeWidget`, `serve` (HTTP on a port or a unix socket) and
  `fakeCtx` for calling a widget's `fetch` directly.
- Fake Docker and Kubernetes responses live in `tests/fixtures/`.

## Screenshots

The README and home page screenshots are made from the showcase config in `scripts/showcase/`.
Its widgets ask the widgets collection's fake homelab (`scripts/mock-homelab.mjs` in the
collection, answering from its fixtures); status checks and system resources are stubbed, so the
pictures are the same on every run:

```bash
npm install --no-save playwright && npx playwright install chromium
node scripts/screenshots.mjs
```

The example image on each widget's page is made the same way, from the example in the widget's
README, by `scripts/widget-images.mjs` while the site is built. To look at them locally:

```bash
node scripts/widget-images.mjs /tmp/widget-images
```

A widget whose example gets no data from the fixtures (or reports an error) gets no image; fix its
README example or fixture in the collection.
