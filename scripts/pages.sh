#!/bin/sh
# Stages the GitHub Pages site in <out>: docs/ as it is, plus README.md as the home page.
# Links that point outside docs/ go to the file on GitHub, since only docs/ is published, and
# every page is wrapped in {% raw %} so Liquid leaves {{HD_VAR_*}} in the examples alone.
#   scripts/pages.sh <out> [owner/repo]
set -eu
out=$1
repo=${2:-stefanrenne/homelab-dashboard}
blob="https://github.com/$repo/blob/main"
tree="https://github.com/$repo/tree/main"

rm -rf "$out"
cp -R docs "$out"
# README: docs/x.md -> x.md; other relative links (LICENSE, compose file) -> GitHub
sed -e "s#](\([A-Za-z][A-Za-z0-9._-]*\.[a-z]*\))#]($blob/\1)#g" \
    -e "s#](LICENSE)#]($blob/LICENSE)#g" \
    -e "s#](docs/#](#g" \
    README.md > "$out/index.md"
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
