# Publishing

CI (`.github/workflows/ci.yml`) does the work; a release is a tag.

| Event | What CI does |
|---|---|
| Pull request | Tests, an amd64 image build and a smoke test. Nothing is pushed. |
| Push to `main` | The same, then `ghcr.io/stefanrenne/homelab-dashboard:latest` and `:sha-<short>` for amd64 and arm64. The version in the image is `main-<short sha>`, or `X.Y.Z` when the commit carries the release tag `vX.Y.Z` (so `latest` of a release shows its number). A push that changes only `docs/`, `scripts/`, `tests/`, `examples/` or Markdown runs the tests but builds no image, so `latest` stays as it was. |
| Tag `vX.Y.Z` | The same, tagged `X.Y.Z` and `X.Y`, and a GitHub release with that version's CHANGELOG section. |
| Run by hand on `main` | As a tag, for `package.json`'s version when it is not released yet: CI creates the tag `vX.Y.Z` with the release. For when a tag cannot be pushed. Otherwise as a push to `main`. |
| Monday 04:23 UTC | Rebuild of `latest`, so base image security fixes arrive without a code change; versioned as a push to `main`. |

## Release steps

1. Make sure `CHANGELOG.md` has everything under `## [Unreleased]`.
2. Choose the version (semver) and set it in `package.json` (`npm version <x.y.z> --no-git-tag-version`).
3. Rename `## [Unreleased]` to `## [x.y.z] - YYYY-MM-DD` and add a fresh empty `## [Unreleased]` above it.
4. Commit, `git tag -a vx.y.z -m vx.y.z`, `git push --follow-tags` (`--follow-tags` only pushes
   annotated tags; a plain `git tag` stays local). CI fails the release when the CHANGELOG has
   no section for the version. Without a tag push: push `main` and run the CI workflow by hand on
   `main` (**Actions > CI > Run workflow**); a version that is released already gives a normal
   `main` build (Dependabot's auto-merge starts such runs too).

A change to the widget API is a release note of its own: say which `apiVersion` it belongs to.

## Documentation site

`.github/workflows/pages.yml` publishes `docs/` and the README as
[stefanrenne.github.io/homelab-dashboard](https://stefanrenne.github.io/homelab-dashboard/) on
every push to `main` that touches them. Jekyll builds it with the just-the-docs theme; the
Markdown stays plain (no front matter), titles and the menu order are in `docs/_config.yml`.
`scripts/pages.sh` stages the site: it adds the README as home page, points links outside
`docs/` at GitHub, and wraps each page in `{% raw %}` so `{{HD_VAR_*}}` examples stay literal.
`scripts/pages-widgets.mjs` then adds a page per widget from its `README.md` and `widget.yaml`,
for the widgets collection at its newest release (checked out by the workflow). A daily run picks up a new collection release.

## Dependabot

`.github/dependabot.yml` opens grouped weekly PRs for GitHub Actions, npm and the Docker base
image. The Node major in the image is kept on an LTS line by hand (Dependabot ignores Node majors). `dependabot-automerge.yml` merges them when CI passes. A PR that changes a workflow file
needs a fine-grained token in the repository secret `AUTOMERGE_TOKEN` (Contents, Pull requests and
Workflows: read and write); without it those PRs wait for a manual merge.
