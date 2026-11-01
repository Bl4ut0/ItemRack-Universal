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
const recordEquipTime = extractFunction(queueFile, 'ItemRack.RecordEquipTime');
const isRecentEquip = extractFunction(queueFile, 'ItemRack.IsRecentEquip');
const toggleSet = extractFunction(equipFile, 'ItemRack.ToggleSet');
const endSetSwap = extractFunction(equipFile, 'ItemRack.EndSetSwap');
const optionsFile = 'ItemRackOptions/ItemRackOptions.lua';
const hasUnsavedSetChanges = extractFunction(optionsFile, 'ItemRackOpt.HasUnsavedSetChanges');
const changeEditingSet = extractFunction(optionsFile, 'ItemRackOpt.ChangeEditingSet');
const setupQueue = extractFunction(optionsFile, 'ItemRackOpt.SetupQueue');

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
${recordEquipTime}
${isRecentEquip}

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

-- 2. Issue #33 / neferens: When an active on-use trinket (e.g. 18984 Gadgetzan) is equipped out of queue and ready,
-- it must be EVICTED and yield to Set 2's top queue item (23206 Mark of the Champion) since it is not in the set's queue!
ItemRack.GetID = function(slot)
  if slot == 14 then return "18984" end
  return "999"
end
GetInventoryItemCooldown = function(unit, slot)
  return 0, 0, 1 -- active item ready to use
end
local activeEvictCandidate, activeEvictCandidateID = ItemRack.AutoQueueItemToEquip(14, "18984", 1, true, "Set2", set2Context)
check(tostring(activeEvictCandidateID) == "23206",
  "Issue #33 / neferens: unqueued active on-use item (Gadgetzan) must yield to new set queue item (Mark of the Champion)")

-- 3. But when an active on-use trinket IS in the queue (e.g. 21180 Earthstrike at index 2 of Set 2) and ready,
-- it must NOT be swapped away unless activated or priority is set!
local set2WithActiveList = {
  { id="23206", priority=false, keep=false, delay=0 },
  { id="21180", priority=false, keep=false, delay=0 },
}
local set2WithActiveContext = { owner="Set2", list=set2WithActiveList, enabled=true }
ItemRack.GetID = function(slot)
  if slot == 14 then return "21180" end
  return "999"
end
local heldCandidate = ItemRack.AutoQueueItemToEquip(14, "21180", 1, true, "Set2", set2WithActiveContext)
check(heldCandidate == nil,
  "Issue #33 / neferens: active on-use item present in queue and ready must hold until activated")

-- 4. If the active candidate in queue has priority=true, it CAN swap out the ready item
set2WithActiveList[1].priority = true
local priorityCandidate, priorityCandidateID = ItemRack.AutoQueueItemToEquip(14, "21180", 1, true, "Set2", set2WithActiveContext)
check(tostring(priorityCandidateID) == "23206",
  "Issue #33: priority=true queue item must be able to swap out active ready item")
set2WithActiveList[1].priority = false

-- 4. Issue #33 follow-up (neferens): PopulateSortList adds all carried trinkets to every set's queue
-- with priority=false. When Set 1 has { 11815, 23206 } and Set 2 has { 23206, 11815 }, switching to Set 2
-- while 11815 (passive) is equipped (matchedCurrent=true at index 2) must immediately swap to 23206 at index 1!
local set2FullList = {
  { id="23206", priority=false, keep=false, delay=0 },
  { id="11815", priority=false, keep=false, delay=0 },
}
local set2FullContext = { owner="Set2", list=set2FullList, enabled=true }
ItemRack.GetID = function(slot)
  if slot == 14 then return "11815" end
  return "999"
end
GetInventoryItemCooldown = function(unit, slot)
  return 0, 0, 0 -- passive Hand of Justice
end
local reorderedCandidate, reorderedCandidateID = ItemRack.AutoQueueItemToEquip(14, "11815", 0, true, "Set2", set2FullContext)
check(tostring(reorderedCandidateID) == "23206",
  "Issue #33: passive item at index 2 of new set's queue must yield to passive item at index 1 without requiring priority=true")

-- Once 23206 (index 1) is equipped, AutoQueueItemToEquip must stop at index 1 and not swap to index 2 (11815)
ItemRack.GetID = function(slot)
  if slot == 14 then return "23206" end
  return "999"
end
local stableCandidate = ItemRack.AutoQueueItemToEquip(14, "23206", 0, true, "Set2", set2FullContext)
check(stableCandidate == nil,
  "Issue #33: once top passive item (index 1) is equipped, queue must remain stable and not swap to index 2")

-- 5. Issue #33 follow-up: ToggleSet and Options Queue UI (ItemRackOptSubFrame7) live refresh when switching sets
${toggleSet}
${endSetSwap}
ItemRackOpt = {
  Inv = {},
  HoldInv = {},
  SpecDirty = false,
  SetModified = false,
  NormalizeSetIcon = function(icon) return icon or "default-icon" end,
  UpdateInv = function() end,
  LayoutQueueControls = function() end,
  PopulateSortList = function(slot)
    ItemRackOpt.lastPopulatedSlot = slot
    ItemRackOpt.lastPopulatedList = ItemRack.GetQueues(ItemRackOpt.QueueEditingSet)[slot]
  end,
  ValidateSortButtons = function() end,
}
for i = 0, 19 do
  ItemRackOpt.Inv[i] = { id = "999", selected = nil }
  ItemRackOpt.HoldInv[i] = { id = "999", selected = nil }
end
${hasUnsavedSetChanges}
${changeEditingSet}
${setupQueue}

local uiSetNameText = "Set1"
local footerSetName = ""
local footerSetIcon = ""
ItemRackOptSetsName = {
  GetText = function() return uiSetNameText end,
  SetText = function(_, text) uiSetNameText = text end,
}
ItemRackOptSetsSaveButton = {
  IsEnabled = function() return true end, -- ValidateSetButtons enables Save whenever any set is loaded
}
ItemRackOptFrame = { IsVisible = function() return true end }
ItemRackOptSubFrame2 = { IsVisible = function() return false end }
ItemRackOptSubFrame5 = { IsVisible = function() return false end, Hide = function() end }
ItemRackOptSubFrame7 = { IsVisible = function() return true end, Show = function() end }
ItemRackOptSlotQueueName = { SetText = function() end }
ItemRackOptQueueSetIcon = { SetTexture = function(_, tex) footerSetIcon = tex end }
ItemRackOptQueueSetName = { SetText = function(_, text) footerSetName = text end }
ItemRackOptQueueSetInfo = { Show = function() end }
ItemRackSettings = { EquipOnSetPick = "OFF" }
ItemRack.SlotInfo = { [14] = { real = "Trinket 2" } }
ItemRack.ClearLockList = function() end
C_Timer = C_Timer or { After = function() end }
ItemRack.UpdateCombatQueue = function() end
ItemRack.PeriodicQueueCheck = function() ItemRack.periodicQueueCalled = (ItemRack.periodicQueueCalled or 0) + 1 end
ItemRack.GetQueues = function(setname)
  return ItemRackUser.Sets[setname] and ItemRackUser.Sets[setname].Queues or ItemRackUser.Queues
end

ItemRackUser.EnablePerSetQueues = "ON"
ItemRackUser.Queues = { [14] = {} }
ItemRackUser.CurrentSet = "Set1"
ItemRackUser.Sets.Set1 = {
  icon = "icon-set1",
  equip = { [1] = "999" },
  Queues = { [14] = { { id = "11815" }, { id = "23206" } } },
}
ItemRackUser.Sets.Set2 = {
  icon = "icon-set2",
  equip = { [1] = "999" },
  Queues = { [14] = { { id = "23206" }, { id = "11815" } } },
}

-- A. ToggleSet("Set2") while Set1 is active must call EquipSet("Set2") even when Set1 and Set2 share identical equip items
local toggleEquipped, toggleUnequipped = nil, nil
ItemRack.IsSetEquipped = function(name) return name == "Set1" or name == "Set2" end
ItemRack.EquipSet = function(name) toggleEquipped = name end
ItemRack.UnequipSet = function(name) toggleUnequipped = name end
ItemRack.ToggleSet("Set2")
check(toggleEquipped == "Set2" and toggleUnequipped == nil,
  "ToggleSet(Set2) while Set1 is active must equip Set2 instead of unequipping Set2 as a no-op")

-- B. With ItemRackOptSubFrame7 open on slot 14 for Set1, EndSetSwap("Set2") must switch the Queue UI to Set2's queue
ItemRackOpt.SetupQueue(14)
check(ItemRackOpt.QueueEditingSet == "Set1" and footerSetName == "Set1" and ItemRackOpt.lastPopulatedList == ItemRackUser.Sets.Set1.Queues[14],
  "SetupQueue(14) initially binds to Set1's queue")
ItemRack.periodicQueueCalled = 0
ItemRack.EndSetSwap("Set2")
check(ItemRackUser.CurrentSet == "Set2", "EndSetSwap(Set2) must update CurrentSet to Set2")
check(uiSetNameText == "Set2" and ItemRackOpt.QueueEditingSet == "Set2" and footerSetName == "Set2" and footerSetIcon == "icon-set2",
  "EndSetSwap(Set2) must update ItemRackOptSetsName and QueueEditingSet to Set2 even when Save button is enabled")
check(ItemRackOpt.lastPopulatedList == ItemRackUser.Sets.Set2.Queues[14],
  "EndSetSwap(Set2) must refresh open ItemRackOptSubFrame7 to display Set2's queue contents")
check(ItemRack.periodicQueueCalled >= 1,
  "EndSetSwap(Set2) must trigger PeriodicQueueCheck")

-- C. If the user is actively editing a set on the Sets tab (ItemRackOptSubFrame2 visible and SetModified=true), EndSetSwap preserves their unsaved edits
ItemRackOptSubFrame2 = { IsVisible = function() return true end }
ItemRackOptSubFrame7 = { IsVisible = function() return false end, Show = function() end }
uiSetNameText = "DraftSet"
ItemRackOpt.SetModified = true
ItemRack.EndSetSwap("Set1")
check(uiSetNameText == "DraftSet",
  "EndSetSwap must preserve unsaved edits when the user is actively editing on the Sets tab")


-- Set swap performance regression:
-- Passive items without on-use effects must settle immediately on attempt 0
-- without scheduling C_Timer retry loops or spamming equip_timer_pending diagnostics.
local timerCallbacks = {}
C_Timer = {
  After = function(delay, callback)
    table.insert(timerCallbacks, callback)
  end
}
GetItemSpell = function(id)
  if tostring(id) == "21180" or tostring(id) == "99999" then return "Earthstrike" end
  return nil
end
GetItemInfo = function(id) return "Item " .. tostring(id) end
GetInventoryItemLink = function(unit, slot) return nil end
ItemRack.GetEquippedSlotState = function(slot)
  return "resolved", slotExactIDs and slotExactIDs[slot] or "12345"
end
ItemRack.ClearEquipTimer = function(slot)
  if ItemRackUser and ItemRackUser.EquipTimers then
    ItemRackUser.EquipTimers[slot] = nil
  end
  ItemRack.EquipTimers = ItemRackUser and ItemRackUser.EquipTimers
end

slotExactIDs = {
  [1] = "12345",  -- passive helm
  [14] = "21180", -- active trinket (Earthstrike)
  [13] = "99999", -- active trinket
}
slotCooldowns = {
  [1] = { start = 0, duration = 0, enable = 1 },
  [14] = { start = 0, duration = 0, enable = 1 },
  [13] = { start = 0, duration = 0, enable = 1 },
}
GetInventoryItemCooldown = function(unit, slot)
  if slotCooldowns and slotCooldowns[slot] then
    return slotCooldowns[slot].start, slotCooldowns[slot].duration, slotCooldowns[slot].enable
  end
  return 0, 0, 1
end

-- A. Passive item (helm slot 1) has no on-use effect. It must settle immediately.
${isRecentEquip}
diagnosticEvents = {}
timerCallbacks = {}
ItemRack.RecordEquipTime(1, "12345", 100)
check(ItemRackUser.EquipTimers[1] ~= nil, "EquipTimers[1] must be recorded")
check(ItemRackUser.EquipTimers[1].pending == nil, "Passive item must not be pending")
check(ItemRackUser.EquipTimers[1].hasPenalty == false, "Passive item must have hasPenalty = false")
check(ItemRackUser.EquipTimers[1].used == true, "Passive item must have used = true")
check(#timerCallbacks == 0, "Passive item must not schedule any C_Timer retries")
check(not ItemRack.IsRecentEquip(1, "12345"), "Passive item must not be held by IsRecentEquip")
check(#diagnosticEvents == 1 and diagnosticEvents[1].event == "equip_timer_recorded",
  "Passive item must record immediately without equip_timer_pending events")

-- B. On-use item (trinket slot 14) has on-use spell.
-- Initially start=0, duration=0 while cooldown settles. It must register pending and retry.
diagnosticEvents = {}
timerCallbacks = {}
ItemRack.RecordEquipTime(14, "21180", 100)
check(ItemRackUser.EquipTimers[14] ~= nil, "EquipTimers[14] must be recorded")
check(ItemRackUser.EquipTimers[14].pending == true, "On-use item must be pending while cooldown settles")
check(#timerCallbacks == 1, "On-use item must schedule a C_Timer retry")
check(#diagnosticEvents == 1 and diagnosticEvents[1].event == "equip_timer_pending",
  "On-use item must log equip_timer_pending on initial attempt")

-- Cooldown appears on next tick (30s equip penalty)
slotCooldowns[14] = { start = 100, duration = 30, enable = 1 }
local retry = table.remove(timerCallbacks, 1)
retry()
check(ItemRackUser.EquipTimers[14].pending == nil, "On-use item must resolve pending status")
check(ItemRackUser.EquipTimers[14].hasPenalty == true, "On-use item must record hasPenalty = true")
check(ItemRackUser.EquipTimers[14].used == false, "On-use item must record used = false")
check(ItemRack.IsRecentEquip(14, "21180") == true, "On-use item must be held by IsRecentEquip")

-- C. On-use item that never receives a cooldown must cap at attempt 4 instead of spinning to 12
timerCallbacks = {}
ItemRack.RecordEquipTime(13, "99999", 100, 0)
check(#timerCallbacks == 1, "attempt 0 schedules retry")
local retry1 = table.remove(timerCallbacks, 1)
retry1()
check(#timerCallbacks == 1, "attempt 1 schedules retry")
local retry2 = table.remove(timerCallbacks, 1)
retry2()
check(#timerCallbacks == 1, "attempt 2 schedules retry")
local retry3 = table.remove(timerCallbacks, 1)
retry3()
check(#timerCallbacks == 1, "attempt 3 schedules retry")
local retry4 = table.remove(timerCallbacks, 1)
retry4()
check(#timerCallbacks == 0, "attempt 4 must settle without scheduling further retries")
check(ItemRackUser.EquipTimers[13].pending == nil, "attempt 4 must settle pending status")
check(ItemRackUser.EquipTimers[13].hasPenalty == false, "attempt 4 without cooldown must have hasPenalty = false")
check(ItemRackUser.EquipTimers[13].used == true, "attempt 4 without cooldown must have used = true")

print(string.format("[QUEUE RUNTIME LUA] %d purity and provenance checks passed.",checks))
`, 'queue-runtime');
