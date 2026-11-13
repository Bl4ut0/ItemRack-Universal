-- Only this client allocates these records. Inventory slots, not InventoryType IDs.
local Special = ItemRack.SpecialItems
if Special.Client.family~="era" then return end
function Special.LoadCatalog()
Special.Rules = {
	[16022]={name="Arcanite Dragonling",enabled=true,slots={[13]=true,[14]=true},
		activation={itemSpell=23074,successSpells={[19804]=true},windowSeconds=0.75},
		cooldown={start="deferred",seconds=3600,minimumOwnSeconds=120,reviewAfterSeconds=90,category=94,categorySeconds=60},
		effect={kind="guardian",seconds=60,hold=false},source="1.15.8.67156 / 1.15.9.70576; live event acceptance pending"},
	[4396]={name="Mechanical Dragonling",enabled=false,slots={[13]=true,[14]=true},
		activation={successSpells={[4073]=true},windowSeconds=0.75},
		cooldown={start="deferred",seconds=3600,minimumOwnSeconds=120,reviewAfterSeconds=90,category=94,categorySeconds=60},
		effect={kind="guardian",seconds=60,hold=false},reason="Confirm live summon success and unequip behavior before enabling"},
	[10576]={name="Mithril Mechanical Dragonling",enabled=false,slots={[13]=true,[14]=true},
		activation={successSpells={[12749]=true},windowSeconds=0.75},
		cooldown={start="deferred",seconds=3600,minimumOwnSeconds=120,reviewAfterSeconds=90,category=94,categorySeconds=60},
		effect={kind="guardian",seconds=60,hold=false},reason="Confirm live summon success and unequip behavior before enabling"},
	[10645]={name="Gnomish Death Ray",enabled=false,slots={[13]=true,[14]=true},
		cooldown={start="native",seconds=300},effect={kind="channel",seconds=4,spells={[13278]=true},hold=true},
		reason="Audit existing channel protection before enabling another hold"},
	[17067]={name="Ancient Cornerstone Grimoire",enabled=false,slots={[17]=true},
		cooldown={start="native",seconds=900,category=94,categorySeconds=60},effect={kind="guardian",seconds=60,hold=false},
		reason="Unequip persistence and success event require live acceptance"},
}
-- SoD shares Era client data; seasonal rows are not allocated on other rulesets.
if ItemRack.IsEngravingActive and ItemRack.IsEngravingActive() then
	Special.Rules[228955]={name="Ancient Cornerstone Grimoire (SoD)",enabled=false,slots={[17]=true},
		cooldown={start="native",seconds=300,category=94,categorySeconds=60},effect={kind="guardian",seconds=60,hold=false},
		reason="Separate seasonal ID/cooldown; live acceptance pending"}
	Special.Rules[213347]={name="Miniaturized Combustion Chamber",enabled=false,slots={[13]=true,[14]=true},
		cooldown={start="native",seconds=1800},effect={kind="channel",seconds=10,spells={[435167]=true},hold=true},
		reason="Audit existing channel protection before enabling another hold"}
end
Special.BuildIndex()
end
Special.RefreshCatalog()
