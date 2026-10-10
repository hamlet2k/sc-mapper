# October 9 Part 2 template review

Every supplied image was opened and inspected: 17 product photos and 6 manufacturer/configurator screenshots (including both copies of the Thrustmaster axis screenshot). Part 1 is retained. Existing pedal IDs, names, brands, matches, notes and input numbering are unchanged. T-Rudder was already rudder-only.

Six new templates; nine new WebP photos. Seven existing pedal photos regenerated: five byte-identical, Crosswind and T-Rudder changed. AB6/9 gains a reference view. No branch switch or push.

Inputs below omit the device prefix: buttonN means jsX_buttonN. Hat lists are up/right/down/left/push. Switch lists retain the stated diagram order. `[unassigned]` is an actual empty input string, not an invented number. All new callouts have at most 32 inputs, and assigned inputs occur once per template.

## Processing and sources

Repo tooling: `NUMBA_CACHE_DIR=/tmp/sc-mapper-numba OMP_NUM_THREADS=2 OPENBLAS_NUM_THREADS=2 python3 scripts/device-photos/cutout.py --preview .tmp/oct9b-photo-preview <selected photo keys>`. The repo’s cached IS-Net model ran successfully; no opaque WebP fallback or generated artwork was used. Source paths are recorded in scripts/device-photos/views.json relative to the tooling’s default source folder; new paths resolve into /workspace/uploads/oct9b. Sizes/product bounds are generated in src/lib/devicePhotoSizes.ts.

Manufacturer terminology references: [Rotor Plus TCS manual](https://support.virpil.com/en/support/solutions/articles/47001258794) and [Rotor TCS Plus product details](https://virpil-controls.eu/vpc-rotor-tcs-plus-base-upgraded.html). These establish the twist throttle, assignable idle button and mechanical clutch/lock; they do not establish default DirectInput axis/button numbering.

## WinCtrl ViperAce ICP

`builtin-winctrl-viperace-icp` · category `panel`

**Source:** panels/winctrl/icp/Screenshot 2026-10-08 225754.png (SimAppPro): buttons 1–34, SYM=Y, ICP BRT=RY, DED BRT=X, CONT=RX. USB 4098:BF30 comes from scripts/e2e.mjs, the fixture explicitly documented as a real Firefox setup.

**Uncertainties / visibility:** No USB ID was inferred from the screenshot. Key rows are grouped in printed order; DCS is up/right/down/left/push = 22/23/24/25/21. Brightness wheels are axes, not digital encoders. The screen itself has no additional input callout.

**Photos:** `winctrl-viperace-icp-main.webp` (ICP)

| Callout label | Kind | Inputs | View |
| --- | --- | --- | --- |
| COM / IFF / LIST / A-A / A-G | buttons | `button1, button2, button3, button4, button5, button6` | main |
| 1 / 2 / 3 / RCL | buttons | `button7, button8, button9, button10` | main |
| 4 / 5 / 6 / ENTR | buttons | `button11, button12, button13, button14` | main |
| 7 / 8 / 9 / 0 | buttons | `button15, button16, button17, button18` | main |
| Increment / decrement | switch | `button19, button20` | main |
| DCS (4-way + push) | hat | `button22, button23, button24, button25, button21` | main |
| DRIFT C/O / NORM / WARN RESET | switch | `button26, button27, button28` | main |
| WX | button | `button29` | main |
| FLIR up / down | switch | `button30, button31` | main |
| GAIN / LVL / AUTO | switch | `button32, button33, button34` | main |
| SYM brightness | axis | `y` | main |
| ICP brightness | axis | `roty` | main |
| DED brightness | axis | `x` | main |
| Contrast | axis | `rotx` | main |

## Honeycomb Charlie Rudder Pedals

`builtin-honeycomb-charlie` · category `pedals`

**Source:** Existing template axis assignments and notes retained verbatim. Supplied product photo reprocessed by cutout.py; output byte-identical to existing photo.

**Uncertainties / visibility:** Rudder mechanics are inside the centre housing; rudder anchor indicates that housing. No supplied numbered diagram for this pedal.

**Photos:** `honeycomb-charlie-main.webp` (Pedals)

| Callout label | Kind | Inputs | View |
| --- | --- | --- | --- |
| Left Toe Brake | axis | `x` | main |
| Right Toe Brake | axis | `y` | main |
| Rudder | axis | `z` | main |

## Logitech G Flight Rudder Pedals (Saitek Pro Flight)

`builtin-logitech-flight-rudder` · category `pedals`

**Source:** Existing template assignments and notes retained verbatim. Supplied product photo has its own alpha; cutout.py formats it. Output byte-identical to existing photo.

**Uncertainties / visibility:** Rudder anchor indicates the central pedal linkage beneath the tension knob, not a new knob axis. No supplied numbered diagram.

**Photos:** `logitech-flight-rudder-main.webp` (Pedals)

| Callout label | Kind | Inputs | View |
| --- | --- | --- | --- |
| Left Toe Brake | axis | `x` | main |
| Right Toe Brake | axis | `y` | main |
| Rudder | axis | `rotz` | main |

## MFG Crosswind V3 Rudder Pedals

`builtin-mfg-crosswind` · category `pedals`

**Source:** Existing template assignments and notes retained verbatim. Supplied crosswindV3 JPG processed by cutout.py; replaces prior clean-source output.

**Uncertainties / visibility:** No supplied numbered diagram. The model removes the separate background logo; no manual photo alteration. Rudder anchor remains on the central linkage.

**Photos:** `mfg-crosswind-v3-main.webp` (Pedals)

| Callout label | Kind | Inputs | View |
| --- | --- | --- | --- |
| Left Toe Brake | axis | `x` | main |
| Right Toe Brake | axis | `y` | main |
| Rudder | axis | `rotz` | main |

## Thrustmaster T.Flight Rudder Pedals (TFRP)

`builtin-tm-tfrp` · category `pedals`

**Source:** pedals/thrustmaster/tfrp/Screenshot 2026-10-06 212502.png: left toe brake Y / rudder Z / right toe brake X. Supplied product photo processed by cutout.py; output byte-identical.

**Uncertainties / visibility:** No numbering changes: screenshot agrees with existing mapping. Rudder anchor is on the central sliding platform.

**Photos:** `tm-tfrp-main.webp` (Pedals)

| Callout label | Kind | Inputs | View |
| --- | --- | --- | --- |
| Left Toe Brake | axis | `y` | main |
| Right Toe Brake | axis | `x` | main |
| Rudder | axis | `z` | main |

## Thrustmaster Pendular Rudder (TPR)

`builtin-tm-tpr` · category `pedals`

**Source:** pedals/thrustmaster/tpr/Screenshot 2026-10-06 212502.png: left toe brake Y / rudder Z / right toe brake X. Supplied product photo processed by cutout.py; output byte-identical.

**Uncertainties / visibility:** No numbering changes: screenshot agrees with existing mapping. Rudder anchor indicates the pendular pivot near the housing.

**Photos:** `tm-tpr-main.webp` (Pedals)

| Callout label | Kind | Inputs | View |
| --- | --- | --- | --- |
| Left Toe Brake | axis | `y` | main |
| Right Toe Brake | axis | `x` | main |
| Rudder | axis | `z` | main |

## VIRPIL R1-FALCON Rudder Pedals

`builtin-virpil-r1-falcon` · category `pedals`

**Source:** Existing template assignments and notes retained verbatim (rudder Z, toe brakes Slider/Dial). Supplied product photo processed by cutout.py; output byte-identical.

**Uncertainties / visibility:** No supplied axis numbering diagram. Existing VPC Configurator caveat retained.

**Photos:** `virpil-r1-falcon-main.webp` (Pedals)

| Callout label | Kind | Inputs | View |
| --- | --- | --- | --- |
| Left Toe Brake | axis | `slider1` | main |
| Right Toe Brake | axis | `slider2` | main |
| Rudder | axis | `z` | main |

## VKB T-Rudder Mk.V

`builtin-vkb-t-rudder` · category `pedals`

**Source:** Existing template: one rudder axis, RX (rotx). Supplied product photo processed by cutout.py, cropped to [0,120,600,480] to omit the separate top-left VKB logo.

**Uncertainties / visibility:** Already had exactly one axis, so no numbering correction was necessary. No toe brakes or buttons were added. Crop ends at the real source bottom; output differs by one pixel of height from the old padded crop.

**Photos:** `vkb-t-rudder-main.webp` (Pedals)

| Callout label | Kind | Inputs | View |
| --- | --- | --- | --- |
| Rudder | axis | `rotx` | main |

## VIRPIL R1-LEGEND Rudder Pedals

`builtin-virpil-r1-legend` · category `pedals`

**Source:** Same axes as R1-FALCON, as requested: left slider1, right slider2, rudder z. Supplied product photo processed by cutout.py. Name matches R1-LEGEND / R1 LEGEND; no USB IDs.

**Uncertainties / visibility:** Axis assignment is inherited from R1-FALCON, not verified by a new diagram. Anchors are on the toe portions of the metal footplates and central rudder pivot.

**Photos:** `virpil-r1-legend-main.webp` (Pedals)

| Callout label | Kind | Inputs | View |
| --- | --- | --- | --- |
| Left Toe Brake | axis | `slider1` | main |
| Right Toe Brake | axis | `slider2` | main |
| Rudder | axis | `z` | main |

## VIRPIL Rotor TCS / TCS Plus base

`builtin-virpil-rotor-tcs` · category `collective`

**Source:** Supplied plain Rotor TCS and Rotor TCS Plus photos. There is no supplied base numbering diagram. Collective=x and Plus-only second axis=y are provisional assignments by axis order, not verified manufacturer numbering.

**Uncertainties / visibility:** Both axes are always present by request. “Clutch (TCS Plus only)” is the requested label for the Plus twist throttle; the clutch damper itself is mechanical. Engine idle button is visible on the Plus and left unassigned (empty string) because no reliable logical number is provided. Assign it in Customize a copy. Top rubber caps cover adjustment screws; rear round caps are connectors. The silver rotation lock is mechanical, so no digital switch input was invented. Only the Plus has the second axis and idle button.

**Photos:** `virpil-rotor-tcs-main.webp` (Rotor TCS base), `virpil-rotor-tcs-plus-main.webp` (Rotor TCS Plus base)

| Callout label | Kind | Inputs | View |
| --- | --- | --- | --- |
| Collective axis | axis | `x` | base |
| Clutch (TCS Plus only) | axis | `y` | plus |
| Engine idle (TCS Plus only) | button | `[unassigned]` | plus |

## VIRPIL Rotor TCS / TCS Plus + Dual grip

`builtin-virpil-rotor-tcs-dual` · category `collective` · variant of `builtin-virpil-rotor-tcs` (no match rules)

**Source:** collectives/virpil/dual/Screenshot 2026-10-09 033602.png: grip buttons 1–47; cursor axes RX/RY. Both product photos used: front (upper/lower pages) and rear, plus the two base photos.

**Uncertainties / visibility:** Base x/y are provisional and idle button remains unassigned. The diagram’s alternate logical numbers 45/46/47 are retained; the line/two-dot symbols may denote hold/double-click actions rather than extra physical stages. Labels say alternate action, without assuming the mechanism. Button 1 is hidden in both photos, so its anchor is estimated on the upper rear head. PNVS 35/46 is partly obscured by the guard edge; JETT 43/47 is covered, so anchors indicate the guard/covered-control area. Upper rocker 21–23 and side button 20 are only partly exposed in the front angle.

**Photos:** `virpil-rotor-tcs-dual-front.webp` (Dual grip, upper controls), `virpil-rotor-tcs-dual-front.webp` (Dual grip, lower controls), `virpil-rotor-tcs-dual-rear.webp` (Dual grip, rear controls), `virpil-rotor-tcs-main.webp` (Rotor TCS base), `virpil-rotor-tcs-plus-main.webp` (Rotor TCS Plus base)

| Callout label | Kind | Inputs | View |
| --- | --- | --- | --- |
| Collective axis | axis | `x` | base |
| Clutch (TCS Plus only) | axis | `y` | plus |
| Engine idle (TCS Plus only) | button | `[unassigned]` | plus |
| Head button | button | `button1` | rear |
| Upper thumb hat | hat | `button3, button4, button5, button6, button2` | upper |
| GTM / F-P / ATH hat | hat | `button8, button9, button10, button11, button7` | upper |
| Cursor ministick | axis | `rotx, roty` | upper |
| Cursor press | button | `button12` | upper |
| LINK hat | hat | `button14, button15, button16, button17, button13` | upper |
| Upper front button | button | `button18` | upper |
| Upper trigger | button | `button19` | rear |
| Upper side button | button | `button20` | upper |
| Upper rocker (up / push / down) | switch | `button22, button21, button23` | upper |
| Upper rear button | button | `button24` | rear |
| Lower rocker (left / push / right) | switch | `button27, button25, button26` | lower |
| STOW / DEP switch (+ alternate) | switch | `button28, button29, button45` | lower |
| EXT / RET hat | hat | `button31, button32, button33, button34, button30` | lower |
| PNVS button / alternate action | switch | `button35, button46` | lower |
| PNVS rocker (up / push / down) | switch | `button37, button36, button38` | lower |
| NU rocker (up / push / down) | switch | `button40, button39, button41` | lower |
| Lower trigger | button | `button42` | rear |
| JETT / alternate action | switch | `button43, button47` | lower |
| Lower rear button | button | `button44` | rear |

## VIRPIL Rotor TCS / TCS Plus + SharKa-50 grip

`builtin-virpil-rotor-tcs-sharka50` · category `collective` · variant of `builtin-virpil-rotor-tcs` (no match rules)

**Source:** collectives/virpil/shakra-50/Screenshot 2026-10-09 175933.png: grip buttons 1–12 and 14–23. Uses spelling SharKa-50. Product photo + both base photos.

**Uncertainties / visibility:** No button 13 is drawn, so it is omitted. All grip controls are visible. Base x/y are provisional and idle remains unassigned. Hat arrays are diagram-relative up/right/down/left/push, even though the photo is taken from the opposite angle.

**Photos:** `virpil-rotor-tcs-sharka50-main.webp` (SharKa-50 grip), `virpil-rotor-tcs-main.webp` (Rotor TCS base), `virpil-rotor-tcs-plus-main.webp` (Rotor TCS Plus base)

| Callout label | Kind | Inputs | View |
| --- | --- | --- | --- |
| Collective axis | axis | `x` | base |
| Clutch (TCS Plus only) | axis | `y` | plus |
| Engine idle (TCS Plus only) | button | `[unassigned]` | plus |
| Left push button | button | `button1` | grip |
| Left toggle | switch | `button2, button3` | grip |
| Lower hat | hat | `button5, button6, button7, button8, button4` | grip |
| Upper hat | hat | `button10, button11, button12, button23, button9` | grip |
| Rocker (up / push / down) | switch | `button15, button14, button16` | grip |
| Middle toggle | switch | `button17, button18` | grip |
| Red push button | button | `button19` | grip |
| Right push button | button | `button20` | grip |
| Right toggle | switch | `button21, button22` | grip |

## VIRPIL Rotor TCS / TCS Plus + Hawk-60 grip

`builtin-virpil-rotor-tcs-hawk60` · category `collective` · variant of `builtin-virpil-rotor-tcs` (no match rules)

**Source:** collectives/virpil/hawk-60/Screenshot 2026-10-09 175747.png: grip buttons 1–27. Product photo + both base photos.

**Uncertainties / visibility:** Side hat 2–6 is mostly hidden on the far side of the shaft; its anchor is estimated at its exposed upper edge. Trigger 1 is visible under the shaft. Base x/y are provisional and idle remains unassigned.

**Photos:** `virpil-rotor-tcs-hawk60-main.webp` (Hawk-60 grip), `virpil-rotor-tcs-main.webp` (Rotor TCS base), `virpil-rotor-tcs-plus-main.webp` (Rotor TCS Plus base)

| Callout label | Kind | Inputs | View |
| --- | --- | --- | --- |
| Collective axis | axis | `x` | base |
| Clutch (TCS Plus only) | axis | `y` | plus |
| Engine idle (TCS Plus only) | button | `[unassigned]` | plus |
| Trigger | button | `button1` | grip |
| Side hat | hat | `button3, button4, button5, button6, button2` | grip |
| EXT hat | hat | `button8, button9, button10, button11, button7` | grip |
| ENG RPM (up / push / down) | switch | `button13, button12, button14` | grip |
| EMER REL / HOOK | button | `button15` | grip |
| SRCH LT / SVO hat | hat | `button17, button18, button19, button20, button16` | grip |
| STG toggle | switch | `button21, button22` | grip |
| LDG LT hat | hat | `button24, button25, button26, button27, button23` | grip |

## MOZA AB6/9 base + MHG grip

`builtin-moza-ab6` · category `stick`

**Source:** All existing authored AB6/MHG callouts, input numbering, anchor/box fractions and match rules retained. Added AB9 reference photo from stick/moza/ab9/10.jpg to this same template.

**Uncertainties / visibility:** The clearer JPG was chosen over the 499px WebP. It is fitted with MH16, not the template’s default MHG grip; the new reference view has no duplicate input callouts. Existing Front/Back pages keep all controls. Select the MH16 variant under Grips for this base for that grip’s controls. AB9 does not have the AB6 panel keys/levers visible; they remain on the existing AB6 views. No new AB9 template.

**Photos:** `moza-ab6-front.webp` (Front), `moza-ab6-back.webp` (Back), `moza-ab9-main.webp` (AB9 base (MH16 reference))

| Callout label | Kind | Inputs | View |
| --- | --- | --- | --- |
| Button 2 | button | `button2` | front |
| Hat (4-way + push) | hat | `button7, button8, button9, button10, button11` | front |
| Thumb hat (4-way + push) | hat | `button17, button18, button19, button20, button21` | back |
| Trigger (stage 1 / 2) | switch | `button1, button6` | back |
| Rear button | button | `button3` | back |
| Ministick (RX / RY) | axis | `rotx, roty` | front |
| Ministick buttons (4-way + push) | hat | `button25, button26, button27, button28, button29` | front |
| Hat (4-way + push) | hat | `button12, button13, button14, button15, button16` | front |
| Button 5 | button | `button5` | front |
| Button 4 | button | `button4` | back |
| Rocker (up / push / down) | switch | `button22, button24, button23` | back |
| Twist (Z / RZ) | axis | `z, rotz` | front |
| Stick X / Y | axis | `x, y` | front |
| Base keys (left) 49-52 | buttons | `button49, button50, button51, button52` | back |
| Base keys (right) 53-56 | buttons | `button53, button54, button55, button56` | back |
| Slider wheel (left) | axis | `slider1` | front |
| Slider wheel (zones) | switch | `button57, button58, button59` | front |
| Dial wheel (right) | axis | `slider2` | front |
| Dial wheel (zones) | switch | `button60, button61, button62` | front |

## Checks

- `npx tsc -b --noEmit`: passed.
- `npm run test:unit`: passed, 152 tests; includes new-template coverage, every feed file round trip, categories, matching, grip variants, input uniqueness/caps, T-Rudder one axis and base two axes. Background-removal model and formatting tests also pass.
- `npm run build`: initially blocked because Vite tries to create `node_modules/.vite-temp`, which is read-only. `npm run build -- --configLoader runner`: passed, including production template-feed emission. No package script changes were required.
- `git diff --check`: passed.
- E2E intentionally left to the user (sandbox blocked).

TypeScript build cache paths now use the repository’s ignored `.tmp` because `node_modules` is read-only. The requested `/workspace/uploads/oct9b/review.md` destination is also mounted read-only (EROFS); this file is the complete fallback review list.
