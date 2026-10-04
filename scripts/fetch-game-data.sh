#!/usr/bin/env bash
# Downloads the raw Star Citizen game files used to build src/data/defaults.json.
# Source: community mirror of extracted P4K data (x3nnnonn/StarCitizenDiff), pinned to the
# commit that holds sc-alpha-4.10.0 LIVE build 4.10.193.11644 (Sep 15 2026).
# To update for a new patch: SC_DATA_REF=<newer commit> npm run data:fetch
# (Or copy the files yourself from your install with unp4k: Data/Libs/Config/defaultProfile.xml
#  and Data/Localization/english/global.ini.)
set -euo pipefail
REF="${SC_DATA_REF:-908b76a0485036161ba700d369c7d92aca1c847b}"
BASE="https://raw.githubusercontent.com/x3nnnonn/StarCitizenDiff/$REF"
mkdir -p "$(dirname "$0")/../data/raw" && cd "$(dirname "$0")/../data/raw"
curl -fsSL -o defaultProfile.xml "$BASE/P4kContents/Data/Libs/Config/defaultProfile.xml"
curl -fsSL -o keybinding_localization.xml "$BASE/P4kContents/Data/Libs/Config/keybinding_localization.xml"
curl -fsSL -o global.ini "$BASE/P4kContents/Data/Localization/english/global.ini"
curl -fsSL -o build_manifest.json "$BASE/build_manifest.json"
echo "Fetched game data @ $REF"; grep -E '"(Branch|Version|BuildDateStamp)"' build_manifest.json
