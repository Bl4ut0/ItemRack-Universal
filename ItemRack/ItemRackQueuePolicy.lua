-- ItemRackQueuePolicy.lua
--
-- Pure, atomic queue-context resolution. A slot's owner, list, and enabled
-- state always come from one layer. An explicit equipment slot is a policy
-- boundary even when that set has no queue, preventing a lower event/global
-- queue from replacing gear owned by the higher layer.

ItemRack.QueuePolicy = ItemRack.QueuePolicy or {}
local QueuePolicy = ItemRack.QueuePolicy

local function HasBoundary(setData,slot)
	return setData and (
		(setData.Queues and setData.Queues[slot] ~= nil) or
		(setData.QueuesEnabled and setData.QueuesEnabled[slot] ~= nil) or
		(setData.equip and setData.equip[slot] ~= nil)
	)
end

local function FromSet(setName,setData,slot,reason)
	local list = setData.Queues and setData.Queues[slot]
	local enabled = setData.QueuesEnabled and setData.QueuesEnabled[slot]
	return {
		owner = setName,
		list = list,
		enabled = enabled,
		reason = reason,
	}
end

local function FromGlobal(user,slot,reason)
	local list = user.Queues and user.Queues[slot]
	local enabled = user.QueuesEnabled and user.QueuesEnabled[slot]
	return {
		owner = false,
		list = list,
		enabled = enabled,
		reason = reason,
	}
end

local function FromQueueSet(queueSetName,queueSet,slot,reason)
	return {
		owner = "queueset:"..queueSetName,
		list = queueSet.Queues and queueSet.Queues[slot],
		enabled = queueSet.QueuesEnabled and queueSet.QueuesEnabled[slot],
		reason = reason,
	}
end

-- Active queue-set layer: a manual selection outranks the event stack, mirroring
-- how CurrentSet outranks event sets for equipment. Returns nil when queue-sets
-- are disabled or none active defines this slot.
local function ResolveQueueSet(user,getEventQueueSet,slot)
	if user.EnableQueueSets ~= "ON" or type(user.QueueSets) ~= "table" then
		return nil
	end
	local manualName = user.CurrentQueueSet
	local manual = manualName and user.QueueSets[manualName]
	if manual and HasBoundary(manual,slot) then
		return FromQueueSet(manualName,manual,slot,"manual_queue_set")
	end
	local seen = {}
	if manualName then seen[manualName] = true end
	local stack = user.EventStack
	for index=#(stack or {}),1,-1 do
		local eventName = stack[index]
		local queueSetName
		if getEventQueueSet then queueSetName = getEventQueueSet(eventName) end
		if not queueSetName and user.Events and user.Events.QueueSet then
			queueSetName = user.Events.QueueSet[eventName]
		end
		if queueSetName and not seen[queueSetName] then
			seen[queueSetName] = true
			local queueSet = user.QueueSets[queueSetName]
			if queueSet and HasBoundary(queueSet,slot) then
				return FromQueueSet(queueSetName,queueSet,slot,"event_queue_set")
			end
		end
	end
	return nil
end

function QueuePolicy.Resolve(user,getEventSet,slot,explicitSetName,getEventQueueSet)
	if type(user) ~= "table" or type(slot) ~= "number" then
		return { owner=false, reason="invalid_context" }
	end
	if user.EnablePerSetQueues ~= "ON" then
		if not explicitSetName then
			local queueSetContext = ResolveQueueSet(user,getEventQueueSet,slot)
			if queueSetContext then return queueSetContext end
		end
		return FromGlobal(user,slot,"per_set_disabled")
	end

	local targetSetName = explicitSetName or user.CurrentSet
	local targetSet = targetSetName and user.Sets and user.Sets[targetSetName]
	if explicitSetName then
		if targetSet then
			local context = FromSet(targetSetName,targetSet,slot,"explicit_set")
			if not HasBoundary(targetSet,slot) then context.owner = false end
			return context
		end
		return FromGlobal(user,slot,"missing_explicit_set")
	end

	if targetSet then
		if HasBoundary(targetSet,slot) then
			return FromSet(targetSetName,targetSet,slot,"current_set")
		end
		if user.EnableQueueContextCheck ~= "ON" then
			local context = FromSet(targetSetName,targetSet,slot,"context_inheritance_disabled")
			context.owner = false
			return context
		end
	elseif user.EnableQueueContextCheck ~= "ON" then
		return FromGlobal(user,slot,"no_current_set")
	end

	local seen = {}
	if targetSetName then seen[targetSetName] = true end
	local stack = user.EventStack
	for index=#(stack or {}),1,-1 do
		local eventName = stack[index]
		local eventSetName
		if getEventSet then eventSetName = getEventSet(eventName) end
		if not eventSetName and user.Events and user.Events.Set then
			eventSetName = user.Events.Set[eventName]
		end
		if eventSetName and not seen[eventSetName] then
			seen[eventSetName] = true
			local eventSet = user.Sets and user.Sets[eventSetName]
			if HasBoundary(eventSet,slot) then
				return FromSet(eventSetName,eventSet,slot,"event_stack")
			end
		end
	end

	local queueSetContext = ResolveQueueSet(user,getEventQueueSet,slot)
	if queueSetContext then return queueSetContext end

	return FromGlobal(user,slot,"global_fallback")
end

local function DeepCopy(value)
	if type(value) ~= "table" then return value end
	local copy = {}
	for key,item in pairs(value) do
		copy[key] = DeepCopy(item)
	end
	return copy
end

-- Pure queue-set management. Each operation mutates only the passed user table so
-- it stays testable in the production-Lua harness; thin ItemRack wrappers bind
-- ItemRackUser and refresh UI where needed.
function QueuePolicy.CreateQueueSet(user,name)
	if type(user) ~= "table" or type(name) ~= "string" or name == "" then return nil end
	user.QueueSets = user.QueueSets or {}
	if not user.QueueSets[name] then
		user.QueueSets[name] = { Queues={}, QueuesEnabled={} }
	end
	return user.QueueSets[name]
end

function QueuePolicy.ClearQueueSetReferences(user,name)
	if type(user) ~= "table" or type(name) ~= "string" then return end
	if user.CurrentQueueSet == name then user.CurrentQueueSet = nil end
	if type(user.Events) == "table" and type(user.Events.QueueSet) == "table" then
		for eventName,queueSetName in pairs(user.Events.QueueSet) do
			if queueSetName == name then user.Events.QueueSet[eventName] = nil end
		end
	end
end

function QueuePolicy.DeleteQueueSet(user,name)
	if type(user) ~= "table" or type(name) ~= "string" then return false end
	if not (user.QueueSets and user.QueueSets[name]) then return false end
	user.QueueSets[name] = nil
	QueuePolicy.ClearQueueSetReferences(user,name)
	return true
end

function QueuePolicy.RenameQueueSet(user,oldName,newName)
	if type(user) ~= "table" or type(oldName) ~= "string" or type(newName) ~= "string"
	or newName == "" or oldName == newName then return false end
	if not (user.QueueSets and user.QueueSets[oldName]) or user.QueueSets[newName] then
		return false
	end
	user.QueueSets[newName] = user.QueueSets[oldName]
	user.QueueSets[oldName] = nil
	if user.CurrentQueueSet == oldName then user.CurrentQueueSet = newName end
	if type(user.Events) == "table" and type(user.Events.QueueSet) == "table" then
		for eventName,queueSetName in pairs(user.Events.QueueSet) do
			if queueSetName == oldName then user.Events.QueueSet[eventName] = newName end
		end
	end
	return true
end

function QueuePolicy.CopySetQueues(user,setName,queueSetName)
	if type(user) ~= "table" or type(setName) ~= "string" or type(queueSetName) ~= "string"
	or queueSetName == "" then return false end
	local set = user.Sets and user.Sets[setName]
	if type(set) ~= "table" then return false end
	user.QueueSets = user.QueueSets or {}
	user.QueueSets[queueSetName] = {
		Queues = DeepCopy(set.Queues) or {},
		QueuesEnabled = DeepCopy(set.QueuesEnabled) or {},
	}
	return true
end

function QueuePolicy.SelectQueueSet(user,name)
	if type(user) ~= "table" then return false end
	if name == nil then
		user.CurrentQueueSet = nil
		return true
	end
	if type(name) ~= "string" or not (user.QueueSets and user.QueueSets[name]) then
		return false
	end
	user.CurrentQueueSet = name
	return true
end

function QueuePolicy.SetEventQueueSet(user,eventName,name)
	if type(user) ~= "table" or type(eventName) ~= "string" then return false end
	user.Events = user.Events or {}
	user.Events.QueueSet = user.Events.QueueSet or {}
	if name == nil then
		user.Events.QueueSet[eventName] = nil
		return true
	end
	if type(name) ~= "string" or not (user.QueueSets and user.QueueSets[name]) then
		return false
	end
	user.Events.QueueSet[eventName] = name
	return true
end
