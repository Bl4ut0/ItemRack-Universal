const fs = require('fs');
const { extractFunction, runLua } = require('./lib/lua_harness');

const core = 'ItemRack/ItemRack.lua';
const queue = 'ItemRack/ItemRackQueue.lua';
const options = 'ItemRackOptions/ItemRackOptions.lua';
runLua(String.raw`
CUSTOM='Custom'
local reads=0
ItemRack={HybridSet='Stable',IsSetEquipped=function() reads=reads+1;return true end,GetTextureBySlot=function() return 1 end}
ItemRackUser={CurrentSet='Active',EnableQueues='OFF',Sets={Active={equip={}},Stable={equip={}}}}
${extractFunction(core,'ItemRack.UpdateCurrentSet')}
for _,field in ipairs({'SetSwapping','ActiveEquipmentTransaction','PendingQueueEquipSet'}) do
 ItemRack[field]={};ItemRack.UpdateCurrentSet()
 assert(reads==0 and ItemRack.HybridSet=='Stable' and ItemRack.HybridDetectionStatus=='inventory_settling',
  'hybrid-unresolved-state: pending work must retain stable recognition without probing intermediate gear')
 ItemRack[field]=nil
end
-- Issue #38: out-of-combat CombatQueue holds chained AutoQueue slots waiting behind an active transaction or locks
ItemRack.CombatQueue={[17]='19019'}; InCombatLockdown=function() return false end; ItemRack.IsPlayerReallyDead=function() return false end
ItemRack.UpdateCurrentSet()
assert(reads==0 and ItemRack.HybridSet=='Stable' and ItemRack.HybridDetectionStatus=='inventory_settling',
 'issue-38-ooc-combatqueue-settling: out-of-combat queued swaps must hold set recognition as inventory_settling')
-- In combat or while dead, CombatQueue must NOT suspend set detection
InCombatLockdown=function() return true end; ItemRack.UpdateCurrentSet()
assert(reads==1 and ItemRack.HybridDetectionStatus=='ready','combat queue entries during combat must not suspend set detection')
ItemRack.HybridSet='Stable'; reads=0; InCombatLockdown=function() return false end; ItemRack.IsPlayerReallyDead=function() return true end
ItemRack.UpdateCurrentSet()
assert(reads==1 and ItemRack.HybridDetectionStatus=='ready','dead player CombatQueue entries must not suspend set detection')
ItemRack.CombatQueue=nil; InCombatLockdown=nil; ItemRack.IsPlayerReallyDead=nil; ItemRack.HybridSet='Stable'; reads=0
ItemRack.UnresolvedEquippedSlots={[13]=true};ItemRack.UpdateCurrentSet()
assert(reads==0 and ItemRack.HybridSet=='Stable' and ItemRack.HybridDetectionStatus=='inventory_unresolved')
ItemRack.UnresolvedEquippedSlots={};ItemRackUser.EnableQueues='ON';ItemRack.UpdateCurrentSet()
assert(reads==0 and ItemRack.HybridSet=='Stable','unknown queue state must not become a negative set match')
ItemRack.QueueStateReady=true;ItemRack.UpdateCurrentSet()
assert(reads==1 and ItemRack.HybridSet==nil and ItemRackUser.CurrentSet=='Active' and ItemRack.HybridDetectionStatus=='ready',
 'resolved gear matching the active set must deliberately clear the old Hybrid match')
ItemRack.HybridSet='Stable';reads=0
ItemRack.IsSetEquipped=function(name)
 reads=reads+1
 if name=='Active' then ItemRack.UnresolvedEquippedSlots={[13]=true};return false end
 return true
end
ItemRack.UpdateCurrentSet()
assert(reads==1 and ItemRack.HybridSet=='Stable' and ItemRack.HybridDetectionStatus=='inventory_unresolved',
 'hybrid-mid-probe-readiness: a matcher discovering unresolved gear must not fall through to another set')
ItemRack.UnresolvedEquippedSlots={};reads=0
ItemRackUser.Sets.Stable.equip[1]='candidate-head'
ItemRack.IsSetEquipped=function(name)
 reads=reads+1
 if name=='Active' then return false end
 ItemRack.UnresolvedEquippedSlots={[13]=true};return true
end
ItemRack.UpdateCurrentSet()
assert(reads==2 and ItemRack.HybridSet=='Stable' and ItemRack.HybridDetectionStatus=='inventory_unresolved',
 'hybrid-candidate-readiness: candidate probing must not commit a match after readiness changes')
ItemRackUser=nil;ItemRack.UpdateCurrentSet()
assert(ItemRack.HybridDetectionStatus=='profile_unavailable','profile initialization must not throw or infer an empty set')
print('[HYBRID UNRESOLVED LUA] Transactions, pending sets, unresolved slots, startup and resumed recognition passed.')
`, 'hybrid-unresolved-state');
runLua(String.raw`
CUSTOM='Custom'
local events={}
ItemRack={DebugAll=true,QueueStateReady=true,
 IsSetEquipped=function(name) return name=='Drakes' end,
 GetID=function() return 'worn-cloak' end,
 GetQueueContext=function() return {enabled=true,owner='Drakes',list={{id='worn-cloak'}}} end,
 MatchesStoredItemID=function(a,b) return a==b end,
 FindQueueEntryIndex=function() return 1 end,
 QueueDiagnostic=function(event,details) events[#events+1]={event=event,details=details} end}
ItemRackUser={CurrentSet='Dungeon',EnableQueues='ON',EnablePerSetQueues='ON',Sets={Dungeon={equip={[1]='head'}},Drakes={equip={[15]='banked-cloak'}}}}
${extractFunction(core,'ItemRack.UpdateCurrentSet')}
ItemRack.UpdateCurrentSet()
assert(#events==2 and events[1].event=='set_detection_transition' and events[1].details.toHybrid=='Drakes',
 'issue-38-missing-hybrid-transition: debug must retain the brief matched set name')
assert(events[2].event=='hybrid_match_slot' and events[2].details.expected=='banked-cloak'
 and events[2].details.actual=='worn-cloak' and events[2].details.explicitMatch==false
 and events[2].details.queueEnabled and events[2].details.queueIndex==1,
 'diagnostics must distinguish saved physical gear from queue acceptance')
ItemRack.UpdateCurrentSet();assert(#events==2,'unchanged detection must not spam transition records')
ItemRack.IsSetEquipped=function(name) return name=='Dungeon' end
ItemRack.GetTextureBySlot=function() return 1 end
ItemRack.UpdateCurrentSet()
assert(#events==3 and events[3].details.fromHybrid=='Drakes' and events[3].details.toHybrid=='<none>',
 'the transition out must survive even when the final dump has no HybridSet')
ItemRack.DebugAll=false;ItemRack.DebugTags={Queue=false};ItemRack.IsSetEquipped=function(name) return name=='Drakes' end
ItemRack.GetID=function() error('disabled diagnostics must not read slot evidence') end
ItemRack.UpdateCurrentSet();assert(#events==3,'diagnostics must remain silent and avoid extra reads when disabled')
assert(ItemRackUser.CurrentSet=='Dungeon','diagnostics must not change active queue authority')
print('[HYBRID TRANSITION LUA] Enter/exit, explicit versus queued match, deduplication and disabled behavior passed.')
`, 'issue-38-missing-hybrid-transition');
// November 14: the attempted synchronous handoff ran (132 calls, no errors)
// but did not fix the live bounce. Capture actual late writes/rendered geometry;
// a modeled handoff contract cannot establish a client rendering correction.
runLua(String.raw`
local now,writer,writes,pointHooks,scriptHooks=0,'native layout',0,0,0
local owner={}
local secret={}
local messages={}
function GetTime() return now end
function issecretvalue(value) return rawequal(value,secret) end
function debugstack() return writer end
ItemRack={TooltipOwner=owner,Print=function(message) messages[#messages+1]=message end,ClearQueueDiagnostics=function() end}
local function frame(name)
 local f={top=500,height=180,y=0,scripts={}}
 function f:GetName() return name end
 function f:IsForbidden() return self.forbidden end
 function f:GetOwner() return self.owner end
 function f:GetTop() return self.top end
 function f:GetBottom() return self.top-self.height end
 function f:GetHeight() return self.height end
 function f:GetEffectiveScale() return 1 end
 function f:GetPoint() return 'TOP',GameTooltip,'TOP',0,self.y end
 function f:SetPoint(_,_,anchor,x,y)
  writes=writes+1
  self.y=type(anchor)=='number' and x or y
  self.top=500+self.y
 end
 function f:HookScript(event,callback)
  scriptHooks=scriptHooks+1;self.scripts[event]=callback
 end
 return f
end
GameTooltip=frame('GameTooltip');GameTooltip.owner=owner
ShoppingTooltip1=frame('ShoppingTooltip1');ShoppingTooltip2=frame('ShoppingTooltip2')
function hooksecurefunc(target,name,callback)
 pointHooks=pointHooks+1
 local original=target[name]
 target[name]=function(self,...) original(self,...);callback(self,...) end
end
local controllerCalls=0
TipTac={SetAnchorToTip=function() controllerCalls=controllerCalls+1 end}
${extractFunction(core,'ItemRack.MenuDiagnosticValue')}
${extractFunction(core,'ItemRack.MenuDiagnosticCall')}
${extractFunction(core,'ItemRack.RecordTooltipAnchor')}
${extractFunction(core,'ItemRack.StartTooltipAnchorTrace')}
${extractFunction(core,'ItemRack.GetTooltipAnchorTraceReport')}
${extractFunction(core,'ItemRack.SlashHandler')}
ItemRack.SlashHandler('debug tooltips')
assert(messages[#messages]:find('/itemrack dump tooltips',1,true),'capture instructions must lead to the focused export')
assert(pointHooks==3 and scriptHooks==6,'capture must hook the three existing tooltip endpoints once')
ShoppingTooltip1:SetPoint('TOP',GameTooltip,0,0)
writer='TipTac layout';ShoppingTooltip1:SetPoint('TOP',GameTooltip,0,-10)
writer='late layout after the handoff';ShoppingTooltip1:SetPoint('TOP',GameTooltip,0,0)
ShoppingTooltip1.scripts.OnUpdate(ShoppingTooltip1)
local entries=ItemRack.GetTooltipAnchorTraceReport(true).entries
assert(#entries==4 and entries[1].y==0 and entries[2].y==-10 and entries[3].y==0,
 'actual native/controller/late writer sequence must survive the capture')
assert(entries[3].caller==writer and entries[4].event=='OnUpdate' and entries[4].top==500,
 'capture must identify a writer after the attempted handoff and final rendered geometry')
assert(writes==3 and controllerCalls==0,'diagnostics must never add positioning or controller calls')
ShoppingTooltip1.scripts.OnUpdate(ShoppingTooltip1)
assert(#ItemRack.TooltipAnchorTrace.entries==4,'unchanged frame samples must not fill the buffer')
ShoppingTooltip1.height=250
ShoppingTooltip1.scripts.OnSizeChanged(ShoppingTooltip1)
assert(ItemRack.TooltipAnchorTrace.entries[5].height==250,'content sizing must be distinguishable from point changes')
GameTooltip.owner={}
ShoppingTooltip1:SetPoint('TOP',GameTooltip,0,4)
assert(#ItemRack.TooltipAnchorTrace.entries==5,'other addons tooltip owners must not be captured')
GameTooltip.owner=owner
ShoppingTooltip1.forbidden=true
ShoppingTooltip1:SetPoint('TOP',GameTooltip,0,5)
assert(#ItemRack.TooltipAnchorTrace.entries==5,'forbidden frames must be skipped')
ShoppingTooltip1.forbidden=false
writer=string.rep('caller ',200)
ItemRack.RecordTooltipAnchor('ShoppingTooltip1',ShoppingTooltip1,'SetPoint',secret,secret,secret,secret,secret)
entries=ItemRack.TooltipAnchorTrace.entries
assert(entries[6].point=='<secret>' and entries[6].relative=='<secret>' and entries[6].x=='<secret>',
 'secret argument values must be redacted before inspection or serialization')
assert(#entries[6].caller==640,'caller stacks must have a fixed bound')
for i=1,200 do ShoppingTooltip1:SetPoint('TOP',GameTooltip,0,i%2) end
local full=ItemRack.GetTooltipAnchorTraceReport(true)
local normal=ItemRack.GetTooltipAnchorTraceReport(false)
assert(full.retained==128 and #full.entries==128 and full.status=='limit','capture must stop at capacity')
assert(#normal.entries==16 and normal.omitted==112 and normal.entries[1]==full.entries[113],
 'normal dumps must keep a small recent tail; full dumps retain every capture entry')
ItemRack.SlashHandler('debug tooltips')
assert(pointHooks==3 and scriptHooks==6 and #ItemRack.TooltipAnchorTrace.entries==0,'rearming must not multiply hooks')
now=11
ShoppingTooltip1:SetPoint('TOP',GameTooltip,0,8)
assert(ItemRack.GetTooltipAnchorTraceReport().status=='expired' and #ItemRack.TooltipAnchorTrace.entries==0,
 'expired captures must not consume later unrelated frames')
now=20;ItemRack.SlashHandler('debug tooltips');ItemRack.SlashHandler('debug tooltips stop')
ShoppingTooltip1:SetPoint('TOP',GameTooltip,0,9)
assert(ItemRack.TooltipAnchorTrace.status=='stopped' and #ItemRack.TooltipAnchorTrace.entries==0,'explicit stop must preserve evidence without further collection')
ItemRack.SlashHandler('debug clear')
assert(ItemRack.GetTooltipAnchorTraceReport().status=='off','existing debug clear must clear the capture')
assert(controllerCalls==0,'no capture mode may invoke TipTac positioning')
print('[TOOLTIP ANCHOR TRACE LUA] Actual command, late writers, render/size samples, bounds, expiry, redaction and read-only behavior passed.')
`, 'reported-tiptac-comparison-anchor-trace');

// November 14 actual capture: native comparison and TipTac layout repeat during
// one hover. Verify redundant requests, not a reproduction of native rendering.
runLua(String.raw`
local nativeBuilds,manualCalls,hookCalls,renders=0,0,0,0
local native=true
local hidden,foreign=false,false
local itemSlot=1
local owner={GetID=function() return 1 end,GetName=function() return 'ItemRackMenu1' end}
local secret={}
function issecretvalue(v) return rawequal(v,secret) end
function GetContainerItemCooldown() return 0 end
function GetInventoryItemCooldown() return 0 end
function IsShiftKeyDown() return false end
function GetCVarBool() return native end
function hooksecurefunc(target,name,callback)
 hookCalls=hookCalls+1
 local original=target[name]
 target[name]=function(self,...) original(self,...);callback(self,...) end
end
local function shopping()
 return {shown=false,IsShown=function(s) return s.shown end,GetOwner=function(s) return s.owner end,
  Hide=function(s) s.shown=false end,EnableMouse=function(s,v) s.mouse=v end}
end
ShoppingTooltip1=shopping();ShoppingTooltip2=shopping()
GameTooltip={Show=function() end,IsEquippedItem=function() return false end}
local function nativeManager()
 return {CompareItem=function(self,item,tip)
  if not item then ShoppingTooltip1:Hide();return end
  nativeBuilds=nativeBuilds+1
  ShoppingTooltip1.owner=foreign or tip
  ShoppingTooltip1.shown=not hidden
  ShoppingTooltip1.item=item.id
 end}
end
TooltipComparisonManager=nativeManager()
function GameTooltip:SetBagItem(bag,slot)
 renders=renders+1;self.item=bag..':'..slot
 if native and TooltipComparisonManager then TooltipComparisonManager:CompareItem({id=self.item},self) end
end
function GameTooltip:SetInventoryItem(_,slot) self:SetBagItem('inventory',slot) end
function GameTooltip_ShowCompareItem(tip)
 manualCalls=manualCalls+1
 if TooltipComparisonManager then TooltipComparisonManager:CompareItem({id=tip.item},tip) end
end
ItemRackSettings={ShowTooltips='ON',AlwaysCompareBreakoutItems='ON',MenuOnShift='OFF'}
ItemRack={Menu={'100'},AnchorTooltip=function() end,ShrinkTooltip=function() end,
 FindItem=function() return nil,0,itemSlot end,StartTimer=function() end,StopTimer=function() end,
 IsBareItemID=function() return true end}
${extractFunction(core,'ItemRack.GetNativeComparisonRevision')}
${extractFunction(core,'ItemRack.ShouldCompareBreakoutItems')}
${extractFunction(core,'ItemRack.ShowBreakoutComparison')}
${extractFunction(core,'ItemRack.TooltipUpdate')}
${extractFunction(core,'ItemRack.MenuTooltip')}
${extractFunction(core,'ItemRack.IDTooltip')}
for i=1,11 do ItemRack.MenuTooltip(owner) end
assert(renders==11 and nativeBuilds==11 and manualCalls==0,
 'reported-tiptac-native-comparison-duplicate: native item rendering must not be followed by a second explicit comparison rebuild')
assert(ItemRack.nativeComparisonObserver.reused==11,'support counters must show whether this correction actually ran')
assert(hookCalls==1 and ShoppingTooltip1.mouse==false,'observation must hook once and preserve comparison mouse exclusion')
itemSlot=2;ItemRack.MenuTooltip(owner)
assert(ShoppingTooltip1.item=='0:2' and nativeBuilds==12 and manualCalls==0,'new bag content must still render and compare immediately')
ItemRack.IDTooltip(owner,'100')
assert(nativeBuilds==13 and manualCalls==0,'direct item tooltips must also avoid rebuilding a comparison native rendering already supplied')
native=false;itemSlot=3
ItemRack.MenuTooltip(owner)
assert(manualCalls==1 and ShoppingTooltip1.item=='0:3',
 'a visible comparison for the previous item must never suppress a fresh forced request when native comparison did not run')
native=true;hidden=true;ItemRack.MenuTooltip(owner)
assert(manualCalls==2,'a native request without a visible result must retain the explicit fallback')
hidden=false;foreign={};ItemRack.MenuTooltip(owner)
assert(manualCalls==3,'a foreign comparison owner must not count as a native result for this tooltip')
foreign=secret;ItemRack.MenuTooltip(owner)
assert(manualCalls==4,'secret ownership must fall back without comparing or trusting it')
foreign=false
ItemRackSettings.AlwaysCompareBreakoutItems='OFF';native=false
ItemRack.MenuTooltip(owner)
assert(manualCalls==4 and not ShoppingTooltip1.shown,'comparison policy must still hide results when disabled')
ItemRackSettings.AlwaysCompareBreakoutItems='ON';native=true
TooltipComparisonManager=nativeManager();ItemRack.MenuTooltip(owner)
assert(hookCalls==2 and manualCalls==4,'a replacement native manager must get its own observer')
TooltipComparisonManager=nil;ItemRack.MenuTooltip(owner)
assert(manualCalls==5,'legacy clients without a native manager must retain the original explicit path')
TooltipComparisonManager=nativeManager()
hooksecurefunc=function() hookCalls=hookCalls+1;error('hook unavailable') end
local before=hookCalls
for i=1,3 do ItemRack.MenuTooltip(owner) end
assert(hookCalls==before+1 and manualCalls==8,'an unavailable observer must fail once and retain comparisons on every render')
print('[NATIVE COMPARISON DUPLICATE LUA] Production render paths, native reuse, forced/stale/hidden/foreign/secret fallbacks and hook lifecycle passed.')
`, 'reported-tiptac-native-comparison-duplicate');

// November 13 / prokn4h: TipTac Forever Mouse Anchor + floating item button.
// Models its documented SetOwner/default-anchor hooks; this proves anchor-reset
// behavior, not native rendering, scoring or the reporter's complete flicker.
runLua(String.raw`
ItemRack={CombatQueue={},SlotInfo={},StartTimer=function() end,StopTimer=function() end,
  GetPendingSetBindingDisplayID=function() end,GetInfoByID=function(id) return id end,
  ShrinkTooltip=function() end,ShowBreakoutComparison=function() end}
ItemRackSettings={ShowTooltips='ON',TooltipFollow='OFF',MenuOnShift='OFF'}
local function button(id)
  return {GetID=function() return id end,GetName=function() return 'ItemRackButton'..id end,
    GetLeft=function() return 100 end}
end
local owner,other=button(13),button(14)
local defaultCalls,ownerCalls,inventoryCalls,bagCalls=0,0,0,0
local cooldown,firstShowPosition=10,nil
GameTooltip={shown=false,lines={}}
function GameTooltip:GetOwner() return self.owner end
function GameTooltip:IsShown() return self.shown end
function GameTooltip:SetOwner(o,side)
  self.owner=o; self.anchor=side; self.position=side; self.lines={}; ownerCalls=ownerCalls+1
end
function GameTooltip:SetInventoryItem(_,slot) self.item=slot; self.lines={}; inventoryCalls=inventoryCalls+1 end
function GameTooltip:SetBagItem(bag,slot) self.item=bag..':'..slot; self.lines={}; bagCalls=bagCalls+1 end
function GameTooltip:AddLine(line) self.lines[#self.lines+1]=line end
function GameTooltip:Show() firstShowPosition=firstShowPosition or self.position; self.shown=true end
function GameTooltip:Hide() self.shown=false end
function GameTooltip_SetDefaultAnchor(tip,o)
  defaultCalls=defaultCalls+1
  tip:SetOwner(o,'ANCHOR_NONE')
  -- Contract from TipTac 11.12: its default-anchor hook chooses Mouse Anchor.
  tip.position='tiptac-mouse'
end
function GetInventoryItemCooldown() return cooldown end
function GetContainerItemCooldown() return cooldown end
function IsShiftKeyDown() return false end
${extractFunction(core,'ItemRack.InventoryTooltip')}
${extractFunction(core,'ItemRack.AnchorTooltip')}
${extractFunction(core,'ItemRack.GetNativeComparisonRevision')}
${extractFunction(core,'ItemRack.TooltipUpdate')}
${extractFunction(core,'ItemRack.ClearTooltip')}
${extractFunction(core,'ItemRack.OnTooltip')}
owner.UpdateTooltip=ItemRack.InventoryTooltip
other.UpdateTooltip=ItemRack.InventoryTooltip
owner:UpdateTooltip(); ItemRack.TooltipUpdate()
assert(defaultCalls==1 and GameTooltip.position=='tiptac-mouse','initial hover must allow the default-anchor hook')
assert(firstShowPosition=='tiptac-mouse','default-anchor hook must position the tooltip before the first explicit Show')
GameTooltip.position='external-custom-position'
for i=1,10 do owner:UpdateTooltip(); ItemRack.TooltipUpdate() end
assert(defaultCalls==1 and ownerCalls==1,
  'reported-tiptac-mouse-anchor-floating-button: same-owner refresh must not reset anchor/owner')
assert(inventoryCalls==11 and GameTooltip.position=='external-custom-position',
  'content refresh must continue while preserving another addon placement')
ItemRack.CombatQueue[13]='Pending item'
owner:UpdateTooltip(); ItemRack.TooltipUpdate()
assert(GameTooltip.lines[1]=='Queued: Pending item' and defaultCalls==1,'pending text must refresh without resetting placement')
ItemRack.TooltipType='BAG'; ItemRack.TooltipBag=0; ItemRack.TooltipSlot=4
ItemRack.TooltipUpdate()
assert(bagCalls==1 and GameTooltip.item=='0:4' and defaultCalls==1,'bag content changes must retain placement')
other:UpdateTooltip(); ItemRack.TooltipUpdate()
assert(defaultCalls==2 and GameTooltip.owner==other,'a different button must acquire its own anchor')
GameTooltip.owner={} -- another addon owns the shared tooltip now
ItemRack.TooltipUpdate()
assert(defaultCalls==3 and GameTooltip.owner==other,'a foreign owner must not satisfy the refresh guard')
GameTooltip:Hide(); ItemRack.TooltipUpdate()
assert(defaultCalls==4,'a hidden tooltip must reinitialize the default anchor')
ItemRack.ClearTooltip(); other:UpdateTooltip(); ItemRack.TooltipUpdate()
assert(defaultCalls==5,'leave/reenter must establish a fresh tooltip')
ItemRackSettings.TooltipFollow='ON'
ItemRack.TooltipUpdate()
assert(GameTooltip.anchor=='ANCHOR_RIGHT','explicit TooltipFollow placement must still apply')
ItemRackSettings.TooltipFollow='OFF'
ItemRack.TooltipUpdate()
assert(defaultCalls==6 and GameTooltip.position=='tiptac-mouse','switching back to default mode must reinitialize its hook')
ItemRack.OnTooltip(other,'Options title','Options detail')
assert(defaultCalls==7 and #GameTooltip.lines==2,'fresh non-refresh tooltips must clear old content and establish their anchor')
cooldown=0
ItemRack.TooltipUpdate()
assert(defaultCalls==7,'zero-cooldown refresh must preserve the default anchor too')
-- Without a positioning addon, the same policy preserves the native anchor.
ItemRack.ClearTooltip()
function GameTooltip_SetDefaultAnchor(tip,o) defaultCalls=defaultCalls+1; tip:SetOwner(o,'ANCHOR_RIGHT') end
owner:UpdateTooltip(); ItemRack.TooltipUpdate(); ItemRack.TooltipUpdate()
assert(defaultCalls==8 and GameTooltip.anchor=='ANCHOR_RIGHT','native default placement must remain supported')
`, 'reported-tiptac-mouse-anchor-floating-button');
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
${extractFunction(core,'ItemRack.PaperDollItemSlotButton_UpdateTooltip')}
${extractFunction(core,'ItemRack.CallCharacterSlotOnEnter')}
${extractFunction(core,'PaperDollItemSlotButton_OnEnter')}
${extractFunction(core,'ItemRack.RegisterCharacterSlotOnEnterHandlers')}
${anchorHooks}
-- Issue #34 + Forever evidence: both OnEnter script AND button.UpdateTooltip field
-- must be updated from oldPaperDollItemSlotButton_OnEnter to ItemRack's non-flickering handlers.
slot.scripts.OnEnter=ItemRack.oldPaperDollItemSlotButton_OnEnter
slot.UpdateTooltip=ItemRack.oldPaperDollItemSlotButton_OnEnter
assert(ItemRack.RegisterCharacterSlotOnEnterHandlers()==1,'Native character OnEnter and UpdateTooltip handlers must be replaced explicitly')
assert(slot:GetScript('OnEnter')==PaperDollItemSlotButton_OnEnter,'character slot OnEnter must dispatch through ItemRack wrapper')
assert(slot.UpdateTooltip==ItemRack.PaperDollItemSlotButton_UpdateTooltip,'character slot UpdateTooltip must dispatch through ItemRack safe updater to prevent 0.2s flicker')
assert(ItemRack.RegisterCharacterSlotOnEnterHandlers()==0,'character handler registration must be idempotent')
slot:GetScript('OnEnter')(slot)
assert(nativeEnterCalls==1,'registered ItemRack wrapper must invoke the captured native handler exactly once')

-- GearQuest load order: when another addon hooks OnEnter before ItemRack loads,
-- ItemRack must wrap and chain that hook so both breakout menus and third-party hooks run.
local gqHookCalls = 0
local gqSlot = {scripts={}, GetName=function() return 'CharacterHeadSlot' end, GetTop=function() return 300 end}
function gqSlot:GetScript(name) return self.scripts[name] end
function gqSlot:SetScript(name,handler) self.scripts[name]=handler end
gqSlot.scripts.OnEnter = function(s) gqHookCalls = gqHookCalls + 1; nativeEnterCalls = nativeEnterCalls + 1 end
ItemRack.SlotInfo[1].name = 'HeadSlot'
CharacterHeadSlot = gqSlot
local prevReg = ItemRack.RegisterCharacterSlotOnEnterHandlers()
assert(prevReg >= 1, 'Pre-hooked third-party character slot must be registered')
assert(gqSlot:GetScript('OnEnter') == PaperDollItemSlotButton_OnEnter, 'Pre-hooked slot OnEnter must dispatch through ItemRack wrapper')
gqSlot:GetScript('OnEnter')(gqSlot)
assert(gqHookCalls == 1, 'Pre-hooked third-party handler must execute when ItemRack wrapper runs')
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

-- Verify UpdateTooltip on character slot does NOT call nativeEnterCalls, does not wipe tooltip, and updates cursor
local cursorUpdateCalls = 0
function CursorUpdate(button) if button == slot then cursorUpdateCalls = cursorUpdateCalls + 1 end end
local enterCallsBefore = nativeEnterCalls
local ownerCallsBefore = GameTooltip.ownerCalls
slot:UpdateTooltip()
assert(nativeEnterCalls == enterCallsBefore, 'character slot UpdateTooltip must not re-invoke PaperDollItemSlotButton_OnEnter at 5Hz')
assert(GameTooltip.ownerCalls == ownerCallsBefore, 'character slot UpdateTooltip must not reset GameTooltip owner or wipe content')
assert(cursorUpdateCalls == 1, 'character slot UpdateTooltip must update cursor state via CursorUpdate')

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

// November 12 SoD report: PaperDollFrame.xml's script forwards to the global
// OnEnter, rather than retaining the native function object (beta6/beta7).
runLua(String.raw`
ItemRack={SlotInfo={},IsEquipmentManagerOpen=function() return false end}
for i=0,19 do ItemRack.SlotInfo[i]={name='Slot'..i} end
ItemRack.SlotInfo[7].name='LegsSlot'
ItemRackSettings={CharacterSheetMenus='ON',MenuOnShift='OFF',RightSlotsGoLeft='OFF'}
local nativeCalls,xmlCalls,addonCalls,docks=0,0,0,0
local slot={GetName=function() return 'CharacterLegsSlot' end,scripts={}}
function slot:GetScript(name) return self.scripts[name] end
function slot:SetScript(name,handler) self.scripts[name]=handler end
CharacterLegsSlot=slot
ItemRackMenuFrame={IsVisible=function() return ItemRack.menuDockedTo~=nil end,Hide=function() end}
ItemRack.DockMenuToCharacterSheet=function(self) docks=docks+1; ItemRack.menuDockedTo=self:GetName() end
ItemRack.ApplyTooltipAnchor=function() end
function IsShiftKeyDown() return false end
ItemRack.oldPaperDollItemSlotButton_OnEnter=function(self) nativeCalls=nativeCalls+1 end
${extractFunction(core,'ItemRack.CallCharacterSlotOnEnter')}
${extractFunction(core,'ItemRack.PaperDollItemSlotButton_UpdateTooltip')}
${extractFunction(core,'PaperDollItemSlotButton_OnEnter')}
${extractFunction(core,'ItemRack.RegisterCharacterSlotOnEnterHandlers')}
local function xmlForward(self)
  xmlCalls=xmlCalls+1
  assert(xmlCalls<10,'reported-sod-character-onenter-recursion: XML forwarding must not re-enter indefinitely')
  PaperDollItemSlotButton_OnEnter(self)
end
slot.scripts.OnEnter=function(self) xmlForward(self); addonCalls=addonCalls+1 end
ItemRack.RegisterCharacterSlotOnEnterHandlers()
slot:GetScript('OnEnter')(slot)
assert(nativeCalls==1 and xmlCalls==1 and addonCalls==1 and docks==1,
  'SoD XML forwarding must execute native, addon and docking exactly once')
assert(ItemRack.RegisterCharacterSlotOnEnterHandlers()==0,'registration must stay idempotent')
-- A later addon may wrap the installed handler before another registration.
local installed=slot:GetScript('OnEnter')
slot.scripts.OnEnter=function(self) installed(self); addonCalls=addonCalls+1 end
ItemRack.RegisterCharacterSlotOnEnterHandlers()
slot:GetScript('OnEnter')(slot)
assert(nativeCalls==2 and addonCalls==3,'late wrapping must retain both addon hooks without a recursion cycle')
-- Disabled menus must still chain the captured addon/native handler.
ItemRackSettings.CharacterSheetMenus='OFF'
slot:GetScript('OnEnter')(slot)
assert(nativeCalls==3 and addonCalls==5,'disabled menus must preserve native and addon hooks')
-- Errors must remain visible and must not leave a sticky recursion guard.
slot._ItemRackOriginalOnEnter=function() error('addon hover failure') end
local ok,err=pcall(slot:GetScript('OnEnter'),slot)
assert(not ok and tostring(err):find('addon hover failure'),'do not swallow third-party errors')
slot._ItemRackOriginalOnEnter=xmlForward
slot:GetScript('OnEnter')(slot)
assert(nativeCalls==4,'a failed hook must not disable later tooltips')
print('[SOD ONENTER LUA] XML forwarding, addon chaining and error cleanup passed.')
`, 'reported-sod-character-onenter-recursion');
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
GameTooltip={SetBagItem=function() end,SetInventoryItem=function() end,SetHyperlink=function() end,
  HasScript=function(self,name) return name ~= "OnTooltipSetItem" end,
  HookScript=function(self,name,fn)
    if not self:HasScript(name) then
      error("bad argument #2 to '?' (Usage: local success = self:HookScript(scriptTypeName, script [, bindingType]))")
    end
  end}
function hooksecurefunc() hooks=hooks+1 end
ItemRack.RegisterSetTooltipHooks(); ItemRack.RegisterSetTooltipHooks()
assert(registrations==1 and hooks==3,"modern and classic hooks must register together idempotently")
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
assert(hooks==6,"Classic must retain all three legacy hooks")
`, 'forever-modern-set-tooltip');

// User report October 31, 2026: TooltipDataProcessor fails to show set info when hovering bag items (e.g. Baganator / modern WoW tooltips).
// November 14 / Forever beta14: SetLootItem(Copper Ore, 2770) invokes the
// registered item post-call with a secret GameTooltipTextLeft1 string. Lua does
// not implement WoW secrets; poison method lookup on marked *strings* to model
// the exact forbidden operation without pretending to reproduce engine taint.
runLua(String.raw`
local secret,forbiddenReads,lines={},0,{}
local stringMeta=getmetatable('')
local originalIndex=stringMeta.__index
stringMeta.__index=function(value,key)
  if secret[value] then forbiddenReads=forbiddenReads+1; error('attempt to index secret tooltip string') end
  return originalIndex[key]
end
function issecretvalue(value) return secret[value] or false end
ItemRack={MatchesStoredItemFields=function(a,b) return a==b end}
ItemRackSettings={ShowTooltips='ON',ShowSetInTooltip='ON'}
ItemRackUser={Sets={Basic={equip={[13]='15086'}},['~Internal']={equip={[13]='15086'}}}}
local data={}
${extractFunction(core,'ItemRack.GetIRString')}
${extractFunction(core,'ItemRack.OnSetHyperlink')}
${extractFunction(core,'ItemRack.OnTooltipItemData')}
${extractFunction(core,'ItemRack.ListSetsHavingItem')}
${extractFunction(core,'ItemRack.RegisterSetTooltipHooks')}
local texts={}
local tip={GetName=function() return 'GameTooltip' end,NumLines=function() return #texts end}
function tip:AddDoubleLine(left,right)
  texts[#texts+1]=left
  _G['GameTooltipTextLeft'..#texts]={GetText=function() return left end}
  lines[#lines+1]=right
end
local function title(value)
  texts={value}; lines={}
  GameTooltipTextLeft1={GetText=function() return value end}
end
local callback
Enum={TooltipDataType={Item=0}}
TooltipDataProcessor={AddTooltipPostCall=function(_,fn) callback=fn end}
GameTooltip=tip
ItemRack.RegisterSetTooltipHooks()
assert(callback==ItemRack.OnTooltipItemData,'reported path must use the registered item-data post-call')
secret['Copper Ore']=true
title('Copper Ore')
callback(tip,{type=0,id=2770,hyperlink='|cnIQ1:|Hitem:2770::::::::13:1485:::::::::|h[Copper Ore]|h|r'})
assert(#lines==0 and forbiddenReads==0,'reported loot item must not inspect its secret title or invent a saved set')
secret['Devilsaur Tooth']=true
title('Devilsaur Tooth')
callback(tip,{type=0,id=15086,hyperlink='item:15086'})
assert(#lines==1 and lines[1]=='Basic','public item identity may still add its public set beside an unreadable title')
callback(tip,{type=0,id=15086,hyperlink='item:15086'})
assert(#lines==1,'public ItemRack set marker must still prevent duplicate modern callbacks')
title('Devilsaur Tooth')
ItemRack.ListSetsHavingItem(tip,'15086')
ItemRack.ListSetsHavingItem(tip,'15086')
assert(#lines==1,'legacy set-line entry must protect the same secret title and retain deduplication')
title('Public title')
secret['item:15086']=true
ItemRack.OnSetHyperlink(tip,'item:15086')
assert(#lines==0 and forbiddenReads==0,'direct hyperlink hooks must reject secret links before string parsing')
secret['item:15086']=nil
issecretvalue=nil
callback(tip,{hyperlink='item:15086'})
callback(tip,{hyperlink='item:15086'})
assert(#lines==1,'clients without secret APIs must retain normal set lines and deduplication')
ItemRackSettings.ShowSetInTooltip='OFF'
tip.NumLines=function() error('disabled set info must not read tooltip text') end
callback(tip,{hyperlink='item:15086'})
ItemRack.ListSetsHavingItem(tip,'15086')
ItemRackSettings.ShowSetInTooltip='ON'
tip.IsForbidden=function() return true end
callback(tip,{hyperlink='item:15086'})
ItemRack.ListSetsHavingItem(tip,'15086')
assert(forbiddenReads==0,'no secret string method may be indexed')
stringMeta.__index=originalIndex
print('[SECRET TOOLTIP TEXT LUA] Registered loot post-call, legacy reads, public deduplication and secret-link rejection passed.')
`, 'reported-forever-secret-loot-tooltip-text');

runLua(String.raw`
local lines = {}
local _G = _G or getfenv()
local mockTip = {
  numLines = 0,
  GetName = function() return "GameTooltip" end,
  NumLines = function(self) return self.numLines end,
  AddDoubleLine = function(self, left, right)
    self.numLines = self.numLines + 1
    local idx = self.numLines
    _G["GameTooltipTextLeft" .. idx] = { GetText = function() return left end }
    _G["GameTooltipTextRight" .. idx] = { GetText = function() return right end }
    table.insert(lines, { left = left, right = right })
  end,
  ClearLines = function(self)
    for i = 1, self.numLines do
      _G["GameTooltipTextLeft" .. i] = nil
      _G["GameTooltipTextRight" .. i] = nil
    end
    self.numLines = 0
    lines = {}
  end
}
ItemRack = {
  iSPatternItemFieldsFromIR = "^(%-?%d+:%-?%d*:%-?%d*:%-?%d*:%-?%d*:%-?%d*:%-?%d*:%-?%d*)",
  iSPatternRuneIDFromIR = ":runeid:(%d+)$",
  iSPatternBaseIDFromRegular = "item:(%-?%d+)",
  iSPatternBaseIDFromIR = "^(%-?%d+)",
  iSPatternRegularToIR = "item:(.-)\\124h",
  GetID = function(bag, slot)
    if slot then
      if bag == 0 and slot == 1 then return "32252:0:0:0:0:0:0:0:70:0" end
      return 0
    else
      if bag == 6 then return "32252:0:0:0:0:0:0:0:70:0" end
      return 0
    end
  end
}
ItemRackSettings = { ShowTooltips = "ON", ShowSetInTooltip = "ON" }
ItemRackUser = {
  Sets = {
    Bis = { equip = { [6] = "32252:0:0:0:0:0:0:0:70:0" } },
    ["~Internal"] = { equip = { [6] = "32252:0:0:0:0:0:0:0:70:0" } }
  }
}
local data = {}
` + `
${extractFunction(core, 'ItemRack.NormalizeItemFields')}
${extractFunction(core, 'ItemRack.SameItemFields')}
${extractFunction(core, 'ItemRack.GetRuneID')}
${extractFunction(core, 'ItemRack.HasRuneID')}
${extractFunction(core, 'ItemRack.MatchesStoredItemFields')}
${extractFunction(core, 'ItemRack.GetIRString')}
${extractFunction(core, 'ItemRack.ListSetsHavingItem')}
${extractFunction(core, 'ItemRack.OnSetBagItem')}
${extractFunction(core, 'ItemRack.OnSetInventoryItem')}
${extractFunction(core, 'ItemRack.OnSetHyperlink')}
${extractFunction(core, 'ItemRack.OnTooltipItemData')}
${extractFunction(core, 'ItemRack.RegisterSetTooltipHooks')}
` + String.raw`
-- 1. Bag item via data.getterName and getterArgs
mockTip:ClearLines()
ItemRack.OnTooltipItemData(mockTip, { getterName = "GetBagItem", getterArgs = { 0, 1 } })
assert(#lines == 1 and lines[1].right == "Bis", "bag item must resolve through GetBagItem args")
-- 1b. Bag item via tooltip.processingInfo and data.id
mockTip:ClearLines()
mockTip.processingInfo = { getterName = "GetBagItem", getterArgs = { 0, 1 } }
ItemRack.OnTooltipItemData(mockTip, { id = 32252 })
mockTip.processingInfo = nil
assert(#lines == 1 and lines[1].right == "Bis", "bag item must resolve through tooltip.processingInfo")
-- 1c. Baganator button owner with owner.BGR.itemLink
mockTip:ClearLines()
mockTip.GetOwner = function() return { BGR = { itemLink = "|cffa335ee|Hitem:32252:0:0:0:0:0:0:0:70:0|h[Flashfire Girdle]|h|r" } } end
ItemRack.OnTooltipItemData(mockTip, { id = 32252 })
mockTip.GetOwner = nil
assert(#lines == 1 and lines[1].right == "Bis", "Baganator button owner itemLink must resolve")
-- 1d. Standard container button owner with parent bag 0 and slot 1
mockTip:ClearLines()
mockTip.GetOwner = function() return { GetParent = function() return { GetID = function() return 0 end } end, GetID = function() return 1 end } end
ItemRack.OnTooltipItemData(mockTip, { id = 32252 })
mockTip.GetOwner = nil
assert(#lines == 1 and lines[1].right == "Bis", "standard container button owner bag/slot must resolve")
-- 2. Duplicate line prevention on repeated calls
ItemRack.OnTooltipItemData(mockTip, { getterName = "GetBagItem", getterArgs = { 0, 1 } })
assert(#lines == 1, "duplicate calls must not add duplicate set lines")
-- 3. Equipped item via data.getterName and getterArgs
mockTip:ClearLines()
ItemRack.OnTooltipItemData(mockTip, { getterName = "GetInventoryItem", getterArgs = { "player", 6 } })
assert(#lines == 1 and lines[1].right == "Bis", "inventory item must resolve through GetInventoryItem args")
-- 4. Target inspection must NOT display player set info
mockTip:ClearLines()
ItemRack.OnTooltipItemData(mockTip, { getterName = "GetInventoryItem", getterArgs = { "target", 6 } })
assert(#lines == 0, "target unit inspection must not display player set info")
-- 5. Raw item string without |h via getterArgs
mockTip:ClearLines()
ItemRack.OnTooltipItemData(mockTip, { getterName = "GetHyperlink", getterArgs = { "item:32252:0:0:0:0:0:0:0:70:0" } })
assert(#lines == 1 and lines[1].right == "Bis", "raw item string must be parsed by GetHyperlink")
-- 6. data.hyperlink with raw item string
mockTip:ClearLines()
ItemRack.OnTooltipItemData(mockTip, { hyperlink = "item:32252:0:0:0:0:0:0:0:70:0" })
assert(#lines == 1 and lines[1].right == "Bis", "data.hyperlink must resolve raw item strings")
-- 7. data.id numeric fallback
mockTip:ClearLines()
ItemRack.OnTooltipItemData(mockTip, { id = 32252 })
assert(#lines == 1 and lines[1].right == "Bis", "data.id must resolve numeric item fallback")
-- 8. Forbidden tooltips must be skipped without errors
local forbiddenTip = { IsForbidden = function() return true end }
ItemRack.OnTooltipItemData(forbiddenTip, { id = 32252 })
-- 9. GetIRString parsing variants
assert(ItemRack.GetIRString("item:32252:0:0:0:0:0:0:0:70:0") == "32252:0:0:0:0:0:0:0:70:0", "raw item string parsing")
assert(ItemRack.GetIRString("32252") == "32252", "numeric string parsing")
assert(ItemRack.GetIRString(32252) == "32252", "number parsing")
assert(ItemRack.GetIRString("|cffa335ee|Hitem:32252:0:0:0:0:0:0:0:70:0|h[Flashfire Girdle]|h|r") == "32252:0:0:0:0:0:0:0:70:0", "hyperlink parsing")
assert(ItemRack.GetIRString("spell:1234") == 0, "non-item string must return 0")

-- 10. October 31, 2026 report: OnTooltipSetItem must trigger set lines for classic bag/hyperlink items
mockTip:ClearLines()
mockTip.scripts = {}
mockTip.HookScript = function(self, name, handler) self.scripts[name] = handler end
mockTip.GetItem = function(self) return "Flashfire Girdle", "|cffa335ee|Hitem:32252:0:0:0:0:0:0:0:70:0|h[Flashfire Girdle]|h|r" end
mockTip.Layout = function(self) self.laidOut = true end
GameTooltip = mockTip

ItemRack.SetTooltipHooksRegistered = nil
ItemRack.RegisterSetTooltipHooks()
assert(mockTip.scripts["OnTooltipSetItem"] ~= nil, "OnTooltipSetItem hook must be registered on GameTooltip")
mockTip.scripts["OnTooltipSetItem"](mockTip)
assert(#lines == 1 and lines[1].right == "Bis", "OnTooltipSetItem must add Bis set line for hovered bag item")
assert(mockTip.laidOut == true, "tooltip:Layout() must refresh tooltip bounds")

-- 11. Deduplication when both OnTooltipSetItem and SetBagItem fire for the same item
ItemRack.OnSetBagItem(mockTip, 0, 1)
assert(#lines == 1 and lines[1].right == "Bis", "deduplication must prevent adding duplicate set line")

-- 12. ItemRefTooltip hook registration
mockTip:ClearLines()
local mockRefTip = { scripts = {}, HookScript = function(self, n, h) self.scripts[n] = h end, GetItem = function() return "Flashfire Girdle", "|cffa335ee|Hitem:32252:0:0:0:0:0:0:0:70:0|h[Flashfire Girdle]|h|r" end, AddDoubleLine = function(self, left, right) table.insert(lines, { left = left, right = right }) end }
ItemRefTooltip = mockRefTip
ItemRack.SetTooltipHooksRegistered = nil
ItemRack.RegisterSetTooltipHooks()
assert(mockRefTip.scripts["OnTooltipSetItem"] ~= nil, "OnTooltipSetItem hook must be registered on ItemRefTooltip")
mockRefTip.scripts["OnTooltipSetItem"](mockRefTip)
assert(#lines == 1 and lines[1].right == "Bis", "OnTooltipSetItem must add Bis set line on ItemRefTooltip")
`, 'modern-tooltip-bag-and-hyperlink-data');

// October 13, 2026 Forever report from Venruki: unlike current Retail, the client does not
// enable automatic comparison tooltips by default, so ItemRack flyout rows only
// compare while the player holds the client comparison modifier.
const breakoutComparisonFunctions = [
  extractFunction(core, 'ItemRack.GetNativeComparisonRevision'),
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
  extractFunction(core, 'ItemRack.GetNativeComparisonRevision'),
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
