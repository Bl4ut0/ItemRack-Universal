const fs = require('fs');
const { runLua, extractFunction } = require('./lib/lua_harness');

const policy = fs.readFileSync('ItemRack/ItemRackQueuePolicy.lua', 'utf8');
const cleanupEvents = extractFunction('ItemRack/ItemRackEvents.lua', 'ItemRack.CleanupEvents');

runLua(String.raw`
ItemRack = {}
${policy}
${cleanupEvents}
local cleanup = ItemRack.CleanupEvents
local QueuePolicy = ItemRack.QueuePolicy

local checks = 0
local function check(value,message) assert(value,message); checks = checks + 1 end
local function baseUser()
  return {
    CurrentQueueSet=nil,
    QueueSets={},
    Events={ Set={}, QueueSet={} },
    Sets={ Geared={ Queues={ [13]={ { id="100" } } }, QueuesEnabled={ [13]=true } } },
  }
end

do
  local user = baseUser()
  local created = QueuePolicy.CreateQueueSet(user,"Mount")
  check(type(created) == "table" and type(created.Queues) == "table" and
    type(created.QueuesEnabled) == "table" and user.QueueSets.Mount == created,
    "CreateQueueSet must register an empty queue-set")
  local again = QueuePolicy.CreateQueueSet(user,"Mount")
  check(again == created, "CreateQueueSet must be idempotent for an existing name")
  check(QueuePolicy.CreateQueueSet(user,"") == nil and QueuePolicy.CreateQueueSet(user,nil) == nil,
    "CreateQueueSet must reject empty or missing names")
end

do
  local user = baseUser()
  check(QueuePolicy.CopySetQueues(user,"Geared","Mount") == true,
    "CopySetQueues must succeed for an existing set")
  check(user.QueueSets.Mount.Queues[13][1].id == "100" and
    user.QueueSets.Mount.Queues[13] ~= user.Sets.Geared.Queues[13] and
    user.QueueSets.Mount.QueuesEnabled[13] == true,
    "CopySetQueues must deep-copy the set's queues without sharing tables")
  check(QueuePolicy.CopySetQueues(user,"Missing","Mount") == false,
    "CopySetQueues must reject a missing source set")
end

do
  local user = baseUser()
  QueuePolicy.CreateQueueSet(user,"Mount")
  check(QueuePolicy.SelectQueueSet(user,"Mount") == true and user.CurrentQueueSet == "Mount",
    "SelectQueueSet must set the manual pointer")
  check(QueuePolicy.SelectQueueSet(user,"Ghost") == false and user.CurrentQueueSet == "Mount",
    "SelectQueueSet must reject an unknown queue-set and keep the prior selection")
  check(QueuePolicy.SelectQueueSet(user,nil) == true and user.CurrentQueueSet == nil,
    "SelectQueueSet(nil) must clear the manual pointer")
end

do
  local user = baseUser()
  QueuePolicy.CreateQueueSet(user,"Mount")
  check(QueuePolicy.SetEventQueueSet(user,"Mounted","Mount") == true and
    user.Events.QueueSet.Mounted == "Mount",
    "SetEventQueueSet must bind an event to a queue-set")
  check(QueuePolicy.SetEventQueueSet(user,"Mounted",nil) == true and
    user.Events.QueueSet.Mounted == nil,
    "SetEventQueueSet(nil) must clear an event binding")
  check(QueuePolicy.SetEventQueueSet(user,"Mounted","Ghost") == false,
    "SetEventQueueSet must reject an unknown queue-set")
end

do
  local user = baseUser()
  QueuePolicy.CreateQueueSet(user,"Mount")
  QueuePolicy.SelectQueueSet(user,"Mount")
  QueuePolicy.SetEventQueueSet(user,"Mounted","Mount")
  check(QueuePolicy.DeleteQueueSet(user,"Mount") == true and user.QueueSets.Mount == nil,
    "DeleteQueueSet must remove the queue-set")
  check(user.CurrentQueueSet == nil and user.Events.QueueSet.Mounted == nil,
    "DeleteQueueSet must clear the manual pointer and every event binding")
  check(QueuePolicy.DeleteQueueSet(user,"Mount") == false,
    "DeleteQueueSet must report false for an unknown queue-set")
end

do
  local user = baseUser()
  QueuePolicy.CreateQueueSet(user,"Mount")
  QueuePolicy.SelectQueueSet(user,"Mount")
  QueuePolicy.SetEventQueueSet(user,"Mounted","Mount")
  check(QueuePolicy.RenameQueueSet(user,"Mount","Flying") == true and
    user.QueueSets.Flying ~= nil and user.QueueSets.Mount == nil,
    "RenameQueueSet must move the queue-set data")
  check(user.CurrentQueueSet == "Flying" and user.Events.QueueSet.Mounted == "Flying",
    "RenameQueueSet must re-point the manual pointer and event bindings")
  QueuePolicy.CreateQueueSet(user,"Taken")
  check(QueuePolicy.RenameQueueSet(user,"Flying","Taken") == false and
    user.QueueSets.Flying ~= nil,
    "RenameQueueSet must refuse to overwrite an existing name")
end

do
  ItemRackUser = {
    QueueSets={ Mount={ Queues={}, QueuesEnabled={} } },
    Events={
      Set={ Mounted="Set", Gone="Set" },
      Enabled={ Mounted=true },
      QueueSet={ Mounted="Mount", Gone="Mount", Stale="Vanished" },
    },
    Sets={ Set={ equip={} } },
  }
  ItemRackEvents = { Mounted={}, Stale={} }
  cleanup()
  check(ItemRackUser.Events.QueueSet.Mounted == "Mount",
    "CleanupEvents must keep a mapping whose event and queue-set both exist")
  check(ItemRackUser.Events.QueueSet.Gone == nil,
    "CleanupEvents must drop a queue-set mapping for a deleted event")
  check(ItemRackUser.Events.QueueSet.Stale == nil,
    "CleanupEvents must drop a mapping whose queue-set no longer exists")
end

print(string.format("[QUEUE SETS LUA] %d management checks passed.",checks))
`, 'queue-sets');
