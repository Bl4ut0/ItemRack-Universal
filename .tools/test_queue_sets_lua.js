const fs = require('fs');
const { runLua, extractFunction } = require('./lib/lua_harness');

const policy = fs.readFileSync('ItemRack/ItemRackQueuePolicy.lua', 'utf8');
const cleanupEvents = extractFunction('ItemRack/ItemRackEvents.lua', 'ItemRack.CleanupEvents');
const slashHandler = extractFunction('ItemRack/ItemRack.lua', 'ItemRack.SlashHandler');
const buildSources = extractFunction('ItemRackOptions/ItemRackOptions.lua', 'ItemRackOpt.BuildQueueSourceList');
const resolveSource = extractFunction('ItemRackOptions/ItemRackOptions.lua', 'ItemRackOpt.ResolveQueueSource');

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

do
  local calls = {}
  ItemRack.Print = function(msg) table.insert(calls,msg) end
  ItemRack.SelectQueueSet = function(name) table.insert(calls,{ select=name == nil and "<nil>" or name }); return name == nil or name == "Mount" end
  ItemRack.SetEventQueueSet = function(eventName,name) table.insert(calls,{ event=eventName, queueset=name }); return true end
  ItemRackUser = { QueueSets={ Mount={} } }
  ${slashHandler}

  calls = {}
  ItemRack.SlashHandler("queueset Mount")
  check(calls[1] and calls[1].select == "Mount",
    "queueset <name> must select that queue-set with original casing")

  calls = {}
  ItemRack.SlashHandler("queueset off")
  check(calls[1] and calls[1].select == "<nil>",
    "queueset off must clear the manual selection")

  calls = {}
  ItemRack.SlashHandler("queueset event Mounted => Mount")
  check(calls[1] and calls[1].event == "Mounted" and calls[1].queueset == "Mount",
    "queueset event eventName => name must bind the event to the queue-set")

  calls = {}
  ItemRack.SlashHandler("queueset list")
  local listed = false
  for _,msg in ipairs(calls) do if msg == "  Mount" then listed = true end end
  check(listed, "queueset list must print configured queue-set names")
end

do
  ItemRackOpt = {}
  ${buildSources}
  ${resolveSource}

  ItemRackUser = {
    EnablePerSetQueues="OFF",
    QueueSets={ Mount={}, Alpha={} },
    Sets={ Raid={}, Dungeon={}, ["~BaseGear"]={} },
  }
  local sources = ItemRackOpt.BuildQueueSourceList()
  check(sources[1].token == nil and sources[1].label == "Global Queues",
    "the source list must lead with Global Queues when per-set is off")
  check(sources[2].token == "queueset:Alpha" and sources[3].token == "queueset:Mount",
    "standalone queue-sets must be listed alphabetically before equipment sets")
  local sawRaid, sawTilde = false, false
  for _,entry in ipairs(sources) do
    if entry.token == "Raid" and entry.label == "set: Raid" then sawRaid = true end
    if entry.token == "~BaseGear" then sawTilde = true end
  end
  check(sawRaid, "each equipment set must appear as a set:<Name> source")
  check(not sawTilde, "reserved ~ sets must not appear in the source list")

  ItemRackUser.EnablePerSetQueues = "ON"
  local perSet = ItemRackOpt.BuildQueueSourceList()
  check(perSet[1].token ~= nil,
    "Global Queues must be omitted from the source list when per-set is on")

  check(ItemRackOpt.ResolveQueueSource(nil) == nil and ItemRackOpt.ResolveQueueSource("") == nil,
    "an empty source token must resolve to the active set fallback")
  check(ItemRackOpt.ResolveQueueSource("queueset:Mount") == "queueset:Mount" and
    ItemRackOpt.ResolveQueueSource("Raid") == "Raid",
    "a queue-set or set token must resolve to itself")
end

print(string.format("[QUEUE SETS LUA] %d management checks passed.",checks))
`, 'queue-sets');

const assert = require('assert');
const core = fs.readFileSync('ItemRack/ItemRack.lua', 'utf8');
let staticChecks = 0;
function staticCheck(condition, message) {
  assert.ok(condition, message);
  staticChecks += 1;
}

staticCheck(
  core.includes('"ItemRackUser.QueueSets = " .. ItemRackLogFrame.Serialize(ItemRackUser.QueueSets)'),
  'The dump must serialize ItemRackUser.QueueSets.'
);
staticCheck(
  core.includes('"ItemRackUser.CurrentQueueSet = " .. tostring(ItemRackUser.CurrentQueueSet)'),
  'The dump must report ItemRackUser.CurrentQueueSet.'
);
staticCheck(
  core.includes('"ItemRackUser.Events.QueueSet = " .. ItemRackLogFrame.Serialize(ItemRackUser.Events.QueueSet)'),
  'The dump must serialize ItemRackUser.Events.QueueSet.'
);
staticCheck(
  core.includes('{ name = "ItemRackUser.EnableQueueSets", val = ItemRackUser.EnableQueueSets }'),
  'The settings dump must include EnableQueueSets.'
);
staticCheck(
  core.includes('string.match(setname,"^queueset:(.+)")'),
  'QueueFieldProxy must route a queueset: source to ItemRackUser.QueueSets.'
);

console.log(`[QUEUE SETS STATIC] ${staticChecks} profile-export guards passed.`);
