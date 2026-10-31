# Automated Testing

Run the complete release gate from the repository root:

```powershell
npm test
```

Run only the deterministic many-set workloads:

```powershell
node tests/test_large_profiles_lua.js
```

Run the focused Queue editor validation group with:

```powershell
npm run test:queue-editor
```

This executes the existing picker, item-identity and queue-migration suites;
all three also run in `npm test`. Named icon cases cover global edit/reset,
editing and saving an inactive set, rejecting a picker opened before a queue
snapshot was replaced, partial final pages, and unchanged final equipment and
queue scopes. `queue-icon-legacy-migration` checks both scopes and independent
recovery backups; `queue-icon-savedvariables-load` loads a representative saved
Lua chunk in a fresh environment and checks migration idempotence. The saved
chunk models persisted values; it does not exercise WoW's SavedVariables writer
or replace the reload/relog acceptance checks in `BETA_TEST_CHECKLIST.md`.

The focused script-event trust test can be run independently with:

```powershell
node .tools/test_script_event_approval_lua.js
```

It executes the production event dispatcher and verifies interface approval,
exact prompted approval, first-use blocking, mutation rollback,
time-of-check/time-of-use rejection, logout persistence cleanup,
packaged-script matching, and malformed or oversized input removal.

The many-set suite executes the production Lua reducers and transaction engine
through Fengari. It does not replace the focused regression files under
`.tools`; it adds long-lived profile shapes and operation sequences that are
hard to reproduce manually on a character with only a few saved sets.

## User-report regression workflow

October 16 combat-breakout diagnostic follow-up: the original support dump had
the correct slot but only `Menu={0}`, without evidence identifying which
discovery check failed. The `breakout-diagnostics-*` cases in the existing
`.tools/test_forever_combat_menu_lua.js` execute production discovery and the
actual PlayerCanWear tooltip filter. They distinguish normal discovery,
unresolved links on occupied slots versus empty bag space, nil equipment data,
slot mismatches, red-tooltip rejection, hidden/soulbound policies, snapshot
replacement/restoration, unit-combat/lockdown transition differences, provider
exceptions and populated models interrupted during cooldown rendering.
They also check bounded history, retained combat evidence after OOC activity,
exact client and custom-icon fields, loaded addon names, and redaction without
stringifying secret values. Substituting HEAD's pre-instrumentation discovery
function fails `breakout-diagnostics-success`; current production passes.
This verifies the new evidence, not the still-unidentified live failure.
Acceptance: on a working and an affected Forever client, hover a configured
breakout before combat, enter combat, hover the same button, then run
`/itemrack dump` before reload/relog. Check the BREAKOUT DISCOVERY DIAGNOSTICS
section contains both states, distinguishes real items from Empty Slot, and
captures the rejection/unfinished stage. Repeat with debug OFF and after combat
exit; confirm recording does not change menus, item selection, swaps or errors.
`/itemrack debug clear` intentionally discards these records for a fresh capture.

October 16 settings-clarity request: old Flyout Menu direction label did not
identify the minimap source, and quick-access breakouts lacked a direction control.
`settings-direction-and-clarity` in `.tools/test_button_scales_lua.js` fails with
the old production minimap label/width code and passes compact source-specific
label sizing, independent saved selection, combat-locked selection and explicit
character/account tooltip scope. Font widths are modeled, not live pixels.
`quick-access-breakout-direction` in `.tools/test_batch_and_dualspec_lua.js`
executes production docking for four directions, Saved/nil/unknown legacy
fallback, trinket anchor selection, set-button exclusion and unchanged minimap
and saved docking. Existing geometry tests cover both wrap orientations.
Acceptance: scroll Options at 100/130/160 percent and check label/arrow/list fit,
hover row/control tooltips, select every direction on quick-access item buttons,
reload to check persistence, return to Saved to resume prior dragged directions,
and confirm minimap, broker, set-button and character-sheet menus stay independent.
Check scaled screen edges and entering combat with a picker already open.

October 16, 2026 Forever build 1.60.1.70338 / ItemRack 4.54 report:
Status correction after the owner retested 4.56/4.56.1: this report remains
unresolved for some Forever clients. The regression below models empty bag
enumeration; that cause was not measured on the original client. It stubs the
wearability filter and renderer, and therefore does not verify the original
failure. See the Retail ItemRack comparison and evidence requirements in
`TECHNICAL_CHANGES.md` before claiming another fix.

every quick-access equipment breakout lost its usable rows during combat. The
supplied runtime dump captured slot 13 with the menu visible and correctly
parented, but `ItemRack.Menu` contained only entry `0` (Empty Slot); debug logs
showed live combat rebuilds for slots 6, 8, 13 and 14 without a selection ever
reaching `CombatQueue`. Named `forever-combat-quick-access-menu-context` in
`.tools/test_forever_combat_menu_lua.js` executes production menu construction
and click routing. It caches successful out-of-combat exact IDs, makes live bag
enumeration empty during lockdown, and requires both ordinary armor and paired
trinket rows to survive. A preserved trinket click must retain its exact ID and
reach the existing deferred queue path. In-game acceptance: open several armor,
weapon and trinket quick-access breakouts out of combat; enter combat and verify
all rows remain, left/right trinket routing queues slots 13/14, pending overlays
appear, and combat exit equips once without stale rows, Lua errors or taint.

October 13 local report: 25x SetButtonScale line 886 anchor-family error while
Equip20 scale=oldscale=4; saved Left=223.500122 and Top=61.5. The permanent
`reported-set-scale-anchor-family` assertions in `.tools/test_button_scales_lua.js`
fail before correction because old anchors are retained during absolute SetPoint.
The stricter frame mock checks anchor replacement, repeated reported coordinates,
4x position preservation, unchanged equipment scales, retained docking metadata
and combat deferral. Native anchor-family behavior is not emulated. Exact client
build and live anchor graph were not supplied. Acceptance: move the slider
repeatedly through 0.5-4x with Equip20 undocked, docked and owning docked children;
verify position/docking, reload persistence and no SetPoint or protected errors.

The character-specific `Set button scale` feature is covered by
`.tools/test_button_scales_lua.js`. The production-Lua test keeps slots 0-19 on
the shared Button scale while Equip 20 follows its independent value, preserves
the set button's physical screen position, and defers both protected scale paths
during combat. Live acceptance: dock and undock Equip 20, test 0.50, 1.00 and
2.00 at several UI scales, reload, enter combat while moving the slider, and
confirm equipment buttons, flyouts, click targets, text and cooldown artwork do
not change size or position unexpectedly.

Every reproducible user-reported bug must leave a permanent regression in the
standard suite before its fix is considered complete:

1. Record the report URL or reporter, affected addon/client version, exact item
   identities, relevant settings and profile shape, action sequence, and expected
   result. Use a sanitized diagnostic fixture when needed; do not commit private
   player data or the entire diagnostic dump unnecessarily.
2. Reproduce the smallest failure against production Lua with modeled WoW API
   responses. Give the case a descriptive name and reference the report in a
   comment. Prefer extending the owning focused suite rather than creating one
   suite per issue.
3. Demonstrate that the new case fails against the pre-fix implementation and
   passes with the correction. Assert the final equipment, logical set/queue
   context, persistence, and cleanup relevant to the report, not just submitted
   API calls. Add neighboring compatibility cases when the correction changes
   shared behavior.
4. Add any new test file to `package.json` so `npm test` runs it automatically.
   Ensure it is tracked by Git even when `.tools` is otherwise ignored. A manual
   one-off test is not permanent regression coverage.
5. Run the focused suite and the complete `npm test` gate. Keep the case after
   the issue closes and include the report-to-test mapping in the fix summary.
6. For behavior outside the modeled API boundary, retain an explicit in-game
   reproduction/acceptance checklist. Request missing evidence when a report
   cannot be reproduced; do not invent a passing fixture or call the original
   client behavior verified solely because the automated suite is green.

### Report coverage in the standard gate

October 30, 2026 user reports (GitHub #33 follow-up by neferens; Retail comparison parity):
1) Breakout tooltip comparisons on hover without Shift: Root cause: ShowBreakoutComparison unconditionally called GameTooltip_ShowCompareItem whenever AlwaysCompareBreakoutItems was "ON", which defaulted to "ON", cluttering the screen and causing dual-tooltip overlaps without holding Shift. Fixed by introducing ShouldCompareBreakoutItems, evaluating IsShiftKeyDown(), alwaysCompareItems CVar, and AlwaysCompareBreakoutItems, defaulting the option to "OFF", and hiding ShoppingTooltip1/2/3 when Shift is released or comparison is suppressed. Extended forever-breakout-comparison-default in .tools/test_identity_matching_lua.js. In-game acceptance: hover breakout rows with Shift held and released; verify comparisons appear and disappear cleanly; toggle /console alwaysCompareItems 1/0 and verify matching behavior.
2) Trinket eviction on set switch: When swapping to a set with an AutoQueue slot, wearing an active trinket not in the queue (e.g. Ultrasafe Transporter: Gadgetzan) blocked the queue swap because canSwap saw isEquippedActive = true and ready = true. Fixed by gating active-item protection to items that are actually present in the queue (isEquippedInQueue), allowing unqueued active items to yield immediately to the set's queue candidate while keeping hold protection for queued active items. Extended .tools/test_queue_runtime_lua.js. In-game acceptance: equip Gadgetzan Transporter, switch to a set whose queue has Mark of the Champion; verify Gadgetzan is evicted and Mark of the Champion is equipped.

October 26, 2026 user reports (GitHub #34 follow-up by Spiritshroud08 / Zackk, YouTube https://youtu.be/7praxNQzg8w; GitHub #33 follow-up by neferens):
1) Tooltip disappearing, flickering, and third-party addon collisions (TipTac Reborn, Syndicator, RatingBuster Classic, TacoTip, TSM, Leatrix Plus): Root causes: a) ItemRack.ApplyTooltipAnchor set GameTooltip:SetAnchorType("ANCHOR_NONE"), which caused Blizzard's GameTooltip_ShowCompareItem screen-edge horizontal slide (self:SetAnchorType(self:GetAnchorType(), offsetX, 0)) to clear all SetPoint anchors and make GameTooltip + ShoppingTooltip1/2 vanish whenever comparison tooltips reached the screen edge (especially 3-wide Ring/Weapon comparisons or wider TipTac/RatingBuster tooltips); b) PaperDollItemSlotButton_OnEnter forced right-side character slots to ANCHOR_LEFT over the Character Panel, while RegisterCharacterSlotOnEnterHandlers updated OnEnter but left button.UpdateTooltip pointing to Blizzard's captured oldPaperDollItemSlotButton_OnEnter, causing a 0.2s GameTooltip_OnUpdate hop between left and right (or locking over the Character Panel when Syndicator invoked GameTooltip:Show()); c) ShowBreakoutComparison did not exclude Options menuInclude pickers, Set menus, empty slots, already-equipped items, or TinyTooltips. Fixed by removing ANCHOR_NONE, anchoring breakout buttons natively to ItemRackMenuFrame (ANCHOR_RIGHT / ANCHOR_LEFT), chaining right-side character slot tooltips to the right of ItemRackMenuFrame, updating button.UpdateTooltip in RegisterCharacterSlotOnEnterHandlers, and guarding ShowBreakoutComparison and ShrinkTooltip. Extended reported-character-tooltip-anchor-hop and forever-breakout-comparison-default in .tools/test_identity_matching_lua.js. In-game acceptance: test character sheet slots and multi-column breakout menus (gloves, legs, rings, weapons) with and without TipTac Reborn, RatingBuster Classic, Syndicator, TacoTip, TSM, and Leatrix Plus.
2) Per-set queue order switching (neferens): Because ItemRackOpt.PopulateSortList adds all carried wearable items for a slot into every queue with priority = false, two sets with reversed passive trinket orders both have matchedCurrent = true (with the old set's trinket at index 2 of the new set's queue). Updated AutoQueueItemToEquip so passive equipped items (not isEquippedActive) yield to higher-ranked queue candidates (i < currentMatchIndex) even when matchedCurrent is true, while stopping at i == currentMatchIndex; updated EquipSet and EndSetSwap to clear queue state for set.Queues slots and run PeriodicQueueCheck() immediately. Extended .tools/test_queue_runtime_lua.js with the 2-entry reordered passive queue regression.

October 23, 2026 user report (GitHub #34 follow-up): Breakout popout tooltips on the character sheet dropped immediately when pressing Shift or Ctrl while mousing over ItemRackMenu%d buttons. Root causes: popout buttons lacked .UpdateTooltip, GameTooltip:SetOwner assigned ItemRackMenuFrame instead of the hovered button, and TooltipUpdate wiped TooltipType to nil on zero-cooldown items. Named forever-breakout-comparison-default in .tools/test_identity_matching_lua.js verifies: 1) button.UpdateTooltip exists and runs ItemRack.MenuTooltip(button) synchronously; 2) MODIFIER_STATE_CHANGED invokes UpdateTooltip on the active hovered breakout button; 3) TooltipType remains active for zero-cooldown items; 4) DRESSUP modifier updates inspect cursor and ClearTooltip resets cursor; 5) comparison tooltips cascade away from the breakout menu without mouse capture. In-game acceptance: open character sheet, hover weapon and armor breakouts, press and release Shift and Ctrl; verify tooltips remain visible, comparison tooltips cascade without occluding buttons, and cursor updates on Ctrl.

October 21, 2026 user report (GitHub #33): [BUG] Trinket Queue behavior for two passive trinkets seems to have changed. Root cause: In ItemRackQueue.lua, canSwap in AutoQueueItemToEquip was restricted to not ready or list[i].priority. Because passive trinkets have no cooldown, ShouldHoldEquippedItem returned ready = true (since remaining cooldown is 0 <= 30s). When switching between sets with blank trinket slots and distinct passive queues (e.g. Set 1 Hand of Justice vs Set 2 Mark of the Champion), an equipped passive trinket not in the active set's queue (not matchedCurrent) was permanently held against the queue's preferred passive trinket because ready was true and candidate lacked priority. Fixed by recognizing passive equipped items (not isEquippedActive) and permitting queue candidate swaps when the equipped item is unqueued (not matchedCurrent) and not a manual hold (not manualHold). Named regression in .tools/test_queue_runtime_lua.js verifies: 1) unqueued passive Hand of Justice yields to Set 2's top passive queue item Mark of the Champion; 2) unqueued active ready items (e.g. Earthstrike) continue to hold against non-priority queue items; 3) explicit priority = true on queue items can swap out active ready items. Acceptance: create two sets with blank trinket slots, configure distinct passive trinket queues on slot 14, switch between the sets and verify the passive trinkets swap immediately.

October 21, 2026 user report (GitHub #32): [BUG] Error when Edit Mode is engaged (AuraUtil.lua:25: attempt to call a nil value from ItemRackQueue.lua:655 in ProcessAutoQueue). Root cause: on modern/Retail WoW clients, calling AuraUtil.FindAuraByName during Edit Mode transitions causes an unhandled nil call error inside Blizzard's UnpackAuraData. Because PeriodicQueueCheck runs on OnUpdate, the error was spammed 100x/sec. Fixed by adding ItemRack.FindPlayerAura(buff) with safe pcall guards over modern C_UnitAuras.GetPlayerAuraBySpellName, AuraUtil.FindAuraByName, and UnitBuff fallback across all client versions. Named regression in .tools/test_queue_runtime_lua.js verifies that ItemRack.FindPlayerAura safely traps AuraUtil.FindAuraByName errors, returns nil without raising unhandled Lua exceptions, and returns the expected buff when present. Acceptance: on a Retail client, engage Edit Mode and open/interact with ItemRack buttons; confirm no Lua errors are thrown.

October 13, 2026 Forever report from Venruki: ItemRack breakout item tooltips required the
client comparison modifier because Forever does not enable automatic item
comparison by default, unlike current Retail. Exact ItemRack version, Forever
build and item identities were not supplied. Named
`forever-breakout-comparison-default` in `.tools/test_identity_matching_lua.js`
models that client behavior against production tooltip code. It fails before
the option exists and requires the default-on ItemRack setting to request one
comparison for a flyout row without changing WoW's account CVar. It also checks
that disabling the option returns control to the client, Menu on Shift retains
its intentional comparison suppression, missing comparison APIs remain safe,
and unrelated ItemRack tooltips are unchanged. In-game acceptance: on Forever,
hover armor plus paired ring/trinket flyout rows with the option on and no
modifier, then off with and without the comparison modifier. Repeat with Menu
on Shift, Tiny Tooltips, character-sheet and quick-access flyouts; verify correct
comparison items, no duplicate/overlapping tooltips, Lua errors or taint.

October 9, 2026 local user report: `ItemRack/readme.txt`, which ships inside
every release archive, still described the 2.2-era event design, obsolete future
plans and a non-overlapping-set restriction while omitting the Universal client
matrix and current safety behavior. Named `packaged-readme-current-guide` in
`.tools/check_regressions.js` fails against the old file at the shared
Classic/TBC/Forever documentation assertion and passes only when the packaged
guide identifies the supported clients, combat-weapon option, diagnostics and
explicit script approval while excluding the retired guidance. The replacement
was checked against production click, bank, slash-command, queue and event
handlers. The follow-up named `packaged-readme-settings-catalog` inventories
every label in the production `OptInfo` table plus the Set, Queue, Event, rune,
binding, reset and sound editors. It requires explicit scope/default entries for
value-bearing main options and guards the easily misunderstood Script Test,
destructive reset and character/account scope explanations. These are static
packaged-document regressions; verify the next release ZIP contains the updated
readable text beside `ItemRack.toc`.

October 9 beta publishing report: CurseForge's repository packager reported no
TOC for 7297c8b, while our GitHub CurseForge workflow was skipped by its stable-only
job filter. The GitHub ZIP contained both nested addon TOCs. Named standard-gate
`curseforge-auto-beta-published` in `.tools/check_release_flow.js` fails against
that job filter and passes when both published channels reach verification and
upload. `curseforge-auto-beta-all-flavors` builds a real tagged beta Git archive,
verifies every source byte and both versioned TOCs, maps the same five game-version
IDs as stable, and asserts Beta metadata, unchanged multipart bytes and hash receipt.
Existing checks preserve read-only dispatch, stable Release classification,
missing/ambiguous version refusal, durable reservations and no automatic POST
retry. These are workflow-structure and injected-HTTP checks, not a live upload.
Acceptance: publish a future beta containing the updated workflow, confirm its
Actions run is not skipped and the resulting CurseForge file is Beta with all
supported versions. Stable releases must remain Release. Disable the separate
repository-packager integration in CurseForge project settings; it is not used
by the canonical verified-ZIP uploader. The failed historical beta tag is unchanged;
changing dev does not replay its prior release event or alter its workflow.

GitHub #30 (y00), TBC Anniversary / ItemRack 4.53, enUS: ordinary set-menu
clicks bypassed combat deferral for slots 16-18, then failed with protected
PickupInventoryItem/destination_rejected and lost those requests. Named
`issue-30-combat-weapons-*` cases in `.tools/test_batch_and_dualspec_lua.js`
use the reported current/target weapon, shield and relic identities. The
full-set case fails before correction. Both combat-weapons toggle states and
manual slot queues verify retained requests, no transaction/pickup in combat,
post-combat actual equipment and cleared queue/cursor/transaction/set work.
The existing secure-binding suite retains weapon-only/full-set macro coverage,
identity reconciliation and no replay. Bag locations and API timing are modeled;
exact client build is not supplied. On October 9, y00 confirmed in TBC that
4.54-beta1 retained slots 16-18 during combat, equipped them afterward and
produced no Lua errors; the attached trace shows all three CombatQueue entries,
post-combat equipment transitions, transaction completion and an empty final
queue. This is live acceptance of the originally reported menu/slash deferral
failure. The same reply expected the account-wide combat-weapons option to make
menu and `/itemrack equip` requests immediate, but those paths cannot submit
protected actions. Named static regression `issue-30-combat-hotkey-copy` in
`.tools/check_regressions.js` requires the revised label and tooltip to say the
option applies only to saved-set keys assigned through Sets > Bind Key and that
menu, slash, event and queue requests defer. Secure Bind Key behavior itself
still needs reporter/client acceptance, along with both toggle states, full
sets, individual slots, two-handed/off-hand transitions, casting and rapid
replacement requests. Other supported clients require equivalent protected-
action acceptance before stable release.

GitHub #30 October 9 follow-up on 4.54-beta1: y00 confirmed a Sets-tab Bind Key
securely equips slots 16-18 in combat and successfully finishes non-weapon slots
after combat, but the retained non-weapon items had no pending icon on either the
character sheet or quick-access buttons. The cause was a presentation ownership
gap: secure full-set completion is retained in `PendingSetBindingRequest`, while
`UpdateCombatQueue` rendered only physical `CombatQueue` entries. Named
`issue-30-secure-full-set-pending-overlays` in `.tools/test_set_bindings_lua.js`
executes the production request and renderer. It verifies both surfaces show the
reported pending armor, unobserved weapons remain visible, observed secure weapon
completion clears only the weapon overlays, armor remains visible, no duplicate
execution queue entry is created, combat exit executes once, and all overlays
clear. The pre-fix implementation has no set-request projection and fails the
first icon assertion. Live acceptance: use a bound full set with the combat
option enabled, display matching quick-access slots and the character sheet,
enter combat, press the binding, and verify immediate weapon icons clear while
armor icons retain the requested textures until combat exit. Hover a pending
quick-access icon to confirm its target tooltip; repeat a rejected weapon and a
newer superseding set request. Check for stale icons, Lua errors, taint, duplicate
swaps, and correct final gear on every supported client family.

October 8 character-tooltip hop: https://imgur.com/a/v7eD8FY and supplied
OLaVTW6.mp4 show the same equipped ring tooltip on the right around 6.4 seconds
and on the left around 6.6 seconds. Exact client/build, installed addon version,
profile, other tooltip addons and native refresh ordering remain unknown.
`reported-character-tooltip-anchor-hop` in `.tools/test_identity_matching_lua.js`
executes the production character hover, anchor application and Show/OnHide hooks.
It fails before the fix because native ANCHOR_RIGHT survives manual left placement.
Modeled native layout and repeated Show refreshes retain the intended side after
the fix, with 1/2/40-entry profiles, opposite direction, preserved owner/content,
flyout alignment, stale offset cleanup, unrelated owners, hide cleanup, missing
SetAnchorType safety and disabled menus. The menu renderer is stubbed in this
focused anchor test; actual geometry has separate menu-renderer coverage.
This proves the anchor-state conflict is corrected, not the recording's exact
client refresh sequence or protected-action safety. October 11 follow-up
screenshots from locally installed Dev builds show Foreman Belt and, on Forever,
Frontier Britches and Pioneer Gloves still moving from the right to the left of
the right-side row, including with an already-open breakout. MarketSense tooltip
lines are visible. The affected Forever client confirms
`type(GameTooltip.SetAnchorType) == "function"`, disproving the attempted
missing-API fallback; transient-hide and pre-build-alpha experiments also did not
resolve the live reproduction and were removed. No additional correction is
claimed by those attempts. A subsequent live dump on `CharacterHandsSlot` returned
false for equality with ItemRack's global wrapper and true for equality with the
captured original handler. This confirms Forever retained Blizzard's function
object when the frame was created, so changing the global name never routed real
slot hovers through the tested ItemRack wrapper. The extended named regression now
starts with that reported frame-script binding, runs production registration,
requires idempotent replacement and verifies the captured native handler executes
exactly once before the existing anchor assertions. Static standard-gate coverage
requires registration from `InitButtons`. The exact Forever build remains unknown.
After installing the corrected Dev build and reloading on October 11, the reporter
confirmed the tooltip-hop problem appeared solved. This is live acceptance of the
reported Forever character-slot dispatch failure. Other supported clients and
tooltip-addon combinations retain the acceptance checks below.
In-game acceptance: repeat
the recorded ring/armor hovers and flyout rows with small/large/empty menus,
both directions and multiple UI/menu scales; wait for data/comparison refresh,
rapidly change slots, toggle character menus off and open equipment manager.
Check bags, action bars and Options retain normal tooltips, contents/set lines
stay present, and no hop, Lua errors or taint occurs, including in combat.
Repeat with tooltip addons enabled/disabled.

October 8 Forever report: missing set lines with the setting enabled. The
`forever-modern-set-tooltip` case in `.tools/test_identity_matching_lua.js`
models data-processor registration and invokes the production callback and
membership renderer; verifies public-set filtering, identity differences,
both settings, nil/error/secret links, one registration and Classic fallback.
Pre-fix code has no processor registration or callback. Exact client build,
reporter identity and in-client reproduction remain unavailable. Acceptance:
hover bag, equipped and linked items on Forever with both settings on/off,
including Baganator tooltips; check lines appear once and no Lua/taint errors.
Baganator 834-2-g8c53fdf explicitly excludes Forever from its separate ItemRack
adapter. The suggested upstream change is documented in BAGANATOR_COMPATIBILITY.md;
it is not bundled or claimed to have passed live integration acceptance.

The October 7, 2026 feedback after 4.53 describes zoomed main artwork,
inset breakout artwork and independent breakout spacing. The comparison image,
reporter/client build and skin settings were not supplied. `reported-icon-zoom`
and `reported-breakout-inset` in `.tools/check_secure_templates.js` check full
texture coordinates and bounds; the former fails on 4.53. The production
`reported-breakout-spacing` case in `.tools/test_batch_and_dualspec_lua.js`
fails on the pre-fix renderer and verifies independent spacing, both wrap
orientations, frame containment, legacy defaults, unchanged set-menu spacing
and a scaled short screen. In-client acceptance must compare Tidal Charm to
the action bar at equal effective scale, check trim/selection/cooldown alignment
in both icon pickers, and repeat with Masque enabled/disabled. Geometry tests
do not establish pixel-perfect rendering or resolve the unspecified picker
trim observation.

The October 7 CurseForge deployment request extends `.tools/check_release_flow.js`
in the standard gate. Production deployment verification reads a real `git archive`
fixture and checks both folders, every tag blob, checksum, TOC/project/version
mapping and notes. Injected HTTP responses exercise missing credentials, exact
and missing/ambiguous game versions, beta/stable metadata, the unchanged multipart
ZIP, returned file ID, changed-file refusal and no automatic POST retry. The
workflow reserves a persistent deployment before upload. `curseforge-clean-release-assets`
guards the screenshot's public JSON downloads; production reservation/status
handlers cover legacy guards, all prior deployment states, inaccessible history,
exact tag/hash, unchanged source, receipt mismatch and idempotent successful-receipt
migration without another CurseForge POST. Detailed JSON remains an Actions
artifact, and retiring the old secret prevents historical jobs from bypassing
the migrated guard. The named workflow case fails against the 4.53 asset publisher.
These fixtures do
not prove the account's ItemRack project permission, live API submission,
moderator approval or CurseForge installation; the read-only Actions setup run,
actual upload receipt and client installation remain deployment acceptance.

The October 4, 2026 comparison review and user clarification about weapon-only
saved sets are covered by `weapon-only combat binding is secure and never replayed`
in `.tools/test_set_bindings_lua.js`. It checks weapon-only and opt-in full-set
macro configuration, preserved item fields, repeated combat equip intent,
deferred completion, wrong-copy repair, setting disablement, and unsafe input
rejection. The pre-change empty secure carrier fails the macro assertion.
No affected live-client build or specific weapon identities were supplied;
these are production-Lua contract regressions, not verified protected actions.
The same review's missing/incomplete icon APIs and missing combat-text function
failed before correction in `.tools/test_set_icon_picker_lua.js` and the named
`Forever notification API fallback` case in `.tools/test_cooldown_integration_lua.js`.
Shared-provider taint and actual client rendering remain client acceptance checks.

| Report or failure | Permanent focused coverage |
|---|---|
| October 6 follow-up screenshot: searching `lightning` shows No matching icons | `.tools/test_set_icon_picker_lua.js`: `reported-lightning-cross-class-search` fails against 0d3a1cc's spellbook-only catalog and passes with independently generated game-data aliases and artwork for the matching client family. The fixture has only a rogue spellbook; Lightning Bolt/Chain Lightning remain selectable with and without macro-icon enumeration. `reported-lightning-numeric-string-icon` independently fails against the previous filename-prefix conversion and passes when string file IDs remain numeric textures. Neighboring coverage checks fully qualified paths, Classic `player`/legacy `spell` tokens, matching filtered labels, Era/TBC/Forever (including 1.16) artwork boundaries, scoped selection/reset, terminal gear, policies and cleanup. `ItemRackIconNames.lua` is loaded by the actual Options TOC and standard Lua gate; its compiler records client-data source URLs and SHA-256s. The screenshot supplies the query and empty result; character class, exact client/build and API outputs were requested but remain unavailable. These proven code gaps are not confirmation of the screenshot's exact cause; live Lightning search/rendering and client reload remain acceptance. |
| October 6 request: provide a way to restore a deleted stop-queue row | `.tools/test_set_icon_picker_lua.js`: `queue-restore-deleted-stop-marker` deletes the marker through production `SortMove` and fails against 283711d because there is no restore control. Production restore, selector, renderer, SaveSet and next-item lookup cover appending/selecting one marker, moving it before a carried candidate to enforce the existing runtime boundary, duplicate refusal, empty/disabled and long paginated queues, inactive-set ownership, saved policy/icon snapshots, missing slot/list/set, future schema refusal and closed-editor cleanup. Control rectangles retain the existing non-overlap checks. Terminal equipment, active set, enablement and unrelated queue scopes remain unchanged. No specific client/build, item identities or profile were supplied; these are modeled editor flows. Live label spacing/clicks, scrolling and reload persistence remain acceptance. |
| October 6 item-icon picker screenshot/request: no search field to narrow choices by spell name; include spells and item icons together | `.tools/test_set_icon_picker_lua.js`: `queue-icon-spell-search` fails against 463fb6c's picker without a live search field. `queue-icon-spells-and-items` checks searchable item names and browsing spells absent from the macro icon list alongside item icons. Production search/catalog/picker handlers cover partial spellbook names, shared-icon aliases, literal text, empty results, filtered pagination and stale-cell clearing, clear/reopen, reset with zero results, Classic/modern/incomplete/failing/missing APIs, direct spell-name/ID lookup and cache refresh. They assert unchanged equipment, queue owner and set-icon catalog/selection, scoped saved icon/policy and focus/context cleanup. No specific target spell or client build was supplied; spellbook/API responses are modeled. This initial implementation indexed player spellbook names; the later Lightning report above extends it across classes. Live typing, localized fonts, real lookup availability, tooltip/scroll rendering and reload persistence remain acceptance. |
| October 6 Queue screenshot: selected trinket settings and icon label overlap the Global Queues footer; request a small right-side popout | `.tools/test_set_icon_picker_lua.js`: `queue-controls-right-popout` executes the production selector, layout, reorder/delete, item-policy and queue-enable handlers. It fails against cd55f75 when selecting an item hides the slot header/auto-queue control and passes after moving editing controls into a Queue-owned panel. XML-sized control rectangles cannot overlap each other, the list or scope footer; modeled Options scales 1/1.3/1.6, stop/empty selection, inactive-set ownership, saved policies, unchanged terminal gear and picker cleanup are checked. The screenshot supplies the overlap but no exact item links, client build or full profile; the identity fixture is synthetic. Live fonts, screen-edge placement, skinning, scaling and reopen/reload remain client acceptance. |
| October 5 fresh trace: GetQueueItemLocation line 1830 calls nil while scanning bag 0 for `6256::::::::16:1485::14:::::::` | `.tools/test_set_icon_picker_lua.js`: `reported-queue-container-api-missing-global` uses the supplied full identity, reproduces the unguarded global call against 53af365, and passes through namespaced bag and bank scans after correction. It also renders the Queue with both legacy container and quality globals absent, preserves native-era legacy-only discovery, API precedence, closed-bank semantics, missing-provider unknown status, equipped-item detection and nil counts, and asserts terminal gear, global scope, saved policy and popup cleanup. Client build, ownership/location and complete profile were not supplied; bag/bank locations are modeled, while live Queue opening after reinstall/reload remains acceptance. |
| October 5 Options screenshot: full Universal title overlaps Queue; request compact IRU / IRU-B and hover version | `.tools/check_secure_templates.js`: `compact-version-badge` fails against the unbounded title and passes with a 40-pixel title and 44-pixel hover region measured against the actual window/tab XML geometry. `.tools/test_set_icon_picker_lua.js` executes the production label and hover callbacks for Dev, stable and long beta versions, checks full metadata above the owning badge, and unchanged icon choices. Live font rendering, drag handling, tooltip cleanup and Options scaling remain acceptance checks. |
| October 5 follow-up: Stonesplinter Axe queue nil call at line 2204, quality 2, texture 132410, slot 16, six entries | `.tools/test_set_icon_picker_lua.js`: `reported-axe-quality-api-missing-global` extends the already failing-before/passing-after color-API regression with the reported row values and six-entry visibility. It checks namespaced uncommon coloring, final main-hand gear, global queue scope, saved policy and popup cleanup. The supplied line matches the pre-fix dev call; on-disk clients already contain its fallback. Full item identity, client build and confirmation that this capture followed a reload remain unavailable; live recurrence after reload would require fresh evidence. |
| October 5 local user trace: Hunting Boots queue crashes at SortListScrollFrameUpdate line 2023 with a nil function | `.tools/test_set_icon_picker_lua.js`: `reported-queue-quality-api-missing-global` reproduces the missing global `GetItemQualityColor` failure before correction and renders the reported Hunting Boots name, texture 132592, quality 1, slot 8 and two queue rows afterward. The trace line matches beta/pre-icon source; installed dev code retained the same unguarded API call. Exact saved boot identity and client build were not supplied, so the test uses a synthetic full identity. Neighboring cases retain legacy API precedence, namespaced API support, constants/white fallback and incomplete-provider containment, visible rows, terminal gear/set/global queue scope, entry settings and popup cleanup. This proves the production call failure, while live `/reload` and Queue opening remain pending user acceptance. |
| October 5 report: Era 4.51 global Head Queue page shows Gnomish Mind Control Cap and Catseye Ultra Goggles twice, including with the bank open | `.tools/test_identity_matching_lua.js`: `queue-page-normalized-duplicates` fails against raw item-field keys and passes with normalization. Synthetic identities cover empty/zero fields, retained first-entry settings/order/custom icons, distinct enchants/runes, unavailable saved items, stop-marker cleanup and idempotent reopening without equipment/context changes. `queue-page-missing-variant-tooltip` fails when a missing saved enchant displays a carried same-base copy; strict Queue tooltips correct it while other callers retain compatible fallback. The screenshots establish duplicate names, addon version, client family and global Head scope, but do not expose saved/live identities, enchants or exact client build; these proven code defects are not yet confirmed as the screenshot's cause. |
| Queue item icon feature and unavailable-item presentation | `.tools/test_set_icon_picker_lua.js`: `queue-item-icons` executes production queue policy, picker creation/click/reset/scroll/cancel, row and character/flyout rendering paths, and SaveSet. It checks global/per-set/event inheritance, disabled-queue styling, explicit boundaries, enchant/rune distinction, after-stop styling, stale scope/selection refusal, own character overlays, native defaults, saved policy/icon snapshots, open-bank exact location, closed-bank non-ownership and unchanged terminal gear/context. These modeled frame APIs do not verify live rendering, taint, client bank-event order or reload serialization. |
| Supplied quick-access boot screenshot: item artwork does not fill the button and the gap grows with scale | `.tools/check_secure_templates.js`: `quick-access-full-icon-coverage` measures production XML anchor bounds for the icon and cooldown at 0.5x, 1x, 1.5x and 2x. It fails against the original inset template and passes with full button coverage. Existing template checks retain secure-slot separation and owned presentation. Client build and skin settings were not supplied; real rendering, cooldown masks and Masque reskinning still require client acceptance. |
| Supplied three-rogue complaint: Universal download appears as Anniversary in the addon list | `.tools/check_regressions.js`: named Universal naming complaint guards fail against the old TOC titles and pass after correction. `.tools/check_release_flow.js` executes the shared release-post renderer for beta and stable titles and preserves channel labels. Module identifiers, dependencies and archive naming retain existing standard-gate coverage. Addon-list and Options title layout require client acceptance. |
| GitHub #29 / DefinitelyNotNate: weapon/shield set swaps roll back or finish with wrong weapons after 4.46 pipelining | `.tools/test_batch_and_dualspec_lua.js`: `issue-29-reported-shield` uses the reported 4.51 / Classic Era 1.15.9 identities and settings; `issue-29-followup-stale-source` models the follow-up with a synthetic third weapon. Both fail against candidate e28390c and pass after correction. Neighboring cases cover full bags, paired weapons, partial shield/held-item/main-hand-only moves, no-space refusal, later-pass rejection and rollback, actual endpoints, restoration history, queue context, unequip, and cleanup. `.tools/test_transaction_engine_lua.js` verifies stale expected-source rejection before any pickup. Live item-lock timing and protected equipment acceptance remain required. |
| PR #28 / msromike: Forever 1.60.1, ItemRack 4.51 login fails when GetCurrentBindingSet returns 0 | `.tools/test_set_bindings_lua.js`, `binding save waits for a valid binding set`, reproduces the pre-fix SaveBindings error, verifies deferred persistence once set 2 becomes available and immediate saving for set 1. Login continuity and relog persistence still need client acceptance. |
| PR #26 / msromike: relocated minimap button needs a fixed set-menu direction | `.tools/test_batch_and_dualspec_lua.js`, `minimap-menu-direction`, fails before the fix for Up and verifies Auto/unset compatibility plus all fixed dock directions. Rendering and minimap-collector layering remain client acceptance checks. |
| CurseForge baniro_: Mounted movement restores gear but loses the set and queues | `.tools/test_event_integration_lua.js` verifies final base-set and queue-context restoration. |
| Missing saved items block the remaining set | `.tools/test_transactions_lua.js` verifies partial-set planning while retaining unsafe-transition guards. |
| CurseForge Antatra: missing cooldown-state function produces recurring errors | `.tools/test_cooldown_integration_lua.js` verifies missing-module containment and one warning; it does not establish why the original client module failed to load. |
| GitHub #24: two Bracers of Nimble Thought with different enchants resolve to the wrong copy | `.tools/test_identity_matching_lua.js` uses the reported item/enchant identities and covers exact-first lookup, compatible fallback, queues, and the picker. |
| Live 4.47 Ghost Wolf report: form 1, zero bar forms, enabled event never activates | `.tools/test_event_processors_lua.js` reproduces the reported API values and sanitized specialization/Ghost Wolf/Mounted profile. It verifies event ownership, modeled plan completion, final equipment and logical queue context, plus numeric and legacy/modern localized named-form compatibility. Protected equipment actions still require client acceptance. |
| GitHub #24 follow-up audit: an early fallback steals a later exact source during execution | `.tools/test_batch_and_dualspec_lua.js` reproduces the execution-order failure with synthetic ring identities through production lookup, set planning, batching, and observed transaction completion; also checks an already-equipped exact target, an early wildcard, and a paired-slot exchange. This is not a reproduction of the untriaged SoD report. |
| Forever screenshot: set icon picker contains permanent blank, multiply-highlighted cells | `.tools/test_set_icon_picker_lua.js` models uncached item textures, unsupported slot textures, missing saved icons, invalid spell/macro icons, and late item-data refresh. It verifies a dense twenty-slot prefix and visible fallback icons; final rendering remains an in-client acceptance check. |
| CurseForge fr33lanc3 / ConaldPetersen / PR #25: queue diagnostic branch calls unqualified ResolveProxy causing nil error on Classic Era | `.tools/test_queue_runtime_lua.js` reproduces the nil global call in `ShouldHoldEquippedItem` under active `QueueDiagnostic` and verifies resolution via `ItemRack.ResolveProxy`; `.tools/check_regressions.js` guards against unqualified global calls. |
| ItemRackOptions XML relative frame error: ItemRackOptItemStatsPriority cannot find relative frame ItemRackOptItemStatsDelay | `.tools/check_regressions.js` ensures `ItemRackOptItemStatsDelay` is instantiated without an errant `virtual="true"` attribute. |
| Classic Era nil talent/item API calls: GetTalentTabInfo in GetSpecName, GetItemFamily in ValidBag, and IsEquippableItem in PopulateKnownItems | `.tools/check_regressions.js` verifies `C_Item` fallback shims and nil-safety guards in `ItemRack.lua`, `ItemRackEquip.lua`, and `ItemRackOptions.lua`. |
| Forever / Camelot 1.60 report: MenuMouseover nil error (count 1413) due to missing `MouseIsOver` | `.tools/test_batch_and_dualspec_lua.js` tests `ItemRack.MenuMouseover` without `MouseIsOver` and with `GetMouseFoci`; `.tools/check_regressions.js` verifies the global shim and safe mouseover checks. |
| Forever client: suppress breakout menu during Equipment Manager | `.tools/check_regressions.js` verifies `ItemRack.IsEquipmentManagerOpen` suppression logic and hooks. |
| Forever / Camelot 1.60 report: `ItemRack.ValidBag` nil error due to missing `GetItemFamily` | `.tools/test_batch_and_dualspec_lua.js` tests `ItemRack.ValidBag` with `C_Item.GetItemFamily`; `.tools/check_regressions.js` verifies the global shim and safe `GetContainerNumFreeSlots`/family checks. |
| Universal release package/client metadata | `.tools/check_release_flow.js` verifies the single universal archive name and local client discovery; `.tools/check_regressions.js` verifies both TOCs carry the official Classic and Forever/Camelot interface matrix. |
| Forever / Camelot 1.60 report: `PopulateKnownItems` nil error due to missing `IsEquippableItem` | `.tools/test_batch_and_dualspec_lua.js` tests `ItemRack.PopulateKnownItems` with `C_Item.IsEquippableItem`; `.tools/check_regressions.js` verifies the global shim and safe `IsEquippableItem` checks. |
| Forever / Camelot 1.60 report: `ProcessBuffEvent` secret number comparison error on `GetUnitSpeed` | `.tools/test_batch_and_dualspec_lua.js` tests `ItemRack.IsPlayerMoving` with simulated secret number objects; `.tools/check_regressions.js` verifies `ItemRack.IsPlayerMoving` guards and absence of unguarded `GetUnitSpeed` comparisons. |
| TBC Anniversary: equipped set items do not update minimap icon | `.tools/test_identity_matching_lua.js` verifies normalization of empty vs zero colon-delimited item fields; `.tools/test_batch_and_dualspec_lua.js` verifies `ItemRack.UpdateCurrentSet` auto-scans and matches saved sets when `CurrentSet` is unequipped or nil; `.tools/check_regressions.js` ensures `NormalizeItemFields`, set auto-scanning, and slot-specific queue readiness gating. |
| TBC Anniversary: character sheet swap menus appear despite being disabled | `.tools/test_batch_and_dualspec_lua.js` verifies `PaperDollItemSlotButton_OnEnter` hides open menus and suppresses new ones when `CharacterSheetMenus == "OFF"`; `.tools/check_regressions.js` guards early return in `PaperDollItemSlotButton_OnEnter`, `PaperDollFrame` exclusion from `MenuMouseover` keep-alive, and immediate dismissal in `OptListCheckButtonOnClick`. |



The later supplied three-rogue diagnostic dump confirms runtime 4.51 and a
global boots queue with item 7189 marked priority. It records successful Mount
and Stealth set transactions followed by AutoQueue replacing their boots; this
sequence supports a priority override rather than a blocked keybind. It also
records Mount as mismatched while its saved boots are still worn. A production
Lua diagnostic probe reproduced the predictive queue/set-recognition result,
but no correction or permanent failing regression for that behavior is claimed.
Client build, reporter/source link, comparative working-character state and
any later blocked-keybind sequence remain missing.
The later supplied boot screenshot supports the quick-access sizing complaint.
The original production geometry reproduced a two-pixel inset in a 36-pixel
button, which grew in screen pixels when scaled. The default geometry is now
corrected and covered above; live client and skin-specific rendering remain
unverified.

The recent CurseForge report by leocard about SoD items being reported missing
still needs client build, saved/live item and rune identities, and a diagnostic
dump. Rune-specific matching remains strict; passing synthetic cases does not
establish that report's cause or resolution. The SecureCmdOptionParse comment
by maxon_iv is a longstanding macro enhancement request, not a demonstrated
recent-release regression.

Additional pre-deployment compatibility checks in those standard suites cover
zero-bar numeric Warrior/Rogue/Shaman identities, humanoid form 0, repeated
stance evaluation without frame or gear churn, Dire Bear/Aquatic spell IDs,
exact carried rune lookup, explicit unengraved rune 0, wrong-rune refusal,
and observed partial-set completion when a later item is missing or only one
physical copy exists for two requested slots. Class identity cases model API
responses, not actual client spellbooks or stance availability.

## Large-profile coverage

| Workload | Generated profile | Code-level use cases and invariants |
|---|---:|---|
| Event ownership | 64 physical sets, 100 activations, 80 seeded removals | Overlapping slots, distinct events sharing a set, repeated sets at different depths, Zone-style insertion below a visible owner, stale generations, arbitrary buried removal, manual slot release, and same-event generation replacement. Every operation verifies frame/order indexes, effective physical gear, and final restoration to the original base. |
| Queue policy | 64 sets × 19 slots, 96 event-stack entries | Current-set boundaries, duplicate event-set inheritance, global fallback, missing explicit sets, per-set queues disabled, context inheritance disabled, false enabled values, atomic owner/list/enabled provenance, and no mutation of manual choice, event order, or unknown set fields. |
| SavedVariables migration | 48 sets plus global queues; 931 queues and 3,724 legacy records | Numeric-string slot keys, scalar and canonical entries, sparse gaps, corrupt entries, fail-closed stop markers, legacy priority/keep/delay recovery, nested unknown metadata, quarantine, deep backup, idempotent rerun, and unknown-future-schema refusal. |
| Equipment transactions | 24 complete saved sets across 96 generated switches plus contention cases | Bag↔equipment and equipment↔equipment planning, occupied destinations, exact endpoint observation, serial execution, seven later-step destination failures with full rollback, locked-source resume, rapid-click collision, user cursor ownership, spell targeting, one terminal callback, and zero cursor/transaction residue. |

The event workload uses seed `44501`. Keep that seed stable for the release
gate. If broader fuzzing is added later, report the failing seed and convert
the smallest failure into a named deterministic fixture.

## Test boundary

These tests prove ItemRack's Lua state and its reactions to modeled WoW API
outcomes. They cannot emulate Blizzard's protected-action and taint engine,
real client item-lock timing, unique-equipped restrictions, Masque behavior,
rendering, or frame-time cost. Those remain client acceptance cases in
[`BETA_TEST_CHECKLIST.md`](BETA_TEST_CHECKLIST.md); a green `npm test` must not
be used as evidence that those client-only gates were run.

When adding a reported failure, keep both layers when relevant:

1. Add the smallest focused regression near the owning module under `.tools`.
2. Add or extend a many-set sequence when depth, repetition, migration size,
   or transaction ordering contributed to the failure.
3. Assert the terminal state, not only that an API call was submitted.
4. Preserve unknown SavedVariables fields and verify reruns are idempotent.
