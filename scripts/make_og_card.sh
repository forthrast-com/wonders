#!/usr/bin/env bash
# Render the static link-preview image (og-card.png) with the page's own card
# renderer. Needs the site served locally and agent-browser on PATH.
#   python3 -m http.server 8000 &   then   bash scripts/make_og_card.sh http://localhost:8000/
set -euo pipefail
cd "$(dirname "$0")/.."
url="${1:-http://localhost:8000/}"

agent-browser set viewport 1280 800 >/dev/null
agent-browser open "$url" >/dev/null
agent-browser wait --load networkidle >/dev/null
agent-browser eval "WHR.card_data_url(true)" \
  | python3 -c 'import base64, json, sys; uri = json.load(sys.stdin); sys.stdout.buffer.write(base64.b64decode(uri.split(",", 1)[1]))' \
  > og-card.png
echo "wrote og-card.png ($(wc -c < og-card.png | tr -d ' ') bytes)"
