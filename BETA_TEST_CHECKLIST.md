# ItemRack Beta Regression Checklist

Use the packaged build from `.versions/Release/v{Version}`. Reload the UI after installation and test with Lua errors enabled. Capture `/itemrack dump` output whenever a failure occurs.

## Supported-client smoke matrix

Use the same universal archive for every row; do not build or test separate Forever and TBC packages.

- **Classic Era/Hardcore/Season of Discovery:** load both addon modules, open Options, equip a partial set, test a stance event, and inspect `/itemrack dump` version fields.
- **Burning Crusade Classic Anniversary:** test dual-spec transitions, duplicate enchanted/gemmed items, fast multi-slot swaps, and AutoQueue.
- **Forever/Camelot:** open Equipment Manager and ItemRack menus, test movement/mount events, specialization labels, item discovery, and the set-icon picker.
- On every client, confirm the TOC version, `ItemRack.Version`, and `ItemRack.BuildID` identify the same candidate.
- On Forever 1.60.1, log in twice with a saved set key and verify no SaveBindings usage error, working set hotkeys, and persisted keys after relog (PR #28).
- Test Auto/Up/Down/Left/Right minimap flyouts with the stock button and any minimap collector. Verify direction, item clicks, and dropdown layout. EllesmereUI 9.3 collector layering requires its upstream PR #2305 fix according to the contributor; ItemRack's dock tests do not verify that external fix (PR #26).

## 1. Tooltip safety and layout

### Next dev build: queue item icons and duplicate rows

- Reload after installing the color API fix, then open the Feet queue from quick access with Hunting Boots (reported icon 132592, quality 1). Confirm both rows appear without the former SortListScrollFrameUpdate nil-call error. Capture the exact client build and boot link if it recurs. Older loaded code reports this call at line 2023; the dev build's line numbers differ.
- On Era, record the full saved and live item links/IDs for both Mind Control Cap and Catseye Goggles rows from the reported 4.51 global Head queue. Open the same profile in the dev build. Equivalent empty/zero identities should coalesce, preserving the first entry's position/settings. Different enchants/runes must remain distinct. This reporter-specific check is pending those identities.
- Open and close the bank, move an exact queued item between bags and bank, and remove it from carried storage. Confirm the Queue page distinguishes **in bank** while open and **not carried** otherwise; missing saved rows remain editable. Check long-name status tooltips, newly cached item names and correct refresh timing. A closed bank does not establish that an item was deleted.
- Select an item row, press the left-side **Icon** button and choose an icon; verify the Queue row and worn quick-access button use it. Check picker scrolling, partial final pages and layout at every Options scale. Select the stop marker and confirm Icon is disabled.
- Reopen the picker and press **Reset to original**. Confirm native artwork returns while priority, pause, delay, swap-in and queue order persist. Close the picker or Queue page, change selections, edit another set, save the set, and toggle per-set queues; a stale picker must never write to the new entry/scope.
- Give the same item different icons in two sets, switch between them, test global mode and a partial event set's inherited queue, and disable auto queues. Confirm styling follows queue ownership without changing swap policy. Save the sets and reload/relog to verify icon persistence.
- Leave both custom display settings off: character-sheet slots, item flyouts and set-editing inventory menus keep original artwork. Enable **Custom icons on character sheet** and **Custom icons in item flyouts** individually; verify each target and immediate return to native icons when disabled. Inspect exact enchant/rune copies, empty slots, native tooltip links, cooldown/count overlays and Masque skins.
- Repeat icon edits and character-sheet updates during combat, then use weapon-only hotkeys, full sets, priority queues and manual swaps. Watch for Lua errors or blocked actions. On Forever, open Blizzard's Advanced options afterward and check for shared-icon-provider taint. These live-client checks have not been run by the agent.

- Enable **Show set info in tooltips** and place one item in multiple saved sets.
- Hover that item in equipped slots, bags, the bank, and an ItemRack flyout.
- Confirm every expected set name appears, the tooltip backdrop contains the lines, and character-sheet flyouts do not overlap the tooltip.
- Immediately hover and use several Blizzard action-bar buttons. Record any `ADDON_ACTION_BLOCKED`, `SetShown`, `SetAttribute`, or `GameTooltip` error.

## Issue #29 weapon pipeline acceptance (Classic Era 1.15.9)

- Save A with main hand `18805:1900:::::::60::::::::::` and shield `19349:929:::::::60::::::::::`. Save B with main hand `19859:1900:::::::60::::::::::` and the first weapon in off hand. With events off and queues on, equip A then B out of combat; verify both actual weapons, set name, queues, shield returned to bags, and no error or stuck swap. Test with full bags while the new main-hand weapon already occupies a carried bag slot.
- Repeat the follow-up: put B's intended off-hand weapon in main hand, an unrelated one-handed weapon in off hand, and B's intended main-hand weapon in a bag. Equip B and verify exact final copies rather than the unrelated weapon moving to main hand.
- Test a partial set moving the current main-hand weapon to off hand over a shield, then Unequip/Toggle out of combat. Verify both original weapon slots and base-set context restore. With no available staging slot, verify clean refusal and unchanged gear. Repeat the mirrored off-hand-to-main-hand case over a main-hand-only weapon.
- Repeat rapidly with real item locks, paired weapon exchange, two-hand/shield transitions, and combat weapon hotkeys. Record client build, exact links, action sequence and `/itemrack dump` if any differs from the modeled outcome. These client checks have not been run by the agent.

## 2. Rune-specific copies (Season of Discovery)

- Prepare two copies of the same base item with different runes and save each in a different set or queue position.
- Put a migrated legacy base-ID entry before those rune-specific entries. Confirm automatic and manual cycling prefer the exact worn/candidate rune and never stall on or equip an arbitrary wildcard copy.
- Equip each set, swap paired ring/trinket slots, and test a main-hand/off-hand shuffle.
- Physically swap between the two rune variants and confirm the normal equip hold/penalty is recorded; re-engrave the currently equipped copy and confirm that operation alone does not manufacture a physical equip transition.
- Re-engrave one equipped slot while another rune-bearing slot changes. Confirm only the engraved slot adopts the new rune identity and the physical swap keeps its normal hold, regardless of which inventory event appears first in diagnostics.
- Confirm ItemRack chooses the saved rune, reports the correct set as equipped, colors tooltip rows correctly, and does not silently accept the other rune.
- Test a bound weapon-only set during combat. If the secure macro cannot distinguish the copy, confirm the mismatch remains queued and resolves after combat instead of disappearing. Check duplicate enchants/gems and paired main-hand/off-hand moves; capture exact item links and client build if any action fails.
- With **Swap set weapons during combat** off, a full-set hotkey must wait until combat ends. Turn it on: weapons must equip immediately and armor only after combat. Repeated combat presses must keep equip intent rather than schedule unequip. Disable it during combat and confirm protected button configuration changes only after combat ends. Rune-specific and empty weapon slots must remain deferred.
- On Forever, open the icon picker then scroll/hover Blizzard Options > Advanced and check for taint errors. Enable floating combat text and both cooldown notification options; verify notices work without Lua errors, with and without optional chat output.
- Repeat one saved set created before rune metadata existed; it should retain legacy base-item fallback.

## 3. Event ownership and same-spec re-enable

- Manually equip a set that is also assigned to an event, then disable that inactive event. The manually equipped set must remain equipped.
- Activate an event normally, disable it while active, and confirm its stack layer unwinds once.
- Disable and re-enable the specialization event for the current spec without changing specs. Its assigned set should evaluate immediately.
- Manually equip the current specialization's assigned set, enable its event, then switch specializations. The event must not claim or later unequip the manually owned set unless it actually created an event-stack layer.
- Disable and re-enable the global event system while remaining in the same spec. Confirm specialization, stance, zone, and buff state are reconciled without duplicate swaps.
- Add a one-shot Script event triggered by `PLAYER_ENTERING_WORLD`, cross a loading screen, and confirm it runs exactly once after the transition hold with its original arguments.
- On a Shaman, enable the default stance-1 Ghostwolf event and assign a visibly different set. Enter Ghost Wolf, including on a client where `GetNumShapeshiftForms()` returns 0; confirm gear swaps and the Ghostwolf frame appears in the dump. Leave the form and confirm the prior set and per-set queues restore.
- Assign the same travel set to Ghostwolf and movement-gated Mounted above an enabled specialization event. Enter Ghost Wolf, mount and move, then leave Ghost Wolf while Mounted still owns the set. Confirm no premature restoration; stopping movement must finally restore the specialization set and its queue context. Repeat with PvP exclusions enabled.
- On a Druid, test numeric Bear/Aquatic/Cat/Travel defaults and named Moonkin/Tree events for the forms the character knows, including a non-English client. Test a custom event using the localized form name. Confirm entering/leaving forms changes and restores only the expected owned slots.
- For two same-base ring/trinket copies with different enchants or gems, save the exact later-slot copy alongside an earlier variant that is no longer carried. Keep a compatible spare available. Confirm the early slot receives the spare while the later slot receives its exact saved copy, and repeat with that exact copy already equipped.

## 4. Script event approval and mutation

- Create a valid custom Script event in ItemRack. Confirm **Save** immediately approves and enables it without a second prompt.
- Enter a syntax error in a new Script event and click **Save**. Confirm ItemRack refuses the save and leaves the editor open for correction.
- With another test addon or `/run`, add a Script event directly to `ItemRackEvents`, open the event list, and toggle it on. Confirm a warning identifies the event and trigger and the script cannot run before acceptance.
- Reject that warning. Confirm a new external event is removed; for an altered approved event, confirm the last approved source is restored disabled.
- Repeat and choose **Approve & Enable**. Confirm that exact source runs and remains approved after `/reload`.
- Alter one character after approval and fire the trigger. Confirm ItemRack reports and disables the event without executing the altered source, and logout/reload cannot persist the altered source.
- Confirm unchanged packaged Script events remain usable, while changing both the live event and public default table does not manufacture bundled trust.

## 5. Lock, summon, and transition recovery

- Trigger a one-item and a multi-item set swap while rapidly mounting/dismounting, accepting a summon, or crossing an instance portal.
- Confirm automatic swaps pause through the transition and resume after settlement without an internal bag error or permanent `SetsWaiting` state.
- While an item remains locked, issue multiple automatic requests and finish with one manual set click. Confirm older automatic work is discarded, the latest manual request receives one bounded retry, and persistent failure produces a clear chat message.
- Queue a request, then begin a channel lasting longer than ten seconds after the inventory unlocks. Confirm the watchdog waits for casting to end instead of reporting `None locked` or canceling the request.
- After a forced timeout, confirm the minimap/set display reconciles to the gear actually worn.

## 6. Right-click precedence

- With **Menu on Right-Click** on, confirm right-click opens the flyout.
- With it off and **Use on Right-Click** on, confirm right-click uses the equipped item.
- With both off, confirm right-click advances to the next valid queue item.
- Confirm slot 20 opens the set list only when **Menu on Right-Click** is enabled; Alt+Right-click must always open the Sets options tab.

## 7. Keybindings

- Bind, overwrite, and unbind both a set and a slot. Test a set name containing `%`.
- Confirm rejected overwrites restore both prior bindings, screenshots and extended mouse buttons remain protected, and deleting a set removes its binding.
- Test a bound weapon set both in and out of combat.

## Report data

- For quick-access icon coverage, test default buttons at 0.5x, 1x, 1.5x and 2x: item and set artwork should fill the button inside its decorative bezel, with no growing inset. Check active cooldown coverage, pressed/hover/checked states, quality borders, queue indicators, counts and hotkeys. Repeat with Masque disabled and with the user's active skin, including reskinning and reload. Automated checks verify default geometry, not live texture rendering.

- For the three-rogue boot queue complaint, compare one affected and one working character on the same build: record exact saved/worn boots, queue entries and their keep/delay/priority flags, per-set/global enablement, toggle setting, and whether menu equip differs from the bound key. Enable debug before reproducing and collect the dump afterward. Check actual gear separately from the minimap, broker and set-button icon; record the last icon that stays visible. Capture the icon/button size and active UI skins. This report is not reproduced by the automated suite.
- For Universal naming, confirm the addon list shows ItemRack Universal and ItemRack Universal Options, and the Options title and keybinding category display correctly at the chosen scale. Both folders must remain ItemRack and ItemRackOptions; verify load-on-demand Options and saved keybindings survive reload.

Include the client branch/build, addon version, reproduction sequence, expected and actual set names, relevant item links/runes, full Lua error text, and `/itemrack dump` output.

## Candidate package verification

- Confirm the in-game version is the requested stable candidate and matches both addon TOCs.
- Confirm the reported candidate commit and SHA-256 match the staged package manifest.
- Confirm the exact staged package was installed into every detected target client and that installation fails rather than succeeding silently when no target exists.
