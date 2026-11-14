-- Shared item-use mechanics. Client files return before allocating another
-- client's catalog. Rules never equip gear or bypass user/secure swap policy.
ItemRack.SpecialItems = { Rules={}, Mechanics={}, Intents={}, Used={}, History={}, SpellIndex={}, InvalidRules={}, Trace={}, Rejections={} }
local Special = ItemRack.SpecialItems
local traceCapacity = 2048

local function Public(value)
	return not issecretvalue or not issecretvalue(value)
end

local function Number(value)
	if not Public(value) or (type(value)~="number" and type(value)~="string") then return nil end
	local number = tonumber(value)
	if number and number==number and number~=math.huge and number~=-math.huge then return number end
end

local function BaseID(id)
	if not Public(id) then return nil end
	if type(id)=="number" then return Number(id) end
	if type(id)=="string" then return tonumber(id:match("^(%d+)")) end
end

local version,build,_,interface = GetBuildInfo()
interface = Number(interface)
Special.Client = { version=Public(version) and version or nil, build=Number(build), interface=interface }
if interface==11508 or interface==11509 then Special.Client.family="era"
elseif interface==20505 or interface==20506 then Special.Client.family="tbc"
elseif interface==16001 or interface==11601 then Special.Client.family="forever" end

local function Record(reason,slot,id,spellID,event)
	local history = Special.History
	history[#history+1] = {time=GetTime(),reason=reason,slot=slot,item=BaseID(id),spell=Number(spellID),event=event}
	if #history>24 then table.remove(history,1) end
	if Special.SaveHistory then Special.SaveHistory() end
end

local function Epoch()
	local value = GetServerTime and Number(GetServerTime())
	return value and value>0 and value or nil
end

local function Trace(kind,data)
	if not Special.TraceUntil then return end
	if GetTime()>Special.TraceUntil then Special.TraceUntil=nil; Special.TraceStop="expired"; return end
	local entry = {time=GetTime(),kind=kind}
	for key,value in pairs(data or {}) do
		if Public(value) and (type(value)=="number" or type(value)=="boolean" or type(value)=="string") then
			entry[key]=type(value)=="string" and value:sub(1,180) or value
		end
	end
	local trace = Special.Trace
	trace[#trace+1]=entry
	if #trace>traceCapacity then table.remove(trace,1); Special.TraceDropped=(Special.TraceDropped or 0)+1 end
	if ItemRack.Debug then ItemRack.Debug("SpecialItems",kind,entry.item or "",entry.spell or "",entry.status or "") end
end

function Special.StartTrace(enabled)
	Special.TraceUntil=enabled and GetTime()+120 or nil
	Special.TraceStop=not enabled and "disabled" or nil
	if enabled then Special.Trace={}; Special.TraceDropped=0 end
end

function Special.IsTraceActive()
	return Special.TraceUntil~=nil and GetTime()<=Special.TraceUntil
end

function Special.ClearDiagnostics()
	Special.Trace,Special.History,Special.PreviousHistory,Special.Rejections={},{},{},{}
	Special.TraceDropped=0
	for _,state in pairs(Special.Used) do state.lastSample=nil end
	Special.SaveHistory()
end

function Special.TraceHook(source,slot)
	Trace("use_hook",{source=source,slot=Number(slot),slotType=type(slot)})
end

function Special.GetRule(id,slot,includeDisabled)
	local rule = Special.Rules[BaseID(id)]
	if type(rule)~="table" or (not includeDisabled and (rule.enabled~=true or Special.InvalidRules[BaseID(id)])) then return nil end
	if slot~=nil and (not rule.slots or not rule.slots[slot]) then return nil end
	return rule
end

function Special.GetProxy(id)
	local rule = Special.GetRule(id)
	return rule and rule.proxy
end

-- Rebuild once after loading the selected catalog. Adding/removing a data
-- row needs no queue-engine edits. Disabled research rows subscribe to nothing.
local function PositiveInteger(value)
	return type(value)=="number" and Number(value) and value>0 and value==math.floor(value)
end

local function SpellMap(value)
	if type(value)~="table" or not next(value) then return false end
	for id,allowed in pairs(value) do
		if not PositiveInteger(id) or allowed~=true then return false end
	end
	return true
end

local function ValidateMechanics(rule)
	if rule.revision~=nil and not PositiveInteger(rule.revision) then return "invalid rule revision" end
	local cooldown,activation,effect,proxy = rule.cooldown,rule.activation,rule.effect,rule.proxy
	if cooldown~=nil and type(cooldown)~="table" then return "invalid cooldown record" end
	if activation~=nil then
		if type(activation)~="table" then return "invalid activation record" end
		if activation.successSpells~=nil and not SpellMap(activation.successSpells) then return "invalid success spell map" end
		if activation.itemSpell~=nil and not PositiveInteger(activation.itemSpell) then return "invalid item spell ID" end
		local window = activation.windowSeconds
		if window~=nil and (type(window)~="number" or not Number(window) or window<=0 or window>2) then return "invalid activation window" end
	end
	if cooldown then
		if cooldown.start~="native" and not Special.Mechanics[cooldown.start] then return "unknown cooldown mechanic" end
		if cooldown.start=="deferred" then
			local minimum,review = cooldown.minimumOwnSeconds,cooldown.reviewAfterSeconds
			if not activation or not SpellMap(activation.successSpells)
			or type(minimum)~="number" or not Number(minimum) or minimum<=1.5 then return "incomplete deferred-use evidence rule" end
			if review~=nil and (type(review)~="number" or not Number(review) or review<=0) then return "invalid cooldown review interval" end
		end
	end
	if effect~=nil then
		if type(effect)~="table" then return "invalid effect record" end
		if effect.hold==true then
			if (effect.kind~="channel" and effect.kind~="aura") or not SpellMap(effect.spells) then return "invalid effect hold" end
			if effect.kind=="aura" and effect.unit~="player" and effect.unit~="pet" then return "invalid effect unit" end
		end
	end
	if proxy~=nil and (type(proxy)~="table" or not PositiveInteger(proxy.id)
		or (proxy.buff~=nil and type(proxy.buff)~="string" and not PositiveInteger(proxy.buff))) then return "invalid cooldown proxy" end
end

function Special.BuildIndex()
	Special.SpellIndex,Special.InvalidRules = {},{}
	for id,rule in pairs(Special.Rules) do
		local reason
		if not PositiveInteger(id) or type(rule)~="table" then reason="invalid item ID/record"
		elseif type(rule.name)~="string" or type(rule.slots)~="table" or not next(rule.slots) then reason="missing name/slot map"
		else
			for slot,allowed in pairs(rule.slots) do
				if type(slot)~="number" or slot<0 or slot>19 or slot~=math.floor(slot) or allowed~=true then reason="invalid equipment slot" end
			end
			if not reason and rule.enabled==true then reason=ValidateMechanics(rule) end
		end
		Special.InvalidRules[id] = reason
		if not reason and rule.enabled==true and rule.activation then
			for spellID in pairs(rule.activation.successSpells or {}) do Special.SpellIndex[spellID]=true end
			if rule.activation.itemSpell then Special.SpellIndex[rule.activation.itemSpell]=true end
		end
	end
end

-- The factory exists only for the selected client; refresh after login when
-- seasonal APIs may have become available. Repeated calls preserve receipts.
function Special.RefreshCatalog()
	local seasonal = Special.Client.family=="era" and ItemRack.IsEngravingActive and ItemRack.IsEngravingActive()
	local ruleset = Special.Client.family=="era" and (seasonal==nil and "unknown" or (seasonal and "sod" or "era")) or Special.Client.family
	if Special.CatalogLoaded and Special.Client.ruleset==ruleset then return end
	Special.Client.ruleset=ruleset
	if Special.LoadCatalog then Special.LoadCatalog(); Special.CatalogLoaded=true end
	for id,state in pairs(Special.Used) do
		local rule=Special.GetRule(id,state.slot)
		if not rule or state.revision~=(rule.revision or 1) then
			Special.Used[id]=nil
			Record("catalog_receipt_removed",state.slot,id)
		end
	end
	Special.Intents={}
	Record("catalog_refreshed")
end

local function Reject(reason,id)
	local list=Special.Rejections
	list[#list+1]={reason=reason,item=BaseID(id)}
	if #list>24 then table.remove(list,1) end
end

local function Store()
	return ItemRackUser and type(ItemRackUser.SpecialItemUsage)=="table" and ItemRackUser.SpecialItemUsage or nil
end

function Special.SaveHistory()
	local store=Store()
	if Special.PersistenceLoaded and not Special.PersistenceBlocked and store and store.schema==1 then
		local summaries={}
		for _,entry in ipairs(Special.History) do
			summaries[#summaries+1]={reason=entry.reason,item=entry.item,slot=entry.slot,spell=entry.spell,event=entry.event}
		end
		store.history=summaries
	end
end

-- Load validates transport only; runtime restoration waits for the equipped
-- snapshot, before events/queues are released from the existing startup hold.
function Special.LoadSaved()
	if Special.PersistenceLoaded then return end
	if Special.Client.family=="era" and Special.Client.ruleset=="unknown" then return end
	Special.PersistenceLoaded=true
	ItemRackUser=ItemRackUser or {}
	local saved=ItemRackUser.SpecialItemUsage
	if type(saved)=="table" and saved.schema~=nil and saved.schema~=1 then
		Special.PersistenceBlocked="unsupported special-item schema"
		Reject(Special.PersistenceBlocked)
		return -- Preserve future schemas byte-for-byte in memory.
	end
	local accepted={schema=1,family=Special.Client.family,ruleset=Special.Client.ruleset,
		interface=Special.Client.interface,build=Special.Client.build,records={}}
	Special.PreviousHistory={}
	if type(saved)=="table" and saved.schema==1 and saved.family==Special.Client.family
	and saved.ruleset==Special.Client.ruleset and type(saved.records)=="table" then
		Special.PreviousClient={interface=Number(saved.interface),build=Number(saved.build)}
		-- Validate selected-catalog identities first: extraneous saved rows must
		-- not crowd a real pending item out of the restoration budget.
		local identities={}
		for id in pairs(Special.Rules) do
			if PositiveInteger(id) and saved.records[id]~=nil then identities[#identities+1]=id end
		end
		table.sort(identities)
		local count=0
		for _,id in ipairs(identities) do
			local record=saved.records[id]
			count=count+1
			if count>32 then Reject("record_limit"); break end
			local rule=Special.GetRule(id)
			if not PositiveInteger(id) or type(record)~="table" or not rule or not rule.cooldown or rule.cooldown.start~="deferred" then Reject("unknown_item_or_record",id)
			elseif record.revision~=(rule.revision or 1) or record.baseID~=id or type(record.slot)~="number" or record.slot<0 or record.slot>19 or record.slot~=math.floor(record.slot)
			or not rule.slots[record.slot] or type(record.exactID)~="string" or #record.exactID>240
			or BaseID(record.exactID)~=id then Reject("identity_or_revision",id)
			elseif type(record.confirmedAt)~="number" or not Number(record.confirmedAt) or record.confirmedAt<=0
			or (record.phase~="pending" and record.phase~="unresolved" and record.phase~="cooldown")
			or (record.phase=="cooldown" and (type(record.expiresAt)~="number" or not Number(record.expiresAt) or record.expiresAt<record.confirmedAt)) then Reject("invalid_time_or_phase",id)
			else
				accepted.records[id]={baseID=id,exactID=record.exactID,slot=record.slot,revision=record.revision,
					confirmedAt=record.confirmedAt,phase=record.phase,expiresAt=record.expiresAt,
					notificationRegistered=record.phase=="cooldown" or record.notificationRegistered==true}
			end
		end
		local inspected=0
		for id in pairs(saved.records) do
			inspected=inspected+1
			if not Special.Rules[id] then Reject("unknown_item_or_record",id) end
			if inspected>32 then Reject("record_limit"); break end
		end
		if type(saved.history)=="table" then
			for i=math.max(1,#saved.history-23),#saved.history do
				local entry=saved.history[i]
				if type(entry)=="table" and type(entry.reason)=="string" then
					Special.PreviousHistory[#Special.PreviousHistory+1]={reason=entry.reason:sub(1,100),item=BaseID(entry.item),slot=Number(entry.slot),spell=Number(entry.spell),
                        event=type(entry.event)=="string" and (entry.event=="UNIT_SPELLCAST_SUCCEEDED" or entry.event=="UNIT_SPELLCAST_FAILED" or entry.event=="UNIT_SPELLCAST_INTERRUPTED") and entry.event or nil}
				end
			end
		end
	elseif saved~=nil then Reject("invalid_store_or_client") end
	ItemRackUser.SpecialItemUsage=accepted
	Special.SaveHistory()
end

local function SaveReceipt(state)
	Special.LoadSaved()
	local store=Store()
	if Special.PersistenceBlocked or not store then return end
	if not state.confirmedAt then Reject("server_clock_unavailable",state.baseID); return end
	local rule=Special.GetRule(state.baseID,state.slot)
	if not rule then return end
	if not store.records[state.baseID] then
		local count=0
		for _ in pairs(store.records) do count=count+1 end
		if count>=32 then Reject("record_limit",state.baseID); return end
	end
	store.records[state.baseID]={baseID=state.baseID,exactID=state.exactID,slot=state.slot,
		revision=state.revision or rule.revision or 1,confirmedAt=state.confirmedAt,phase=state.phase,expiresAt=state.expiresAt,
		notificationRegistered=state.notificationRegistered==true}
end

local function Retire(state,reason)
	Special.Used[state.baseID]=nil
	local store=Store()
	if store and store.schema==1 and not Special.PersistenceBlocked then store.records[state.baseID]=nil end
	Record(reason,state.slot,state.baseID)
end

function Special.RestoreSaved()
	Special.LoadSaved()
	if not Special.PersistenceLoaded or Special.Restored or Special.PersistenceBlocked or ItemRack.QueueStateReady~=true then return end
	Special.Restored=true
	local now=Epoch()
	for id,record in pairs(Store().records) do
		local rule=Special.GetRule(id,record.slot)
		if rule and record.revision==(rule.revision or 1) then
			local age=now and now-record.confirmedAt
			local clockValid=age and age>=0
			Special.Used[id]={baseID=id,exactID=record.exactID,slot=record.slot,revision=record.revision,
				confirmedAt=record.confirmedAt,expiresAt=record.expiresAt,restored=true,
				notificationRegistered=record.notificationRegistered,
				phase=record.phase=="cooldown" and "reconciling" or (clockValid and record.phase or "unresolved"),
				time=GetTime()-(clockValid and age or 0),clockUncertain=not clockValid}
			Record(clockValid and "receipt_restored" or "receipt_clock_uncertain",record.slot,id)
		end
	end
	Special.Poll()
end

function Special.ResetReceipt(id)
	id=BaseID(id)
	if not PositiveInteger(id) or Special.PersistenceBlocked then return false end
	local state=Special.Used[id]
	if state then Retire(state,"receipt_reset_by_user")
	else
		local store=Store()
		if store and store.schema==1 then store.records[id]=nil end
		Record("receipt_reset_by_user",nil,id)
	end
	for slot,token in pairs(Special.Intents) do if token.baseID==id then Special.CancelIntent(slot) end end
	return true
end

function Special.Command(arg)
	local id=arg and arg:match("^special reset (%d+)$")
	if id then
		local ok=Special.ResetReceipt(id)
		ItemRack.Print(ok and "Special-item receipt cleared; normal cooldown checks apply. Manual holds and gear are unchanged." or "Receipt was not cleared; inspect /itemrack special status.")
		return
	end
	ItemRack.Print("Special items: "..tostring(Special.Client.family or "unsupported").." / "..tostring(Special.Client.ruleset or "unknown").."; "..(Special.PersistenceBlocked or "recovery enabled"))
	local found=false
	for id,state in pairs(Special.Used) do found=true; ItemRack.Print(tostring(id)..": "..state.phase.."; age "..math.floor(math.max(0,GetTime()-state.time)).."s") end
	if not found then ItemRack.Print("No pending special-item receipts.") end
	ItemRack.Print("/itemrack debug specialitems captures 120s; /itemrack special reset <itemID> discards only that item's pending evidence.")
end

local function Context(slot)
	local context = ItemRack.GetQueueContext and ItemRack.GetQueueContext(slot)
	return context and context.owner,context and context.list
end

local function Same(a,b)
	return a and b and ItemRack.SameExactID(a,b)
end

local function Current(token)
	if token.generation~=ItemRack.QueueStateGeneration or ItemRack.QueueStateReady~=true then return false end
	local state,id = ItemRack.GetEquippedSlotState(token.slot)
	if state~="resolved" or not Same(id,token.exactID) then return false end
	local owner,list = Context(token.slot)
	return owner==token.owner and list==token.list
end

-- A later manual choice invalidates earlier activation evidence, even when
-- it selects the same exact item again. A confirmed item's cooldown is global.
function Special.CancelIntent(slot)
	Special.Intents[slot] = nil
end

function Special.ObserveCooldown(id,baseID,observed,rawStart,rawDuration,rawEnable,source)
	local state = Special.Used[BaseID(baseID or id)]
	if not state or not observed then return end
	local rule = Special.GetRule(state.baseID,state.slot)
	if not rule then Retire(state,"rule_removed"); return end
	local signature=tostring(observed.status)..":"..tostring(observed.start)..":"..tostring(observed.duration)..":"..tostring(rawEnable)
	if state.lastSample~=signature then
		state.lastSample=signature
		Trace("cooldown_observation",{item=state.baseID,slot=state.slot,status=observed.status,start=observed.start,duration=observed.duration,known=observed.known,active=observed.active,phase=state.phase,
			rawStart=rawStart,rawDuration=rawDuration,rawEnable=rawEnable,source=source})
	end
	if observed.status=="arena_reset" then Retire(state,"confirmed_arena_reset"); return end
	-- Exclude the short shared/equip cooldown from evidence of the real item CD.
	if observed.active and observed.start and observed.duration
	and (state.restored or observed.start>=state.time-0.1)
	and observed.duration>=(rule.cooldown.minimumOwnSeconds or 120) then
		if not state.notificationRegistered and ItemRackUser then
			-- Notification tracking starts only with a real cooldown, never the
			-- zero/short shared sample during the confirmed guardian's lifetime.
			ItemRackUser.ItemsUsed = ItemRackUser.ItemsUsed or {}
			ItemRackUser.ItemsUsed[state.baseID] = 1
			ItemRack.ItemsUsedCooldownGeneration = ItemRack.ItemsUsedCooldownGeneration or {}
			ItemRack.ItemsUsedCooldownGeneration[state.baseID] = ItemRack.EnsureCooldownState().generation
			state.notificationRegistered=true
		end
		local changed=state.phase~="cooldown"
		state.phase="cooldown"
		state.start,state.duration = observed.start,observed.duration
		local now=Epoch()
		if now then
			state.confirmedAt=math.min(state.confirmedAt or now,now)
			state.expiresAt=now+math.max(0,observed.start+observed.duration-GetTime())
			state.clockUncertain=nil
		end
		state.readySince=nil
		SaveReceipt(state)
		if changed then Record("native_cooldown_observed",state.slot,state.baseID) end
	elseif state.phase=="cooldown" and observed.known and not observed.active
	and GetTime()>=state.start+state.duration then
		Retire(state,"cooldown_completed")
	elseif state.phase=="reconciling" then
		local now=Epoch()
		if observed.known and not observed.active and observed.enable==1 and now and not state.clockUncertain
		and state.expiresAt and now>=state.expiresAt then
			state.readySince=state.readySince or GetTime()
			if GetTime()-state.readySince>=1 then Retire(state,"offline_cooldown_completed") end
		else state.readySince=nil end
	end
end

local function Confirm(token,receipt)
	if not Current(token) or not Same(token.exactID,receipt.exactID)
	or token.owner~=receipt.owner or token.list~=receipt.list
	or token.generation~=receipt.generation then return false end
	if Special.Intents[token.slot]~=token then return false end
	local previous = Special.Used[token.baseID]
	if previous and ((receipt.cast and previous.cast==receipt.cast) or GetTime()-previous.time<0.5) then return false end
	Special.Intents[token.slot] = nil
	Special.Used[token.baseID] = {baseID=token.baseID,exactID=token.exactID,slot=token.slot,
		time=GetTime(),confirmedAt=Epoch(),revision=(Special.GetRule(token.baseID).revision or 1),phase="pending",cast=receipt.cast,owner=token.owner}
	SaveReceipt(Special.Used[token.baseID])
	if ItemRack.MarkEquippedItemUsed then ItemRack.MarkEquippedItemUsed(token.slot) end
	if not (ItemRack.ManualQueueHold and ItemRack.ManualQueueHold[token.slot])
	and ItemRack.IsManualQueueChoice and ItemRack.IsManualQueueChoice(token.slot,token.exactID,token.baseID)
	and ItemRack.ClearManualQueueChoice then ItemRack.ClearManualQueueChoice(token.slot) end
	if ItemRack.GetQueuesEnabled and ItemRack.GetQueuesEnabled()[token.slot]
	and ItemRack.MarkEquippedQueueItemBurnt then
		ItemRack.MarkEquippedQueueItemBurnt(token.slot,token.exactID,token.baseID,token.list)
	end
	-- A real native observation may already exist if the spell event came later.
	local native = ItemRack.GetObservedItemCooldown and ItemRack.GetObservedItemCooldown(token.exactID,token.baseID)
	if native then
		Special.ObserveCooldown(token.exactID,token.baseID,{active=true,known=true,start=native.start,duration=native.duration})
	end
	Record("activation_confirmed",token.slot,token.baseID,receipt.spellID,receipt.event)
	return true
end

Special.Mechanics.deferred = {
	spellEvidence=true,
	pending=function(state)
		return state.phase=="pending" or state.phase=="unresolved" or state.phase=="reconciling"
	end,
}

function Special.IsCooldownPending(id)
	local state = Special.Used[BaseID(id)]
	if not state then return false end
	local rule = Special.GetRule(id)
	local mechanic = rule and rule.cooldown and Special.Mechanics[rule.cooldown.start]
	return mechanic and mechanic.pending and mechanic.pending(state,rule) or false
end

-- Sample confirmed items even while a higher-priority equipped item stops
-- candidate iteration. Otherwise a closed menu could miss the entire real CD.
function Special.Poll()
	if not ItemRack.GetItemCooldownLeft then return end
	if Special.Client.ruleset=="unknown" then Special.RefreshCatalog() end
	if not Special.Restored then
		Special.RestoreSaved()
		if Special.Restored then return end -- RestoreSaved already polls once.
	end
	for id,state in pairs(Special.Used) do
		local rule=Special.GetRule(id,state.slot)
		if not rule then Retire(state,"rule_removed")
		else
			if state.phase=="pending" and GetTime()-state.time>(rule.cooldown.reviewAfterSeconds or 90) then
				state.phase="unresolved"
				SaveReceipt(state)
				Record("cooldown_still_unresolved",state.slot,id)
			end
			ItemRack.GetItemCooldownLeft(state.exactID)
		end
	end
end

function Special.BeginUse(slot)
	slot = Number(slot)
	if not slot or slot<0 or slot>19 or slot~=math.floor(slot) then return end
	if ItemRack.QueueStateReady~=true then return end
	Special.LoadSaved()
	if not Special.PersistenceLoaded or Special.PersistenceBlocked then return end
	Special.RestoreSaved()
	local state,id = ItemRack.GetEquippedSlotState(slot)
	local rule = state=="resolved" and Special.GetRule(id,slot)
	local mechanic = rule and rule.cooldown and Special.Mechanics[rule.cooldown.start]
	if not mechanic or not mechanic.spellEvidence then return end
	-- A fresh, independently confirmed use can recover an unresolved receipt.
	local existing = Special.Intents[slot]
	if existing and Current(existing) and GetTime()<=existing.deadline then return end
	local owner,list = Context(slot)
	local token = {slot=slot,exactID=id,baseID=BaseID(id),owner=owner,list=list,
		created=GetTime(),deadline=GetTime()+(rule.activation.windowSeconds or 0.75),
		generation=ItemRack.QueueStateGeneration}
	Special.Intents[slot] = token
	Record("use_intent",slot,id)
	if C_Timer and C_Timer.After then
		C_Timer.After(rule.activation.windowSeconds or 0.75,function()
			if Special.Intents[slot]==token then
				Special.Intents[slot]=nil
				Record("use_without_success",slot,id)
			end
		end)
	end
end

-- Called before the casting handler's early return: instant item spells do
-- not necessarily create ItemRack.NowCasting. Only public numeric IDs match.
function Special.OnSpellEvent(event,unit,castGUID,spellID)
	if not Public(unit) or unit~="player" then return end
	spellID = Number(spellID)
	if Special.TraceUntil then
		local relevant=next(Special.Used) or next(Special.Intents)
		if not relevant then
			for slot=0,19 do
				local state,id=ItemRack.GetEquippedSlotState(slot)
				if state=="resolved" and Special.GetRule(id,slot) then relevant=true; break end
			end
		end
		if relevant then Trace("player_spell",{event=event,spell=spellID}) end
	end
	if not spellID or not Special.SpellIndex[spellID] then return end
	local success = event=="UNIT_SPELLCAST_SUCCEEDED"
	local failed = event=="UNIT_SPELLCAST_FAILED" or event=="UNIT_SPELLCAST_INTERRUPTED"
	if not success and not failed then return end
	local candidates,waiting = {},{}
	for slot=0,19 do
		local state,id = ItemRack.GetEquippedSlotState(slot)
		local rule = state=="resolved" and Special.GetRule(id,slot)
		local mechanic = rule and rule.cooldown and Special.Mechanics[rule.cooldown.start]
		if mechanic and mechanic.spellEvidence and rule.activation.successSpells[spellID] then
			candidates[#candidates+1] = {slot=slot,id=id,rule=rule}
			local token = Special.Intents[slot]
			if token and Current(token) and GetTime()<=token.deadline then waiting[#waiting+1]=token end
		end
	end
	if #candidates==0 then Record("related_spell_unconfirmed",nil,nil,spellID,event); return end
	if failed then
		for _,token in ipairs(waiting) do Special.CancelIntent(token.slot); Record("use_failed",token.slot,token.baseID,spellID,event) end
		return
	end
	-- Require an existing compatible intent. A standalone or late success cannot
	-- be reused by a later hook/manual choice, even when the item is unchanged.
	local slot,id
	if #waiting==1 then slot,id=waiting[1].slot,waiting[1].exactID
	else Record(#waiting==0 and "success_without_intent" or "ambiguous_success",nil,nil,spellID,event); return end
	local owner,list = Context(slot)
	local cast = Public(castGUID) and type(castGUID)=="string" and castGUID or nil
	local receipt = {slot=slot,exactID=id,owner=owner,list=list,spellID=spellID,event=event,
		generation=ItemRack.QueueStateGeneration,time=GetTime(),cast=cast}
	Confirm(waiting[1],receipt)
end

-- Optional data-defined effect holds. No catalog entry may enable a tether
-- merely because any pet exists. Manual swaps still use the normal engine.
local function HasEffectAura(spellID,unit)
	if C_UnitAuras and C_UnitAuras.GetUnitAuraBySpellID then
		local ok,aura=pcall(C_UnitAuras.GetUnitAuraBySpellID,unit,spellID)
		if ok and Public(aura) and type(aura)=="table" then return true end
	end
	if C_UnitAuras and C_UnitAuras.GetAuraDataByIndex then
		for _,filter in ipairs({"HELPFUL","HARMFUL"}) do
			for index=1,40 do
				local ok,aura=pcall(C_UnitAuras.GetAuraDataByIndex,unit,index,filter)
				if not ok or not Public(aura) then break end
				if aura==nil then break end
				if type(aura)=="table" and Number(aura.spellId)==spellID then return true end
			end
		end
	end
	local getter=GetSpellInfo or (C_Spell and C_Spell.GetSpellName)
	local name=getter and getter(spellID)
	return Public(name) and type(name)=="string" and ItemRack.FindAuraByName and ItemRack.FindAuraByName(name,unit) and true or false
end

function Special.ShouldHoldEffect(slot,id)
	local rule = Special.GetRule(id,slot)
	local effect = rule and rule.effect
	if not effect or effect.hold~=true then return false end
	if effect.kind=="channel" and UnitChannelInfo then
		local _,_,_,_,_,_,_,spellID = UnitChannelInfo("player")
		return effect.spells and effect.spells[Number(spellID)]==true or false
	elseif effect.kind=="aura" and (effect.unit=="player" or effect.unit=="pet") then
		for spellID in pairs(effect.spells or {}) do
			if HasEffectAura(spellID,effect.unit) then return true end
		end
	end
	return false
end

function Special.GetDiagnostics(full)
	local catalog = {}
	for id,rule in pairs(Special.Rules) do
		catalog[id]=type(rule)=="table" and {name=rule.name,enabled=rule.enabled,slots=rule.slots,
			useSpell=rule.useSpell,cooldown=rule.cooldown,effect=rule.effect,proxy=rule.proxy,notes=rule.notes} or {enabled=false}
	end
	-- Do not serialize live context.list references from intent tokens.
	local intents = {}
	for slot,token in pairs(Special.Intents) do
		intents[slot]={item=token.baseID,exactID=token.exactID,owner=token.owner,
			created=token.created,deadline=token.deadline,current=Current(token)}
	end
	local trace={}
	local first=full and 1 or math.max(1,#Special.Trace-255)
	for i=first,#Special.Trace do trace[#trace+1]=Special.Trace[i] end
	return {client=Special.Client,catalog=catalog,catalogSource=Special.CatalogSource,
		invalidRules=Special.InvalidRules,intents=intents,used=Special.Used,history=Special.History,
		previousHistory=Special.PreviousHistory,previousClient=Special.PreviousClient,rejections=Special.Rejections,persistenceBlocked=Special.PersistenceBlocked,
		trace=trace,traceRetained=#Special.Trace,traceExported=#trace,traceOmitted=#Special.Trace-#trace,traceCapacity=traceCapacity,traceUntil=Special.TraceUntil,traceDropped=Special.TraceDropped,traceStop=Special.TraceStop}
end
