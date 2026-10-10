# Technical notes

Background for contributors: where the default data comes from, how Star Citizen's keybinding files are structured, and the known limits of reading controllers in a browser. For the UX decisions behind the app, see [ux-decisions.md](ux-decisions.md).

## Data source
Default bindings and labels are extracted from Federico's **sc-alpha-4.10.2 LIVE, build 4.10.196.36804**
client (built Wed Oct 07 2026) and committed in
[`data/game/`](https://github.com/hamlet2k/sc-mapper/tree/main/data/game):

| File | Used for |
| --- | --- |
| `Data/Libs/Config/defaultProfile.xml` | every action map, action, and default kb/mouse/joystick/gamepad input |
| `Data/Libs/Config/keybinding_localization.xml` | companion source file, retained with the extraction |
| `Data/Localization/english/global.ini` | human-readable action and category labels |
| `build_manifest.json` | game version shown in the UI |

`npm run dev` / `npm run build` run `scripts/ensure-data.mjs` first. If `src/data/defaults.json` is missing (or `npm run data`
forces regeneration), that script copies the committed files into `data/raw/` and runs `scripts/build-defaults.mjs`.
The raw copies and generated JSON are not committed. Clean builds need no game-data downloads.

`global.ini` is trimmed to the localization keys the builder looks up. A stray `<![CDATA[/> ... ]]>` fragment was removed
from the player action map. Each change was verified to leave the generated JSON byte-identical except for `meta.generated`.
All 50 maps and 1,103 actions (including all 144 player actions) match the 4.10.0 output; only 21 actions become hidden
because their `UILabel` is now empty. Default inputs and option trees are unchanged.

When `data/game/` is absent, `ensure-data.mjs` falls back to the community
[StarCitizenDiff mirror](https://github.com/x3nnnonn/StarCitizenDiff/tree/908b76a0485036161ba700d369c7d92aca1c847b/P4kContents/Data/Libs/Config),
pinned to 4.10.0 LIVE build 4.10.193.11644. `SC_DATA_REF` overrides that fallback revision.

### Updating for a new patch
```bash
# Full runbook: docs/game-data-update.md. Extract the four source files (unp4k) into data/game/, then:
npm run data
# Commit data/game/ with the updated provenance, version text and tests.
# To explicitly try a mirror revision in data/raw/:
SC_DATA_REF=<newer StarCitizenDiff commit> npm run data:fetch
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
- The joystick instance (js1/js2) comes from the profile match or your choice in Game slots & controllers. The game numbers devices in Windows order
  (`i_DumpDeviceInformation` lists them; `pp_resortdevices joystick 1 2` swaps them).
- Browser-reserved shortcuts (Ctrl+W/T/N, some OS keys) can't be captured. Type them in manual entry instead.
- Exported files are tested against the format of real game-written files, not loaded into a running game client.

## Template feed
`npm run build` also writes the public template feed into `dist/templates/` (`index.json`, one `<id>.json` per built-in template,
`art/<id>.svg` for the generated drawings). It is generated from the built-in template objects by the `template-feed` plugin in
`vite.config.ts` (`src/lib/templateFeed.ts` + `scripts/template-feed.ts`), so it is never edited by hand and not committed. The build
fails if a template references a missing photo. URLs, schema, input-name conventions (with the SC → DCS table), caching and the
version policy: [template-feed.md](template-feed.md).

## Deploy
The app is a static Vite build (`dist/`), so it can go to Vercel as-is: framework preset "Vite", build `npm run build`, output `dist`.
`vercel.json` only adds headers (CORS `*` and short `Cache-Control` on `/templates/*` and `/device-photos/*`). It has no rewrites.
