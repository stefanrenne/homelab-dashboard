# To do

Open work, roughly in order of value. Move an item to `completed.md` when it is done.

- [ ] Publish the image (GHCR) from CI on a `v*` tag; see docs/publishing.md.
- [ ] Kubernetes: also read `kubeconfig` (mode `kubeconfig`) for running outside the cluster.
- [ ] Kubernetes: discover Services and Traefik IngressRoutes, not only Ingresses.
- [ ] `HD_ALLOWED_HOSTS` check on the Host header (DNS rebinding), like homepage's `HOMEPAGE_ALLOWED_HOSTS`.
- [ ] Run widget `server.js` in a `worker_thread` with resource limits (see docs/widgets/security.md).
- [ ] A widget catalogue: an index (YAML in a separate repo) of known widget packages, shown in the docs.
- [ ] `hd widget new <id>` / `npm create` scaffolding from the template.
- [ ] Tabs (`layout.<group>.tab`), like homepage.
- [ ] Search suggestions in the search widget (homepage's `showSearchSuggestions`), through the server because of the CSP.
- [ ] homepage's `expanded` resources and per-disk labels.
- [ ] Custom CSS/JS files from the config folder (`custom.css`).
- [ ] Polling fallback for the config watcher on network file systems (`HD_WATCH_POLL`).
