# SC Keymap: Star Citizen keybind mapper

A client-only web app for browsing, searching, editing and exporting Star Citizen keybindings.
It ships with the game's own default bindings. You can drop your exported keybinds on top, rebind anything with live
keyboard / mouse / gamepad / joystick capture, and export a file the game loads.

## Features
- **Built-in defaults** from the game's `Data/Libs/Config/defaultProfile.xml`, with English labels from
  `Data/Localization/english/global.ini`. Current data: **Star Citizen Alpha 4.10.0 LIVE, build 4.10.193.11644 (Sep 15 2026)**.
- **Import** `actionmaps.xml` (`<game folder>\<channel>\user\client\0\Profiles\default\actionmaps.xml`) or exported layouts
  (`…\user\client\0\Controls\Mappings\layout_*_exported.xml`). The game folder (default
  `C:\Program Files\Roberts Space Industries\StarCitizen`) and channel (LIVE / PTU / EPTU / TECH-PREVIEW) are set in Settings, and every
  path the app shows (Help, Export, Refresh game state, the profile card) is built from them, with a copy button. You can drag and drop or use the file picker. Rebinds (`kb1_`, `mo1_`, `jsN_`, `gp1_`)
  are merged over the defaults per device slot. Customized bindings are marked amber, and cleared defaults show as *cleared*.
  Activation modes and multi-tap are kept, and device names are read from `<options Product=…>`.
- **Organized by category:** flight, combat/targeting, mining/salvage/scanning, turrets, on-foot, EVA, ground vehicles,
  social/UI, camera. Under each category you get the game's own action-map groups.
- **Instant search** across labels, internal names, categories and inputs. Examples: `quantum`, `qntm` (fuzzy), `lalt+n`, `alt+1`,
  `key:f`, `mouse2`/`rmb`, `btn12`, `hat1`, `wheel`. Device-scoped inputs are exact: `js1_button5` (not js2, not button50),
  `js2 btn5`, `js2:b5`, `kb1_lalt+n` (not ralt+n or plain n), `mo1_mouse2`, `gp1_a`; `js2` alone lists everything on js2.
  Clicking any binding filters by that exact input (device + instance + full combo).
- **🎯 Find by pressing** (next to the search box): press a controller button, push a hat, move an axis, press a key (with modifiers)
  or click/scroll the mouse pad, and the list shows every action bound to that exact input, using your current controller numbering
  (🕹 Controllers). The input appears as a removable chip in the search box; typing refines within it. Backspace in an empty box or Esc removes it.
- **Highlight on press**: when you're not searching, editing or in a dialog, pressing any input briefly highlights its bindings
  (list rows and chips, and the key in the keyboard view) and shows a badge with the action count. "scroll to it" jumps to the first match;
  both can be switched off. Keys typed into text fields are ignored.
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
    Axes count only when they move well away from their resting value, so parked throttles work. A manual entry field lets
    you type or correct any input name. Capture copes with real browser behaviour: controllers hidden until a button is pressed
    (the press that wakes the device is counted on release), fresh `getGamepads()` snapshots polled every frame, no
    `gamepadconnected` event, all-zero first reports, toggle switches that stay on, and hats resting outside [-1, 1].
  - Activation mode and multi-tap per binding; existing modes are kept.
  - A conflict check runs on capture (same context and activation-mode rules as the Conflicts view), with **Replace** (unbind it elsewhere),
    **Keep both** or **Listen again**.
  - Undo (Ctrl+Z, or per action), reset an action, reset all, revert to the imported file, new layout from the defaults, duplicate.
    Editing the defaults creates a "My layout" profile automatically.
- **Export** (⇩ Export) writes what the game writes:
  - `layout_<name>_exported.xml` for `<game folder>\<channel>\user\client\0\Controls\Mappings\`, loaded via
    *Options → Keybindings → Control Profiles* or the console (`pp_RebindKeys <file>`; the Export dialog has copy buttons for the
    folder and the commands), or
  - a full `actionmaps.xml` for `…\user\client\0\Profiles\default\` (game closed, back up the original).
  Only bindings that differ from the defaults are written. Cleared defaults become an empty input (`kb1_ `). Device `<options>` blocks
  from imported files (curves, inverts, deadzones) are kept, and joystick names and product GUIDs are added for controllers seen in the browser.
  Re-exporting a real game-written layout reproduces it byte for byte (see tests).
- **📈 Axis settings & curves** (the button on each joystick / gamepad slot in the Devices view, for that device only): per joystick number
  **js1–js8** (the game's option tree declares 8 joystick instances; higher numbers can be bound but have no settings: reorder the device in
  Game slots & controllers to customize it) and for **gp1**, every control group from the game's
  `<optiontree type="joystick">` (Flight pitch/yaw/roll, strafe, throttle, turrets, FPS, EVA, vehicles…) with **invert**, **exponent**
  or a **custom curve** (draggable points, double-click to add, a points table), plus per-axis **deadzone** and **saturation** for the device
  model. A live chart shows the curve against the game default and, for a connected device, the axis position. Settings are read from the
  imported file and written back on export; everything the app doesn't edit is kept as it was. Deadzone, saturation, exponent and curve
  outputs each have a **slider plus a precise number field**, clamped to the ranges below (imported values outside them are kept and flagged).
  Each axis row has a live bar (deadzone band, saturation band, raw position, resulting output), and clicking a row previews that axis on the chart.
- **🕹 Devices view** (tab next to List / Keyboard): pick a device (connected ones with their game number, the profile's, or any jsN/gp1 that has
  bindings) and see a picture of it with a callout per control: button number, hat as a 5-way cross, axes with their live value, and the
  actions bound to it in the current profile (amber = customized, red = conflict). Callouts light up blue while you press or move the control.
  Clicking a callout opens a panel with the bound actions (Edit, Unbind, show in list) and "bind an action to this input". Bound inputs with
  no callout are listed beside the picture. **PNG** export and **Print** (print CSS shows only the device sheet).
- **Device templates**: the default stick (grip + base), default throttle (twin split levers + control panel) and default gamepad (modern
  dual-stick layout: sticks with press, D-pad, A/B/X/Y, bumpers, triggers, View/Menu) are original holographic wireframe drawings generated
  from small 3D models (`scripts/gen-default-stick.mjs`, `scripts/gen-default-throttle.mjs`, `scripts/gen-default-gamepad.mjs`; no vendor
  artwork or logos), with callouts for every control and glow regions that light the control on the picture when it is pressed or moved
  (per key on the throttle keypad, per direction on the D-pad). The earlier *classic* stick/throttle templates were removed; a device that had
  one picked now uses the default stick/throttle. ✎ *Customize a copy*
  or ＋ *New template* opens the editor: upload a photo/render of your device (PNG/JPEG/WebP/SVG; scaled to at most 1600 px and re-encoded
  client-side, max 2.5 MB, stored in IndexedDB with a localStorage fallback) or use a blank canvas; add callouts by clicking the picture or with
  **🎯 Press to place** (press each control and a callout for that input appears: a hat push adds the whole hat); drag the anchor and the label
  separately; set the type (button, hat, axis or mini-stick, encoder pair with optional push, multi-position switch, button row), inputs (typed or pressed), name and group;
  duplicate, delete, undo (Ctrl+Z). A template applies automatically to devices matching its rules: USB vendor/product id, name, and optionally
  the exact button count, which tells apart devices sharing a USB id (e.g. the two MOZA AB6 bases with 128 and 133 buttons). You can also pick a
  template by hand per device. Templates export/import as JSON with the image embedded, for sharing.
  **Pages**: ＋ *Page* adds another picture of the device (up to 12; double-click a tab or use the ⋯ menu to rename, move or delete a page,
  its callouts go with it); the Devices view shows every page as a captioned section. **Picture preparation** on every upload: *Remove
  background* runs U²-Net-p in the browser (onnxruntime-web WASM, ~19 MB downloaded once from this site, nothing uploaded; a corner-colour flood
  fill if the model cannot load), *Format only* trims and pads the picture like the built-in photos (product 900–1300 px, 5 % margin, optional
  baked cyan glow), with a before/after preview; *Keep original* stores it as uploaded.
- **🕹 Controllers & input tester** (header button): the devices declared in the active profile (`<options type="joystick"
  instance=… Product=…>`), the devices the browser detects (index, id, mapping, button/axis counts, USB ids), and which game instance
  (js1…jsN / gp1) each browser device is. Devices are prefilled by matching the profile's USB vendor/product ids, then names, then
  browser order; you can override and reset. A live tester shows every button and axis and the SC input each press would be captured as,
  plus environment checks (Gamepad API, secure context, permissions policy, focus) and a "press any button to wake it up" prompt.
  Identical devices (same USB vendor/product id, e.g. two "MOZA AB6 FFB Base" interfaces) are told apart by their button/axis counts
  ("1 of 2 · 128 buttons") and flagged, since the browser can't know which one Windows numbers first. Buttons above 128 are shown
  (outlined red) with a warning.
- **Persistence:** profiles and edits are stored in `localStorage`. You can keep several profiles and switch between them. Nothing is uploaded.

## Develop
```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # type-check + production build to dist/
npm run preview      # serve dist/ on http://localhost:4173
npm test             # unit tests (input mapping, editing, export round-trips) + parse/merge/search/conflict self-test
npm run test:unit -- path/to/layout_X_exported.xml   # also round-trip your own game-exported layouts
npm run test:fixtures   # download pinned real game/community files and round-trip their device settings
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

### Device settings (curves, inversion, deadzone)
Confirmed from the game's `defaultProfile.xml` (`<optiontree>` definitions), the layouts shipped in `Data/Libs/Config/Mappings/`
and real game-written exports (see `scripts/fetch-fixtures.mjs` for the pinned files used in the round-trip tests):

```xml
<deviceoptions name=" VKBsim Gladiator EVO R    {0200231D-0000-0000-0000-504944564944}">
 <option input="x" deadzone="0.015"/>
 <option input="x" saturation="0.94"/>
 <option input="x" saturation="0.94"/>        <!-- the game writes saturation lines twice -->
</deviceoptions>
<options type="joystick" instance="1" Product=" VKBsim Gladiator EVO R    {0200231D-0000-0000-0000-504944564944}">
 <flight_move_pitch invert="1"/>
 <flight_move_yaw exponent="1.5"/>
 <flight_move_roll>
  <nonlinearity_curve>
   <point in="0.25" out="0.1"/>
   <point in="0.75" out="0.6"/>
  </nonlinearity_curve>
 </flight_move_roll>
</options>
```

- `<deviceoptions name=PRODUCT>` holds per-axis `deadzone` / `saturation` (`input` = `x y z rotx roty rotz slider1 slider2`) and is keyed by the
  product string, so identical devices share it.
- `<options type instance Product>` children are named after the option groups in `defaultProfile.xml`
  (`<optiongroup name UILabel UIShowCurve UIShowInvert [invert] [exponent]>` with an optional default `<nonlinearity_curve>`), with
  `invert="0|1"`, `exponent="…"` and/or `<nonlinearity_curve><point in out/>…</nonlinearity_curve>`.
- Not edited (kept as imported): `sensitivity` (only in a 2.5-era file), unknown/older group names (e.g. `flight_move_strafe_forward` in shipped
  layouts), gamepad/mouse/keyboard options. Not documented anywhere: the game's exact response maths (the chart is an approximation),
  whether a group heading's setting overrides the controls under it, and what saturation does exactly.

### Value ranges for the sliders
No minimum/maximum for these settings is defined in the game files (`defaultProfile.xml` option groups only carry defaults), so the
app uses what can be confirmed and labels the rest as conservative:

| Setting | Format | Slider range | Default | Evidence |
|---|---|---|---|---|
| Deadzone | fraction of axis travel, 0..1 | 0–0.5 (conservative) | not in game files; Star Citizen Wiki (2.x): 0.03 X/Y, 0 Z/slider, 0.10 rotations | real files: 0.0099–0.2475 (TWCS shipped layout 0.0792; Osiris/Subs exports), all multiples of **0.0099** = 1 % slider steps × 0.99 |
| Saturation | fraction of axis travel, 0..1 | 0.5–1 (conservative) | 1.00 (wiki) | real files 0.8405–0.9405; players report 0 hides the setting in game |
| Exponent | output = input^exponent | 1–3 (conservative) | 1.00 (wiki); `defaultProfile.xml` uses 2.5 on two groups | real files 1.0–2.5; the game converts an exponent into curve points out = in^exp (philchuang 3.17.4: 0.1 → 0.0631 = 0.1^1.2) |
| Curve point in/out | 0..1 for one half of the axis | 0–1 (confirmed) | default curves in `defaultProfile.xml` use 0.1–0.9 | game-written curves include 0,0 and 1,1; points ordered by input |

`UISensitivityMin/Max` in the option trees (0.01–2.0 for joystick/gamepad) is the legacy *sensitivity* setting, not the exponent.

## Known limitations
- Device templates: positions are fractions of the picture, so a template looks the same at any size. Live highlight needs the device visible
  to the browser (Chromium: first 4 devices, 32 buttons). Hat callouts follow the browser's hat numbering (first hat-like axis = hat 1),
  which may differ from the game's on some devices.
- Controllers are read through the browser's Gamepad API. Button and axis numbering (especially axes and hats on HOTAS gear) can
  differ from the game's DirectInput order: Chrome on Windows usually matches (X, Y, Z, Rx, Ry, Rz, Slider, Dial; hat on axis 9),
  but Firefox, macOS and Linux may not. Check in game and use manual entry to correct. Hats are recognized when the browser exposes
  them as an axis resting outside [-1, 1] (Chrome and current Firefox on Windows); diagonals are ignored.
- Chromium browsers (Chrome, Edge, Brave, Opera, Comet…) expose only the **first 4 controllers**, and at most **32 buttons and 16 axes**
  per device. The app shows a banner in Chromium; use **Firefox** for more devices or buttons above 32 (or type them in manual entry,
  `js1_button40`).
- Star Citizen reads joysticks through DirectInput, which has 128 buttons per device; buttons above 128 can be captured but most
  likely can't be used in game.
- The joystick instance (js1/js2) comes from the profile match or your choice in 🕹 Controllers. The game numbers devices in Windows order
  (`i_DumpDeviceInformation` lists them; `pp_resortdevices joystick 1 2` swaps them).
- Browser-reserved shortcuts (Ctrl+W/T/N, some OS keys) can't be captured. Type them in manual entry instead.
- Exported files are tested against the format of real game-written files, not loaded into a running game client.

## Deploy
The app is a static Vite build (`dist/`), so it can go to Vercel as-is: framework preset "Vite", build `npm run build`, output `dist`.

*Unofficial fan tool, not affiliated with Cloud Imperium Games. Star Citizen® is a trademark of Cloud Imperium Rights LLC.*
