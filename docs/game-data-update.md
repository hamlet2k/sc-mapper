# Updating default bindings for a new Star Citizen patch

Runbook for refreshing SC Mapper's built-in default bindings when a new SC version ships.
Last done for 4.10.2 LIVE (build 4.10.196.36804) on 2026-10-10.

## 1. Check what version the PC has
On Federico's PC (HighCastle), read `C:\Program Files\Roberts Space Industries\StarCitizen\LIVE\build_manifest.id`.
It holds the branch, build number and date. The public StarCitizenDiff mirror often lags behind, so
the PC install is the source of truth.

Note: `LIVE\user\client\0\Profiles\default` holds only the player's own changes, not the defaults.
The defaults live inside `LIVE\Data.p4k`.

## 2. Extract the four source files from Data.p4k
Ask Federico first. Then, on the PC, download unp4k (or StarBreaker) into a temp folder and extract:

| File in Data.p4k | Save as |
| --- | --- |
| `Data/Libs/Config/defaultProfile.xml` | `data/game/defaultProfile.xml` |
| `Data/Libs/Config/keybinding_localization.xml` | `data/game/keybinding_localization.xml` |
| `Data/Localization/english/global.ini` | `data/game/global.ini` |
| `build_manifest.id` (from LIVE folder) | `data/game/build_manifest.json` |

The two XML files are binary CryXML inside the p4k and must be converted to text XML
(unforge, or StarBreaker). The unforge converter can leave a stray `<![CDATA[/>` fragment;
our parser tolerates it, and `build-defaults` cleans it. The StarSource agent can do the extraction too.

Copy the files to the box (CopyToBox into `/workspace/uploads/`), then into `data/game/` in a worktree.

## 3. Update the repo
On a branch / worktree:
1. Replace the four files in `data/game/`.
2. Update the version text and build number: `README.md`, `docs/technical-notes.md`,
   the header comment in `scripts/ensure-data.mjs`, `meta` in `scripts/build-defaults.mjs`, and any UI text
   (`rg -n "4\.10\.2"` finds all places to change).
3. `npm run data` to rebuild defaults (`global.ini` may be trimmed to just the keys `build-defaults.mjs` looks up, to keep the repo small).
4. Compare action counts against the previous version; nothing should disappear without reason.

## 4. Check and ship
```
npx tsc -b --noEmit
npm run test:unit
npm run build
```
Rebase onto current `main`, push to `main`, and wait until the live JS bundle at
https://sc-mapper.vercel.app contains the new version string before calling it shipped.

## Fallback
If `data/game/` is missing, `ensure-data.mjs` uses the pinned StarCitizenDiff mirror;
`SC_DATA_REF=<commit> npm run data:fetch` picks a different revision.
