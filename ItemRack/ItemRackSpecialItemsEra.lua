-- Exceptions to ordinary on-use handling only. Source: 1.15.8.67156 / 1.15.9.70576.
-- Cooldown/effect durations are metadata; the live API remains authoritative.
local Special = ItemRack.SpecialItems
if Special.Client.family~="era" then return end
function Special.LoadCatalog()
	Special.CatalogSource={builds="1.15.8.67156 / 1.15.9.70576",label="era-11509"}
	Special.Rules = {
		[4396]={name="Mechanical Dragonling",enabled=true,revision=1,slots={[13]=true,[14]=true},useSpell=23076,cooldown={start="deferred",seconds=3600.0,category=94,categorySeconds=60.0,minimumOwnSeconds=120,reviewAfterSeconds=90},effect={kind="guardian",seconds=60.0,hold=false},itemData="sparse",activation={itemSpell=23076,successSpells={[23076]=true,[4073]=true},windowSeconds=0.75}},
		[10576]={name="Mithril Mechanical Dragonling",enabled=true,revision=1,slots={[13]=true,[14]=true},useSpell=23075,cooldown={start="deferred",seconds=3600.0,category=94,categorySeconds=60.0,minimumOwnSeconds=120,reviewAfterSeconds=90},effect={kind="guardian",seconds=60.0,hold=false},itemData="sparse",activation={itemSpell=23075,successSpells={[23075]=true,[12749]=true},windowSeconds=0.75}},
		[10726]={name="Gnomish Mind Control Cap",enabled=true,revision=1,slots={[1]=true},useSpell=13180,cooldown={start="native",seconds=1800.0,category=0,categorySeconds=0.0},effect={kind="aura",unit="pet",spells={[13181]=true},hold=true},itemData="sparse",notes="Only the cap charm aura on the controlled pet holds; an unrelated pet is never sufficient."},
		[16022]={name="Arcanite Dragonling",enabled=true,revision=1,slots={[13]=true,[14]=true},useSpell=23074,cooldown={start="deferred",seconds=3600.0,category=94,categorySeconds=60.0,minimumOwnSeconds=120,reviewAfterSeconds=90},effect={kind="guardian",seconds=60.0,hold=false},itemData="sparse",activation={itemSpell=23074,successSpells={[23074]=true,[19804]=true},windowSeconds=0.75}},
	}
	Special.BuildIndex()
end
Special.RefreshCatalog()
