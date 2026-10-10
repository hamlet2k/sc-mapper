#!/usr/bin/env bash
# Optional mirror download into data/raw/ for explicit npm run data:fetch use.
# Normal dev/build/test uses the committed files in data/game/ from Federico's
# 4.10.2 LIVE install (build 4.10.196.36804); ensure-data.mjs uses this mirror only
# when data/game/ is absent. Mirror: extracted P4K data (x3nnnonn/StarCitizenDiff), pinned to the
# commit that holds sc-alpha-4.10.0 LIVE build 4.10.193.11644 (Sep 15 2026).
# To try another mirror revision: SC_DATA_REF=<newer commit> npm run data:fetch
# To update the app's default data, replace data/game/ with files extracted from
# your install (defaultProfile.xml, keybinding_localization.xml, global.ini and build_manifest.json),
# then run npm run data. global.ini may retain only the localization keys used by build-defaults.
set -euo pipefail
REF="${SC_DATA_REF:-908b76a0485036161ba700d369c7d92aca1c847b}"
BASE="https://raw.githubusercontent.com/x3nnnonn/StarCitizenDiff/$REF"
mkdir -p "$(dirname "$0")/../data/raw" && cd "$(dirname "$0")/../data/raw"
curl -fsSL -o defaultProfile.xml "$BASE/P4kContents/Data/Libs/Config/defaultProfile.xml"
curl -fsSL -o keybinding_localization.xml "$BASE/P4kContents/Data/Libs/Config/keybinding_localization.xml"
curl -fsSL -o global.ini "$BASE/P4kContents/Data/Localization/english/global.ini"
curl -fsSL -o build_manifest.json "$BASE/build_manifest.json"
echo "Fetched game data @ $REF"; grep -E '"(Branch|Version|BuildDateStamp)"' build_manifest.json
