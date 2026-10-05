const { extractFunction, runLua } = require('./lib/lua_harness');

const options = 'ItemRackOptions/ItemRackOptions.lua';
const functions = [
  extractFunction(options, 'ItemRackOpt.NormalizeSetIcon'),
  extractFunction(options, 'ItemRackOpt.AppendSetIcon'),
  extractFunction(options, 'ItemRackOpt.ShouldHighlightSetIcon'),
  extractFunction(options, 'ItemRackOpt.PopulateInvIcons'),
  extractFunction(options, 'ItemRackOpt.PopulateInitialIcons'),
  extractFunction(options, 'ItemRackOpt.OnEvent'),
].join('\n');

runLua(String.raw`
local fallback = "Interface\\Icons\\INV_Misc_QuestionMark"
local refreshes = 0
ItemRackOpt = { Icons={}, Inv={}, FallbackSetIcon=fallback }
ItemRack = { SlotInfo={} }
ItemRackOptFrame = { IsVisible=function() return true end }
for i=0,19 do
  ItemRack.SlotInfo[i] = { name="Slot"..i }
  ItemRackOpt.Inv[i] = { id=(i % 3 == 0) and ("item"..i) or 0 }
end
function ItemRack.GetInfoByID(id)
  local n = tonumber(tostring(id):match("(%d+)$"))
  if n == 6 then return "Loaded",777 end
  return "Uncached",nil
end
function GetInventorySlotInfo(name)
  local n = tonumber(name:match("(%d+)$"))
  if n == 1 then return n,nil end
  return n,"SlotTexture"..n
end
function ItemRackOpt.SetsIconScrollFrameUpdate() refreshes = refreshes + 1 end
RefreshPlayerSpellIconInfo = nil
IconDataProviderMixin = nil

${functions}

local checks = 0
local function check(value,message) assert(value,message); checks = checks + 1 end

check(ItemRackOpt.NormalizeSetIcon(nil) == fallback,
  "nil item data must use a visible fallback")
check(ItemRackOpt.NormalizeSetIcon(0) == fallback and ItemRackOpt.NormalizeSetIcon(123) == 123,
  "invalid file IDs must fall back while valid file IDs remain unchanged")
check(ItemRackOpt.NormalizeSetIcon("") == fallback
  and ItemRackOpt.NormalizeSetIcon("Interface\\Icons\\Valid") == "Interface\\Icons\\Valid",
  "empty texture paths must fall back while valid paths remain unchanged")

ItemRackOpt.selectedIcon = fallback
local selected,matched = ItemRackOpt.ShouldHighlightSetIcon(1,fallback,false)
check(selected and matched,"the first matching fallback icon must be highlighted")
selected,matched = ItemRackOpt.ShouldHighlightSetIcon(2,fallback,matched)
check(not selected and matched,"duplicate fallback icons must not all be highlighted")
ItemRackOpt.selectedIconIndex = 2
selected = ItemRackOpt.ShouldHighlightSetIcon(1,fallback,false)
check(not selected,"an explicit click must not highlight another duplicate")
selected = ItemRackOpt.ShouldHighlightSetIcon(2,fallback,false)
check(selected,"an explicit click must retain its exact highlighted cell")
ItemRackOpt.selectedIconIndex = nil

ItemRackOpt.PopulateInvIcons()
check(#ItemRackOpt.Icons == 20,"all twenty slot choices must remain dense")
for i=1,20 do
  check(ItemRackOpt.Icons[i] ~= nil,"slot icon choice "..i.." must never be blank")
end
check(ItemRackOpt.Icons[7] == 777,"loaded item textures must remain intact")
check(ItemRackOpt.Icons[1] == fallback,"uncached item textures must display the fallback")
check(ItemRackOpt.Icons[2] == fallback,"unsupported empty slots must display the fallback")
check(refreshes == 1,"inventory icon rebuild must refresh the visible grid once")

ItemRackOpt.selectedIconIndex = 7
ItemRackOpt.selectedIcon = fallback
ItemRackOpt.PopulateInvIcons()
check(ItemRackOpt.selectedIcon == 777,
  "a clicked fallback cell must adopt its real texture when item data arrives")
ItemRackOpt.selectedIconIndex = nil

ItemRackOpt.PopulateInitialIcons()
check(#ItemRackOpt.Icons == 22,
  "initial choices must retain twenty slots plus the two packaged banners")
for i=1,20 do
  check(ItemRackOpt.Icons[i] ~= nil,"initial icon array must contain no slot holes")
end

local before = #ItemRackOpt.Icons
-- Cross-fork compatibility review: Forever must not initialize the shared
-- Blizzard icon provider, including when the legacy API is incomplete.
RefreshPlayerSpellIconInfo = function() end
GetMacroIcons = nil
IconDataProviderMixin = {}
CreateAndInitFromMixin = function() error("shared icon provider must not be touched") end
local ok = pcall(ItemRackOpt.PopulateInitialIcons)
check(ok and #ItemRackOpt.Icons == 22,"incomplete icon APIs must retain base choices without shared-provider access")
GetMacroIcons = function(target) target[1]=901; target[2]=0 end
GetLooseMacroIcons = function(target) target[1]=902 end
ItemRackOpt.PopulateInitialIcons()
check(ItemRackOpt.Icons[23] == 901 and ItemRackOpt.Icons[24] == 902,
  "modern fill-table icon APIs returning nil must supply valid icons")
GetMacroIcons = function() return {"legacy"} end
GetSpellorMacroIconInfo = function() return "Spell_Legacy" end
GetLooseMacroIcons = nil
ItemRackOpt.PopulateInitialIcons()
check(ItemRackOpt.Icons[23] == "Interface\\Icons\\Spell_Legacy",
  "legacy indexed macro icons must remain available")
GetMacroIcons = function() error("icon list unavailable") end
check(pcall(ItemRackOpt.PopulateInitialIcons) and #ItemRackOpt.Icons == 22,
  "failing icon APIs must preserve a dense base list")
before = #ItemRackOpt.Icons
ItemRackOpt.AppendSetIcon(nil)
ItemRackOpt.AppendSetIcon(0)
ItemRackOpt.AppendSetIcon("")
check(#ItemRackOpt.Icons == before,"invalid spell or macro icons must be skipped")
ItemRackOpt.AppendSetIcon(456)
ItemRackOpt.AppendSetIcon("Spell_Test",true)
check(ItemRackOpt.Icons[before+1] == 456
  and ItemRackOpt.Icons[before+2] == "Interface\\Icons\\Spell_Test",
  "valid numeric and legacy macro icons must append safely")

local itemRefreshes = 0
ItemRackOpt.PopulateInvIcons = function() itemRefreshes = itemRefreshes + 1 end
ItemRackOpt.OnEvent(nil,"GET_ITEM_INFO_RECEIVED")
check(itemRefreshes == 1,"completed asynchronous item data must refresh picker icons")
ItemRackOptFrame.IsVisible = function() return false end
ItemRackOpt.OnEvent(nil,"GET_ITEM_INFO_RECEIVED")
check(itemRefreshes == 1,"hidden options must not do unnecessary item-cache work")

print(string.format("[SET ICON PICKER LUA] %d blank-icon and refresh checks passed.",checks))
`, 'set-icon-picker');
