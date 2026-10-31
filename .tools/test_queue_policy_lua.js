const fs = require('fs');
const { runLua } = require('./lib/lua_harness');

const policy = fs.readFileSync('ItemRack/ItemRackQueuePolicy.lua', 'utf8');

runLua(String.raw`
ItemRack = {}
${policy}

local checks = 0
local function check(value,message) assert(value,message); checks = checks + 1 end
local function resolve(user,slot,setname)
  return ItemRack.QueuePolicy.Resolve(user,function(eventName)
    return user.Events and user.Events.Set and user.Events.Set[eventName]
  end,slot,setname,function(eventName)
    return user.Events and user.Events.QueueSet and user.Events.QueueSet[eventName]
  end)
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
  user.EnableQueueSets = "ON"
  user.Sets.Current.Queues = { [13]={ { id="Current" } } }
  user.Sets.Current.QueuesEnabled = { [13]=true }
  user.CurrentQueueSet = "QS"
  user.QueueSets = { QS={ Queues={ [13]={ { id="QueueSet" } } }, QueuesEnabled={ [13]=true } } }
  local context = resolve(user,13)
  check(context.owner == "Current" and context.list[1].id == "Current",
    "an in-set boundary must win over an active queue-set")
end

do
  local user = baseUser()
  user.EnableQueueSets = "ON"
  user.CurrentQueueSet = "QS"
  user.QueueSets = { QS={ Queues={ [13]={ { id="QueueSet" } } }, QueuesEnabled={ [13]=true } } }
  local context = resolve(user,13)
  check(context.owner == "queueset:QS" and context.list[1].id == "QueueSet"
    and context.enabled == true and context.reason == "manual_queue_set",
    "a manual queue-set must supply the slot when no set boundary owns it")
end

do
  local user = baseUser()
  user.EnableQueueSets = "ON"
  user.CurrentQueueSet = "Manual"
  user.Events.QueueSet = { Upper="EventQS" }
  user.QueueSets = {
    Manual={ Queues={ [13]={ { id="ManualPick" } } }, QueuesEnabled={ [13]=true } },
    EventQS={ Queues={ [13]={ { id="EventPick" } } }, QueuesEnabled={ [13]=true } },
  }
  local context = resolve(user,13)
  check(context.owner == "queueset:Manual" and context.list[1].id == "ManualPick",
    "a manual queue-set must outrank an event-mapped queue-set")
end

do
  local user = baseUser()
  user.EnableQueueSets = "ON"
  user.Events.QueueSet = { Lower="LowerQS", Upper="UpperQS" }
  user.QueueSets = {
    LowerQS={ Queues={ [13]={ { id="Lower" } } }, QueuesEnabled={ [13]=true } },
    UpperQS={ Queues={ [13]={ { id="Upper" } } }, QueuesEnabled={ [13]=true } },
  }
  local context = resolve(user,13)
  check(context.owner == "queueset:UpperQS" and context.list[1].id == "Upper"
    and context.reason == "event_queue_set",
    "the top event-stack queue-set must win when no manual selection is active")
end

do
  local user = baseUser()
  user.EnableQueueSets = "OFF"
  user.CurrentQueueSet = "QS"
  user.QueueSets = { QS={ Queues={ [13]={ { id="QueueSet" } } }, QueuesEnabled={ [13]=true } } }
  local context = resolve(user,13)
  check(context.owner == false and context.list[1].id == "Global",
    "a disabled queue-set layer must fall through to the global tuple")
end

do
  local user = baseUser()
  user.EnableQueueSets = "ON"
  user.CurrentQueueSet = "QS"
  user.QueueSets = { QS={ Queues={ [14]={ { id="Other" } } }, QueuesEnabled={ [14]=true } } }
  local context = resolve(user,13)
  check(context.owner == false and context.list[1].id == "Global",
    "a queue-set that does not define the slot must fall through to global")
end

do
  local user = baseUser()
  user.EnablePerSetQueues = "OFF"
  user.EnableQueueSets = "ON"
  user.CurrentQueueSet = "QS"
  user.QueueSets = { QS={ Queues={ [13]={ { id="QueueSet" } } }, QueuesEnabled={ [13]=true } } }
  local context = resolve(user,13)
  check(context.owner == "queueset:QS" and context.list[1].id == "QueueSet",
    "queue-sets must layer above global even when per-set equipment queues are off")
end

do
  local user = baseUser()
  user.EnableQueueSets = "ON"
  user.CurrentQueueSet = "QS"
  user.QueueSets = { QS={ Queues={ [13]={ { id="QueueSet" } } }, QueuesEnabled={ [13]=true } } }
  local context = resolve(user,13,"Current")
  check(context.owner == false and context.list == nil and context.enabled == nil,
    "explicit set inspection must stay raw and never surface a queue-set")
end

print(string.format("[QUEUE POLICY LUA] %d atomic resolution checks passed.",checks))
`, 'queue-policy');
