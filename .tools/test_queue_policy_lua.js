const fs = require('fs');
const { extractFunction, runLua } = require('./lib/lua_harness');

const policy = fs.readFileSync('ItemRack/ItemRackQueuePolicy.lua', 'utf8');

runLua(String.raw`
ItemRack = {}
${policy}

local checks = 0
local function check(value,message) assert(value,message); checks = checks + 1 end
local function resolve(user,slot,setname)
  return ItemRack.QueuePolicy.Resolve(user,function(eventName)
    return user.Events and user.Events.Set and user.Events.Set[eventName]
  end,slot,setname)
end
local function baseUser()
  return {
    EnablePerSetQueues="ON",
    EnableQueueContextCheck="ON",
    CurrentSet="Current",
    Queues={ [13]={ { id="Global" } } },
    QueuesEnabled={ [13]=true },
    Events={ Set={ Lower="LowerSet", Upper="UpperSet" } },
    EventStack={ "Lower", "Upper" },
    Sets={ Current={ equip={} }, LowerSet={ equip={} }, UpperSet={ equip={} } },
  }
end

do
  local user = baseUser()
  user.EnablePerSetQueues = "OFF"
  local context = resolve(user,13)
  check(context.owner == false and context.list[1].id == "Global" and context.enabled == true,
    "disabled per-set queues must return one global tuple")
end

do
  local user = baseUser()
  user.Sets.Current.Queues = { [13]={ { id="Current" } } }
  user.Sets.Current.QueuesEnabled = { [13]=false }
  local context = resolve(user,13)
  check(context.owner == "Current" and context.list[1].id == "Current",
    "current boundary must own its whole tuple")
  check(context.enabled == false, "explicit false enabled state must not fall through")
end

do
  local user = baseUser()
  user.Sets.Current.Queues = { [13]={ { id="Current" } } }
  user.Sets.LowerSet.QueuesEnabled = { [13]=true }
  local context = resolve(user,13)
  check(context.owner == "Current" and context.list[1].id == "Current" and context.enabled == nil,
    "a list-only layer must not borrow enabled state from another owner")
end

do
  local user = baseUser()
  user.Sets.Current.QueuesEnabled = { [13]=true }
  user.Sets.UpperSet.Queues = { [13]={ { id="Upper" } } }
  local context = resolve(user,13)
  check(context.owner == "Current" and context.list == nil and context.enabled == true,
    "an enabled-only layer must not borrow a list from another owner")
end

do
  local user = baseUser()
  user.Sets.Current.equip[13] = "OwnedGear"
  user.Sets.UpperSet.Queues = { [13]={ { id="Upper" } } }
  user.Sets.UpperSet.QueuesEnabled = { [13]=true }
  local context = resolve(user,13)
  check(context.owner == "Current" and context.list == nil and context.enabled == nil,
    "explicit equipped gear must block every lower queue policy")
end

do
  local user = baseUser()
  user.Sets.LowerSet.Queues = { [13]={ { id="Lower" } } }
  user.Sets.LowerSet.QueuesEnabled = { [13]=true }
  user.Sets.UpperSet.Queues = { [13]={ { id="Upper" } } }
  local context = resolve(user,13)
  check(context.owner == "UpperSet" and context.list[1].id == "Upper" and context.enabled == nil,
    "top event boundary must supply the entire tuple without lower-field mixing")
end

do
  local user = baseUser()
  user.CurrentSet = nil
  user.Sets.UpperSet.Queues = { [13]={ { id="Upper" } } }
  user.Sets.UpperSet.QueuesEnabled = { [13]=true }
  local context = resolve(user,13)
  check(context.owner == "UpperSet" and context.reason == "event_stack",
    "event policy must remain visible when CurrentSet is temporarily unknown")
end

do
  local user = baseUser()
  local context = resolve(user,13,"LowerSet")
  check(context.owner == false and context.list == nil and context.enabled == nil,
    "explicit set inspection must be raw and must not inherit active/global fields")
  user.Sets.LowerSet.equip[13] = "Boundary"
  context = resolve(user,13,"LowerSet")
  check(context.owner == "LowerSet" and context.list == nil and context.enabled == nil,
    "explicit gear boundary must be attributed to the inspected set")
end

do
  local user = baseUser()
  local context = resolve(user,13)
  check(context.owner == false and context.list[1].id == "Global" and context.enabled == true,
    "no per-set boundary must fall back to one global tuple")
end

do
  local user = baseUser()
  user.EnableQueueContextCheck = "OFF"
  local context = resolve(user,13)
  check(context.owner == false and context.list == nil and context.enabled == nil,
    "disabled context inheritance must expose raw current-set fields, not global fields")
end

do
  local user = baseUser()
  user.Sets.MasterSet = {
    equip = {},
    Queues = { [13]={ { id="MasterTrinket" } } },
    QueuesEnabled = { [13]=true },
  }
  user.Sets.Current.QueueSync = { [13]="MasterSet" }
  local context = resolve(user,13)
  check(context.owner == "MasterSet" and context.list[1].id == "MasterTrinket" and context.enabled == true and context.mirroredFrom == "MasterSet",
    "mirrored set queue must resolve master set queue tuple and record mirroredFrom")

  -- Explicit set inspection
  local explicit = resolve(user,13,"Current")
  check(explicit.owner == "MasterSet" and explicit.list[1].id == "MasterTrinket" and explicit.enabled == true and explicit.mirroredFrom == "MasterSet",
    "explicit set inspection on mirrored set must resolve to master set")
end

do
  local user = baseUser()
  user.Sets.Master = { equip={}, Queues={ [13]={ { id="ChainMaster" } } }, QueuesEnabled={ [13]=true } }
  user.Sets.Middle = { equip={}, QueueSync={ [13]="Master" } }
  user.Sets.Current.QueueSync = { [13]="Middle" }
  local context = resolve(user,13)
  check(context.owner == "Master" and context.list[1].id == "ChainMaster" and context.mirroredFrom == "Master",
    "chained queue mirroring must resolve to the terminal master set")
end

do
  local user = baseUser()
  user.Sets.SetA = { equip={}, QueueSync={ [13]="SetB" }, Queues={ [13]={ { id="FallbackA" } } }, QueuesEnabled={ [13]=true } }
  user.Sets.SetB = { equip={}, QueueSync={ [13]="SetA" } }
  user.CurrentSet = "SetA"
  local context = resolve(user,13)
  check(context.owner ~= false and context.list ~= nil,
    "circular queue mirroring must safely terminate without infinite recursion")
end

do
  local user = baseUser()
  user.Sets.Current.QueueSync = { [13]="GhostSet" }
  user.Sets.Current.Queues = { [13]={ { id="LocalFallback" } } }
  user.Sets.Current.QueuesEnabled = { [13]=true }
  local context = resolve(user,13)
  check(context.owner == "Current" and context.list[1].id == "LocalFallback",
    "missing master set must fall back safely to local set queue")
end

print(string.format("[QUEUE POLICY LUA] %d atomic resolution checks passed.",checks))
`, 'queue-policy');

// #33 November 12 clarification: Alt-click is on the docked slot button.
runLua(String.raw`
ItemRack={}
${policy}
ItemRackUser={EnablePerSetQueues='ON',CurrentSet='Follower',Sets={
 Follower={equip={},QueueSync={[13]='Master'},Queues={[13]={{id='111'}}},QueuesEnabled={[13]=true}},
 Master={equip={},Queues={[13]={{id='222'}}},QueuesEnabled={[13]=true}}
}}
ItemRackSettings={DisableAltClick='OFF'}
local notices,updates={},0
ItemRack.Print=function(message) notices[#notices+1]=message end
ItemRack.UpdateCombatQueue=function() updates=updates+1 end
ItemRack.CombatQueue={[13]='pending'}
function IsAltKeyDown() return true end
${['ItemRack.GetQueueContext','QueueFieldProxy','ItemRack.GetQueues','ItemRack.GetQueuesEnabled'].map(n=>extractFunction('ItemRack/ItemRack.lua',n)).join('\n')}
${extractFunction('ItemRack/ItemRackButtons.lua','ItemRack.ButtonPreClick')}
local button={GetID=function() return 13 end}
for i=1,3 do ItemRack.ButtonPreClick(button,'LeftButton') end
assert(ItemRackUser.Sets.Follower.QueuesEnabled[13]==true and ItemRack.GetQueuesEnabled()[13]==true,
 'issue-33-synced-alt-click: refuse ineffective follower writes rather than silently changing dormant settings')
assert(#notices==3 and notices[1]:find('Master'),'synced clicks must identify the master in feedback')
assert(updates==0 and ItemRack.CombatQueue[13]=='pending','synced refusal must not change pending work')
ItemRackUser.Sets.Follower.QueueSync[13]=nil
ItemRack.ButtonPreClick(button,'LeftButton')
assert(ItemRack.GetQueuesEnabled()[13]==false and notices[#notices]:find('OFF'),
 'ordinary Alt-click must turn off and show immediate feedback even with a pending overlay')
ItemRack.ButtonPreClick(button,'LeftButton')
assert(ItemRack.GetQueuesEnabled()[13]==true and notices[#notices]:find('ON'), 'ordinary Alt-click must turn on')
assert(ItemRackUser.Sets.Master.QueuesEnabled[13]==true and ItemRack.CombatQueue[13]=='pending',
 'slot toggling must not modify the master or cancel a pending manual request')
print('[QUEUE ALT-CLICK LUA] Mirrored refusal, ordinary toggles and pending feedback passed.')
`, 'issue-33-synced-alt-click');

runLua(String.raw`
ItemRack={}
${policy}
ItemRackUser={EnablePerSetQueues='ON',CurrentSet='Follower',Sets={
 Follower={equip={},QueueSync={[13]='Middle'},Queues={[13]={{id='staleA'}}},QueuesEnabled={[13]=true}},
 Middle={equip={},QueueSync={[13]='Master'},Queues={[13]={{id='staleB'}}},QueuesEnabled={[13]=true}},
 Master={equip={},Queues={[13]={{id='live',customIcon=123,metadata={future='preserve'}},{id=0}}},QueuesEnabled={[13]=false}}
}}
ItemRack.GetQueueContext=function(slot,name) return ItemRack.QueuePolicy.Resolve(ItemRackUser,nil,slot,name) end
ItemRackOpt={SetupQueue=function() end,PopulateSetList=function() end,PopulateEventList=function() end}
${extractFunction('ItemRackOptions/ItemRackOptions.lua','ItemRackOpt.ClearQueueSlotSync')}
${extractFunction('ItemRackOptions/ItemRackOptions.lua','ItemRackOpt.DeleteSet')}
local function checkSnapshot()
 local set=ItemRackUser.Sets.Follower
 assert(set.Queues[13][1].id=='live' and set.Queues[13][2].id==0 and set.QueuesEnabled[13]==false,
  'chained-mirror-detach: preserve the effective terminal list, stop marker and disabled state')
 assert(set.Queues[13][1].metadata.future=='preserve','preserve unknown nested entry fields')
 set.Queues[13][1].metadata.future='local'
 assert(ItemRackUser.Sets.Master.Queues[13][1].metadata.future=='preserve','detached metadata must be independent')
end
ItemRackOpt.ClearQueueSlotSync(13,'Follower')
checkSnapshot()
-- Deleting an intermediate provider must preserve what its followers see.
ItemRackUser.Sets.Follower.QueueSync[13]='Middle'
ItemRackOptSetsName={GetText=function() return 'Middle' end}
function InCombatLockdown() return false end
ItemRack.GetSetBindingButtonName=function() return 'test-binding' end
ItemRack.ClearBindingAction=function() return true end
ItemRack.CleanupEvents=function() end
ItemRack.UpdateCurrentSet=function() end
ItemRack.FireItemRackEvent=function() end
ItemRackOpt.DeleteSet()
assert(ItemRackUser.Sets.Middle==nil and ItemRackUser.Sets.Follower.QueueSync[13]==nil,
 'master deletion must remove only the requested set and decouple direct followers')
checkSnapshot()
-- A nil terminal tuple must not revive the follower's stale local queue.
ItemRackUser.Sets.Empty={equip={}}
ItemRackUser.Sets.Follower.QueueSync[13]='Empty'
ItemRackOpt.ClearQueueSlotSync(13,'Follower')
assert(#ItemRackUser.Sets.Follower.Queues[13]==0 and ItemRackUser.Sets.Follower.QueuesEnabled[13]==nil,
 'detaching an empty master must clear dormant list and enabled fields')
ItemRackUser.EnableQueueContextCheck='ON'
ItemRackUser.Queues={[13]={{id='unrelated-global'}}}
ItemRackUser.QueuesEnabled={[13]=true}
assert(ItemRack.GetQueueContext(13).owner=='Follower' and #ItemRack.GetQueueContext(13).list==0,
 'empty detachment must not fall through to an unrelated global queue')
assert(ItemRackUser.CurrentSet=='Follower','detaching queues must not equip or select another set')
print('[QUEUE MIRROR DETACH LUA] Chained detachment, deletion and independent metadata passed.')
`, 'chained-mirror-detach');

// A possible invisible third-party overlay is not the same as a received but
// refused click. Record focus without changing anyone's scripts or mouse flags.
runLua(String.raw`
ItemRack={}
${['ItemRack.MenuDiagnosticValue','ItemRack.MenuDiagnosticCall','ItemRack.RecordButtonInput'].map(n=>extractFunction('ItemRack/ItemRack.lua',n)).join('\n')}
local parent={GetName=function() return 'OtherAddonPanel' end}
local overlay={GetName=function() return 'OtherAddonOverlay' end,
 GetParent=function() return parent end,IsShown=function() return true end,
 IsMouseEnabled=function() return true end,GetAlpha=function() return 0 end,
 GetEffectiveAlpha=function() return 0 end}
function GetMouseFoci() return {overlay} end
function IsAltKeyDown() return true end
function GetTime() return 42 end
function GetCursorPosition() return 20,30 end
assert(ItemRack.RecordButtonInput('mouse_probe'))
local report=ItemRack.ButtonInputDiagnostics
assert(report.recent[1].focus[1].name=='OtherAddonOverlay' and report.recent[1].focus[1].alpha==0,
 'button-input-focus-evidence: capture a mouse-enabled transparent focus frame')
assert(report.recent[1].focus[1].parents[1]=='OtherAddonPanel' and next(report.clicks)==nil,
 'a mouse probe is evidence of focus, not proof that ItemRack received a click')
local enabled=true
ItemRack.GetQueueContext=function() return {enabled=enabled,owner='A'} end
ItemRack.GetQueueSlotSyncTarget=function() return nil end
ItemRack.GetQueues=function() return {[13]={}} end
ItemRack.GetQueuesEnabled=function() return setmetatable({}, {__index=function() return enabled end,
 __newindex=function(_,_,v) enabled=v end}) end
ItemRack.Print=function() end
ItemRack.UpdateCombatQueue=function() end
ItemRackUser={}
ItemRackSettings={DisableAltClick='OFF'}
local button={GetID=function() return 13 end,GetName=function() return 'ItemRackButton13' end}
${extractFunction('ItemRack/ItemRackButtons.lua','ItemRack.ButtonPreClick')}
ItemRack.ButtonPreClick(button,'LeftButton')
assert(report.clicks['13'] and enabled==false and report.recent[#report.recent].source=='toggle_changed',
 'a received Alt-click must record its modifier, receipt and effective change')
assert(report.recent[#report.recent].alt==true and report.recent[#report.recent].queueEnabled==false)
-- Forbidden frames and inaccessible values must not be inspected/stringified.
GetMouseFoci=function() return {{IsForbidden=function() return true end,GetName=function() error('forbidden') end}} end
assert(ItemRack.RecordButtonInput('mouse_probe') and report.recent[#report.recent].focus[1].forbidden)
local secret=setmetatable({}, {__tostring=function() error('secret must not stringify') end})
issecretvalue=function(v) return rawequal(v,secret) end
GetMouseFoci=function() return {secret} end
assert(ItemRack.RecordButtonInput('mouse_probe') and report.recent[#report.recent].focus[1].status=='<secret>')
issecretvalue=nil
GetMouseFoci=function() return {} end
for i=1,50 do ItemRack.RecordButtonInput('hover',button) end
assert(#report.recent==16 and report.clicks['13'],'bound history while retaining the last click sequence')
GetMouseFoci=function() error('focus API unavailable') end
ItemRack.ButtonPreClick(button,'LeftButton')
assert(enabled==true,'optional focus failures must not break the real click')
print('[BUTTON INPUT LUA] Focus, received clicks, bounds and inaccessible frames passed.')
`, 'button-input-focus-evidence');
