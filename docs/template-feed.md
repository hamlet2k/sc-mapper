# Template feed (for other apps)

SC Keymap publishes the hardware part of its built-in device templates as static JSON next to the app: the pictures, the callouts
(where each control is and which input it reports), the USB match rules and the button / hat / axis numbers. Other apps, such as
DCS Mapper, can fetch them at startup, cache them and stay in sync. Default bindings are **not** part of the feed: they are specific to
Star Citizen.

The feed is generated at build time (`npm run build`, also on Vercel) from the same built-in template objects the app uses
(`src/lib/builtinTemplates.ts`, `src/lib/deviceTemplates.ts` with `devicePhotoLayouts.ts` / `devicePhotoSizes.ts`). Nothing in it is
maintained by hand, and the generated files are not committed. The code: `src/lib/templateFeed.ts` (feed builder),
`scripts/template-feed.ts` (Node side: hashes, photo files, commit), and the `template-feed` plugin in `vite.config.ts` (emits the files
into `dist/` and serves them under `npm run dev`).

## URLs

| URL | What |
| --- | --- |
| `https://sc-mapper.vercel.app/templates/index.json` | the index: every template with its hash, plus a table of the photos |
| `https://sc-mapper.vercel.app/templates/<id>.json` | one template (e.g. `/templates/builtin-tm-warthog-stick.json`) |
| `https://sc-mapper.vercel.app/templates/art/<id>.svg` | generated vector art of the templates that have no photo (the generic stick / throttle / gamepad) |
| `https://sc-mapper.vercel.app/device-photos/<name>.webp` | the photos the templates reference |

Every path inside the feed (`file`, `photos`, `art.url`, a view's `image`) is an **absolute path**. Resolve it against the origin
`index.json` was fetched from, so the feed also works from a preview deployment or a local `npm run preview` (`http://localhost:4173`)
/ `npm run dev` (`http://localhost:5173`) server. All of these URLs send `Access-Control-Allow-Origin: *`.

Cache headers on Vercel (`vercel.json`): `index.json` uses `public, max-age=60, must-revalidate`, other `/templates/*` files use
`max-age=300, must-revalidate` and photos use `max-age=3600, must-revalidate`. The site has no SPA rewrite, so a missing file is a 404.
(`vite preview` locally answers unknown paths with `index.html`, so check the content type or that the body parses.)

## index.json

```jsonc
{
  "format": "sc-mapper-template-feed",
  "formatVersion": 1,
  "generatedAt": "2026-10-08T18:15:01.640Z",          // build time (ISO 8601, UTC)
  "appVersion": "0.1.0",                               // package.json version
  "commit": "4942489…",                                // VERCEL_GIT_COMMIT_SHA on Vercel, else `git rev-parse HEAD` (absent outside git)
  "docs": "https://github.com/hamlet2k/sc-mapper/blob/main/docs/template-feed.md",
  "inputNaming": "star-citizen",                       // see "Input names" below
  "inputNamingDescription": "Callout inputs use Star Citizen joystick / gamepad input names …",
  "templateFormat": "sc-mapper-device-template",       // format of each /templates/<id>.json
  "templateVersion": 1,
  "count": 37,
  "templates": [
    {
      "id": "builtin-moza-ab6-mh16",
      "name": "MOZA AB6 base + MH16 grip",
      "brand": "MOZA",                                 // absent for the generic templates
      "slot": "js",                                    // js = joystick / HOTAS, gp = gamepad
      "builtin": true,
      "variantOf": "builtin-moza-ab6",                 // grip variants only (see below)
      "match": [],                                     // USB / name rules (see below)
      "file": "/templates/builtin-moza-ab6-mh16.json",
      "hash": "eed99442…",                             // sha256 (hex) of the exact bytes of `file`
      "bytes": 6882,
      "photos": ["/device-photos/moza-ab6-mh16-front.webp", "/device-photos/moza-ab6-mh16-side.webp"]
      // "art": { "url": "/templates/art/builtin-stick.svg", "width": 1000, "height": 900 }   (generated-art templates only)
    }
  ],
  "photos": {
    "/device-photos/moza-ab6-mh16-front.webp": {
      "width": 572, "height": 993,                     // pixels (from devicePhotoSizes)
      "bytes": 61146, "hash": "be50f5ed…",             // sha256 (hex) of the file
      "productBox": { "x": 0.07867, "y": 0.04532, "w": 0.84266, "h": 0.90937 }   // the product without its glow padding, fractions of the photo
    }
  }
}
```

Templates are listed in the app's order: the generic ones first, then the device templates. `updated` is not published. Built-ins
have no edit date, so compare `hash` instead.

### Fields

- **`builtin`** is always `true` in the feed: these are SC Keymap's built-in templates. When the app imports a file, it makes a user
  template with a new id, as for any template file.
- **`variantOf`** marks a grip variant: a base fitted with another grip (e.g. MOZA AB6 + MH16) that reports the same USB id and button
  count as the plain base, so it can't be told apart automatically. A variant has **no match rules**. Offer it as an alternative
  whenever its base (`variantOf`) is the device's automatic match (SC Keymap lists it under "Grips for this base").
- **`match`**: a list of rules, and a device matches when any one rule fits. Inside a rule, every field present must fit. `vendor` /
  `product` are 4 hex digits in upper case (USB VID / PID). `name` is part of the device name (compare case-insensitively, ignoring
  punctuation and spaces). `buttons` is an exact button count, used to tell apart devices sharing a USB id. SC Keymap scores a USB id
  as 10, a name as 5 and a button count as 3, and the best total wins. An empty list means the template is never matched
  automatically (the generic templates and the variants).

## /templates/&lt;id&gt;.json

Each file is one template in the same shape as the app's **Export template** (format `sc-mapper-device-template`, version 1): what
`templateForFile()` writes, plus `builtin` and `variantOf`. SC Keymap's own template import accepts it unchanged (a unit test
round-trips every file through it).

```jsonc
{
  "format": "sc-mapper-device-template", "version": 1,
  "id": "builtin-tm-t16000m", "name": "Thrustmaster T.16000M FCS stick", "brand": "Thrustmaster", "slot": "js", "builtin": true,
  "notes": "Numbers as the Thrustmaster manual shows them …",
  "aspect": 1.4244,                                    // width / height of the first view
  "match": [{ "vendor": "044F", "product": "B10A" }, { "name": "T.16000M" }],
  "views": [                                           // photo templates: one or more pictures (pages)
    { "id": "main", "label": "Front", "image": "/device-photos/tm-t16000m-main.webp", "width": 1809, "height": 1270 }
    // optional "swap": "Grip": views with the same swap key are alternatives (interchangeable grips); show one at a time, the first by default
  ],
  "callouts": [
    { "id": "pov", "kind": "hat", "inputs": ["hat1_up", "hat1_right", "hat1_down", "hat1_left"], "label": "POV hat (8-way)",
      "group": "Grip head", "view": "main", "anchor": { "x": 0.471, "y": 0.075 }, "box": { "x": 0.125, "y": 0.117 } }
  ]
}
```

- **Views.** Each view is a canvas of `width` × `height` (only the ratio matters). Draw its photo centred in it, aspect kept
  (object-fit: contain). The canvas is wider than the photo to leave room for the label columns. Templates without `views` have one
  picture in `image` and the canvas ratio `aspect`. In the feed, these are the generated-art templates, whose `image` is an embedded
  `data:image/svg+xml` URL (the same SVG as `art.url`).
- **`author`** (optional): the template creator's name or handle, a non-empty string trimmed to at most 40 characters (like `brand`).
  Import ignores non-string or blank values and unknown fields. Exports and `/templates/<id>.json` preserve it when present;
  built-ins may omit it. This additive metadata uses the existing version 1 format, shared with DCS Mapper.
- **Callouts.** `anchor` is the point on the device where the leader line starts. `box` is the centre of the label. Both are fractions
  (0..1) of the view's canvas. `view` is the id of the view the callout sits on (missing = the first view). `kind` is `button`, `hat`
  (inputs up, right, down, left, then an optional push), `axis` (one, or two for a mini-stick: x then y), `encoder` (clockwise,
  counter-clockwise, optional push), `switch` (one input per position) or `buttons` (a row, one input per key). `group` is a
  display grouping.
- **`region` / `inputRegions`** (optional) are glow outlines: an SVG path in canvas units, with the canvas scaled to 1000 wide
  (viewBox `0 0 1000 1000/aspect`) and drawn translated to the anchor. `inputRegions` has one path per input (`''` = none).
- **An empty input `''`** keeps the place of a control whose number the device does not fix (e.g. user-configured firmware). Show it as
  unassigned.
- **Input count limit (shared contract): a callout has at most 32 inputs, whatever its kind.** Each kind also has its natural size:
  `button` 1, `hat` 4 or 5, `axis` 1 or 2, `encoder` 2 or 3, `buttons` 2 to 32 (long rows: ICP / UFC keypads, MFD bezels),
  `switch` 2 to 8 as built in the editors (SC Keymap and DCS Mapper); a file with a longer switch (up to 32) is still valid. A template
  with a callout of more than 32 inputs is **invalid**: SC Keymap rejects the whole file on import (template import, shared
  controller files) with a visible error naming the callout ("callout 4 (UFC keypad) has 33 inputs; a callout can have at most
  32"); it never cuts the list, which would silently drop buttons. Clients should apply the same rule (reject or flag such a callout
  visibly, never truncate). `inputRegions`, when present, has at most one entry per input (so at most 32 as well).
- **"Fill range" syntax (template editors, shared with DCS Mapper).** Comma-separated tokens, each a button number or a range
  `first-last`: `1-20`, descending `42-34` (button42, button41 … button34, in that order), `1-9, 12, 15-17`. Whitespace around tokens
  and dashes is ignored; numbers are 1 to 128; the result is written as `buttonN` inputs, in the typed order (a number listed twice is
  kept once). More than 32 buttons (8 for a switch), fewer than 2, or an invalid token (`x`, `1-5-9`, `5 8`) is refused with a message
  and changes nothing.

Per-template files are deterministic: a stable key order and no timestamps, so a hash changes only when the template itself changes.

## Submitting a template

In the template editor, enter an optional **Author**, then use **Submit to feed** beside **Export template**. The same action is
available on the Devices page for user templates and customized copies; unchanged built-ins are already in the feed.

Submission downloads the same `<name>.sc-template.json` as export, with pictures embedded, and opens a pre-filled GitHub issue
containing a short device summary. Drag the downloaded file into the issue before submitting it: a link cannot carry the file.
Confirm the photo-sharing rights and check button numbers against the device with a press test. You can also export first and
choose **Template submission** when opening an issue directly on GitHub.

A maintainer reviews the file and its button numbering. Once accepted, it becomes a built-in template and appears in the shared
feed. The photo is stored as a WebP under `/device-photos/` on the site; the feed references that photo rather than embedding it.

## Input names

`inputNaming: "star-citizen"`: callout inputs are Star Citizen input names without the device prefix (`js1_`, `gp1_`):

| SC Keymap / Star Citizen | Meaning | DCS World |
| --- | --- | --- |
| `buttonN` (1-based) | DirectInput button N | `JOY_BTN` N, e.g. `button7` → `JOY_BTN7` |
| `hatN_up` / `hatN_right` / `hatN_down` / `hatN_left` | POV hat N directions | `JOY_BTN_POV` N `_U` / `_R` / `_D` / `_L`, e.g. `hat1_up` → `JOY_BTN_POV1_U` |
| `x` `y` `z` | main axes | `JOY_X` `JOY_Y` `JOY_Z` |
| `rotx` `roty` `rotz` | rotation axes | `JOY_RX` `JOY_RY` `JOY_RZ` |
| `slider1` `slider2` | sliders / dials | `JOY_SLIDER1` `JOY_SLIDER2` |

Gamepad templates (`slot: "gp"`) use XInput-style names: `a b x y shoulderl shoulderr triggerl_btn triggerr_btn thumbl thumbr back
start dpad_up dpad_right dpad_down dpad_left`, axes `thumblx thumbly thumbrx thumbry triggerl triggerr`. A DCS client can skip them or
map them itself. Button numbers are DirectInput's (1-based), as the game and the device manuals show them.

## How a client should sync

1. At startup, fetch `/templates/index.json`. Check `format === "sc-mapper-template-feed"` and `formatVersion === 1`. If the version
   is unknown, keep the cache and don't parse further.
2. For each entry, compare `hash` with the cached copy. Download only new or changed `file`s, and the `photos` (by `photos[url].hash`)
   and `art.url` they reference. Optionally check the SHA-256 of what you downloaded: if it doesn't match (a CDN or browser cache
   during a deploy), retry once with `?v=<hash>` appended.
3. Store the index and the files. Drop cached templates that are no longer listed (or keep them as "retired" if users picked them).
4. Offline, or on any error, use the cache. Ship a snapshot of the feed with the app so the first start works without a network.
5. Ignore unknown fields: new optional fields can appear without a version bump.

## Format version policy

- **Additive changes keep `formatVersion: 1`:** new optional fields in the index or in template files, new templates, new callout
  kinds that older clients can show as plain buttons, and new photos.
- **Breaking changes bump `formatVersion`:** renamed or removed fields, changed meaning or units, a new input-naming scheme. The new
  version is published at a new path (e.g. `/templates/v2/index.json`), and v1 keeps being published at `/templates/index.json` for a
  transition period (announced in this document).
- The per-template format (`sc-mapper-device-template`, version 1) follows the app's own template file format. It only changes
  together with the app's import, which keeps reading older files.

## Contributing a new template

1. On a branch, add the device to `src/lib/deviceTemplates.ts` (`photoTpl`, `photoTplExact` or `photoTplExactViews`, or `tpl` with
   a layout in `src/lib/devicePhotoLayouts.ts`): id `builtin-<brand>-<model>`, name, brand, USB `match` rules, notes on numbering, and
   the callouts with the input numbers the device really reports.
2. Add its cut-out photo as WebP to `public/device-photos/<name>.webp` and its size to `src/lib/devicePhotoSizes.ts` (generated by
   `scripts/device-photos/cutout.py`).
3. Run the checks: `npx tsc -b --noEmit`, `npm run test:unit` (it includes the feed tests: every built-in in the feed, photos
   present, import round trip), `npm run build` (then look at `dist/templates/`), and `node scripts/e2e.mjs` against `npm run preview`.
   `npx tsx scripts/template-feed.ts` writes the feed to `.tmp/template-feed/` for a quick look.
4. Open a pull request. Once it's merged to `main`, Vercel deploys it and the template appears in the feed.
