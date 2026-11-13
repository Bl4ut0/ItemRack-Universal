local Special = ItemRack.SpecialItems
if Special.Client.family~="forever" then return end
function Special.LoadCatalog()
Special.Rules = {
	[16022]={name="Arcanite Dragonling",enabled=true,slots={[13]=true,[14]=true},
		activation={itemSpell=19804,successSpells={[19804]=true},windowSeconds=0.75},
		cooldown={start="deferred",seconds=3600,minimumOwnSeconds=120,reviewAfterSeconds=90,category=94,categorySeconds=60},
		effect={kind="guardian",seconds=60,hold=false},source="1.60.1.70938; live event acceptance pending"},
	[4396]={name="Mechanical Dragonling",enabled=false,slots={[13]=true,[14]=true},
		cooldown={start="native",seconds=3600,category=94,categorySeconds=60},effect={kind="guardian",seconds=60,hold=false},
		reason="No event-start bit in sampled data; do not inherit Arcanite's exception"},
	[10576]={name="Mithril Mechanical Dragonling",enabled=false,slots={[13]=true,[14]=true},
		cooldown={start="native",seconds=3600,category=94,categorySeconds=60},effect={kind="guardian",seconds=60,hold=false},
		reason="Dummy activation needs live evidence; no event-start bit on candidate summon"},
	[10645]={name="Gnomish Death Ray",enabled=false,slots={[13]=true,[14]=true},
		cooldown={start="native",seconds=300},effect={kind="channel",seconds=4,spells={[13278]=true},hold=true},
		reason="Audit existing channel protection before enabling another hold"},
	[10726]={name="Gnomish Mind Control Cap",enabled=false,slots={[1]=true},
		cooldown={start="native",seconds=1800},
		reason="Specific controlled-unit/aura tether unverified; never hold for any unrelated pet"},
}
Special.BuildIndex()
end
Special.RefreshCatalog()
