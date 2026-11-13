# Special item usage research and implementation proposal

Research date: 2026-11-12. Status: **research snapshot; owner subsequently approved the shared framework on dev**. See [SPECIAL_ITEM_RULES.md](SPECIAL_ITEM_RULES.md) for implementation and live-acceptance boundaries. Publication, local installation and a public reply are separate from that approval.

This follows [GitHub #33, comment 6841005114](https://github.com/Bl4ut0/ItemRack-Universal/issues/33#issuecomment-6841005114), the owner's request for item-wide rules, and the supplied “Special-Use, Summon & Delayed-Swap Item Reference.” The supplied reference is a candidate list, not verified policy. Several of its numeric values and generalizations conflict with the sampled client data below.

## What is confirmed, and what is not

The research confirms **static item/spell records in specific Blizzard client builds**. It does not confirm the timing of live Lua events, server hotfixes, availability on a realm, a summon surviving unequip, or a buff being tethered to gear. Those require client evidence. A missing row does not establish that an item was removed from the game.

No addon Lua, tests, release metadata, local game installations or GitHub comments were changed for this research. Existing beta10 and its acceptance status are unchanged. The reporter said he would test beta10 later; that release has not been accepted by him in the last reviewed comment.

## Supported release matrix

The authoritative scope is the current universal TOC and deployment mapping, not every expansion for which a helper function exists.

| Supported release | Sampled build | Coverage boundary |
|---|---|---|
| Era 1.15.8, Interface 11508 | 1.15.8.67156 | Includes records for Era/Hardcore and SoD; presence in the file does not identify realm availability. |
| Era 1.15.9, Interface 11509 | 1.15.9.70576 | Same distinction between shared client data and ruleset availability. |
| TBC Anniversary 2.5.5, Interface 20505 | 2.5.5.65463 | Anniversary after its TBC transition belongs here, not automatically to Era item rules. |
| TBC Anniversary 2.5.6, Interface 20506 | 2.5.6.70577 | Compared separately; selected Dragonling metrics match the 2.5.5 sample. |
| Forever 1.60.1, Interface 16001 | 1.60.1.70938 | Interface 11601 is the existing legacy load alias, not a sixth independent ruleset. |

The latter Era, TBC and Forever build numbers were also observed in the local installation's `.build.info`. They identify the sample, not a promise that it is the latest published build. Retail, Wrath and Cataclysm are not additional supported release targets in this TOC matrix.

## Primary data and reproducibility

Downloaded Blizzard client-table exports from wago.tools for each build:

- `ItemSparse`: name, equipment type and requirements when the row exists.
- `ItemEffect`: item-specific spell binding, trigger, charges, cooldown/category overrides.
- `ItemXItemEffect`: required for the sampled Forever schema, where `ItemEffect` has no `ParentItemID` column.
- `SpellName`, `SpellMisc`, `SpellEffect`, `SpellDuration`, `SpellCastTimes`, `SpellCooldowns`, `SpellCategories`: spell identities, attributes, effects and timing references.

The 46 source URLs, row counts and SHA-256 values are pinned in [special-item-usage-sources.json](research/special-item-usage-sources.json). The reviewed subset has 197 effect rows, including equip effects as well as on-use effects, in [special-item-usage-metrics.csv](research/special-item-usage-metrics.csv). This is a research dataset, not a runtime registry and not 197 confirmed exceptional items.

Raw tables, the broader exploratory results and the Python join script remain in `.versions/SpecialItemResearch/`. That cache is ignored by Git. To reproduce from another checkout, download each URL in the source manifest, verify its hash, then join by item/effect/spell IDs. Use `ItemXItemEffect` for Forever rather than silently dropping its item associations.

Representative primary sources:

- Era: [ItemEffect 1.15.9.70576](https://wago.tools/db2/ItemEffect/csv?build=1.15.9.70576), [SpellMisc](https://wago.tools/db2/SpellMisc/csv?build=1.15.9.70576), [SpellEffect](https://wago.tools/db2/SpellEffect/csv?build=1.15.9.70576).
- TBC: [ItemEffect 2.5.6.70577](https://wago.tools/db2/ItemEffect/csv?build=2.5.6.70577), [SpellMisc](https://wago.tools/db2/SpellMisc/csv?build=2.5.6.70577), [SpellDuration](https://wago.tools/db2/SpellDuration/csv?build=2.5.6.70577).
- Forever: [ItemEffect 1.60.1.70938](https://wago.tools/db2/ItemEffect/csv?build=1.60.1.70938), [ItemXItemEffect](https://wago.tools/db2/ItemXItemEffect/csv?build=1.60.1.70938), [SpellMisc](https://wago.tools/db2/SpellMisc/csv?build=1.60.1.70938).

Interpretation boundaries:

- Timing columns in the CSV are milliseconds. The tables below convert them to seconds/minutes.
- An override of `-1` means the field must be resolved through its underlying spell/default; it is not a negative duration and must not be converted into an immediate-ready rule.
- A spell duration of `-1` is indefinite; no duration row on a dummy wrapper is not a zero-second effect.
- `InventoryType` 12 is a trinket, 23 is a held off-hand and 1 is head. These are item inventory types, not runtime slot numbers 13/14/17.
- The data bit `Attributes_0 & 0x02000000` is interpreted as cooldown-on-event/expiry. [AzerothCore's source enum](https://github.com/azerothcore/azerothcore-wotlk/blob/master/src/server/shared/SharedDefines.h) documents that interpretation. That is corroborating format knowledge from an emulator, not Blizzard server code or proof of the behavior on a supported live client.
- Era dummy wrappers `23074/23075/23076` are paired with summon candidates `19804/12749/4073`. [CMaNGOS's spell-effect implementation](https://github.com/cmangos/mangos-classic/blob/master/src/game/Spells/SpellEffects.cpp) corroborates those associations. The sampled DB2 dummy rows do not themselves expose those trigger links. Treat the aliases as candidates for live event matching, not guaranteed emitted cast IDs.
- Static effect/attribute scans help find candidates, including deprecated, quest and unavailable records. They do not justify automatically registering every match.

## Arcanite Dragonling: metrics for every supported release

Item ID `16022`, equipment type trinket, required level 50 and Engineering 300 in the sampled ItemSparse rows.

| Release/build | Item-bound use spell | Summon candidate / duration | Item cooldown | Category override | Deferred-cooldown evidence |
|---|---|---|---|---|---|
| Era 1.15.8.67156 | `23074`, dummy | `19804`, 60 s | 3,600 s / 60 min | 94 / 60 s | Summon candidate has `0x02000000`; matches the reporter's delayed-start hypothesis. |
| Era 1.15.9.70576 | `23074`, dummy | `19804`, 60 s | 3,600 s / 60 min | 94 / 60 s | Same relevant records as the 1.15.8 sample. |
| TBC 2.5.5.65463 | `19804`, direct summon | `19804`, 60 s | 1,200 s / 20 min | 94 / 60 s | This summon does not have that bit. A deferred-use exception is not established here. |
| TBC 2.5.6.70577 | `19804`, direct summon | `19804`, 60 s | 1,200 s / 20 min | 94 / 60 s | Same relevant records as the 2.5.5 sample. |
| Forever 1.60.1.70938 | `19804`, direct summon | `19804`, 60 s | 3,600 s / 60 min | 94 / 60 s | Direct summon has `0x02000000`. |

The sampled summon records use instant cast-time index 1 and summon creature entry `12473`. Era/TBC summon-properties references differ from Forever; a single cross-client implementation must not assume identical server guardian handling.

**Conclusion:** a build-aware deferred-use rule is justified for further development/testing in Era and Forever. Do not automatically apply the same exception to TBC. The 60-second summon duration is a nominal lifetime, not a fixed cooldown-start delay: early death, dismissal and server behavior can change the actual event. Capture a confirmed successful activation and reconcile the authoritative cooldown when it arrives; do not synthesize “use time + 60 s” as fact.

Still unverified for every sampled client: which player cast/summon event and ID actually arrive; whether use failure also produces a wrapper success event; whether the summon persists after unequip; exact cooldown start on early guardian death; shared-category event timing; behavior after reload during a pending cooldown.

## Other summon candidates and their differences

Era columns apply to the matching 1.15.8/1.15.9 sample rows; TBC columns apply to both sampled 2.5.5/2.5.6 builds. These are item cooldown / nominal active duration, not verified live swap permissions.

| Item | Era | TBC Anniversary | Forever | Research assessment |
|---|---|---|---|---|
| Mechanical Dragonling `4396` | 60 min / 60 s; use `23076`, summon candidate `4073` has event-start bit | 20 min / 60 s; direct `4073`, no event-start bit | 60 min / 60 s; direct `4073`, **no** event-start bit | Era is a deferred-use candidate. Forever's record differs from Arcanite, so do not generalize the exception across all dragonlings. |
| Mithril Mechanical Dragonling `10576` | 60 min / 60 s; use `23075`, summon candidate `12749` has event-start bit | 20 min / 60 s; direct `12749`, no event-start bit | 60 min; dummy `23075`, candidate `12749` duration 60 s but no event-start bit | Same caution; a shared item name/family is insufficient. |
| Gnomish Battle Chicken `10725` | 30 min / candidate 90 s; category 2267 / 30 min | 20 min / 90 s; category 94 / 90 s | 30 min / candidate 90 s; category 2267 / 30 min | No event-start bit on the reviewed activation/summon candidates. Do not assume the Dragonling failure. |
| Barov Peasant Callers `14022`, `14023` | 10 min / 20 s; category 94 / 60 s | Same | Linked use records: 6 min / 20 s; category override is 60 s for `14022`, 20 s for `14023` | Forever ItemSparse rows missing in the sample; names are matched from Era/TBC. Linked effects do not prove acquisition/availability. |
| Defender of the Timbermaw `21326` | 10 min / 40 s; category 94 / 60 s | Same | **5 min / 20 s**, category 94 / 20 s | A verified numeric version difference; no event-start bit in the reviewed use spell `26066`. |
| Vanquished Tentacle of C'Thun `21579` | 3 min / 30 s, spell `26391` | Same | Same | Candidate for successful-summon evidence and persistence testing, not currently proven to need deferred cooldown handling. |
| Cannonball Runner `13382` | **5 min / 10 s**, spell `6251`, category 1141 / 10 s | Same | Same linked metrics; ItemSparse missing | Attachment's 20–30-second estimate is not the sampled spell duration. Live turret behavior/persistence remains unknown. |
| Book of the Dead `13353`, Ancient Cornerstone Grimoire `17067` | Off-hand; 15 min / 60 s; spell `17490`, category **94 / 60 s** | Same | Same linked metrics; ItemSparse missing | They do have a shared category record. The common spell ID must not be used as a unique item identity. |
| SoD Ancient Cornerstone Grimoire `228955` | **5 min / 60 s**, spell `17490`, category 94 / 60 s | Not found in these ItemSparse samples | Linked 5 min / 60 s effect; ItemSparse missing | Separate item policy/metrics from `17067`, even if they share an effect handler. Client-file presence does not make it usable on Era/Hardcore realms. |
| SoD Domesticated Attack Chicken `215461` | **30 min / 90 s**, spell `436069`, category 2267 / 30 min | Not found in these ItemSparse samples | Not established as available | Attachment omitted its ID and gave 10 min; sampled data differs. |

Do not encode shared cooldowns as `sharedGuardianCD=true/false`. The records contain category IDs and source-dependent durations: 94, 2267 and 1141 are materially different in this list. ItemRack should observe the actual paired cooldown and preserve its verified-use safeguards rather than replacing them with a guessed one-minute family timer.

## General item cases beyond trinkets

| Candidate | Confirmed static metrics | What needs a usage rule or acceptance test |
|---|---|---|
| Gnomish Death Ray `10645` | Spell `13278`, 4-second channel, 5-minute item cooldown in all samples | Distinguish channel start, successful completion and interruption. Existing casting guards may already cover safe equipment timing; prove the missing behavior before adding another guard. |
| Goblin Dragon Gun `10727` | Spell `13183`, 10-second channel, 5-minute cooldown in all samples | Another channel candidate; outcome spells need their own correlation, not “any player cast succeeded.” |
| Circle of Flame `11808`; SoD `227973` | Head slot, 10-second channels. Base item: 5 min; SoD item: 3 min in Era data | Direct non-trinket example. Same name/slot does not mean identical cooldown or ruleset applicability. |
| SoD Miniaturized Combustion Chamber `213347` | Spell `435167`, 10-second channel, 30-minute cooldown | Add to channel acceptance matrix, not an assumed fire-and-forget list. |
| Glimmering Naaru Sliver `34430` | TBC: spell `45052` (Evocation), 8-second channel, 5-minute cooldown | TBC-specific channel example. |
| Gnomish Mind Control Cap `10726` | Head slot; dummy spell `13180`, 30-minute cooldown | Target/pet/charm success, failure and tether behavior cannot be established from the dummy row. `UnitExists('pet')` alone is unsafe: a hunter/warlock's unrelated permanent pet could block the helmet indefinitely. Correlate the specific effect and controlled unit. |
| Don Carlos' Famous Hat `38506` | TBC: spell `51149`, **1,500 ms item cooldown**, indefinite spell duration | Pet/companion tether is a live check; attachment's “no cooldown”/later toy values are not this item-effect record. Do not require this companion to remain active forever unless the owner explicitly wants that policy. |
| Skull of Impending Doom `4984` | Off-hand; spell `5024` (Flee), 5-minute cooldown, 10-second aura | Identify the aura by spell ID, not item name. Deliberate manual cancellation must remain possible; verify the claimed unequip tether before enforcing it. |
| Furbolg Medicine Pouch `16768` | Off-hand; spell `20631`, 20-minute cooldown, 10-second effect | Verify whether early unequip affects the healing; no automatic IMMEDIATE classification from duration alone. |
| Goblin/Gnomish Rocket Boots `7189`/`10724` | Feet; 20-second effects. Goblin: 5 min. Gnomish: **30 min Era/Forever, 15 min TBC** | Failed/backfire/destruction outcomes and identity changes. TBC also adds a 5-minute category-1203 cooldown to the sampled boots. |
| Goblin Mortar `10577` | Spell `13237`, 10-minute cooldown, **6 charges** | Charge consumption, depleted/recharged item identity and failed target use. This is not just a cooldown problem. |
| Dog Whistle `3456` | Bag item, spell `9515`, **10-minute cooldown**, charge field `-3`; nominal summon 10 min in Era/TBC, 3 min in Forever's spell | Not a gear slot. Attachment's “no cooldown” is incorrect. Negative charge sign carries consumption semantics; it is not a negative number of usable charges. No new bag-automation scope is authorized by this research. |
| Six Demon Bag `7734` | Dummy `14537`; **30-minute cooldown Era/Forever, 3-minute TBC** | Outcome-specific evidence for random spell/CC/summon; no single active duration. A cooldown can confirm activation without proving which outcome occurred. |
| Horned Viking Helmet `9394` | Spell `22641`, **30-minute cooldown** across linked samples | Attachment says 10 min. It shares use spell `22641` with Goblin Rocket Helmet `10588`, whose item override is **20 min**. A cast ID alone cannot identify which item was used. |
| The Black Book `19337` | Spell `23720` (Blessing of the Black Book), 5-minute cooldown, 30-second effect | Pet-side effect tracking; safe unequip/persistence claims need observation. |
| Pendant of the Violet Eye `28727` | TBC: `29601` (Enlightenment), 2-minute cooldown, 20-second window | Track trigger/stack effects and whether they depend on remaining equipped. Not a confirmed universal exception on other clients. |
| Gyromatic Experiment 420b `213348` | SoD: dummy `435900`, **30-minute cooldown**, no direct duration row | Attachment's 3 min/standard 20-second haste description is not established by these records. Inspect actual outcomes before choosing any policy. |
| Serpent-Coil Braid `30720` | TBC equip effect `37447` (Improved Mana Gems), not an ordinary item on-use spell | Existing `CooldownProxies` already maps mana-gem gating and Mana Surge (`37445`). Fold that mechanism into a future shared registry only with equivalent behavior/regressions; do not add duplicate logic. |

Additional scan matches include SoD channel variants, jewelcrafting figurines, consumable summons and quest/dev items. Only reviewed, available, reproducibly problematic cases should become enabled rules. A matching attribute/name is a discovery lead, not automatic runtime authorization.

## Corrections required before adopting the supplied reference

1. **Its fire-and-forget class assumes immediate cooldown start**, but Arcanite's reviewed Era/Forever records support the opposite. Summon persistence, cooldown start, and swap timing are independent dimensions.
2. **Off-hand summons are not outside all shared categories.** `13353`, `17067` and `228955` contain category 94 / 60-second overrides. Barov also uses category 94, contrary to the example's `sharedGuardianCD=false`.
3. **Guardian shared cooldowns are not universally one minute.** Battle Chicken's Era/Forever category differs from TBC, as do Timbermaw and Barov overrides in Forever.
4. **The numeric corrections above matter.** Examples: SoD Grimoire 5 min, Domesticated Attack Chicken 30 min, Gyromatic Experiment 30 min, Horned Viking Helmet 30 min, Dog Whistle 10 min, and Six Demon Bag 30 min in Era versus 3 min in TBC.
5. **“Safe to unequip” does not authorize an in-combat equipment action.** Armor/trinket restrictions, secure weapon paths, cast/channel state, cursor ownership and transaction locking remain separate from effect policy. A held off-hand is not automatically equivalent to a weapon for every protected-action rule. Do not implement a universal `GCD_SLOT` bypass.
6. **There is no established universal 30-second equip penalty for every on-use item.** Preserve the existing observed equip-penalty classifier instead of manufacturing penalties from this reference.
7. **A pet's existence does not establish that a particular item is tethered.** Match effect identity, owner and the unit involved. A summon/SpellEffect number alone does not prove that unequipping is safe.
8. **Raw DB2 SpellEffect classification is an offline tooling capability.** The documented [C_Item.GetItemSpell](https://raw.githubusercontent.com/Gethe/wow-ui-source/classic/Interface/AddOns/Blizzard_APIDocumentationGenerated/ItemDocumentation.lua) returns a spell name and ID, not raw DB2 effects or server tether rules. Do not assume a runtime API can classify every custom item automatically.
9. **Same names/spells are not interchangeable items.** SoD's Grimoire has its own cooldown; two helmets share a use spell; different items/enchants/runes and queue owners need independent runtime evidence.
10. **“Anniversary” is not itself an immutable item-mechanics version.** Use supported client build/project and seasonal/ruleset evidence, not realm branding alone.

## Proposed shared item-rule design, pending approval

Use one item-wide mechanism across supported clients, with separate, composable facts rather than a single IMMEDIATE/HOLD/GCD policy:

- **Applicability:** item ID, client family/build range, optional seasonal variant and required API capability. Keep acquisition availability distinct from a data record's presence.
- **Activation evidence:** item-bound spell, observed success/trigger aliases, player source, pending use token, exact item/slot and queue owner. Record failed/interrupted/duplicate/ambiguous outcomes explicitly.
- **Cooldown start:** immediate, deferred-until-event, or a dependency on another item. Store native observations separately from expected durations; a zero sample during deferred start is not proof of readiness.
- **Effect lifetime:** player aura, pet/guardian identity, channel, stack trigger, or none. Equipment tether is a separate verified property, not implied by summon duration.
- **User intent:** a rule can release ordinary temporary protection after confirmed use; explicit persistent holds, Pause Queue and configured delays retain their meaning. A deliberate manual replacement must not be blocked merely because an unrelated guardian/pet remains.
- **Eligibility:** prevent a confirmed-used, cooldown-pending item from immediately reentering the queue. Do not fake a cooldown start or ready notification. Reconcile native cooldown publication, item replacement, death/dismissal, set/context changes and reload uncertainty.
- **Execution:** continue through the existing secure/protected-action and transaction engine. Item-specific evidence must not directly perform equipment operations.
- **Diagnostics:** identify rule/build, evidence source, item and effect IDs, pending/native cooldown state, and reason for holding/releasing. Bound retention; avoid chat spam by default.

Start with Arcanite Dragonling's Era/Forever behavior and an unchanged TBC control case. Add Era Mechanical/Mithril Dragonlings only after verifying their actual success events. Audit the existing generic casting/aura/proxy paths against channel and dependency cases before adding redundant exceptions. Other summons and tether assertions remain a reviewed backlog.

Do not extend one 0.75-second ordinary-use retry to cover all minute-long guardian lifetimes. Use a separate, bounded evidence state for verified special cases so failed ordinary clicks and paired-trinket hooks cannot be retroactively accepted.

## Evidence and acceptance gates before implementation/publication

For each enabled item/client rule, capture:

1. Exact `GetBuildInfo()`, addon version, seasonal realm/ruleset, item link/full identity, item-bound spell name/ID and equipped slot.
2. Timestamped use attempt, successful/failed/interrupted player casts, relevant summon/entity events, raw slot/item cooldown samples and authoritative observations. Capture the cast alias actually emitted; do not assume crafting spell `19830` is the activation.
3. Immediate activation, failed use, shared cooldown only, equip penalty, duplicate hooks, zero/disabled/late samples and two same-spell items. A spell match without a recent compatible item intent is insufficient when the mapping is ambiguous.
4. Summon duration, early death/dismissal, manual unequip and whether the effect/pet remains. For channels, record start/success/stop/interruption separately; for stacking effects, verify stack generation after an attempted swap.
5. Priority/non-priority, custom Swap In, temporary/persistent holds, Pause/Delay, global/per-set/mirrored queues and context changes. Verify terminal gear and pending state, not only a request being submitted.
6. Combat/OOC legality, existing weapon-only secure path, item locks, cursor/targeting ownership, full bags, repeated use and reload/relog while cooldown start is pending.

Follow `docs/TESTING.md`: reproduce through actual production functions before correction, retain a named failing-before/passing-after regression in the existing focused suites, then run `npm.cmd test`. Synthetic success events verify policy, not that the actual client emits them. No item is marked live-verified by this research.

## Regression explanation for the reporter

Suggested first-person wording, **not posted**:

> By regression I mean something that worked before breaking after a later change. Regression coverage means I've added automated tests based on your example so future changes are checked against that behavior. It doesn't mean beta10 has introduced another problem, and it isn't curve fitting. Your reports help turn one-off fixes into checks that keep protecting the same behavior later.

## Resume point

- Beta10 is already published; do not retag or edit it.
- The shared framework was subsequently approved and implemented on dev. Local installation, publication and a GitHub reply have not been performed for it.
- Next evidence: acquire the missing live trace before treating event aliases and unequip behavior as confirmed. Usage receipts currently remain runtime-only; reload before cooldown publication is an explicit limitation.
- Research files are intentionally under `docs/`; do not recreate `.rules` or add root documentation clutter.
