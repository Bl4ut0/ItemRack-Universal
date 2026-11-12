const fs = require('fs');
const { extractFunction, runLua } = require('./lib/lua_harness');

const reducer = fs.readFileSync('ItemRack/ItemRackEventState.lua', 'utf8');
const events = fs.readFileSync('ItemRack/ItemRackEvents.lua', 'utf8');
const equipSet = extractFunction('ItemRack/ItemRackEquip.lua', 'ItemRack.EquipSet');
const unequipSet = extractFunction('ItemRack/ItemRackEquip.lua', 'ItemRack.UnequipSet');

runLua(String.raw`
local now = 100
local movingSpeed = 0
local currentStance = 0
local playerClass = "SHAMAN"
local formCount = 2
local modernFormInfo = false
local forms = { { name="Form One" }, { name="Form Two" } }
local spellNames = {}
local currentSpec = 1
local mounted = false
local instanceType = nil
local auras = {}
local inventory = { [13]="Base13", [14]="Base14", [15]="Base15" }
local scheduled = {}

function IsMounted() return mounted end
function UnitOnTaxi() return false end
function GetTime() return now end
function InCombatLockdown() return false end
function GetShapeshiftForm() return currentStance end
function GetNumShapeshiftForms() return formCount end
function GetShapeshiftFormInfo(index)
  local form = forms[index]
  if not form then return end
  if modernFormInfo then return 123,index == currentStance,true,form.spellID end
  return 123,form.name,index == currentStance,true,form.spellID
end
function GetSpellInfo(spellID) return spellNames[spellID] end
function GetActiveTalentGroup() return currentSpec end
function GetRealZoneText() return "" end
function GetSubZoneText() return "" end
function IsInInstance() return instanceType ~= nil,instanceType end
function GetInstanceInfo() return nil,nil,nil,nil,nil,nil,nil,nil end
function UnitClass() return playerClass,playerClass end
function GetUnitSpeed() return movingSpeed end
function CanDualWield() return false end
C_AddOns, C_Spell, C_Talent = nil,nil,nil
C_Timer = {
  After = function(delay, callback)
    table.insert(scheduled,{ delay=delay, callback=callback })
  end,
}
AuraUtil = {
  FindAuraByName = function(name)
    return auras[name] and name or nil
  end,
}

ItemRack = {
  BuildID = "ProcessorTest",
  Debug = function() end,
  Print = function() end,
  PreflightSetSwap = function() return true end,
  GetID = function(slot) return inventory[slot] or 0 end,
  IsAutomaticSwapBlocked = function() return false end,
  UpdateCurrentSet = function() end,
}
ItemRackSettings = { EventsVersion=20 }
ItemRackUser = { EnableEvents="ON", Events={ Enabled={}, Set={} }, Sets={}, EventStack={} }
ItemRackEvents = {}

${reducer}
${extractFunction('ItemRack/ItemRack.lua', 'ItemRack.FindPlayerAura')}
${events}
${equipSet}
${unequipSet}

local checks = 0
local function check(value,message) assert(value,message); checks = checks + 1 end
local function count(tbl)
  local result = 0
  for _ in pairs(tbl or {}) do result = result + 1 end
  return result
end
local function runScheduled(index)
  local pending = table.remove(scheduled,index or 1)
  assert(pending,"expected a scheduled callback")
  pending.callback()
  return pending.delay
end
local function reset()
  ItemRackUser = {
    EnableEvents="ON",
    Events={ Enabled={}, Set={} },
    Sets={},
    EventStack={},
    EventState=ItemRack.EventFrames.NewState(),
  }
  ItemRackEvents = {}
  ItemRack.EventFramePendingTargets = {}
  ItemRack.EventFramePendingRevision = nil
  ItemRack.EventFramePendingSetName = nil
  ItemRack.EventFramePendingDisableSound = nil
  ItemRack.EventFramePlans = {}
  ItemRack.EventFrameBatchDepth = 1
  ItemRack.EventFramePlanActive = nil
  ItemRack.EventFramePlanBlockedReason = nil
  ItemRack.EventFrameBlockedActivations = {}
  ItemRack.EventGenerations = {}
  ItemRack.LastLastSpec = nil
  ItemRack.PendingSpecSet = nil
  ItemRack.LastOnMovementState = nil
  ItemRack.OnMovementGeneration = nil
  ItemRack.OnMovementDelayElapsedGeneration = nil
  ItemRack.PendingOnMovementGeneration = nil
  ItemRack.LastZoneChangeTime = nil
  scheduled = {}
  auras = {}
  movingSpeed = 0
  currentStance = 0
  playerClass = "SHAMAN"
  formCount = 2
  modernFormInfo = false
  forms = { { name="Form One" }, { name="Form Two" } }
  spellNames = {}
  C_Spell = nil
  currentSpec = 1
  mounted = false
  instanceType = nil
  inventory = { [13]="Base13", [14]="Base14", [15]="Base15" }
end
local function addEvent(name,data,setname,equip)
  ItemRackEvents[name] = data
  ItemRackUser.Events.Enabled[name] = 1
  ItemRackUser.Events.Set[name] = setname
  ItemRackUser.Sets[setname] = { equip=equip }
end

-- Stance transitions collect every match and impose name order, independent of
-- insertion/pairs order. Leaving removes logical ownership even for Keep gear.
reset()
addEvent("ZuluStance",{ Type="Stance", Stance=1, Unequip=1 },"ZuluSet",{ [14]="Zulu14" })
addEvent("AlphaStance",{ Type="Stance", Stance=1 },"AlphaSet",{ [13]="Alpha13" })
currentStance = 1
ItemRack.ProcessStanceEvent()
check(#ItemRackUser.EventStack == 2, "all matching stance events must activate")
check(ItemRackUser.EventStack[1] == "AlphaStance" and ItemRackUser.EventStack[2] == "ZuluStance",
  "stance frame order must be deterministic")
check(ItemRackEvents.AlphaStance.Active and ItemRackEvents.ZuluStance.Active,
  "stance Active flags must project owned frames")
currentStance = 2
ItemRack.ProcessStanceEvent()
check(#ItemRackUser.EventStack == 0, "all ended stance frames must be removed")
check(ItemRack.EventFramePendingTargets[13] == nil,
  "an unsubmitted Unequip=false stance target must be cancelled when it ends")
check(ItemRack.EventFramePendingTargets[14] == "Base14",
  "an Unequip=true stance target must restore its observed base")

-- Bl4ut0's v4.47 live report (2026-09-17): Ghost Wolf reports current
-- form=1, available bar forms=0, and previously resolved to nil. The dump
-- enables Primary Spec and Mounted alongside Ghost Wolf with a shared travel
-- set. Model only the observed equipment endpoint below; ownership/processor
-- transitions and plan completion execute production Lua.
reset()
formCount = 0
check(ItemRack.GetStanceNumber(1) == 1 and ItemRack.GetStanceNumber("1") == 1,
  "Ghost Wolf stance 1 must resolve even without a shapeshift bar")
check(ItemRack.GetStanceNumber(0) == 0,
  "humanoid stance 0 must resolve even without a shapeshift bar")
check(ItemRack.GetStanceNumber("Unknown Form") == nil,
  "an unavailable named form must not invent a numeric stance")
local function finishObservedPlan()
  if not next(ItemRack.EventFramePendingTargets) then return end
  local state = ItemRack.EnsureEventFrameState()
  local planName = "~EventFrame:"..tostring(state.revision)
  local targets = ItemRack.EventFramePendingTargets
  ItemRack.EventFramePlans[planName] = {
    revision=state.revision, targets=targets,
    restoreSetName=ItemRack.EventFramePendingSetName,
  }
  ItemRack.EventFramePlanActive = planName
  ItemRackUser.Sets[planName] = { equip=targets }
  ItemRack.EventFramePendingTargets = {}
  ItemRack.EventFramePendingSetName = nil
  for slot,id in pairs(targets) do inventory[slot] = id end
  ItemRack.EventFramePlanFinished(planName,true)
end
addEvent("Primary Spec",{ Type="Specialization", Spec=1, Unequip=1 },"BaseSet",{ [13]="Base13" })
addEvent("Shaman Ghostwolf",{ Type="Stance", Stance=1, Unequip=1 },"TravelSet",{ [13]="Crop" })
addEvent("Mounted",{ Type="Buff", Anymount=1, OnMovement=1, OnMovementDelay=false, Unequip=1 },"TravelSet",{ [13]="Crop" })
ItemRackUser.Sets.BaseSet.Queues = { [14]={ "Queue14" } }
ItemRackUser.CurrentSet = "BaseSet"
ItemRack.ProcessSpecializationEvent(true)
currentStance = 1
ItemRack.ProcessStanceEvent()
finishObservedPlan()
check(ItemRackEvents["Shaman Ghostwolf"].Active and inventory[13] == "Crop"
  and ItemRackUser.CurrentSet == "TravelSet",
  "zero-bar Ghost Wolf must activate above Primary Spec and equip travel gear")
scheduled = {}
mounted, movingSpeed = true,7
ItemRack.ProcessBuffEvent()
check(not ItemRackEvents.Mounted.Active and #scheduled == 1,
  "new mount ownership must still wait for the client stabilization gate")
now = now + 1
runScheduled()
finishObservedPlan()
currentStance = 0
ItemRack.ProcessStanceEvent()
finishObservedPlan()
check(not ItemRackEvents["Shaman Ghostwolf"].Active and ItemRackEvents.Mounted.Active
  and inventory[13] == "Crop",
  "leaving Ghost Wolf must not restore over Mounted sharing its travel set")
scheduled = {}
movingSpeed = 0
ItemRack.ProcessBuffEvent()
check(#scheduled == 0, "OnMovementDelay=false must retain immediate stop restoration")
finishObservedPlan()
check(#ItemRackUser.EventStack == 1 and ItemRackUser.EventStack[1] == "Primary Spec"
  and inventory[13] == "Base13" and ItemRackUser.CurrentSet == "BaseSet"
  and ItemRackUser.Sets.BaseSet.Queues[14][1] == "Queue14",
  "final travel exit must restore Primary Spec gear and its original queue context")
currentStance = 1
instanceType = "pvp"
ItemRackEvents["Shaman Ghostwolf"].NotInPVP = true
ItemRack.ProcessStanceEvent()
check(not ItemRackEvents["Shaman Ghostwolf"].Active,
  "numeric Ghost Wolf compatibility must preserve PVP exclusions")

-- Modern clients return active/castable booleans, not a name, as the second
-- and third form-info values. Resolve names via the spell ID, including
-- localized player-entered names and English packaged defaults.
reset()
playerClass,modernFormInfo,formCount = "DRUID",true,2
forms = { { spellID=24858 }, { spellID=33891 } }
spellNames = { [24858]="Localized Moonkin", [33891]="Localized Tree" }
C_Spell = { GetSpellName=function(id) return spellNames[id] end }
check(ItemRack.GetStanceNumber("Moonkin Form") == 1
  and ItemRack.GetStanceNumber("Tree of Life") == 2,
  "packaged named forms must match modern spell IDs independent of locale")
check(ItemRack.GetStanceNumber("Localized Moonkin") == 1,
  "custom localized stance names must match the modern spell-name API")
check(ItemRack.GetStanceNumber(nil) == nil and ItemRack.GetStanceNumber(false) == nil,
  "malformed stance values must never match missing form names")
addEvent("Moonkin",{ Type="Stance", Stance="Moonkin Form", Unequip=1 },"MoonkinSet",{ [13]="Moonkin13" })
currentStance = 1
ItemRack.ProcessStanceEvent()
check(ItemRackEvents.Moonkin.Active and ItemRack.EventFramePendingTargets[13] == "Moonkin13",
  "modern named forms must activate the production stance processor")
C_Spell = { GetSpellInfo=function(id) return { name=spellNames[id] } end }
check(ItemRack.GetStanceNumber("Localized Tree") == 2,
  "modern spell-info tables must support named forms when GetSpellName is absent")
C_Spell = nil
check(ItemRack.GetStanceNumber("Localized Tree") == 2,
  "global GetSpellInfo must remain a supported compatibility path")
forms = { { spellID=768 }, { spellID=783 } }
spellNames = { [768]="Localized Cat", [783]="Localized Travel" }
check(ItemRack.GetStanceNumber(3) == 1 and ItemRack.GetStanceNumber(4) == 2,
  "default Druid numeric identities must map learned localized forms by spell ID")
modernFormInfo = false
forms = { { name="Bear Form", spellID=5487 }, { name="Travel Form", spellID=783 } }
check(ItemRack.GetStanceNumber("Bear Form") == 1 and ItemRack.GetStanceNumber(4) == 2,
  "legacy named form-info return values must remain compatible")

-- Neighboring compatibility: numeric identities must not depend on a form
-- bar for Warriors, Rogues, or Shamans. Repeated evaluations cannot manufacture
-- extra frames; transitions, including humanoid 0, must retire the prior owner.
for _,class in ipairs({ "WARRIOR", "ROGUE", "SHAMAN" }) do
  reset()
  playerClass,formCount = class,0
  for stance=0,3 do
    check(ItemRack.GetStanceNumber(stance) == stance,
      class.." numeric stance must resolve without bar entries")
  end
end
reset()
playerClass,formCount = "WARRIOR",0
for stance=0,3 do
  addEvent("Warrior"..stance,{ Type="Stance", Stance=stance, Unequip=1 },
    "WarriorSet"..stance,{ [13]="WarriorItem"..stance })
end
for stance=0,3 do
  currentStance = stance
  ItemRack.ProcessStanceEvent()
  finishObservedPlan()
  check(#ItemRackUser.EventStack == 1 and ItemRackEvents["Warrior"..stance].Active
    and inventory[13] == "WarriorItem"..stance,
    "stance transition must equip only the new owner, including humanoid 0")
  local revision = ItemRackUser.EventState.revision
  ItemRack.ProcessStanceEvent()
  check(ItemRackUser.EventState.revision == revision
    and not next(ItemRack.EventFramePendingTargets),
    "repeated unchanged stance evaluation must create no frame or gear churn")
end
reset()
playerClass,modernFormInfo,formCount = "DRUID",true,2
forms = { { spellID=9634 }, { spellID=1066 } }
check(ItemRack.GetStanceNumber(1) == 1 and ItemRack.GetStanceNumber(2) == 2,
  "Dire Bear and Aquatic numeric defaults must resolve without spell-name APIs")
forms = { { spellID=999999 }, {} }
check(ItemRack.GetStanceNumber("Unknown Form") == nil,
  "unknown spell IDs and absent identities must not activate a named stance")

-- Multiple Buff+OnMovement owners share one generation-bound expiry. One
-- callback retires all of them in sorted order rather than one pairs() winner.
reset()
addEvent("ZuluMove",{ Type="Buff", Buff="Move Z", OnMovement=1, Unequip=1 },"ZuluMoveSet",{ [14]="Move14" })
addEvent("AlphaMove",{ Type="Buff", Buff="Move A", OnMovement=1, Unequip=1 },"AlphaMoveSet",{ [13]="Move13" })
auras["Move A"],auras["Move Z"] = true,true
movingSpeed = 7
ItemRack.ProcessBuffEvent()
check(ItemRackUser.EventStack[1] == "AlphaMove" and ItemRackUser.EventStack[2] == "ZuluMove",
  "Buff activation order must be deterministic")
ItemRack.EventFramePendingTargets = {}
movingSpeed = 0
ItemRack.ProcessBuffEvent()
check(#ItemRackUser.EventStack == 2 and #scheduled == 1,
  "stopping must retain all movement owners and schedule one shared debounce")
runScheduled()
check(#ItemRackUser.EventStack == 0, "one movement expiry must retire every stopped event")
check(ItemRack.EventFramePendingTargets[13] == "Base13"
  and ItemRack.EventFramePendingTargets[14] == "Base14",
  "movement expiry must coalesce every restoration slot")

-- A callback from the stopped epoch cannot pop frames after movement resumes.
reset()
addEvent("Move",{ Type="Buff", Buff="Move", OnMovement=1, Unequip=1 },"MoveSet",{ [13]="Move13" })
auras.Move = true
movingSpeed = 4
ItemRack.ProcessBuffEvent()
ItemRack.EventFramePendingTargets = {}
movingSpeed = 0
ItemRack.ProcessBuffEvent()
local staleGeneration = ItemRack.OnMovementGeneration
check(#scheduled == 1, "stop epoch must schedule its debounce")
movingSpeed = 4
ItemRack.ProcessBuffEvent()
runScheduled()
check(ItemRackUser.EventState.byEvent.Move ~= nil and ItemRackEvents.Move.Active,
  "stale stop callback must not pop after movement resumes")
check(ItemRack.OnMovementGeneration ~= staleGeneration,
  "movement resume must advance the callback generation")

-- A never-submitted non-restoring Buff activation is cancellation, not stale
-- future intent. This is the Unequip=false counterpart to observed keep-gear.
reset()
addEvent("KeepMove",{ Type="Buff", Buff="Keep", OnMovement=1, OnMovementDelay=false },"KeepSet",{ [13]="Keep13" })
auras.Keep = true
movingSpeed = 3
ItemRack.ProcessBuffEvent()
check(ItemRack.EventFramePendingTargets[13] == "Keep13", "keep event must initially request its target")
movingSpeed = 0
ItemRack.ProcessBuffEvent()
check(ItemRackUser.EventState.byEvent.KeepMove == nil, "instant stopped keep event must release its frame")
check(ItemRack.EventFramePendingTargets[13] == nil, "released keep event must cancel its unsubmitted target")

-- Specialization processing activates and retires every matching event in a
-- deterministic batch, rather than retaining one arbitrary eventToEquip value.
reset()
addEvent("ZuluSpec",{ Type="Specialization", Spec=1, Unequip=1 },"ZuluSpecSet",{ [14]="Spec14" })
addEvent("AlphaSpec",{ Type="Specialization", Spec=1, Unequip=1 },"AlphaSpecSet",{ [13]="Spec13" })
addEvent("SecondSpec",{ Type="Specialization", Spec=2, Unequip=1 },"SecondSpecSet",{ [15]="Spec15" })
currentSpec = 1
ItemRack.ProcessSpecializationEvent()
check(ItemRackUser.EventStack[1] == "AlphaSpec" and ItemRackUser.EventStack[2] == "ZuluSpec",
  "all current-spec events must activate in deterministic order")
currentSpec = 2
ItemRack.ProcessSpecializationEvent()
check(#ItemRackUser.EventStack == 1 and ItemRackUser.EventStack[1] == "SecondSpec",
  "spec transition must remove all old owners before adding the destination owners")
check(not ItemRackEvents.AlphaSpec.Active and not ItemRackEvents.ZuluSpec.Active
  and ItemRackEvents.SecondSpec.Active, "specialization Active flags must match frame ownership")

-- GitHub #21: an explicitly selected associated set wins over a different
-- destination-spec default; the request is consumed exactly once.
reset()
addEvent("Primary",{ Type="Specialization", Spec=1, Unequip=1 },"PrimarySet",{ [13]="Primary13" })
addEvent("Secondary",{ Type="Specialization", Spec=2, Unequip=1 },"DefaultSecondary",{ [13]="Default13" })
ItemRackUser.Sets.ManualSecondary = { equip={ [13]="Manual13" } }
currentSpec = 1
ItemRack.ProcessSpecializationEvent()
ItemRack.ReleaseEventSlotsForManualChange({ [13]=true })
ItemRack.EventFramePendingTargets = {}
ItemRackUser.CurrentSet = "ManualSecondary"
ItemRack.PendingSpecSet = { setname="ManualSecondary", spec=2, expiresAt=now+15 }
currentSpec = 2
ItemRack.ProcessSpecializationEvent()
check(ItemRack.PendingSpecSet == nil, "associated-set request must be consumed by the transition")
check(ItemRackUser.CurrentSet == "ManualSecondary", "destination default must not replace explicit set intent")
check(ItemRackUser.EventState.byEvent.Secondary == nil,
  "different destination default must not acquire ownership during preservation")
check(ItemRack.EventFramePendingTargets[13] == nil,
  "suppressed destination default must submit no gear target")

-- If the destination event maps to the selected set, it may adopt a logical
-- frame without generating a redundant physical move.
reset()
addEvent("SecondaryManual",{ Type="Specialization", Spec=2, Unequip=1 },"ManualSecondary",{ [13]="Manual13" })
inventory[13] = "Manual13"
ItemRackUser.CurrentSet = "ManualSecondary"
ItemRack.PendingSpecSet = { setname="ManualSecondary", spec=2, expiresAt=now+15 }
ItemRack.LastLastSpec = 1
currentSpec = 2
ItemRack.ProcessSpecializationEvent()
check(ItemRackUser.EventState.byEvent.SecondaryManual ~= nil and ItemRackEvents.SecondaryManual.Active,
  "matching destination event must adopt a frame")
check(ItemRack.EventFramePendingTargets[13] == nil,
  "same-set adoption must not submit a redundant equipment move")

-- Every explicit set-equip entry converges on EquipSet. It must record manual
-- intent before a readiness/casting return; automatic and internal calls must
-- not replace that intent, and the newest manual request wins.
reset()
ItemRackUser.Sets.Initiator = { equip={} }
ItemRackUser.Sets.ManualB = { equip={} }
ItemRackUser.Sets.ManualC = { equip={} }
ItemRackUser.Sets.Automatic = { equip={} }
ItemRackUser.Sets["~Internal"] = { equip={} }
ItemRackUser.EnableQueues = "ON"
ItemRack.QueueStateReady = false
ItemRack.ScheduleQueueStateRetry = function() end
ItemRack.PendingSpecSet = { setname="Initiator", spec=2, expiresAt=now+15 }
check(ItemRack.EquipSet("ManualB") == "deferred" and
  ItemRack.PendingSpecSet.latestManualSet == "ManualB",
  "manual intent must be captured before queue readiness defers EquipSet")
ItemRack.IsEventEquipment = true
ItemRack.EquipSet("Automatic")
ItemRack.IsEventEquipment = nil
check(ItemRack.PendingSpecSet.latestManualSet == "ManualB",
  "event equipment must not supersede a pending manual specialization intent")
ItemRack.PendingQueueEquipSet = nil
ItemRack.IsDeferredEquipment = true
ItemRack.EquipSet("Automatic")
ItemRack.IsDeferredEquipment = nil
check(ItemRack.PendingSpecSet.latestManualSet == "ManualB",
  "deferred automatic equipment must not supersede manual intent")
ItemRack.PendingQueueEquipSet = nil
ItemRack.EquipSet("~Internal")
check(ItemRack.PendingSpecSet.latestManualSet == "ManualB",
  "internal restoration sets must not supersede manual intent")
ItemRack.PendingQueueEquipSet = nil
ItemRack.EquipSet("ManualC")
check(ItemRack.PendingSpecSet.latestManualSet == "ManualC",
  "multiple manual selections must use last-write-wins precedence")

-- Toggling the initiating set off is a newer manual decision too. Capture it
-- before a lock defers the restore and suppress the destination default once.
reset()
addEvent("DestinationDefault",{ Type="Specialization", Spec=2, Unequip=1 },
  "DefaultSet",{ [13]="Default13" })
ItemRackUser.Sets.Initiator = { equip={ [13]="Initial13" }, old={} }
ItemRackUser.CurrentSet = "Initiator"
ItemRack.PendingSpecSet = { setname="Initiator", spec=2, expiresAt=now+15 }
ItemRack.LastLastSpec = 1
ItemRack.SetSwapping = "Other"
ItemRack.AddSetToSetsWaiting = function() end
ItemRack.UnequipSet("Initiator")
ItemRack.SetSwapping = nil
check(ItemRack.PendingSpecSet.cancelledByManualUnequip and
  ItemRack.PendingSpecSet.latestManualSet == nil,
  "manual toggle-off must supersede a pending associated-set intent before lock deferral")
currentSpec = 2
ItemRack.ProcessSpecializationEvent()
check(ItemRack.PendingSpecSet == nil and
  ItemRackUser.EventState.byEvent.DestinationDefault == nil and
  ItemRack.EventFramePendingTargets[13] == nil,
  "the expected spec transition must not immediately undo the newer manual unequip")

-- A newer manual set remains authoritative even while CurrentSet still names
-- the associated set that initiated the cast.
reset()
addEvent("Primary",{ Type="Specialization", Spec=1, Unequip=1 },"PrimarySet",{ [13]="Primary13" })
addEvent("DestinationDefault",{ Type="Specialization", Spec=2, Unequip=1 },"DefaultSet",{ [13]="Default13" })
ItemRackUser.Sets.ManualB = { equip={ [13]="ManualB13" } }
currentSpec = 1
ItemRack.ProcessSpecializationEvent()
ItemRackUser.CurrentSet = "PrimarySet"
ItemRack.PendingSpecSet = {
  setname="PrimarySet", latestManualSet="ManualB", spec=2, expiresAt=now+15,
}
ItemRack.ReleaseEventSlotsForManualChange(ItemRackUser.Sets.ManualB.equip)
ItemRack.EventFramePendingTargets = {}
currentSpec = 2
ItemRack.ProcessSpecializationEvent()
check(ItemRack.PendingSpecSet == nil and
  ItemRackUser.EventState.byEvent.DestinationDefault == nil,
  "a newer queued manual set must suppress a different destination default")
check(ItemRack.EventFramePendingTargets[13] == nil,
  "suppressed destination defaults must not submit physical gear")

-- If the destination event maps to that newer manual set, it may adopt the
-- logical frame even before CurrentSet catches up.
reset()
addEvent("ManualDestination",{ Type="Specialization", Spec=2, Unequip=1 },"ManualB",{ [13]="ManualB13" })
ItemRackUser.Sets.Initiator = { equip={ [13]="Initial13" } }
inventory[13] = "ManualB13"
ItemRackUser.CurrentSet = "Initiator"
ItemRack.PendingSpecSet = {
  setname="Initiator", latestManualSet="ManualB", spec=2, expiresAt=now+15,
}
ItemRack.LastLastSpec = 1
currentSpec = 2
ItemRack.ProcessSpecializationEvent()
check(ItemRackUser.EventState.byEvent.ManualDestination ~= nil and
  ItemRackEvents.ManualDestination.Active,
  "a matching destination event must adopt the newer manual set")
check(ItemRack.EventFramePendingTargets[13] == nil,
  "newer same-set adoption must avoid a redundant physical target")

-- Forced same-spec reconciliation is not proof that the in-flight cast
-- completed. Leave the request for the real transition (or its timeout).
reset()
addEvent("Primary",{ Type="Specialization", Spec=1, Unequip=1 },"PrimarySet",{ [13]="Primary13" })
ItemRackUser.PendingMarker = true
ItemRack.PendingSpecSet = { setname="PrimarySet", spec=2, expiresAt=now+15 }
ItemRack.LastLastSpec = 1
currentSpec = 1
ItemRack.ProcessSpecializationEvent(true)
check(ItemRack.PendingSpecSet ~= nil,
  "forced same-spec processing must not consume an in-flight associated-set request")

-- Expired/deleted overrides are not allowed to suppress a valid destination.
reset()
addEvent("Destination",{ Type="Specialization", Spec=2, Unequip=1 },"DefaultSet",{ [13]="Default13" })
ItemRackUser.Sets.Initiator = { equip={} }
ItemRackUser.CurrentSet = "Initiator"
ItemRack.PendingSpecSet = {
  setname="Initiator", latestManualSet="DeletedSet", spec=2, expiresAt=now-1,
}
ItemRack.LastLastSpec = 1
currentSpec = 2
ItemRack.ProcessSpecializationEvent()
check(ItemRack.PendingSpecSet == nil and ItemRackEvents.Destination.Active,
  "an expired or deleted manual override must fall back to the destination default")

-- Changing course to a different specialization consumes the stale request
-- and evaluates that specialization normally.
reset()
ItemRackUser.Sets.Initiator = { equip={} }
ItemRackUser.CurrentSet = "Initiator"
ItemRack.PendingSpecSet = { setname="Initiator", spec=2, expiresAt=now+15 }
ItemRack.LastLastSpec = 1
currentSpec = 3
ItemRack.ProcessSpecializationEvent()
check(ItemRack.PendingSpecSet == nil,
  "a transition to an unexpected specialization must consume the stale request")

print(string.format("[EVENT PROCESSORS LUA] %d deterministic processor checks passed.",checks))
`, 'event-processors');
