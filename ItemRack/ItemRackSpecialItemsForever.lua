-- Exceptions to ordinary on-use handling only. Source: 1.60.1.70938.
-- Cooldown/effect durations are metadata; the live API remains authoritative.
local Special = ItemRack.SpecialItems
if Special.Client.family~="forever" then return end
function Special.LoadCatalog()
	Special.CatalogSource={builds="1.60.1.70938",label="forever-16001"}
	Special.Rules = {
		[10726]={name="Gnomish Mind Control Cap",enabled=true,revision=1,slots={[1]=true},useSpell=13180,cooldown={start="native",seconds=1800.0,category=0,categorySeconds=0.0},effect={kind="aura",unit="pet",spells={[13181]=true},hold=true},itemData="sparse",notes="Only the cap charm aura on the controlled pet holds; an unrelated pet is never sufficient."},
		[16022]={name="Arcanite Dragonling",enabled=true,revision=1,slots={[13]=true,[14]=true},useSpell=19804,cooldown={start="deferred",seconds=3600.0,category=94,categorySeconds=60.0,minimumOwnSeconds=120,reviewAfterSeconds=90},effect={kind="guardian",seconds=60.0,hold=false},itemData="sparse",activation={itemSpell=19804,successSpells={[19804]=true},windowSeconds=0.75}},
	}
	Special.BuildIndex()
end
Special.RefreshCatalog()
