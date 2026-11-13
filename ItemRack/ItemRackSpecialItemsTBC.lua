-- Reviewed client-specific catalog. Source: 2.5.5.65463 / 2.5.6.70577.
-- Cooldown/effect durations are metadata; the live API remains authoritative.
local Special = ItemRack.SpecialItems
if Special.Client.family~="tbc" then return end
function Special.LoadCatalog()
	Special.CatalogSource={builds="2.5.5.65463 / 2.5.6.70577",label="tbc-256"}
	Special.Rules = {
		[4396]={name="Mechanical Dragonling",enabled=true,revision=1,slots={[13]=true,[14]=true},useSpell=4073,cooldown={start="native",seconds=1200.0,category=94,categorySeconds=60.0},effect={kind="guardian",seconds=60.0,hold=false},itemData="sparse"},
		[4984]={name="Skull of Impending Doom",enabled=true,revision=1,slots={[17]=true},useSpell=5024,cooldown={start="native",seconds=300.0,category=0,categorySeconds=0.0},effect={kind="aura",seconds=10.0,hold=true,unit="player",spells={[5024]=true}},itemData="sparse"},
		[7189]={name="Goblin Rocket Boots",enabled=true,revision=1,slots={[8]=true},useSpell=8892,cooldown={start="native",seconds=300.0,category=1203,categorySeconds=300.0},effect={kind="aura",seconds=20.0,hold=true,unit="player",spells={[8892]=true}},itemData="sparse"},
		[7734]={name="Six Demon Bag",enabled=true,revision=1,slots={[13]=true,[14]=true},useSpell=14537,cooldown={start="native",seconds=180.0,category=1141,categorySeconds=10.0},effect={kind="variable",hold=false},itemData="sparse",notes="Native cooldown verifies use; the dummy/random outcome does not supply a unique aura or fixed hold timer."},
		[9394]={name="Horned Viking Helmet",enabled=true,revision=1,slots={[1]=true},useSpell=22641,cooldown={start="native",seconds=1800.0,category=0,categorySeconds=0.0},effect={kind="native",hold=false},itemData="sparse"},
		[10576]={name="Mithril Mechanical Dragonling",enabled=true,revision=1,slots={[13]=true,[14]=true},useSpell=12749,cooldown={start="native",seconds=1200.0,category=94,categorySeconds=60.0},effect={kind="guardian",seconds=60.0,hold=false},itemData="sparse"},
		[10577]={name="Goblin Mortar",enabled=true,revision=1,slots={[13]=true,[14]=true},useSpell=13237,cooldown={start="native",seconds=600.0,category=1141,categorySeconds=10.0},effect={kind="native",seconds=3.0,hold=false},itemData="sparse",charges=6,notes="Charge/outcome changes use native cooldown and existing item-identity reconciliation; no charge count is inferred from cast success."},
		[10588]={name="Goblin Rocket Helmet",enabled=true,revision=1,slots={[1]=true},useSpell=22641,cooldown={start="native",seconds=1200.0,category=1180,categorySeconds=0.0},effect={kind="native",hold=false},itemData="sparse"},
		[10645]={name="Gnomish Death Ray",enabled=true,revision=1,slots={[13]=true,[14]=true},useSpell=13278,cooldown={start="native",seconds=300.0,category=1141,categorySeconds=10.0},effect={kind="channel",seconds=4.0,hold=true,spells={[13278]=true}},itemData="sparse"},
		[10716]={name="Gnomish Shrink Ray",enabled=true,revision=1,slots={[13]=true,[14]=true},useSpell=13006,cooldown={start="native",seconds=300.0,category=0,categorySeconds=0.0},effect={kind="variable",hold=false},itemData="sparse",notes="Native cooldown verifies use; the dummy/random outcome does not supply a unique aura or fixed hold timer."},
		[10720]={name="Gnomish Net-o-Matic Projector",enabled=true,revision=1,slots={[13]=true,[14]=true},useSpell=13120,cooldown={start="native",seconds=600.0,category=0,categorySeconds=0.0},effect={kind="variable",hold=false},itemData="sparse",notes="Native cooldown verifies use; the dummy/random outcome does not supply a unique aura or fixed hold timer."},
		[10724]={name="Gnomish Rocket Boots",enabled=true,revision=1,slots={[8]=true},useSpell=13141,cooldown={start="native",seconds=900.0,category=1203,categorySeconds=300.0},effect={kind="aura",seconds=20.0,hold=true,unit="player",spells={[13141]=true}},itemData="sparse"},
		[10725]={name="Gnomish Battle Chicken",enabled=true,revision=1,slots={[13]=true,[14]=true},useSpell=23133,cooldown={start="native",seconds=1200.0,category=94,categorySeconds=90.0},effect={kind="guardian",seconds=90.0,hold=false},itemData="sparse"},
		[10726]={name="Gnomish Mind Control Cap",enabled=true,revision=1,slots={[1]=true},useSpell=13180,cooldown={start="native",seconds=1800.0,category=0,categorySeconds=0.0},effect={kind="aura",unit="pet",spells={[13181]=true},hold=true},itemData="sparse",notes="Only the cap charm aura on the controlled pet holds; an unrelated pet is never sufficient."},
		[10727]={name="Goblin Dragon Gun",enabled=true,revision=1,slots={[13]=true,[14]=true},useSpell=13183,cooldown={start="native",seconds=300.0,category=1141,categorySeconds=10.0},effect={kind="channel",seconds=10.0,hold=true,spells={[13183]=true}},itemData="sparse"},
		[11808]={name="Circle of Flame",enabled=true,revision=1,slots={[1]=true},useSpell=17447,cooldown={start="native",seconds=300.0,category=0,categorySeconds=0.0},effect={kind="channel",seconds=10.0,hold=true,spells={[17447]=true}},itemData="sparse"},
		[13353]={name="Book of the Dead",enabled=true,revision=1,slots={[17]=true},useSpell=17490,cooldown={start="native",seconds=900.0,category=94,categorySeconds=60.0},effect={kind="guardian",seconds=60.0,hold=false},itemData="sparse"},
		[13382]={name="Cannonball Runner",enabled=true,revision=1,slots={[13]=true,[14]=true},useSpell=6251,cooldown={start="native",seconds=300.0,category=1141,categorySeconds=10.0},effect={kind="guardian",seconds=10.0,hold=false},itemData="sparse"},
		[14022]={name="Barov Peasant Caller",enabled=true,revision=1,slots={[13]=true,[14]=true},useSpell=18307,cooldown={start="native",seconds=600.0,category=94,categorySeconds=60.0},effect={kind="guardian",seconds=20.0,hold=false},itemData="sparse"},
		[14023]={name="Barov Peasant Caller",enabled=true,revision=1,slots={[13]=true,[14]=true},useSpell=18308,cooldown={start="native",seconds=600.0,category=94,categorySeconds=60.0},effect={kind="guardian",seconds=20.0,hold=false},itemData="sparse"},
		[16022]={name="Arcanite Dragonling",enabled=true,revision=1,slots={[13]=true,[14]=true},useSpell=19804,cooldown={start="native",seconds=1200.0,category=94,categorySeconds=60.0},effect={kind="guardian",seconds=60.0,hold=false},itemData="sparse"},
		[16768]={name="Furbolg Medicine Pouch",enabled=true,revision=1,slots={[17]=true},useSpell=20631,cooldown={start="native",seconds=1200.0,category=0,categorySeconds=0.0},effect={kind="aura",seconds=10.0,hold=true,unit="player",spells={[20631]=true}},itemData="sparse"},
		[17067]={name="Ancient Cornerstone Grimoire",enabled=true,revision=1,slots={[17]=true},useSpell=17490,cooldown={start="native",seconds=900.0,category=94,categorySeconds=60.0},effect={kind="guardian",seconds=60.0,hold=false},itemData="sparse"},
		[19337]={name="The Black Book",enabled=true,revision=1,slots={[13]=true,[14]=true},useSpell=23720,cooldown={start="native",seconds=300.0,category=1141,categorySeconds=30.0},effect={kind="aura",seconds=30.0,hold=false,unit="pet",spells={[23720]=true}},itemData="sparse"},
		[21326]={name="Defender of the Timbermaw",enabled=true,revision=1,slots={[13]=true,[14]=true},useSpell=26066,cooldown={start="native",seconds=600.0,category=94,categorySeconds=60.0},effect={kind="guardian",seconds=40.0,hold=false},itemData="sparse"},
		[21579]={name="Vanquished Tentacle of C'Thun",enabled=true,revision=1,slots={[13]=true,[14]=true},useSpell=26391,cooldown={start="native",seconds=180.0,category=0,categorySeconds=0.0},effect={kind="guardian",seconds=30.0,hold=false},itemData="sparse"},
		[21647]={name="Fetish of the Sand Reaver",enabled=true,revision=1,slots={[13]=true,[14]=true},useSpell=26400,cooldown={start="native",seconds=180.0,category=0,categorySeconds=0.0},effect={kind="aura",seconds=20.0,hold=true,unit="player",spells={[26400]=true}},itemData="sparse"},
		[28727]={name="Pendant of the Violet Eye",enabled=true,revision=1,slots={[13]=true,[14]=true},useSpell=29601,cooldown={start="native",seconds=120.0,category=0,categorySeconds=0.0},effect={kind="aura",seconds=20.0,hold=true,unit="player",spells={[29601]=true}},itemData="sparse"},
		[30720]={name="Serpent-Coil Braid",enabled=true,revision=1,slots={[13]=true,[14]=true},itemData="sparse",proxy={id=22044,buff=37445}},
		[34430]={name="Glimmering Naaru Sliver",enabled=true,revision=1,slots={[13]=true,[14]=true},useSpell=45052,cooldown={start="native",seconds=300.0,category=0,categorySeconds=0.0},effect={kind="channel",seconds=8.0,hold=true,spells={[45052]=true}},itemData="sparse"},
		[38506]={name="Don Carlos' Famous Hat",enabled=true,revision=1,slots={[1]=true},useSpell=51149,cooldown={start="native",seconds=1.5,category=0,categorySeconds=0.0},effect={kind="companion",creature=28267,hold=false},itemData="sparse",notes="Native use only. Do not hold indefinitely from its always-equipped despawn aura or an unrelated companion."},
	}
	Special.ReferenceItems = {
		[3456]={name="Dog Whistle",scope="bag",useSpell=9515,cooldownSeconds=600.0,reason="Not equippable; reference only, never registered as a gear swap rule."},
		[4384]={name="Explosive Sheep",scope="bag",useSpell=4074,cooldownSeconds=0.0,reason="Not equippable; reference only, never registered as a gear swap rule."},
		[18232]={name="Field Repair Bot 74A",scope="bag",useSpell=22700,cooldownSeconds=0.0,reason="Not equippable; reference only, never registered as a gear swap rule."},
	}
	Special.BuildIndex()
end
Special.RefreshCatalog()
