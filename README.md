# SC Keymap: Star Citizen keybind mapper

A client-only web app for browsing, searching and visualizing Star Citizen keybindings.
It ships with the game's own default bindings, and you can drop your exported keybinds on top.

## Features
- **Built-in defaults** from the game's `Data/Libs/Config/defaultProfile.xml`, with English labels from
  `Data/Localization/english/global.ini`. Current data: **Star Citizen Alpha 4.10.0 LIVE, build 4.10.193.11644 (Sep 15 2026)**.
- **Import** `actionmaps.xml` (`StarCitizen/LIVE/user/client/0/Profiles/default/actionmaps.xml`) or exported layouts
  (`…/Controls/Mappings/layout_*_exported.xml`). You can drag and drop or use the file picker. Rebinds (`kb1_`, `mo1_`, `jsN_`, `gp1_`)
  are merged over the defaults per device slot. Customized bindings are marked amber, and cleared defaults show as *cleared*.
  Activation modes and multi-tap are kept, and device names are read from `<options Product=…>`.
- **Organized by category:** flight, combat/targeting, mining/salvage/scanning, turrets, on-foot, EVA, ground vehicles,
  social/UI, camera. Under each category you get the game's own action-map groups.
- **Instant search** across labels, internal names, categories and inputs. Examples: `quantum`, `qntm` (fuzzy), `lalt+n`, `alt+1`,
  `key:f`, `mouse2`/`rmb`, `btn12`, `hat1`, `wheel`.
- **Filters:** device (keyboard / mouse / joystick / gamepad; double-click for solo), show unbound, customized only,
  conflicts only, internal actions.
- **Conflict finder** flags the same physical input on different actions that are live in overlapping contexts with clashing
  activation modes. By default it only reports overlaps that involve one of your customized binds. A checkbox adds
  default-vs-default overlaps too.
- **Keyboard view** is a heat-map of the keyboard and mouse, with a modifier selector (L/R Alt/Ctrl/Shift) and an input inspector.
- **Persistence:** imported profiles are stored in `localStorage`. You can keep several profiles and switch between them. Nothing is uploaded.

## Develop
```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # type-check + production build to dist/
npm run preview      # serve dist/ on http://localhost:4173
npm test             # headless parse/merge/search/conflict self-test against the sample
npm run test:e2e     # Playwright smoke test + screenshots into screenshots/ (needs preview running + Chrome)
```

## Data source
Default bindings and labels are extracted from the game files, mirrored in the community repo
[x3nnnonn/StarCitizenDiff](https://github.com/x3nnnonn/StarCitizenDiff) at commit
[`908b76a`](https://github.com/x3nnnonn/StarCitizenDiff/tree/908b76a0485036161ba700d369c7d92aca1c847b/P4kContents/Data/Libs/Config),
which holds **sc-alpha-4.10.0 LIVE, build 4.10.193.11644** (built Sep 15 2026):

| File | Used for |
| --- | --- |
| `Data/Libs/Config/defaultProfile.xml` | every action map, action, and default kb/mouse/joystick/gamepad input |
| `Data/Localization/english/global.ini` | human-readable action and category labels |
| `build_manifest.json` | game version shown in the UI |

`npm run dev` / `npm run build` run `scripts/ensure-data.mjs` first. If `src/data/defaults.json` is missing, that script downloads
those pinned files into `data/raw/` and runs `scripts/build-defaults.mjs` to generate it. The generated JSON is not committed.

### Updating for a new patch
```bash
SC_DATA_REF=<newer StarCitizenDiff commit> npm run data:fetch
# or extract the files from your own install (unp4k) into data/raw/ and run: npm run data
```

## Deploy
The app is a static Vite build (`dist/`), so it can go to Vercel as-is: framework preset "Vite", build `npm run build`, output `dist`.

*Unofficial fan tool, not affiliated with Cloud Imperium Games. Star Citizen® is a trademark of Cloud Imperium Rights LLC.*
