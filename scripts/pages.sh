#!/bin/sh
# Stages the GitHub Pages site in <out>: docs/ as it is (docs/README.md is the home page).
# Links that point outside docs/ go to the file on GitHub, since only docs/ is published, and
# every page is wrapped in {% raw %} so Liquid leaves {{HD_VAR_*}} in the examples alone.
# Then, when a checkout of the widgets collection (and its tag) is given, scripts/widget-images.mjs
# photographs each widget with example data (when Playwright is installed) and
# scripts/pages-widgets.mjs adds a page per widget.
#   scripts/pages.sh <out> [owner/repo] [<collection checkout> <tag>]
set -eu
out=$1
repo=${2:-stefanrenne/homelab-dashboard}
collection=${3:-}
tag=${4:-}
tree="https://github.com/$repo/tree/main"

rm -rf "$out"
cp -R docs "$out"
find "$out" -name '*.md' | while read -r f; do
  # kramdown leaves Markdown inside an HTML block alone unless the block asks for it
  sed -i.bak 's#<details>#<details markdown="1">#g' "$f" && rm "$f.bak"
  # one ../ per folder below docs/, plus one, leaves docs/: such links go to GitHub
  rel=${f#"$out"/}
  up="\.\./"
  while [ "${rel#*/}" != "$rel" ]; do rel=${rel#*/}; up="$up\.\./"; done
  sed -i.bak "s#](\($up\)#]($tree/#g" "$f" && rm "$f.bak"
done
# empty front matter makes each file a page; raw keeps {{...}} literal
find "$out" -name '*.md' | while read -r f; do
  { printf -- '---\n---\n{%% raw %%}\n'; cat "$f"; printf '\n{%% endraw %%}\n'; } > "$f.tmp" && mv "$f.tmp" "$f"
done
# widget pages carry their own front matter and raw wrapping, so they come last
if [ -n "$collection" ]; then
  if node -e "import('playwright').catch(() => process.exit(1))" 2>/dev/null; then
    node scripts/widget-images.mjs "$out/widgets/collection/images" "$collection"
  else
    echo "no Playwright: widget pages without example images"
  fi
  node scripts/pages-widgets.mjs "$out" "$collection" "$tag"
fi
