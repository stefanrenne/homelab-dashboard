# Development

Requirements: Node.js 22+, git. Docker for the image.

```bash
npm ci
npm test                 # node:test, all files in tests/
npm run dev              # http://localhost:3000 with config.example
node src/server.js --config ~/my-test-config --port 3001
```

- The YAML reloads on save; changes to `src/` or `public/` need a restart.
  `public/index.html` only needs a browser refresh.
- `tests/helpers.mjs` has `tmpDir`, `writeWidget`, `serve` (HTTP on a port or a unix socket) and
  `fakeCtx` for calling a widget's `fetch` directly.
- Fake Docker and Kubernetes responses live in `tests/fixtures/`.

## Screenshots

The README screenshots are made from `config.example`, with widget data stubbed so they are stable:

```bash
npm install --no-save playwright && npx playwright install chromium
node scripts/screenshots.mjs
```
