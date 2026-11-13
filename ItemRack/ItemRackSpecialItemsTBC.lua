local Special = ItemRack.SpecialItems
if Special.Client.family~="tbc" then return end
function Special.LoadCatalog()
Special.Rules = {
	[16022]={name="Arcanite Dragonling",enabled=true,slots={[13]=true,[14]=true},
		cooldown={start="native",seconds=1200,category=94,categorySeconds=60},
		effect={kind="guardian",seconds=60,hold=false},source="2.5.5.65463 / 2.5.6.70577; normal native-use path"},
	[30720]={name="Serpent-Coil Braid",enabled=true,slots={[13]=true,[14]=true},
		proxy={id=22044,buff=37445},source="Existing mana-gem cooldown/buff proxy; unchanged semantics"},
	[10645]={name="Gnomish Death Ray",enabled=false,slots={[13]=true,[14]=true},
		cooldown={start="native",seconds=300},effect={kind="channel",seconds=4,spells={[13278]=true},hold=true},
		reason="Audit existing channel protection before enabling another hold"},
	[34430]={name="Glimmering Naaru Sliver",enabled=false,slots={[13]=true,[14]=true},
		cooldown={start="native",seconds=300},effect={kind="channel",seconds=8,spells={[45052]=true},hold=true},
		reason="Channel completion/interruption require client acceptance"},
	[28727]={name="Pendant of the Violet Eye",enabled=false,slots={[13]=true,[14]=true},
		cooldown={start="native",seconds=120},effect={kind="aura",unit="player",spells={[29601]=true},seconds=20,hold=true},
		reason="Confirm trigger/stack tether before enabling"},
	[17067]={name="Ancient Cornerstone Grimoire",enabled=false,slots={[17]=true},
		cooldown={start="native",seconds=900,category=94,categorySeconds=60},effect={kind="guardian",seconds=60,hold=false},
		reason="Unequip persistence and success event require live acceptance"},
}
Special.BuildIndex()
end
Special.RefreshCatalog()
