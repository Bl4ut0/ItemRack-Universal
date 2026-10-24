const { extractFunction, runLua } = require('./lib/lua_harness');

const queueFile = 'ItemRack/ItemRackQueue.lua';
const equipFile = 'ItemRack/ItemRackEquip.lua';
const clearManual = extractFunction(queueFile, 'ItemRack.ClearManualQueueChoice');
const findQueueEntry = extractFunction(queueFile, 'ItemRack.FindQueueEntryIndex');
const isManual = extractFunction(queueFile, 'ItemRack.IsManualQueueChoice');
const setManual = extractFunction(queueFile, 'ItemRack.SetManualQueueChoice');
const autoQueue = extractFunction(queueFile, 'ItemRack.AutoQueueItemToEquip');
const resolveProxy = extractFunction(queueFile, 'ItemRack.ResolveProxy');
const shouldHold = extractFunction(queueFile, 'ItemRack.ShouldHoldEquippedItem');
const isSetEquipped = extractFunction(equipFile, 'ItemRack.IsSetEquipped');
const itemRackFile = 'ItemRack/ItemRack.lua';
const findPlayerAura = extractFunction(itemRackFile, 'ItemRack.FindPlayerAura');

runLua(String.raw`
local activeList = { { id="100" } }
local inspectedList = { { id="200" } }
local contexts = {
  Active = { owner="Active", list=activeList, enabled=true },
  Other = { owner="Other", list=inspectedList, enabled=true },
}

ItemRackUser = {
  EnableQueues="ON",
  Sets={ Other={ equip={ [13]="200" } } },
}
ItemRack = {
  QueueStateReady=true,
  ManualQueueChoice={ [13]="100" },
  ManualQueueChoiceOwner={ [13]="Active" },
  GetQueueContext=function(_,setname) return contexts[setname or "Active"] end,
  IsEquippedSlotStateReady=function() return true end,
  SameExactID=function(a,b) return tostring(a)==tostring(b) end,
  SameID=function(a,b) return tostring(a)==tostring(b) end,
  MatchesStoredItemFields=function(a,b) return tostring(a)==tostring(b) end,
  MatchesStoredItemID=function(a,b) return tostring(a)==tostring(b) end,
  HasRuneID=function() return false end,
  IsBareItemID=function(value) return not string.find(tostring(value),":",1,true) end,
  IsQueueEntryUnambiguous=function() return true end,
  IsQueueItemBurnt=function() return false end,
  GetID=function() return "999" end,
  GetIRString=function(value) return tostring(value) end,
  GetProxyBuff=function() return nil end,
  ShouldHoldEquippedItem=function() return false end,
  IsRecentEquip=function() return false end,
  GetDefaultSwapIn=function() return 30 end,
  GetItemCooldownLeft=function() return 0 end,
  ItemNearReady=function() return false end,
  IsCandidateReady=function() return false end,
  FindItemInBags=function() return nil end,
  Debug=function() end,
}
function GetInventoryItemCooldown() return 0,0,1 end
function GetItemSpell() return nil end
function GetTime() return 100 end
AuraUtil = { FindAuraByName=function() return nil end }

${clearManual}
${findQueueEntry}
${isManual}
${setManual}
${autoQueue}
${resolveProxy}
${shouldHold}
${isSetEquipped}
${findPlayerAura}

local checks = 0
local function check(value,message) assert(value,message); checks = checks + 1 end

check(ItemRack.IsManualQueueChoice(13,"100","100",nil,activeList,"Active"),
  "manual hold must validate against its atomic active context")
check(not ItemRack.IsManualQueueChoice(13,"100","100","Other",inspectedList,"Other"),
  "manual hold must not cross into a different queue owner")

local matched = ItemRack.IsSetEquipped("Other")
check(not matched, "fixture must inspect a physically different set")
check(ItemRack.ManualQueueChoice[13] == "100" and ItemRack.ManualQueueChoiceOwner[13] == "Active",
  "IsSetEquipped must not mutate a manual choice while inspecting another set")

-- Candidate selection is a query. Even a stale hold is cleaned only by the
-- explicit ProcessAutoQueue mutation path, never by this reusable predicate.
ItemRack.ManualQueueChoice[13] = "Missing"
ItemRack.ManualQueueChoiceOwner[13] = "Active"
ItemRack.AutoQueueItemToEquip(13,"999",1,false,nil,contexts.Active)
check(ItemRack.ManualQueueChoice[13] == "Missing" and ItemRack.ManualQueueChoiceOwner[13] == "Active",
  "AutoQueueItemToEquip must remain side-effect free for manual choices")

ItemRack.SetManualQueueChoice(13,"100")
check(ItemRack.ManualQueueChoice[13] == "100" and ItemRack.ManualQueueChoiceOwner[13] == "Active",
  "manual choices must record the same owner that supplied their list")
ItemRack.ClearManualQueueChoice(13)
check(ItemRack.ManualQueueChoice[13] == nil and ItemRack.ManualQueueChoiceOwner[13] == nil,
  "manual choice cleanup must clear identity and provenance together")

local cooldownList = { { id="200" }, { id="999" } }
local cooldownContext = { owner="Cooldown", list=cooldownList, enabled=true }
ItemRack.FindItemInBags=function() return 0,1 end
ItemRack.IsCandidateReady=function() return true end
ItemRack.GetObservedItemCooldown=function() return nil end
local candidate = ItemRack.AutoQueueItemToEquip(13,"999",0,true,"Cooldown",cooldownContext)
check(candidate == nil,
  "raw enable=0 must not override normalized hold/readiness state")

cooldownList[2].delay = 10
ItemRack.GetObservedItemCooldown=function() return { start=95, duration=60 } end
candidate = ItemRack.AutoQueueItemToEquip(13,"999",1,false,"Cooldown",cooldownContext)
check(candidate == nil,
  "false-zero raw slot sample must not bypass delay from shared authority")

-- PR #25 / CurseForge fr33lanc3 / ConaldPetersen:
-- Verify ShouldHoldEquippedItem executes cleanly with QueueDiagnostic active
-- and correctly calls ItemRack.ResolveProxy without global ResolveProxy errors.
local diagnosticEvents = {}
ItemRack.QueueDiagnostic = function(event, data)
  table.insert(diagnosticEvents, { event = event, data = data })
end
ItemRack.IsRecentEquip = function() return false end
ItemRack.GetDefaultSwapIn = function() return 30 end
ItemRack.GetItemCooldownLeft = function() return 5 end
ItemRack.CooldownProxies = { [100] = { id = 9999 } }

local held = ItemRack.ShouldHoldEquippedItem(13, "100", "100")
check(held == true, "equipped item within threshold must be held")
check(#diagnosticEvents == 1, "QueueDiagnostic must record hold decision")
check(diagnosticEvents[1].data.proxy == 9999, "QueueDiagnostic must resolve proxy via ItemRack.ResolveProxy")

diagnosticEvents = {}
local heldNonProxy = ItemRack.ShouldHoldEquippedItem(13, "200", "200")
check(heldNonProxy == true, "non-proxy item within threshold must be held")
check(diagnosticEvents[1].data.proxy == nil, "non-proxy item must report nil proxy in QueueDiagnostic")

-- Issue #32 regression: Error when Edit Mode is engaged
-- AuraUtil.FindAuraByName throws "attempt to call a nil value" during Edit Mode on Retail
AuraUtil.FindAuraByName = function() error("AuraUtil.lua:25: attempt to call a nil value") end
local safeAuraResult = nil
local auraCallOk, auraCallErr = pcall(function()
  safeAuraResult = ItemRack.FindPlayerAura("Battle Shout")
end)
check(auraCallOk == true, "FindPlayerAura must protect against AuraUtil throwing nil error")
check(safeAuraResult == nil, "FindPlayerAura must return nil safely when aura lookup fails")

-- Restore safe mock for AuraUtil
AuraUtil.FindAuraByName = function(name) if name == "ActiveBuff" then return "ActiveBuff" end return nil end
check(ItemRack.FindPlayerAura("ActiveBuff") == "ActiveBuff", "FindPlayerAura must return active buff when present")

-- Issue #33 regression: Trinket Queue behavior for passive trinkets when switching sets
-- Set 1 had Hand of Justice (11815, passive) equipped in slot 14.
-- Set 2 has empty slot 14 with its own queue containing Mark of the Champion (23206, passive) as #1.
-- Hand of Justice is not in Set 2's queue.
local set2List = { { id="23206", priority=false, keep=false, delay=0 }, { id=0 } }
local set2Context = { owner="Set2", list=set2List, enabled=true }

-- Hand of Justice is passive: GetItemSpell returns nil, GetInventoryItemCooldown returns enable=0
ItemRack.GetObservedItemCooldown = function() return nil end
GetItemSpell = function(id)
  if tostring(id) == "21180" then return "Earthstrike" end
  return nil
end
GetInventoryItemCooldown = function(unit, slot)
  -- Slot 14 has passive Hand of Justice (enable=0)
  return 0, 0, 0
end
ItemRack.GetID = function(slot)
  if slot == 14 then return "11815" end
  return "999"
end
ItemRack.GetIRString = function(id) return tostring(id) end
ItemRack.FindItemInBags = function(id)
  if tostring(id) == "23206" then return 0, 2 end
  return nil
end
ItemRack.IsCandidateReady = function() return true end

-- 1. When passive Hand of Justice (11815) is equipped, it must yield to Set 2's top passive queue item (23206)
local passiveCandidate, passiveCandidateID = ItemRack.AutoQueueItemToEquip(14, "11815", 0, true, "Set2", set2Context)
check(tostring(passiveCandidateID) == "23206",
  "Issue #33: unqueued passive item (Hand of Justice) must yield to preferred passive queue item (Mark of the Champion)")

-- 2. When an ACTIVE on-use trinket (21180 Earthstrike) is equipped out of queue and ready, it must NOT be swapped away unless priority is set
ItemRack.GetID = function(slot)
  if slot == 14 then return "21180" end
  return "999"
end
GetInventoryItemCooldown = function(unit, slot)
  return 0, 0, 1 -- active item ready to use
end
local activeCandidate = ItemRack.AutoQueueItemToEquip(14, "21180", 1, true, "Set2", set2Context)
check(activeCandidate == nil,
  "Issue #33: unqueued active on-use item ready to use must hold against non-priority queue items")

-- 3. If the active candidate in queue has priority=true, it CAN swap out the unqueued active item
set2List[1].priority = true
local priorityCandidate, priorityCandidateID = ItemRack.AutoQueueItemToEquip(14, "21180", 1, true, "Set2", set2Context)
check(tostring(priorityCandidateID) == "23206",
  "Issue #33: priority=true queue item must be able to swap out active ready item")
set2List[1].priority = false

print(string.format("[QUEUE RUNTIME LUA] %d purity and provenance checks passed.",checks))
`, 'queue-runtime');
