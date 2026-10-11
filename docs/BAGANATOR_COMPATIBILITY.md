# Suggested Baganator Forever support for ItemRack Universal

Reviewed supplied Baganator version: 834-2-g8c53fdf.

`API/EquipmentSets.lua:182` excludes Forever before registering the ItemRack
source. ItemRack Universal retains the `ItemRack` addon/module name,
`ItemRackUser.Sets`, `GetIRString`, and save/delete listener events, so renaming
the integration source is unnecessary. Tooltip settings do not control this
adapter. Production Lua checks confirm Forever skips registration while
Classic registers; ItemRack's save/delete listener contract passes.

Suggested starting patch (for Baganator upstream, not applied or bundled):

```diff
--- a/API/EquipmentSets.lua
+++ b/API/EquipmentSets.lua
@@
-if not addonTable.Constants.IsRetail and not addonTable.Constants.IsForever then
+if not addonTable.Constants.IsRetail and Syndicator then
@@
-          if ItemRack.AppendRuneID then
+          if ItemRack.AppendRuneID and C_Engraving
+              and type(C_Engraving.GetRuneForEquipmentSlot) == "function"
+              and type(C_Engraving.GetRuneForInventorySlot) == "function" then
```

The second change protects the adapter's direct engraving API calls on clients
without those APIs. Keep Retail excluded. Do not change Baganator's client flags
globally or impersonate Blizzard Equipment Manager sets.

Before merging, exercise the adapter's actual lookup callbacks with Syndicator:
initial sets, save/overwrite/delete refresh, internal-set exclusion, GUID lookup
for bags/equipment/open bank, two physical copies of a ring/trinket, changed
item-link context fields, wrong-enchant/gem copies, and SoD rune identities.
Its existing raw item-string comparisons and base-ID fallback need particular
attention: enabling Forever alone does not prove exact-copy consistency.
Verify optional engraving APIs and missing Syndicator, preserve native Blizzard
set sources, and test Classic Era/TBC as neighboring clients.

Live Forever acceptance must verify named categories, search and item badges
after reload and set edits, bank open/close, and gear swaps. No live acceptance
has been performed. The supplied Baganator folder is reference material and
must not be shipped inside the ItemRack release.
