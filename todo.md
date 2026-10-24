# To do

Open work, roughly in order of value. Move an item to `completed.md` when it is done.

## Release

- [ ] Release the widgets collection (its CHANGELOG's Unreleased: 0.3.0, every homepage widget) before
  the next dashboard release, which no longer has openmeteo, openweathermap and stocks built in.
  Waits for the go-ahead.

## Other

- [ ] Run widget `server.js` in a `worker_thread` with resource limits (see docs/widgets/security.md).
- [ ] A widget catalogue: an index (YAML in a separate repo) of known widget packages, shown in the docs.
- [ ] `hd widget new <id>` / `npm create` scaffolding from the template.
- [ ] Polling fallback for the config watcher on network file systems (`HD_WATCH_POLL`).
