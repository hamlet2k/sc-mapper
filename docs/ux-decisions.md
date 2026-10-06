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


## Round 1 review feedback (Federico, Oct 5, 2026)
- Input types (keyboard/mouse/joystick/gamepad) become icons, grouped under a "View" section.
- Show unbound / Customized only / Conflicts only grouped under a "Filters" section.
- Remove the top Controllers button; move/rename it in place of the sidebar "Edit game slots…" link.
- Show the slot/template selection inside the Devices (joystick) view.
- One consistent icon palette, futuristic (line icons), no cartoon emoji.
- Bring back the app title; view tabs underneath it.
- Profile unified into one section with icon actions: delete (with warning) / import / export.
- "Edit" is an action on the current view's bindings: move it out of the header into the view.
- Search / find-by-press stays contextual to the current view (Devices no longer jumps to List).
- Grip photo switching on press always happens, regardless of highlight setting.
- Copy only between same-kind slots: confirmed.
- Added kb/mo/gp slots get a selector like device selection (pick which slot to bind/show).
- Add "select hardware by pressing a button" next to the hardware dropdown in each slot row.

## Implementation calls (round 2)

### Layout
- Three rows, top to bottom. First the title row: logo, "SC Keymap", the console subtitle with the game version, and Settings / Help icon buttons on the right. Then the view tabs (List / Keyboard / Devices / Conflicts, the conflict count on its tab). Then the current view's toolbar.
- The toolbar sits in the content column, above the view, not in the header, so the sidebar stays full height. It holds the search with find-by-press, a labelled **View** section (input-type icon toggles, plus slot pickers where they apply), a labelled **Filters** section, and on the right the view's own actions.
- The Controllers header button is gone. The entry point is the **Game slots & controllers** button in the sidebar's profile card, which replaces the "Edit game slots…" link. The "Axis settings & curves" link sits under it.
- **Edit** is a List-toolbar action ("Edit" / "Done"), since only the List edits bindings. Undo stays in the edit bar under the toolbar while editing. Behaviour is unchanged.

### Filters per view
- **List:** View has the four input toggles (click shows/hides, double-click shows only that one). Filters has Show unbound, Customized only, Conflicts only, and the category chip.
- **Keyboard:** no input toggles (the view is keyboard + mouse by definition). View holds the kb / mo slot pickers, only when there is more than one keyboard or mouse slot. Filters has Customized only and Conflicts only.
- **Conflicts:** View has the input toggles. Filters has Customized only and Default overlaps.
- **Devices:** no View/Filters sections. The slot strip at the top of the view is the selector, and only the search and find-by-press apply.

### Profile section
- The profile has a single home: the sidebar "Active profile" card, shown on every view. On narrow screens the same card sits at the top of the content, and it is rendered only once.
- The card holds the selector, then icon actions Import / Export / Delete, then a "more" menu with New from defaults, Duplicate, Revert to imported and Reset all.
- Delete opens a warning that names the profile and its binding count and lists what goes with it: slots, hardware and template picks, axis settings, undo history. It says the file on disk isn't touched and that this can't be undone. "Export first" is offered. The game defaults can't be deleted (the button is disabled).

### Devices view
- A slot bar at the top lists every slot, kb/mo included (icon, id, hardware name, connection dot). Under it are the selected slot's hardware ("connected" / "not connected"), the template dropdown (js/gp only) and a "Game slots & controllers…" link to the full modal.
- Selecting a kb/mo slot shows the keyboard for that instance. Template tools (Customize / New / Import / Export, PNG, Print) moved to a row of their own above the picture.
- **Search on Devices stays on Devices.** Text search dims the callouts whose control or bound actions don't match, and a status line gives the match count. Find-by-press switches to the slot of the pressed device, picks out that control (or its "not on the picture" entry), scrolls it into view and dims the rest; for a key or mouse button it selects that keyboard slot.
- No view switches on its own any more: typing and find-by-press never change the view. Clicking a key in the Keyboard view or a conflict still opens the List, because that is explicit navigation.
- **Grip photos switch on every press**, whatever the "Highlight on press" setting. Only the glow and scroll follow that setting. A find-by-press hit also switches the grip, and the status line says "grips still switch" while highlight is off. The Settings hint says so too.

### Extra kb / mo / gp slots
- kb/mo instances are real everywhere: binding keys, physical keys, input names, search. kb2_j is a different input from kb1_j and never conflicts with it.
- The Keyboard view shows one keyboard and one mouse instance at a time, chosen in the View section.
- The capture dialog shows kb / mo pickers when there are several slots of that kind. It defaults to the instance the Keyboard view shows, or to the replaced binding's instance. Captures, manual entry and mouse clicks all go to the picked instance (KB2 / MOUSE 2 in the dialog header).
- Binding chips tag non-1 instances (KB2, MO2, GP2).
- gp2 needs no picker: whichever controller sits in the gp2 slot captures as gp2.
- A capture from a controller that is in no slot yet makes that controller the slot's hardware. Without this, its numbering moved after the capture (found by the e2e).
- On import, a gamepad slot still unmatched takes the remaining gamepad in order ("matched on import (gamepad order)"). Windows and browsers name XInput pads differently, so name matching never worked for gamepads.

### Game slots & controllers modal
- **Pick by pressing:** a "Press" button next to each slot's hardware dropdown. It listens to every controller: the next newly pressed button picks that controller, including one the browser only reveals because of that press. Axes are ignored, so drift or a resting throttle can't pick. Any controller kind goes into the slot that is listening (the slot decides). Esc or Cancel stops listening. The device leaves any other slot it was in, as with the dropdown.
- Copy is offered on kb/mo slots too (to another slot of the same kind). The count chip shows "N yours", meaning your own bindings on that slot. The Copy dialog splits "X yours and Y game defaults", because the copy brings the effective bindings, defaults included.
- **Escape:** dialogs stack, and Escape closes only the topmost one: pick-by-pressing, then Copy / Remove, then the modal. Settings, Help, Export, the action editor, the capture dialog and the profile delete warning work the same way.

### Icons
- One line-icon set lives in `src/components/icons.tsx`: 24px grid, 1.5 stroke, round caps, `currentColor`, sized to the text unless a size is given. It replaces every emoji / pictograph in the header, tabs, filters, buttons, modals, chips and the category list.
- "×" multipliers and "→" arrows inside sentences are kept as typography.

## Round 2 review feedback (Federico, Oct 5, 2026)
- Devices view slot bar lists only js slots (and gp slots); kb/mo slots never appear there. kb/mo slot pickers live only in the Keyboard view.
- Remove the "Game slots & controllers" link from the Devices view (the profile card button is the single entry point).
- Template actions (Customize a copy, New, Import, Export) and output actions (PNG, Print) become icon buttons on the same line as the template dropdown, as two separated groups.
- Each js/gp slot page in Devices gets its own "Axis settings & curves" CTA (axis, inversion, curves for that device); remove that tab from the controllers modal.
- Curves can only be customized for the first 8 devices: beyond js8 the CTA stays visible but disabled, with a message to reorder in Game slots & controllers.
- Game slots modal: move up / move down on js (and gp) rows, swapping the instance numbers of two slots, carrying bindings, hardware, template and axis settings.
- Rename "N yours" to clearer wording (custom bindings vs game defaults).

## Implementation calls (round 3)

### Devices slot bar
- The slot bar lists only js and gp slots. A saved selection of a kb/mo slot from an earlier version falls back to the first connected joystick.
- Keyboard and mouse slots are reached only through the Keyboard view's kb / mo picker (unchanged). A find-by-press on a key while on Devices selects nothing there.
- A profile with no js/gp slot gets the empty state "No joysticks or gamepads yet", which points to the Keyboard view when kb/mo slots exist.
- The "Game slots & controllers…" link is gone from the bar. The one exception to the single entry point is the reorder button in the js9+ notice (see below), because that message is about reordering.
- Second line of the bar: Hardware, then Template (dropdown, then the template icon group, then the picture icon group), then the axis CTA on the right.
  - Template group: Customize a copy (Edit for user templates), New, Import, Export.
  - Picture group: PNG, Print.
  - Each group is a joined, bordered button set, with a divider and a gap between the two groups.
  - Each icon button has a tooltip (`title`) and an `aria-label` with the same full text, e.g. "Customize a copy of this template" or "Save the picture with its bindings as PNG".
  - The old separate template row is removed.

### Axis settings & curves per slot
- An "Axis settings & curves · jsN" button in each js/gp slot's bar opens a modal for that slot's number only.
  - It reuses the existing editor: groups list, invert, exponent, custom curve, live chart, deadzone/saturation table and ranges.
  - There are no instance tabs. The header names the slot and the device.
  - Edits go through the same undoable settings path, labelled e.g. "Invert flight_move_pitch (js2)".
- The modal tab and the profile-card link are removed.
- **Input tester:** kept as the second tab of the Game slots & controllers modal. It covers every controller, which helps when you assign hardware or check which identical device is which. A per-slot copy would add nothing.
- **Limit:** the game's joystick option tree declares 8 instances, so js9+ shows the CTA disabled with the explanation.
  - The explanation names the first-8 rule and has a "Reorder in Game slots & controllers" button that opens the modal.
  - The limit is read from the option tree, so it follows the game data if that ever changes.
- **Gamepads:** the joystick option tree declares 8 instances, but the gamepad tree declares none. So gp1 is treated as the only customizable gamepad, and gp2+ gets the same disabled CTA and reorder message ("make it gp1"). This is an inference from the game data, not confirmed in game.
  - The gamepad editor uses the gamepad option tree (thumbstick curves: FPS view / move, vehicles…).
  - It hides the deadzone/saturation table and the axis-preview picker. Those are joystick axis names (x, y, rotz…) stored per device model in `<deviceoptions>`, and the game's gamepad sticks have no equivalent here.

### Move up / down (Game slots modal)
- Up / down arrows sit next to the slot id on every js and gp row. kb/mo rows have none, since their numbers don't depend on Windows device order.
  - A slot swaps with the next slot of the same kind by number, even across gaps: js5 moves up to swap with js2 if js3/js4 don't exist.
  - The arrow is disabled at the ends. Its tooltip / aria-label says which slot it swaps with.
- A swap rewrites, both ways at once:
  - **Bindings:** the profile's own bindings, every stored jsA_ / jsB_ entry in every action. Cleared defaults (js1_) stay as they are.
  - **Game defaults** aren't stored in the profile, so they stay on their number (js1 defaults remain js1), which matches the game's own `pp_resortdevices`. Materializing them onto the moved device was tried first. It turned ~67 defaults into "custom" bindings after a single swap, which was confusing and bloated the export.
  - **Slot map:** hardware, template pick and the game-file device name all move with the slot.
  - **Profile:** the imported device list (`<options>` product) and the `<options type=… instance=…>` blocks (invert / exponent / curves) are swapped. `<deviceoptions>` are per model and need no change.
- **Undo:** one undo step labelled "Swap jsA and jsB", undone by Ctrl+Z or by the Undo button in the green notice above the slot list. Undo restores the bindings and reverts the slot map, devices and settings.
  - Per-row undo in the List skips swap steps, so a partial revert can't happen.
  - A swap with no profile active (slots set up on the game defaults) changes only the slot map and isn't recorded. You undo it by moving the slot back.
- Unit tests cover the binding rewrite (both ways, js1 untouched, keyboard half kept, cleared kept, swap twice = identity), the slot map, devices, option blocks and the neighbour rule.

### Wording
- "N yours" is replaced:
  - Copy button: "Copy bindings (N custom)". Its tooltip explains that custom means bindings you changed or added in this profile, and that the copy also carries the game defaults on that slot.
  - Copy dialog: "X bindings on Y actions: N custom bindings and M game defaults on js1", with a tooltip on each part.
  - Remove dialog: "N custom bindings (changed or added by you)".
- The Conflicts view's "yours" tag on a customized binding now reads "custom" too, with the same tooltip. The profile delete warning's "N bindings of yours" is left as is: it is a plain sentence about losing your edits, not a count label.

## Slot reordering — what it is for (agreed Oct 6, 2026)
- The app cannot change the device order the game sees (Windows USB enumeration). pp_resortdevices only rewrites jsN prefixes too, and rejects indexes it doesn't see.
- Purpose of moving slots: after SC reshuffles device numbers (on its own, or after unplugging a device), shift existing mappings to the new jsN so they match the hardware again, without remapping or chaining console commands.
- Moving mappings only makes sense after the hardware order has changed; otherwise it breaks two devices.
- Primary flow (proposed): import a fresh export, compare product names per jsN against the profile, show the detected moves (e.g. Pedals js3 -> js5, MFD L js5 -> js3) and apply them all at once, updating the device names. Manual arrows stay as a fallback.
- js9+ axis note: explain the order comes from the game/Windows, not the app.
- To verify in game: whether a mismatched Product name in the options block makes the game drop/reassign bindings.

## Refresh game state (agreed Oct 6, 2026)
- Game device order is fixed by SC; the app never reorders the XML device list, it maps against it.
- Timeline: user tunes bindings in state A; the game later reshuffles to state B. The user keeps seeing their mappings and just refreshes game state.
- Firefox can't read files from a saved path, so the flow is a "Refresh game state" button (file picker, with the usual folder shown: StarCitizen\LIVE\user\client\0\controls\mappings\) plus drag and drop of the fresh export anywhere on the page.
- Only the device list (instance -> product) is read from the dropped file; its bindings are ignored.
- Quiet rematch: no change -> short "order unchanged" note. Changed -> one-line summary of moves plus Apply (one undo step) that shifts mappings/hardware/template/axis settings and updates device names to the game's order.
- Manual up/down arrows stay as a fallback (ambiguous identical devices etc.), not presented as a way to unlock tuning.
- js9+ axis note: order comes from the game/Windows; the app can't change it.

## Implementation calls (round 4)
- **Where "Refresh game state" lives.** There are three entries, and all open the same file picker:
  - a button in the Game slots & controllers header, with the usual folder `StarCitizen\LIVE\user\client\0\controls\mappings\` under it and a copy button (browsers can't open a folder from a path, so copying it for the picker's address bar is the shortcut);
  - a small "Refresh" button on the profile card's Game slots heading, with the same path + copy;
  - a "Refresh game state (device order)…" item in the profile ⋯ menu.
  The js9+ note also has a "Refresh game state" button. Without a profile the header button is disabled and the profile card shows no entry, because there are no mappings to move yet.
- **Dropping a file.** Dragging a file anywhere shows a full-page overlay:
  - With a profile active it has two targets. "Refresh game state" is the default: it is the large left zone, and a drop anywhere outside the "Import as profile" zone also counts as a refresh. "Import as profile" is the smaller right zone.
  - Without a profile it has one "Drop to import" zone and works as before.
  - A refresh reads only the first file. Several files dropped on Import are imported one by one, as before.
- **What a refresh reads.** It reads only the `<options type instance Product>` list (`parseDeviceList`). A file with no device list gets an error toast. The file's bindings are never read.
- **Matching** (`lib/rematch.ts`, unit-tested):
  - It works per kind (kb / mo / js / gp), comparing the profile's known devices (its device list, plus slots added by hand) with the game's list, by product name. Names are compared case-insensitively, with spacing ignored and the GUID stripped.
  - A name that occurs once on each side pairs directly.
  - The result is turned into a full permutation, so data already sitting on a target number is moved out of the way, never merged.
- **Identical product names** (e.g. two "MOZA AB6 FFB Base"):
  - If the raw Product strings (GUID part) differ and pair them one to one, the pairing follows them.
  - Otherwise they are paired in their relative order (1st → 1st). If that changes their numbers, the banner flags them "(?)" with a note: they can't be told apart, so their order is assumed, and if it is wrong they can be swapped with the arrows.
  - Call: they still move as a block rather than staying put. Leaving them on their old numbers would collide with the other devices that moved, and keeping their relative order is what the game does when nothing else is known.
- **Devices the game no longer lists** (unplugged):
  - Their mappings are kept, never deleted.
  - They keep their number if it is still free. Otherwise they go to the next free number after the game's devices.
  - The slot is flagged with a chip in the modal ("not in the latest game state · mappings kept"), shown struck through in the sidebar, and listed in the banner ("not in the game: X (js2, mappings kept on js5)").
  - Refreshing again after plugging the device back in pairs it by name, and the flag clears.
- **New devices** in the game's list are added as named slots, listed as "new: X js6".
- **Slots without a device name** (added by hand, never named) can't be matched. They stay put unless a named device needs their number; then they move to the next free number, and the banner names them "js2 (no device name)".
- **Apply** is one undo step. It:
  - shifts user bindings with the stored-only rewrite (game defaults stay on their numbers, same as the arrows);
  - shifts the hardware assignment, template pick and axis settings (`<options>` blocks);
  - sets the profile's device list to exactly the game's list and order, and rewrites each moved `<options>` block's Product to the game's string;
  - names the slots after the game's devices.
  Undo restores a snapshot of the device list, axis settings and slot map, plus the bindings. This also replaces round 3's "swap again" undo for the arrows. Per-row undo ignores these entries, as before.
- **Same order:** a quiet toast, "Game device order unchanged". Dismissing the banner changes nothing. The banner shows at the top of the main page, and inside the modal when that is open.
- **Importing an older file over an active profile** whose device order differs (for one file dropped or picked, compared with the active profile's device list, which is the game state after a refresh):
  - First a dialog lists the moves, with "Shift to the current game order" (default), "Import as is" or Cancel.
  - Shifting moves the file's bindings and axis settings to the current numbers, the same way as Apply. Devices the file has but the game doesn't list are kept after the game's devices.
  - Multi-file imports don't ask.
- **The arrows** stay as the manual fallback. Their tooltip reads "Move mappings to the next slot (use when the game renumbered your devices): …'s bindings, hardware, template and axis settings go to … The game's device order doesn't change." The undo label reads "Move mappings js1 ⇄ js2", and the notice adds "The game's own device order is never changed here."
- **js9+ / gp2+ note:** uses the agreed text ("The game lists this device as jsN; … then refresh game state here."). It has buttons for Refresh game state and Game slots & controllers.
- **Still to verify in game** (from the section above): whether a Product string in an `<options>` block that doesn't match makes the game drop or reassign bindings. Apply avoids the question by writing the game's own strings.

## Round 5 live feedback (Oct 6, 2026)
- **Input tester follows presses.**
  - A new press or move scrolls its device card into sight (or, for a card taller than the screen, the pressed button / axis row) and flashes the card and that button.
  - It reacts to rising edges only (`lib/testerFollow.ts`, unit-tested):
    - A button held down fires once.
    - An axis fires when it moves ≥ 0.5 from rest and re-arms only once back within 0.2, so noise and wobble around the threshold don't refire.
    - A hat fires on a new direction.
  - Scrolling is throttled: none while the card is already in sight (flash only), at least 0.7 s between automatic scrolls, and none for 2 s after the user scrolled by hand (wheel, touch, keys, scrollbar).
  - Only the full tester (modal tab) follows; compact testers don't.
- **Controllers modal header.**
  - The header is the title row and tabs, plus a lone close button at the top right, vertically centred on the title row.
  - Refresh game state and the mappings folder + copy moved into a strip at the top of the Game slots tab. The Input tester tab doesn't show them.
- **Drag hint.** "or drag the exported file anywhere onto the page" now sits next to every Refresh entry:
  - the Game slots strip;
  - the profile card (under the folder);
  - the profile ⋯ menu item;
  - the js9+ note.
- **Drop overlay in Firefox.** The handlers were made robust and are checked in a real Gecko (Playwright Firefox) with synthetic file drags:
  - Both dragenter and dragover are cancelled (MDN: both are needed to accept a drop), and dropEffect is set to copy.
  - `types` is read as a list.
  - Text-node event targets (Gecko) resolve to their parent element. Before this fix, a drop on the text inside "Import as profile" counted as a refresh.
  - Non-file drags are ignored.
  - The enter/leave counter is kept, plus a fallback: the overlay hides 1.2 s after the last dragover, so a drag that leaves the window without a final dragleave can't leave it stuck.
  - A native OS drag can't be automated headless. Real-desktop Firefox drag from Explorer is still worth a manual check.
- **Settings → Star Citizen folder.**
  - The game root defaults to `C:\Program Files\Roberts Space Industries\StarCitizen`, and the channel to LIVE (PTU / EPTU / TECH-PREVIEW also offered).
  - The mappings folder `<root>\<channel>\user\client\0\controls\mappings\` is derived from them and shown with copy wherever the path appeared:
    - the Game slots strip;
    - the profile card;
    - the drop overlay;
    - Settings itself.
  - Both are stored in localStorage (`sc-mapper:game-folder`). All path hints update live.
  - Normalisation (unit-tested):
    - quotes and spaces trimmed;
    - `/` → `\` and repeated separators collapsed (a UNC `\\` prefix kept);
    - no trailing separator, and the drive letter upper-cased;
    - a pasted path that goes into a channel folder is cut back to the root, and that channel is selected;
    - an empty value falls back to the default.
- **Devices: sticky lines.**
  - `<main>` is what scrolls (checked in the e2e; the canvas wrapper doesn't).
  - The slot bar is `position: sticky` with a negative top (its height above the hardware / template line, plus main's top padding). The slot chips scroll away, and the hardware · template · icons · axis settings line (and the js9+ note) stays at the very top.
  - The Groups line sticks right under it. The legend moved onto it, right-aligned, and it is always shown (even for templates without groups).
  - Both have opaque backgrounds and z-40: above the callouts (z-20) and the view pulse (z-30), below modals (z-50).
  - The "bring the pressed photo into sight" scroll treats the area under the sticky lines as hidden.
- **Tooltips.**
  - A small `Tip` component shows a visible bubble on hover (250 ms) and immediately on keyboard focus.
  - It is portalled to `<body>`, so the rounded `overflow: hidden` icon groups and the sticky bar can't clip it. It hides on scroll, key press and click.
  - It is used on the template icons, PNG / Print, the axis settings button, the profile card icons and the folder copy button.
  - The icon buttons keep their aria-label and drop the native title, so two tooltips don't show at once.
- **Template view vs editor.** There were two causes:
  - The editor skipped the label layout pass: keep boxes inside the canvas, push overlapping ones apart. So a box near the top was cut off.
  - It drew the picture at another width, and label boxes are px-sized, so they land elsewhere relative to the picture.
  Fixes:
  - One layout pass with shared constants (`CALLOUT_EDGE_PX` = 2, `CALLOUT_GAP_PX` = 3) runs in both modes.
  - The editor draws each picture at the width the Devices view last showed it, keyed by view id + aspect ratio, which a customized copy keeps.
  - Result: the e2e measures every URSA MINOR Combat label box in both modes and finds a max difference < 0.75 px. Screenshot `114-ursa-view-vs-editor.png`.
  - Trade-off: in the editor, a box dragged onto another is pushed aside, exactly as the view will show it.

## Round 6

### Template pages

- **Model.** A page is a template view (`views[]`: id, label, picture, canvas size); nothing new in the file format.
  - A classic single-picture template shows its one implicit page as a tab ("Page 1").
  - The first page operation turns it into an explicit `views` list (`ensurePages`). The picture, aspect ratio, callout spots and glow outlines are kept, and every callout is pinned to its page, so nothing moves. Pure functions in `src/lib/templatePages.ts` (unit-tested).
- **Tabs.** The page tabs are always shown, followed by a ⋯ page menu and a dashed **＋ Page** tab.
  - ＋ Page adds a blank 16:10 page called "Page n", shows it, and opens its name for typing (selected), so naming is one step.
  - Rename: double-click the tab, or ⋯ → Rename. Enter or blur saves, Escape cancels. A blank name becomes "Page n". Names are trimmed and capped at 40 characters.
  - Reorder: ⋯ → Move left / Move right.
  - Up to **12 pages** (`MAX_VIEWS`, was a 6-view import cap).
- **Delete removes the page's callouts**, rather than moving them.
  - Callout spots are fractions of that picture, so on another picture they would point at random places, and a pile of misplaced callouts is worse than none.
  - The confirm names the page and the callout count ("Delete the page “Grip top” and its 1 callout? (Undo brings it back.)"). Undo (Ctrl+Z) restores the page and its callouts.
  - The last page can't be deleted.
- **Pictures per page.** Upload or Replace applies to the shown page. The canvas gets label columns on both sides (`width = w + 0.68 h`, as before for photo templates), and *Blank page* clears it. The callout panel's selector is now called "Page".
- **Devices view.** Already renders multi-view templates as one photo section per view, with the view label as caption (`data-view-caption`). Custom pages use the same path:
  - a page with a picture renders in photo mode (object-contain, the CSS glow / shadow, vignette);
  - a blank page renders as the grid canvas.

  The e2e checks the captions "Page 1 | Grip top | Cut-out".
- **JSON.**
  - Export already wrote `views`. Import keeps up to 12, and a callout's `view` only when it names a kept page.
  - Old files import unchanged: classic files without `views`, and ≤ 6-view files (unit-tested).
  - A file with more than 6 pages imported into an older build keeps its first 6 pages and drops the view of callouts on the others (they fall back to the first page).

### Picture preparation (upload → before / after)

- **Every raster upload or replace opens "Prepare the picture"** (SVGs are stored as before). It shows the original and the result side by side on the Devices-view background, with:
  - *Remove background*;
  - *Format only (trim + margin)*;
  - a *built-in glow* checkbox (on by default);
  - **Use cut-out / Use formatted**;
  - **Keep original** (the previous behaviour);
  - Cancel / Escape.

  A progress bar shows the model download (MB loaded / total, with percent) and then indeterminate steps: "Starting the model…", "Finding the device…", "Cleaning the edges…".
- **Library: not `@imgly/background-removal`.**
  - Licence: AGPL-3.0 (checked in the 1.7.0 package's LICENSE.md). This app is closed source (`"private": true`, no licence) and served to the public, so AGPL would oblige us to publish the whole app's source under AGPL, or buy img.ly's commercial licence. That is Federico's call, not a dependency to slip in.
  - Size: its assets on staticimgly.com are 44 MB (isnet_quint8), 88 MB (fp16, the default) or 176 MB, plus the 11.8–23 MB onnxruntime wasm.
- **Chosen: U²-Net-p + onnxruntime-web.**
  - U²-Net-p (`u2netp.onnx`, Apache-2.0, 4.57 MB, the ONNX export distributed by rembg; NOTICE in `public/models/`).
  - onnxruntime-web 1.30 (MIT), WASM backend, single thread (no COOP/COEP headers needed).
  - This is the same model family as `rembg`, and our built-in photos were cut with rembg's IS-Net, offline.
  - Pre-processing: the input is fed exactly as rembg does (320², max-scaled, ImageNet-normalised). Post-processing is ported from `scripts/device-photos/cutout.py`:
    - normalise and upsample the mask;
    - keep the largest parts (≥ 3 % of the biggest, dilated 6 px), which drops logos and specks;
    - crisp edge `(a − 0.1)/0.8`;
    - un-mix the studio colour from edge pixels;
    - pull the outermost edge toward the eroded interior (no white fringe).
- **Hosting: self-hosted, same origin, works on Vercel static hosting.** No CDN, no server, no AI call.
  - The model is in `public/models/u2netp.onnx`.
  - The 14.2 MB `ort-wasm-simd-threaded.wasm` is emitted by Vite from node_modules into `dist/assets/` (hashed, so it caches immutably).
  - Both are fetched by our code with streamed progress. The wasm is handed to onnxruntime as `wasmBinary`.
- **Download, first use only:** 18.8 MB uncompressed (wasm 14.24 MB + model 4.57 MB); about 7.9 MB with gzip (3.66 + 4.24) if the host compresses them. Afterwards the files come from the HTTP cache. The picture never leaves the browser.
- **Bundle impact.**
  - Main chunk: 1,129.8 → 1,135.6 kB minified, +5.8 kB (gzip 336.5 → 338.4 kB, +1.9 kB): page tabs and the lazy hooks.
  - The dialog is a lazy chunk (`PhotoPrep-*.js`, 16.5 kB / 6.6 kB gzip), loaded on the first upload.
  - onnxruntime's JS is another lazy chunk (`bgModel-*.js`, 71.9 kB / 23.7 kB gzip), loaded only on *Remove background*, together with the wasm and the model.
  - Speed: in headless Chrome on the box, about 6 s for download plus inference on a 2182×2362 vendor photo.
- **Fallback.** If the model can't load (offline, blocked), the same button uses a **corner-colour flood fill**: the background is everything connected to the border within 30 of the border's median colour, with a 1 px soft edge. The dialog says so. It works for plain studio backgrounds; the model handles shadows and gradients.
- **Format = the built-in photos' recipe** (`cutout.py`, ported to `src/lib/photoFormat.ts`, pure and running in Node too):
  - Trim: transparent edges, or for an opaque picture its plain border colour (median of a 4 px band, tolerance 24).
  - Scale the product so its longest side is 900–1300 px (upscale at most 1.7×).
  - Margin: 5 % of the product's longest side on each side. Transparent for cut-outs; the background colour for opaque pictures, which get no glow.
  - Optionally bake the built-in look: soft blue haze behind, cyan outer glow (blurred silhouette × 1.4, 30 %), a faint cyan rim inside the edge, and blacks lifted (×0.93 + 12).
  - The CSS rim / glow / drop shadow of photo mode then applies on top, exactly as for the built-ins.
  - The result is stored as WebP 0.85 (alpha kept). The output is at most 1430 px, within the 1600 px / 2.5 MB limits.
- **Tests.**
  - `npm run test:unit` now also runs `scripts/bg-removal.ts`: the real model file and onnxruntime-web, in Node, on a fixture product photo (made from our own T.16000M photo on a studio gradient, `scripts/fixtures/photos/make.py`) with its true mask. Results: model IoU 0.994; flood-fill IoU 0.995 on this plain background. Corners are transparent, and the format size and glow are checked.
  - Unit tests cover the pages functions, JSON round trips (12 pages, old files), trim / scale / margin, the opaque trim, the flood fill and the mask helpers.
  - The e2e covers adding and renaming a page (and Escape cancelling a rename), Format only on `cutout-offcentre.png` (160×360 → 334×674, glow on/off), the picture landing on the page, callouts on the new page, move left / right, delete with confirm and undo, Remove background on a real vendor photo (Warthog throttle from the user uploads when present, else the fixture), the Devices view captions, and the export JSON.
  - Screenshots: `115-editor-new-page.png`, `115-cutout-before-after.png`, `115-devices-custom-page.png`.

### Sticky page headings (follow-up)

- **What sticks.** In the Devices view, the heading of each page of a multi-page template (built-in or custom) sticks right under the Groups line while its page scrolls by.
  - It is bound to its own page's box, so at the end of the page it slides away under the sticky lines and the next page's heading takes over.
  - Single-page templates and the editor keep the caption on the picture.
- **Look.** At rest the heading sits where the caption was, over the top of the picture, and stays transparent so it doesn't cover the photo.
  - Once stuck (detected by comparing its position with its page's top, on scroll), it becomes an opaque strip with a bottom border and shadow, like the Groups line.
  - Stacking: z 35, above the callouts (z 20) and the view pulse (z 30), below the sticky lines (z 40).
  - Nothing else reflects the active page.
- **Offset.** `--sticky-page-top` is set on the slot view to the Groups line's sticky top plus its height. ResizeObserver (border box) watches the slot bar and the Groups line, so wrapping or any height change moves the sticking point.
- **Why the picture column now clips sideways.** CSS sticky only works when no ancestor between it and `<main>` scrolls, and the picture column was `overflow: auto`.
  - With several pages shown it is now `overflow-x: clip`, which stops sideways scrolling but doesn't create a scroll container.
  - When the column is narrower than the canvas' minimum width (420 px), it scrolls sideways again and the headings go back onto the pictures.
- **e2e (URSA MINOR Combat, 3 pages):**
  - at rest: on the pictures, transparent;
  - mid-way into page 1: stuck 0.5 px under the Groups line, opaque, painted above the callouts;
  - mid-way into page 2: page 2's heading replaced it;
  - a taller Groups line moves it;
  - in a narrow window it falls back to the captions.
- **Screenshot:** `116-devices-sticky-page-heading.png`.

## Round 7

### Prepare-picture modal: zoom and pan

- **One camera for both panes.** The view (zoom + centre) is kept in the original picture's pixel coordinates. The result pane maps its picture through the same transform the format applied (trim box, scale k, margin, encode scale). So both panes always show the same spot of the product, and a cut-out edge can be compared with the original pixel by pixel.
- **Controls:**
  - − / + zoom in 25 % steps around the pane centre;
  - the readout shows the current %;
  - Fit (also a double-click) shows both pictures whole (fit = the union of the original and the result, so the margin is visible);
  - 100% = one pixel of the stored picture per screen pixel (before there is a result, one pixel of the uploaded file).
- **Mouse.** The wheel zooms around the cursor; the picture point under it stays put. The listener is non-passive, so the page doesn't scroll. Dragging either pane pans both (pointer capture, so leaving the pane mid-drag is fine).
- **Limits and rendering.** Zoom goes from half the fit up to 16 screen px per stored px. From 2 screen px per pixel the pictures render `pixelated`, so edges show real pixels instead of a smoothed guess.
- **Margin preview.** The result pane outlines the stored canvas (thin cyan) and the product box in it (dashed amber). The caption reads `W×H (ratio:1), product w×h, ≥ pad px margin`.

### Canvas aspect

- **Presets:** Auto · Stick · Throttle · Square · Custom W:H, as a radio group under the picture.
  - **Auto** is the round-6 behaviour: the product plus a 5 % margin.
  - **Stick = 990 : 1064 (0.93).** Measured from the built-in grip photos (`src/lib/devicePhotoSizes.ts`): the MCG / MTQ grips are 990×1064 (0.930), Gladiator SCG 914×990 (0.923) and Gunfighter 0.927.
  - **Throttle = 990 : 846 (1.17).** The built-in throttle photos range 1.08–1.29, and their median is 1.17: X-56 990×846 (1.170), MTP 990×842 (1.176), VMAX 1062×929 (1.143) and URSA back 1430×1243 (1.150), with TWCS 1.29 and Warthog / Orion ~1.08 at the ends.
  - **Custom** takes width : height, clamped to 1:5 … 5:1. An incomplete value behaves as Auto.
- **How it is applied.** The product keeps the built-in scale (900–1300 px longest side) and at least the 5 % margin. Only the shorter canvas side grows to reach the ratio, so the product is never shrunk to fit the shape. It is centred in the canvas.
- **Persistence.** The last choice (including custom W:H) is stored in `localStorage` under `sc-mapper:photo-aspect` and preselected for the next upload. Changing it re-formats the current result straight away.

### Template editor: input picker

- **When.** Each input row of the selected callout gets a ▾ button that opens a list of the device's inputs. It appears whenever we know the device's inputs:
  - **Linked and connected** (the template's link rules match the selected device, which is plugged in): buttons 1..N from the Gamepad API's button count; POV hats from the axes resting outside ±1 (Chrome exposes a hat as an axis at 9/7), listed as `hatN_up/right/down/left`; and axes by their game names (`x, y, z, rotx, roty, rotz, slider1, slider2`, index-based like capture), with the hat axis left out.
  - **Gamepad templates:** the game's gamepad buttons and axes.
  - **Not connected / not matching:** buttons 1..N from the link rule's button count (labelled "from the link rule").
  - **Neither:** no picker, free typing only.
- **Used by.** Every entry shows "free", "this callout", or "used: <callout names>". The POV-hat "Reports as" options and the axis selects carry the same note. Hats or axes that the connected device doesn't seem to have are marked "(not seen on the device)" / "(not on the device)" but stay selectable: a hat that is being held at the moment the editor opens reads as a pressed position, not as rest.
- **Several at once.** "Pick several from the device…" works for multi-input callouts:
  - a 4-way hat reported as buttons: up, right, down, left, then an optional push;
  - a switch / rocker: positions;
  - a row of buttons;
  - an encoder: clockwise, counter-clockwise, optional push.
  The entries are ticked in order (the role is shown next to each tick) and Apply sets the inputs. The pick starts empty, Cancel keeps the current inputs, and the current ones are listed for reference. A POV hat stays a single "Reports as" choice.
- **Fallbacks kept.** Typing (a bare number means that button) and Press-to-pick work as before, next to the ▾.
- **Imported profile device options are not used.** The game's `<options>` for a device carry the product name, GUID and per-axis tuning, but no button / hat / axis counts. They can't list the inputs, so the source is the connected device or the link rule.
- **Tests:**
  - Unit: the aspect presets (ratios, custom clamp, product size kept and centred), the zoom maths (union fit, zoom keeps the point under the cursor, pan, place) and the picker sources (device / rule / none, hat-axis detection, used-by, multi-pick kinds).
  - e2e: the ± / 100% / Fit buttons; the wheel keeping the cursor point, with the panes in sync; drag panning both panes; Stick / Throttle / Square / Custom results (ratio, centred); the choice remembered on the next upload; the picker on the connected Gladiator (32 buttons + hat 1 directions, used-by); picking and typing; the 8 axes; multi-pick for a 4-button hat and a switch; the link-rule fallback (24 buttons); and free text only without a count.
  - Screenshots: `117-prepare-zoomed.png`, `117-prepare-aspect.png`, `117-input-picker.png`.

### Picture size in the editor and the Devices view (round 7 follow-up)

- **Problem.** A newly uploaded portrait picture on a single-page template filled the full column width, e.g. 1300 × 2600 px, in both the editor and the Devices view. Labels sat on top of the product.
- **Prepared pictures go on a page.** "Use formatted" / "Use cut-out" now always stores the picture as a page (`setPageImage`), also on a single-page template. It gets the label columns (`w + 0.68 h`) and is drawn like the built-in photos: at most `VIEW_MAX_H` = 720 px tall (the same constant the built-in photo views use), centred, filling the width only up to that. A portrait product 334×674 now shows at 846×720 instead of filling the column.
- **Classic single-picture canvases** (Keep original, old templates) keep the picture's shape. An uploaded raster picture is no longer drawn taller than 720 px (`cappedWidth` = aspect × 720, centred). Built-in drawings (SVG), their customized copies and blank canvases keep filling the width as before.
- **Same in both places.** Both views use the one constant in `DeviceCanvas`, and the editor still reuses the width the Devices view showed. So the editor and the Devices view draw a picture at the same size with the label boxes in the same place. The e2e checks this for a custom portrait page (Δ 0 px) and for the URSA built-in (unchanged).
- The viewport-height alternative ("fit below the sticky lines") was not used. It would differ between the editor (no sticky lines) and the Devices view, which breaks the shared coordinates.

### Page tabs: delete with ×

- Each page tab now has a small × ("Delete page"). It shows on the active tab, and on hover or keyboard focus for the others. There is none when the template has only one page.
- It opens the same confirm as ⋯ → "Delete page…", which stays. Undo brings the page back. Deleting a page other than the shown one keeps the shown page.
- Works the same on a "Customize a copy" of a built-in photo template. The e2e deletes a page of the URSA copy this way.
- Screenshots: `117-input-picker.png` (retaken, with the capped picture) and `117-page-tab-delete.png`.

## Round 8

### Prepare the picture: the canvas is a fixed frame

- **Model.** The chosen canvas (Auto / Stick / Throttle / Square / Custom) is drawn as a fixed frame in the right pane. Zoom and pan move and scale the *product* inside it, like a profile-photo cropper. One transform maps the picture to the output (`output px = picture px × k + (x, y)`). The stored picture is exactly what is inside the frame, at the canvas's output resolution (e.g. Stick 627 × 674 for the fixture). Code: `planFrame` / `framePhoto` / `zoomFraming` / `clampFraming` / `productRect` in `photoFormat.ts`.
- **Initial framing = Fit.** The round 6/7 automatic result is the starting point: product trimmed, built-in scale (≤ 900 px), centred with the 5 % margin. "Fit" and double-click return to it. Changing the canvas shape starts again from Fit. `formatPhoto` is now planFrame + Fit framing and gives byte-identical output (unit test).
- **Controls (right pane).** Wheel resizes the product around the cursor. Drag moves it. −/+ step by 25 %. The % readout is the product size relative to Fit, from 25 % to 400 %. Panning is clamped so that some of the product always stays in the frame.
- **Cropping.** Parts of the product outside the frame are cut off. While editing they stay visible but dimmed (a 72 % dark mask outside the frame). A dashed box shows the whole product. The caption says "cut off at the frame edge" instead of the margin.
- **Rendering.** The live layer (the whole picture at the transform) follows every drag instantly. The real output (glow included) is rendered after 140 ms of rest and overlaid on the frame. "Use …" is disabled until the output matches the current framing, so what you see is what is stored.
- **Glow after framing.** The built-in glow is baked onto the framed output. Its size follows the product's on-canvas size, so a zoomed product gets a proportionally bigger glow. Opaque pictures fill the canvas with their background colour.
- **Inspection (my call).** The left pane is a separate **Inspect** view with its own zoom: −/+, Fit, 100 % (1:1 with the uploaded file), wheel at the cursor, drag to pan. After background removal it gets an Original / Cut-out toggle (the cut-out on a checkerboard). It never changes the output, so you can check edge quality at 600 % without disturbing the framing. The two panes are no longer synced: one is a magnifier and the other is the crop tool.
- The caption reserves two lines, so the frame doesn't jump when the caption grows ("cut off …").
- Screenshot: `118-prepare-framing-stick.png` (Stick, product at 195 %, moved, knob/shaft cut off at the bottom, the outside dimmed). `117-prepare-zoomed.png` now shows the Inspect pane zoomed.

### Every path from Settings (one helper)

- `gamePaths(folder)` in `lib/gameFolder.ts` is the single source: `root`, `channel`, `channelDir` (`<root>\<channel>`), `mappings` (`…\user\client\0\Controls\Mappings\`), `actionmaps` (`…\user\client\0\Profiles\default\actionmaps.xml`), `p4k` (`<root>\<channel>\Data.p4k`). The hook is `useGamePaths()`, and it updates live when Settings change. The casing is now the game's own (`Controls\Mappings`, was `controls\mappings`).
- **Locations, all derived from Settings:**
  - **Settings:** mappings folder, live actionmaps.xml, and Data.p4k (defaults source in the footer). Copy on each.
  - **Profile card:** mappings folder next to Refresh game state (GamePathHint). Copy.
  - **🕹 Controllers → Game slots strip:** mappings folder (GamePathHint). Copy.
  - **Devices view, js9+ axis-locked note:** "Fresh export from <mappings folder>" (new; there was no path before). Copy.
  - **Export modal:** the layout guide's mappings folder and the actionmaps guide's `actionmaps.xml` path, with a note saying they come from Settings → Star Citizen folder and naming the channel. Copy on each.
  - **Help:** actionmaps.xml path, mappings folder (+ channel note), Data.p4k for the defaultProfile.xml / global.ini hint. Copy on each.
  - **Sidebar footer:** "Defaults: … (inside <Data.p4k>)". Copy.
  - **Drop overlay:** mappings folder. Derived, but no copy button, because the overlay exists only during a drag.
  - **README:** static text. It now writes `<game folder>\<channel>\…`, names the default folder and says the app builds every path from Settings.
- File-name-only mentions (empty state, conflicts, "Import your actionmaps.xml") have no folder and stay as they are.

### Copy buttons (paths and console commands)

- `CopyButton` / `CopyText` (`components/CopyButton.tsx`) are shared everywhere. The button uses the Clipboard API with an `execCommand` fallback. Its tooltip names what it copies ("Copy the folder path" / "Copy the path" / "Copy the command"). After a click it shows a check icon plus a "Copied" chip for 1.5 s (`role=status`); if the browser refuses, the tooltip says "Copy blocked…".
- **Console commands with copy:**
  - **Export modal:** `pp_RebindKeys layout_<name>_exported.xml`, the bare-name fallback `pp_RebindKeys <name>`, `pp_resortdevices joystick 1 2`.
  - **Help:** `pp_RebindKeys layout_<name>_exported.xml`.
  - **🕹 Controllers compact note:** `pp_resortdevices joystick 1 2`.
- Screenshot: `118-console-command-copy.png` (export guide right after copying the pp_RebindKeys line).

### Export modal overflow

- Paths and commands are code boxes with `overflow-wrap:anywhere`, plus a `<wbr>` after every backslash, so they break at folder boundaries first. The file names in the format cards and the "→ file" line wrap the same way. The header keeps the close button at the top right, with the title and stats wrapping beside it.
- Below `md`, the whole body scrolls as one column: options, guide, then a 288 px preview. Wide, the two columns scroll on their own as before.
- e2e checks that no text box overflows the modal at 1680 px and at 420 px. Screenshots: `118-export-paths.png`, `118-export-paths-narrow.png`, `118-export-paths-narrow-guide.png`, `118-settings-paths.png`.
