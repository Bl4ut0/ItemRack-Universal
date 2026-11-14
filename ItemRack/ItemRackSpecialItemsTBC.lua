-- Exceptions to ordinary on-use handling only. Source: 2.5.5.65463 / 2.5.6.70577.
-- Cooldown/effect durations are metadata; the live API remains authoritative.
local Special = ItemRack.SpecialItems
if Special.Client.family~="tbc" then return end
function Special.LoadCatalog()
	Special.CatalogSource={builds="2.5.5.65463 / 2.5.6.70577",label="tbc-256"}
	Special.Rules = {
		[10726]={name="Gnomish Mind Control Cap",enabled=true,revision=1,slots={[1]=true},useSpell=13180,cooldown={start="native",seconds=1800.0,category=0,categorySeconds=0.0},effect={kind="aura",unit="pet",spells={[13181]=true},hold=true},itemData="sparse",notes="Only the cap charm aura on the controlled pet holds; an unrelated pet is never sufficient."},
		[30720]={name="Serpent-Coil Braid",enabled=true,revision=1,slots={[13]=true,[14]=true},itemData="sparse",proxy={id=22044,buff=37445}},
	}
	Special.BuildIndex()
end
Special.RefreshCatalog()
