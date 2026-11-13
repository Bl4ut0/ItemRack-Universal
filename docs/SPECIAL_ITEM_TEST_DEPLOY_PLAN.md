# Special-item recovery and test-deployment plan

Date: 2026-11-12. Status: **completed: GitHub-only beta11 published and linked to #33; community feedback pending**.
Owner requested a plan to resolve the framework's remaining limits and prepare
a build for users to test. The owner subsequently authorized finishing recovery and diagnostics, then a GitHub-only 4.59-beta11 dated 2026-11-12 for #33. No CurseForge submission or local installation is authorized for this candidate. This document is the resume point for that work.

The owner does not have these special items. Verify production Lua offline against extracted client data, API contracts and reported behavior; community users validate the candidate in game. Do not add fake items, an in-game simulator, or a test-mode requirement. Wago build data already establishes the sampled item/spell bindings and metrics; record only specific remaining gaps, not a blanket claim that item mechanics are unknown.

## Baseline and intended outcome

The framework on `dev` is described in
[SPECIAL_ITEM_RULES.md](SPECIAL_ITEM_RULES.md). Its last full `npm.cmd test` run
passed, including 132 catalog checks, 279 special-item runtime checks and 139 isolated-environment recovery checks.
Beta10 remains unchanged. No local framework installation was performed. Publication and delivery are recorded below.

The next test candidate should retain confirmed use through reload/relog,
recover without replaying a swap or changing queue ownership, and collect enough
evidence to determine how each client's actual item events behave. Only the
matching client catalog may be allocated. A public test candidate does not mean
that every researched special item has been enabled or accepted.

Two types of work remain: code-level lifecycle defects can be fixed and covered
by permanent regressions; live spell IDs, event order, summon persistence and
server cooldown timing must be measured in the client. Instrumentation enables
that measurement but does not establish the result by itself.

## Work order and completion tracker

| Step | Work | Completion requirement | Status |
|---|---|---|---|
| 1 | Versioned receipts and reload recovery | Fresh Lua environment restores valid confirmed use before automatic queue evaluation; no old intent or equipment action is replayed | Implemented; full gate passed |
| 2 | Unresolved-state recovery and cooldown transitions | Unknown, expired, reset and late observations have explicit outcomes; users can inspect and clear a stuck special receipt | Implemented; full gate passed |
| 3 | Bounded evidence capture | Successful and failed uses can be compared, including unexpected spell IDs and hook order | Implemented; full gate passed |
| 4 | Catalog lifecycle and execution policy | Late SoD detection works; other client tables stay unallocated; targeted Arcanite rule executes and unrelated research stays disabled | Implemented; full gate passed |
| 5 | Integrated regressions and documentation | Named fail-before/pass-after cases, complete standard test gate, both changelogs and guide updated | Implemented; full gate passed |
| 6 | Candidate artifact verification | Production-Lua gate and archive verification pass; document source-backed assumptions and community acceptance cases; no owner item testing required | Completed; see delivery record |
| 7 | User test deployment | Approved version/channel, immutable source and archive, installation/publication receipts, specific tester instructions | Completed; see delivery record |

Implement steps 1–5 together before packaging. Verify the code and artifact offline; then one coordinated GitHub-only beta can collect client/item-specific community evidence. Do not publish a separate beta for each research
row or enable all disabled rows just to enlarge coverage.

## 1. Persist confirmed use, never pending attempts

Use the dedicated per-character SavedVariables namespace,
`ItemRackUser.SpecialItemUsage`, with schema version 1. `ItemRackUser` is already
declared in the TOC. Store one receipt per base item ID, because native item
cooldowns and current runtime receipts are base-item scoped. Preserve the exact
used identity and slot as provenance; do not convert it into a queue entry.

Persist only confirmed use. Suggested record fields:

- Client family/ruleset, source Interface/build at store level, and rule revision (default 1).
- Positive base item ID, exact used identity and permitted equipment slot.
- Server-epoch confirmation time, phase, and last reconciliation time.
- If a real own cooldown was observed, its epoch expiry and observation provenance.
- A bounded diagnostic reason for unresolved/rejected recovery.

Use a validated `GetServerTime()` value for cross-session age. Do not save a
`GetTime()` timestamp as a portable deadline. A wall-clock fallback or missing
clock must be marked untrusted; it cannot silently establish readiness. Native
cooldown start/duration in a new session come from the existing cooldown
authority, not a conversion of an old session's uptime. Saved expiry is evidence
for reconciliation, not a fabricated cooldown sample.

Give the namespace and each record strict shape, finite-number, identity,
allowed-slot, clock and revision validation. Bound it to at most 32 records,
drawn from the selected catalog; do not allocate other client catalogs to
validate it. Same-family Interface updates/aliases may retain compatible rule
revisions; changed semantics need an explicit revision/recovery decision.
Reject incompatible families/rulesets, removed/disabled rules and malformed
records with diagnostic reasons. Preserve an unknown future schema unchanged
and disable special recovery/execution with a visible diagnostic status rather
than rewriting it as schema 1. Keep this isolated from ordinary settings and
queue/event migrations.

Write a confirmed receipt to the in-memory SavedVariables table before its
temporary-choice release is applied. WoW writes that table on normal
reload/logout; a process crash is not a guaranteed disk save. Keep it synchronized
when the real cooldown is observed, completes or is explicitly reset. Logout may
validate/compact but must not be the first time a receipt is stored.

### Restoration order and behavior

1. At login, after SavedVariables audit and selected-catalog refresh, validate
   receipts and stage recovery. Leave automation under the existing startup hold.
2. In `TryInitializeQueueState`, restore/reconcile staged records after the
   equipped snapshot is available and **before** queue-ready notifications,
   event-set reconciliation or automatic queue evaluation can select the item.
   Unresolved individual slots stay suspended under the existing slot policy.
3. A restored receipt applies to its used base item even if it is now in a bag
   or another compatible slot. Sample the item independently of queue traversal.
4. Do not restore a live intent, queue-list reference, cast token, generation,
   pending protected action or queue owner. Never clear a new manual choice,
   mark Burn on Use again, or equip gear merely because a receipt was loaded.
5. On ordinary world transitions retain valid confirmed use, cancel stale
   attempts, and observe again after settlement. Define arena/cache-reset
   behavior with the existing cooldown generation authority so a special
   receipt neither resurrects an old cooldown nor blocks a confirmed reset.

## 2. Define recovery without inventing readiness

| State/evidence | Intended outcome |
|---|---|
| Matching current intent plus accepted successful activation | Save confirmed `pending`; apply the original use effects once |
| Real eligible own cooldown | Change to `cooldown`; use normal thresholds and notification authority |
| Short shared/equip penalty | Keep pending; it is not evidence of the item's own cooldown |
| Pending beyond the review interval | Change to `unresolved`; record once, keep automatically excluded |
| Pending restored with a readable zero sample | Keep pending/unresolved; zero while a summon exists is not proof of readiness |
| Real cooldown completes in this session | Retire the receipt using the existing readable-expiration rules |
| Previously observed own cooldown expired while offline | Require stable readable post-login readiness from the existing authority before retiring; saved time alone is insufficient |
| Known arena/reset generation change | Reconcile through that authority's confirmed-reset rules; test pending and observed phases separately |
| Unknown/disabled/revised rule or unusable clock | Record the recovery rejection/review reason; do not infer use, replay actions or fabricate a cooldown |
| New independently confirmed use after an unresolved record | Replace it with fresh evidence; an unresolved record must not prevent observing a deliberate new activation |

Move the review-time transition into the lifecycle poll/reconciler. Readiness
and tooltip queries should read state without mutating it. Keep receipts and
diagnostic storage bounded. A cap or retention limit may discard obsolete
diagnostic data; it must not silently make an unresolved enabled item ready.

Provide explicit inspection/recovery commands, proposed syntax:

- `/itemrack special status`: show selected catalog, recovery mode and receipt
  phase/age/reason. This output is user-requested.
- `/itemrack special reset <itemID>`: clear only that item's special receipt
  from runtime and persistence; then allow the ordinary verifier to decide
  eligibility. Explain that this discards the special pending protection. It
  must not clear manual holds, reorder queues, force equipment, or announce
  that a real cooldown has ended. Keep a reset reason in diagnostics.

This prevents an unresolved record being silent and inescapable. Do not infer
guardian death or dismissal from any unrelated pet disappearing. A fixed
60-second timer must not manufacture activation, cooldown or readiness.

## 3. Capture the evidence a user can actually supply

Keep the small always-available decision history and add opt-in detailed capture
using the existing debug system, `/itemrack debug specialitems`.
Default chat stays quiet; detailed traces print only when existing debug chat
is explicitly enabled. Status/help should say whether capture is active.

The detailed capture must include public, sanitized values for:

- Addon version/build, client version/build/Interface, detected family/ruleset,
  rule revision, effective execution mode and detection timing.
- Use-hook source, item/exact ID, slot, queue scope, intent creation/expiry,
  current-generation/identity checks, and duplicate/ambiguity rejection reasons.
- Relative timestamp/sequence for player cast start, success, failure,
  interruption/stop and channel events while a relevant use is being traced.
  Capture unexpected public numeric spell IDs too: the current SpellIndex-only
  filter cannot diagnose a different spell ID. Logging one is not permission
  to treat it as activation evidence.
- Raw readable cooldown sample plus authority result, source, enable flag,
  own/shared classification and phase changes. Coalesce identical samples.
- Effect-hold decisions, receipt save/restore/rejection/reset, and the existing
  queue/transaction outcome. Correlate these; do not create another equip path.

Detailed capture uses 256 entries and a 120-second capture window per
explicit session, with a drop count and stop reason. Save at most 24 sanitized
recent lifecycle summaries for a requested reload test so the next dump can
explain where the restored receipt originated. Never persist live queue lists,
frame objects or arbitrary spell traffic. Include all relevant summaries in
`/itemrack dump`, with secret/unavailable values represented as unavailable.

Keep the strict current-intent requirement. Do not cache a standalone success
and reuse it after a later hook. If real evidence shows reverse ordering or
another event, revise the correlation design and add a negative reproduction
for stale success, paired slots and a new manual choice before accepting it.
Do not solve missing evidence by increasing the window until something matches.

## 4. Refresh only the selected catalog and control execution

Refactor each client data file into a guarded registration/factory. Only the
selected family may construct tables. Refresh it once at login and again after
world entry if the ruleset was initially unknown. Use the client's actual
engraving result for SoD; do not assume API presence means active SoD. Repeated
refreshes must be idempotent and must not reset confirmed use or rebuild queue
ownership. If the active rule revision changes, reconcile affected receipts.
An unsupported Interface still allocates no catalog.

The candidate executes the intended Arcanite deferred-use rule on Era/Forever using the researched activation bindings and the reporter's observation that it can be swapped out immediately after use. TBC retains its different native cooldown and Braid proxy. Keep other research rows disabled until their distinct use requirements are established from sources or reports. Diagnostics collect what happened without altering game state. No fake-item commands, in-game simulator, observation-only release gate or test-mode toggle is needed.

## 5. Permanent regressions and acceptance evidence

Extend `.tools/test_queue_runtime_lua.js` for owning queue/use behavior, and the
existing cooldown/inventory lifecycle suites where those integration paths
belong. Follow [TESTING.md](TESTING.md): exercise production Lua, real dispatch
and queue entry points, and retain fail-before evidence for reproducible limits.
Proposed named cases:

- `special-use-reload-before-native-cooldown`: confirm, serialize SavedVariables,
  load into a fresh Lua environment with a different uptime, initialize through
  real lifecycle functions, and prove the used item cannot be reselected early.
- `special-use-recovery-no-replay`: preserve new choices, persistent holds,
  switches and global/per-set/mirrored owners; no duplicate burn/use effect,
  pending equipment request or notification is created by restoration.
- `special-use-relog-native-expiry`: pending, observed, offline expiry, unknown
  samples, unavailable/backward clocks and reconnect with a still-active cooldown.
- `special-use-reset-generation`: ordinary zoning, arena entry/exit, confirmed
  cooldown reset and stale old-generation native samples.
- `special-use-store-validation`: corrupt/scalar/oversized records, wrong
  family/ruleset, supported Interface update, removed/disabled/revised rule,
  future schema preservation and bounded diagnostic rejection.
- `special-use-unresolved-recovery`: query purity, one review transition,
  explicit per-item reset, and a fresh actual use that supersedes old uncertainty.
- `special-use-trace-evidence`: unexpected spell ID, success-before-hook,
  failed/late/duplicate/paired-slot attempts, secret values, bounds, reload
  summaries, trace expiry and no routine chat output.
- `special-client-late-seasonal-detection`: API initially unavailable/false,
  later SoD, ordinary Era, TBC, Forever and unknown Interface; no other family's
  tables allocated and no repeated refresh side effects.


Repeat the meaningful outcome tests OOC and in combat, in slots 13/14 and a
synthetic off-hand rule, with global/per-set/mirrored queues and many saved sets.
Keep negative checks for buffs, Pause/Delay, persistent holds, cursor/locks,
failed use, shared cooldowns, recipe spells and exact-identity changes. Run
`npm.cmd test` after implementation. Update both changelogs, packaged guide,
framework status and the beta checklist with results and remaining evidence.

## 6. Community acceptance protocol

Record the exact build and mode for each test. Use the same universal artifact
for every supported client. For each Arcanite client/ruleset under test:

1. Enable the proposed capture command and collect a baseline dump. Record
   queue scope, exact item, replacement, slot, Swap In/Pause/Delay and holds.
2. Deliberately fail a use during equip/existing cooldown, then perform one
   valid use. Compare hook and event sequence. Failed use must retain protection.
3. With a ready replacement, verify the intended swap or combat-deferred request
   and inspect whether the summon survives. A disappearing/cancelled summon is
   evidence against enabling immediate replacement on that combination.
4. Repeat without swapping, after early summon death, and over its full lifetime.
   Capture when the real cooldown actually starts; expected duration is metadata.
5. Reload while pending, while native cooldown is active, and after it expires;
   relog at those boundaries where practical. Confirm correct restoration,
   no early automatic reselection and no duplicate notification/action.
6. Repeat relevant queue scopes and paired-slot uses. Inspect breakouts, quick
   buttons, set matching and custom icons for ordinary behavior; this framework
   must not regress the existing combat menu fixes.
7. Capture the final dump before disabling capture. Report missing/restricted
   events, observed summon behavior, error text and the exact action sequence.

TBC's native Arcanite and Braid remain control checks. Era/SoD and Forever must
each load and select only their catalog; unavailable items are marked untested,
not passed. Model-only, local-client and reporter evidence are separate columns
in the acceptance record. The GitHub-only beta gathers additional live evidence; the owner does not need to supply these items or level characters on each platform.

## 7. Deployment and resume procedure

After steps 1–5, review and commit the framework, recovery, tests and docs on `dev`, including new source files. Run the full production-Lua test gate and verify an immutable beta11 archive. Add an explicit, regression-tested GitHub-only distribution policy that prevents both automatic and manual CurseForge upload for this candidate. Normal release behavior must remain intact. Follow the release workflow with that documented channel exception.

The owner authorized GitHub-only 4.59-beta11 dated 2026-11-12 after recovery and diagnostics, with a link supplied to neferens on #33. Check tag availability and exact source before publishing. Do not install local clients or submit to CurseForge. The candidate may proceed after code and packaging checks pass; owning a special item or obtaining live acceptance first is not required. Describe community checks as pending without weakening the established source-backed mechanics.

For any test artifact, record source commit/tree, archive hash, versions, client
destinations, enabled rules and exact results. Accepted candidates/tags are
immutable. Corrections go on `dev` into a new candidate; do not patch a published
archive or retag beta10.

On resuming: read this tracker, `git status --short`, the framework guide and
latest test evidence. Start with step 1. Update status and evidence per completed
step; do not mark live-only cases complete from synthetic checks. Update the implementation status as work lands; planning text alone does not resolve runtime limits.

Implementation evidence: standard gate passed on 2026-11-12. Source-backed Arcanite bindings and timings are recorded in SPECIAL_ITEM_USAGE_RESEARCH.md. No test-only production mode, fake item or in-game simulator was implemented. GitHub-only distribution is part of the immutable TOC; the workflow skips its CurseForge job and the verifier also refuses direct/manual upload. Exact beta commit/hash, URL and issue comment are recorded below.

## Candidate delivery — completed

- Candidate: [v4.59-beta11](https://github.com/Bl4ut0/ItemRack-Universal/releases/tag/v4.59-beta11), dated 2026-11-12; published as a GitHub prerelease, not Latest.
- Source commit: `b01e6d301eb3c8c994ecd21a8f9e8866f0f20ab3`; implementation commit `90cc0a1bff37535e072d92ab355b4e6bc9b52d8f`. The accepted tag and archive are immutable.
- Archive: `ItemRack-universal-4.59-beta11.zip`, 346412 bytes, 50 addon files. SHA-256: `f280e8c95ff932f217cae80b69c94ef7003898e53a4becff0e48b4d0cc1fc5bd`. GitHub's uploaded asset digest matches.
- Code gate: `npm.cmd ci` then full `npm.cmd test` passed; release-metadata gate passed again for beta11. Includes 132 catalog, 279 use/queue runtime and 139 isolated-environment recovery checks (550 specific special-item checks), plus the existing full addon suite.
- Artifact verification: exact tag/tree/blob checks passed, both addon folders and four new modules present, offline harness absent; the actual tagged ZIP is refused by the CurseForge verifier.
- [Distribution workflow 43367542816](https://github.com/Bl4ut0/ItemRack-Universal/actions/runs/43367542816): `release-policy` succeeded; `verify-and-deploy` skipped. No CurseForge submission or file was created by this release.
- [Reporter delivery on #33](https://github.com/Bl4ut0/ItemRack-Universal/issues/33#issuecomment-6844325646): direct ZIP, expected Arcanite behavior, debug/status/reset commands, optional reload report and explanation of software regression posted in the owner's voice.
- Local client installs: none. Development TOCs restored to Dev after successful publication; future ordinary releases retain the normal distribution route.
- Remaining work: await community results for the real item interaction and use those reports for any correction. Do not require special-item characters from the maintainer. Other catalog exceptions remain disabled pending their own source/rule validation.

## Beta12 follow-up — published and delivered

On 2026-11-13 the owner requested GitHub-only beta12 with the full reviewed list and both debug commands working. The selected catalogs now contain 27 Era gear entries plus five SoD variants, 31 TBC and 26 Forever entries (36 distinct gear IDs). Five distinct bag-only IDs are reference data, never equipment rules. Shared handlers cover the applicable native, deferred, channel, aura and proxy policies; native/random/charged/companion records do not claim unsupported outcome or indefinite companion holds. Full source metrics and coverage are checked in the existing focused suite. `core-debug-starts-special-capture` fails with beta11 core source and passes with the unified command flow; expiry/rearm/chat/clear behavior is covered. No local installation or CurseForge submission is requested; keep beta11 immutable. Delivery is recorded below. Beta11 remains immutable.

### Beta12 delivery receipt

- [GitHub-only v4.59-beta12](https://github.com/Bl4ut0/ItemRack-Universal/releases/tag/v4.59-beta12), dated 2026-11-13; prerelease, not Latest. No CurseForge submission or local installation.
- Source commit `d19b4ea293fd4246c9bf5e4f35f2b961dd463df2`; catalog/debug implementation `0b57c66`, modern aura compatibility `9f23a9b`.
- Archive `ItemRack-universal-4.59-beta12.zip`, 351104 bytes, 50 addon files. SHA-256 `08e444e1f8d7cbf0d3e6f5e4962f0a227c18b3aba036d93ec31946d9d1a51901`; published asset digest matches. Source-tree/ZIP verification passed and the actual tagged archive was refused by the CurseForge verifier before network.
- Full `npm.cmd test` passed on beta12 metadata after the modern aura fix, with 3,210 focused checks (490 catalog, 426 use/queue, 139 recovery, 2,144 source/effect and 11 debug-command checks). Both master-debug and no-legacy-aura failure paths were demonstrated against their pre-fix production source.
- [Workflow 43372913320](https://github.com/Bl4ut0/ItemRack-Universal/actions/runs/43372913320): release-policy succeeded; verify-and-deploy skipped.
- [Delivered to neferens on #33](https://github.com/Bl4ut0/ItemRack-Universal/issues/33#issuecomment-6845120233) with direct ZIP and either-command capture instructions.
- Dev TOCs restored after publication; tag/archive unchanged. Community in-client feedback remains the next input; the owner is not required to acquire special items.
