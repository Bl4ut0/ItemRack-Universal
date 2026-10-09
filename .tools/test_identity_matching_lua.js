const fs = require('fs');
const { extractFunction, runLua } = require('./lib/lua_harness');

const core = 'ItemRack/ItemRack.lua';
const queue = 'ItemRack/ItemRackQueue.lua';
const options = 'ItemRackOptions/ItemRackOptions.lua';
// October 8 report/video: https://imgur.com/a/v7eD8FY (attached OLaVTW6.mp4).
// Native layout is modeled; this verifies the anchor contract, not client rendering.
const tooltipSource = fs.readFileSync(core, 'utf8');
const anchorHooks = tooltipSource.slice(tooltipSource.indexOf('hooksecurefunc(GameTooltip, "Show",'),
  tooltipSource.indexOf('function ItemRack.DockMenuToCharacterSheet'));
runLua(String.raw`
ItemRack={SlotInfo={}}
for i=0,19 do ItemRack.SlotInfo[i]={name='Slot'..i} end
ItemRack.SlotInfo[11].name='Finger0Slot'
ItemRackSettings={CharacterSheetMenus='ON',MenuOnShift='OFF',RightSlotsGoLeft='OFF',LeftSlotsGoRight='ON'}
local slot={GetName=function() return 'CharacterFinger0Slot' end,GetTop=function() return 300 end}
ItemRackMenuFrame={visible=true,IsVisible=function(s) return s.visible end,
  GetName=function() return 'ItemRackMenuFrame' end,GetTop=function() return 300 end}
GameTooltip={alpha=1,owner=slot,side='none',scripts={},content='saved item',ownerCalls=0}
function GameTooltip:SetAlpha(a) self.alpha=a end
function GameTooltip:GetOwner() return self.owner end
function GameTooltip:SetOwner(o,a) self.owner=o; self.nativeAnchor=a; self.side=a; self.ownerCalls=self.ownerCalls+1 end
function GameTooltip:SetAnchorType(a) self.nativeAnchor=a end
function GameTooltip:ClearAllPoints() end
function GameTooltip:SetPoint(p,_,_,_,y) self.side=p=='TOPRIGHT' and 'LEFT' or 'RIGHT'; self.y=y end
function GameTooltip:Show() end
function GameTooltip:HookScript(n,f) self.scripts[n]=f end
function hooksecurefunc(t,n,f) local old=t[n]; t[n]=function(self,...) old(self,...); f(self,...) end end
function IsShiftKeyDown() return false end
ItemRack.IsEquipmentManagerOpen=function() return false end
ItemRack.DockMenuToCharacterSheet=function(s) ItemRack.menuDockedTo=s:GetName(); ItemRackMenuFrame.visible=true end
ItemRack.oldPaperDollItemSlotButton_OnEnter=function(s) GameTooltip:SetOwner(s,'ANCHOR_RIGHT'); GameTooltip:Show() end
${extractFunction(core,'ItemRack.ApplyTooltipAnchor')}
${extractFunction(core,'PaperDollItemSlotButton_OnEnter')}
${anchorHooks}
local function nativeLayout()
  if GameTooltip.nativeAnchor~='ANCHOR_NONE' then GameTooltip.side='RIGHT' end
end
for _,count in ipairs({1,2,40}) do
  ItemRack.Menu={}; for i=1,count do ItemRack.Menu[i]=i end
  ItemRack.menuDockedTo=nil
  PaperDollItemSlotButton_OnEnter(slot)
  assert(GameTooltip.nativeAnchor=='ANCHOR_NONE','reported tooltip hop: manual placement must disable native side anchoring')
  assert(GameTooltip.side=='LEFT' and GameTooltip.alpha==1,'ring tooltip must retain intended left placement')
  local ownerCalls=GameTooltip.ownerCalls
  for i=1,3 do
    nativeLayout()
    assert(GameTooltip.side=='LEFT','layout refresh must not expose a right-side intermediate position')
    GameTooltip:Show()
    assert(GameTooltip.side=='LEFT','Show refresh must keep left placement')
  end
  assert(GameTooltip.owner==slot and GameTooltip.content=='saved item' and GameTooltip.ownerCalls==ownerCalls,
    'positioning must preserve native owner/content without rebuilding or showing item data')
end
ItemRackSettings.RightSlotsGoLeft='ON'; PaperDollItemSlotButton_OnEnter(slot)
assert(GameTooltip.side=='RIGHT' and GameTooltip.nativeAnchor=='ANCHOR_NONE','opposite menu direction must retain right tooltip placement')
-- Stale vertical alignment must not leak from flyout rows into an equipped slot.
ItemRack.pendingTooltipVerticalOwner={GetTop=function() return 999 end}
PaperDollItemSlotButton_OnEnter(slot)
assert(GameTooltip.y==0,'new character hover must clear stale flyout vertical offset')
-- Unrelated owners and another character slot must not inherit the pending anchor.
for _,name in ipairs({'ActionButton1','ContainerFrame1Item1','ItemRackButton11','ItemRackOptInv11','CharacterSlot8'}) do
  ItemRack.pendingTooltipOwner=slot; ItemRack.pendingTooltipAnchor='ANCHOR_LEFT'
  GameTooltip:SetOwner({GetName=function() return name end},'ANCHOR_RIGHT')
  GameTooltip:Show()
  assert(GameTooltip.nativeAnchor=='ANCHOR_RIGHT' and GameTooltip.side=='ANCHOR_RIGHT','unrelated tooltip must remain untouched: '..name)
  assert(ItemRack.pendingTooltipAnchor==nil,'unrelated tooltip must clear stale override')
end
-- A flyout tooltip retains its real owner and row alignment.
local row={GetName=function() return 'ItemRackMenu1' end,GetTop=function() return 250 end}
GameTooltip:SetOwner(row,'ANCHOR_RIGHT'); ItemRack.pendingTooltipOwner=ItemRackMenuFrame
ItemRack.pendingTooltipAnchor='ANCHOR_RIGHT'; ItemRack.pendingTooltipVerticalOwner=row
GameTooltip:Show()
assert(GameTooltip.owner==row and GameTooltip.nativeAnchor=='ANCHOR_NONE' and GameTooltip.y==-50,
  'flyout alignment must not change tooltip ownership')
GameTooltip.scripts.OnHide()
assert(not ItemRack.pendingTooltipAnchor and not ItemRack.pendingTooltipOwner and not ItemRack.pendingTooltipVerticalOwner,
  'hide must clear the complete positioning context')
-- Missing API clients must not crash or clear item data; live behavior remains acceptance.
GameTooltip.SetAnchorType=nil; ItemRack.menuDockedTo=slot:GetName()
GameTooltip:SetOwner(slot,'ANCHOR_RIGHT'); ItemRack.pendingTooltipOwner=slot; ItemRack.pendingTooltipAnchor='ANCHOR_LEFT'
ItemRack.ApplyTooltipAnchor()
assert(GameTooltip.side=='LEFT' and GameTooltip.content=='saved item','missing anchor API fallback must remain safe')
ItemRackSettings.CharacterSheetMenus='OFF'; ItemRack.pendingTooltipAnchor=nil; ItemRackMenuFrame.visible=false
PaperDollItemSlotButton_OnEnter(slot)
assert(GameTooltip.nativeAnchor=='ANCHOR_RIGHT','disabled character menus must retain native tooltip behavior')
`, 'reported-character-tooltip-anchor-hop');
// Forever user report, October 8, 2026: data-processed tooltips bypass legacy setters.
runLua(String.raw`
local lines,hooks,registrations={},0,0
ItemRack={GetIRString=function(link) return link:match("item:(.-)|h") or 0 end,
  MatchesStoredItemFields=function(a,b) return a==b end}
ItemRackSettings={ShowTooltips="ON",ShowSetInTooltip="ON"}
ItemRackUser={Sets={Prot={equip={[8]="32267:2649:24056:24062"}},
  Other={equip={[8]="32267:2649:24056:31867"}},["~Internal"]={equip={[8]="32267:2649:24056:24062"}}}}
local data={}
${extractFunction(core,'ItemRack.ListSetsHavingItem')}
${extractFunction(core,'ItemRack.OnSetHyperlink')}
${extractFunction(core,'ItemRack.OnTooltipItemData')}
${extractFunction(core,'ItemRack.RegisterSetTooltipHooks')}
local callback
Enum={TooltipDataType={Item=0}}
TooltipDataProcessor={AddTooltipPostCall=function(_,fn) registrations=registrations+1; callback=fn end}
GameTooltip={SetBagItem=function() end,SetInventoryItem=function() end,SetHyperlink=function() end}
function hooksecurefunc() hooks=hooks+1 end
ItemRack.RegisterSetTooltipHooks(); ItemRack.RegisterSetTooltipHooks()
assert(registrations==1 and hooks==0,"modern registration must occur once without legacy duplication")
local tooltip={GetItem=function() return "Boots","|Hitem:32267:2649:24056:24062|h[Boots]|h" end,
  AddDoubleLine=function(_,_,name) table.insert(lines,name) end}
callback(tooltip)
assert(#lines==1 and lines[1]=="Prot","modern tooltips must show only matching public sets")
ItemRackSettings.ShowSetInTooltip="OFF"; callback(tooltip)
assert(#lines==1,"setting OFF must suppress modern set lines")
ItemRackSettings.ShowSetInTooltip="ON"; ItemRackSettings.ShowTooltips="OFF"; callback(tooltip)
assert(#lines==1,"master tooltip setting OFF must suppress modern set lines")
ItemRackSettings.ShowTooltips="ON"
callback({GetItem=function() error("unavailable") end}); callback({})
callback({GetItem=function() return nil,nil end})
issecretvalue=function() return true end; callback(tooltip)
assert(#lines==1,"unavailable and secret links must not be inspected")
ItemRack.SetTooltipHooksRegistered=nil; TooltipDataProcessor=nil
ItemRack.RegisterSetTooltipHooks()
assert(hooks==3,"Classic must retain all three legacy hooks")
`, 'forever-modern-set-tooltip');
const functions = [
  extractFunction(core, 'ItemRack.SameID'),
  extractFunction(core, 'ItemRack.GetRuneID'),
  extractFunction(core, 'ItemRack.HasRuneID'),
  extractFunction(core, 'ItemRack.IsBareItemID'),
  extractFunction(core, 'ItemRack.NormalizeItemFields'),
  extractFunction(core, 'ItemRack.SameItemFields'),
  extractFunction(core, 'ItemRack.SameExactID'),
  extractFunction(core, 'ItemRack.MatchesStoredItemFields'),
  extractFunction(core, 'ItemRack.MatchesStoredItemID'),
  extractFunction(core, 'ItemRack.FindItem'),
  extractFunction(core, 'ItemRack.FindItemInBags'),
  extractFunction(core, 'ItemRack.IDTooltip'),
  extractFunction(queue, 'ItemRack.QueueHasExplicitIdentityEntry'),
  extractFunction(queue, 'ItemRack.IsQueueEntryUnambiguous'),
  extractFunction(queue, 'ItemRack.FindQueueEntryIndex'),
  extractFunction(options, 'ItemRackOpt.AddToSortList'),
  extractFunction(options, 'ItemRackOpt.PopulateSortList'),
].join('\n');

runLua(String.raw`
local wrong = "33881:2647:24028:0:0:0:0:0:70:0"
local wanted = "33881:2648:24028:0:0:0:0:0:70:0"
local wantedLong = "33881:2648:24028:0:0:0:0:0:70:0:0:0:0"
local bags = { [0]={ [1]=wrong, [2]=wantedLong } }
local inventory = { [9]=wrong }

ItemRack = {
  iSPatternBaseIDFromIR="^(%-?%d+)",
  iSPatternItemFieldsFromIR="^(%-?%d+:%-?%d*:%-?%d*:%-?%d*:%-?%d*:%-?%d*:%-?%d*:%-?%d*)",
  iSPatternRuneIDFromIR=":runeid:(%d+)$",
  LockList={ [-2]={}, [0]={}, [1]={}, [2]={}, [3]={}, [4]={} },
  KnownItems={}, BankOpen=false,
  GetIRString=function(value,base)
    if base then return tostring(value or ""):match("^(%-?%d+)") or 0 end
    return value or 0
  end,
  UpdateIRString=function(value) return value end,
  GetID=function(bag,slot)
    if slot then return bags[bag] and bags[bag][slot] or 0 end
    return inventory[bag] or 0
  end,
  FindInBank=function() end,
}
ItemRackOpt = {}
function GetContainerNumSlots(bag) return bag == 0 and 2 or 0 end

${functions}

local checks = 0
local function check(value,message) assert(value,message); checks = checks + 1 end

check(not ItemRack.MatchesStoredItemID(wanted,wrong),
  "a different enchant on the same base item must not satisfy a saved set slot")
check(ItemRack.MatchesStoredItemID("33881",wrong),
  "an intentionally bare default ID must retain base-item compatibility")
check(ItemRack.MatchesStoredItemID(wanted,wantedLong),
  "variable-length live item strings must match by stable item fields")

local wantedEmptyFields = "33881:2648:24028::::::70:0"
check(ItemRack.MatchesStoredItemID(wanted,wantedEmptyFields),
  "empty colon-separated fields must normalize and match zero-padded fields")
check(ItemRack.MatchesStoredItemID("3299:0:0:0:0:0:0:0","3299:::::::"),
  "fully empty enhancement fields must match all-zero enhancement fields")

local inv,bag,slot = ItemRack.FindItem(wanted,true)
check(not inv and bag == 0 and slot == 2,
  "exact bag copy must win over a wrong-enchant equipped or earlier bag copy")
bags[0][2] = nil
ItemRack.LockList[0] = {}
ItemRack.LockList[-2] = {}
inv,bag,slot = ItemRack.FindItem(wanted,true)
check((bag == 0 and slot == 1) or inv == 9,
  "same-base fallback must remain available when the recorded copy is absent")

local runeWanted = wanted..":runeid:7"
local runeOther = wantedLong..":runeid:9"
check(not ItemRack.MatchesStoredItemID(runeWanted,runeOther),
  "a saved rune identity must reject a different rune")
check(ItemRack.MatchesStoredItemID(wanted,runeOther),
  "a pre-rune full identity may follow the same physical copy after engraving")

-- Lookup-level SoD compatibility checks, not a reproduction of leocard's
-- missing-item report: recorded runes must never fall back to the wrong rune.
bags[0] = { [1]=runeOther, [2]=runeWanted }
inventory = { [9]=runeOther }
ItemRack.ClearTestLocks = function()
  ItemRack.LockList[0] = {}; ItemRack.LockList[-2] = {}
end
ItemRack.ClearTestLocks()
inv,bag,slot = ItemRack.FindItem(runeWanted,true)
check(not inv and bag == 0 and slot == 2,
  "carried exact rune copy must win over an earlier wrong-rune copy")
bags[0][2] = nil
ItemRack.ClearTestLocks()
inv,bag,slot = ItemRack.FindItem(runeWanted,true)
check(not inv and not bag,
  "missing recorded rune must not select a compatible base item with another rune")
bags[0][2] = wanted..":runeid:0"
ItemRack.ClearTestLocks()
inv,bag,slot = ItemRack.FindItem(wanted..":runeid:0",true)
check(not inv and bag == 0 and slot == 2,
  "explicitly unengraved rune 0 must distinguish an engraved copy")
bags[0][2] = runeWanted
ItemRack.ClearTestLocks()
inv,bag,slot = ItemRack.FindItem(wanted,true)
check(not inv and bag == 0 and slot == 1,
  "pre-rune full identities must retain physical-field compatibility")

local queueList = { { id=wrong }, { id=wanted } }
check(ItemRack.FindQueueEntryIndex(queueList,wantedLong) == 2,
  "queue lookup must distinguish same-base copies by enchant")
local mixedList = { { id="33881" }, { id=wanted } }
check(not ItemRack.IsQueueEntryUnambiguous(mixedList,1),
  "a bare wildcard must not shadow an explicit same-base queue identity")

local sortList = { { id=wrong } }
ItemRackOpt.AddToSortList(sortList,wanted)
check(#sortList == 2, "queue editor must list differently enchanted copies separately")
ItemRackOpt.AddToSortList(sortList,wantedLong)
check(#sortList == 2, "queue editor must coalesce only the same stable item identity")

-- October 5 Queue-page duplicate report: synthetic separator variants expose
-- the raw-key failure; the reporter's exact links/client build are still absent.
local first = { id=wanted, priority=true, delay="7", customIcon=123 }
local edited = {first, {id=wantedEmptyFields}, {id=wrong},
  {id=runeWanted}, {id=runeOther}, {id="99999:0:0:0:0:0:0:0"}, {id=0}, {id=0}}
ItemRackOpt.QueueEditingSet = "Stealth"
local queues = {[9]=edited}
ItemRack.GetQueues = function(set) assert(set=="Stealth"); return queues end
ItemRack.DockWindows = function() end
ItemRack.BuildMenu = function() ItemRack.Menu={wantedLong} end
ItemRackMenuFrame = {Hide=function() end}
ItemRackOptSortListScrollFrameScrollBar = {SetValue=function() end}
ItemRackOpt.SortListScrollFrameUpdate = function() end
ItemRackOpt.PopulateSortList(9)
check(#edited == 6, "queue-page-normalized-duplicates: coalesce empty/zero fields and duplicate stop markers")
check(edited[1]==first and first.priority and first.delay=="7" and first.customIcon==123,
  "duplicate cleanup must retain first-entry settings, order and custom icon")
check(edited[2].id==wrong and edited[3].id==runeWanted and edited[4].id==runeOther,
  "duplicate cleanup must preserve different enchants and runes")
check(edited[5].id:match("99999") and edited[6].id==0,
  "unavailable saved entries and the first stop marker must persist")
ItemRackOpt.PopulateSortList(9)
check(#edited==6 and queues[9]==edited and inventory[9]==runeOther,
  "reopening editor must be idempotent and leave equipment and scope unchanged")
-- A queue tooltip must describe the saved variant even if only another
-- same-base copy is carried; otherwise two distinct rows appear identical.
ItemRackSettings={ShowTooltips="ON",MenuOnShift="OFF"}
ItemRack.AnchorTooltip=function() end; ItemRack.ShrinkTooltip=function() end
ItemRack.IRStringToItemString=function(id) return "item:"..id end
local tooltipID
GameTooltip={SetInventoryItem=function(_,unit,slot) tooltipID=inventory[slot] end,
  SetBagItem=function(_,bag,slot) tooltipID=bags[bag][slot] end,
  SetHyperlink=function(_,id) tooltipID=id end,Show=function() end}
ItemRack.IDTooltip({},wrong,true)
check(tooltipID=="item:"..wrong,
  "queue-page-missing-variant-tooltip: missing saved enchant must not show a carried same-base copy")
ItemRack.IDTooltip({},wanted,true)
check(tooltipID==runeWanted or tooltipID==runeOther,"strict tooltip must use a compatible owned exact physical copy")
ItemRack.IDTooltip({},wrong)
check(tooltipID==runeWanted or tooltipID==runeOther,"other item tooltip callers retain existing base-ID fallback")
ItemRack.IDTooltip({},"33881",true)
check(tooltipID==runeWanted or tooltipID==runeOther,"intentionally bare queue entries retain wildcard tooltip compatibility")
check(inventory[9]==runeOther and edited[1]==first and first.priority and ItemRackOpt.QueueEditingSet=="Stealth",
  "tooltip correction must leave final equipment, saved policy and editor scope unchanged")
print(string.format("[IDENTITY MATCHING LUA] %d exact-copy compatibility checks passed.",checks))
`, 'identity-matching');
