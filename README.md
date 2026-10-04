# SC Keymap: Star Citizen keybind mapper

A client-only web app for browsing, searching, editing and exporting Star Citizen keybindings.
It ships with the game's own default bindings. You can drop your exported keybinds on top, rebind anything with live
keyboard / mouse / gamepad / joystick capture, and export a file the game loads.

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
- **Binding editor** (✎ Edit): click a binding to rebind it, **+** to add one, ✕ to unbind, or an action name for the full
  editor. A listening dialog captures:
  - **Keyboard**: `KeyboardEvent.code` → game key names (`kb1_lalt+n`, `np_enter`, `oem_102`…), L/R modifiers, modifier-only binds. Esc cancels.
  - **Mouse**: buttons 1–5 (`mouse1`…`mouse5`), wheel (`mwheel_up/down`), axes (`maxis_x/y/z`), with keyboard modifiers (`ralt+mouse2`).
  - **Gamepad** (standard-mapping pads): `a b x y shoulderl/r triggerl/r_btn back start thumbl/r dpad_*`, sticks as axes (`thumblx`) or
    directions (`thumbl_up`), triggers as button or axis, chords (`shoulderl+a`).
  - **Joystick / HOTAS** (non-standard pads): `jsN_buttonM` (1-based), axes `x y z rotx roty rotz slider1 slider2`, hats `hat1_up…`.
    Axes count only when they move well away from their resting value, so parked throttles work. Each controller can be
    assigned its game instance (js1, js2…) and type. A manual entry field lets you type or correct any input name.
  - Activation mode and multi-tap per binding; existing modes are kept.
  - A conflict check runs on capture (same context and activation-mode rules as the Conflicts view), with **Replace** (unbind it elsewhere),
    **Keep both** or **Listen again**.
  - Undo (Ctrl+Z, or per action), reset an action, reset all, revert to the imported file, new layout from the defaults, duplicate.
    Editing the defaults creates a "My layout" profile automatically.
- **Export** (⇩ Export) writes what the game writes:
  - `layout_<name>_exported.xml` for `StarCitizen/LIVE/user/client/0/Controls/Mappings/`, loaded via
    *Options → Keybindings → Control Profiles* or the console (`pp_RebindKeys <file>`), or
  - a full `actionmaps.xml` for `…/user/client/0/Profiles/default/` (game closed, back up the original).
  Only bindings that differ from the defaults are written. Cleared defaults become an empty input (`kb1_ `). Device `<options>` blocks
  from imported files (curves, inverts, deadzones) are kept, and joystick names and product GUIDs are added for controllers seen in the browser.
  Re-exporting a real game-written layout reproduces it byte for byte (see tests).
- **Persistence:** profiles and edits are stored in `localStorage`. You can keep several profiles and switch between them. Nothing is uploaded.

## Develop
```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # type-check + production build to dist/
npm run preview      # serve dist/ on http://localhost:4173
npm test             # unit tests (input mapping, editing, export round-trips) + parse/merge/search/conflict self-test
npm run test:unit -- path/to/layout_X_exported.xml   # also round-trip your own game-exported layouts
npm run test:e2e     # Playwright end-to-end test (simulated controllers) + screenshots/ (needs preview running + Chrome)
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

## How the file format works
Keyboard and mouse are one rebind device in Star Citizen (`kb1_` and `mo1_` are interchangeable; the game itself writes
`kb1_mouse4` and `mo1_space`). A device's rebinds for an action replace that device's defaults, so the app treats
keyboard + mouse as one group, joystick as another and gamepad as a third. The exporter follows the game's own layout writer:
`<ActionMaps version="1" optionsVersion="2" rebindVersion="2" profileName=…>`, then a `CustomisationUIHeader` with devices and the
`UICategory` of every exported action map, then `deviceoptions`/`options`, `<modifiers />`, and action maps in defaultProfile order
with actions sorted by name.

## Known limitations
- Controllers are read through the browser's Gamepad API. Button and axis numbering (especially axes and hats on HOTAS gear) can
  differ from the game's DirectInput order: Chrome on Windows usually matches (X, Y, Z, Rx, Ry, Rz, Slider, Dial; hat on axis 9),
  but Firefox, macOS and Linux may not. Check in game and use manual entry to correct. Only one hat per device is recognized
  (when the browser exposes it as an axis), and diagonals are ignored.
- The joystick instance (js1/js2) is whatever you assign. The game numbers devices in Windows order
  (`i_DumpDeviceInformation` lists them; `pp_resortdevices joystick 1 2` swaps them).
- Browser-reserved shortcuts (Ctrl+W/T/N, some OS keys) can't be captured. Type them in manual entry instead.
- Exported files are tested against the format of real game-written files, not loaded into a running game client.

## Deploy
The app is a static Vite build (`dist/`), so it can go to Vercel as-is: framework preset "Vite", build `npm run build`, output `dist`.

*Unofficial fan tool, not affiliated with Cloud Imperium Games. Star Citizen® is a trademark of Cloud Imperium Rights LLC.*
