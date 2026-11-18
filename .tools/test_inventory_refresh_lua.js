const { extractFunction, runLua } = require('./lib/lua_harness');
const fs = require('fs');

const coreFile = 'ItemRack/ItemRack.lua';
const buttonsFile = 'ItemRack/ItemRackButtons.lua';
const queueFile = 'ItemRack/ItemRackQueue.lua';
const coreSource = fs.readFileSync(coreFile, 'utf8');
const policySource = fs.readFileSync('ItemRack/ItemRackQueuePolicy.lua', 'utf8');
const transactionSource = fs.readFileSync('ItemRack/ItemRackTransaction.lua', 'utf8');
const equipSource = fs.readFileSync('ItemRack/ItemRackEquip.lua', 'utf8');
const requestRefresh = extractFunction(coreFile, 'ItemRack.RequestInventoryRefresh');
const flushRefresh = extractFunction(coreFile, 'ItemRack.FlushInventoryRefresh');
const checkCombatQueue = extractFunction(coreFile, 'ItemRack.CheckCombatQueue');
const transactionFinalized = extractFunction(coreFile, 'ItemRack.OnEquipmentTransactionFinalized');

runLua(String.raw`
local timers = {}
local profile = 0
local buttonUpdates,menuBuilds,optionUpdates = 0,0,0
local menuVisible,optionsVisible = true,true

C_Timer = { After=function(delay,callback) table.insert(timers,callback) end }
function debugprofilestop() profile=profile+0.25; return profile end
function runTimer()
  local callback=table.remove(timers,1)
  assert(callback,"expected a scheduled refresh")
  callback()
end

ItemRackMenuFrame = { IsVisible=function() return menuVisible end }
ItemRackOptFrame = { IsVisible=function() return optionsVisible end }
ItemRackOpt = { Inv={}, UpdateInv=function() optionUpdates=optionUpdates+1 end }
for i=0,19 do ItemRackOpt.Inv[i]={ selected=(i==5) } end

ItemRack = {
  DebugTags={},
  UpdateButtons=function() buttonUpdates=buttonUpdates+1 end,
  BuildMenu=function() menuBuilds=menuBuilds+1 end,
  GetID=function(slot) return "slot:"..tostring(slot) end,
  Debug=function() end,
}

${requestRefresh}
${flushRefresh}
${checkCombatQueue}
${transactionFinalized}

local checks = 0
local function check(value,message) assert(value,message); checks=checks+1 end

for i=1,19 do ItemRack.RequestInventoryRefresh("event_"..i) end
check(#timers == 1,"same-frame inventory burst must schedule one renderer batch")
runTimer()
check(buttonUpdates == 1 and menuBuilds == 1 and optionUpdates == 1,
  "one batch must update each visible presentation surface once")
check(ItemRack.InventoryRefreshState.lastBatchEvents == 19,
  "metrics must retain the number of coalesced source events")
check(ItemRackOpt.Inv[4].id == "slot:4" and ItemRackOpt.Inv[5].id == nil,
  "options refresh must preserve the actively selected slot")

-- Dirty state remains pending across an active/chained transaction. The final
-- transaction callback is the single point that schedules presentation work.
local reconcileCalls = 0
local combatQueueHookCalls = 0
ItemRack.QueueStateReady = true
ItemRack.ReconcileEquippedSnapshot = function(fromEvent)
  reconcileCalls = reconcileCalls + 1
  assert(fromEvent == false, "transaction finalization must reconcile with fromEvent=false")
  return nil, false, false
end
local origCheckCombatQueue = ItemRack.CheckCombatQueue
ItemRack.CheckCombatQueue = function()
  combatQueueHookCalls = combatQueueHookCalls + 1
  origCheckCombatQueue()
end

ItemRack.ActiveEquipmentTransaction={ id=7 }
for i=1,8 do ItemRack.RequestInventoryRefresh("transaction_event") end
check(#timers == 0,"active transaction must defer expensive presentation work")
ItemRack.ActiveEquipmentTransaction=nil
ItemRack.OnEquipmentTransactionFinalized({ status="complete" })
check(#timers == 1,"finalized transaction must release the deferred batch")
check(reconcileCalls == 1,"finalized transaction must reconcile equipped snapshot once")
check(combatQueueHookCalls == 1,"finalized transaction must check combat queue once")
runTimer()
check(buttonUpdates == 2 and ItemRack.InventoryRefreshState.lastBatchEvents == 9,
  "transaction events and finalization must collapse into one batch")

-- If a transaction begins after scheduling but before the next frame, the
-- callback keeps the dirty bit and finalization safely reschedules it.
ItemRack.RequestInventoryRefresh("pre_transaction")
ItemRack.ActiveEquipmentTransaction={ id=8 }
runTimer()
check(buttonUpdates == 2 and ItemRack.InventoryRefreshState.dirty,
  "scheduled callback must not paint an in-flight transaction")
ItemRack.ActiveEquipmentTransaction=nil
ItemRack.OnEquipmentTransactionFinalized({ status="failed_rolled_back" })
check(#timers == 1,"deferred dirty state must reschedule after rollback")
runTimer()
check(buttonUpdates == 3,"rollback settlement must produce one final refresh")

menuVisible,optionsVisible = false,false
ItemRack.RequestInventoryRefresh("hidden_surfaces")
runTimer()
check(buttonUpdates == 4 and menuBuilds == 3 and optionUpdates == 3,
  "hidden menu and options surfaces must not be rebuilt")
check(ItemRack.InventoryRefreshState.batches == 4
  and ItemRack.InventoryRefreshState.totalMilliseconds > 0,
  "refresh metrics must record batches and measured execution time")

-- Test CheckCombatQueue logic directly
ItemRack.CheckCombatQueue = origCheckCombatQueue
ItemRack.CombatQueue = { [1] = 100 }
ItemRack.GetEquippedSlotState = function(slot) return "resolved", 100 end
ItemRack.MatchesStoredItemID = function(a, b) return a == b end
local metadataCleared, visualsUpdated = 0, 0
ItemRack.ClearCombatQueueMetadata = function(slot) metadataCleared = metadataCleared + 1 end
ItemRack.UpdateCombatQueue = function() visualsUpdated = visualsUpdated + 1 end

ItemRack.CheckCombatQueue()
check(ItemRack.CombatQueue[1] == nil and metadataCleared == 1 and visualsUpdated == 1,
  "CheckCombatQueue must clear fulfilled entries and update visuals")

-- Empty CombatQueue must be a no-op
visualsUpdated = 0
ItemRack.CheckCombatQueue()
check(visualsUpdated == 0, "empty CombatQueue must not trigger visual updates")

print(string.format("[INVENTORY REFRESH LUA] %d coalescing and transaction checks passed.",checks))
`, 'inventory-refresh');

// November 12 review: actual transaction completion must retain its provenance
// after FinishRequest clears ActiveEquipmentTransaction. API state is modeled.
runLua(String.raw`
local now=0
local timers={}
local bags={[0]={[1]='200'}}
local inv={[13]='100'}
local cursor
function GetTime() return now end
C_Timer={After=function(delay,cb) timers[#timers+1]={due=now+delay,cb=cb} end}
local function settle()
 while #timers>0 do local t=table.remove(timers,1);now=t.due;t.cb() end
end
function CursorHasItem() return cursor~=nil end
function GetCursorInfo() if cursor then return 'item',tonumber(cursor) end end
function SpellIsTargeting() return false end
function InCombatLockdown() return false end
function IsInventoryItemLocked() return false end
function GetContainerItemInfo() return nil,nil,false end
function PickupContainerItem(b,s) cursor,bags[b][s]=bags[b][s],cursor end
function PickupInventoryItem(s) cursor,inv[s]=inv[s],cursor end
ItemRackSettings={DisableSwapSound='OFF'}
ItemRackUser={EnableQueues='ON'}
local list={{id='200'},{id='100'}}
ItemRack={QueueStateReady=true,EquippedSnapshot={[13]='100'},CombatQueue={},
 Debug=function() end,QueueDiagnostic=function() end,
 GetID=function(b,s) if s then return bags[b][s] or 0 end return inv[b] or 0 end,
 GetEquippedSlotState=function(s) if inv[s] then return 'resolved',inv[s] end return 'empty',0 end,
 SameExactID=function(a,b) return a==b end,
 SameID=function(a,b) return a==b end,
 MatchesStoredItemID=function(a,b) return a==b end,
 MatchesStoredItemFields=function(a,b) return a==b end,
 IsBareItemID=function() return true end,
 IsQueueEntryUnambiguous=function() return true end,
 GetQueueContext=function() return {owner='A',list=list,enabled=true} end,
 GetQueuesEnabled=function() return {[13]=true,[14]=true} end,
 GetInfoByID=function() return 'Trinket',1,'INVTYPE_TRINKET' end,
 IsPlayerReallyDead=function() return false end,
 AnythingLocked=function() return false end,
 ClearEquipTimer=function() end,
 RequestInventoryRefresh=function() end,
 MuteSwapSounds=function() end}
${['ItemRack.FindQueueEntryIndex','ItemRack.SetManualQueueChoice','ItemRack.ClearManualQueueChoice'].map(n=>extractFunction('ItemRack/ItemRackQueue.lua',n)).join('\n')}
${extractFunction(coreFile,'ItemRack.ReconcileEquippedSnapshot')}
${transactionFinalized}
${require('fs').readFileSync('ItemRack/ItemRackTransaction.lua','utf8')}
${extractFunction(coreFile,'ItemRack.EquipItemByID')}
local result=ItemRack.EquipItemByID('200',13,true,0,1)
assert(result=='submitted')
-- An unrelated external slot change during completion must still be noticed.
inv[14]='400'
settle()
assert(inv[13]=='200' and not ItemRack.ActiveEquipmentTransaction and not cursor)
assert(not ItemRack.ManualQueueChoice[13],
 'internal-autoqueue-provenance: an internally equipped queue item must not acquire a manual hold at completion')
assert(ItemRack.ManualQueueChoice[14]=='400','only transaction-touched slots are exempt from external detection')
-- A deliberately requested persistent hold must survive internal completion.
ItemRack.EquipItemByID('100',13,false,0,1,'manual_hold')
settle()
assert(inv[13]=='100' and ItemRack.ManualQueueChoice[13]=='100' and ItemRack.ManualQueueHold[13],
 'transaction completion must preserve an explicitly requested persistent hold')
-- An external replacement is a fresh temporary choice, not the old persistent hold.
inv[13]='300'
ItemRack.ReconcileEquippedSnapshot(true)
assert(ItemRack.ManualQueueChoice[13]=='300' and not ItemRack.ManualQueueHold[13],
 'external replacement must clear the previous item persistent-hold flag')
assert(ItemRack.ManualQueueChoice[14]=='400' and ItemRack.ManualQueueChoiceOwner[13]=='A',
 'external detection must retain independent slot and owner context')
print('[TRANSACTION PROVENANCE LUA] Internal swaps, external choices and explicit holds passed.')
`, 'internal-autoqueue-provenance');

// GitHub #38 (neferens v4.59-beta16):
// Switching Dungeon -> Boss -> TrinketMenu manual slot 13 -> Dungeon leaves Slot 17 in
// CombatQueue[17] when Slot 13 AutoQueue Transaction 19 settles. Pre-fix UpdateCurrentSet
// evaluates mid-chain before ProcessCombatQueue drains CombatQueue[17], briefly flagging
// HybridSet = "PvE Any (Drakes)" via a banked cloak set whose fallback cloak happens to be worn.
runLua(String.raw`
local now=10
local timers={}
local inv={
  [1]='1001:0:0:0:0:0:0:0',   -- tank helm
  [13]='22954:0:0:0:0:0:0:0', -- Kiss of the Spider
  [15]='23045:849:0:0:0:0:0:0', -- Cloak of the Necropolis
  [17]='19019:0:0:0:0:0:0:0', -- Thunderfury
}
local bags={
  [0]={
    [1]='2001:0:0:0:0:0:0:0', -- dps helm
    [2]='23041:0:0:0:0:0:0:0', -- Slayer's Crest
    [3]='23577:1900:0:0:0:0:0:0', -- The Hungering Cold
  }
}
local cursor
local slotLocked={}
INVSLOT_AMMO,INVSLOT_RANGED=0,18
CUSTOM='Custom'
function GetTime() return now end
C_Timer={
  After=function(delay,cb) table.insert(timers,{due=now+delay,cb=cb}) end,
  NewTimer=function(delay,cb)
    local h={canceled=false}
    function h:Cancel() self.canceled=true end
    table.insert(timers,{due=now+delay,cb=function() if not h.canceled then cb() end end})
    return h
  end,
}
function InCombatLockdown() return false end
function UnitAffectingCombat() return false end
function CursorHasItem() return cursor~=nil end
function GetCursorInfo() if cursor then return 'item',tonumber(tostring(cursor):match('^(%d+)')) end end
function ClearCursor() cursor=nil end
function SpellIsTargeting() return false end
function IsInventoryItemLocked(s) return slotLocked[s]==true end
function GetContainerNumSlots(b) return b==0 and 4 or 0 end
function GetContainerItemInfo(b,s) return nil,nil,false end
function GetContainerItemLink(b,s) return bags[b] and bags[b][s] end
function GetInventoryItemID(_,s) return inv[s] and tonumber(tostring(inv[s]):match('^(%d+)')) end
function GetInventoryItemLink(_,s) return inv[s] end
function GetInventoryItemTexture(_,s) return inv[s] and ('tex:'..tostring(inv[s])) end
function GetInventorySlotInfo() return 0,'tex:empty' end
function GetInventoryItemCooldown() return 0,0,0 end
function GetItemCooldown() return 0,0,0 end
function GetItemSpell() return nil end
function GetItemInfo(id)
  local s=tostring(id or '')
  if s:find('23045') or s:find('15138') then return 'Cloak',1,'INVTYPE_CLOAK'
  elseif s:find('22954') or s:find('23041') then return 'Trinket',1,'INVTYPE_TRINKET'
  elseif s:find('19019') or s:find('23577') then return 'Weapon',1,'INVTYPE_WEAPON'
  else return 'Helm',1,'INVTYPE_HEAD' end
end
function PickupContainerItem(b,s) cursor,bags[b][s]=bags[b][s],cursor end
function PickupInventoryItem(s) cursor,inv[s]=inv[s],cursor end
function ShowHelm() end
function ShowCloak() end
function GetActiveTalentGroup() return 1 end
function GetNumTalentGroups() return 1 end
function strrep(s,n) return string.rep(s,n) end
function UnitLevel() return 60 end

ItemRackSettings={DisableSwapSound='OFF',AllowHidden='OFF',AllowEmpty='ON',HideTradables='OFF'}
ItemRackUser={
  EnableQueues='ON',
  EnablePerSetQueues='ON',
  EnableQueueContextCheck='ON',
  EnableEvents='OFF',
  CurrentSet='PvE Tank Dungeon Other',
  Buttons={},
  EquipTimers={},
  BurntQueueItems={},
  Sets={
    ['PvE Tank Dungeon Other']={
      icon='IconTank',
      equip={[1]='1001:0:0:0:0:0:0:0',[15]='23045:849:0:0:0:0:0:0'},
      Queues={
        [13]={{id='22954:0:0:0:0:0:0:0'},{id='23041:0:0:0:0:0:0:0'},{id=0}},
        [15]={{id='23045:849:0:0:0:0:0:0'},{id=0}},
        [17]={{id='19019:0:0:0:0:0:0:0'},{id='23577:1900:0:0:0:0:0:0'},{id=0}},
      },
      QueuesEnabled={[13]=true,[15]=true,[17]=true},
    },
    ['PvE Damage Boss Other']={
      icon='IconBoss',
      equip={[1]='2001:0:0:0:0:0:0:0',[15]='23045:849:0:0:0:0:0:0'},
      Queues={
        [13]={{id='22954:0:0:0:0:0:0:0'},{id='23041:0:0:0:0:0:0:0'},{id=0}},
        [15]={{id='23045:849:0:0:0:0:0:0:0'},{id=0}},
        [17]={{id='23577:1900:0:0:0:0:0:0'},{id='19019:0:0:0:0:0:0:0'},{id=0}},
      },
      QueuesEnabled={[13]=true,[15]=true,[17]=true},
    },
    ['PvE Any (Drakes)']={
      icon='IconDrakes',
      equip={[15]='15138:0:0:0:0:0:0:0'}, -- Onyx Scale Cloak in bank (missing from bags)
      Queues={[15]={{id='15138:0:0:0:0:0:0:0'},{id='23045:849:0:0:0:0:0:0'},{id=0}}},
      QueuesEnabled={[15]=true},
    },
    ['~CombatQueue']={equip={}},
    ['~Unequip']={equip={}},
  },
}
ItemRack={
  LockList={[-2]={},[-1]={},[0]={},[1]={},[2]={},[3]={},[4]={},[5]={},[6]={},[7]={},[8]={},[9]={},[10]={},[11]={}},
  KnownItems={}, BankSlots={}, PhantomItem={}, PopulateKnownItems=function() end,
  CombatQueue={}, RunAfterCombat={}, SetsWaiting={}, SwapList={}, eqBackOfTheBusOffset=100,
  QueueStateReady=true, QueueStateGeneration=1,
  EquippedSnapshot={[1]=inv[1],[13]=inv[13],[15]=inv[15],[17]=inv[17]},
  UnresolvedEquippedSlots={}, PendingEquipTransitionTimes={}, EquipTimers=ItemRackUser.EquipTimers,
  BurntQueueItems=ItemRackUser.BurntQueueItems,
  iSPatternBaseIDFromIR='^(%-?%d+)',
  iSPatternEnhancementsFromIR='^(%-?%d+):(%-?%d*):(%-?%d*):(%-?%d*):(%-?%d*)',
  iSPatternItemFieldsFromIR='^(%-?%d+:%-?%d*:%-?%d*:%-?%d*:%-?%d*:%-?%d*:%-?%d*:%-?%d*)',
  iSPatternRuneIDFromIR=':runeid:(%d+)$',
  Debug=function() end, Print=function() end, QueueDiagnostic=function() end,
  MuteSwapSounds=function() end, UpdateCombatQueue=function() end, UpdateButtonCooldowns=function() end,
  GetRuneID=nil,
  SlotInfo={
    [1]={name='HeadSlot'},[13]={name='Trinket0Slot'},[14]={name='Trinket1Slot'},
    [15]={name='BackSlot'},[17]={name='SecondaryHandSlot'},
  },
  GetIRString=function(val,base)
    local s=tostring(val or '')
    if base then return s:match('^(%-?%d+)') or 0 end
    return s:match('item:(.-)|h') or s
  end,
  GetID=function(b,s) if s then return bags[b] and bags[b][s] or 0 end return inv[b] or 0 end,
  ValidBag=function(b) return b==0 end,
  FindSpace=function() for s=1,4 do if not bags[0][s] then return 0,s end end end,
  ClearLockList=function() for _,l in pairs(ItemRack.LockList) do for k in pairs(l) do l[k]=nil end end end,
  GetInfoByID=function(id)
    local n,_,e=GetItemInfo(id)
    return n,'tex:'..tostring(id),e
  end,
  IsPlayerReallyDead=function() return false end,
  CanPlayerDualWield=function() return true end,
  IsRecentEquip=function() return false end,
  ObserveItemCooldown=function() return {active=false,known=true} end,
  GetObservedItemCooldown=function() return nil end,
  GetProxyBuff=function() return nil end,
  ResolveProxy=function() return nil end,
}
${policySource}
${['ItemRack.GetEquippedSlotState','ItemRack.IsEquippedSlotStateReady','ItemRack.IsBareItemID','ItemRack.SameExactID','ItemRack.SameID','ItemRack.UpdateIRString','ItemRack.NormalizeItemFields','ItemRack.SameItemFields','ItemRack.GetRuneID','ItemRack.HasRuneID','ItemRack.GetEnhancements','ItemRack.MatchesStoredItemFields','ItemRack.MatchesStoredItemID',
  'ItemRack.GetQueueContext','QueueFieldProxy','ItemRack.GetQueues','ItemRack.GetQueuesEnabled','ItemRack.GetActiveQueueOwner',
  'ItemRack.FindItem','ItemRack.FindItemInBags','ItemRack.ClearEquipTimer','ItemRack.ReconcileEquippedSnapshot',
  'ItemRack.ClearCombatQueueMetadata','ItemRack.AddToCombatQueue','ItemRack.RemoveFromCombatQueue','ItemRack.CancelDeferredSetRequests',
  'ItemRack.CheckCombatQueue','ItemRack.ProcessCombatQueue','ItemRack.OnEquipmentTransactionFinalized',
  'ItemRack.RequestInventoryRefresh','ItemRack.FlushInventoryRefresh','ItemRack.UpdateCurrentSet','ItemRack.EquipItemByID','ItemRack.GetTextureBySlot']
  .map(n=>extractFunction(coreFile,n)).join('\n')}
${['ItemRack.QueueHasExplicitIdentityEntry','ItemRack.IsQueueEntryUnambiguous','ItemRack.FindQueueEntryIndex',
  'ItemRack.GetQueueBurnKey','ItemRack.IsManualQueueChoice','ItemRack.SetManualQueueChoice','ItemRack.ClearManualQueueChoice','ItemRack.ClearBurntQueueItems',
  'ItemRack.IsQueueItemBurnt','ItemRack.GetDefaultSwapIn','ItemRack.GetItemCooldownLeft','ItemRack.IsCandidateReady','ItemRack.ShouldHoldEquippedItem',
  'ItemRack.PeriodicQueueCheck','ItemRack.ProcessAutoQueue','ItemRack.AutoQueueItemToEquip','ItemRack.IsOffhandBlocked']
  .map(n=>extractFunction(queueFile,n)).join('\n')}
${extractFunction(buttonsFile,'ItemRack.UpdateButtons')}
${transactionSource}
${equipSource}

local observedHybrids={}
local origUpdate=ItemRack.UpdateCurrentSet
ItemRack.UpdateCurrentSet=function()
  origUpdate()
  if ItemRack.HybridSet then table.insert(observedHybrids,ItemRack.HybridSet) end
end
local function stepAllTimers(limit)
  local runs=0
  while #timers>0 do
    table.sort(timers,function(a,b) return a.due<b.due end)
    local t=table.remove(timers,1); now=t.due; t.cb()
    runs=runs+1; assert(runs<(limit or 200),'timer loop exceeded')
  end
end

-- Step 1 & 2: Switch Dungeon -> Boss and let AutoQueue finish (19019 -> 23577)
ItemRack.EquipSet('PvE Tank Dungeon Other'); stepAllTimers()
ItemRack.EquipSet('PvE Damage Boss Other'); stepAllTimers()
assert(inv[1]=='2001:0:0:0:0:0:0:0' and inv[13]=='22954:0:0:0:0:0:0:0' and inv[17]=='23577:1900:0:0:0:0:0:0',
  'Step 2 Boss set must be fully equipped with Spider + Hungering Cold')

-- Step 3: Manually swap Slot 13 from Spider (22954) to Slayer Crest (23041) externally (TrinketMenu)
inv[13],bags[0][2]=bags[0][2],inv[13]
ItemRack.ReconcileEquippedSnapshot(true)
assert(ItemRack.ManualQueueChoice[13]=='23041:0:0:0:0:0:0:0','TrinketMenu manual swap must record ManualQueueChoice')

-- Step 4: Equip Dungeon set again and check EVERY frame tick for a brief Drakes Hybrid flash!
observedHybrids={}
ItemRack.EquipSet('PvE Tank Dungeon Other')
stepAllTimers()
assert(#observedHybrids==0,
  'issue-38-chained-autoqueue-no-drakes-hybrid-flash: must never flash HybridSet ('..tostring(observedHybrids[1])..') between Slot 13 and Slot 17 AutoQueue transactions')
assert(ItemRackUser.CurrentSet=='PvE Tank Dungeon Other' and ItemRack.HybridSet==nil,
  'Dungeon set must be active with HybridSet nil after all queued swaps settle')
assert(inv[1]=='1001:0:0:0:0:0:0:0' and inv[13]=='22954:0:0:0:0:0:0:0' and inv[17]=='19019:0:0:0:0:0:0:0',
  'All Dungeon gear + Slot 13 Spider + Slot 17 Thunderfury must end equipped')
assert(not next(ItemRack.CombatQueue),'CombatQueue must be drained')

-- Also test when slot locks momentarily keep CombatQueue[17] waiting across UpdateCurrentSet ticks
ItemRack.EquipSet('PvE Damage Boss Other'); stepAllTimers()
observedHybrids={}
local origProcessCQ=ItemRack.ProcessCombatQueue
local blockProcessOnce=true
ItemRack.ProcessCombatQueue=function()
  if blockProcessOnce then blockProcessOnce=false; return end
  origProcessCQ()
end
ItemRack.EquipSet('PvE Tank Dungeon Other')
stepAllTimers()
-- Drain the delayed slot 17 now (like LocksChanged 0.2s later)
origProcessCQ(); stepAllTimers()
assert(#observedHybrids==0,
  'issue-38-locked-combatqueue-no-drakes-hybrid: UpdateCurrentSet must defer while out-of-combat CombatQueue holds Slot 17')
assert(inv[17]=='19019:0:0:0:0:0:0:0' and ItemRack.HybridSet==nil,'delayed CombatQueue[17] must finish cleanly')

print('[ISSUE 38 CHAINED AUTOQUEUE LUA] Zero brief Drakes Hybrid flash across chained & lock-delayed AutoQueue steps passed.')
`, 'issue-38-chained-autoqueue-no-drakes-hybrid-flash');

// GitHub #39 (cryptonoobevo): External TrinketMenu swap must keep IRU quick-access button icons
// in sync even when UNIT_INVENTORY_CHANGED precedes PLAYER_EQUIPMENT_CHANGED or ITEM_LOCK_CHANGED unlock.
runLua(String.raw`
local timers={}
local buttonTextures={[13]='Interface\\Icons\\OldTrinket',[14]='Interface\\Icons\\OtherTrinket'}
local buttonDesaturated={[13]=false,[14]=false}
local slotTexture='Interface\\Icons\\OldTrinket'
local slotItem='100:0:0:0:0:0:0:0'
local slotLocked={[13]=false}
local inventoryLocked=false
C_Timer={After=function(_,cb) table.insert(timers,cb) end}
local function runAllTimers()
  while #timers>0 do local cb=table.remove(timers,1); cb() end
end
function GetTime() return 100 end
function InCombatLockdown() return false end
function IsInventoryItemLocked(s) return slotLocked[s]==true end
function GetInventoryItemTexture(_,s) return s==13 and slotTexture or 'Interface\\Icons\\OtherTrinket' end
function GetInventoryItemID(_,s) return s==13 and tonumber(tostring(slotItem):match('^(%d+)')) or 999 end
function GetInventoryItemLink(_,s) return s==13 and slotItem or '999:0:0:0:0:0:0:0' end
function GetInventoryItemCount() return 1 end
function GetInventoryItemCooldown() return 0,0,1 end
function GetInventorySlotInfo() return 0,'empty' end

ItemRackSettings={}
ItemRackUser={
  EnableQueues='ON', EnablePerSetQueues='OFF',
  CurrentSet=nil, Buttons={[13]={},[14]={}}, Sets={},
  Queues={[13]={{id='100:0:0:0:0:0:0:0'},{id='200:0:0:0:0:0:0:0'}}},
  QueuesEnabled={[13]=true},
  EquipTimers={}, BurntQueueItems={},
}
for _,s in ipairs({13,14}) do
  _G['ItemRackButton'..s..'ItemRackIcon']={
    SetTexture=function(_,tex) buttonTextures[s]=tex end,
    SetDesaturated=function(_,flag) buttonDesaturated[s]=flag end,
  }
  _G['ItemRackButton'..s..'Count']={SetText=function() end,Hide=function() end,Show=function() end}
end
ItemRack={
  QueueStateReady=true, QueueStateGeneration=1,
  EquippedSnapshot={[13]=slotItem,[14]='999:0:0:0:0:0:0:0'},
  UnresolvedEquippedSlots={}, PendingEquipTransitionTimes={},
  CombatQueue={}, SetsWaiting={}, LockedButtons={},
  DebugTags={},
  iSPatternBaseIDFromIR='^(%-?%d+)',
  iSPatternEnhancementsFromIR='^(%-?%d+):(%-?%d*):(%-?%d*):(%-?%d*):(%-?%d*)',
  iSPatternItemFieldsFromIR='^(%-?%d+:%-?%d*:%-?%d*:%-?%d*:%-?%d*:%-?%d*:%-?%d*:%-?%d*)',
  iSPatternRuneIDFromIR=':runeid:(%d+)$',
  Debug=function() end, QueueDiagnostic=function() end,
  AnythingLocked=function() return inventoryLocked end,
  UpdateButtonCooldowns=function() end, SetRuneIconOverlay=function() end,
  UpdateCurrentSet=function() end, UpdateCombatQueue=function() end,
  GetCustomItemIcon=function() return nil end, ClearEquipTimer=function() end,
  TryEquipPendingQueueSet=function() end, ScheduleEquippedStateRetry=function() end,
  GetIRString=function(v,base) local s=tostring(v or ''); return base and (s:match('^(%-?%d+)') or 0) or s end,
  GetID=function(s) return s==13 and slotItem or '999:0:0:0:0:0:0:0' end,
  ProcessCombatQueue=function() end, ProcessSetsWaiting=function() end,
}
ItemRackMenuFrame={IsVisible=function() return false end}
ItemRackOptFrame={IsVisible=function() return false end}
${policySource}
${['ItemRack.GetEquippedSlotState','ItemRack.IsBareItemID','ItemRack.SameExactID','ItemRack.SameID','ItemRack.NormalizeItemFields','ItemRack.SameItemFields','ItemRack.GetRuneID','ItemRack.HasRuneID','ItemRack.MatchesStoredItemFields','ItemRack.MatchesStoredItemID',
  'ItemRack.GetQueueContext','QueueFieldProxy','ItemRack.GetQueues','ItemRack.GetQueuesEnabled','ItemRack.GetActiveQueueOwner',
  'ItemRack.ReconcileEquippedSnapshot','ItemRack.CheckCombatQueue','ItemRack.RequestInventoryRefresh','ItemRack.FlushInventoryRefresh',
  'ItemRack.GetTextureBySlot','ItemRack.OnUnitInventoryChanged','ItemRack.LocksChanged']
  .map(n=>extractFunction(coreFile,n)).join('\n')}
${coreSource.includes('function ItemRack.ReconcileInventoryState') ? extractFunction(coreFile,'ItemRack.ReconcileInventoryState') : ''}
${coreSource.includes('function ItemRack.OnPlayerEquipmentChanged') ? extractFunction(coreFile,'ItemRack.OnPlayerEquipmentChanged') : ''}
${['ItemRack.FindQueueEntryIndex','ItemRack.ClearManualQueueChoice','ItemRack.SetManualQueueChoice']
  .map(n=>extractFunction(queueFile,n)).join('\n')}
${extractFunction(buttonsFile,'ItemRack.UpdateButtons')}
${extractFunction(buttonsFile,'ItemRack.UpdateButtonLocks')}

-- Scenario A: External TrinketMenu swap where UNIT_INVENTORY_CHANGED fires BEFORE
-- client texture/link settles, and PLAYER_EQUIPMENT_CHANGED fires once settled.
ItemRack.OnUnitInventoryChanged(nil,'UNIT_INVENTORY_CHANGED','player')
runAllTimers()
assert(buttonTextures[13]=='Interface\\Icons\\OldTrinket')

slotItem='200:0:0:0:0:0:0:0'
slotTexture='Interface\\Icons\\NewTrinket'
if ItemRack.OnPlayerEquipmentChanged then
  ItemRack.OnPlayerEquipmentChanged(nil,'PLAYER_EQUIPMENT_CHANGED',13,true)
end
runAllTimers()
assert(buttonTextures[13]=='Interface\\Icons\\NewTrinket',
  'issue-39-external-swap-button-icon-sync: PLAYER_EQUIPMENT_CHANGED must sync ItemRackButton13 icon to newly equipped trinket')
assert(ItemRack.ManualQueueChoice and ItemRack.ManualQueueChoice[13]=='200:0:0:0:0:0:0:0',
  'external trinket swap settled on PLAYER_EQUIPMENT_CHANGED must record ManualQueueChoice so AutoQueue does not revert it')

-- Scenario B: External swap settles via ITEM_LOCK_CHANGED unlock (LocksChanged) without another event
slotLocked[13]=true
ItemRack.UpdateButtonLocks()
assert(buttonDesaturated[13]==true and ItemRack.LockedButtons[13]==1)
slotLocked[13]=false
slotItem='300:0:0:0:0:0:0:0'
slotTexture='Interface\\Icons\\ThirdTrinket'
ItemRack.LocksChanged()
runAllTimers()
assert(buttonDesaturated[13]==false and buttonTextures[13]=='Interface\\Icons\\ThirdTrinket',
  'issue-39-external-swap-lock-settlement: LocksChanged must sync button texture when an external slot swap unlocks')

-- Scenario C: Bag-only lock/unlock without button unlock or slot change must not schedule a spurious refresh
local beforeBatches=ItemRack.InventoryRefreshState.batches
ItemRack.LocksChanged()
assert(#timers==0 and ItemRack.InventoryRefreshState.batches==beforeBatches,
  'unrelated bag lock settlement must not trigger spurious inventory refreshes')

print('[ISSUE 39 EXTERNAL SWAP ICON SYNC LUA] PLAYER_EQUIPMENT_CHANGED, unlock settlement and bag-lock isolation checks passed.')
`, 'issue-39-external-swap-button-icon-sync');
