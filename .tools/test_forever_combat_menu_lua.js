const { extractFunction, runLua } = require('./lib/lua_harness');

const coreFile = 'ItemRack/ItemRack.lua';
const alreadyInMenu = extractFunction(coreFile, 'ItemRack.AlreadyInMenu');
const addToMenu = extractFunction(coreFile, 'ItemRack.AddToMenu');
const getSnapshotKey = extractFunction(coreFile, 'ItemRack.GetMenuSnapshotKey');
const storeSnapshot = extractFunction(coreFile, 'ItemRack.StoreMenuSnapshot');
const restoreSnapshot = extractFunction(coreFile, 'ItemRack.RestoreMenuSnapshot');
const discoverItems = extractFunction(coreFile, 'ItemRack.DiscoverEquipmentMenuItems');
const refreshSnapshots = extractFunction(coreFile, 'ItemRack.RefreshQuickAccessMenuSnapshots');
const buildMenu = extractFunction(coreFile, 'ItemRack.BuildMenu');
const menuOnClick = extractFunction(coreFile, 'ItemRack.MenuOnClick');

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

print(string.format("[FOREVER COMBAT MENU LUA] %d reported-path checks passed.",checks))
`, 'forever-combat-menu');
