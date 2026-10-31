# To do

Open work, roughly in order of value. Move an item to `completed.md` when it is done.
The widgets collection keeps its own list: `../homelab-dashboard-widgets/todo.md`.

## Tests and CI

- [ ] **CI tests against widgets collection v0.4.0.** `.github/workflows/ci.yml` checks out the
  collection at a pinned `v0.4.0`, so the tests that read the collection (widget pages, attributes,
  README examples, `scripts/fakes.mjs`) never see anything newer in CI. Test against the newest
  release, as the Pages workflow does, or bump the pin with every collection release.
- [ ] **`tests/frontend.test.mjs` leaves timers running.** Run on its own
  (`node --test tests/frontend.test.mjs`) the process stays alive for minutes after the last
  test; `npm test` hides it with `--test-force-exit`. Find what jsdom keeps alive after
  `window.close()` (the toast timer, the offline retry `setTimeout(load, 5000)`, the pollers) and
  clear it, so a failing test cannot hang a run either.
- [ ] **Check the docs' code blocks with Rouge in the Pages workflow.** The site's highlighter
  marks some valid YAML red (keys with `[ ]` or `'`); `tests/pages.test.mjs` catches the known
  cases with a regex. The Pages build has Ruby: run `rougify` on every code block of `docs/` and
  the widget pages and fail on a highlighter error.
- [ ] **A test for the Kubernetes annotation `homelab.dev/filter`.** Only the Docker label
  `homelab.filter` is tested (`tests/discovery.test.mjs`).

## Filters

- [ ] **Hidden cards cannot be seen at all.** A dashboard with filters gives no sign that cards
  are hidden. A footer toggle ("show 3 hidden") or a count per group would let a viewer check
  what the filters hide.
- [ ] **Filter recipes in the docs.** Filtering services has one example (Shelly). Add a few
  that use the new attributes: Radarr only with a blocked import
  (`widget.attention == false`), Proxmox only with a stopped VM (`widget.vmsStopped == 0`), a
  speed test below a threshold (`widget.download > 100`).

## Docs site

- [ ] **Versions in the docs before 1.0.** The Migration section of
  `docs/configuration/README.md` and the API reference's Changes table still name versions;
  CLAUDE.md rules 2 and 6 require them, the wish is no versions before 1.0. Decide, and change
  the rules or the pages to match.
- [ ] **Cache Playwright in the Pages workflow.** Every build installs Playwright and Chromium
  for the widget images (a minute or two).
- [ ] **Widget images are dark only** while the docs theme is light; consider a light variant
  or a frame around them.

## Housekeeping

- [ ] **CLAUDE.md hard rule 11** still names a `widgets/` folder, which this repository no longer
  has.
- [ ] **Release the widget example repo.** `homelab-dashboard-widget-example` has the attributes
  (57df532) on `main`, but no release, so `#latest` installs still get the old version.

## Other

- [ ] A widget catalogue: an index (YAML in a separate repo) of known widget packages, shown in the docs.
