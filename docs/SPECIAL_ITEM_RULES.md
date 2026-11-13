# Special item rules

The framework separates client item data from reusable use/queue mechanics. It ships in the universal addon, but only the selected client's data table is allocated. Each other client's data file returns before registering its catalog factory. An unsupported Interface allocates no item catalog. The selected factory refreshes at login/world entry, with periodic retry if seasonal detection is unknown; SoD rows are allocated only when engraving is active. Unchanged refreshes preserve the table and use state.

## Files and current scope

- `ItemRack/ItemRackSpecialItems.lua`: client detection, catalog lookup/index validation, bounded intent/evidence state, shared mechanics and diagnostic export.
- `ItemRack/ItemRackSpecialItemsEra.lua`: Interfaces 11508/11509, with conditional SoD variants.
- `ItemRack/ItemRackSpecialItemsTBC.lua`: Interfaces 20505/20506.
- `ItemRack/ItemRackSpecialItemsForever.lua`: Interface 16001 and the existing 11601 load alias.

The complete reviewed catalog now contains 36 distinct equipment IDs, represented by 27 Era records, five conditional SoD records, 31 TBC records and 26 Forever records. Only the selected family's records are allocated. All applicable gear rows are enabled with the policy supported by their client data; a native row deliberately delegates use/cooldown behavior to the existing ItemRack engine rather than inventing another exception. Coverage and exclusions are in [special-item-catalog-coverage.json](research/special-item-catalog-coverage.json).

- Era Mechanical, Mithril and Arcanite Dragonlings share the deferred-use handler. Forever uses it for Arcanite; the other two follow their different native records. TBC's three use native cooldowns.
- Channels include Death Ray, Dragon Gun, Circle of Flame, TBC Naaru Sliver and the SoD channel variants. Exact player/pet aura policies cover the reviewed timed effects and the cap's specific charm (`13181`), never just any pet.
- The TBC Braid mana-gem proxy uses the existing shared dependency functions. Explicit `ItemRack.CooldownProxies` overrides retain precedence.
- Random/backfire outcomes, charges and Don Carlos' cosmetic companion use native handling. The catalog does not invent outcome-specific evidence or treat an always-equipped despawn aura as proof a companion is active. Those are explicit policy boundaries, not disabled gear rows.
- Bag-only items are present in `ReferenceItems` with `scope="bag"`; they are never equipment rules. Linked Forever item effects with missing ItemSparse rows retain the known base item's slot with that provenance stated. SoD-only IDs are not imported into Forever from effect linkage alone.

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
        itemSpell = 23074, -- related dummy spell, diagnostic only on Era
        successSpells = { [19804]=true }, -- verified-success candidate
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
- **Native cooldown:** no alternate use inference. The normal verified-use path remains in charge, including TBC Arcanite Dragonling.
- **Cooldown dependency:** `proxy={id=<gating item>,buff=<localized spell ID>}` is consumed by the existing queue/display proxy functions. This preserves the Braid behavior rather than adding a second observer.
- **Effect hold:** a rule can specify an exact channel spell, or specific player/pet aura spell IDs. These reusable queries participate in automatic queue selection and set recognition. They do not globally prevent deliberate manual equipment changes. The collective catalog assigns these handlers to exact source-backed channels/auras. Merely having a pet is never a match.

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

`/itemrack dump` includes `ItemRack.SpecialItems`: detected client, selected catalog/disabled entries, invalid rule reasons, current intents, confirmed-use state and the last 24 relevant decisions. Sanitized lifecycle summaries survive normal reload and appear as `previousHistory`. It excludes live queue-list references. Default chat remains quiet. Dumps include the full selected catalog mechanics, catalog source and bag-only reference records.

`/itemrack debug` includes special-item capture when enabling all layers; `/itemrack debug specialitems` controls it independently and can rearm directly after expiry. Detailed capture runs for 120 seconds, with a 256-entry ring and drop/stop metadata. It captures relevant use-hook sources, unexpected public player spell IDs while a catalog item is equipped/pending, and changing raw/native cooldown observations. Unexpected events are diagnostic only and never create use evidence. Detailed capture itself is runtime-only: collect a dump before and after a reload test. Debug chat remains opt-in. Status/reset output is produced only when explicitly requested.

The standard `npm.cmd test` gate extends `.tools/test_queue_runtime_lua.js` for catalog isolation and the reported delayed-use path, including fail-before evidence from beta10. Independent Lua globals load the production modules and real queue initialization to test persisted receipts across different uptimes. Details are recorded in [TESTING.md](TESTING.md). Wago data establishes sampled item/spell bindings and timings; the reporter says Arcanite can be manually swapped immediately. Community candidate feedback checks the resulting live interaction. Owning these items is not required of the maintainer before publishing a candidate; any newly requested mechanics beyond these policies remain separate work.

Validation on dev, November 12, 2026: the full `npm.cmd test` gate passed, including 132 catalog-isolation, 279 special-item runtime and 139 isolated-environment recovery/lifecycle checks. Those totals verify code behavior under API inputs; they do not constitute a client capture. Invalid nested activation, cooldown, effect and proxy records are rejected during index construction and reported in diagnostics. Beta10 remains unchanged. The authorized next deployment is GitHub-only beta11, with no CurseForge upload or local installation.

## Beta12 verification

The existing `.tools/test_queue_runtime_lua.js` compares every applicable catalog entry against all five pinned build exports, including both Era and TBC interface versions, conditional SoD allocation, inherited slots, categories and spell bindings. It executes actual aura/channel guards and multi-item use/queue/combat paths. The real `SlashHandler` command test fails against beta11 master debugging and passes with the unified capture wiring. The supported-window status, rearm, chat and clear paths are checked without an in-game harness. Beta11 remains immutable; the requested next candidate is GitHub-only 4.59-beta12, dated 2026-11-13.

Beta12 implementation gate passed on 2026-11-13 after `npm.cmd ci`: 490 catalog, 426 special-use runtime, 139 reload/recovery, 1,844 source/effect checks and 11 debug-command checks (2,910 focused special-item assertions), plus the complete existing addon and release gate. This verifies code/source behavior, with community in-client feedback collected through the candidate.
