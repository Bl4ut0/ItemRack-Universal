-- Reviewed client-specific catalog. Source: 1.60.1.70938.
-- Cooldown/effect durations are metadata; the live API remains authoritative.
local Special = ItemRack.SpecialItems
if Special.Client.family~="forever" then return end
function Special.LoadCatalog()
	Special.CatalogSource={builds="1.60.1.70938",label="forever-16001"}
	Special.Rules = {
		[4396]={name="Mechanical Dragonling",enabled=true,revision=1,slots={[13]=true,[14]=true},useSpell=4073,cooldown={start="native",seconds=3600.0,category=94,categorySeconds=60.0},effect={kind="guardian",seconds=60.0,hold=false},itemData="sparse"},
		[4984]={name="Skull of Impending Doom",enabled=true,revision=1,slots={[17]=true},useSpell=5024,cooldown={start="native",seconds=300.0,category=0,categorySeconds=0.0},effect={kind="aura",seconds=10.0,hold=true,unit="player",spells={[5024]=true}},itemData="sparse"},
		[7189]={name="Goblin Rocket Boots",enabled=true,revision=1,slots={[8]=true},useSpell=8892,cooldown={start="native",seconds=300.0,category=0,categorySeconds=0.0},effect={kind="aura",seconds=20.0,hold=true,unit="player",spells={[8892]=true}},itemData="sparse"},
		[7734]={name="Six Demon Bag",enabled=true,revision=1,slots={[13]=true,[14]=true},useSpell=14537,cooldown={start="native",seconds=1800.0,category=1141,categorySeconds=10.0},effect={kind="variable",hold=false},itemData="effect-link; slot from Era item identity",notes="Native cooldown verifies use; the dummy/random outcome does not supply a unique aura or fixed hold timer."},
		[9394]={name="Horned Viking Helmet",enabled=true,revision=1,slots={[1]=true},useSpell=22641,cooldown={start="native",seconds=1800.0,category=0,categorySeconds=0.0},effect={kind="native",hold=false},itemData="effect-link; slot from Era item identity"},
		[10576]={name="Mithril Mechanical Dragonling",enabled=true,revision=1,slots={[13]=true,[14]=true},useSpell=23075,cooldown={start="native",seconds=3600.0,category=94,categorySeconds=60.0},effect={kind="guardian",seconds=60.0,hold=false},itemData="sparse"},
		[10577]={name="Goblin Mortar",enabled=true,revision=1,slots={[13]=true,[14]=true},useSpell=13237,cooldown={start="native",seconds=600.0,category=1141,categorySeconds=10.0},effect={kind="native",seconds=3.0,hold=false},itemData="sparse",charges=6,notes="Charge/outcome changes use native cooldown and existing item-identity reconciliation; no charge count is inferred from cast success."},
		[10588]={name="Goblin Rocket Helmet",enabled=true,revision=1,slots={[1]=true},useSpell=22641,cooldown={start="native",seconds=1200.0,category=0,categorySeconds=0.0},effect={kind="native",hold=false},itemData="sparse"},
		[10645]={name="Gnomish Death Ray",enabled=true,revision=1,slots={[13]=true,[14]=true},useSpell=13278,cooldown={start="native",seconds=300.0,category=1141,categorySeconds=10.0},effect={kind="channel",seconds=4.0,hold=true,spells={[13278]=true}},itemData="sparse"},
		[10716]={name="Gnomish Shrink Ray",enabled=true,revision=1,slots={[13]=true,[14]=true},useSpell=13006,cooldown={start="native",seconds=300.0,category=0,categorySeconds=0.0},effect={kind="variable",hold=false},itemData="sparse",notes="Native cooldown verifies use; the dummy/random outcome does not supply a unique aura or fixed hold timer."},
		[10720]={name="Gnomish Net-o-Matic Projector",enabled=true,revision=1,slots={[13]=true,[14]=true},useSpell=13120,cooldown={start="native",seconds=600.0,category=0,categorySeconds=0.0},effect={kind="variable",hold=false},itemData="sparse",notes="Native cooldown verifies use; the dummy/random outcome does not supply a unique aura or fixed hold timer."},
		[10724]={name="Gnomish Rocket Boots",enabled=true,revision=1,slots={[8]=true},useSpell=13141,cooldown={start="native",seconds=1800.0,category=0,categorySeconds=0.0},effect={kind="aura",seconds=20.0,hold=true,unit="player",spells={[13141]=true}},itemData="sparse"},
		[10725]={name="Gnomish Battle Chicken",enabled=true,revision=1,slots={[13]=true,[14]=true},useSpell=23133,cooldown={start="native",seconds=1800.0,category=2267,categorySeconds=1800.0},effect={kind="guardian",seconds=90.0,hold=false},itemData="sparse"},
		[10726]={name="Gnomish Mind Control Cap",enabled=true,revision=1,slots={[1]=true},useSpell=13180,cooldown={start="native",seconds=1800.0,category=0,categorySeconds=0.0},effect={kind="aura",unit="pet",spells={[13181]=true},hold=true},itemData="sparse",notes="Only the cap charm aura on the controlled pet holds; an unrelated pet is never sufficient."},
		[10727]={name="Goblin Dragon Gun",enabled=true,revision=1,slots={[13]=true,[14]=true},useSpell=13183,cooldown={start="native",seconds=300.0,category=1141,categorySeconds=10.0},effect={kind="channel",seconds=10.0,hold=true,spells={[13183]=true}},itemData="sparse"},
		[13353]={name="Book of the Dead",enabled=true,revision=1,slots={[17]=true},useSpell=17490,cooldown={start="native",seconds=900.0,category=94,categorySeconds=60.0},effect={kind="guardian",seconds=60.0,hold=false},itemData="effect-link; slot from Era item identity"},
		[13382]={name="Cannonball Runner",enabled=true,revision=1,slots={[13]=true,[14]=true},useSpell=6251,cooldown={start="native",seconds=300.0,category=1141,categorySeconds=10.0},effect={kind="guardian",seconds=10.0,hold=false},itemData="effect-link; slot from Era item identity"},
		[14022]={name="Barov Peasant Caller",enabled=true,revision=1,slots={[13]=true,[14]=true},useSpell=18307,cooldown={start="native",seconds=360.0,category=94,categorySeconds=60.0},effect={kind="guardian",seconds=20.0,hold=false},itemData="effect-link; slot from Era item identity"},
		[14023]={name="Barov Peasant Caller",enabled=true,revision=1,slots={[13]=true,[14]=true},useSpell=18308,cooldown={start="native",seconds=360.0,category=94,categorySeconds=20.0},effect={kind="guardian",seconds=20.0,hold=false},itemData="effect-link; slot from Era item identity"},
		[16022]={name="Arcanite Dragonling",enabled=true,revision=1,slots={[13]=true,[14]=true},useSpell=19804,cooldown={start="deferred",seconds=3600.0,category=94,categorySeconds=60.0,minimumOwnSeconds=120,reviewAfterSeconds=90},effect={kind="guardian",seconds=60.0,hold=false},itemData="sparse",activation={itemSpell=19804,successSpells={[19804]=true},windowSeconds=0.75}},
		[16768]={name="Furbolg Medicine Pouch",enabled=true,revision=1,slots={[17]=true},useSpell=20631,cooldown={start="native",seconds=1200.0,category=0,categorySeconds=0.0},effect={kind="aura",seconds=10.0,hold=true,unit="player",spells={[20631]=true}},itemData="sparse"},
		[17067]={name="Ancient Cornerstone Grimoire",enabled=true,revision=1,slots={[17]=true},useSpell=17490,cooldown={start="native",seconds=900.0,category=94,categorySeconds=60.0},effect={kind="guardian",seconds=60.0,hold=false},itemData="effect-link; slot from Era item identity"},
		[19337]={name="The Black Book",enabled=true,revision=1,slots={[13]=true,[14]=true},useSpell=23720,cooldown={start="native",seconds=300.0,category=1141,categorySeconds=30.0},effect={kind="aura",seconds=30.0,hold=false,unit="pet",spells={[23720]=true}},itemData="sparse"},
		[21326]={name="Defender of the Timbermaw",enabled=true,revision=1,slots={[13]=true,[14]=true},useSpell=26066,cooldown={start="native",seconds=300.0,category=94,categorySeconds=20.0},effect={kind="guardian",seconds=20.0,hold=false},itemData="sparse"},
		[21579]={name="Vanquished Tentacle of C'Thun",enabled=true,revision=1,slots={[13]=true,[14]=true},useSpell=26391,cooldown={start="native",seconds=180.0,category=0,categorySeconds=0.0},effect={kind="guardian",seconds=30.0,hold=false},itemData="sparse"},
		[21647]={name="Fetish of the Sand Reaver",enabled=true,revision=1,slots={[13]=true,[14]=true},useSpell=26400,cooldown={start="native",seconds=180.0,category=0,categorySeconds=0.0},effect={kind="aura",seconds=20.0,hold=true,unit="player",spells={[26400]=true}},itemData="sparse"},
	}
	Special.ReferenceItems = {
		[3456]={name="Dog Whistle",scope="bag",useSpell=9515,cooldownSeconds=600.0,reason="Not equippable; reference only, never registered as a gear swap rule."},
		[4384]={name="Explosive Sheep",scope="bag",useSpell=4074,cooldownSeconds=0.0,reason="Not equippable; reference only, never registered as a gear swap rule."},
		[18232]={name="Field Repair Bot 74A",scope="bag",useSpell=22700,cooldownSeconds=0.0,reason="Not equippable; reference only, never registered as a gear swap rule."},
		[260800]={name="Shafety Sheep",scope="bag",useSpell=1269265,cooldownSeconds=0.0,reason="Not equippable; reference only, never registered as a gear swap rule."},
	}
	Special.BuildIndex()
end
Special.RefreshCatalog()
