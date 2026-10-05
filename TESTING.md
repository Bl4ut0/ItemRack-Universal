# Automated Testing

Run the complete release gate from the repository root:

```powershell
npm test
```

Run only the deterministic many-set workloads:

```powershell
node tests/test_large_profiles_lua.js
```

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



The supplied three-rogue complaint reports ItemRack 4.51 from CurseForge but
does not include a reporter/source link, client build, set/boot identities,
queue flags, diagnostic dump, or a screenshot of the image sizing. The
boot-AutoQueue/keybind failure and icon complaint remain untriaged; existing
readiness, queue-intent and icon tests do not reproduce this character's failure.
The production quick-access texture has a two-pixel inset in a 36-pixel button;
scaling preserves that ratio. This explains a possible visual difference but
does not establish a rendering regression without the affected UI/screenshot.

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
