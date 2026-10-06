# SC Mapper UX pass: decisions (agreed with Federico, Oct 5, 2026)

Status: design only. Nothing implemented yet. Plan the whole restructure, get approval, then build it in one pass (no small piecemeal changes).

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
