const { extractFunction, runLua } = require('./lib/lua_harness');
const assert = require('assert');
const fs = require('fs');

const coreFile = 'ItemRack/ItemRack.lua';
const coreSource = fs.readFileSync(coreFile,'utf8');
assert(coreSource.includes('=== BREAKOUT DISCOVERY DIAGNOSTICS ===')
  && coreSource.includes('pcall(ItemRack.GetMenuDiagnosticReport)'),
  'breakout-diagnostics-dump: include the recorder without letting collection failure abort /dump');
const alreadyInMenu = extractFunction(coreFile, 'ItemRack.AlreadyInMenu');
const addToMenu = extractFunction(coreFile, 'ItemRack.AddToMenu');
const getSnapshotKey = extractFunction(coreFile, 'ItemRack.GetMenuSnapshotKey');
const storeSnapshot = extractFunction(coreFile, 'ItemRack.StoreMenuSnapshot');
const restoreSnapshot = extractFunction(coreFile, 'ItemRack.RestoreMenuSnapshot');
const discoverItems = extractFunction(coreFile, 'ItemRack.DiscoverEquipmentMenuItems');
const refreshSnapshots = extractFunction(coreFile, 'ItemRack.RefreshQuickAccessMenuSnapshots');
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
ItemRack={Menu={},MenuSnapshots={},SlotInfo={[13]={INVTYPE_TRINKET=true}},
  DURABILITY_PATTERN='Durability',REQUIRES_PATTERN='Requires',
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
local lineText='Trinket'
for i=1,2 do
  for _,side in ipairs({'Left','Right'}) do
    _G['ItemRackTooltipText'..side..i]={
      SetTextColor=function() end,
      GetText=function() return lineText end,
      GetTextColor=function()
        if mode=='red_tooltip' and side=='Left' and i==2 then return 1,0,0 end
        return 1,1,1
      end,
    }
  end
end
ItemRackTooltip={SetBagItem=function()
  lineText=mode=='red_tooltip' and 'Cannot equip during combat' or 'Trinket'
end,NumLines=function() return 2 end}

${diagnosticFunctions}
${alreadyInMenu}
${addToMenu}
${getSnapshotKey}
${storeSnapshot}
${discoverItems}
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
