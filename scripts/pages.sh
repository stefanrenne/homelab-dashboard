#!/bin/sh
# Stages the GitHub Pages site in <out>: docs/ as it is, plus README.md as the home page.
# Links that point outside docs/ go to the file on GitHub, since only docs/ is published, and
# every page is wrapped in {% raw %} so Liquid leaves {{HD_VAR_*}} in the examples alone.
# Then scripts/pages-widgets.mjs adds a page per widget of the widgets collection, when a
# checkout of it (and its tag) is given.
#   scripts/pages.sh <out> [owner/repo] [<collection checkout> <tag>]
set -eu
out=$1
repo=${2:-stefanrenne/homelab-dashboard}
collection=${3:-}
tag=${4:-}
blob="https://github.com/$repo/blob/main"
tree="https://github.com/$repo/tree/main"

rm -rf "$out"
cp -R docs "$out"
# README: docs/x.md -> x.md; other relative links (LICENSE, compose file) -> GitHub
sed -e "s#](\([A-Za-z][A-Za-z0-9._-]*\.[a-z]*\))#]($blob/\1)#g" \
    -e "s#](LICENSE)#]($blob/LICENSE)#g" \
    -e "s#](docs/#](#g" \
    README.md > "$out/index.md"
# kramdown leaves Markdown inside an HTML block alone unless the block asks for it
find "$out" -name '*.md' | while read -r f; do
  sed -i.bak 's#<details>#<details markdown="1">#g' "$f" && rm "$f.bak"
done
# docs/widgets/*.md: ../../<path> leaves docs/
for f in "$out"/widgets/*.md; do
  sed -i.bak "s#](\.\./\.\./#]($tree/#g" "$f" && rm "$f.bak"
done
# docs/*.md: ../<path> leaves docs/
for f in "$out"/*.md; do
  sed -i.bak "s#](\.\./#]($tree/#g" "$f" && rm "$f.bak"
done
# empty front matter makes each file a page; raw keeps {{...}} literal
find "$out" -name '*.md' | while read -r f; do
  { printf -- '---\n---\n{%% raw %%}\n'; cat "$f"; printf '\n{%% endraw %%}\n'; } > "$f.tmp" && mv "$f.tmp" "$f"
done
# widget pages carry their own front matter and raw wrapping, so they come last
if [ -n "$collection" ]; then
  node scripts/pages-widgets.mjs "$out" "$collection" "$tag"
fi
