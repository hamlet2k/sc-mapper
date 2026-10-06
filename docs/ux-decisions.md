# SC Mapper UX pass: decisions (agreed with Federico, Oct 5, 2026)

Status: round 1 implemented in one pass on branch `ux-pass` (local, not deployed). The calls made where this doc was silent are listed at the end under "Implementation calls (round 1)".

## Structure
- Views are first class: List (bindings), Keyboard, Devices, Conflicts.
- Each view shows only the filters that affect it, dynamically.
- Truly global things (profile load/import/export, search) stay in a slim shared header.

## Search
- "Find by pressing" moves into the search box as an icon (saves space): press icon, press an input, box fills with that input.

## Filters per view
- Input type (keyboard / mouse / joystick / gamepad): List and Conflicts only.
- Show unbound: List only.
- Customized only: List, Keyboard, Conflicts.
- Conflicts only: List, Keyboard (pointless in Conflicts view).
- Categories: List (and Keyboard/Conflicts where they narrow results); not in Devices.
- Devices view: none of the above; its own controls are device, template, control groups.
- Note (current code): Devices view ignores all filters and receives unfiltered rows.

## Settings page (new, later)
- Internal actions toggle: hidden from the toolbar, moves to settings (off by default).
- Highlight on press and Scroll to it: behaviour preferences, not filters; move to settings.
  - Apply to List, Keyboard, Conflicts AND Devices (Devices must honor them; today it always highlights/scrolls).
  - Conflicts: pressing an input flashes the conflict groups using it and scrolls to the first.
  - Highlight off: no lighting/jumping. Scroll off: lights up but stays put.

## Controllers modal (replaces the top "Controllers" button)
- One row per game slot (kb1, mo1, js1..., gp1...): game slot  <>  detected hardware  <>  template for that hardware.
- Row = in-game binding set; one hardware and one template per row. Template is stored on the slot (not on the browser device), so the main page has no "1 of 2" guessing.
- Mapping is editable and saved (browser order can differ from the game's; identical devices are a guess). Match by product names in actionmaps.xml <options> when imported.
- Slots whose device is not plugged in stay listed as "not connected" with their template.
- Manual "this slot is device X" without a live device (Chromium 4-controller limit).
- Add js/gp slots inline; export writes their product names to <options>.
- All detected hardware is listed in the modal (assigned or available to assign).
- Keyboard and mouse slots fixed by default, with the ability to add more.
- Removing a slot is allowed: drops its bindings, with a clear warning; offer copy/move bindings to another slot first (details TBD).
- Main page shows only what goes into the export (the mapped slots), not all detected hardware.
- No imported profile: no slots, modal starts empty (user adds slots).

### Matching vs assignment (decided)
- Two separate steps: auto-matching and assignment.
- Hardware auto-match: only on a fresh profile import (slot -> detected hardware, by <options> product names).
- Template auto-match: whenever hardware is (re)assigned to a slot (e.g. js1 MTQ -> MOZA AB6 auto-selects the AB6 template).
- Once the user changes hardware or template, it is pinned to that slot/hardware association for that profile; no more auto-matching overrides it.
- A device remembers the template the user picked for it.
- Within a profile, a custom template pick follows the hardware: moving that hardware to another slot carries the custom template until the user changes it again.

## Implementation calls (round 1)

Judgment calls made while building round 1, where the decisions above didn't say. Any of them can be changed.

### Header and navigation
- The header has two rows. Row 1 holds the logo, the view tabs (List / Keyboard / Devices / Conflicts, with the conflict count on its tab), then profile select, Import, Export, Edit, Controllers (with the slot count), Settings (⚙) and Help (?). Row 2 holds the search box (with the 🎯 find-by-pressing icon inside it) and only the active view's filters.
- The app title is hidden below very wide screens so row 1 fits at 1360 px. The hex logo stays.
- The header stat chips are gone. The List view shows its counts on the right of its filter bar. The "defaults from build …" badge moved to Settings.
- The "Sample" button moved into the empty-state banner ("Try a sample"), since it's only useful before anything is loaded.
- Edit mode stays in the header. It's an action, not a filter, and it applies to List and Keyboard.

### Filters and search
- Which filters each view shows comes from one table (`VIEW_FILTERS` in App.tsx). A filter that's hidden in a view keeps its value but isn't applied there, so switching views never filters by something you can't see.
- Categories (the left sidebar) apply to List, Keyboard and Conflicts. In Conflicts the counts are conflicted actions per category. The sidebar is hidden on Devices.
- The Conflicts view's "include default overlaps" checkbox moved into the Conflicts filter bar as "Default overlaps".
- The search box stays in the header on every view. Typing a search or using find-by-pressing on Devices switches to the List, because Devices has no search. On Keyboard and Conflicts, find-by-pressing filters in place (before, it forced Conflicts back to the List).

### Settings
- Settings is a modal opened with ⚙. It has Highlight on press, Scroll to it (which is greyed out when highlight is off), Show internal actions, and the defaults/build info.
- "Show internal actions" is now remembered (`sc-mapper:show-internal`, default off). Highlight and scroll keep their existing keys.
- Highlight/scroll on Conflicts: pressing an input flashes every conflict group that uses it (a glowing rim) and scrolls to the first one. The badge reads "N conflict groups".
- Devices honours both settings. With highlight off, presses don't light callouts, don't switch the grip view automatically and don't pulse or jump. With scroll off, callouts light up but the page doesn't move.
- Holding a button still re-triggers the flash every frame, so it shows fully on release. This is unchanged from before.

### Game slots (Controllers modal)
- The modal has three tabs. "Game slots" is the new main tab. "Axis settings & curves" and "Input tester" are the old contents, kept as they were.
- kb1 and mo1 are added on every import and can't be removed. Extra keyboard/mouse slots (kb2, mo2…) can be added and are written to the export's device list and `<options>`, but bindings are still always captured as kb1/mo1 (see gaps).
- With no imported profile there are no slots at all, not even kb1/mo1. The main page then has nothing to show for controllers, and Devices shows an empty state with a button that opens Controllers.
- An import creates slots from the file's `<options>` devices plus any js/gp numbers its bindings use.
- Hardware auto-match on import waits until the browser actually reports controllers. Browsers only reveal them after a button press, so the match happens on the first press after import. It runs once, and it still counts as the import's match.
- Matching order: old per-device numbers you set in the earlier Controllers panel (`sc-mapper:devices:v1`) are used once at that match. Then USB vendor/product id from the `<options>` GUID, then the product name. Identical devices go to their slots in browser order (the existing dupOrderGuess), and the row says "identical device: a guess".
- The hardware dropdown shows "Detected now", then "Not connected" (hardware seen before in any profile), then "Other device…", where you type a name. That last one covers devices the browser can't show, such as Chromium's 4-controller limit. A manual entry is stored as `manual:<name>` and its name goes into `<options>` on export.
- Assigning hardware to a slot removes it from any other slot. A device can't be in two slots.
- Below the slots, "Detected by this browser" lists all hardware, each marked "in jsN" or "available", with a one-click "＋ as jsN".
- Controllers that aren't in a slot are numbered after the slot numbers in capture and press-to-search, so they never take an existing slot's number. Capturing or importing a binding on a number that has no slot adds that slot automatically.
- The capture dialog's instance picker now assigns that controller to the slot, so it stays consistent with the modal.

### Templates per slot
- Order of choice: your pick, then the old global template pick for that device (`sc-mapper:template-picks`) as a fallback, then automatic matching. Picking "Automatic" while an old pick exists stores an explicit "auto" pin so the old pick stops applying.
- A pick is stored against the hardware, so it follows that device to another slot within the profile. A slot without hardware stores the pick on itself.
- Assigning different hardware to a slot re-matches the template, unless that hardware already has a pick in this profile.
- Saving a customized copy in the template editor pins it to the slot. When the saved copy is already what automatic matching picks (same USB id), the row still shows "matched to the hardware".
- Swap-view (grip) choices are still remembered per device, so existing choices carry over.

### Removing and copying bindings
- Remove warns with the number of your bindings on that slot. It drops them and the slot's `<options>` entry, and it can be undone with ↶ Undo. The warning says the game's defaults aren't affected, because defaults are never stored in the profile. "Copy bindings to another slot first" opens the copy dialog.
- Copy and move only work between slots of the same kind (js to js, gp to gp). Joystick and gamepad input names don't line up.
- What gets copied is the effective bindings on the source slot, defaults included, so the copy ends up as the user sees it. The count on the button includes those defaults.
- "Missing on the target" means an input the target's template doesn't draw, or a button beyond the connected controller's count when it has no template. The preview lists them, and "skip those" leaves them out.
- When an input on the target is already bound, you choose to replace those bindings or keep both. Keeping both shows up in Conflicts.
- The copy target can be an existing slot or a new one added on the spot. "Move" also clears the source slot.

### Profiles and export
- Slot maps are stored per profile under `sc-mapper:slots:v1`. Defaults-only mode uses its own `_defaults` map, which a profile created from the defaults inherits. New/Duplicate copies the current profile's map. Deleting a profile deletes its map.
- The export declares every mapped js/gp slot, even one without bindings, with its hardware's product string (or the game file's original one), so the game keeps the numbering.
- The export dialog lists the slots it will write instead of every detected controller.

### Main page
- The Devices view's device picker lists only js/gp slots, shown as "jsN · hardware". A "Slots…" button opens the modal.
- The sidebar's profile card lists the slots (kb1, mo1, js1…) with their names and an "Edit game slots…" link.

