#!/usr/bin/env bash
# Re-download the raw inputs for build_data.py. whc.unesco.org itself sits
# behind a Cloudflare challenge; UNESCO's open data portal serves the same list.
set -euo pipefail
cd "$(dirname "$0")/../data"

curl -fsSL -o raw_whc001.json \
  "https://data.unesco.org/api/explore/v2.1/catalog/datasets/whc001/exports/json"

for layer in ne_{110m,50m}_land ne_{110m,50m}_admin_0_boundary_lines_land; do
  curl -fsSL -o "raw_${layer}.geojson" \
    "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/${layer}.geojson"
done
