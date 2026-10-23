#!/usr/bin/env bash
# Builds the deployable website into ./site from web/ + the data files. Used by both the nightly job and the quick-publish job.
set -euo pipefail
rm -rf site
mkdir -p site/data/hist site/data/hist-ohlc site/data/sparks site/data/snap site/data/about site/data/fx site/data/world
cp -R web/. site/
B=$(date -u +%Y%m%d%H%M%S)
sed -i.bak "s/__BUILD__/$B/g" site/index.html && rm -f site/index.html.bak
echo "{\"v\":\"$B\"}" > site/version.json
cp data/*.json site/data/ 2>/dev/null || true
cp data/hist/*.json site/data/hist/ 2>/dev/null || true
cp data/hist-ohlc/*.json site/data/hist-ohlc/ 2>/dev/null || true
cp data/sparks/*.json site/data/sparks/ 2>/dev/null || true
cp data/snap/*.json site/data/snap/ 2>/dev/null || true
cp data/about/*.json site/data/about/ 2>/dev/null || true
cp data/fx/*.json site/data/fx/ 2>/dev/null || true
cp data/world/*.json site/data/world/ 2>/dev/null || true
if [ -n "${SUPABASE_SERVICE_ROLE_KEY:-}" ] && [ -n "${SUPABASE_URL:-}" ]; then
  # paid-plan parts of each analysis go to the private database, not to the public site
  rm -rf pro_tmp && mkdir -p pro_tmp
  python3 engine/scorecards.py site/data/score pro_tmp || echo "scorecards failed (company profiles will be hidden until the next run)"
  python3 engine/upload_pro.py pro_tmp || echo "WARNING: paid-plan data was not uploaded; the database keeps last night's copy"
  rm -rf pro_tmp
else
  python3 engine/scorecards.py site/data/score || echo "scorecards failed (company profiles will be hidden until the next run)"
fi
echo "site assembled: build $B, $(ls site/data/hist | wc -l | tr -d ' ') history files"
