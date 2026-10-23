# Publishing

1. Make sure `CHANGELOG.md` has everything under `## [Unreleased]`.
2. Choose the version (semver). Bump `version` in `package.json` (`npm version <x.y.z> --no-git-tag-version`).
3. Rename `## [Unreleased]` to `## [x.y.z] - YYYY-MM-DD` and add a fresh empty `## [Unreleased]`.
4. Commit, tag `vx.y.z`, push with tags. CI runs the tests, builds the image and smoke-tests it.
5. Pushing the image to a registry is not automated yet (see `todo.md`).

A change to the widget API is a release note of its own: say which `apiVersion` it belongs to.
