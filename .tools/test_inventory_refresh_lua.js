const { extractFunction, runLua } = require('./lib/lua_harness');

const coreFile = 'ItemRack/ItemRack.lua';
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
