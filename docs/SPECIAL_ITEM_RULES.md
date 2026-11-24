# Special item rules

The framework separates client item data from reusable use/queue mechanics. It ships in the universal addon, but only the selected client's data table is allocated. Each other client's data file returns before registering its catalog factory. An unsupported Interface allocates no item catalog. The selected factory refreshes at login/world entry, with periodic retry if seasonal detection is unknown. SoD shares the Era exceptions; its ordinary seasonal items need no override. Unchanged refreshes preserve the table and use state.

## Files and current scope

- `ItemRack/ItemRackSpecialItems.lua`: client detection, catalog lookup/index validation, bounded intent/evidence state, shared mechanics and diagnostic export.
- `ItemRack/ItemRackSpecialItemsEra.lua`: Interfaces 11508/11509, shared by Era, Hardcore and SoD.
- `ItemRack/ItemRackSpecialItemsTBC.lua`: Interfaces 20505/20506.
- `ItemRack/ItemRackSpecialItemsForever.lua`: Interface 16001 and the existing 11601 load alias.

The active catalogs contain **five distinct exception item IDs**: four records on Era/Hardcore/SoD, two on TBC and two on Forever. The broader research inventory remains in the pinned CSV and coverage manifest. Appearing in research is not a reason to load a runtime rule. This corrects beta12's overinclusive catalog on `dev` for the next candidate; beta12's published archive and installed copies are unchanged.

| Item | ID | Clients requiring an exception | Reason |
|---|---|---|---|
| Mechanical Dragonling | 4396 | Era/Hardcore/SoD | Deferred native cooldown |
| Mithril Mechanical Dragonling | 10576 | Era/Hardcore/SoD | Deferred native cooldown |
| Arcanite Dragonling | 16022 | Era/Hardcore/SoD, Forever | Deferred native cooldown |
| Gnomish Mind Control Cap | 10726 | Era/Hardcore/SoD, TBC, Forever | Specific charm aura 13181 on the controlled pet |
| Serpent-Coil Braid | 30720 | TBC | Mana-gem cooldown/buff dependency |

TBC Dragonlings and Forever Mechanical/Mithril use normal native handling without catalog records. Mortar, Rocket Boots, ordinary channels, timed player effects, random/backfire items and charged items likewise use shared handling. Charges alone do not establish an exception. Bag-only references remain in research, not runtime tables. Coverage is in [special-item-catalog-coverage.json](research/special-item-catalog-coverage.json).

Research, source hashes and corrected item metrics are in [SPECIAL_ITEM_USAGE_RESEARCH.md](SPECIAL_ITEM_USAGE_RESEARCH.md). Cap aura identity is extracted from the same pinned SpellEffect tables in [special-item-policy-evidence.json](research/special-item-policy-evidence.json); emulator dispatch corroborates the dummy-to-charm association without claiming to be live Blizzard server code.

## Adding or removing an item

Edit the appropriate client data table, or delete/disable the entry. Reload to apply it. No queue-engine change is needed for an item using an existing mechanic. The item ID is the key; the `slots` map contains actual equipment slot IDs (13/14 trinkets, 17 off-hand, 1 head), not inventory-type IDs.

Example of the existing deferred-use shape:

```lua
[16022] = {
    name = "Arcanite Dragonling",
    enabled = true,
    slots = { [13]=true, [14]=true },
    activation = {
        itemSpell = 23074, -- Era player item-use wrapper, confirmed in reporter capture
        successSpells = { [23074]=true, [19804]=true }, -- wrapper plus summon binding
        windowSeconds = 0.75,
    },
    cooldown = {
        start = "deferred",
        seconds = 3600, -- source metadata, not a fabricated live cooldown
        minimumOwnSeconds = 120, -- excludes short equip/shared penalties
        reviewAfterSeconds = 90, -- diagnostic uncertainty, not readiness
        category = 94,
        categorySeconds = 60,
    },
    effect = { kind="guardian", seconds=60, hold=false },
}
```

`SpecialItems.BuildIndex()` runs after the selected data file. It builds only relevant spell subscriptions and rejects malformed enabled deferred rules or invalid slot/identity records into `invalidRules` diagnostics. If changing tables programmatically during development, call it again. Declarative native rules retain the ordinary verifier; unknown new mechanics need their own reviewed handler rather than being silently treated as a supported exception.

## Existing shared mechanics

- **Deferred cooldown:** an observed use hook creates a bounded token for the exact equipped item, slot, queue owner/list and equipment generation. A matching public numeric player `UNIT_SPELLCAST_SUCCEEDED` event must arrive while that intent is current. The existing casting dispatcher invokes this before its instant-cast early return. Failed/interrupted, stale, ambiguous, crafting or unrelated events cannot establish successful use. A standalone success is diagnostic evidence only and cannot be consumed by a later hook.
- **Independent identities and shared lockouts:** the cooldown authority indexes exact/base item IDs, never guardian categories. A pending special receipt is keyed by its own base ID and exact item/slot context. A short category lockout blocks readiness but cannot create use/burn/notification state for another deferred item. Same-base exact variants continue to reflect the base-scoped game API; explicitly authored dependency proxies remain intentional.
- **Native cooldown:** no alternate use inference. The normal verified-use path remains in charge, including TBC Arcanite Dragonling.
- **Cooldown dependency:** `proxy={id=<gating item>,buff=<localized spell ID>}` is consumed by the existing queue/display proxy functions. This preserves the Braid behavior rather than adding a second observer.
- **Effect hold:** a rule can specify an exact channel spell, or specific player/pet aura spell IDs. These reusable queries participate in automatic queue selection and set recognition. They do not globally prevent deliberate manual equipment changes. The active catalog uses the pet-aura handler for the cap. Ordinary casts/channels use `NowCasting` in both queue entry points; normal player effects use `FindPlayerAura(name, spellID)` with guarded modern exact/name/indexed and legacy APIs. Item-linked self effects can be helpful or harmful; name-only event callers remain helpful-only. Optional data-defined channel mechanics remain available for future demonstrated exceptions. Merely having a pet is never a match.

Successful deferred evidence marks the equip timer used and releases the matching ordinary temporary choice. Persistent holds and Burn on Use retain their existing settings. Actual buff, Pause Queue and delay checks still precede automatic selection. The framework never performs protected equipment actions directly; selection goes through the existing combat queue and transaction path.

## Pending cooldown lifecycle

Implementation and deployment progress is tracked in
[SPECIAL_ITEM_TEST_DEPLOY_PLAN.md](SPECIAL_ITEM_TEST_DEPLOY_PLAN.md). Verification uses production Lua offline, extracted client data and the reporter's observations. There is no in-game simulator, fake item or special test-mode toggle.

The confirmed item is excluded from automatic candidate selection while its own cooldown is pending, even if the API still reports zero. The current used item may yield to a valid replacement subject to the user's other restrictions. A short shared/equip cooldown does not count as the real item cooldown.

Periodic queue processing samples confirmed items independently of candidate traversal, so a closed menu or a higher-priority ready item cannot hide the real delayed cooldown. Once the native authority publishes an eligible own cooldown, normal cooldown thresholds and ready notifications resume. A readable real expiration clears the receipt. No ready notification or artificial cooldown is created from the nominal summon duration.

After the review interval, an unresolved cooldown remains excluded and is reported as `unresolved`; the lifecycle poll performs that transition while readiness queries remain pure. A fresh independently confirmed activation may replace old uncertainty. `/itemrack special status` reports state, and `/itemrack special reset <itemID>` discards only that item's special receipt. It leaves manual holds, equipment and native cooldown checks intact.

Confirmed use is persisted under `ItemRackUser.SpecialItemUsage` schema 1. It stores a bounded base-ID/exact-ID/slot/rule-revision record with server-epoch time; attempts, queue lists, owners, cast tokens, pending actions and uptime deadlines are not persisted. Startup validates the selected client/ruleset and restores after the equipped snapshot, before queue-ready notification. Restoration does not replay use effects, swaps or notifications. A pending item may now be in a bag or another compatible slot. Normal reload/logout saves are supported; process crashes do not guarantee a SavedVariables write.

An observed own cooldown restores as `reconciling` until native publication, or until saved expiry plus stable readable zero establishes offline completion. Saved time alone cannot establish readiness. Unavailable/backward clocks retain uncertainty until authoritative evidence. Authority-confirmed arena reset clears the receipt; stale pre-entry active samples do not. Unknown future schemas are preserved and special execution is suspended with diagnostic status. Invalid/client-incompatible/removed rules are rejected with bounded reasons.

## Diagnostics and acceptance

`/itemrack dump` includes `ItemRack.SpecialItems`: detected client, selected catalog/disabled entries, invalid rule reasons, current intents, confirmed-use state and the last 24 relevant decisions. Sanitized lifecycle summaries survive normal reload and appear as `previousHistory`. It excludes live queue-list references. Default chat remains quiet. Dumps include selected exception mechanics and catalog source; research-only bag records are not allocated or exported.

`/itemrack debug` includes special-item capture when enabling all layers; `/itemrack debug specialitems` controls it independently and can rearm directly after expiry. Detailed capture runs for 120 seconds, with a 2,048-entry ring and drop/stop metadata. Normal dumps export its latest 256 entries; `/itemrack dump full` includes all retained entries and reports omitted/exported/retained counts. It captures relevant use-hook sources, unexpected public player spell IDs while a catalog item is equipped/pending, and changing raw/native cooldown observations. Unexpected events are diagnostic only and never create use evidence. Detailed capture itself is runtime-only: collect a dump before and after a reload test. Debug chat remains opt-in. Status/reset output is produced only when explicitly requested.

The standard `npm.cmd test` gate extends `.tools/test_queue_runtime_lua.js` for catalog isolation and the reported delayed-use path, including fail-before evidence from beta10. Independent Lua globals load the production modules and real queue initialization to test persisted receipts across different uptimes. Details are recorded in [TESTING.md](TESTING.md). Wago data establishes sampled item/spell bindings and timings; the reporter says Arcanite can be manually swapped immediately. Community candidate feedback checks the resulting live interaction. Owning these items is not required of the maintainer before publishing a candidate; any newly requested mechanics beyond these policies remain separate work.

Historical beta11 validation, November 12, 2026: the full `npm.cmd test` gate passed, including 132 catalog-isolation, 279 special-item runtime and 139 isolated-environment recovery/lifecycle checks. Those totals verify code behavior under API inputs; they do not constitute a client capture. Invalid nested activation, cooldown, effect and proxy records are rejected during index construction and reported in diagnostics. Beta10 remains unchanged. This preceded GitHub-only beta11 publication.

## Historical beta12 verification

The existing `.tools/test_queue_runtime_lua.js` compares every applicable catalog entry against all five pinned build exports, including both Era and TBC interface versions, conditional SoD allocation, inherited slots, categories and spell bindings. It executes actual aura/channel guards and multi-item use/queue/combat paths. The real `SlashHandler` command test fails against beta11 master debugging and passes with the unified capture wiring. The supported-window status, rearm, chat and clear paths are checked without an in-game harness. This describes beta12 as published on 2026-11-13, before the default-item cleanup above. Accepted candidates remain immutable.

Beta12 implementation gate passed on 2026-11-13 after `npm.cmd ci`: 490 catalog, 426 special-use runtime, 139 reload/recovery, 2,144 source/effect checks and 11 debug-command checks (3,210 focused special-item assertions), plus the complete existing addon and release gate. This verifies code/source behavior, with community in-client feedback collected through the candidate.

Aura compatibility: specific-aura policies first use the modern exact `C_UnitAuras.GetUnitAuraBySpellID` API, then indexed helpful/harmful records if available, with guarded legacy lookup retained. API failures and secret records cannot establish a match. The contract is documented in [extracted Classic UnitAura API documentation](https://github.com/Gethe/wow-ui-source/blob/classic/Interface/AddOns/Blizzard_APIDocumentationGenerated/UnitAuraDocumentation.lua). The focused source suite checks all enabled aura rows with legacy globals absent as well as legacy paths.

## Default-item cleanup verification (dev, November 13)

`ordinary-on-use-not-special` rejects beta12's overinclusive tables. `ordinary-on-use-default-flow` executes production use verification, generic aura lookup, both queue entry points and combat drain with source-backed Mortar, Boots, Skull, Pouch, Fetish and Pendant identities/spells/slots. APIs and equipment endpoints are modeled offline, including helpful/harmful self-effect variants; fixtures do not claim which filter a live client emits. Ordinary channels and an unlisted spell use real casting start/stop dispatch. `curated-exception-source` checks retained metrics and default exclusions against all five pinned exports / six Interfaces. Live timing, backfires and server-specific behavior remain community acceptance checks.

## Reporter follow-up correction (dev)

The dedicated #33 capture confirms Arcanite's successful Era wrapper event 23074, not just an inferred inner summon. Era maps now allow the source-bound item wrapper (23074/23075/23076) and retain corresponding summon bindings; each ID belongs only to its own item. TBC and Forever mappings are unchanged. Numeric-text hook slots are canonicalized before readiness/retry, with obsolete text-key quarantines removed. Failure/interruption, unrelated spells, expired/ambiguous intents, identity/context/generation changes and persistent holds retain their guards. A successful wrapper event is required before shared-zero/short native cooldown can stand in for a deferred item's actual use; a failed click during another item's shared lockout does not qualify. Normal fresh own-cooldown proof remains available independently.

Special history stores event type; hook traces include input type, and dumps export manual choice/owner/hold fields. The special 120-second trace is independent of the general log buffer (5,000 retained activity lines, 500 exported normally); collect it from `ItemRack.SpecialItems.trace` in the dump even when normal logs roll over. No fixed 75-second readiness timer is introduced.

## Full export on dev

`/itemrack dump full` is an opt-in snapshot of all retained general log, queue-recorder and special trace entries, plus normal state sections. Normal export remains one view. Full export is presented in ordered copyable pages capped at 400 newline characters / 24,000 bytes; these are conservative presentation budgets, not claims about a universal native EditBox limit. Pages concatenate to the original sanitized report and do not consume source buffers. Controls identify the current page; closing releases the snapshot. Capacity does not extend capture time or restore overwritten entries. Lua tests cover boundaries and callbacks; engine rendering, wrapping and clipboard behavior remain client acceptance.
