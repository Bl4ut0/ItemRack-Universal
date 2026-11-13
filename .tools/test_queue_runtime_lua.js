const { extractFunction, runLua } = require('./lib/lua_harness');
const specialFiles = ['ItemRack/ItemRackSpecialItems.lua','ItemRack/ItemRackSpecialItemsEra.lua',
  'ItemRack/ItemRackSpecialItemsTBC.lua','ItemRack/ItemRackSpecialItemsForever.lua'];
const loadSpecialCatalog = specialFiles.map(file =>
  `assert((loadstring or load)([====[${require('fs').readFileSync(file,'utf8')}]====]))()`).join('\n');

runLua(String.raw`
ItemRack={IsEngravingActive=function() return seasonal end}
function GetTime() return 100 end
local interface
function GetBuildInfo() return 'fixture','70938','fixture',interface end
local function loadCatalog(toc,sod)
 interface=toc; seasonal=sod
 ${loadSpecialCatalog}
end
local checks=0
local function check(value,message) assert(value,message);checks=checks+1 end
for _,toc in ipairs({11508,11509,20505,20506,16001,11601,120100}) do
 loadCatalog(toc,false)
 local s=ItemRack.SpecialItems
 if toc==120100 then
  check(next(s.Rules)==nil and next(s.SpellIndex)==nil,'unsupported client must allocate no item rules')
 else
  local tbc=toc==20505 or toc==20506
  check((s.Rules[30720]~=nil)==tbc,'special-client-data-isolation: only TBC loads the mana-gem rule')
  check((s.GetRule(16022).cooldown.start=='native')==tbc,'TBC must retain native Dragonling use detection')
  check(s.Rules[228955]==nil,'nonseasonal clients must not allocate SoD variant rows')
  check(s.Rules[34430]~=nil==tbc,'TBC-specific items must not appear in other catalogs')
  check(s.GetRule(16022,13) and s.GetRule(16022,14) and not s.GetRule(16022,17),
   'item slot maps must use runtime equipment slots, not inventory-type IDs')
  check(s.GetRule(10645).effect.kind=='channel' and s.GetRule(10645).effect.hold,
   'reviewed Death Ray channel policy must be enabled on every supported client')
  for id,rule in pairs(s.Rules) do
   check(type(id)=='number' and id>0 and type(rule.name)=='string' and type(rule.slots)=='table','catalog identity must be explicit')
   for slot,allowed in pairs(rule.slots) do check(slot>=0 and slot<=19 and slot==math.floor(slot) and allowed==true,'catalog slots must be valid') end
   if rule.enabled and rule.cooldown and rule.cooldown.start=='deferred' then
    local expectedSpell=({[23074]=19804,[23075]=12749,[23076]=4073,[19804]=19804})[rule.useSpell]
    check(rule.activation.successSpells[expectedSpell] and not rule.activation.successSpells[19830],
     'summon proof must not accidentally match the crafting recipe')
   end
  end
 end
end
loadCatalog(11509,true)
check(ItemRack.SpecialItems.Rules[228955].cooldown.seconds==300 and ItemRack.SpecialItems.Rules[213347],
 'SoD variants must load only in their seasonal client, with independent metrics')
print(string.format('[SPECIAL ITEM CATALOG LUA] %d client-isolation, item-ID, slot and disabled-rule checks passed.',checks))
`, 'special-client-data-isolation');

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
const findAuraByName = extractFunction(itemRackFile, 'ItemRack.FindAuraByName');
const recordEquipTime = extractFunction(queueFile, 'ItemRack.RecordEquipTime');
const isRecentEquip = extractFunction(queueFile, 'ItemRack.IsRecentEquip');
const toggleSet = extractFunction(equipFile, 'ItemRack.ToggleSet');
const isProtectedByManualToggle = extractFunction(queueFile, 'ItemRack.IsSlotProtectedByManualToggle');
const isSetPendingInCombatQueue = extractFunction(equipFile, 'ItemRack.IsSetPendingInCombatQueue');
const cancelCombatQueueSet = extractFunction(equipFile, 'ItemRack.CancelCombatQueueSet');
const purgeAutomaticSetsWaiting = extractFunction(equipFile, 'ItemRack.PurgeAutomaticSetsWaiting');
const endSetSwap = extractFunction(equipFile, 'ItemRack.EndSetSwap');
const holdSlot = extractFunction(queueFile, 'ItemRack.HoldSlot');
const clearHoldSlot = extractFunction(queueFile, 'ItemRack.ClearHoldSlot');
const updateCurrentSet = extractFunction(itemRackFile, 'ItemRack.UpdateCurrentSet');
const setButton20Visual = extractFunction(itemRackFile, 'ItemRack.SetButton20Visual');
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
${findAuraByName}
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

-- Issue #33 follow-up: Foreign item manual hold and clearance
-- When a player Right-Clicks an item not in the queue, SetManualQueueChoice must still hold it.
ItemRack.SetManualQueueChoice(13,"888")
check(ItemRack.ManualQueueChoice[13] == "888" and ItemRack.ManualQueueChoiceOwner[13] == "Active",
  "manual hold on foreign item must store requested ID and owner")
check(ItemRack.IsManualQueueChoice(13,"888","888",nil,activeList,"Active"),
  "manual hold on foreign item must validate as held when equipped")

-- AutoQueueItemToEquip must honor the manual hold on the foreign item
ItemRack.GetID = function(s) return s == 13 and "888" or "0" end
ItemRack.FindItemInBags = function(id) return 0, 1 end
ItemRack.IsCandidateReady = function() return true end
ItemRack.GetObservedItemCooldown = function() return nil end
local foreignHoldCandidate = ItemRack.AutoQueueItemToEquip(13,"888",1,true,nil,contexts.Active)
check(foreignHoldCandidate == nil,
  "AutoQueueItemToEquip must not evict foreign item while manual hold is active")

-- When cleared (e.g. Left-Click normal swap), AutoQueue resumes
ItemRack.ClearManualQueueChoice(13)
check(ItemRack.IsManualQueueChoice(13,"888","888",nil,activeList,"Active") == false,
  "IsManualQueueChoice must return false once manual hold is cleared")
local resumedCandidate = ItemRack.AutoQueueItemToEquip(13,"888",1,true,nil,contexts.Active)
check(resumedCandidate == "100",
  "AutoQueueItemToEquip must resume selecting preferred candidate once manual hold is cleared")
ItemRack.GetID = function() return "999" end

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

-- Anti-taint and secret value regressions (modern clients Patch 11.0+ / 12.0)
local secretVal = { __secret = true }
issecretvalue = function(v) return v == secretVal end
C_UnitAuras = {
  GetPlayerAuraBySpellName = function(buff)
    if buff == "SecretBuff" then return secretVal end
    if buff == "SecretTable" then return { name = secretVal } end
    return nil
  end
}
check(ItemRack.FindPlayerAura("SecretBuff") == "SecretBuff", "FindPlayerAura must safely return buff name when C_UnitAuras returns an opaque secret value")
check(ItemRack.FindPlayerAura("SecretTable") == "SecretTable", "FindPlayerAura must safely return buff name when aura.name is a secret value")

-- Safe self-contained aura search across units
check(ItemRack.FindAuraByName("ActiveBuff", "player") == "ActiveBuff", "FindAuraByName must return player buff when unit is player")
UnitBuff = function(unit, idx)
  if unit == "target" and idx == 1 then return "TargetBuff" end
  return nil
end
check(ItemRack.FindAuraByName("TargetBuff", "target") == "TargetBuff", "FindAuraByName must locate aura on non-player unit safely")

-- Verify that existing global AuraUtil table is preserved and untainted
local existingBlizzardAuraUtil = { ForEachAura = function() return true end }
_G.AuraUtil = existingBlizzardAuraUtil
if not _G.AuraUtil then _G.AuraUtil = { FindAuraByName = ItemRack.FindAuraByName } end
check(_G.AuraUtil.FindAuraByName == nil, "Existing AuraUtil must never be mutated or assigned FindAuraByName")
check(_G.AuraUtil == existingBlizzardAuraUtil, "Existing AuraUtil reference must remain unmodified")

-- Clean up test mocks
issecretvalue = nil
C_UnitAuras = nil
UnitBuff = nil
_G.AuraUtil = AuraUtil

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

-- D. User-reported regression (user_dhivdljvzbi65oe8 CurseForge):
-- ToggleSet with explicit unqueued item (e.g. Diamond Flask 19993 in slot 13) must remain matched
-- and unequip on second click even when an auto-queue on slot 13 has a ready candidate!
${isSetEquipped}
${toggleSet}

ItemRackUser.CurrentSet = "Flask"
ItemRackUser.EnableQueues = "ON"
ItemRackUser.EnablePerSetQueues = "OFF"
ItemRackUser.Sets.Flask = {
  equip = { [13] = "19993" },
  old = { [13] = "11815" },
}
ItemRack.QueueStateReady = true
ItemRack.IsEquippedSlotStateReady = function() return true end
ItemRack.MatchesStoredItemID = function(a, b) return tostring(a) == tostring(b) end
ItemRack.GetQueueContext = function(slot, setname)
  return { list = { { id = "23206" } }, enabled = true }
end
ItemRack.GetID = function(slot)
  if slot == 13 then return "19993" end
  return 0
end
ItemRack.GetIRString = function(id, bare) return tostring(id) end
ItemRack.FindQueueEntryIndex = function(list, id)
  for idx, entry in ipairs(list) do
    if tostring(entry.id) == tostring(id) then return idx end
  end
  return nil
end
ItemRack.AutoQueueItemToEquip = function(slot, baseID, enable, ready, setname, queueContext)
  return 23206, "23206"
end
ItemRack.ShouldHoldEquippedItem = function() return false end
ItemRack.ItemNearReady = function() return false end

local flaskMatched = ItemRack.IsSetEquipped("Flask")
check(flaskMatched == true,
  "IsSetEquipped must remain true for explicit set item (Diamond Flask) even if queue has candidates ready")

local toggledUnequipTarget = nil
ItemRack.UnequipSet = function(name) toggledUnequipTarget = name end
ItemRack.EquipSet = function(name) error("ToggleSet must not re-equip already equipped set") end

ItemRack.ToggleSet("Flask")
check(toggledUnequipTarget == "Flask",
  "ToggleSet must call UnequipSet on second click when Flask set is equipped and old gear exists")

-- E. Manual Toggle Handler:
${isProtectedByManualToggle}
${isSetPendingInCombatQueue}
${cancelCombatQueueSet}
${purgeAutomaticSetsWaiting}

-- 1. Manual toggle hold protects explicitly equipped items from AutoQueue eviction
ItemRack.ManualToggledSet = "Flask"
check(ItemRack.IsSlotProtectedByManualToggle(13) == true,
  "IsSlotProtectedByManualToggle must be true for slot 13 when Flask set is manually toggled and worn")
check(ItemRack.IsSlotProtectedByManualToggle(14) == false,
  "IsSlotProtectedByManualToggle must be false for slot not defined in toggled set")

-- Calling AutoQueueItemToEquip on a slot protected by manual toggle must return nil (hold)
${autoQueue}
local autoCandidate = ItemRack.AutoQueueItemToEquip(13, "19993", 1, false, "Flask", { list = { { id = "23206" } } })
check(autoCandidate == nil,
  "AutoQueueItemToEquip must hold explicitly toggled set item even when queue has ready candidate")

-- Calling ToggleSet again when already equipped calls UnequipSet and clears ManualToggledSet
toggledUnequipTarget = nil
ItemRack.ToggleSet("Flask")
check(toggledUnequipTarget == "Flask" and ItemRack.ManualToggledSet == nil,
  "ToggleSet unequip must clear ManualToggledSet")
check(ItemRack.IsSlotProtectedByManualToggle(13) == false,
  "IsSlotProtectedByManualToggle must be false after toggling off")

-- 2. In-Combat Toggle Handler (CombatQueue Toggling / Canceling)
InCombatLockdown = function() return true end
ItemRack.CombatQueue = { [13] = "19993" }
ItemRack.CombatSet = "Flask"
ItemRack.RemoveFromCombatQueue = function(slot) ItemRack.CombatQueue[slot] = nil end
ItemRack.UpdateCombatQueue = function() end

check(ItemRack.IsSetPendingInCombatQueue("Flask") == true,
  "IsSetPendingInCombatQueue must be true when set items are pending in CombatQueue")

local cancelTriggered = false
local origCancel = ItemRack.CancelCombatQueueSet
ItemRack.CancelCombatQueueSet = function(name)
  cancelTriggered = true
  origCancel(name)
end

-- Second toggle click in combat must cancel the pending combat queue
ItemRack.ToggleSet("Flask")
check(cancelTriggered == true, "ToggleSet in combat must trigger CancelCombatQueueSet")
check(ItemRack.CombatQueue[13] == nil and ItemRack.CombatSet == nil,
  "CancelCombatQueueSet must clear pending combat queue slots and CombatSet")
check(ItemRack.IsSetPendingInCombatQueue("Flask") == false,
  "IsSetPendingInCombatQueue must be false after combat queue is cancelled")

-- 3. Purge automatic sets waiting
ItemRack.SetsWaiting = {
  { "AutoSet", function() end, nil, nil, true, nil },
  { "ManualSet", function() end, nil, nil, false, false },
  { "DeferredAuto", function() end, nil, nil, nil, true },
}
ItemRack.PurgeAutomaticSetsWaiting()
check(#ItemRack.SetsWaiting == 1 and ItemRack.SetsWaiting[1][1] == "ManualSet",
  "PurgeAutomaticSetsWaiting must remove automatic waiting sets and retain manual sets")

InCombatLockdown = function() return false end

-- 4. Hybrid Set Detection and Split Visual
ItemRack.GetTextureBySlot = function(slot) return "MockTexture" end
${setButton20Visual}
${updateCurrentSet}

local visualCalls = {}
local origVisual = ItemRack.SetButton20Visual
ItemRack.SetButton20Visual = function(activeOwner, hybridSet)
  checks = checks + 1
  table.insert(visualCalls, { activeOwner = activeOwner, hybridSet = hybridSet })
  origVisual(activeOwner, hybridSet)
end

ItemRackUser.Sets = {
  ["Trash Other"] = { icon = "Icon1", equip = { [1] = "1001", [13] = "HOJ" } },
  ["Trash Undead"] = { icon = "Icon2", equip = { [1] = "1001", [13] = "MOTC" } },
}

-- Scenario A: Player is wearing Trash Other
ItemRackUser.CurrentSet = "Trash Other"
ItemRack.IsSetEquipped = function(name) return name == "Trash Other" end
ItemRack.UpdateCurrentSet()

check(ItemRackUser.CurrentSet == "Trash Other", "Active set must remain Trash Other when equipped")
check(ItemRack.HybridSet == nil, "HybridSet must be nil when active set is fully equipped")

-- Scenario B: Player manually equips Mark of the Champion (gear now matches Trash Undead)
ItemRack.IsSetEquipped = function(name) return name == "Trash Undead" end
ItemRack.UpdateCurrentSet()

check(ItemRackUser.CurrentSet == "Trash Other", "Active CurrentSet must NOT be hijacked to Trash Undead during manual swap")
check(ItemRack.HybridSet == "Trash Undead", "HybridSet must record detected Trash Undead")
check(#visualCalls > 0 and visualCalls[#visualCalls].activeOwner == "Trash Other" and visualCalls[#visualCalls].hybridSet == "Trash Undead",
  "SetButton20Visual must receive activeOwner and hybridSet for split icon rendering")

-- Scenario C: Player switches back to Trash Other
ItemRack.IsSetEquipped = function(name) return name == "Trash Other" end
ItemRack.UpdateCurrentSet()

check(ItemRackUser.CurrentSet == "Trash Other", "CurrentSet remains Trash Other")
check(ItemRack.HybridSet == nil, "HybridSet must clear when returning to active set gear")

-- Scenario D: Startup recovery (CurrentSet is nil on launch)
ItemRackUser.CurrentSet = nil
ItemRack.IsSetEquipped = function(name) return name == "Trash Undead" end
ItemRack.UpdateCurrentSet()

check(ItemRackUser.CurrentSet == "Trash Undead", "Startup recovery must adopt detected set when CurrentSet is nil")
check(ItemRack.HybridSet == nil, "HybridSet must be nil on startup recovery")

-- 5. HoldSlot and ClearHoldSlot
${holdSlot}
${clearHoldSlot}

ItemRack.GetID = function(slot) return slot == 13 and "20130" or "0" end
ItemRack.HoldSlot(13)
check(ItemRack.ManualQueueChoice and ItemRack.ManualQueueChoice[13] == "20130",
  "HoldSlot must record equipped item as manual hold for slot")
check(ItemRack.ManualQueueHold and ItemRack.ManualQueueHold[13] == true,
  "HoldSlot must set ManualQueueHold for persistent hold")

ItemRack.HoldSlot(14, "item:23047")
check(ItemRack.ManualQueueChoice and ItemRack.ManualQueueChoice[14] == 23047,
  "HoldSlot with explicit item link/string must record item ID")
check(ItemRack.ManualQueueHold and ItemRack.ManualQueueHold[14] == true,
  "HoldSlot must set ManualQueueHold for slot 14")

ItemRack.ClearHoldSlot(13)
check(ItemRack.ManualQueueChoice[13] == nil,
  "ClearHoldSlot must clear the manual hold for slot 13")
check(ItemRack.ManualQueueHold[13] == nil,
  "ClearHoldSlot must clear ManualQueueHold for slot 13")
check(ItemRack.ManualQueueChoice[14] == 23047,
  "ClearHoldSlot for slot 13 must preserve slot 14 hold")
check(ItemRack.ManualQueueHold[14] == true,
  "ClearHoldSlot for slot 13 must preserve slot 14 ManualQueueHold")

-- 6. SetButton20Visual text alignment and external manual equip hold
local mockTexture = {
  ClearAllPoints = function() end,
  SetPoint = function() end,
  SetWidth = function() end,
  SetTexture = function() end,
  SetVertexColor = function() end,
  SetTexCoord = function() end,
  SetDrawLayer = function() end,
  Show = function() end,
  Hide = function() end,
}
ItemRackButton20 = {
  GetWidth = function() return 36 end,
  CreateTexture = function() return mockTexture end,
}
ItemRackButton20ItemRackIcon = mockTexture
local button20Name = {
  points = {},
  ClearAllPoints = function(self) self.points = {} end,
  SetPoint = function(self, point, rel, relPoint, x, y) table.insert(self.points, {point=point, rel=rel, relPoint=relPoint, x=x, y=y}) end,
  SetWidth = function(self, w) self.width = w end,
  SetJustifyH = function(self, j) self.justify = j end,
  SetDrawLayer = function(self, l, sub) self.layer = l; self.sublayer = sub end,
}
_G["ItemRackButton20Name"] = button20Name
ItemRack.SetButton20Visual("Trash Other", "Trash Undead")
check(button20Name.points[1] and button20Name.points[1].point == "BOTTOM" and button20Name.points[1].y == 2,
  "SetButton20Visual must anchor ItemRackButton20Name to BOTTOM, 0, 2")
check(button20Name.justify == "CENTER",
  "SetButton20Visual must keep ItemRackButton20Name center-justified")
check(button20Name.width == 36,
  "SetButton20Visual must constrain ItemRackButton20Name width to button")

print(string.format("[QUEUE RUNTIME LUA] %d purity and provenance checks passed.",checks))
`, 'queue-runtime');

// #32: run the production caller as well as its guarded helper. A nil result
// (absent aura or failed API) must not invoke the unsafe global a second time.
runLua(String.raw`
local calls=0
ItemRack={QueueStateReady=true,
 IsEquippedSlotStateReady=function() return true end,
 GetID=function() return '123' end,
 IsQueueItemBurnt=function() return false end,
 IsManualQueueChoice=function() return false end,
 FindQueueEntryIndex=function() return 1 end,
 GetProxyBuff=function() return 'TestAura' end,
 IsQueueEntryUnambiguous=function() return true end}
ItemRackSettings={}
AuraUtil={FindAuraByName=function() calls=calls+1; error('AuraUtil.lua:25: attempt to call a nil value') end}
${findPlayerAura}
${findAuraByName}
${autoQueue}
local context={owner='A',list={{id='123'}}}
assert(ItemRack.AutoQueueItemToEquip(13,'123',1,true,nil,context)==nil,
 'issue-32-aura-caller-containment: failed aura lookup must not escape the queue caller')
assert(calls==1,'the failing global lookup must not be called again after the safe helper returns nil')
-- Legacy shim points back to ItemRack; do not recursively query our own shim.
AuraUtil={FindAuraByName=ItemRack.FindAuraByName}
local scans=0
UnitBuff=function() scans=scans+1; return nil end
assert(ItemRack.FindPlayerAura('MissingAura')==nil and scans==1,'legacy shim must perform one bounded scan')
UnitBuff=function(_,i) return i==1 and 'TestAura' or nil end
assert(ItemRack.FindPlayerAura('TestAura')=='TestAura','legacy aura presence must remain supported')
print('[AURA CALLER LUA] Guarded caller failures and nonrecursive legacy lookup passed.')
`, 'issue-32-aura-caller-containment');

// #33 / neferens: genuine use must end temporary protection independently of
// the item's Swap In threshold. Exercise real use hooks, retry, cooldown
// authority and queue processing; only client APIs/equipment endpoints are modeled.
runLua(String.raw`
local now,combat,buff,timers,equipment,cooldowns,requests,events
ItemRack={}
ItemRackSettings={}
function GetTime() return now end
function InCombatLockdown() return combat end
function UnitAffectingCombat() return combat end
function CursorHasItem() return false end
function IsInventoryItemLocked() return false end
function GetInventoryItemCooldown(_,slot)
 local cd=cooldowns[slot] or {0,0,1}; return cd[1],cd[2],cd[3]
end
function GetItemCooldown(id)
 if tonumber(id)==100 then return GetInventoryItemCooldown('player',13) end
 if tonumber(id)==300 then return GetInventoryItemCooldown('player',14) end
 return 0,0,1
end
function GetItemSpell(id) if tonumber(id)==100 then return 'ReportedBuff' end end
C_Timer={After=function(delay,callback) timers[#timers+1]={at=now+delay,callback=callback} end}
local function advance(target)
 while true do
  local earliest
  for i,timer in ipairs(timers) do
   if timer.at<=target and (not earliest or timer.at<timers[earliest].at) then earliest=i end
  end
  if not earliest then break end
  local timer=table.remove(timers,earliest); now=timer.at; timer.callback()
 end
 now=target
end
ItemRack.GetID=function(slot) return equipment[slot] or 0 end
ItemRack.GetEquippedSlotState=function(slot)
 return equipment[slot] and 'resolved' or 'empty',equipment[slot]
end
ItemRack.GetIRString=function(id) return tostring(id):match('^(%d+)') end
ItemRack.IsEquippedSlotStateReady=function() return true end
ItemRack.MatchesStoredItemFields=function(a,b) return a==b end
ItemRack.MatchesStoredItemID=ItemRack.MatchesStoredItemFields
ItemRack.SameExactID=ItemRack.MatchesStoredItemFields
ItemRack.IsBareItemID=function() return false end
ItemRack.IsQueueEntryUnambiguous=function() return true end
ItemRack.IsQueueItemBurnt=function() return false end
ItemRack.GetProxyBuff=function() return nil end
ItemRack.GetProxyCooldownLeft=function() return nil end
ItemRack.ResolveProxy=function() return nil end
ItemRack.GetDefaultSwapIn=function() return 30 end
ItemRack.FindPlayerAura=function() return buff end
ItemRack.FindItemInBags=function(id) if id=='200' then return 0,1 end end
ItemRack.IsOffhandBlocked=function() return false end
ItemRack.IsPlayerReallyDead=function() return false end
ItemRack.GetInfoByID=function(id) return id end
ItemRack.Debug=function() end
ItemRack.UpdateCombatQueue=function() end
ItemRack.QueueDiagnostic=function(event) events[event]=(events[event] or 0)+1 end
ItemRack.ClearEquipTimer=function(slot) ItemRack.EquipTimers[slot]=nil end
${require('fs').readFileSync('ItemRack/ItemRackCooldownState.lua','utf8')}
${require('fs').readFileSync('ItemRack/ItemRackQueuePolicy.lua','utf8')}
${['ItemRack.GetQueueContext','QueueFieldProxy','ItemRack.GetQueues','ItemRack.GetQueuesEnabled',
 'ItemRack.GetActiveQueueOwner','ItemRack.ScheduleReflectItemUseRetry','ItemRack.ReflectItemUse',
 'ItemRack.newUseInventoryItem','ItemRack.ClearCombatQueueMetadata','ItemRack.AddToCombatQueue',
 'ItemRack.RemoveFromCombatQueue','ItemRack.ProcessCombatQueue'].map(n=>extractFunction(itemRackFile,n)).join('\n')}
${clearManual}
${findQueueEntry}
${isManual}
${setManual}
${isRecentEquip}
${extractFunction(queueFile,'ItemRack.MarkEquippedItemUsed')}
${extractFunction(queueFile,'ItemRack.GetItemCooldownLeft')}
${extractFunction(queueFile,'ItemRack.IsCandidateReady')}
${shouldHold}
${autoQueue}
${extractFunction(queueFile,'ItemRack.ProcessAutoQueue')}
ItemRack.EquipItemByID=function(id,slot,isAutoQueue)
 requests[#requests+1]=id
 if combat then ItemRack.AddToCombatQueue(slot,id,isAutoQueue) else equipment[slot]=id end
end
ItemRack.EquipSet=function(name)
 assert(not combat,'ordinary gear must not equip in combat')
 for slot,id in pairs(ItemRackUser.Sets[name].equip) do equipment[slot]=id end
end
local function reset(mode,inCombat,threshold)
 now,combat,buff,timers,requests,events=100,inCombat,false,{},{},{}
 equipment={[13]='100',[14]='300'}; cooldowns={[13]={0,0,1}}
 local list={{id='200',priority=true},{id='100',swapInEnabled=true,swapIn=threshold}}
 ItemRackUser={EnableQueues='ON',EnablePerSetQueues=mode=='global' and 'OFF' or 'ON',
  CurrentSet='Active',Buttons={},ItemsUsed={},EquipTimers={[13]={id='100',time=70,hasPenalty=true,used=false}},
  Queues={[13]=list},QueuesEnabled={[13]=true},Sets={
   Active={equip={},Queues={[13]=list},QueuesEnabled={[13]=true}},
   Master={equip={},Queues={[13]=list},QueuesEnabled={[13]=true}},['~CombatQueue']={equip={}}}}
 if mode=='mirrored' then
  ItemRackUser.Sets.Active.QueueSync={[13]='Master'}
  ItemRackUser.Sets.Active.QueueSyncInitialized={[13]=true}
  ItemRackUser.Sets.Active.Queues=nil
 end
 ItemRack.EquipTimers=ItemRackUser.EquipTimers
 ItemRack.QueueStateReady=true; ItemRack.QueueStateGeneration=1
 ItemRack.CooldownObservations=nil; ItemRack.PendingReflectItemUse=nil
 ItemRack.LastProcessedItemUse=nil; ItemRack.LastActivation=nil
 ItemRack.ManualQueueChoice={}; ItemRack.ManualQueueChoiceOwner={}; ItemRack.ManualQueueHold={}
 ItemRack.CombatQueue={}; ItemRack.AutoQueueFlag={}; ItemRack.AutoQueueOwner={}; ItemRack.AutoQueueList={}
 ItemRack.RunAfterCombat={}; ItemRack.ItemsUsedCooldownGeneration={}
 ItemRack.SetManualQueueChoice(13,'100')
 return list
end
local checks=0
local function check(value,message) assert(value,message); checks=checks+1 end
local function use()
 cooldowns[13]={100,120,1}; buff=true
 ItemRack.newUseInventoryItem(13); advance(100.06)
end
for _,mode in ipairs({'global','per-set','mirrored'}) do
 for _,inCombat in ipairs({false,true}) do
  for _,threshold in ipairs({120,119,100,99,115}) do
   local list=reset(mode,inCombat,threshold)
   ItemRack.ProcessAutoQueue(13)
   check(#requests==0 and equipment[13]=='100','unused manual choice must remain protected against Priority')
   use()
   check(events.use_accepted==1 and ItemRack.EquipTimers[13].used,
    'fixture must pass real verified-use detection before testing hold release')
   ItemRack.ProcessAutoQueue(13)
   check(#requests==0 and equipment[13]=='100','active buff must still protect the used item')
   advance(120); buff=false; ItemRack.ProcessAutoQueue(13)
   if inCombat then
    check(equipment[13]=='100' and ItemRack.CombatQueue[13]=='200','combat must queue the prioritized replacement')
    combat=false; ItemRack.ProcessCombatQueue()
   end
   check(equipment[13]=='200' and #requests==1,
    'issue-33-swap-in-temporary-hold: verified use plus expired buff must yield to Priority regardless of Swap In')
   check(not ItemRack.ManualQueueChoice[13] and not ItemRack.ManualQueueChoiceOwner[13],
    'verified use must retire temporary choice identity and owner')
   check(list[2].swapIn==threshold and not next(ItemRack.CombatQueue) and ItemRackUser.CurrentSet=='Active',
    'retain saved policy/context and finish without pending gear requests')
  end
 end
end
-- Premature buff removal on each side of the reporter's 115-second boundary.
for _,elapsed in ipairs({4,5,6}) do
 reset('global',false,115); use(); advance(100+elapsed); buff=false
 ItemRack.ProcessAutoQueue(13)
 check(equipment[13]=='200','early buff removal must release on either side of the Swap In boundary')
end
reset('global',false,120); use(); advance(120); buff=false
check(not ItemRack.IsCandidateReady(13,'100',99) and ItemRack.IsCandidateReady(13,'100',100),
 'Swap In must still gate candidate eligibility at its inclusive remaining-cooldown boundary')
-- A duplicate hook cannot release a fresh choice created after the accepted use.
reset('global',false,120); use(); ItemRack.SetManualQueueChoice(13,'100')
ItemRack.newUseInventoryItem(13); advance(100.12)
check(events.use_accepted==1 and events.use_ignored_duplicate==1 and ItemRack.ManualQueueChoice[13]=='100',
 'duplicate use evidence must not release a newer manual choice')
-- Identity changes while the settled trinket sample is pending cancel that receipt.
reset('global',false,120); cooldowns[13]={100,120,1}; ItemRack.newUseInventoryItem(13)
equipment[13]='999'; ItemRack.SetManualQueueChoice(13,'999'); advance(100.8)
check(not events.use_accepted and ItemRack.ManualQueueChoice[13]=='999',
 'a delayed receipt must not release the replacement item manual choice')
-- The explicit persistent hold remains distinct, including after accepted use.
reset('per-set',false,120); ItemRack.ManualQueueHold[13]=true; use(); advance(120); buff=false
ItemRack.ProcessAutoQueue(13)
check(events.use_accepted==1 and equipment[13]=='100' and #requests==0 and ItemRack.ManualQueueHold[13]
 and ItemRack.ManualQueueChoice[13]=='100','verified use must retain explicit persistent holds')
for _,policy in ipairs({'keep','delay'}) do
 local list=reset('global',false,120)
 if policy=='keep' then list[2].keep=true else list[2].delay=25 end
 use(); advance(120); buff=false; ItemRack.ProcessAutoQueue(13)
 check(equipment[13]=='100' and #requests==0 and not ItemRack.ManualQueueChoice[13],
  'use must release temporary protection while retaining '..policy..' policy')
 if policy=='keep' then list[2].keep=false else advance(126) end
 ItemRack.ProcessAutoQueue(13)
 check(equipment[13]=='200','rotation must resume after '..policy..' restriction ends')
end
-- Rejected signals must never clear the temporary choice.
for _,kind in ipairs({'equip-penalty','no-cooldown','stale-cooldown','shared-follower'}) do
 reset('global',false,120)
 if kind=='equip-penalty' then
  ItemRack.EquipTimers[13].time=100; cooldowns[13]={100,30,1}
 elseif kind=='stale-cooldown' then cooldowns[13]={90,120,1}
 elseif kind=='shared-follower' then
  cooldowns[13]={100,20,1}; cooldowns[14]={100,120,1}
  ItemRack.LastActivation={time=100,primarySlot=14,primaryExactID='300',primaryStart=100,primaryDuration=120,
   followerSlot=13,followerExactID='100',followerStart=100,followerDuration=20}
 end
 ItemRack.newUseInventoryItem(13); advance(100.8)
 check(not events.use_accepted and ItemRack.ManualQueueChoice[13]=='100' and not ItemRack.EquipTimers[13].used,
  'rejected '..kind..' must preserve temporary protection')
end
-- A newer choice or another set's hold is not the activation being accepted.
for _,kind in ipairs({'different-item','different-owner'}) do
 reset('per-set',false,120)
 if kind=='different-item' then ItemRack.ManualQueueChoice[13]='999'
 else ItemRack.ManualQueueChoiceOwner[13]='Other' end
 use()
 check(events.use_accepted==1 and ItemRack.ManualQueueChoice[13]~=nil,
  'accepted use must not erase a '..kind..' manual choice')
end
print(string.format('[SWAP IN HOLD LUA] %d verified-use, threshold, buff, scope and deferred-gear checks passed.',checks))

-- #33 Dragonling follow-up: API cooldown stays zero during the summon. Feed
-- the real item hook and UNIT_SPELLCAST_SUCCEEDED dispatch, not a guessed CD.
local function specialCatalog(toc)
 function GetBuildInfo() return 'fixture','70938','fixture',toc end
 ItemRack.IsEngravingActive=function() return false end
 ${loadSpecialCatalog}
end
${extractFunction(itemRackFile,'ItemRack.OnCastingStop')}
${resolveProxy}
local nativeSpecialCooldown
local specialItemID=16022
local epochBase=1800000000
function GetServerTime() return epochBase+now end
function GetItemCooldown(id)
 if tonumber(id)==specialItemID then return nativeSpecialCooldown[1],nativeSpecialCooldown[2],nativeSpecialCooldown[3] end
 return 0,0,1
end
function GetItemSpell(id) if tonumber(ItemRack.GetIRString(id))==specialItemID then return 'Special item',23074 end end
local function resetSpecial(toc,inCombat,mode)
 specialItemID=16022
 specialCatalog(toc)
 reset(mode or 'global',inCombat,30)
 equipment[13]='16022:1'; nativeSpecialCooldown={0,0,1}
 ItemRack.GetQueues(mode=='per-set' and 'Active' or nil)[13]={{id='200',priority=true},{id='16022:1'}}
 -- A mirrored list is owned by Master, but its activation token belongs to Active.
 if mode=='mirrored' then ItemRackUser.Sets.Master.Queues[13]={{id='200',priority=true},{id='16022:1'}} end
 ItemRack.EquipTimers[13]={id='16022:1',time=70,hasPenalty=true,used=false}
 ItemRack.SetManualQueueChoice(13,'16022:1')
 ItemRack.NowCasting=nil
 buff=false
end
local function success(spellID,cast)
 ItemRack.OnCastingStop(nil,'UNIT_SPELLCAST_SUCCEEDED','player',cast or 'Cast-Dragonling',spellID or 19804)
end
local specialChecks=0
local function verify(value,message) assert(value,message);specialChecks=specialChecks+1 end
for _,toc in ipairs({11508,11509,16001,11601}) do
 for _,mode in ipairs({'global','per-set','mirrored'}) do
  for _,inCombat in ipairs({false,true}) do
   resetSpecial(toc,inCombat,mode)
   ItemRack.newUseInventoryItem(13)
   success()
   verify(ItemRack.SpecialItems.IsCooldownPending('16022:1') and not ItemRack.ManualQueueChoice[13]
    and ItemRack.EquipTimers[13].used,
    'issue-33-dragonling-delayed-cooldown: confirmed summon must release temporary protection with native cooldown still zero')
   ItemRack.ProcessAutoQueue(13)
   if inCombat then
    verify(equipment[13]=='16022:1' and ItemRack.CombatQueue[13]=='200','special use must retain combat deferral')
    combat=false; ItemRack.ProcessCombatQueue()
   end
   verify(equipment[13]=='200' and not next(ItemRack.CombatQueue),'special use must finish with the preferred gear and no pending request')
   verify(not ItemRack.IsCandidateReady(13,'16022:1',5000),'zero native cooldown must not make a used pending item eligible again')
   verify(not ItemRackUser.ItemsUsed[16022],'pending use must not generate a false ready notification')
   advance(101); nativeSpecialCooldown={101,60,1}
   ItemRack.GetItemCooldownLeft('16022:1')
   verify(ItemRack.SpecialItems.IsCooldownPending('16022:1'),'short shared cooldown must not be mistaken for the real item cooldown')
   advance(160); nativeSpecialCooldown={160,3600,1}; ItemRack.GetItemCooldownLeft('16022:1')
   verify(not ItemRack.SpecialItems.IsCooldownPending('16022:1') and not ItemRack.IsCandidateReady(13,'16022:1',30),
    'late native cooldown must reconcile and retain normal candidate thresholds')
   verify(ItemRackUser.ItemsUsed[16022]==1,'the real native cooldown must start normal notification tracking')
   advance(3761); nativeSpecialCooldown={0,0,1}
   verify(ItemRack.IsCandidateReady(13,'16022:1',30) and not ItemRack.SpecialItems.Used[16022],
    'native cooldown completion must restore eligibility and clean the receipt')
   verify(ItemRackUser.CurrentSet=='Active' and ItemRack.GetQueues()[13][2].id=='16022:1',
    'item rules must not change selected set or saved queue contents')
  end
 end
end
resetSpecial(16001,false); success(); advance(100.05); ItemRack.newUseInventoryItem(13)
verify(not ItemRack.SpecialItems.IsCooldownPending('16022:1') and ItemRack.ManualQueueChoice[13],
 'standalone success must not be reused by a later item hook')
success(19804,'Cast-New')
verify(ItemRack.SpecialItems.IsCooldownPending('16022:1'),'a fresh success after the compatible hook must be accepted')
for _,kind in ipairs({'attempt-only','wrong-spell','recipe','failure','interrupted','changed-item','changed-owner','generation','new-choice','late','ambiguous'}) do
 resetSpecial(16001,false,'per-set'); ItemRack.newUseInventoryItem(13)
 if kind=='wrong-spell' then success(23074)
 elseif kind=='recipe' then success(19830)
 elseif kind=='failure' or kind=='interrupted' then
  ItemRack.OnCastingStop(nil,kind=='failure' and 'UNIT_SPELLCAST_FAILED' or 'UNIT_SPELLCAST_INTERRUPTED','player','Cast-X',19804)
 elseif kind=='changed-item' then equipment[13]='16022:2'; success()
 elseif kind=='changed-owner' then ItemRackUser.CurrentSet='Master'; success()
 elseif kind=='generation' then ItemRack.QueueStateGeneration=2; success()
 elseif kind=='new-choice' then ItemRack.SetManualQueueChoice(13,'16022:1'); success()
 elseif kind=='late' then advance(101); success()
 elseif kind=='ambiguous' then
  equipment[14]='16022:1'; ItemRack.SpecialItems.BeginUse(14); success()
 end
 advance(101.1)
 verify(not ItemRack.SpecialItems.IsCooldownPending('16022:1') and ItemRack.ManualQueueChoice[13]=='16022:1',
  'unverified '..kind..' must not release a manual choice')
end
resetSpecial(16001,false); ItemRack.ManualQueueHold[13]=true; ItemRack.newUseInventoryItem(13); success()
ItemRack.ProcessAutoQueue(13)
verify(equipment[13]=='16022:1' and ItemRack.ManualQueueHold[13] and ItemRack.ManualQueueChoice[13],
 'confirmed special use must preserve explicit persistent holds')
for _,restriction in ipairs({'buff','keep','delay'}) do
 resetSpecial(16001,false)
 local entry=ItemRack.GetQueues()[13][2]
 if restriction=='keep' then entry.keep=true
 elseif restriction=='delay' then entry.delay=25; cooldowns[13]={100,60,1}
 else buff=true end
 ItemRack.newUseInventoryItem(13); success(); ItemRack.ProcessAutoQueue(13)
 verify(equipment[13]=='16022:1' and not ItemRack.ManualQueueChoice[13],
  'special verified use must release temporary choice while respecting '..restriction)
 entry.keep=nil; entry.delay=nil; buff=false
 ItemRack.ProcessAutoQueue(13)
 verify(equipment[13]=='200','special rotation must resume after '..restriction..' is removed')
end
resetSpecial(16001,false); ItemRack.newUseInventoryItem(13); success()
ItemRack.SetManualQueueChoice(13,'16022:1'); success()
verify(ItemRack.ManualQueueChoice[13]=='16022:1','duplicate activation must not clear a later manual choice')
advance(191)
verify(ItemRack.SpecialItems.IsCooldownPending('16022:1') and ItemRack.SpecialItems.Used[16022].phase=='pending',
 'readiness queries must not mutate the pending review phase')
ItemRack.SpecialItems.Poll()
verify(ItemRack.SpecialItems.IsCooldownPending('16022:1') and ItemRack.SpecialItems.Used[16022].phase=='unresolved',
 'a missing cooldown must become diagnostic uncertainty rather than fabricated readiness')
for _,toc in ipairs({20505,20506}) do
 resetSpecial(toc,false); ItemRack.newUseInventoryItem(13); success()
 verify(not ItemRack.SpecialItems.IsCooldownPending('16022:1') and ItemRack.ManualQueueChoice[13],
  'TBC must not inherit the Era/Forever deferred exception')
 verify(ItemRack.ResolveProxy(30720).id==22044 and ItemRack.ResolveProxy(30720).buff==37445,
  'the TBC dependency rule must preserve mana-gem gating and localized buff semantics')
end
resetSpecial(16001,false)
verify(not ItemRack.ResolveProxy(30720),'the TBC built-in proxy must not load on Forever')
ItemRack.CooldownProxies={[30720]={id=9999,buff='Custom'}}
verify(ItemRack.ResolveProxy(30720).id==9999,'explicit compatibility proxy overrides must retain precedence')
ItemRack.CooldownProxies={}
-- The same engine supports a data-only rule in another equipment slot.
local s=ItemRack.SpecialItems
s.Rules[999]={enabled=true,name='Synthetic off-hand',slots={[17]=true},
 activation={successSpells={[123456]=true},windowSeconds=0.75},cooldown={start='deferred',minimumOwnSeconds=120}}
s.BuildIndex(); equipment[17]='999'; s.BeginUse(17)
s.OnSpellEvent('UNIT_SPELLCAST_SUCCEEDED','player','Cast-Offhand',123456)
verify(s.IsCooldownPending('999') and not s.GetRule('999',13),'new slot/item assignments must not require queue-engine changes')
-- Data-defined effect holds query the exact channel/aura, never any unrelated pet.
s.Rules[999].effect={kind='channel',spells={[123456]=true},hold=true}
UnitChannelInfo=function() return 'Channel',nil,nil,nil,nil,nil,nil,123456 end
verify(s.ShouldHoldEffect(17,'999'),'channel mechanics must match the configured spell')
UnitChannelInfo=function() return 'Other',nil,nil,nil,nil,nil,nil,777 end
verify(not s.ShouldHoldEffect(17,'999'),'an unrelated channel must not match the item rule')
s.Rules[999].effect={kind='aura',unit='pet',spells={[123456]=true},hold=true}
GetSpellInfo=function(id) return id==123456 and 'Specific aura' end
ItemRack.FindAuraByName=function(name,unit) return name=='Specific aura' and unit=='pet' end
verify(s.ShouldHoldEffect(17,'999'),'aura mechanics must use the configured unit and spell')
s.Rules[999].enabled=false
verify(not s.ShouldHoldEffect(17,'999') and not s.GetRule('999'),'disabling a table row must disable the handler')
local report=s.GetDiagnostics()
verify(not report.intents[13] and #report.history<=24 and report.catalog[999].enabled==false,
 'diagnostics must stay bounded and reflect rule enablement without serializing queue tables')
s.Rules[998]={name='Malformed rule',enabled=true,slots={[17]=true},cooldown={start='deferred'}}
s.Rules[997]='Malformed record'
s.BuildIndex()
verify(not s.GetRule(998) and s.GetDiagnostics().invalidRules[998] and not s.GetRule(997),
 'incomplete enabled rules must fail closed with diagnostics rather than break queue processing')
for _,bad in ipairs({
 {cooldown=true}, {activation=true}, {effect=true}, {proxy=true},
 {activation={successSpells=true}}, {activation={itemSpell='19804'}},
 {cooldown={start='deferred',minimumOwnSeconds='120'},activation={successSpells={[19804]=true}}},
 {cooldown={start='deferred',minimumOwnSeconds=120,reviewAfterSeconds='90'},activation={successSpells={[19804]=true}}},
 {activation={windowSeconds='0.75'}}, {activation={windowSeconds=math.huge}},
 {effect={kind='aura',hold=true,unit='target',spells={[123456]=true}}},
 {effect={kind='channel',hold=true,spells=true}}, {proxy={id=22044,buff=true}},
}) do
 bad.name='Malformed nested rule'; bad.enabled=true; bad.slots={[17]=true}; s.Rules[996]=bad
 s.BuildIndex()
 verify(not s.GetRule(996) and s.GetDiagnostics().invalidRules[996],
  'malformed nested item data must be rejected without crashing the selected catalog')
end
-- Native CD sampling cannot depend on whether candidate selection reaches the item.
resetSpecial(16001,false); ItemRack.newUseInventoryItem(13); success(); ItemRack.ProcessAutoQueue(13)
advance(160); nativeSpecialCooldown={160,3600,1}
ItemRack.SpecialItems.Poll()
verify(not ItemRack.SpecialItems.IsCooldownPending('16022:1') and equipment[13]=='200',
 'closed-menu sampling must reconcile the bagged item while the equipped Priority item remains ready')
advance(3761); nativeSpecialCooldown={0,0,1}; ItemRack.SpecialItems.Poll()
verify(not ItemRack.SpecialItems.Used[16022],'background sampling must retire an expired real cooldown')
-- The collective delayed-use list must execute the same production hook,
-- queue selection and combat drain for every enabled Era Dragonling.
for _,toc in ipairs({11508,11509}) do
 for _,item in ipairs({4396,10576,16022}) do
  for _,mode in ipairs({'global','per-set','mirrored'}) do
   for _,inCombat in ipairs({false,true}) do
    resetSpecial(toc,inCombat,mode); specialItemID=item
    local exact=tostring(item)..':1'
    equipment[13]=exact; ItemRack.GetQueues()[13][2].id=exact
    ItemRack.EquipTimers[13].id=exact; ItemRack.SetManualQueueChoice(13,exact)
    local rule=ItemRack.SpecialItems.GetRule(item,13)
    local spell=next(rule.activation.successSpells)
    ItemRack.newUseInventoryItem(13); success(spell,'Cast-'..item)
    verify(ItemRack.SpecialItems.IsCooldownPending(exact) and not ItemRack.ManualQueueChoice[13],
     'collective-dragonling-use: every enabled entry must release only its confirmed temporary choice')
    ItemRack.ProcessAutoQueue(13)
    if inCombat then
     verify(equipment[13]==exact and ItemRack.CombatQueue[13]=='200','collective delayed items must retain combat deferral')
     combat=false; ItemRack.ProcessCombatQueue()
    end
    verify(equipment[13]=='200' and not ItemRack.IsCandidateReady(13,exact,5000),
     'collective delayed entries must finish with the replacement and prevent zero-CD reselection')
    advance(160); nativeSpecialCooldown={160,rule.cooldown.seconds,1}; ItemRack.GetItemCooldownLeft(exact)
    verify(not ItemRack.SpecialItems.IsCooldownPending(exact),'all deferred entries must reconcile their own native publication')
   end
  end
 end
end
-- Real catalog channel guards protect both automatic selection entry points.
for _,case in ipairs({{11509,10645,13278},{11509,10727,13183},{11509,11808,17447},
 {11509,213347,435167},{11509,227973,462858},{20506,34430,45052},{16001,10645,13278}}) do
 resetSpecial(case[1],false); specialItemID=case[2]
 if case[2]>200000 then ItemRack.IsEngravingActive=function() return true end; ItemRack.SpecialItems.RefreshCatalog() end
 local exact=tostring(case[2])..':1'; equipment[13]=exact
 local slot=(case[2]==11808 or case[2]==227973) and 1 or 13
 -- Process this policy in its actual equipment slot (head or trinket).
 equipment[13]=nil; equipment[slot]=exact
 ItemRack.GetQueues()[slot]={{id='200',priority=true},{id=exact}}
 ItemRackUser.QueuesEnabled[slot]=true
 cooldowns[slot]={100,300,1}; nativeSpecialCooldown={100,300,1}
 UnitChannelInfo=function() return 'Channel',nil,nil,nil,nil,nil,nil,case[3] end
 local before=#requests; ItemRack.ProcessAutoQueue(slot)
 verify(equipment[slot]==exact and #requests==before,'actual channel entry must hold its current item')
 local context=ItemRack.GetQueueContext(slot)
 verify(not ItemRack.AutoQueueItemToEquip(slot,tostring(case[2]),1,false,nil,context),
  'set recognition must share the same channel guard')
 UnitChannelInfo=function() return nil end
 ItemRack.ProcessAutoQueue(slot)
 verify(equipment[slot]=='200','channel end must allow the normal replacement')
end
print(string.format('[SPECIAL ITEM RUNTIME LUA] %d delayed-use, slot, context, native cooldown and user-policy checks passed.',specialChecks))
`, 'issue-33-swap-in-temporary-hold');

// Offline only: each sandbox loads the actual addon modules/functions into
// independent globals. None of this harness is packaged in the addon ZIP.
const specialRecoverySource = [
  require('fs').readFileSync('ItemRack/ItemRackCooldownState.lua', 'utf8'),
  ...['ItemRack.GetItemCooldownLeft', 'ItemRack.IsCandidateReady', 'ItemRack.ClearManualQueueChoice',
    'ItemRack.MarkEquippedItemUsed'].map(n => extractFunction(queueFile, n)),
  extractFunction(itemRackFile, 'ItemRack.TryInitializeQueueState'),
  ...specialFiles.map(file => `;(function()\n${require('fs').readFileSync(file,'utf8')}\nend)();`),
].join('\n');
runLua(String.raw`
local checks=0
local function check(value,message) assert(value,message); checks=checks+1 end
local function serialize(value)
 if type(value)=='table' then
  local parts={}
  for key,v in pairs(value) do parts[#parts+1]='['..serialize(key)..']='..serialize(v) end
  return '{'..table.concat(parts,',')..'}'
 elseif type(value)=='string' then return string.format('%q',value)
 elseif type(value)=='number' or type(value)=='boolean' then return tostring(value)
 elseif value==nil then return 'nil' end
 error('non-SavedVariables value in production receipt: '..type(value))
end
local function transport(value) return assert(load('return '..serialize(value)))() end
local function fresh(saved,toc,uptime,epoch,scope)
 local world={time=uptime or 100,epoch=epoch or 1800000100,sample={0,0,1},equipment={[13]='16022:1'},notifications=0,seasonal=false,chat=0}
 local env=setmetatable({}, {__index=_G}); env._G=env
 env.GetTime=function() return world.time end
 env.GetServerTime=function() return world.epoch end
 env.GetBuildInfo=function() return 'fixture','70938','fixture',toc or 16001 end
 env.GetItemCooldown=function() return table.unpack(world.sample) end
 env.C_Timer={After=function() end}
 env.ItemRackUser={SpecialItemUsage=saved,EquipTimers={},ItemsUsed={},Sets={Active={Queues={}}}}
 env.ItemRack={QueueStateReady=false,QueueStateGeneration=1,PendingEquipTransitionTimes={},ManualQueueChoice={[13]='16022:1'},
  ManualQueueChoiceOwner={[13]=scope or 'Active'},ManualQueueHold={},
  GetEquippedSlotState=function(slot) return world.equipment[slot] and 'resolved' or 'empty',world.equipment[slot] end,
  GetID=function(slot) return world.equipment[slot] end,
  GetQueueContext=function() return {owner=scope or 'Active',list=env.ItemRackUser.Sets.Active.Queues} end,
  SameExactID=function(a,b) return a==b end,
  IsManualQueueChoice=function(slot,id) return env.ItemRack.ManualQueueChoice[slot]==id end,
  GetQueuesEnabled=function() return {} end,
  GetDefaultSwapIn=function() return 30 end,
  IsEngravingActive=function() return world.seasonal end,
  Print=function() world.chat=world.chat+1 end,
  Debug=function() end,QueueDiagnostic=function() end,
  NotifyQueueStateReady=function()
   world.notifications=world.notifications+1
   if world.expectReceipt then assert(env.ItemRack.SpecialItems.IsCooldownPending(16022),'restore must precede queue-ready notification') end
  end}
 assert(load([====[${specialRecoverySource}]====], 'production-special-recovery','t',env))()
 return env,world,env.ItemRack.SpecialItems
end
local function initialize(env,world,special)
 special.LoadSaved()
 assert(not next(special.Used),'loading transport must not prematurely activate automation')
 assert(env.ItemRack.TryInitializeQueueState(false,true))
end
local function use(env,special,cast)
 special.BeginUse(13)
 special.OnSpellEvent('UNIT_SPELLCAST_SUCCEEDED','player',cast or 'Cast-1',19804)
end
for _,toc in ipairs({11508,11509,16001,11601}) do
 for _,scope in ipairs({'Global','Active','Mirror'}) do
  local env,w,s=fresh(nil,toc,100,1800000100,scope)
  initialize(env,w,s); use(env,s)
  local store=transport(env.ItemRackUser.SpecialItemUsage)
  check(store.records[16022].confirmedAt==w.epoch and store.records[16022].phase=='pending',
   'special-use-reload-before-native-cooldown: confirmation must persist before native cooldown')
  check(not store.records[16022].list and not store.records[16022].owner and not store.records[16022].time,
   'receipt transport must not persist queue references or uptime')
  local re,rw,rs=fresh(store,toc,7,1800000110,scope)
  rw.expectReceipt=true; re.ItemRack.ManualQueueHold[13]=true
  initialize(re,rw,rs)
  check(rs.Used[16022].restored and rs.IsCooldownPending(16022) and not re.ItemRack.IsCandidateReady(13,16022,5000),
   'special-use-reload-before-native-cooldown: a fresh Lua environment must retain exclusion despite zero API cooldown')
  check(re.ItemRack.ManualQueueChoice[13]=='16022:1' and re.ItemRack.ManualQueueHold[13] and not next(re.ItemRackUser.ItemsUsed),
   'special-use-recovery-no-replay: restoration must not release a new hold or create use notifications')
  rw.sample={7,60,1}; rs.Poll()
  check(rs.IsCooldownPending(16022),'shared penalty after reload cannot end pending state')
  rw.time=70; rw.epoch=1800000173; rw.sample={70,3600,1}; rs.Poll()
  check(rs.Used[16022].phase=='cooldown' and not rs.IsCooldownPending(16022) and re.ItemRackUser.ItemsUsed[16022]==1,
   'first real native publication after reload must register normal notifications once')
  re.ItemRackUser.ItemsUsed[16022]=5; rs.Poll()
  check(re.ItemRackUser.ItemsUsed[16022]==5,'repeated observation must not replay notification registration')
  local observed=transport(re.ItemRackUser.SpecialItemUsage)
  local off,ow,os=fresh(observed,toc,2,1800004000,scope)
  initialize(off,ow,os)
  check(os.IsCooldownPending(16022),'offline expiry needs stable readable authority, not saved time alone')
  ow.time=3.1; os.Poll()
  check(not os.Used[16022] and not off.ItemRackUser.SpecialItemUsage.records[16022],
   'special-use-relog-native-expiry: stable post-login zero must retire an observed expired cooldown')
 end
end
local env,w,s=fresh(); initialize(env,w,s); use(env,s)
local seed=transport(env.ItemRackUser.SpecialItemUsage)
w.time=191; w.epoch=w.epoch+91
check(s.IsCooldownPending(16022) and s.Used[16022].phase=='pending','special-use-unresolved-recovery: queries are pure')
s.Poll(); check(s.Used[16022].phase=='unresolved','poll must enter unresolved state explicitly')
use(env,s,'Cast-New'); check(s.Used[16022].phase=='pending','a new independently confirmed use must replace old uncertainty')
env.ItemRack.ManualQueueHold[13]=true
check(s.ResetReceipt(16022) and not s.Used[16022] and not env.ItemRackUser.SpecialItemUsage.records[16022]
 and env.ItemRack.ManualQueueHold[13], 'explicit receipt reset must leave manual policy unchanged')
local first,fw,fs=fresh(); initialize(first,fw,fs); use(first,fs)
fw.time=160; fw.sample={160,3600,1}; fs.Poll()
local hot,hw,hs=fresh(transport(first.ItemRackUser.SpecialItemUsage),16001,2,1800000200)
hw.sample={1,3500,1}; initialize(hot,hw,hs)
check(hs.Used[16022].phase=='cooldown' and not next(hot.ItemRackUser.ItemsUsed),
 'restoring an already observed cooldown must not register its notification a second time')
for _,kind in ipairs({'schema','wrong-family','wrong-ruleset','revision','disabled','scalar','time','identity','slot'}) do
 local saved=transport(seed)
 if kind=='schema' then saved.schema=9
 elseif kind=='wrong-family' then saved.family='tbc'
 elseif kind=='wrong-ruleset' then saved.ruleset='sod'
 elseif kind=='revision' then saved.records[16022].revision=9
 elseif kind=='scalar' then saved.records[16022]=true
 elseif kind=='time' then saved.records[16022].confirmedAt='bad'
 elseif kind=='identity' then saved.records[16022].exactID='19830:1'
 elseif kind=='slot' then saved.records[16022].slot=17 end
 local re,rw,rs=fresh(saved)
 if kind=='disabled' then rs.Rules[16022].enabled=false; rs.BuildIndex() end
 initialize(re,rw,rs)
 check(not next(rs.Used) and #rs.Rejections>0,'special-use-store-validation: reject '..kind)
 if kind=='schema' then
  check(re.ItemRackUser.SpecialItemUsage==saved and saved.schema==9,'future schema must remain unchanged')
  use(re,rs); check(not next(rs.Used),'unsupported future schema must not execute new exceptions')
 end
end
for _,epoch in ipairs({1800000000,false}) do
 local re,rw,rs=fresh(transport(seed),16001,5,epoch)
 if epoch==false then rw.epoch=nil end
 initialize(re,rw,rs)
 check(rs.Used[16022].clockUncertain and rs.IsCooldownPending(16022),'backward/unavailable clocks cannot manufacture readiness')
 rw.sample={5,3600,1}; rs.Poll()
 check(rs.Used[16022].phase=='cooldown','fresh authoritative cooldown can reconcile an uncertain clock')
end
local oversized=transport(seed)
for id=900000,900200 do oversized.records[id]={bad=true} end
local big,bw,bs=fresh(oversized); initialize(big,bw,bs)
check(bs.IsCooldownPending(16022) and #bs.Rejections<=24,
 'oversized extraneous records must not crowd out a legitimate pending item; diagnostics stay bounded')
env,w,s=fresh(); initialize(env,w,s); use(env,s)
env.ItemRack.CooldownState.BeginArena(env.ItemRack.EnsureCooldownState(),w.time+1)
w.time=w.time+1; s.Poll()
check(not s.Used[16022] and not env.ItemRackUser.SpecialItemUsage.records[16022],
 'special-use-reset-generation: authority-confirmed arena reset must clear pending receipt')
env,w,s=fresh(); initialize(env,w,s); use(env,s)
w.time=160; w.sample={160,3600,1}; s.Poll()
env.ItemRack.CooldownState.BeginArena(env.ItemRack.EnsureCooldownState(),170)
w.time=170; s.Poll()
check(s.Used[16022]~=nil,'stale pre-arena active sample cannot masquerade as a confirmed reset')
w.sample={0,0,1}; s.Poll()
check(not s.Used[16022],'readable reset after stale arena data must retire receipt')
env,w,s=fresh(); initialize(env,w,s)
s.StartTrace(true)
for i=1,300 do s.OnSpellEvent('UNIT_SPELLCAST_SUCCEEDED','player','Unrelated',900000+i) end
check(#s.Trace==256 and s.TraceDropped==44 and not next(s.Used),'unexpected spell IDs must be diagnostic only and bounded')
w.time=221; s.OnSpellEvent('UNIT_SPELLCAST_SUCCEEDED','player','Late',19804)
check(#s.Trace==256 and s.TraceStop=='expired' and not next(s.Used),'detailed capture must expire without enabling use')
check(w.chat==0,'diagnostic collection must be quiet by default')
env,w,s=fresh(); initialize(env,w,s); s.StartTrace(true)
env.issecretvalue=function(value) return type(value)=='table' end
s.OnSpellEvent('UNIT_SPELLCAST_SUCCEEDED','player',{}, {})
check(not next(s.Used) and s.Trace[#s.Trace].spell==nil,'secret/unavailable spell evidence must remain diagnostic and cannot activate an item')
env,w,s=fresh(transport(seed),11509)
w.seasonal=nil; s.CatalogLoaded=nil; s.RefreshCatalog(); s.LoadSaved()
check(not s.PersistenceLoaded,'unknown seasonal detection must defer receipt validation')
w.seasonal=true; s.RefreshCatalog(); s.LoadSaved()
check(s.Client.ruleset=='sod' and s.Rules[228955] and not s.Rules[30720],
 'special-client-late-seasonal-detection: refresh must allocate only the selected seasonal table')
local rules=s.Rules; s.RefreshCatalog()
check(s.Rules==rules,'unchanged catalog refresh must be idempotent')
print(string.format('[SPECIAL RECOVERY LUA] %d isolated-environment recovery, validation, diagnostics and lifecycle checks passed.',checks))
`, 'special-use-reload-before-native-cooldown');

// Compare the entire live catalog with pinned extracted client records rather
// than testing only an example row or treating the coverage manifest as truth.
function parseMetrics(text) {
  const rows=[]; let row=[],field='',quoted=false;
  for(let i=0;i<text.length;i++) {
    const c=text[i];
    if(c==='"') { if(quoted && text[i+1]==='"') { field+='"'; i++; } else quoted=!quoted; }
    else if(!quoted && (c===',' || c==='\n')) {
      row.push(field); field='';
      if(c==='\n') { rows.push(row); row=[]; }
    } else if(c!=='\r' || quoted) field+=c;
  }
  if(field || row.length) { row.push(field); rows.push(row); }
  const header=rows.shift(); return rows.map(r=>Object.fromEntries(header.map((h,i)=>[h,r[i]])));
}
function luaData(value) {
  if(value===null || value===undefined) return 'nil';
  if(typeof value!=='object') return JSON.stringify(value);
  if(Array.isArray(value)) return `{${value.map(luaData).join(',')}}`;
  return `{${Object.entries(value).map(([k,v])=>`[${/^\d+$/.test(k)?k:JSON.stringify(k)}]=${luaData(v)}`).join(',')}}`;
}
const metrics=parseMetrics(require('fs').readFileSync('docs/research/special-item-usage-metrics.csv','utf8'));
const seasonalIDs=new Set([213347,213348,215461,227973,228955,233217]);
const inventorySlots={1:[1],8:[8],12:[13,14],23:[17]};
const fallbackSlots=new Map(metrics.filter(r=>r.label==='era-11509' && r.trigger==='0').map(r=>[r.item_id,Number(r.slot)]));
const cases=[];
for(const [toc,label] of [[11508,'era-11508'],[11509,'era-11509'],[20505,'tbc-255'],[20506,'tbc-256'],[16001,'forever-16001'],[11601,'forever-16001']]) {
  for(const sod of toc<20000 && toc>=11508 && toc<=11509 ? [false,true] : [false]) {
    const gear={},references={};
    for(const r of metrics.filter(r=>r.label===label && (r.trigger==='0' || r.item_id==='30720'))) {
      if(seasonalIDs.has(Number(r.item_id)) && !sod) continue;
      const slotType=r.slot==='' ? fallbackSlots.get(r.item_id) : Number(r.slot);
      if(!inventorySlots[slotType]) { references[r.item_id]=true; continue; }
      const own=Number(r.item_cd_ms)>=0 ? Number(r.item_cd_ms) : Number(r.spell_cd_ms);
      gear[r.item_id]={spell:Number(r.spell_id),slots:inventorySlots[slotType],seconds:own/1000,
        channel:r.channel==='True',deferred:r.event_cooldown==='True'||r.alias_event==='True',
        success:Number(r.legacy_alias||r.spell_id),category:Number(r.item_category),
        categorySeconds:(Number(r.item_category_cd_ms)>=0 ? Number(r.item_category_cd_ms):Number(r.spell_category_cd_ms))/1000};
    }
    cases.push({toc,sod,gear,references});
  }
}
runLua(String.raw`
local now=100
function GetTime() return now end
local toc,sod
function GetBuildInfo() return 'fixture','70938','fixture',toc end
ItemRack={IsEngravingActive=function() return sod end}
local activeSpell,activeUnit,channelSpell
function GetSpellInfo(id) return 'spell:'..id end
function UnitBuff(unit,index)
 if activeUnit==unit and index==1 and not (unit=='pet' and activeSpell==13181) then return GetSpellInfo(activeSpell) end
end
function UnitDebuff(unit,index)
 if activeUnit==unit and index==1 and unit=='pet' and activeSpell==13181 then return GetSpellInfo(activeSpell) end
end
function UnitChannelInfo() return nil,nil,nil,nil,nil,nil,nil,channelSpell end
${extractFunction(itemRackFile,'ItemRack.FindPlayerAura')}
${extractFunction(itemRackFile,'ItemRack.FindAuraByName')}
local checks=0
local function check(v,m) assert(v,m); checks=checks+1 end
local function count(t) local n=0; for _ in pairs(t) do n=n+1 end; return n end
for _,case in ipairs(${luaData(cases)}) do
 toc,sod=case.toc,case.sod
 ${loadSpecialCatalog}
 local special=ItemRack.SpecialItems
 check(count(special.Rules)==count(case.gear),'collective-catalog-source: every applicable equipped source item must appear exactly once')
 check(count(special.ReferenceItems)==count(case.references),'every reviewed bag-only source item must remain reference-only')
 check(not next(special.InvalidRules),'all enabled catalog entries must pass production validation')
 for id,source in pairs(case.gear) do
  local rule=special.GetRule(id)
  check(rule and rule.enabled and rule.revision==1,'collective-catalog-source: every reviewed gear row must be enabled')
  check(count(rule.slots)==#source.slots,'equipment slots must come from InventoryType mapping, never from spell target or category')
  for _,slot in ipairs(source.slots) do check(special.GetRule(id,slot)==rule,'every source equipment slot must match') end
  if id==30720 then check(rule.proxy.id==22044 and rule.proxy.buff==37445,'Braid must preserve its existing shared proxy')
  else
   check(rule.useSpell==source.spell and rule.cooldown.seconds==source.seconds,'spell/cooldown metrics must match the pinned client binding')
   check(rule.cooldown.category==source.category and rule.cooldown.categorySeconds==source.categorySeconds,'shared cooldown metadata must match this client, not a universal guardian timer')
   check((rule.cooldown.start=='deferred')==source.deferred,'deferred handling must follow this client effect/alias flags')
   if source.deferred then check(rule.activation.successSpells[source.success],'matching activation evidence must use the client-specific summon identity') end
   if source.channel then check(rule.effect.kind=='channel' and rule.effect.spells[source.spell] and rule.effect.hold,'source channels must use the reusable channel guard') end
  end
  local effect=rule.effect
  if effect and effect.hold then
   local spell=next(effect.spells); local slot=source.slots[1]
   activeSpell,activeUnit,channelSpell=nil,nil,nil
   if effect.kind=='channel' then channelSpell=spell else activeSpell,activeUnit=spell,effect.unit end
   check(special.ShouldHoldEffect(slot,tostring(id)),'catalog-effect-flow: the actual configured channel/aura must hold its item')
   if effect.kind=='channel' then channelSpell=999999 else activeSpell=999999 end
   check(not special.ShouldHoldEffect(slot,tostring(id)),'unrelated channel/aura must not hold any catalog item')
   if effect.kind=='aura' then
    activeSpell=spell; activeUnit=effect.unit=='pet' and 'player' or 'pet'
    check(not special.ShouldHoldEffect(slot,tostring(id)),'the same spell on the wrong unit must not satisfy the rule')
   end
  end
 end
 for id in pairs(case.references) do check(not special.GetRule(id) and special.ReferenceItems[id].scope=='bag','bag-only reference must never register as an equipment rule') end
 activeSpell,activeUnit,channelSpell=nil,nil,nil
 local report=special.GetDiagnostics()
 check(report.catalog[4396].cooldown and report.catalogSource.label and report.referenceItems[3456],
  'support dumps must include selected catalog mechanics, source and bag-reference boundary')
end
print(string.format('[COLLECTIVE CATALOG SOURCE LUA] %d pinned-build coverage, metrics and actual channel/aura checks passed.',checks))
`, 'collective-catalog-source');

runLua(String.raw`
local now=100
function GetTime() return now end
function GetBuildInfo() return 'fixture','70938','fixture',16001 end
function date() return 'clock' end
local printed={}
ItemRack={DebugAll=false,DebugChat=false,DebugTags={Events=false,Equip=false,Queue=false,CombatQueue=false,API=false,UI=false,Combat=false,SpecialItems=false},
 IsEngravingActive=function() return false end,
 GetEquippedSlotState=function(slot) return slot==13 and 'resolved' or 'empty',slot==13 and '16022:1' end,
 Print=function(message) printed[#printed+1]=message end,
 QueueDiagnostic=function() end,ClearQueueDiagnostics=function() end}
${loadSpecialCatalog}
${extractFunction(itemRackFile,'ItemRack.Debug')}
${extractFunction(itemRackFile,'ItemRack.PrintDebugStatus')}
${extractFunction(itemRackFile,'ItemRack.SlashHandler')}
local special=ItemRack.SpecialItems
local checks=0
local function check(v,m) assert(v,m); checks=checks+1 end
ItemRack.SlashHandler('debug')
check(ItemRack.DebugAll and ItemRack.DebugTags.SpecialItems and special.TraceUntil==220 and special.IsTraceActive(),
 'core-debug-starts-special-capture: master debug must start the same 120-second capture as the dedicated command')
check(special.TraceStop==nil,'active capture must not be reported as already disabled')
local messages=#printed
special.OnSpellEvent('UNIT_SPELLCAST_SUCCEEDED','player','Unrelated',999999)
check(#special.Trace==1 and #printed==messages and #ItemRack.LogBuffer==1,'master capture must record silently with debug chat off')
now=221
ItemRack.SlashHandler('debug status')
check(not special.IsTraceActive() and printed[#printed]:find('OFF/expired',1,true),'status must report actual expired capture, not only its tag')
ItemRack.SlashHandler('debug specialitems')
check(special.IsTraceActive() and special.TraceUntil==341 and #special.Trace==0,'dedicated command must rearm in one invocation after expiry')
ItemRack.SlashHandler('debug specialitems')
check(not special.IsTraceActive(),'dedicated command must stop capture while master debugging remains enabled')
ItemRack.SlashHandler('debug')
check(not ItemRack.DebugAll and not ItemRack.DebugTags.SpecialItems and not special.IsTraceActive(),'master disable must stop the special capture too')
ItemRack.SlashHandler('debug specialitems')
check(not ItemRack.DebugAll and ItemRack.DebugTags.SpecialItems and special.IsTraceActive(),'dedicated capture must also work independently')
ItemRack.SlashHandler('debug specialitems')
ItemRack.SlashHandler('debug chat')
check(ItemRack.DebugAll and ItemRack.DebugChat and special.IsTraceActive(),'enabling all layers through debug chat must include special-item capture')
local deadline=special.TraceUntil
ItemRack.SlashHandler('debug chat')
check(not ItemRack.DebugChat and special.TraceUntil==deadline,'turning chat off must not stop or restart silent capture')
special.Used[16022]={lastSample='old'}; special.History={{reason='test'}}
special.OnSpellEvent('UNIT_SPELLCAST_SUCCEEDED','player','Unrelated',999999)
ItemRack.SlashHandler('debug clear')
check(#special.Trace==0 and #special.History==0 and special.IsTraceActive() and special.Used[16022] and not special.Used[16022].lastSample,
 'clearing diagnostics must preserve confirmed use and active capture while allowing the next sample to be recorded')
print(string.format('[SPECIAL DEBUG COMMAND LUA] %d actual SlashHandler start/stop/expiry/chat and clear checks passed.',checks))
`, 'core-debug-starts-special-capture');
