const fs = require('fs');
const { extractFunction, runLua } = require('./lib/lua_harness');

const core = 'ItemRack/ItemRack.lua';
const queue = 'ItemRack/ItemRackQueue.lua';
const options = 'ItemRackOptions/ItemRackOptions.lua';
// October 8 report/video & GitHub Issue #34 (Spiritshroud08 / Zackk):
// Verifies character-slot and flyout tooltip anchoring without ANCHOR_NONE
// (which broke GameTooltip_ShowCompareItem on Rings/Weapons/TipTac/RatingBuster)
// and verifies UpdateTooltip registration (preventing the 0.2s TBC flicker).
const tooltipSource = fs.readFileSync(core, 'utf8');
const anchorHooks = tooltipSource.slice(tooltipSource.indexOf('hooksecurefunc(GameTooltip, "Show",'),
  tooltipSource.indexOf('function ItemRack.DockMenuToCharacterSheet'));
runLua(String.raw`
ItemRack={SlotInfo={}}
for i=0,19 do ItemRack.SlotInfo[i]={name='Slot'..i} end
ItemRack.SlotInfo[11].name='Finger0Slot'
ItemRackSettings={CharacterSheetMenus='ON',MenuOnShift='OFF',RightSlotsGoLeft='OFF',LeftSlotsGoRight='ON',TooltipFollow='OFF'}
UIParent={GetEffectiveScale=function() return 1 end,GetWidth=function() return 1920 end}
local slot={scripts={},GetName=function() return 'CharacterFinger0Slot' end,GetTop=function() return 300 end}
function slot:GetScript(name) return self.scripts[name] end
function slot:SetScript(name,handler) self.scripts[name]=handler end
CharacterFinger0Slot=slot
ItemRackMenuFrame={visible=true,left=300,right=420,
  IsVisible=function(s) return s.visible end,
  GetName=function() return 'ItemRackMenuFrame' end,
  GetTop=function() return 300 end,
  GetEffectiveScale=function() return 1 end,
  GetLeft=function(s) return s.left end,
  GetRight=function(s) return s.right end}
GameTooltip={alpha=1,owner=slot,side='none',scripts={},content='saved item',ownerCalls=0}
function GameTooltip:SetAlpha(a) self.alpha=a end
function GameTooltip:GetOwner() return self.owner end
function GameTooltip:SetOwner(o,a) self.owner=o; self.nativeAnchor=a; self.side=a; self.ownerCalls=self.ownerCalls+1 end
function GameTooltip:SetAnchorType(a) self.nativeAnchor=a end
function GameTooltip:GetAnchorType() return self.nativeAnchor end
function GameTooltip:ClearAllPoints() end
function GameTooltip:SetPoint(p,relTo,relPoint,x,y)
  self.point=p; self.relTo=relTo; self.relPoint=relPoint
  self.side=p=='TOPRIGHT' and 'LEFT' or 'RIGHT'; self.y=y
end
function GameTooltip:Show() end
function GameTooltip:HookScript(n,f) self.scripts[n]=f end
function hooksecurefunc(t,n,f) local old=t[n]; t[n]=function(self,...) old(self,...); f(self,...) end end
function IsShiftKeyDown() return false end
ItemRack.IsEquipmentManagerOpen=function() return false end
ItemRack.DockMenuToCharacterSheet=function(s) ItemRack.menuDockedTo=s:GetName(); ItemRackMenuFrame.visible=true end
local nativeEnterCalls=0
ItemRack.oldPaperDollItemSlotButton_OnEnter=function(s) nativeEnterCalls=nativeEnterCalls+1; GameTooltip:SetOwner(s,'ANCHOR_RIGHT'); GameTooltip:Show() end
${extractFunction(core,'ItemRack.GetMenuFrameTooltipSide')}
${extractFunction(core,'ItemRack.AnchorTooltip')}
${extractFunction(core,'ItemRack.ApplyTooltipAnchor')}
${extractFunction(core,'PaperDollItemSlotButton_OnEnter')}
${extractFunction(core,'ItemRack.RegisterCharacterSlotOnEnterHandlers')}
${anchorHooks}
-- Issue #34 + Forever evidence: both OnEnter script AND button.UpdateTooltip field
-- must be updated from oldPaperDollItemSlotButton_OnEnter to PaperDollItemSlotButton_OnEnter.
slot.scripts.OnEnter=ItemRack.oldPaperDollItemSlotButton_OnEnter
slot.UpdateTooltip=ItemRack.oldPaperDollItemSlotButton_OnEnter
assert(ItemRack.RegisterCharacterSlotOnEnterHandlers()==1,'Native character OnEnter and UpdateTooltip handlers must be replaced explicitly')
assert(slot:GetScript('OnEnter')==PaperDollItemSlotButton_OnEnter,'character slot OnEnter must dispatch through ItemRack wrapper')
assert(slot.UpdateTooltip==PaperDollItemSlotButton_OnEnter,'character slot UpdateTooltip must dispatch through ItemRack wrapper to prevent 0.2s flicker')
assert(ItemRack.RegisterCharacterSlotOnEnterHandlers()==0,'character handler registration must be idempotent')
slot:GetScript('OnEnter')(slot)
assert(nativeEnterCalls==1,'registered ItemRack wrapper must invoke the captured native handler exactly once')
for _,count in ipairs({1,2,40}) do
  ItemRack.Menu={}; for i=1,count do ItemRack.Menu[i]=i end
  ItemRack.menuDockedTo=nil
  PaperDollItemSlotButton_OnEnter(slot)
  assert(GameTooltip.nativeAnchor=='ANCHOR_RIGHT','Issue #34: manual placement must NOT set ANCHOR_NONE or comparison tooltips will vanish')
  assert(GameTooltip.side=='RIGHT' and GameTooltip.relTo==ItemRackMenuFrame,'right-side slot tooltip must chain to the right of ItemRackMenuFrame, not over the character panel')
  local ownerCalls=GameTooltip.ownerCalls
  for i=1,3 do
    GameTooltip:Show()
    assert(GameTooltip.side=='RIGHT' and GameTooltip.relTo==ItemRackMenuFrame,'Show refresh (e.g. Syndicator) must keep tooltip to the right of ItemRackMenuFrame')
  end
  assert(GameTooltip.owner==slot and GameTooltip.content=='saved item' and GameTooltip.ownerCalls==ownerCalls,
    'positioning must preserve native owner/content without rebuilding item data')
end
-- When character sheet + menu are near the right edge of the screen, fall back to left side of slot
ItemRackMenuFrame.left=1600; ItemRackMenuFrame.right=1850
PaperDollItemSlotButton_OnEnter(slot)
assert(GameTooltip.side=='LEFT' and GameTooltip.relTo==slot,'near right screen edge, slot tooltip must fall back to left of slot')
ItemRackMenuFrame.left=300; ItemRackMenuFrame.right=420

-- Opposite menu direction (RightSlotsGoLeft == ON): leave Blizzard native ANCHOR_RIGHT untouched
ItemRackSettings.RightSlotsGoLeft='ON'; PaperDollItemSlotButton_OnEnter(slot)
assert(ItemRack.pendingTooltipAnchor==nil and GameTooltip.nativeAnchor=='ANCHOR_RIGHT','opposite menu direction must leave native right tooltip placement untouched')
ItemRackSettings.RightSlotsGoLeft='OFF'

-- Unrelated owners and another character slot must not inherit the pending anchor.
for _,name in ipairs({'ActionButton1','ContainerFrame1Item1','ItemRackButton11','ItemRackOptInv11','CharacterSlot8'}) do
  ItemRack.pendingTooltipOwner=ItemRackMenuFrame; ItemRack.pendingTooltipAnchor='ANCHOR_RIGHT'
  GameTooltip:SetOwner({GetName=function() return name end},'ANCHOR_RIGHT')
  GameTooltip:Show()
  assert(GameTooltip.nativeAnchor=='ANCHOR_RIGHT' and GameTooltip.side=='ANCHOR_RIGHT','unrelated tooltip must remain untouched: '..name)
  assert(ItemRack.pendingTooltipAnchor==nil,'unrelated tooltip must clear stale override')
end

-- Flyout menu buttons (ItemRackMenu1..N) must anchor natively to ItemRackMenuFrame
-- so tooltips stay outside multi-column breakouts and retain a valid nativeAnchor for ShoppingTooltips.
local row={GetName=function() return 'ItemRackMenu1' end,GetTop=function() return 250 end}
ItemRack.menuDockedTo='CharacterFinger0Slot'
ItemRack.AnchorTooltip(row)
assert(GameTooltip.owner==ItemRackMenuFrame and GameTooltip.nativeAnchor=='ANCHOR_RIGHT',
  'Issue #34: flyout button must use native SetOwner(ItemRackMenuFrame, ANCHOR_RIGHT) to prevent overlap and preserve comparison tooltips')
ItemRackMenuFrame.left=1600; ItemRackMenuFrame.right=1850
ItemRack.AnchorTooltip(row)
assert(GameTooltip.owner==ItemRackMenuFrame and GameTooltip.nativeAnchor=='ANCHOR_LEFT',
  'Issue #34: flyout button near right screen edge must use native SetOwner(ItemRackMenuFrame, ANCHOR_LEFT)')
ItemRackMenuFrame.left=300; ItemRackMenuFrame.right=420

GameTooltip.scripts.OnHide()
assert(not ItemRack.pendingTooltipAnchor and not ItemRack.pendingTooltipOwner and not ItemRack.pendingTooltipVerticalOwner,
  'hide must clear the complete positioning context')
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

// October 13, 2026 Forever report from Venruki: unlike current Retail, the client does not
// enable automatic comparison tooltips by default, so ItemRack flyout rows only
// compare while the player holds the client comparison modifier.
const breakoutComparisonFunctions = [
  extractFunction(core, 'ItemRack.ShouldCompareBreakoutItems'),
  extractFunction(core, 'ItemRack.OnModifierStateChanged'),
  extractFunction(core, 'ItemRack.MenuTooltip'),
  extractFunction(core, 'ItemRack.ShowBreakoutComparison'),
  extractFunction(core, 'ItemRack.TooltipUpdate'),
  extractFunction(core, 'ItemRack.ClearTooltip'),
].join('\n');
runLua(String.raw`
local compareCalls,hidden1,hidden2=0,0,0
local owner={
  GetName=function() return 'ItemRackMenu1' end,
  GetID=function() return 1 end,
  IsVisible=function() return true end,
  IsMouseOver=function() return true end,
}
ItemRackMenuFrame={
  IsVisible=function() return true end,
  GetCenter=function() return 100 end,
}
ItemRack={
  AnchorTooltip=function() end,
  FindItem=function() return nil,0,1 end,
  Menu={'100'},
  ShrinkTooltip=function() end,
  StartTimer=function() end,
  StopTimer=function() end,
}
ItemRackSettings={ShowTooltips='ON',AlwaysCompareBreakoutItems='OFF',MenuOnShift='OFF'}
GameTooltip={SetBagItem=function() end,Show=function() end}
ShoppingTooltip1={Hide=function() hidden1=hidden1+1 end}
ShoppingTooltip2={Hide=function() hidden2=hidden2+1 end}
function GetContainerItemCooldown() return 0 end
function GameTooltip_ShowCompareItem(tooltip)
  assert(tooltip==GameTooltip,'comparison must target the active ItemRack tooltip')
  compareCalls=compareCalls+1
end
function IsShiftKeyDown() return false end
${breakoutComparisonFunctions}
owner.UpdateTooltip=ItemRack.MenuTooltip
local function hoverBreakout()
  ItemRack.MenuTooltip(owner)
end

-- Fresh default: AlwaysCompareBreakoutItems='OFF', no Shift, no CVar -> no comparison on hover
hoverBreakout()
assert(compareCalls==0,'Breakout must not show comparison by default without Shift or CVar')
assert(ItemRack.TooltipType=='BAG','ItemRack.TooltipType must be preserved for zero-cooldown items')

-- Pressing Shift: comparison is invoked
function IsShiftKeyDown() return true end
hoverBreakout()
assert(compareCalls==1,'Breakout comparison must show when Shift key is held')

-- Releasing Shift: comparison tooltips must hide
function IsShiftKeyDown() return false end
hoverBreakout()
assert(compareCalls==1 and hidden1>=1 and hidden2>=1,'Releasing Shift must hide comparison tooltips')

-- Turning on AlwaysCompareBreakoutItems option forces comparison without Shift
ItemRackSettings.AlwaysCompareBreakoutItems='ON'
hoverBreakout()
assert(compareCalls==2,'AlwaysCompareBreakoutItems=ON must show comparison without Shift')
ItemRackSettings.AlwaysCompareBreakoutItems='OFF'

-- Enabling WoW client CVar alwaysCompareItems shows comparison without Shift
function GetCVarBool(cvar) return cvar == 'alwaysCompareItems' end
hoverBreakout()
assert(compareCalls==3,'WoW CVar alwaysCompareItems=true must show comparison without Shift')
GetCVarBool = nil

-- Menu on Shift suppresses comparisons while opening a flyout
ItemRackSettings.AlwaysCompareBreakoutItems='ON'
ItemRackSettings.MenuOnShift='ON'
function IsShiftKeyDown() return true end
local hiddenBefore = hidden1
hoverBreakout()
assert(compareCalls==3 and hidden1>hiddenBefore,
  'Menu on Shift must retain its intentional comparison suppression')

ItemRackSettings.MenuOnShift='OFF'
function IsShiftKeyDown() return false end
GameTooltip_ShowCompareItem=nil
hoverBreakout()
assert(compareCalls==3,'clients without the comparison helper must remain safe')

GameTooltip_ShowCompareItem=function() compareCalls=compareCalls+1 end
compareCalls = 0
ItemRack.ShowBreakoutComparison({GetName=function() return 'ItemRackOptInv1' end})
assert(compareCalls==0,'the breakout option must not alter unrelated ItemRack tooltips')

-- Modifier key state change must refresh active breakout tooltip and update dressup cursor
local inspectCursor, resetCursorCalls = 0, 0
function IsModifiedClick(action) return action == "DRESSUP" end
function ShowInspectCursor() inspectCursor = inspectCursor + 1 end
function ResetCursor() resetCursorCalls = resetCursorCalls + 1 end
function MouseIsOver(frame) return frame == owner end

-- Holding Shift during modifier state change triggers comparison
function IsShiftKeyDown() return true end
hoverBreakout()
compareCalls = 0
ItemRack.OnModifierStateChanged()
assert(compareCalls == 1, 'MODIFIER_STATE_CHANGED with Shift must trigger comparison on active breakout owner')
assert(inspectCursor >= 1, 'Dressup modifier must trigger inspect cursor update')
assert(ItemRack.TooltipType == 'BAG', 'Tooltip state must remain active and not drop on modifier press')

-- ClearTooltip on leave clears state and resets cursor
local tooltipHidden = 0
GameTooltip.Hide = function() tooltipHidden = tooltipHidden + 1 end
ItemRack.ClearTooltip(owner)
assert(ItemRack.TooltipType == nil, 'ClearTooltip must reset TooltipType')
assert(tooltipHidden >= 1, 'ClearTooltip must hide GameTooltip')
assert(resetCursorCalls >= 1, 'ClearTooltip must reset cursor')

-- Verify breakout comparison disables mouse capture to prevent flicker loops without overriding Blizzard native tooltip positioning
ItemRackSettings.AlwaysCompareBreakoutItems = 'ON'
function IsShiftKeyDown() return false end
local mouseDisabled = 0
ShoppingTooltip1.EnableMouse = function(self, state) if not state then mouseDisabled = mouseDisabled + 1 end end
ShoppingTooltip2.EnableMouse = function(self, state) if not state then mouseDisabled = mouseDisabled + 1 end end
compareCalls = 0

ItemRack.ShowBreakoutComparison(owner)
assert(mouseDisabled == 2, 'ShowBreakoutComparison must disable mouse capture on ShoppingTooltip1/2 to prevent OnLeave flicker loops')
assert(compareCalls == 1, 'ShowBreakoutComparison must invoke GameTooltip_ShowCompareItem')

-- Issue #34 / Retail validation: ShowBreakoutComparison must NOT show comparison tooltips for:
-- 1) Options slot/queue pickers (ItemRack.menuInclude)
compareCalls = 0
ItemRack.menuInclude = 1
ItemRack.ShowBreakoutComparison(owner)
assert(compareCalls == 0, 'ShowBreakoutComparison must not trigger on Options menuInclude pickers')
ItemRack.menuInclude = nil

-- 2) Set menus (ItemRack.menuOpen >= 20)
ItemRack.menuOpen = 20
ItemRack.ShowBreakoutComparison(owner)
assert(compareCalls == 0, 'ShowBreakoutComparison must not trigger on Set menus (menuOpen >= 20)')
ItemRack.menuOpen = 11

-- 3) Empty slot (0) or MENU entries
ItemRack.Menu[1] = 0
ItemRack.ShowBreakoutComparison(owner)
assert(compareCalls == 0, 'ShowBreakoutComparison must not trigger on empty slot entry')
ItemRack.Menu[1] = '100'

-- 4) Already-equipped items (GameTooltip:IsEquippedItem())
GameTooltip.IsEquippedItem = function() return true end
ItemRack.ShowBreakoutComparison(owner)
assert(compareCalls == 0, 'ShowBreakoutComparison must not compare an already-equipped item against itself')
GameTooltip.IsEquippedItem = function() return false end

-- 5) Shrunk / TinyTooltips (ShrinkTooltip returns true)
ItemRack.ShrinkTooltip = function() return true end
hoverBreakout()
assert(compareCalls == 0, 'TinyTooltips / shrunk tooltips must suppress automatic breakout comparison')
`, 'forever-breakout-comparison-default');

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
  extractFunction(core, 'ItemRack.ShouldCompareBreakoutItems'),
  extractFunction(core, 'ItemRack.ShowBreakoutComparison'),
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
