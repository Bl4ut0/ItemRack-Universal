-- ItemRackQueuePolicy.lua
--
-- Pure, atomic queue-context resolution. A slot's owner, list, and enabled
-- state always come from one layer. An explicit equipment slot is a policy
-- boundary even when that set has no queue, preventing a lower event/global
-- queue from replacing gear owned by the higher layer.
--
-- Sets can also mirror/sync a slot's queue from another set via setData.QueueSync[slot].

ItemRack.QueuePolicy = ItemRack.QueuePolicy or {}
local QueuePolicy = ItemRack.QueuePolicy

local function HasBoundary(setData,slot)
	return setData and (
		(setData.Queues and setData.Queues[slot] ~= nil) or
		(setData.QueuesEnabled and setData.QueuesEnabled[slot] ~= nil) or
		(setData.equip and setData.equip[slot] ~= nil) or
		(setData.QueueSync and setData.QueueSync[slot] ~= nil)
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

local function ResolveSetQueue(user,initialSetName,initialSet,slot)
	local resolvedName = initialSetName
	local resolvedSet = initialSet
	local isMirrored = false
	if initialSet and initialSet.QueueSync and initialSet.QueueSync[slot] then
		local visited = { [initialSetName] = true }
		local curName = initialSet.QueueSync[slot]
		while curName and user.Sets and user.Sets[curName] do
			if visited[curName] then
				-- Cycle detected! Abort mirroring and safely fall back to the initial set's own queue.
				return initialSetName, initialSet, false
			end
			visited[curName] = true
			resolvedName = curName
			resolvedSet = user.Sets[curName]
			isMirrored = true
			if resolvedSet.QueueSync and resolvedSet.QueueSync[slot] then
				curName = resolvedSet.QueueSync[slot]
			else
				break
			end
		end
	end
	return resolvedName, resolvedSet, isMirrored
end

local function CopyQueueValue(value,seen)
	if type(value) ~= "table" then return value end
	seen = seen or {}
	if seen[value] then return seen[value] end
	local copy = {}
	seen[value] = copy
	for key,entry in pairs(value) do copy[CopyQueueValue(key,seen)] = CopyQueueValue(entry,seen) end
	return copy
end

-- Snapshot the resolved tuple, not a possibly stale intermediate mirror.
-- This also works while per-set queues are disabled, for safe set deletion.
function QueuePolicy.SnapshotSetSlot(user,setName,slot)
	local set = user.Sets and user.Sets[setName]
	if not set then return end
	local _,resolved = ResolveSetQueue(user,setName,set,slot)
	return { list=CopyQueueValue(resolved.Queues and resolved.Queues[slot]),
		enabled=resolved.QueuesEnabled and resolved.QueuesEnabled[slot] }
end

function QueuePolicy.DetachSetSlot(user,setName,slot,snapshot)
	local set = user.Sets and user.Sets[setName]
	if not set or not set.QueueSync or not set.QueueSync[slot] then return false end
	snapshot = snapshot or QueuePolicy.SnapshotSetSlot(user,setName,slot)
	set.Queues = set.Queues or {}
	set.QueuesEnabled = set.QueuesEnabled or {}
	-- Retain an explicit empty boundary instead of falling through to an
	-- unrelated event/global queue when the provider had no list.
	set.Queues[slot] = CopyQueueValue(snapshot.list) or {}
	set.QueuesEnabled[slot] = snapshot.enabled
	set.QueueSync[slot] = nil
	return true
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

function QueuePolicy.Resolve(user,getEventSet,slot,explicitSetName)
	if type(user) ~= "table" or type(slot) ~= "number" then
		return { owner=false, reason="invalid_context" }
	end
	if user.EnablePerSetQueues ~= "ON" then
		return FromGlobal(user,slot,"per_set_disabled")
	end

	local targetSetName = explicitSetName or user.CurrentSet
	local targetSet = targetSetName and user.Sets and user.Sets[targetSetName]
	if explicitSetName then
		if targetSet then
			local resolvedName, resolvedSet, isMirrored = ResolveSetQueue(user,targetSetName,targetSet,slot)
			local context = FromSet(resolvedName,resolvedSet,slot,"explicit_set")
			if not HasBoundary(targetSet,slot) and not HasBoundary(resolvedSet,slot) then context.owner = false end
			if isMirrored then context.mirroredFrom = resolvedName end
			return context
		end
		return FromGlobal(user,slot,"missing_explicit_set")
	end

	if targetSet then
		local resolvedName, resolvedSet, isMirrored = ResolveSetQueue(user,targetSetName,targetSet,slot)
		if HasBoundary(targetSet,slot) or HasBoundary(resolvedSet,slot) then
			local context = FromSet(resolvedName,resolvedSet,slot,"current_set")
			if isMirrored then context.mirroredFrom = resolvedName end
			return context
		end
		if user.EnableQueueContextCheck ~= "ON" then
			local context = FromSet(resolvedName,resolvedSet,slot,"context_inheritance_disabled")
			context.owner = false
			if isMirrored then context.mirroredFrom = resolvedName end
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
			if eventSet then
				local resolvedName, resolvedSet, isMirrored = ResolveSetQueue(user,eventSetName,eventSet,slot)
				if HasBoundary(eventSet,slot) or HasBoundary(resolvedSet,slot) then
					local context = FromSet(resolvedName,resolvedSet,slot,"event_stack")
					if isMirrored then context.mirroredFrom = resolvedName end
					return context
				end
			end
		end
	end

	return FromGlobal(user,slot,"global_fallback")
end

function ItemRack.GetQueueSlotSyncTarget(slot, setname, user)
	user = user or ItemRackUser
	if not user or user.EnablePerSetQueues ~= "ON" or type(slot) ~= "number" then return nil end
	local setName = setname or user.CurrentSet
	local set = setName and user.Sets and user.Sets[setName]
	if set and set.QueueSync and set.QueueSync[slot] then
		local master = set.QueueSync[slot]
		if master ~= setName and user.Sets and user.Sets[master] then
			return master
		end
	end
	return nil
end

function ItemRack.IsQueueSlotSynced(slot, setname, user)
	return ItemRack.GetQueueSlotSyncTarget(slot, setname, user) ~= nil
end
