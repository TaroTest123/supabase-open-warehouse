#!/usr/bin/env bash
# patch-dbt-docs.sh — Inline manifest.json and catalog.json into dbt docs index.html
# for static hosting (GitHub Pages) where fetch() cannot load local JSON files.
#
# Uses Python to avoid shell argument-length limits with large JSON files.
set -euo pipefail

DBT_TARGET="${1:-dbt/target}"
INDEX_HTML="${DBT_TARGET}/index.html"

for f in "$INDEX_HTML" "${DBT_TARGET}/manifest.json" "${DBT_TARGET}/catalog.json"; do
  if [ ! -f "$f" ]; then
    echo "Error: ${f} not found" >&2
    exit 1
  fi
done

echo "Patching ${INDEX_HTML} for static hosting..."

python3 - "$DBT_TARGET" <<'PYEOF'
import sys, pathlib

target = pathlib.Path(sys.argv[1])
index = target / "index.html"
manifest = (target / "manifest.json").read_text()
catalog = (target / "catalog.json").read_text()

html = index.read_text()

# Inject JSON as global variables before </head>
injection = (
    f'<script>var defined_manifest = {manifest};</script>\n'
    f'<script>var defined_catalog = {catalog};</script>\n'
)
html = html.replace('</head>', injection + '</head>', 1)

# Replace fetch references so dbt's JS uses the inlined data
html = html.replace(
    '"manifest.json"',
    '"data:application/json," + JSON.stringify(defined_manifest)'
)
html = html.replace(
    '"catalog.json"',
    '"data:application/json," + JSON.stringify(defined_catalog)'
)

index.write_text(html)
PYEOF

echo "Done. Patched ${INDEX_HTML} with inlined JSON data."
