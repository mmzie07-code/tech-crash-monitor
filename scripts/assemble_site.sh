#!/usr/bin/env bash
# Builds the deployable website into ./site from web/ + the data files. Used by both the nightly job and the quick-publish job.
set -euo pipefail
rm -rf site
mkdir -p site/data/hist site/data/hist-ohlc site/data/sparks
cp -R web/. site/
B=$(date -u +%Y%m%d%H%M%S)
sed -i.bak "s/__BUILD__/$B/g" site/index.html && rm -f site/index.html.bak
echo "{\"v\":\"$B\"}" > site/version.json
cp data/*.json site/data/ 2>/dev/null || true
cp data/hist/*.json site/data/hist/ 2>/dev/null || true
cp data/hist-ohlc/*.json site/data/hist-ohlc/ 2>/dev/null || true
cp data/sparks/*.json site/data/sparks/ 2>/dev/null || true
echo "site assembled: build $B, $(ls site/data/hist | wc -l | tr -d ' ') history files"
