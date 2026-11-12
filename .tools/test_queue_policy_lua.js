const fs = require('fs');
const { extractFunction, runLua } = require('./lib/lua_harness');

const policy = fs.readFileSync('ItemRack/ItemRackQueuePolicy.lua', 'utf8');

// November 12 beta9 clarification: mirror the list, not the selected set's switch.
runLua(String.raw`
ItemRack={}
${policy}
ItemRackUser={EnablePerSetQueues='ON',EnableQueueContextCheck='ON',CurrentSet='A',
 Queues={[13]={{id='global'}}},QueuesEnabled={[13]=true},Sets={
 A={equip={},QueueSync={[13]='Master'},QueuesEnabled={[13]=false}},
 B={equip={},QueueSync={[13]='Master'},QueuesEnabled={[13]=true}},
 Master={equip={},Queues={[13]={{id='100',priority=true,delay=7},{id=0}}},QueuesEnabled={[13]=true}}
}}
${['ItemRack.GetQueueContext','QueueFieldProxy','ItemRack.GetQueues','ItemRack.GetQueuesEnabled','ItemRack.GetActiveQueueOwner'].map(n=>extractFunction('ItemRack/ItemRack.lua',n)).join('\n')}
assert(ItemRack.QueuePolicy.InitializeMirroredStates(ItemRackUser)==2,
 'mirrored-initial-state: legacy mirrors must initialize from their previously effective master state')
assert(ItemRackUser.Sets.A.QueuesEnabled[13]==true and ItemRackUser.Sets.B.QueuesEnabled[13]==true,
 'initial synchronization must copy master ON, not default OFF or a dormant local flag')
ItemRackUser.Sets.A.QueuesEnabled[13]=false
local a,b=ItemRack.GetQueueContext(13,'A'),ItemRack.GetQueueContext(13,'B')
assert(a.enabled==false and b.enabled==true and a.owner=='A' and b.owner=='B',
 'mirrored-local-enablement: followers must own independent switches and runtime context')
assert(a.list==b.list and a.list==ItemRackUser.Sets.Master.Queues[13] and a.mirroredFrom=='Master',
 'both followers must read the live master list and entry policies')
ItemRackUser.Sets.Master.QueuesEnabled[13]=false
ItemRackUser.Sets.Master.Queues[13][1].delay=19
assert(ItemRack.QueuePolicy.InitializeMirroredStates(ItemRackUser)==0,
 'reinitialization must be idempotent after users choose their per-set switches')
assert(ItemRack.GetQueueContext(13,'B').enabled==true and ItemRack.GetQueueContext(13,'A').list[1].delay==19,
 'master state changes must not affect followers, while item settings remain synced')
ItemRack.GetQueuesEnabled('A')[13]=true
assert(ItemRack.GetQueuesEnabled('A')[13]==true and ItemRackUser.Sets.Master.QueuesEnabled[13]==false,
 'writing an inactive follower switch must not write the master')
ItemRackUser.Sets.Middle={equip={},QueueSync={[13]='Master'},QueuesEnabled={[13]=false}}
ItemRackUser.Sets.B.QueueSync[13]='Middle'
assert(ItemRack.GetQueueContext(13,'B').enabled==true and ItemRack.GetQueueContext(13,'B').mirroredFrom=='Master',
 'chained mirroring must ignore intermediate enablement too')
ItemRackUser.Sets.A.QueuesEnabled[13]=nil
assert(not ItemRack.GetQueueContext(13,'A').enabled,'an initialized local OFF must not resume borrowing master state')
-- New links seed from the chosen master's current switch, even if it too mirrors.
ItemRackUser.Sets.C={equip={},QueuesEnabled={[13]=false}}
ItemRackOpt={SetupQueue=function() end}
${extractFunction('ItemRackOptions/ItemRackOptions.lua','ItemRackOpt.SetQueueSlotSync')}
${extractFunction('ItemRackOptions/ItemRackOptions.lua','ItemRackOpt.ClearQueueSlotSync')}
ItemRackOpt.SetQueueSlotSync(13,'C','B')
assert(ItemRack.GetQueueContext(13,'C').enabled==true,'new follower must seed from initialized master B, not terminal Master OFF')
ItemRackUser.Sets.C.QueuesEnabled[13]=false
ItemRackOpt.SetQueueSlotSync(13,'C','Master')
assert(ItemRack.GetQueueContext(13,'C').enabled==false,'changing provider while synced must retain the user switch')
ItemRackOpt.ClearQueueSlotSync(13,'C')
ItemRackUser.Sets.Master.QueuesEnabled[13]=true
ItemRackOpt.SetQueueSlotSync(13,'C','Master')
assert(ItemRack.GetQueueContext(13,'C').enabled==true,'a new link after unsync must initialize from its new master again')
-- Event-stack inheritance chooses one set's policy; mirroring only replaces its list.
ItemRackUser.Sets.Current={equip={}}
ItemRackUser.CurrentSet='Current'; ItemRackUser.EventStack={'E'}
ItemRackUser.Events={Set={E='B'}}
assert(ItemRack.GetQueueContext(13).owner=='B' and ItemRack.GetQueueContext(13).enabled==true,
 'inherited mirrored queues must retain the event-set switch and owner')
ItemRackUser.EnablePerSetQueues='OFF'
assert(ItemRack.GetQueueContext(13).owner==false and ItemRack.GetQueueContext(13).list[1].id=='global',
 'disabling per-set queues must retain global behavior')
-- Save/reload model: rehydrate a Lua SavedVariables chunk, not shared runtime objects.
ItemRackUser.EnablePerSetQueues='ON'; ItemRackUser.CurrentSet='A'
ItemRackUser.Sets.A.QueuesEnabled[13]=false
local function serialize(v)
 if type(v)=='table' then
  local fields={}
  for k,entry in pairs(v) do fields[#fields+1]='['..serialize(k)..']='..serialize(entry) end
  return '{'..table.concat(fields,',')..'}'
 elseif type(v)=='string' then return string.format('%q',v)
 else return tostring(v) end
end
ItemRackUser=assert((loadstring or load)('return '..serialize(ItemRackUser)))()
assert(ItemRack.QueuePolicy.InitializeMirroredStates(ItemRackUser)==0,'saved initialization markers must prevent reseeding on reload')
assert(ItemRack.GetQueuesEnabled('A')[13]==false and ItemRack.GetQueuesEnabled('B')[13]==true,
 'rehydrated per-set switches must remain independent with mirroring intact')
assert(ItemRack.GetQueues('B')[13][1].delay==19 and ItemRackUser.Sets.B.QueueSync[13]=='Middle')
print('[MIRRORED LOCAL STATE LUA] Independent switches, chained policies, event context and saved chunks passed.')
`, 'mirrored-local-enablement');

runLua(String.raw`
ItemRack={CombatQueue={},RunAfterCombat={},Debug=function() end,UpdateCombatQueue=function() end,
 IsPlayerReallyDead=function() return false end,GetInfoByID=function(id) return id end,
 GetEquippedSlotState=function() return 'resolved','999' end,
 MatchesStoredItemID=function(a,b) return a==b end,MatchesStoredItemFields=function(a,b) return a==b end,
 IsQueueEntryUnambiguous=function() return true end,IsBareItemID=function() return false end}
function CursorHasItem() return false end
function InCombatLockdown() return false end
function UnitAffectingCombat() return false end
${policy}
${['ItemRack.GetQueueContext','QueueFieldProxy','ItemRack.GetQueues','ItemRack.GetQueuesEnabled','ItemRack.GetActiveQueueOwner',
 'ItemRack.ClearCombatQueueMetadata','ItemRack.AddToCombatQueue','ItemRack.ProcessCombatQueue'].map(n=>extractFunction('ItemRack/ItemRack.lua',n)).join('\n')}
${['ItemRack.FindQueueEntryIndex','ItemRack.IsManualQueueChoice','ItemRack.SetManualQueueChoice'].map(n=>extractFunction('ItemRack/ItemRackQueue.lua',n)).join('\n')}
ItemRackUser={EnablePerSetQueues='ON',CurrentSet='A',Sets={
 A={QueueSync={[13]='Master'},QueuesEnabled={[13]=true}},
 B={QueueSync={[13]='Master'},QueuesEnabled={[13]=true}},
 Master={Queues={[13]={{id='100'}}},QueuesEnabled={[13]=true}},['~CombatQueue']={equip={}}}}
local gear='999'
ItemRack.EquipSet=function(name) gear=ItemRackUser.Sets[name].equip[13] end
ItemRack.SetManualQueueChoice(13,'100')
assert(ItemRack.IsManualQueueChoice(13,'100','100'),'hold must validate in its owning follower')
ItemRack.AddToCombatQueue(13,'100',true)
ItemRackUser.CurrentSet='B'
assert(not ItemRack.IsManualQueueChoice(13,'100','100'),
 'mirrored-runtime-isolation: manual holds must not cross followers sharing the same queue list')
ItemRack.ProcessCombatQueue()
assert(gear=='999' and not next(ItemRack.CombatQueue) and not ItemRack.AutoQueueOwner[13],
 'mirrored-runtime-isolation: a stale automatic request must clear without equipping after changing followers')
ItemRack.AddToCombatQueue(13,'100',true)
ItemRackUser.Sets.B.QueuesEnabled[13]=false
ItemRack.ProcessCombatQueue()
assert(gear=='999' and not next(ItemRack.CombatQueue),'disabling a follower must discard its pending automatic request')
ItemRack.AddToCombatQueue(13,'100',false)
ItemRack.ProcessCombatQueue()
assert(gear=='100' and not next(ItemRack.CombatQueue),'a pending explicit manual request must survive queue disablement')
print('[MIRRORED RUNTIME LUA] Follower holds, stale automatic requests and explicit pending requests passed.')
`, 'mirrored-runtime-isolation');

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
  user.Sets.Current.QueuesEnabled = { [13]=false }
  local context = resolve(user,13)
  check(context.owner == "Current" and context.list[1].id == "MasterTrinket" and context.enabled == false and context.mirroredFrom == "MasterSet",
    "mirrored set queue must use the local switch and owner with the master list")

  -- Explicit set inspection
  local explicit = resolve(user,13,"Current")
  check(explicit.owner == "Current" and explicit.list[1].id == "MasterTrinket" and explicit.enabled == false and explicit.mirroredFrom == "MasterSet",
    "explicit set inspection must keep that set's local switch")
end

do
  local user = baseUser()
  user.Sets.Master = { equip={}, Queues={ [13]={ { id="ChainMaster" } } }, QueuesEnabled={ [13]=true } }
  user.Sets.Middle = { equip={}, QueueSync={ [13]="Master" } }
  user.Sets.Current.QueueSync = { [13]="Middle" }
  local context = resolve(user,13)
  check(context.owner == "Current" and context.list[1].id == "ChainMaster" and context.mirroredFrom == "Master",
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
ItemRack.DebugAll=false
ItemRack.DebugChat=false
ItemRack.DebugTags={Queue=false}
function date() return '[16:08:18]' end
${extractFunction('ItemRack/ItemRack.lua','ItemRack.Debug')}
ItemRack.UpdateCombatQueue=function() updates=updates+1 end
ItemRack.CombatQueue={[13]='pending'}
function IsAltKeyDown() return true end
${['ItemRack.GetQueueContext','QueueFieldProxy','ItemRack.GetQueues','ItemRack.GetQueuesEnabled'].map(n=>extractFunction('ItemRack/ItemRack.lua',n)).join('\n')}
${extractFunction('ItemRack/ItemRackButtons.lua','ItemRack.ButtonPreClick')}
local button={GetID=function() return 13 end}
ItemRack.ButtonPreClick(button,'LeftButton')
assert(ItemRackUser.Sets.Follower.QueuesEnabled[13]==false and ItemRack.GetQueuesEnabled()[13]==false,
 'issue-33-synced-alt-click: mirrored slot must toggle its selected set OFF')
ItemRack.ButtonPreClick(button,'LeftButton')
assert(ItemRackUser.Sets.Follower.QueuesEnabled[13]==true and ItemRack.GetQueuesEnabled()[13]==true,
 'issue-33-synced-alt-click: mirrored slot must toggle its selected set ON')
assert(#notices==0 and ItemRack.GetQueues()[13]==ItemRackUser.Sets.Master.Queues[13],
 'mirrored toggling must stay quiet and leave the master list linked')
assert(updates==2 and ItemRack.CombatQueue[13]=='pending','mirrored toggles must refresh presentation without canceling pending manual work')
ItemRackUser.Sets.Follower.QueueSync[13]=nil
ItemRack.ButtonPreClick(button,'LeftButton')
assert(ItemRack.GetQueuesEnabled()[13]==false and #notices==0,
 'reported-autoqueue-toggle-debug-only: ordinary OFF toggle must not print routine chat messages')
ItemRack.ButtonPreClick(button,'LeftButton')
assert(ItemRack.GetQueuesEnabled()[13]==true and #notices==0 and not ItemRack.LogBuffer,
 'reported-autoqueue-toggle-debug-only: ordinary ON toggle must stay silent with debug disabled')
-- Silent debug keeps diagnostic evidence without chat; explicit debug chat prints it.
ItemRack.DebugTags.Queue=true
ItemRack.ButtonPreClick(button,'LeftButton')
ItemRack.ButtonPreClick(button,'LeftButton')
assert(#notices==0 and #ItemRack.LogBuffer==2 and ItemRack.LogBuffer[1]:find('OFF') and ItemRack.LogBuffer[2]:find('ON'),
 'reported-autoqueue-toggle-debug-only: Queue debug without debug chat must only record ON/OFF in the log')
ItemRack.DebugChat=true
ItemRack.ButtonPreClick(button,'LeftButton')
assert(#notices==1 and notices[1]:find('IR%-Queue') and notices[1]:find('OFF'),
 'reported-autoqueue-toggle-debug-only: explicitly enabled debug chat must print the toggle')
ItemRack.DebugTags.Queue=false
ItemRack.ButtonPreClick(button,'LeftButton')
assert(#notices==1 and ItemRack.GetQueuesEnabled()[13]==true,
 'reported-autoqueue-toggle-debug-only: disabling Queue debug must silence its chat output again')
assert(ItemRackUser.Sets.Master.QueuesEnabled[13]==true and ItemRack.CombatQueue[13]=='pending',
 'slot toggling must not modify the master or cancel a pending manual request')
print('[QUEUE ALT-CLICK LUA] Independent mirrored/ordinary toggles and debug-only feedback passed.')
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
 assert(set.Queues[13][1].id=='live' and set.Queues[13][2].id==0 and set.QueuesEnabled[13]==true,
  'chained-mirror-detach: preserve the effective terminal list, stop marker and local enabled state')
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
assert(#ItemRackUser.Sets.Follower.Queues[13]==0 and ItemRackUser.Sets.Follower.QueuesEnabled[13]==true,
 'detaching an empty master must clear dormant list and retain the local switch')
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
ItemRack.Debug=function() end
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
