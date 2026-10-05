# ItemRack — Universal Classic Edition

ItemRack is an equipment-set, quick-swap, event, and cooldown-queue addon for World of Warcraft Classic clients.

One release archive supports:

- Classic Era, Hardcore, and Season of Discovery
- Burning Crusade Classic Anniversary
- WoW Forever/Camelot

There are no separate Forever and TBC editions. Every client uses the same `ItemRack-universal-{Version}.zip` and the same source tree.

## Supported clients

| Client family | Interface metadata | Common installation folder |
|---|---|---|
| Classic Era, Hardcore, Season of Discovery | `11508`, `11509` | `_classic_era_` |
| Burning Crusade Classic Anniversary | `20505`, `20506` | `_anniversary_` or `_classic_` |
| WoW Forever/Camelot | `11601`, `16001`, `AllowLoadGameType: camelot` | `_classic_beta_` |

ItemRack detects the APIs exposed by the running client. Legacy globals, modern `C_*` namespaces, missing UI helpers, and protected/secret-value differences are handled inside one shared compatibility layer.

## Installation

1. Download the newest ZIP from [GitHub Releases](https://github.com/Bl4ut0/ItemRack-Anniversary/releases) or [CurseForge](https://www.curseforge.com/wow/addons/itemrack-anniversary).
2. Extract it into the selected client's `Interface\AddOns` directory.
3. Confirm these two folders exist directly under `AddOns`:
   - `ItemRack`
   - `ItemRackOptions`
4. Restart the client or run `/reload`.

`ItemRackOptions` is ItemRack's load-on-demand configuration module. It is included in the same distribution and is not a separate addon download.

## Main features

- Save and equip full or partial gear sets.
- Bind sets and individual equipment slots to keys.
- Weapon-only set hotkeys equip during combat. Enable **Swap set weapons during combat** in Global Settings to also equip the weapon portion of full sets immediately and finish the remaining gear after combat. Combat presses equip rather than toggle; empty-slot and rune-specific weapon requests remain deferred.
- Add movable quick-access buttons from the character sheet.
- Open flyout menus containing compatible carried and banked items.
- Automatically equip sets for specializations, stances, mounting, movement, zones, buffs, drinking, and other events.
- Configure per-slot and per-set cooldown queues.
- Distinguish same-base items with different enchants, gems, suffixes, or runes.
- Defer restricted swaps safely through combat, casting, loading screens, and item locks.
- Use one-frame multi-item pipelining where the client permits it.

See [CONTROLS.md](CONTROLS.md) for the full mouse, keybinding, macro, and slash-command reference.

## Quick start

- `/itemrack opt` opens ItemRack Options.
- Right-click the minimap button to open Options.
- Left-click the minimap button to select a saved set.
- Alt-click an equipment slot on the character sheet to create or remove its quick-access button.
- Alt-click the character model to create or remove the set button.
- Use the **Sets** tab to save gear and assign specialization links.
- Use the **Events** tab to explicitly enable automatic triggers.
- Use the **Queue** tab to prioritize cooldown items.

Linking a set to a specialization does not silently approve every automatic behavior. Review and enable the corresponding event when you want ItemRack to control that transition.

## Script-event safety

Script events execute Lua with addon privileges. ItemRack therefore requires an explicit trust decision:

- A valid script saved through ItemRack's editor is approved for its exact name, trigger, and source.
- A script inserted or changed externally remains disabled until the player accepts ItemRack's warning prompt.
- Changing approved source invalidates the approval.
- Rejected or invalid external additions cannot persist through ItemRack's saved script-event path.

WoW addons share one Lua environment, so no addon can fully sandbox another hostile addon or WeakAura. Remove any untrusted addon or aura that introduced malicious code.

## Diagnostics and bug reports

1. Run `/itemrack debug`.
2. Reproduce the problem.
3. Run `/itemrack dump`.
4. Copy the generated report and review it before sharing.

The dump includes the ItemRack release version/build ID, client state, event ownership, equipment transactions, queues, locks, and recent diagnostic entries. It may contain set names and item information, but not account passwords.

Please include:

- Client family and client build
- ItemRack version
- Exact reproduction steps
- Expected and actual set names
- Relevant item links, enchants, gems, or runes
- Full Lua error text
- `/itemrack dump` output

Report issues at [GitHub Issues](https://github.com/Bl4ut0/ItemRack-Anniversary/issues) or on the [CurseForge comments page](https://www.curseforge.com/wow/addons/itemrack-anniversary/comments).

## Development

Run the complete gate from the repository root:

```powershell
npm.cmd ci
npm.cmd test
```

Every reproducible user-reported bug must receive a named permanent regression in the standard `npm test` gate. See [TESTING.md](TESTING.md) for the workflow and [BETA_TEST_CHECKLIST.md](BETA_TEST_CHECKLIST.md) for live-client acceptance checks.

Release builds are exported from immutable Git commits. The only supported artifact is `ItemRack-universal-{Version}.zip`; client-specific source branches and packages are retired. See [.agent/workflows/release.md](.agent/workflows/release.md).

## Credits

- Original ItemRack author: **Gello**
- Classic maintainers: **Rottenbeer** and **Roadblock**
- Anniversary and universal maintenance: **Bl4ut0**

This project builds on [ItemRack Classic](https://www.curseforge.com/wow/addons/itemrack-classic) and preserves the original addon's license.
