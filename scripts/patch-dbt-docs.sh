#!/usr/bin/env bash
# patch-dbt-docs.sh — Inline manifest.json and catalog.json into dbt docs index.html
# for static hosting (GitHub Pages) where fetch() cannot load local JSON files.
set -euo pipefail

DBT_TARGET="${1:-dbt/target}"
INDEX_HTML="${DBT_TARGET}/index.html"

if [ ! -f "$INDEX_HTML" ]; then
  echo "Error: ${INDEX_HTML} not found" >&2
  exit 1
fi

for json_file in manifest.json catalog.json; do
  json_path="${DBT_TARGET}/${json_file}"
  if [ ! -f "$json_path" ]; then
    echo "Error: ${json_path} not found" >&2
    exit 1
  fi
done

echo "Patching ${INDEX_HTML} for static hosting..."

# Read JSON contents
manifest_json=$(cat "${DBT_TARGET}/manifest.json")
catalog_json=$(cat "${DBT_TARGET}/catalog.json")

# Replace the o=[...search("manifest","manifest.json"...)] pattern
# dbt docs uses: o=i defined by search("manifest","manifest.json",o)
# We inject the JSON directly into the HTML as script tags
# and patch the fetch calls to use the inlined data.

# Create a patched HTML that embeds the JSON data
# The approach: add inline script tags before </head> with the JSON data,
# then replace fetch-based loading with the inlined variables.

# Insert JSON data as script tags before </head>
sed -i "s|</head>|<script>var defined_manifest = ${manifest_json};</script><script>var defined_catalog = ${catalog_json};</script></head>|" "$INDEX_HTML"

# Patch the JavaScript to use inlined data instead of fetching
# dbt docs typically has patterns like:
#   n(r,"manifest.json",...)  or  search("manifest","manifest.json",...)
# We replace the content between <script> tags that reference manifest.json/catalog.json

# For dbt-core >= 1.6, the index.html loads JSON via:
#   o=i(n,"manifest.json",o) → we need to make these resolve to our inlined vars
# The simplest reliable approach: replace the entire fetch mechanism

# Replace manifest.json fetch references
sed -i 's|"manifest.json"|"data:application/json," + JSON.stringify(defined_manifest)|g' "$INDEX_HTML"

# Replace catalog.json fetch references
sed -i 's|"catalog.json"|"data:application/json," + JSON.stringify(defined_catalog)|g' "$INDEX_HTML"

echo "Done. Patched ${INDEX_HTML} with inlined JSON data."
