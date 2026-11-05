-- ItemRackTransaction.lua
--
-- A small, runtime-only transaction boundary around WoW's cursor-based item
-- movement API.  Pickup calls only submit a move; success is established later
-- by observing the exact source and destination identities after locks settle.

local PickupContainerItem
local GetContainerItemInfo
if C_Container then
	PickupContainerItem = C_Container.PickupContainerItem
	GetContainerItemInfo = function(bag, slot)
		local info = C_Container.GetContainerItemInfo(bag, slot)
		if info then
			return info.iconFileID, info.stackCount, info.isLocked, info.quality,
				info.isReadable, info.hasLoot, info.hyperlink, info.isFiltered,
				info.hasNoValue, info.itemID, info.isBound
		end
	end
else
	PickupContainerItem = _G.PickupContainerItem
	GetContainerItemInfo = _G.GetContainerItemInfo
end

ItemRack.TransactionSequence = ItemRack.TransactionSequence or 0
ItemRack.TransactionSettleDelay = 0.05
ItemRack.TransactionTimeout = 5

local function NormalizeLocation(bag, slot)
	return { bag = bag, slot = slot }
end

local function LocationKey(location)
	return tostring(location.bag)..":"..tostring(location.slot or "inventory")
end

local function ReadLocation(location)
	local id = ItemRack.GetID(location.bag, location.slot)
	return id or 0
end

local function SameIdentity(left, right)
	left = left or 0
	right = right or 0
	if left == 0 or right == 0 then
		return left == 0 and right == 0
	end
	return ItemRack.SameExactID(left, right)
end

local function LocationLocked(location)
	if location.slot then
		return select(3, GetContainerItemInfo(location.bag, location.slot)) and true or false
	end
	return IsInventoryItemLocked(location.bag) and true or false
end

local function LocationIsEquipmentSlot(location, slotId)
	return location and location.bag == slotId and location.slot == nil
end

local function PickupLocation(location)
	if location.slot then
		PickupContainerItem(location.bag, location.slot)
	else
		PickupInventoryItem(location.bag)
	end
end

local function SafeCallback(callback, request)
	if not callback then return end
	local ok, err = pcall(callback, request)
	if not ok then
		ItemRack.Debug("API", "Equipment transaction callback failed:", err)
	end
end

function ItemRack.HasActiveEquipmentTransaction()
	return ItemRack.ActiveEquipmentTransaction ~= nil
end

function ItemRack.NewEquipmentMove(fromBag, fromSlot, toBag, toSlot)
	return {
		from = NormalizeLocation(fromBag, fromSlot),
		to = NormalizeLocation(toBag, toSlot),
		status = "planned",
	}
end

local function FinishRequest(request, status, reason)
	if request.finished then return end
	request.finished = true
	request.status = status
	request.reason = reason
	request.finishedAt = GetTime()
	if ItemRack.ActiveEquipmentTransaction == request then
		ItemRack.ActiveEquipmentTransaction = nil
	end
	ItemRack.Debug("API", "Equipment transaction", request.id, status, reason or "")
	if status == "complete" then
		SafeCallback(request.onComplete, request)
	else
		SafeCallback(request.onFailure, request)
	end
	if ItemRack.OnEquipmentTransactionFinalized then
		SafeCallback(ItemRack.OnEquipmentTransactionFinalized, request)
	end
end

local function ScheduleObservation(request, delay)
	if request.observationScheduled or request.finished then return end
	request.observationScheduled = true
	local generation = request.generation
	C_Timer.After(delay or ItemRack.TransactionSettleDelay, function()
		request.observationScheduled = nil
		if request.finished or request.generation ~= generation
		or ItemRack.ActiveEquipmentTransaction ~= request then
			return
		end
		ItemRack.ReconcileEquipmentTransaction("timer")
	end)
end

local function PrepareSteps(request)
	local virtual = {}
	for index, step in ipairs(request.steps) do
		if not step.from or not step.to then
			return nil, "invalid_step_"..tostring(index)
		end
		local fromKey = LocationKey(step.from)
		local toKey = LocationKey(step.to)
		if fromKey == toKey then
			return nil, "same_location_"..tostring(index)
		end
		local sourceBefore = virtual[fromKey]
		if sourceBefore == nil then sourceBefore = ReadLocation(step.from) end
		local destinationBefore = virtual[toKey]
		if destinationBefore == nil then destinationBefore = ReadLocation(step.to) end
		if sourceBefore == 0 then
			return nil, "empty_source_"..tostring(index)
		end
		if step.expectedSource and not ItemRack.MatchesStoredItemID(step.expectedSource, sourceBefore) then
			return nil, "source_changed_"..tostring(index)
		end
		step.sourceBefore = sourceBefore
		step.destinationBefore = destinationBefore
		step.expectedSourceState = destinationBefore
		step.expectedDestinationState = sourceBefore
		virtual[fromKey] = destinationBefore
		virtual[toKey] = sourceBefore
	end
	return true
end

local function SubmitStep(step)
	step.status = "submitting"
	local sourceOK, sourceError = pcall(PickupLocation, step.from)
	if not sourceOK then
		step.submitError = tostring(sourceError)
		step.status = "submitted"
		step.submittedAt = GetTime()
		return false
	end

	-- Cursor ownership begins only after our source pickup.  A pre-existing user
	-- cursor is rejected above and is never cleared by this service.
	step.cursorOwned = CursorHasItem() and true or false
	if step.cursorOwned then
		local destinationOK, destinationError = pcall(PickupLocation, step.to)
		if not destinationOK then
			step.submitError = tostring(destinationError)
		end
		if CursorHasItem() then
			-- A successful swap leaves the displaced destination item on the cursor;
			-- a rejected destination leaves the original source there.  Returning it
			-- to the exact source is safe in both cases.  Observation distinguishes
			-- those outcomes later.
			local returnOK, returnError = pcall(PickupLocation, step.from)
			if not returnOK then
				step.submitError = tostring(returnError)
			end
		end
		if CursorHasItem() then
			-- This cursor was created by this synchronous submission, so ClearCursor
			-- returns it to its origin; never use this path for an inherited cursor.
			ClearCursor()
			step.cursorRecoveryRequired = true
		end
	end

	step.status = "submitted"
	step.submittedAt = GetTime()
	step.unchangedSamples = 0
	return true
end

local function SubmitCurrentStep(request)
	local step = request.steps[request.stepIndex]
	if not step then
		FinishRequest(request, request.rollbackReason and "failed_rolled_back" or "complete", request.rollbackReason)
		return
	end

	if CursorHasItem() then
		FinishRequest(request, "blocked", "cursor_occupied")
		return
	end
	if SpellIsTargeting() then
		FinishRequest(request, "blocked", "spell_targeting")
		return
	end
	if LocationLocked(step.from) or LocationLocked(step.to) then
		step.status = "blocked"
		request.status = "blocked"
		ScheduleObservation(request)
		return
	end

	local currentSource = ReadLocation(step.from)
	local currentDestination = ReadLocation(step.to)
	if not SameIdentity(currentSource, step.sourceBefore)
	or not SameIdentity(currentDestination, step.destinationBefore) then
		FinishRequest(request, "failed", "prestate_changed")
		return
	end

	local touchedAmmo = LocationIsEquipmentSlot(step.from, 0) or LocationIsEquipmentSlot(step.to, 0)
	local touchedRanged = LocationIsEquipmentSlot(step.from, 18) or LocationIsEquipmentSlot(step.to, 18)

	request.status = "submitting"
	local usedLocations = {}
	SubmitStep(step)
	usedLocations[LocationKey(step.from)] = true
	usedLocations[LocationKey(step.to)] = true

	-- Batch subsequent independent steps synchronously within the same frame
	local idx = request.stepIndex + 1
	while idx <= #request.steps do
		local nextStep = request.steps[idx]
		if nextStep.status ~= "planned" then
			break
		end
		if CursorHasItem() or SpellIsTargeting() then
			break
		end
		local fromKey = LocationKey(nextStep.from)
		local toKey = LocationKey(nextStep.to)
		if usedLocations[fromKey] or usedLocations[toKey] then
			break -- dependency on an inflight unconfirmed step
		end
		local nextTouchesAmmo = LocationIsEquipmentSlot(nextStep.from, 0) or LocationIsEquipmentSlot(nextStep.to, 0)
		local nextTouchesRanged = LocationIsEquipmentSlot(nextStep.from, 18) or LocationIsEquipmentSlot(nextStep.to, 18)
		if (touchedAmmo and nextTouchesRanged) or (touchedRanged and nextTouchesAmmo) then
			break -- slot 18 (Ranged) and slot 0 (Ammo) are co-dependent and must not be submitted in the same frame
		end
		if LocationLocked(nextStep.from) or LocationLocked(nextStep.to) then
			break -- endpoint locked
		end
		local nSource = ReadLocation(nextStep.from)
		local nDest = ReadLocation(nextStep.to)
		if not SameIdentity(nSource, nextStep.sourceBefore)
		or not SameIdentity(nDest, nextStep.destinationBefore) then
			break -- prestate changed
		end

		SubmitStep(nextStep)
		usedLocations[fromKey] = true
		usedLocations[toKey] = true
		if nextTouchesAmmo then touchedAmmo = true end
		if nextTouchesRanged then touchedRanged = true end
		idx = idx + 1
	end

	request.status = "observing"
	ScheduleObservation(request)
end

local function BeginRollback(request, reason)
	local rollback = {}
	for index = #request.steps, 1, -1 do
		local original = request.steps[index]
		if original.status == "confirmed" or (original.status == "submitted" and SameIdentity(ReadLocation(original.to), original.expectedDestinationState)) then
			table.insert(rollback, {
				from = original.to,
				to = original.from,
				status = "planned",
				expectedSource = original.expectedDestinationState,
			})
		end
	end
	if #rollback == 0 then
		FinishRequest(request, "failed", reason)
		return
	end
	request.originalSteps = request.steps
	request.steps = rollback
	request.stepIndex = 1
	request.rollbackReason = reason
	local ready, preflightReason = PrepareSteps(request)
	if not ready then
		FinishRequest(request, "partial_failure", reason..":"..tostring(preflightReason))
		return
	end
	request.status = "rolling_back"
	SubmitCurrentStep(request)
end

function ItemRack.ReconcileEquipmentTransaction(reason)
	local request = ItemRack.ActiveEquipmentTransaction
	if not request or request.finished then return false end

	while request.stepIndex <= #request.steps do
		local step = request.steps[request.stepIndex]
		if not step then break end

		if step.status == "blocked" then
			if CursorHasItem() or SpellIsTargeting() or LocationLocked(step.from) or LocationLocked(step.to) then
				if GetTime() >= request.deadline then
					FinishRequest(request, "blocked", "lock_timeout")
				else
					ScheduleObservation(request)
				end
				return false
			end
			step.status = "planned"
			SubmitCurrentStep(request)
			return true
		end

		if step.status == "planned" then
			SubmitCurrentStep(request)
			return true
		end

		if step.status ~= "submitted" then
			return false
		end

		if CursorHasItem() or LocationLocked(step.from) or LocationLocked(step.to) then
			if GetTime() >= request.deadline then
				BeginRollback(request, "settlement_timeout")
			else
				ScheduleObservation(request)
			end
			return false
		end

		local sourceState = ReadLocation(step.from)
		local destinationState = ReadLocation(step.to)
		if SameIdentity(sourceState, step.expectedSourceState)
		and SameIdentity(destinationState, step.expectedDestinationState) then
			step.status = "confirmed"
			step.confirmedAt = GetTime()
			request.stepIndex = request.stepIndex + 1
		elseif SameIdentity(sourceState, step.sourceBefore)
		and SameIdentity(destinationState, step.destinationBefore) then
			step.unchangedSamples = (step.unchangedSamples or 0) + 1
			if step.unchangedSamples >= 2
			and GetTime() - step.submittedAt >= ItemRack.TransactionSettleDelay then
				if request.rollbackReason then
					FinishRequest(request, "partial_failure", request.rollbackReason..":rollback_rejected")
				else
					BeginRollback(request, step.submitError and "api_error" or "destination_rejected")
				end
				return false
			end
			ScheduleObservation(request)
			return false
		elseif GetTime() >= request.deadline then
			if request.rollbackReason then
				FinishRequest(request, "partial_failure", request.rollbackReason..":rollback_inconsistent")
			else
				BeginRollback(request, "inconsistent_state")
			end
			return false
		else
			ScheduleObservation(request)
			return false
		end
	end

	if request.stepIndex > #request.steps then
		FinishRequest(request, request.rollbackReason and "failed_rolled_back" or "complete", request.rollbackReason)
		return true
	end
	return true
end

function ItemRack.StartEquipmentTransaction(spec)
	if ItemRack.ActiveEquipmentTransaction then
		return "blocked", nil, "transaction_active"
	end
	if not spec or type(spec.steps) ~= "table" or #spec.steps == 0 then
		return "failed", nil, "empty_request"
	end
	if CursorHasItem() then
		return "blocked", nil, "cursor_occupied"
	end
	if SpellIsTargeting() then
		return "blocked", nil, "spell_targeting"
	end

	ItemRack.TransactionSequence = ItemRack.TransactionSequence + 1
	local request = {
		id = ItemRack.TransactionSequence,
		generation = ItemRack.TransactionSequence,
		kind = spec.kind or "move",
		origin = spec.origin or "internal",
		owner = spec.owner,
		steps = spec.steps,
		stepIndex = 1,
		status = "preflight",
		createdAt = GetTime(),
		deadline = GetTime() + (spec.timeout or ItemRack.TransactionTimeout),
		disableSound = spec.disableSound,
		onComplete = spec.onComplete,
		onFailure = spec.onFailure,
	}
	local ready, preflightReason = PrepareSteps(request)
	if not ready then
		request.status = "failed"
		request.reason = preflightReason
		request.finished = true
		SafeCallback(request.onFailure, request)
		return "failed", request, preflightReason
	end

	if request.disableSound or ItemRackSettings.DisableSwapSound == "ON" then
		-- Sound muting is optional and must never prevent or alter a transaction.
		pcall(ItemRack.MuteSwapSounds, 1.5)
	end
	ItemRack.ActiveEquipmentTransaction = request
	SubmitCurrentStep(request)
	return request.finished and request.status or "submitted", request, request.reason
end
