const { extractFunction, runLua } = require('./lib/lua_harness');
const assert = require('assert');
const fs = require('fs');

const coreFile = 'ItemRack/ItemRack.lua';
const coreSource = fs.readFileSync(coreFile,'utf8');
assert(coreSource.includes('=== BREAKOUT DISCOVERY DIAGNOSTICS ===')
  && coreSource.includes('pcall(ItemRack.GetMenuDiagnosticReport,fullDump)'),
  'breakout-diagnostics-dump: include the recorder without letting collection failure abort /dump');
const alreadyInMenu = extractFunction(coreFile, 'ItemRack.AlreadyInMenu');
const addToMenu = extractFunction(coreFile, 'ItemRack.AddToMenu');
const getSnapshotKey = extractFunction(coreFile, 'ItemRack.GetMenuSnapshotKey');
const storeSnapshot = extractFunction(coreFile, 'ItemRack.StoreMenuSnapshot');
const restoreSnapshot = extractFunction(coreFile, 'ItemRack.RestoreMenuSnapshot');
const discoverItems = extractFunction(coreFile, 'ItemRack.DiscoverEquipmentMenuItems');
const refreshSnapshots = extractFunction(coreFile, 'ItemRack.RefreshQuickAccessMenuSnapshots');
const onEnteringCombat = extractFunction(coreFile, 'ItemRack.OnEnteringCombat');
const onBankClose = extractFunction(coreFile, 'ItemRack.OnBankClose');
const isCombatEquipRestriction = coreSource.includes('function ItemRack.IsCombatEquipRestrictionText')
  ? extractFunction(coreFile, 'ItemRack.IsCombatEquipRestrictionText')
  : '';
const buildMenu = extractFunction(coreFile, 'ItemRack.BuildMenu');
const menuOnClick = extractFunction(coreFile, 'ItemRack.MenuOnClick');
const diagnosticFunctions = [
  'MenuDiagnosticValue','MenuDiagnosticCall','MenuDiagnosticCounts','BeginMenuDiagnostic',
  'MenuDiagnosticReject','FinishMenuDiagnostic','GetMenuDiagnosticReport','ConsiderMenuCandidate',
].map(name => extractFunction(coreFile, `ItemRack.${name}`)).join('\n');

runLua(String.raw`
local combat=false
local equippedID,equippedSlot
local hidden=false
local buttons={}

function InCombatLockdown() return combat end
function IsAltKeyDown() return false end
function IsShiftKeyDown() return false end
function GetScreenHeight() return 1080 end
function GetContainerNumSlots(bag) return not combat and bag==0 and 2 or 0 end

UIParent={GetEffectiveScale=function() return 1 end}
ChatFrame1EditBox={IsVisible=function() return false end}
ItemRackButtonMenu={Hide=function() end}
ItemRackMenuFrame={
  GetEffectiveScale=function() return 1 end,
  GetFrameLevel=function() return 1 end,
  Show=function() end,
  Hide=function() hidden=true end,
  SetWidth=function(self,value) self.width=value end,
  SetHeight=function(self,value) self.height=value end,
}
ItemRackUser={
  Buttons={[1]={},[13]={},[14]={}},
  Locked="ON",
  SetMenuWrap="OFF",
  CharMenuWrap="OFF",
  Sets={},
}
ItemRackSettings={
  AllowEmpty="ON",
  AllowHidden="OFF",
  HideTradables="OFF",
  DisableAltClick="OFF",
  EquipOnSetPick="OFF",
  TrinketMenuMode="ON",
}
ItemRack={
  Menu={}, MenuSnapshots={}, menuOrient="VERTICAL", menuDock="TOPLEFT", currentDock="TEST",
  DockInfo={TEST={xstart=6,ystart=-6,xdir=1,ydir=-1}},
  SlotInfo={[1]={INVTYPE_HEAD=true},[13]={INVTYPE_TRINKET=true},[14]={INVTYPE_TRINKET=true}},
  IsForever=function() return true end,
  Debug=function() end,
  GetID=function(a,b)
    if b==1 then return "10577::::::::30:1491::::::::Player-4619-0123DD03:" end
    if b==2 then return "3456::::::::30:1491::1:::::::" end
    return a==13 and "280766::::::::30:1491::11:::::::" or 0
  end,
  GetInfoByID=function() return "Trinket",1,"INVTYPE_TRINKET" end,
  PlayerCanWear=function() return true end,
  IsSoulbound=function() return true end,
  IsHidden=function() return false end,
  StartTimer=function() end,
  UpdateMenuCooldowns=function() end,
  SetRuneIconOverlay=function() end,
  MissingItems=function() end,
  GetCountByID=function() return 1 end,
  ClearLockList=function() end,
  EquipItemByID=function(id,slot)
    equippedID,equippedSlot=id,slot
    ItemRack.CombatQueue=ItemRack.CombatQueue or {}
    ItemRack.CombatQueue[slot]=id
  end,
}

function ItemRack.CreateMenuButton(i)
  local button={
    SetFrameLevel=function() end,
    Show=function() end,
    Hide=function() end,
    SetPoint=function() end,
  }
  buttons[i]=button
  _G["ItemRackMenu"..i]=button
  _G["ItemRackMenu"..i.."Icon"]={SetDesaturated=function() end}
  _G["ItemRackMenu"..i.."Border"]={Hide=function() end,Show=function() end,SetVertexColor=function() end}
  _G["ItemRackMenu"..i.."Name"]={SetText=function() end}
  _G["ItemRackMenu"..i.."Count"]={SetText=function() end}
  return button
end

${alreadyInMenu}
${addToMenu}
${diagnosticFunctions}
${getSnapshotKey}
${storeSnapshot}
${restoreSnapshot}
${discoverItems}
${refreshSnapshots}
${buildMenu}
${menuOnClick}
${extractFunction(coreFile, 'ItemRack.EquipItemByID')}
${extractFunction(coreFile, 'ItemRack.AddToCombatQueue')}
ItemRack.CombatQueue={}
ItemRack.MatchesStoredItemID=function(a,b) return a==b end
ItemRack.GetEquippedSlotState=function(slot) return "resolved",ItemRack.GetID(slot) end
ItemRack.UpdateCombatQueue=function() end

local checks=0
local function check(value,message) assert(value,message); checks=checks+1 end

-- Forever 1.60.1.70338 / ItemRack 4.54 report: an out-of-combat trinket
-- flyout worked, but the same live bag scan in combat left only entry 0.
ItemRack.BuildMenu(13,nil,2)
check(#ItemRack.Menu==3,"out-of-combat trinket discovery must include two items and Empty Slot")
check(ItemRack.Menu[1]~="0" and ItemRack.Menu[1]~=0,"snapshot must retain a real first trinket identity")
local firstID=ItemRack.Menu[1]
local snapshot=ItemRack.MenuSnapshots[ItemRack.GetMenuSnapshotKey(13,nil)]
check(type(snapshot)=="table" and #snapshot==3,"successful slot menu must create a permanent combat snapshot")

combat=true
ItemRack.BuildMenu(13,nil,2)
check(#ItemRack.Menu==3,"forever-combat-trinket-menu-context: combat must not collapse to Empty Slot")
check(ItemRack.Menu[1]==firstID and ItemRack.Menu[3]==0,
  "combat snapshot must preserve exact row order and the optional Empty Slot entry")
check(ItemRack.MenuDiagnostics.latest['13:bags:combat'].restoredSnapshot==true
  and ItemRack.MenuDiagnostics.latest['13:bags:combat'].visited==0,
  "diagnostics must distinguish cache restoration from actual live discovery")

local row={SetChecked=function() end,GetID=function() return 1 end,GetName=function() return "ItemRackMenu1" end}
ItemRack.MenuOnClick(row,"LeftButton")
check(ItemRack.CombatQueue[13]==firstID,
  "left-click must reach production EquipItemByID and retain the exact ID in CombatQueue[13]")
check(hidden,"completed row selection must close the breakout")
ItemRack.MenuOnClick(row,"RightButton")
check(ItemRack.CombatQueue[14]==firstID,"right-click must queue the preserved ID in trinket slot 14")

-- The reporter confirmed every quick-access equipment breakout is affected,
-- not only the paired trinket presentation. Prove the same snapshot contract
-- for an ordinary armor slot without TrinketMenuMode routing.
combat=false
ItemRack.GetInfoByID=function() return "Armor",1,"INVTYPE_HEAD" end
ItemRack.RefreshQuickAccessMenuSnapshots(1)
local armorSnapshot=ItemRack.MenuSnapshots[ItemRack.GetMenuSnapshotKey(1,nil)]
check(type(armorSnapshot)=="table" and #armorSnapshot==2,
  "configured quick-access slots must be snapshotted without requiring a prior hover")
local armorFirst=armorSnapshot[1]
combat=true
ItemRack.BuildMenu(1,nil,2)
check(#ItemRack.Menu==2 and ItemRack.Menu[1]==armorFirst,
  "forever-combat-quick-access-menu-context: ordinary slot rows must survive lockdown")

-- A snapshot is scoped by menuInclude so the options editor cannot replace the
-- quick-access context with its equipped-item variant.
combat=false
ItemRack.Menu={"options-only"}
ItemRack.StoreMenuSnapshot(13,true)
ItemRack.Menu={}
check(ItemRack.RestoreMenuSnapshot(13,nil) and ItemRack.Menu[1]==firstID,
  "quick-access and options-editor snapshots must remain independent")

-- Separate a populated model interrupted during rendering from zero candidates.
combat=true
ItemRack.UpdateMenuCooldowns=function() error('modeled cooldown renderer failure') end
local rendered=pcall(ItemRack.BuildMenu,13,nil,2)
local renderFailure=ItemRack.MenuDiagnostics.latest['13:bags:combat']
check(not rendered and not renderFailure.completed and renderFailure.stage=='cooldowns'
  and renderFailure.result.items==2,
  "breakout-diagnostics-render-error: retain populated model and exact incomplete display stage")

print(string.format("[FOREVER COMBAT MENU LUA] %d reported-path checks passed.",checks))
`, 'forever-combat-menu');

// October 16 follow-up: old /dump captured only {0}, with no indication which
// provider/filter rejected the actual items. Exercise the real wearability
// filter and recorder. These are diagnostic contracts, not a claimed client fix.
runLua(String.raw`
local mode,combat,unitCombat='normal',false,false
local clock=0
local wowver,wowbuild,wowtoc='1.60.1','70338',16001
function GetTime() clock=clock+1; return clock end
function InCombatLockdown() return combat end
function UnitAffectingCombat() return unitCombat end
function IsAltKeyDown() return false end
function GetContainerNumSlots(bag)
  if mode=='bag_error' then error('modeled bag provider failure') end
  return mode~='zero_slots' and bag==0 and 2 or 0
end
function GetContainerItemID(bag,slot)
  if mode=='empty_bag' then return nil end
  return slot==1 and 10577 or 13127
end
function GetNumAddOns() return 2 end
function IsAddOnLoaded() return true end
function GetAddOnInfo(i) return i==1 and 'ItemRack' or 'Bagnon' end
function GetItemInfo() end
C_Item={GetItemInfo=GetItemInfo}
C_Container={GetContainerNumSlots=GetContainerNumSlots}
WOW_PROJECT_ID=1
ItemRackUser={CustomMenuIcons='ON',CustomCharacterIcons='OFF'}
ItemRackSettings={AllowEmpty='ON',AllowHidden='ON',HideTradables='OFF'}
ItemRack={Menu={},MenuSnapshots={},SlotInfo={[13]={INVTYPE_TRINKET=true},[14]={INVTYPE_TRINKET=true},[16]={INVTYPE_TRINKET=true},[17]={INVTYPE_TRINKET=true},[18]={INVTYPE_TRINKET=true}},
  DURABILITY_PATTERN='Durability',REQUIRES_PATTERN='Requires',
  IsForever=function() return true end,
  IsHidden=function() return mode=='hidden' end,
  IsSoulbound=function() return false end,
  GetID=function(bag,slot)
    if not slot then return '280766::::::::' end
    if mode=='missing_links' then return 0 end
    return slot==1 and '10577::::::::Player-private-guid' or '13127::::::::'
  end,
  GetInfoByID=function(id)
    if mode=='metadata_error' then error('modeled item provider failure') end
    if mode=='missing_metadata' or id==0 then return end
    if id=='13127::::::::' then return 'Helm',1,'INVTYPE_HEAD' end
    return 'Trinket',2,'INVTYPE_TRINKET'
  end,
}
local lineTexts={}
for i=1,8 do
  for _,side in ipairs({'Left','Right'}) do
    _G['ItemRackTooltipText'..side..i]={
      SetTextColor=function() end,
      GetText=function()
        if lineTexts[i] then return lineTexts[i] end
        return 'Trinket'
      end,
      GetTextColor=function()
        if mode=='red_tooltip' and side=='Left' and i==2 then return 1,0,0 end
        if mode=='addon_red_stat' and side=='Left' and i==6 then return 1,0,0 end
        if mode=='level_red_req' and side=='Left' and i==6 then return 1,0,0 end
        return 1,1,1
      end,
    }
  end
end
ItemRackTooltip={SetBagItem=function()
  if mode=='red_tooltip' then
    lineTexts={[2]='Cannot equip during combat'}
  elseif mode=='addon_red_stat' then
    lineTexts={[2]='Trinket',[6]='GearQuest Score: 45 (-15)'}
  elseif mode=='level_red_req' then
    lineTexts={[2]='Trinket',[6]='Requires Level 60'}
  else
    lineTexts={[2]='Trinket'}
  end
end,NumLines=function() return (mode=='addon_red_stat' or mode=='level_red_req') and 6 or 2 end}

${diagnosticFunctions}
${alreadyInMenu}
${addToMenu}
${getSnapshotKey}
${storeSnapshot}
${discoverItems}
${refreshSnapshots}
${extractFunction(coreFile,'ItemRack.IsRed')}
${extractFunction(coreFile,'ItemRack.PlayerCanWear')}

local checks=0
local function check(value,message) assert(value,message); checks=checks+1 end
local function scan(nextMode)
  mode=nextMode
  ItemRack.Menu={}
  local record=ItemRack.BeginMenuDiagnostic(13,nil,'diagnostic_test')
  ItemRack.DiscoverEquipmentMenuItems(13,nil,record)
  ItemRack.StoreMenuSnapshot(13,nil,record)
  ItemRack.FinishMenuDiagnostic(record)
  return record
end

local normal=scan('normal')
check(normal.completed and normal.visited==2 and normal.accepted==1,
  'breakout-diagnostics-success: real discovery must count accepted candidates')
check(normal.result.items==1 and normal.result.empty==1 and normal.bagSlots[0]==2,
  'item count must be distinct from the Empty Slot row and bag size')
check(normal.slotMismatch==1 and normal.wearRejected==0,
  'ordinary slot-type mismatch must be separate from wearability rejection')

local missing=scan('missing_metadata')
check(missing.missingMetadata==2 and missing.result.items==0 and missing.result.empty==1,
  'breakout-diagnostics-metadata: report the exact zero-item/one-empty-row state')
check(missing.snapshotPrevious.items==1 and missing.snapshotWritten.items==0,
  'breakout-diagnostics-cache-overwrite: show good-to-empty snapshot replacement')
check(missing.samples[1].item=='10577',
  'sample identities must contain only the base item ID, never the player GUID')

combat=true; unitCombat=true
local wear=scan('red_tooltip')
check(wear.wearRejected==1 and wear.result.items==0 and wear.result.empty==1,
  'breakout-diagnostics-wearability: production tooltip filter must record its rejection')
check(wear.samples[1].detail=='red_tooltip' and wear.samples[1].tooltipLine==2
  and wear.samples[1].tooltipText=='Cannot equip during combat',
  'capture the actual public rejection text/line instead of assuming a combat cause')
check(wear.phase=='combat' and ItemRack.MenuDiagnostics.latest['13:bags:ooc']==missing,
  'combat recording must preserve the most recent out-of-combat evidence')

combat=false
local entry=scan('normal')
check(entry.phase=='transition' and entry.lockdown==false and entry.unitCombat==true,
  'breakout-diagnostics-combat-entry: distinguish unit combat from lockdown timing')
unitCombat=false
local links=scan('missing_links')
check(links.missingIDs==2 and links.unresolvedLinks==2 and links.missingMetadata==0,
  'missing bag links/IDs must be recorded separately from usable-item rejection')
mode='empty_bag'
local originalGetID=ItemRack.GetID
ItemRack.GetID=function(bag,slot) return slot and 0 or originalGetID(bag,slot) end
local empty=scan('empty_bag')
check(empty.emptyBagSlots==2 and empty.unresolvedLinks==0 and #empty.samples==0,
  'ordinary empty bag space must not consume rejection samples or look like unavailable occupied items')
ItemRack.GetID=originalGetID
local zero=scan('zero_slots')
check(zero.visited==0 and zero.bagSlots[0]==0,
  'zero bag enumeration must not be mislabeled as tooltip rejection')
local hiddenRecord=scan('hidden')
check(hiddenRecord.hiddenRejected==1 and hiddenRecord.accepted==0,
  'explicitly hidden items must have their own rejection count')
ItemRackSettings.HideTradables='ON'
local soulbound=scan('normal')
check(soulbound.soulboundRejected==1 and soulbound.wearRejected==0,
  'soulbound filtering must remain distinct and preserve production policy')
ItemRackSettings.HideTradables='OFF'

-- Third-party addon red stat comparison lines (e.g. GearQuest, AtlasBIS) must not reject wearable candidates
combat=false; unitCombat=false
local addonStat=scan('addon_red_stat')
check(addonStat.wearRejected==0 and addonStat.accepted==1,
  'addon red score or stat difference lines (lines 5+) must not reject wearable bag items')

-- Genuine un-met level requirements in red must continue to be rejected
local levelReq=scan('level_red_req')
check(levelReq.wearRejected==1 and levelReq.accepted==0,
  'genuine red level requirement on lines 5+ must reject unwearable items')

-- RefreshQuickAccessMenuSnapshots must populate weapons and trinkets even with empty Buttons table
ItemRackUser.Buttons = {}
local refreshResult = ItemRack.RefreshQuickAccessMenuSnapshots(nil, 'empty_buttons_test')
check(refreshResult == true, 'RefreshQuickAccessMenuSnapshots must succeed with empty buttons table')
check(ItemRack.MenuSnapshots[ItemRack.GetMenuSnapshotKey(16, nil)] ~= nil,
  'weapon slot 16 un-included snapshot must be populated even with empty buttons table')
check(ItemRack.MenuSnapshots[ItemRack.GetMenuSnapshotKey(16, true)] ~= nil,
  'weapon slot 16 included (character sheet) snapshot must be populated even with empty buttons table')
check(ItemRack.MenuSnapshots[ItemRack.GetMenuSnapshotKey(13, true)] ~= nil,
  'trinket slot 13 included snapshot must be populated even with empty buttons table')

mode='metadata_error'; ItemRack.Menu={}
local interrupted=ItemRack.BeginMenuDiagnostic(13,nil,'error_test')
local ok=pcall(ItemRack.DiscoverEquipmentMenuItems,13,nil,interrupted)
check(not ok and not interrupted.completed and interrupted.stage=='item_metadata',
  'breakout-diagnostics-provider-error: retain last stage without suppressing the original failure')
mode='bag_error'
local bagError=ItemRack.BeginMenuDiagnostic(13,nil,'error_test')
ok=pcall(ItemRack.DiscoverEquipmentMenuItems,13,nil,bagError)
check(not ok and bagError.stage=='bag_slots' and bagError.bag==0,
  'bag-provider failure must retain its own stage and bag')

local secret=setmetatable({}, {__tostring=function() error('secret must never stringify') end})
local inaccessible={}
function issecretvalue(value) return rawequal(value,secret) end
function canaccessvalue(value) return not rawequal(value,inaccessible) end
check(ItemRack.MenuDiagnosticValue(secret)=='<secret>',
  'breakout-diagnostics-secret: redact before conversion, comparison or serialization')
check(ItemRack.MenuDiagnosticValue(inaccessible)=='<inaccessible>',
  'inaccessible values must be redacted independently')
check(ItemRack.MenuDiagnosticCall(function() return secret end)=='<secret>',
  'guard API callback results before recording')
check(ItemRack.MenuDiagnosticCall(function() error(secret) end)=='<error>',
  'never stringify an error payload that could itself contain secret data')
check(#ItemRack.MenuDiagnosticValue(string.rep('x',500))==180,
  'tooltip/provider samples must have bounded text length')

for i=1,100 do ItemRack.BeginMenuDiagnostic(i%20,nil,'bounded_test') end
check(#ItemRack.MenuDiagnostics.recent==24,
  'breakout-diagnostics-bounded: retain a fixed recent-history limit')
local report=ItemRack.GetMenuDiagnosticReport()
check(report.schema==1 and report.clientBuild=='70338' and report.interface==16001,
  'support report must include exact client build/interface')
check(report.customMenuIcons=='ON' and report.customCharacterIcons=='OFF',
  'support report must include both icon switches')
check(report.loadedAddons[1]=='ItemRack' and report.loadedAddons[2]=='Bagnon',
  'support report must include loaded addons for working/failing-client comparisons')
check(report.latest['13:bags:combat']==wear and report.latest['13:bags:transition']==entry,
  'combat evidence must survive later out-of-combat activity and ordinary debug-buffer rollover')

print(string.format('[BREAKOUT DIAGNOSTICS LUA] %d discovery, tooltip, cache and redaction checks passed.',checks))
`, 'breakout-discovery-diagnostics');

// Discord 1.60.1.70959 / ItemRack 4.58 dump + CurseForge ginsengz & user_gn29nqf7pua9704t:
// On Forever 1.60.1, PLAYER_REGEN_DISABLED fires while InCombatLockdown() is false and
// UnitAffectingCombat("player") is true. Forever adds red "Cannot change equip status while in combat"
// lines on tooltips during combat/transition; short items put it on line <= 4, long items on lines 8-10.
runLua(String.raw`
local combat,unitCombat=false,false
local wowver,wowbuild,wowtoc='1.60.1','70959',16001
local clock=0
local bagItems={
  [2]={[14]='2820',[15]='280032',[16]='270226'},
  [3]={[1]='10455',[2]='20512',[3]='280766'},
}
local badReqBag={[0]={[1]='99001',[2]='99002'}}
local useBadItems=false
local currentTipBag,currentTipSlot
function GetTime() clock=clock+1; return clock end
function InCombatLockdown() return combat end
function UnitAffectingCombat() return unitCombat end
function IsAltKeyDown() return false end
function IsShiftKeyDown() return false end
function GetScreenHeight() return 1080 end
function GetNumAddOns() return 0 end
function GetInventorySlotInfo() return 0,'Interface\\Icons\\INV_Misc_Bag_08' end
function GetContainerNumSlots(bag)
  if useBadItems then return bag==0 and 2 or 0 end
  return bag==2 and 16 or (bag==3 and 3 or 0)
end
function GetContainerItemID(bag,slot)
  local store = useBadItems and badReqBag or bagItems
  return store[bag] and tonumber(store[bag][slot]) or nil
end
UIParent={GetEffectiveScale=function() return 1 end}
ChatFrame1EditBox={IsVisible=function() return false end}
ItemRackButtonMenu={Hide=function() end}
ItemRackOptFrame={IsVisible=function() return false end}
ItemRackMenuFrame={
  GetEffectiveScale=function() return 1 end,
  GetFrameLevel=function() return 1 end,
  Show=function() end,
  Hide=function() end,
  SetWidth=function() end,
  SetHeight=function() end,
}
ERR_NOT_IN_COMBAT="You can't do that while in combat."
ItemRackSettings={AllowEmpty='ON',AllowHidden='ON',HideTradables='OFF',DisableAltClick='OFF',EquipOnSetPick='OFF',TrinketMenuMode='OFF'}
ItemRackUser={Buttons={[13]={},[14]={}},Locked='ON',SetMenuWrap='OFF',CharMenuWrap='OFF',Sets={},CustomMenuIcons='OFF'}
ItemRack={
  Menu={}, MenuSnapshots={}, menuOrient='VERTICAL', menuDock='TOPLEFT', currentDock='TEST',
  DockInfo={TEST={xstart=6,ystart=-6,xdir=1,ydir=-1}},
  SlotInfo={[13]={INVTYPE_TRINKET=true},[14]={INVTYPE_TRINKET=true},[16]={INVTYPE_WEAPON=true},[17]={INVTYPE_WEAPON=true},[18]={INVTYPE_RANGED=true}},
  DURABILITY_PATTERN='Durability', REQUIRES_PATTERN='Requires',
  CombatQueue={},
  IsForever=function() return true end,
  Debug=function() end,
  ReflectHideOOC=function() end,
  ClearLockList=function() end,
  UpdateMenuCooldowns=function() end,
  SetRuneIconOverlay=function() end,
  MissingItems=function() end,
  UpdateCombatQueue=function() end,
  GetCountByID=function() return 1 end,
  IsHidden=function() return false end,
  IsSoulbound=function() return true end,
  StartTimer=function() end,
  GetID=function(bag,slot)
    if not slot then return '19812::::::::60:1486::11:::::::' end
    local store = useBadItems and badReqBag or bagItems
    local base = store[bag] and store[bag][slot]
    return base and (base..'::::::::60:1486::11:::::::') or 0
  end,
  GetInfoByID=function(id)
    if id==0 then return end
    return 'Trinket '..tostring(id),1,'INVTYPE_TRINKET'
  end,
  MatchesStoredItemID=function(a,b) return a==b end,
  GetEquippedSlotState=function(slot) return 'resolved',ItemRack.GetID(slot) end,
}
function ItemRack.CreateMenuButton(i)
  local button={SetFrameLevel=function() end,Show=function() end,Hide=function() end,SetPoint=function() end}
  _G['ItemRackMenu'..i]=button
  _G['ItemRackMenu'..i..'Icon']={SetDesaturated=function() end}
  _G['ItemRackMenu'..i..'Border']={Hide=function() end,Show=function() end,SetVertexColor=function() end}
  _G['ItemRackMenu'..i..'Name']={SetText=function() end}
  _G['ItemRackMenu'..i..'Count']={SetText=function() end}
  return button
end

local tipLeft,tipRight={},{}
local numTipLines=2
for i=1,10 do
  _G['ItemRackTooltipTextLeft'..i]={
    SetTextColor=function() end,
    GetText=function() return tipLeft[i] end,
    GetTextColor=function()
      if tipLeft[i] and (tipLeft[i]:find('Cannot change equip status',1,true) or tipLeft[i]:find('Requires Level 70',1,true) or tipLeft[i]==ERR_NOT_IN_COMBAT) then
        return 1,0,0
      end
      return 1,1,1
    end,
  }
  _G['ItemRackTooltipTextRight'..i]={
    SetTextColor=function() end,
    GetText=function() return tipRight[i] end,
    GetTextColor=function()
      if tipRight[i]=='Plate' then return 1,0,0 end
      return 1,1,1
    end,
  }
end
ItemRackTooltip={
  SetBagItem=function(_,bag,slot)
    tipLeft={}; tipRight={}
    currentTipBag,currentTipSlot=bag,slot
    local id=tonumber(ItemRack.GetID(bag,slot):match('^(%d+)'))
    tipLeft[1]='Item '..tostring(id)
    if id==99001 then
      -- Unwearable: Requires Level 70 in red AND combat-lock text
      tipLeft[2]='Binds when picked up'; tipLeft[3]='Trinket'; tipLeft[6]='Requires Level 70'; tipLeft[7]='Cannot change equip status while in combat'
      numTipLines=7
    elseif id==99002 then
      -- Unwearable proficiency in red on Right3 AND combat-lock text on Left4
      tipLeft[2]='Binds when picked up'; tipLeft[3]='Chest'; tipRight[3]='Plate'; tipLeft[4]='Cannot change equip status while in combat'
      numTipLines=4
    elseif id==2820 then
      -- Short tooltip trinket (<= 4 lines): combat-lock appears on line 4!
      tipLeft[2]='Binds when equipped'; tipLeft[3]='Trinket'
      if unitCombat or combat then tipLeft[4]='Cannot change equip status while in combat'; numTipLines=4 else numTipLines=3 end
    elseif id==280032 then
      -- Localized combat-lock global string on line 4
      tipLeft[2]='Binds when picked up'; tipLeft[3]='Trinket'
      if unitCombat or combat then tipLeft[4]=ERR_NOT_IN_COMBAT; numTipLines=4 else numTipLines=3 end
    else
      -- Standard long trinket tooltip from Discord dump (line 8..10 red text)
      tipLeft[2]='Binds when picked up'; tipLeft[3]='Unique'; tipLeft[4]='Trinket'; tipLeft[5]='+10 Crit'
      tipLeft[6]='Equip: Effect'; tipLeft[7]='Flavor'
      if unitCombat or combat then tipLeft[8]='Cannot change equip status while in combat'; numTipLines=8 else numTipLines=7 end
    end
  end,
  NumLines=function() return numTipLines end,
}

${diagnosticFunctions}
${alreadyInMenu}
${addToMenu}
${getSnapshotKey}
${storeSnapshot}
${restoreSnapshot}
${discoverItems}
${refreshSnapshots}
${onEnteringCombat}
${onBankClose}
${isCombatEquipRestriction}
${extractFunction(coreFile,'ItemRack.IsRed')}
${extractFunction(coreFile,'ItemRack.PlayerCanWear')}
${buildMenu}
${menuOnClick}
${extractFunction(coreFile,'ItemRack.AddToCombatQueue')}
${extractFunction(coreFile,'ItemRack.EquipItemByID')}

local checks=0
local function check(value,message) assert(value,message); checks=checks+1 end

-- 1) Out-of-combat baseline populates all 6 trinkets
ItemRack.RefreshQuickAccessMenuSnapshots(nil,'inventory_refresh')
local oocSnap=ItemRack.MenuSnapshots[ItemRack.GetMenuSnapshotKey(13,nil)]
check(type(oocSnap)=='table' and #oocSnap==7,'reported-forever-combat-lock-tooltip: baseline OOC must snapshot 6 trinkets + empty')

-- 2) Exact Forever 1.60.1.70959 combat entry: PLAYER_REGEN_DISABLED with InCombatLockdown=false, UnitAffectingCombat=true
unitCombat=true
ItemRack.OnEnteringCombat()
local entryRecord=ItemRack.MenuDiagnostics.latest['13:bags:transition']
check(entryRecord and entryRecord.wearRejected==0 and entryRecord.result.items==6,
  'reported-forever-combat-lock-tooltip: combat_entry_refresh must not reject wearable trinkets due to combat-lock red lines (got items='..tostring(entryRecord and entryRecord.result.items)..', wearRejected='..tostring(entryRecord and entryRecord.wearRejected)..')')
local entrySnap=ItemRack.MenuSnapshots[ItemRack.GetMenuSnapshotKey(13,nil)]
check(#entrySnap==7,'combat_entry_refresh must preserve all 6 trinkets in snapshot')

-- 3) In-combat hover restores all 6 trinkets and queues the selected one
combat=true
ItemRack.BuildMenu(13,nil,2)
check(#ItemRack.Menu==7 and ItemRack.Menu[1]~=0,'in-combat trinket menu must expose all 6 trinkets')
local row={SetChecked=function() end,GetID=function() return 1 end,GetName=function() return 'ItemRackMenu1' end}
ItemRack.MenuOnClick(row,'LeftButton')
check(ItemRack.CombatQueue[13]==ItemRack.Menu[1],'clicking combat breakout item must queue it into CombatQueue[13]')

-- 4) Live combat discovery without a pre-existing snapshot still finds wearable trinkets
ItemRack.MenuSnapshots={}
ItemRack.BuildMenu(14,nil,2)
check(#ItemRack.Menu==7,'reported-forever-combat-lock-tooltip: un-cached combat breakout must still discover all 6 trinkets')

-- 5) Genuine level / proficiency restrictions alongside combat lock remain rejected
useBadItems=true
ItemRack.Menu={}
local badRec=ItemRack.BeginMenuDiagnostic(13,nil,'unwearable_in_combat')
ItemRack.DiscoverEquipmentMenuItems(13,nil,badRec)
ItemRack.FinishMenuDiagnostic(badRec)
check(badRec.wearRejected==2 and badRec.accepted==0,
  'genuine level/proficiency red lines must remain rejected even when combat-lock text is also present')
useBadItems=false

-- 6) StoreMenuSnapshot refuses to clobber a populated OOC snapshot with an empty/incomplete scan during transition/combat,
--    while a clean OOC scan returning 0 items updates the snapshot so banked gear does not linger.
ItemRack.MenuSnapshots['13:bags']={oocSnap[1],0}
ItemRack.Menu={0}
local emptyTransition=ItemRack.BeginMenuDiagnostic(13,nil,'empty_transition')
local stored=ItemRack.StoreMenuSnapshot(13,nil,emptyTransition)
check(stored==false and emptyTransition.snapshotPreserved==true and #ItemRack.MenuSnapshots['13:bags']==2,
  'reported-forever-combat-entry-snapshot-preserve: transition/combat empty scan must not overwrite populated OOC snapshot')

combat=false; unitCombat=false; ItemRack.inCombat=nil
ItemRack.Menu={0}
local cleanOOC=ItemRack.BeginMenuDiagnostic(13,nil,'bank_deposited')
local updated=ItemRack.StoreMenuSnapshot(13,nil,cleanOOC)
check(updated==true and #ItemRack.MenuSnapshots['13:bags']==1 and ItemRack.MenuSnapshots['13:bags'][1]==0,
  'clean OOC empty scan must still update snapshot when user genuinely banked/removed gear')

-- 7) Bank close refreshes snapshots cleanly out of combat
ItemRack.BankOpen=1
ItemRack.OnBankClose()
check(ItemRack.BankOpen==nil and #ItemRack.MenuSnapshots['13:bags']==7,
  'OnBankClose must refresh OOC snapshots cleanly after closing bank')

print(string.format('[FOREVER COMBAT LOCK LUA] %d real-dump tooltip & snapshot guard checks passed.',checks))
`, 'reported-forever-combat-lock-tooltip');

// Issue #39 Part 1 (Quick-Access Shift+Left-Click Lock Breakout Open) &
// /itemrack debug breakouts blocking diagnostics.
const buttonsFile = 'ItemRack/ItemRackButtons.lua';
runLua(String.raw`
local combat, unitCombat = false, false
local shiftDown, altDown, ctrlDown, chatVisible = false, false, false, false
local mouseFocusFrame
local activeTimers = {}
local prints, equips, unequippedSets = {}, {}, {}
local bags = {
  [0] = { [1] = '19001:0:0:0:0:0:0:0', [2] = '19002:0:0:0:0:0:0:0', [3] = '19016:0:0:0:0:0:0:0' },
}
local inv = { [13] = '19013:0:0:0:0:0:0:0', [14] = '19014:0:0:0:0:0:0:0', [16] = '19015:0:0:0:0:0:0:0' }

function InCombatLockdown() return combat end
function UnitAffectingCombat() return unitCombat end
function IsShiftKeyDown() return shiftDown end
function IsAltKeyDown() return altDown end
function IsControlKeyDown() return ctrlDown end
function GetTime() return 500 end
function GetScreenWidth() return 1920 end
function GetScreenHeight() return 1080 end
function GetContainerNumSlots(b) return b == 0 and 3 or 0 end
function GetContainerItemID(b, s) return bags[b] and bags[b][s] and tonumber(string.match(bags[b][s], '^(%d+)')) end
function GetInventorySlotInfo() return 0, 'Interface\\Icons\\Empty' end
function GetMouseFocus() return mouseFocusFrame end
function GetNumAddOns() return 0 end
function GetItemCooldown() return 0, 0, 1 end
function PlaySound() end

local function makeFrame(name, strata, level, alpha, shown)
  local f = {
    _name = name, _strata = strata or 'MEDIUM', _level = level or 1,
    _alpha = alpha or 1, _shown = shown ~= false, _scale = 1,
    _left = 100, _top = 200, _width = 36, _height = 36, _scripts = {},
    _parent = UIParent, _mouse = true, _children = {},
  }
  function f:GetName() return self._name end
  function f:GetID() return self._id or 0 end
  function f:SetID(id) self._id = id end
  function f:SetFrameStrata(s) self._strata = s end
  function f:GetFrameStrata() return self._strata end
  function f:SetFrameLevel(l) self._level = l end
  function f:GetFrameLevel() return self._level end
  function f:SetScale(s) self._scale = s end
  function f:GetScale() return self._scale end
  function f:GetEffectiveScale() return self._scale end
  function f:SetAlpha(a) self._alpha = a end
  function f:GetAlpha() return self._alpha end
  function f:GetEffectiveAlpha() return self._parent and self._parent._alpha == 0 and 0 or self._alpha end
  function f:EnableMouse(v) self._mouse = (v == true or v == 1) end
  function f:IsMouseEnabled() return self._mouse end
  function f:Show() self._shown = true end
  function f:Hide() self._shown = false end
  function f:IsShown() return self._shown end
  function f:IsVisible()
    return self._shown and (not self._parent or (self._parent.IsVisible and self._parent:IsVisible()) or self._parent == UIParent)
  end
  function f:IsProtected() return false end
  function f:IsForbidden() return false end
  function f:SetParent(p) self._parent = p end
  function f:GetParent() return self._parent end
  function f:ClearAllPoints() end
  function f:SetPoint() end
  function f:SetWidth(w) self._width = w end
  function f:GetWidth() return self._width end
  function f:SetHeight(h) self._height = h end
  function f:GetHeight() return self._height end
  function f:GetLeft() return self._left end
  function f:GetRight() return self._left + self._width end
  function f:GetTop() return self._top end
  function f:GetBottom() return self._top - self._height end
  function f:IsMouseOver() return mouseFocusFrame == self end
  function f:SetChecked() end
  function f:OriginalSetChecked() end
  function f:SetBackdrop() end
  function f:SetBackdropBorderColor() end
  function f:SetBackdropColor() end
  function f:RegisterForClicks() end
  function f:SetScript(k, fn) self._scripts[k] = fn end
  function f:GetScript(k) return self._scripts[k] end
  function f:SetText(t) self._text = t end
  function f:GetText() return self._text or '' end
  function f:SetTexture(t) self._texture = t end
  function f:SetDesaturated() end
  function f:SetVertexColor() end
  return f
end

function CreateFrame(kind, name, parent, tmpl)
  assert(not tmpl or tmpl == 'ItemRackMenuItemTemplate' or tmpl == 'ItemRackTimeTemplate' or tmpl == 'BackdropTemplate',
    'created popup frames must keep visual-only templates')
  local f = makeFrame(name, parent and parent._strata or 'MEDIUM', (parent and parent._level or 1) + 1, 1, true)
  f._parent = parent
  if name then
    _G[name] = f
    _G[name..'Icon'] = makeFrame(name..'Icon', f._strata)
    _G[name..'Border'] = makeFrame(name..'Border', f._strata)
    _G[name..'Name'] = makeFrame(name..'Name', f._strata)
    _G[name..'Count'] = makeFrame(name..'Count', f._strata)
    _G[name..'Cooldown'] = makeFrame(name..'Cooldown', f._strata)
    _G[name..'Time'] = makeFrame(name..'Time', f._strata)
  end
  return f
end

UIParent = makeFrame('UIParent', 'MEDIUM', 1, 1, true)
ChatFrame1EditBox = makeFrame('ChatFrame1EditBox', 'DIALOG', 1, 1, false)
function ChatFrame1EditBox:IsVisible() return chatVisible end
function ChatFrame1EditBox:HasFocus() return chatFocus end
function ChatFrame1EditBox:Insert(link) self.lastInserted = link end
function ChatEdit_GetActiveWindow() return activeChatWindow end
function GetCurrentKeyBoardFocus() return keyboardFocusFrame end
function GetInventoryItemLink(_, slot) return 'item:'..tostring(slot) end
function GetContainerItemLink(b, s) return 'bag:'..tostring(b)..':'..tostring(s) end
ItemRackOptFrame = makeFrame('ItemRackOptFrame', 'DIALOG', 1, 1, false)
ItemRackOpt = { ListScrollFrameUpdate = function() end }
ItemRackButtonMenu = makeFrame('ItemRackButtonMenu', 'HIGH', 1, 1, false)
ItemRackMenuFrame = makeFrame('ItemRackMenuFrame', 'HIGH', 10, 1, false)
ItemRackPinnedMenuFrame = makeFrame('ItemRackPinnedMenuFrame', 'MEDIUM', 5, 1, false)

for _, slot in ipairs({ 13, 14, 16, 20 }) do
  local b = makeFrame('ItemRackButton'..slot, 'MEDIUM', 1, 1, true)
  b:SetID(slot)
  _G['ItemRackButton'..slot] = b
end

ItemRackSettings = {
  KeepMenuOpen = 'OFF',
  MenuOnShift = 'OFF',
  MenuOnRight = 'OFF',
  HideOOC = 'OFF',
  HidePetBattle = 'ON',
  HideArena = 'OFF',
  TrinketMenuMode = 'ON',
  AnchorOther = 'OFF',
  AllowEmpty = 'ON',
  AllowHidden = 'OFF',
  HideTradables = 'OFF',
  DisableAltClick = 'OFF',
  EquipOnSetPick = 'OFF',
  CharacterSheetMenus = 'ON',
  CooldownCount = 'OFF',
  ShowTooltips = 'OFF',
}
ItemRackUser = {
  Locked = 'ON',
  Alpha = 1,
  MenuScale = 0.85,
  SetMenuWrap = 'OFF',
  CharMenuWrap = 'OFF',
  CustomMenuIcons = 'OFF',
  CurrentSet = 'ActiveSet',
  Buttons = { [13] = {}, [14] = {}, [16] = {}, [20] = {} },
  Sets = { ActiveSet = { equip = {} } },
}
ItemRack = {
  Version = 'Dev', BuildID = 'Dev',
  DebugTags = { Events=false, Equip=false, Queue=false, CombatQueue=false, API=false, UI=false, Combat=false, Breakouts=false, SpecialItems=false },
  DebugAll = false, DebugChat = false,
  Menu = {}, PinnedMenu = {}, MenuSnapshots = {}, MenuCooldownCache = {},
  MenuMouseoverFrames = { ItemRackButton13=1, ItemRackButton14=1, ItemRackButton16=1, ItemRackButton20=1 },
  DockInfo = {
    TOPLEFTBOTTOMLEFT = { xoff=-8, yoff=0, xdir=1, ydir=-1, xstart=8, ystart=-8 },
  },
  SlotInfo = {
    [13] = { name='Trinket0Slot', INVTYPE_TRINKET=true },
    [14] = { name='Trinket1Slot', INVTYPE_TRINKET=true },
    [16] = { name='MainHandSlot', INVTYPE_WEAPON=true, INVTYPE_WEAPONMAINHAND=true, INVTYPE_2HWEAPON=true },
  },
  IsForever = function() return false end,
  Print = function(msg) table.insert(prints, tostring(msg)) end,
  Debug = function() end,
  PrintDebugStatus = function() end,
  ClearQueueDiagnostics = function() end,
  QueueDiagnostic = function() end,
  AuditSavedVariables = function() end,
  ResetButtons = function() end,
  ResetEverything = function() end,
  GetID = function(a, b) if b then return bags[a] and bags[a][b] or 0 end return inv[a] or 0 end,
  GetIRString = function(v) return v and string.match(tostring(v), '^(%d+)') or 0 end,
  GetInfoByID = function(id)
    local b = tonumber(string.match(tostring(id), '^(%d+)'))
    if b == 19015 or b == 19016 then return 'Sword', 'tex:sword', 'INVTYPE_WEAPON' end
    return 'Trinket', 'tex:trinket', 'INVTYPE_TRINKET'
  end,
  FindItem = function(id)
    for s, v in pairs(bags[0]) do if v == id then return nil, 0, s end end
    return nil
  end,
  GetCountByID = function(id) return id == 0 and 0 or 1 end,
  PlayerCanWear = function() return true end,
  IsSoulbound = function() return true end,
  IsHidden = function() return false end,
  MissingItems = function() return 2 end,
  FindParent = function(id) return id end,
  ClearLockList = function() end,
  SetFont = function() end,
  SetRuneIconOverlay = function() end,
  HideBrackets = function() end,
  InventoryTooltip = function() end,
  ClearTooltip = function() end,
  ReflectItemUse = function() end,
  StartTimer = function(n) activeTimers[n] = true end,
  StopTimer = function(n) activeTimers[n] = nil end,
  IsTimerActive = function(n) return activeTimers[n] == true end,
  EquipItemByID = function(id, slot, _, _, _, origin)
    table.insert(equips, { id=id, slot=slot, origin=origin })
  end,
  UnequipSet = function(name) table.insert(unequippedSets, name) end,
  GetObservedItemCooldown = function() return nil end,
  ObserveItemCooldown = function() return { active=false, status='ready' } end,
  ShouldCompareBreakoutItems = nil,
}
CooldownFrame_Set = function() end
CooldownFrame_Clear = function() end

${['MenuDiagnosticValue','MenuDiagnosticCall','MenuDiagnosticCounts','GetTopMouseFocusNames',
  'CollectMenuFrameDiagnostics','RecordBreakoutEvent','ProbeQuickAccessBreakouts',
  'BeginMenuDiagnostic','MenuDiagnosticReject','FinishMenuDiagnostic','RecordButtonInput',
  'GetMenuDiagnosticReport','AddToMenu','GetMenuSnapshotKey','StoreMenuSnapshot',
  'RestoreMenuSnapshot','DiscoverEquipmentMenuItems','ConsiderMenuCandidate',
  'ApplyMenuFrameBackdrop','ResolveQuickAccessMenuTarget','IsPinnedMenuVisible',
  'IsSlotMenuPinned','SyncPinnedMenu','RefreshPinnedMenu','SetPinnedMenuSlot',
  'TogglePinnedMenu','DockWindows','BuildMenu','UpdateMenuCooldowns','WriteMenuCooldowns',
  'MenuMouseover','MenuOnHide','CreateMenuButton','GetActiveChatEditBox','ChatLinkID','MenuOnClick',
  'OnModifierStateChanged','ReflectLock','ReflectAlpha','ReflectMenuScale','SlashHandler']
  .map(n => extractFunction(coreFile, `ItemRack.${n}`)).join('\n')}
${extractFunction(coreFile, 'ItemRack.ShouldCompareBreakoutItems')}
${extractFunction(buttonsFile, 'ItemRack.DockMenuToButton')}
${extractFunction(buttonsFile, 'ItemRack.OnEnterButton')}
${extractFunction(buttonsFile, 'ItemRack.ButtonPostClick')}
${extractFunction(buttonsFile, 'ItemRack.RemoveButton')}

local checks = 0
local function check(v, msg) assert(v, msg); checks = checks + 1 end

-- 1) KeepMenuOpen=OFF must NOT pin on Shift+Left-Click
shiftDown = true
ItemRack.ButtonPostClick(ItemRackButton13, 'LeftButton')
check(not ItemRack.IsPinnedMenuVisible(), 'Shift+Left-Click must not lock open when KeepMenuOpen is OFF')

-- 2) Chat editbox checks: resting visible General tab editbox MUST NOT intercept Shift+Click;
--    only an actually active/focused chat editbox links into chat.
ItemRackSettings.KeepMenuOpen = 'ON'
chatVisible = true
chatFocus = false
activeChatWindow = nil
keyboardFocusFrame = nil
ChatFrame1EditBox.lastInserted = nil
ItemRack.ButtonPostClick(ItemRackButton13, 'LeftButton')
check(ChatFrame1EditBox.lastInserted == nil and ItemRack.IsPinnedMenuVisible() and ItemRack.pinnedMenuOpen == 13,
  'unfocused visible ChatFrame1EditBox (General tab) must NOT swallow Shift+Left-Click as chat link')
-- Reset pin back off before active-chat link test
ItemRack.ButtonPostClick(ItemRackButton13, 'LeftButton')
check(not ItemRack.IsPinnedMenuVisible(), 'reset pin cleanly')

-- With chat actually opened/focused, Shift+Left-Click links into chat without pinning
chatFocus = true
activeChatWindow = ChatFrame1EditBox
ItemRack.ButtonPostClick(ItemRackButton13, 'LeftButton')
check(ChatFrame1EditBox.lastInserted == 'item:13' and not ItemRack.IsPinnedMenuVisible(),
  'open focused chat editbox must keep Shift+Click linking intact')
ChatFrame1EditBox.lastInserted = nil

-- Custom chat addon (e.g. Chattynator) editbox focused via GetCurrentKeyBoardFocus
local customChatBox = makeFrame('ChattynatorEditBox', 'DIALOG', 1, 1, true)
function customChatBox:HasFocus() return true end
function customChatBox:Insert(link) self.lastInserted = link end
activeChatWindow = nil
chatVisible = true
chatFocus = false
keyboardFocusFrame = customChatBox
ItemRack.ButtonPostClick(ItemRackButton13, 'LeftButton')
check(customChatBox.lastInserted == 'item:13' and not ItemRack.IsPinnedMenuVisible(),
  'focused custom chat editbox (Chattynator) must receive Shift+Click link')
keyboardFocusFrame = nil
chatVisible = false
chatFocus = false

-- 3) Shift+Left-Click on Trinket 13 locks pinned menu open (works in combat too),
--    anchored to 13 (or 14 when AnchorOther=ON), at strata BELOW hover ItemRackMenuFrame
combat = true
ItemRack.ButtonPostClick(ItemRackButton13, 'LeftButton')
check(ItemRack.IsPinnedMenuVisible() and ItemRack.pinnedMenuOpen == 13 and ItemRackUser.PinnedMenuSlot == 13,
  'Shift+Left-Click must lock trinket breakout open even in combat')
check(ItemRackPinnedMenuFrame:GetFrameStrata() == 'MEDIUM' and ItemRackMenuFrame:GetFrameStrata() == 'HIGH',
  'anchored breakout must sit below transient hover breakout')
check(#ItemRack.PinnedMenu == 3 and ItemRackPinnedMenu1:IsVisible(),
  'anchored menu must render unequipped trinkets + empty slot')
shiftDown = false
GameTooltip = { IsEquippedItem = function() return false end }
check(ItemRack.ShouldCompareBreakoutItems(ItemRackPinnedMenu1) == false, 'ShouldCompare returns false by default on ItemRackPinnedMenu1')
ItemRackSettings.AlwaysCompareBreakoutItems = 'ON'
check(ItemRack.ShouldCompareBreakoutItems(ItemRackPinnedMenu1) == true, 'ShouldCompare compares non-empty ItemRackPinnedMenu1 items when enabled')
ItemRackSettings.AlwaysCompareBreakoutItems = 'OFF'

-- 4) Left & Right click items inside locked TrinketMenu breakout swap/queue without closing!
ItemRack.MenuOnClick(ItemRackPinnedMenu1, 'LeftButton')
ItemRack.MenuOnClick(ItemRackPinnedMenu2, 'RightButton')
check(#equips == 2 and equips[1].slot == 13 and equips[2].slot == 14 and ItemRack.IsPinnedMenuVisible(),
  'issue-39-pinned-trinketmenu: Left-Click (13) and Right-Click (14) must equip without closing locked breakout')

-- 5) Outside TrinketMenuMode, Left=manual_swap and Right=manual_hold keep locked menu open
ItemRackSettings.TrinketMenuMode = 'OFF'
combat = false
ItemRack.ButtonPostClick(ItemRackButton16, 'LeftButton') -- Shift is off -> uses item; press Shift to move pin to 16
shiftDown = true; ItemRack.ButtonPostClick(ItemRackButton16, 'LeftButton'); shiftDown = false
check(ItemRack.pinnedMenuOpen == 16 and ItemRack.IsPinnedMenuVisible(),
  'Shift+Left-Click must work on any quick-access item button outside TrinketMenu mode')
equips = {}
ItemRack.MenuOnClick(ItemRackPinnedMenu1, 'LeftButton')
ItemRack.MenuOnClick(ItemRackPinnedMenu1, 'RightButton')
check(#equips == 2 and equips[1].origin == 'manual_swap' and equips[2].origin == 'manual_hold' and ItemRack.IsPinnedMenuVisible(),
  'non-TrinketMenu locked breakout must support Left-swap and Right-hold without closing')
equips = {}
shiftDown = true
chatVisible = true
chatFocus = false
activeChatWindow = nil
keyboardFocusFrame = nil
ChatFrame1EditBox.lastInserted = nil
ItemRack.MenuOnClick(ItemRackPinnedMenu1, 'LeftButton')
check(ChatFrame1EditBox.lastInserted == nil and #equips == 1,
  'MenuOnClick with unfocused visible ChatFrame1EditBox must NOT post link into chat window')
chatFocus = true
activeChatWindow = ChatFrame1EditBox
ItemRack.MenuOnClick(ItemRackPinnedMenu1, 'LeftButton')
check(ChatFrame1EditBox.lastInserted ~= nil and #equips == 1,
  'MenuOnClick with focused chat editbox must link item instead of equipping')
shiftDown = false
chatVisible = false
chatFocus = false
activeChatWindow = nil
ChatFrame1EditBox.lastInserted = nil

-- 6) Hovering ANOTHER slot (13) opens ItemRackMenuFrame ON TOP, leaving ItemRackPinnedMenuFrame open,
--    and leaving bounds closes ONLY ItemRackMenuFrame!
mouseFocusFrame = ItemRackButton13
ItemRack.OnEnterButton(ItemRackButton13)
check(ItemRackMenuFrame:IsVisible() and ItemRack.menuOpen == 13 and ItemRack.IsPinnedMenuVisible() and ItemRack.pinnedMenuOpen == 16,
  'hovering another quick-access slot must open hover breakout on top of the locked breakout')
check(ItemRackMenuFrame:GetFrameStrata() == 'HIGH' and ItemRackPinnedMenuFrame:GetFrameStrata() == 'MEDIUM',
  'hover breakout must stay above locked breakout')
mouseFocusFrame = UIParent
ItemRack.MenuMouseover()
check(not ItemRackMenuFrame:IsVisible() and ItemRack.IsPinnedMenuVisible() and ItemRack.pinnedMenuOpen == 16,
  'moving outside hover breakout must close ONLY hover menu while locked breakout stays open underneath')

-- 7) Hovering the ALREADY-pinned button (16) does not open a duplicate hover window
mouseFocusFrame = ItemRackButton16
ItemRack.OnEnterButton(ItemRackButton16)
check(not ItemRackMenuFrame:IsVisible() and ItemRack.IsPinnedMenuVisible(),
  'hovering the already-pinned slot must not duplicate ItemRackMenuFrame over it')

-- 8) MenuOnShift Shift-release dismisses hover menu only, never pinned menu
ItemRackSettings.MenuOnShift = 'ON'
shiftDown = true; mouseFocusFrame = ItemRackButton13; ItemRack.OnEnterButton(ItemRackButton13)
check(ItemRackMenuFrame:IsVisible(), 'MenuOnShift hover opens while Shift held')
shiftDown = false; mouseFocusFrame = UIParent; ItemRack.OnModifierStateChanged()
check(not ItemRackMenuFrame:IsVisible() and ItemRack.IsPinnedMenuVisible(),
  'releasing Shift must dismiss hover menu without closing locked breakout')
ItemRackSettings.MenuOnShift = 'OFF'

-- 9) Set Button 20 retains Shift+Left-Click = UnequipSet
shiftDown = true
ItemRack.ButtonPostClick(ItemRackButton20, 'LeftButton')
check(#unequippedSets == 1 and unequippedSets[1] == 'ActiveSet' and ItemRack.pinnedMenuOpen == 16,
  'Set Button 20 Shift+Left-Click must keep unequipping the active set')
-- Toggle 16 off via Shift+Left-Click
ItemRack.ButtonPostClick(ItemRackButton16, 'LeftButton')
check(not ItemRack.IsPinnedMenuVisible() and ItemRackUser.PinnedMenuSlot == nil,
  'Shift+Left-Click on pinned button must unlock/close it')
-- AnchorOther persistence across reload
ItemRackSettings.TrinketMenuMode = 'ON'; ItemRackSettings.AnchorOther = 'ON'
ItemRack.ButtonPostClick(ItemRackButton13, 'LeftButton')
shiftDown = false
check(ItemRack.pinnedMenuOpen == 14 and ItemRack.pinnedMenuDockedTo == 'ItemRackButton14',
  'TrinketMenu AnchorOther must dock locked breakout to slot 14')
ItemRackPinnedMenuFrame:Hide()
check(ItemRack.SyncPinnedMenu() == true and ItemRackPinnedMenuFrame:IsVisible(),
  'reload SyncPinnedMenu must restore locked breakout when KeepMenuOpen is ON')
ItemRackSettings.KeepMenuOpen = 'OFF'; ItemRack.SyncPinnedMenu()
check(not ItemRack.IsPinnedMenuVisible() and ItemRackUser.PinnedMenuSlot == nil,
  'disabling KeepMenuOpen must close and clear pinned breakout')
ItemRackSettings.KeepMenuOpen = 'ON'
shiftDown = true; ItemRack.ButtonPostClick(ItemRackButton13, 'LeftButton'); shiftDown = false
check(ItemRack.pinnedMenuOpen == 14 and ItemRack.IsPinnedMenuVisible(), 're-pinning TrinketMenu breakout restores visible anchor')
ItemRack.RemoveButton(14)
check(not ItemRack.IsPinnedMenuVisible() and ItemRackUser.PinnedMenuSlot == nil,
  'removing the anchored button must clear the locked breakout cleanly')
ItemRackUser.Buttons[14] = {}
ItemRackButton14:Show()

-- 10) /itemrack debug breakouts & gate/blocker capture
activeTimers.ButtonsDocking = true
ItemRack.OnEnterButton(ItemRackButton13)
activeTimers.ButtonsDocking = nil
ItemRackSettings.MenuOnShift = 'ON'
ItemRack.OnEnterButton(ItemRackButton13)
ItemRackSettings.MenuOnShift = 'OFF'
ItemRackSettings.MenuOnRight = 'ON'
ItemRack.OnEnterButton(ItemRackButton13)
ItemRackSettings.MenuOnRight = 'OFF'
ItemRackButton16:SetAlpha(0)
ItemRack.SlashHandler('debug breakouts')
local report = ItemRack.GetMenuDiagnosticReport(false)
check(ItemRack.DebugTags.Breakouts == true, '/itemrack debug breakouts must toggle Breakouts tag')
check(report.lastBreakoutProbe and #report.lastBreakoutProbe.blockers >= 1,
  '/itemrack debug breakouts must detect zero-alpha button blocker')
check(#report.gateEvents >= 3, 'gateEvents must retain recent hover/click/render blocker reasons')
local sawDock, sawShift, sawRight = false, false, false
for _, ev in ipairs(report.gateEvents) do
  if ev.reason == 'buttons_docking' then sawDock = true end
  if ev.reason == 'requires_shift' then sawShift = true end
  if ev.reason == 'menu_on_right' then sawRight = true end
end
check(sawDock and sawShift and sawRight,
  'breakout gate recorder must distinguish ButtonsDocking, MenuOnShift, and MenuOnRight blockers')

print(string.format('[PINNED BREAKOUT & DEBUG LUA] %d anchored-breakout and blocker-diagnostic checks passed.', checks))
`, 'issue-39-pinned-breakout-and-debug');

// GitHub #42 (Zwyk, Forever 1.60.1.71037 / 71139):
// RefreshQuickAccessMenuSnapshots single-pass batching, input-change skipping across
// combat_entry_refresh / combat_exit_refresh / inventory_refresh, ItemRackTooltip self-hook
// isolation, and IsSoulbound C_Container.GetContainerItemInfo fast path.
runLua(String.raw`
local checks = 0
local function check(cond, msg)
  assert(cond, msg)
  checks = checks + 1
end

local now = 1000
local combat, unitCombat = false, false
local altDown = false
local playerLevel = 60
local skillLines = 12
local getNumSlotsCalls = 0
local getItemIdCalls = 0
local setBagItemCalls = 0
local getIdCalls = 0
local listSetsCalls = 0

function GetTime() return now end
function debugprofilestop() return now * 1000 end
function InCombatLockdown() return combat end
function UnitAffectingCombat(u) return u == 'player' and unitCombat or false end
function IsAltKeyDown() return altDown end
function IsShiftKeyDown() return false end
function IsControlKeyDown() return false end
function UnitLevel(u) return playerLevel end
function GetNumSkillLines() return skillLines end
function GetLocale() return 'enUS' end
function GetNumAddOns() return 0 end
WOW_PROJECT_ID = 18
wowver, wowbuild, wowtoc = '1.60.1', '71139', 16001
ITEM_SOULBOUND = 'Soulbound'
ITEM_BIND_QUEST = 'Quest Item'
ITEM_CONJURED = 'Conjured Item'

-- 5 bags matching real Forever dump shape: 20 + 14 + 14 + 16 + 18 = 82 slots
local bagSizes = { [0]=20, [1]=14, [2]=14, [3]=16, [4]=18 }
local bagItems = { [0]={}, [1]={}, [2]={}, [3]={}, [4]={} }
local itemMeta = {
  ['1001:0:0:0:0:0:0:0'] = { name='Worn Helm', tex='tex1001', equip='INVTYPE_HEAD', bound=true },
  ['1008:0:0:0:0:0:0:0'] = { name='Worn Boots', tex='tex1008', equip='INVTYPE_FEET', bound=true },
  ['1301:0:0:0:0:0:0:0'] = { name='Worn Trinket A', tex='tex1301', equip='INVTYPE_TRINKET', bound=true },
  ['1302:0:0:0:0:0:0:0'] = { name='Worn Trinket B', tex='tex1302', equip='INVTYPE_TRINKET', bound=true },
  ['1601:0:0:0:0:0:0:0'] = { name='Worn Mainhand', tex='tex1601', equip='INVTYPE_WEAPONMAINHAND', bound=true },
  ['1701:0:0:0:0:0:0:0'] = { name='Worn Shield', tex='tex1701', equip='INVTYPE_SHIELD', bound=true },
  ['1801:0:0:0:0:0:0:0'] = { name='Worn Bow', tex='tex1801', equip='INVTYPE_RANGED', bound=true },
  ['2301:0:0:0:0:0:0:0'] = { name='Bag Trinket 1', tex='tex2301', equip='INVTYPE_TRINKET', bound=true },
  ['2302:0:0:0:0:0:0:0'] = { name='Bag Trinket 2', tex='tex2302', equip='INVTYPE_TRINKET', bound=true },
  ['2601:0:0:0:0:0:0:0'] = { name='Bag OneHand 1', tex='tex2601', equip='INVTYPE_WEAPON', bound=true },
  ['2602:0:0:0:0:0:0:0'] = { name='Bag HighLevel Sword', tex='tex2602', equip='INVTYPE_WEAPON', bound=true, minLevel=65 },
  ['2101:0:0:0:0:0:0:0'] = { name='Bag Ring 1', tex='tex2101', equip='INVTYPE_FINGER', bound=true },
  ['2303:0:0:0:0:0:0:0'] = { name='Bag Trinket 3', tex='tex2303', equip='INVTYPE_TRINKET', bound=true },
  ['2304:0:0:0:0:0:0:0'] = { name='Tradable Trinket', tex='tex2304', equip='INVTYPE_TRINKET', bound=false },
  ['2305:0:0:0:0:0:0:0'] = { name='Conjured Trinket', tex='tex2305', equip='INVTYPE_TRINKET', bound=false, tipLine=ITEM_CONJURED },
  ['9000:0:0:0:0:0:0:0'] = { name='Major Mana Potion', tex='tex9000', equip='', bound=false },
  ['9001:0:0:0:0:0:0:0'] = { name='Plate Chest', tex='tex9001', equip='INVTYPE_CHEST', bound=true },
}

-- Fill 55 occupied slots (51 consumables/non-matching + 4 matching) and leave 27 empty slots
local filled = 0
for b = 0, 4 do
  for j = 1, bagSizes[b] do
    if b == 4 and j == 15 then
      bagItems[b][j] = '2301:0:0:0:0:0:0:0'; filled = filled + 1
    elseif b == 4 and j == 16 then
      bagItems[b][j] = '2302:0:0:0:0:0:0:0'; filled = filled + 1
    elseif b == 4 and j == 17 then
      bagItems[b][j] = '2601:0:0:0:0:0:0:0'; filled = filled + 1
    elseif b == 4 and j == 18 then
      bagItems[b][j] = '2602:0:0:0:0:0:0:0'; filled = filled + 1
    elseif filled < 51 then
      bagItems[b][j] = (filled % 2 == 0) and '9000:0:0:0:0:0:0:0' or '9001:0:0:0:0:0:0:0'
      filled = filled + 1
    end
  end
end

local worn = {
  [1] = '1001:0:0:0:0:0:0:0',
  [8] = '1008:0:0:0:0:0:0:0',
  [13] = '1301:0:0:0:0:0:0:0',
  [14] = '1302:0:0:0:0:0:0:0',
  [16] = '1601:0:0:0:0:0:0:0',
  [17] = '1701:0:0:0:0:0:0:0',
  [18] = '1801:0:0:0:0:0:0:0',
}

function GetContainerNumSlots(bag)
  getNumSlotsCalls = getNumSlotsCalls + 1
  return bagSizes[bag] or 0
end
function GetContainerItemID(bag, slot)
  getItemIdCalls = getItemIdCalls + 1
  local id = bagItems[bag] and bagItems[bag][slot]
  return id and tonumber(id:match('^(%d+)')) or nil
end
C_Container = {
  GetContainerNumSlots = GetContainerNumSlots,
  GetContainerItemID = GetContainerItemID,
  GetContainerItemInfo = function(bag, slot)
    local id = bagItems[bag] and bagItems[bag][slot]
    if not id then return nil end
    local meta = itemMeta[id]
    return { isBound = meta and meta.bound or false, itemID = tonumber(id:match('^(%d+)')) }
  end,
}

local function makeLine()
  local text, r, g, b = '', 1, 1, 1
  return {
    SetText = function(_, t, cr, cg, cb) text = t or ''; r = cr or 1; g = cg or 1; b = cb or 1 end,
    GetText = function() return text end,
    SetTextColor = function(_, cr, cg, cb) r, g, b = cr, cg, cb end,
    GetTextColor = function() return r, g, b end,
  }
end
for i = 1, 8 do
  _G['ItemRackTooltipTextLeft'..i] = makeLine()
  _G['ItemRackTooltipTextRight'..i] = makeLine()
  _G['GameTooltipTextLeft'..i] = makeLine()
end

local tipLineCount = 0
ItemRackTooltip = {
  GetName = function() return 'ItemRackTooltip' end,
  NumLines = function() return tipLineCount end,
  AddDoubleLine = function() error('ItemRackTooltip must never receive ItemRack Set tooltip lines') end,
  SetBagItem = function(self, bag, slot)
    setBagItemCalls = setBagItemCalls + 1
    for i = 1, 8 do
      _G['ItemRackTooltipTextLeft'..i]:SetText('', 1, 1, 1)
      _G['ItemRackTooltipTextRight'..i]:SetText('', 1, 1, 1)
    end
    local id = bagItems[bag] and bagItems[bag][slot]
    local meta = id and itemMeta[id]
    tipLineCount = 2
    _G['ItemRackTooltipTextLeft1']:SetText(meta and meta.name or 'Item', 1, 1, 1)
    _G['ItemRackTooltipTextLeft2']:SetText(meta and meta.tipLine or (meta and meta.bound and ITEM_SOULBOUND or 'Binds when equipped'), 1, 1, 1)
    if meta and meta.minLevel and playerLevel < meta.minLevel then
      tipLineCount = 5
      _G['ItemRackTooltipTextLeft5']:SetText('Requires Level '..meta.minLevel, 1, 0.1, 0.1)
    end
    -- Simulate modern TooltipDataProcessor + SetBagItem post-hooks firing on EVERY tooltip!
    if ItemRack and ItemRack.OnTooltipItemData then
      ItemRack.OnTooltipItemData(self, { getterName='GetBagItem', getterArgs={ bag, slot } })
    end
    if ItemRack and ItemRack.OnSetBagItem then
      ItemRack.OnSetBagItem(self, bag, slot)
    end
  end,
}

local gameTipAdded = {}
GameTooltip = {
  GetName = function() return 'GameTooltip' end,
  NumLines = function() return 1 end,
  AddDoubleLine = function(_, l, r) gameTipAdded[#gameTipAdded + 1] = l..r end,
}

ItemRackUser = {
  Buttons = { [1]={}, [8]={}, [13]={}, [14]={} },
  Hidden = {},
  Sets = {},
}
for s = 1, 15 do
  ItemRackUser.Sets['Set'..s] = { equip = { [13] = (s == 3) and '2301:0:0:0:0:0:0:0' or ('99'..s..':0:0:0:0:0:0:0') } }
end
ItemRackSettings = {
  AllowEmpty = 'ON',
  AllowHidden = 'OFF',
  HideTradables = 'OFF',
  ShowTooltips = 'ON',
  ShowSetInTooltip = 'ON',
}
ItemRackMenuFrame = { IsShown = function() return false end, IsVisible = function() return false end }

ItemRack = {
  Menu = {},
  SetsWaiting = {},
  BankOpen = nil,
  BankSlots = { -1, 5, 6, 7, 8, 9, 10, 11 },
  CanWearOneHandOffHand = nil,
  DURABILITY_PATTERN = 'Durability',
  MIN_LEVEL_PATTERN = '^Requires Level %d+',
  CLASSES_PATTERN = '^Classes: .+',
  RACES_PATTERN = '^Races: .+',
  MIN_SKILL_PATTERN = '^Requires .+ %(%d+%)',
  REQUIRES_PATTERN = '^Requires .+',
  REQ_REP_PATTERN = '^Requires .+ %- .+',
  iSPatternItemFieldsFromIR = '^(%-?%d+:[^:]*:[^:]*:[^:]*:[^:]*:[^:]*:[^:]*:[^:]*)',
  SlotInfo = {
    [0] = {},
    [1] = { INVTYPE_HEAD=1 },
    [8] = { INVTYPE_FEET=1 },
    [11] = { INVTYPE_FINGER=1, other=12 },
    [12] = { INVTYPE_FINGER=1, other=11 },
    [13] = { INVTYPE_TRINKET=1, other=14 },
    [14] = { INVTYPE_TRINKET=1, other=13 },
    [16] = { INVTYPE_WEAPON=1, INVTYPE_WEAPONMAINHAND=1, INVTYPE_2HWEAPON=1, other=17 },
    [17] = { INVTYPE_WEAPON=1, INVTYPE_WEAPONOFFHAND=1, INVTYPE_SHIELD=1, INVTYPE_HOLDABLE=1, other=16 },
    [18] = { INVTYPE_RANGED=1, INVTYPE_RANGEDRIGHT=1, INVTYPE_THROWN=1, INVTYPE_RELIC=1 },
  },
  IsForever = function() return true end,
  Debug = function() end,
  StartTimer = function() end,
  RunAllEvents = function() end,
  ProcessCombatQueue = function() end,
  ReflectHideOOC = function() end,
  IsHidden = function(id) return ItemRackUser.Hidden and ItemRackUser.Hidden[id] and true or false end,
  GetID = function(a, b)
    getIdCalls = getIdCalls + 1
    if b ~= nil then
      return (bagItems[a] and bagItems[a][b]) or 0
    end
    return worn[a] or 0
  end,
  GetInfoByID = function(id)
    if not id or id == 0 then return nil, nil, nil end
    local meta = itemMeta[id]
    if meta then return meta.name, meta.tex, meta.equip end
    return 'Unknown', 'tex', ''
  end,
  GetIRString = function(link) return link end,
  HasRuneID = function() return false end,
  GetRuneID = function() return nil end,
}

${diagnosticFunctions}
${alreadyInMenu}
${addToMenu}
${getSnapshotKey}
${storeSnapshot}
${restoreSnapshot}
${discoverItems}
${isCombatEquipRestriction}
local data = {}
${[
  'IsRed','PlayerCanWear','IsSoulbound','NormalizeItemFields','SameItemFields',
  'MatchesStoredItemFields','ListSetsHavingItem','OnSetBagItem','OnSetInventoryItem',
  'OnSetHyperlink','OnTooltipItemData','MenuSnapshotInputs','SameMenuSnapshotInputs',
  'RefreshMenuSnapshotsBatch','RefreshQuickAccessMenuSnapshots',
  'OnEnteringCombat','OnLeavingCombatOrDeath',
].map(name => extractFunction(coreFile, `ItemRack.${name}`)).join('\n')}

local origListSets = ItemRack.ListSetsHavingItem
ItemRack.ListSetsHavingItem = function(tip, id)
  if tip ~= ItemRackTooltip then listSetsCalls = listSetsCalls + 1 end
  return origListSets(tip, id)
end

-- 1) Compute baseline snapshots via legacy per-slot DiscoverEquipmentMenuItems for exact equivalence check
local expectedSnapshots = {}
local expectedCounts = {}
for _, slot in ipairs({1, 8, 13, 14, 16, 17, 18}) do
  for _, inc in ipairs({false, true}) do
    local d = ItemRack.BeginMenuDiagnostic(slot, inc, 'legacy_ref')
    ItemRack.Menu = {}
    ItemRack.DiscoverEquipmentMenuItems(slot, inc, d)
    ItemRack.StoreMenuSnapshot(slot, inc, d)
    ItemRack.FinishMenuDiagnostic(d)
    local key = ItemRack.GetMenuSnapshotKey(slot, inc)
    expectedSnapshots[key] = ItemRack.MenuSnapshots[key]
    expectedCounts[key] = {
      visited = d.visited, empty = d.emptyBagSlots, mismatch = d.slotMismatch,
      accepted = d.accepted, wear = d.wearRejected,
    }
  end
end
ItemRack.MenuSnapshots = {}
ItemRack.MenuDiagnostics = nil
ItemRack.SnapshotInputsState = nil
ItemRack.SnapshotRefreshStats = nil

-- 2) Run optimized RefreshQuickAccessMenuSnapshots ('inventory_refresh')
getNumSlotsCalls, getItemIdCalls, setBagItemCalls, listSetsCalls = 0, 0, 0, 0
check(ItemRack.RefreshQuickAccessMenuSnapshots(nil, 'inventory_refresh') == true,
  'issue-42: initial OOC RefreshQuickAccessMenuSnapshots must succeed')
check(setBagItemCalls == 4,
  'issue-42: single-pass batch refresh must call ItemRackTooltip:SetBagItem once per matching bag item (expected 4, got '..tostring(setBagItemCalls)..')')
check(getNumSlotsCalls == 5,
  'issue-42: single-pass batch refresh with precomputed inputs must query GetContainerNumSlots 5 times total (got '..tostring(getNumSlotsCalls)..')')
check(getItemIdCalls == 27,
  'issue-42: empty-slot GetContainerItemID diagnostic must run once per empty slot (expected 27, got '..tostring(getItemIdCalls)..')')
check(listSetsCalls == 0,
  'issue-42: ItemRackTooltip:SetBagItem must never trigger OnTooltipItemData / ListSetsHavingItem')

for key, exp in pairs(expectedSnapshots) do
  local got = ItemRack.MenuSnapshots[key]
  check(type(got) == 'table' and #got == #exp,
    'issue-42: batch snapshot length must match DiscoverEquipmentMenuItems for '..key)
  for i = 1, #exp do
    check(got[i] == exp[i], 'issue-42: batch snapshot item '..i..' must match for '..key)
  end
end
for _, slot in ipairs({1, 8, 13, 14, 16, 17, 18}) do
  for _, inc in ipairs({false, true}) do
    local key = ItemRack.GetMenuSnapshotKey(slot, inc)
    local d = ItemRack.MenuDiagnostics.latest[key..':ooc']
    local exp = expectedCounts[key]
    check(d and d.visited == exp.visited and d.emptyBagSlots == exp.empty
      and d.slotMismatch == exp.mismatch and d.accepted == exp.accepted and d.wearRejected == exp.wear,
      'issue-42: batch diagnostic counters must match legacy scan for '..key)
  end
end

-- 3) GameTooltip ShowSetInTooltip OFF vs ON
ItemRackSettings.ShowSetInTooltip = 'OFF'
local beforeGetId = getIdCalls
ItemRack.OnSetBagItem(GameTooltip, 4, 15)
ItemRack.OnSetInventoryItem(GameTooltip, 'player', 13)
check(getIdCalls == beforeGetId and #gameTipAdded == 0,
  'issue-42: OnSetBagItem / OnSetInventoryItem must return before calling GetID when ShowSetInTooltip is OFF')
ItemRackSettings.ShowSetInTooltip = 'ON'
ItemRack.OnSetBagItem(GameTooltip, 4, 15)
check(#gameTipAdded == 1 and gameTipAdded[1] == 'ItemRack Set: Set3',
  'issue-42: GameTooltip must still receive ItemRack Set line when ShowSetInTooltip is ON')

-- 4) Unchanged combat_entry_refresh, combat_exit_refresh, and inventory_refresh must skip re-scanning
setBagItemCalls = 0
unitCombat = true
ItemRack.OnEnteringCombat()
check(setBagItemCalls == 0 and ItemRack.SnapshotRefreshStats.skipped == 1
  and ItemRack.SnapshotRefreshStats.lastSkippedReason == 'combat_entry_refresh',
  'issue-42: unchanged combat_entry_refresh must skip tooltip/bag rescanning')

combat = false; unitCombat = false; ItemRack.inCombat = nil
ItemRack.OnLeavingCombatOrDeath()
check(setBagItemCalls == 0 and ItemRack.SnapshotRefreshStats.skipped == 2
  and ItemRack.SnapshotRefreshStats.lastSkippedReason == 'combat_exit_refresh',
  'issue-42: unchanged combat_exit_refresh must skip tooltip/bag rescanning')

ItemRack.RefreshQuickAccessMenuSnapshots(nil, 'inventory_refresh')
check(setBagItemCalls == 0 and ItemRack.SnapshotRefreshStats.skipped == 3,
  'issue-42: unchanged inventory_refresh must skip tooltip/bag rescanning')

local report = ItemRack.GetMenuDiagnosticReport(false)
check(report.snapshotRefresh and report.snapshotRefresh.refreshed == 1 and report.snapshotRefresh.skipped == 3,
  'issue-42: GetMenuDiagnosticReport must expose snapshotRefresh stats')

-- 5) Cache invalidation on real input changes
-- 5a) Bag item looted
bagItems[0][19] = '2303:0:0:0:0:0:0:0'
setBagItemCalls = 0
ItemRack.RefreshQuickAccessMenuSnapshots(nil, 'inventory_refresh')
check(setBagItemCalls == 5 and #ItemRack.MenuSnapshots['13:bags'] == 4,
  'issue-42: looting a new trinket must invalidate snapshot inputs and include the new item')

-- 5b) Worn item swapped
worn[13] = '2301:0:0:0:0:0:0:0'
setBagItemCalls = 0
ItemRack.RefreshQuickAccessMenuSnapshots(nil, 'combat_entry_refresh')
check(setBagItemCalls == 5 and ItemRack.MenuSnapshots['13:included'][1] == '2301:0:0:0:0:0:0:0',
  'issue-42: changing worn equipment must invalidate snapshot inputs on combat_entry_refresh')

-- 5c) Hidden item toggled (AllowHidden='ON' enables hiding; Alt temporarily reveals)
ItemRackSettings.AllowHidden = 'ON'
ItemRackUser.Hidden['2303:0:0:0:0:0:0:0'] = 1
setBagItemCalls = 0
ItemRack.RefreshQuickAccessMenuSnapshots(nil, 'inventory_refresh')
check(setBagItemCalls == 5 and #ItemRack.MenuSnapshots['13:bags'] == 3,
  'issue-42: hiding an item with AllowHidden=ON must invalidate snapshot inputs and exclude it')
altDown = true
setBagItemCalls = 0
ItemRack.RefreshQuickAccessMenuSnapshots(nil, 'inventory_refresh')
check(setBagItemCalls == 5 and #ItemRack.MenuSnapshots['13:bags'] == 4,
  'issue-42: holding Alt with AllowHidden=ON must re-scan and include hidden item')
altDown = false; ItemRackSettings.AllowHidden = 'OFF'; ItemRackUser.Hidden = {}
ItemRack.RefreshQuickAccessMenuSnapshots(nil, 'inventory_refresh')

-- 5d) Dual-wield capability change (CanWearOneHandOffHand) & level-up wearability
check(#ItemRack.MenuSnapshots['17:bags'] == 1, 'slot 17 starts with only empty-slot row 0 when CanWearOneHandOffHand is false')
ItemRack.CanWearOneHandOffHand = 1
ItemRack.RefreshQuickAccessMenuSnapshots(nil, 'inventory_refresh')
check(#ItemRack.MenuSnapshots['17:bags'] == 2 and ItemRack.MenuSnapshots['17:bags'][1] == '2601:0:0:0:0:0:0:0',
  'issue-42: learning Dual Wield must invalidate inputs and admit one-hand weapon into slot 17')
playerLevel = 70
ItemRack.RefreshQuickAccessMenuSnapshots(nil, 'inventory_refresh')
check(#ItemRack.MenuSnapshots['17:bags'] == 3,
  'issue-42: leveling up must invalidate inputs and admit previously red-level weapon')

-- 5e) Newly added button without existing snapshot must force refresh
ItemRackUser.Buttons[11] = {}
bagItems[0][20] = '2101:0:0:0:0:0:0:0'
ItemRack.RefreshQuickAccessMenuSnapshots(nil, 'inventory_refresh')
ItemRack.MenuSnapshots['11:bags'] = nil
setBagItemCalls = 0
ItemRack.RefreshQuickAccessMenuSnapshots(nil, 'combat_exit_refresh')
check(setBagItemCalls > 0 and type(ItemRack.MenuSnapshots['11:bags']) == 'table',
  'issue-42: missing slot snapshot must prevent skipping even when inputs match')

-- 5f) Partial onlySlot refresh invalidates full-bar input cache; MaxAge (600s) forces periodic refresh
ItemRack.RefreshQuickAccessMenuSnapshots(1, 'single_slot')
setBagItemCalls = 0
ItemRack.RefreshQuickAccessMenuSnapshots(nil, 'inventory_refresh')
check(setBagItemCalls > 0, 'issue-42: partial onlySlot refresh must invalidate full-bar input cache')
setBagItemCalls = 0
now = now + 601
ItemRack.RefreshQuickAccessMenuSnapshots(nil, 'combat_entry_refresh')
check(setBagItemCalls > 0, 'issue-42: SnapshotMaxAge expiry must force refresh after 600s')

-- 5g) Combat-preserved empty scan must NOT cache stale SnapshotInputsState
local savedBags = bagItems
bagItems = { [0]={}, [1]={}, [2]={}, [3]={}, [4]={} }
worn[13], worn[14] = 0, 0
unitCombat = true
ItemRack.RefreshQuickAccessMenuSnapshots(nil, 'combat_entry_refresh')
check(ItemRack.SnapshotInputsState == nil and #ItemRack.MenuSnapshots['13:bags'] > 0,
  'issue-42: StoreMenuSnapshot combat preservation must clear SnapshotInputsState so OOC refreshes re-scan')
unitCombat = false
bagItems = savedBags
worn[13] = '1301:0:0:0:0:0:0:0'; worn[14] = '1302:0:0:0:0:0:0:0'

-- 6) IsSoulbound fast path via C_Container.GetContainerItemInfo().isBound + conjured tooltip fallback
bagItems[1][13] = '2304:0:0:0:0:0:0:0' -- tradable BoE
bagItems[1][14] = '2305:0:0:0:0:0:0:0' -- conjured (isBound=false, tooltip line=ITEM_CONJURED)
setBagItemCalls = 0
check(ItemRack.IsSoulbound(4, 15) == 1 and setBagItemCalls == 0,
  'issue-42: IsSoulbound must return 1 via GetContainerItemInfo().isBound without calling SetBagItem')
check(ItemRack.IsSoulbound(1, 13) == nil and setBagItemCalls == 1,
  'issue-42: IsSoulbound must fall back to tooltip and reject tradable BoE item')
check(ItemRack.IsSoulbound(1, 14) == 1 and setBagItemCalls == 2,
  'issue-42: IsSoulbound must still accept ITEM_CONJURED items via tooltip fallback')

ItemRackSettings.HideTradables = 'ON'
ItemRack.RefreshQuickAccessMenuSnapshots(nil, 'inventory_refresh')
local bags13 = ItemRack.MenuSnapshots['13:bags']
local sawTradable, sawConjured = false, false
for _, id in ipairs(bags13) do
  if id == '2304:0:0:0:0:0:0:0' then sawTradable = true end
  if id == '2305:0:0:0:0:0:0:0' then sawConjured = true end
end
check(not sawTradable and sawConjured,
  'issue-42: HideTradables=ON batch scan must reject tradable BoE while retaining soulbound and conjured items')

print(string.format('[ISSUE 42 FOREVER SNAPSHOT PERF LUA] %d batching, skip-cache, tooltip-isolation and soulbound checks passed.', checks))
`, 'issue-42-forever-snapshot-refresh-and-tooltip-isolation');
