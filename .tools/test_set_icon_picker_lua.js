const { extractFunction, runLua } = require('./lib/lua_harness');

const options = 'ItemRackOptions/ItemRackOptions.lua';
const functions = [
  extractFunction(options, 'ItemRackOpt.NormalizeSetIcon'),
  extractFunction(options, 'ItemRackOpt.AppendSetIcon'),
  extractFunction(options, 'ItemRackOpt.ShouldHighlightSetIcon'),
  extractFunction(options, 'ItemRackOpt.PopulateInvIcons'),
  extractFunction(options, 'ItemRackOpt.PopulateInitialIcons'),
  extractFunction(options, 'ItemRackOpt.OnEvent'),
  extractFunction(options, 'ItemRackOpt.RefreshQueueIconPage'),
  extractFunction(options, 'ItemRackOpt.GetVersionBadge'),
  extractFunction(options, 'ItemRackOpt.UpdateTitle'),
  extractFunction(options, 'ItemRackOpt.VersionBadgeOnEnter'),
].join('\n');

runLua(String.raw`
local fallback = "Interface\\Icons\\INV_Misc_QuestionMark"
local refreshes = 0
ItemRackOpt = { Icons={}, Inv={}, FallbackSetIcon=fallback }
ItemRack = { SlotInfo={} }
ItemRackOptFrame = { IsVisible=function() return true end }
for i=0,19 do
  ItemRack.SlotInfo[i] = { name="Slot"..i }
  ItemRackOpt.Inv[i] = { id=(i % 3 == 0) and ("item"..i) or 0 }
end
function ItemRack.GetInfoByID(id)
  local n = tonumber(tostring(id):match("(%d+)$"))
  if n == 6 then return "Loaded",777 end
  return "Uncached",nil
end
function GetInventorySlotInfo(name)
  local n = tonumber(name:match("(%d+)$"))
  if n == 1 then return n,nil end
  return n,"SlotTexture"..n
end
function ItemRackOpt.SetsIconScrollFrameUpdate() refreshes = refreshes + 1 end
RefreshPlayerSpellIconInfo = nil
IconDataProviderMixin = nil

${functions}

local checks = 0
local function check(value,message) assert(value,message); checks = checks + 1 end

check(ItemRackOpt.NormalizeSetIcon(nil) == fallback,
  "nil item data must use a visible fallback")
check(ItemRackOpt.NormalizeSetIcon(0) == fallback and ItemRackOpt.NormalizeSetIcon(123) == 123,
  "invalid file IDs must fall back while valid file IDs remain unchanged")
check(ItemRackOpt.NormalizeSetIcon("") == fallback
  and ItemRackOpt.NormalizeSetIcon("Interface\\Icons\\Valid") == "Interface\\Icons\\Valid",
  "empty texture paths must fall back while valid paths remain unchanged")

ItemRackOpt.selectedIcon = fallback
local selected,matched = ItemRackOpt.ShouldHighlightSetIcon(1,fallback,false)
check(selected and matched,"the first matching fallback icon must be highlighted")
selected,matched = ItemRackOpt.ShouldHighlightSetIcon(2,fallback,matched)
check(not selected and matched,"duplicate fallback icons must not all be highlighted")
ItemRackOpt.selectedIconIndex = 2
selected = ItemRackOpt.ShouldHighlightSetIcon(1,fallback,false)
check(not selected,"an explicit click must not highlight another duplicate")
selected = ItemRackOpt.ShouldHighlightSetIcon(2,fallback,false)
check(selected,"an explicit click must retain its exact highlighted cell")
ItemRackOpt.selectedIconIndex = nil

ItemRackOpt.PopulateInvIcons()
check(#ItemRackOpt.Icons == 20,"all twenty slot choices must remain dense")
for i=1,20 do
  check(ItemRackOpt.Icons[i] ~= nil,"slot icon choice "..i.." must never be blank")
end
check(ItemRackOpt.Icons[7] == 777,"loaded item textures must remain intact")
check(ItemRackOpt.Icons[1] == fallback,"uncached item textures must display the fallback")
check(ItemRackOpt.Icons[2] == fallback,"unsupported empty slots must display the fallback")
check(refreshes == 1,"inventory icon rebuild must refresh the visible grid once")

ItemRackOpt.selectedIconIndex = 7
ItemRackOpt.selectedIcon = fallback
ItemRackOpt.PopulateInvIcons()
check(ItemRackOpt.selectedIcon == 777,
  "a clicked fallback cell must adopt its real texture when item data arrives")
ItemRackOpt.selectedIconIndex = nil

ItemRackOpt.PopulateInitialIcons()
check(#ItemRackOpt.Icons == 22,
  "initial choices must retain twenty slots plus the two packaged banners")
for i=1,20 do
  check(ItemRackOpt.Icons[i] ~= nil,"initial icon array must contain no slot holes")
end

local before = #ItemRackOpt.Icons
-- Cross-fork compatibility review: Forever must not initialize the shared
-- Blizzard icon provider, including when the legacy API is incomplete.
RefreshPlayerSpellIconInfo = function() end
GetMacroIcons = nil
IconDataProviderMixin = {}
CreateAndInitFromMixin = function() error("shared icon provider must not be touched") end
local ok = pcall(ItemRackOpt.PopulateInitialIcons)
check(ok and #ItemRackOpt.Icons == 22,"incomplete icon APIs must retain base choices without shared-provider access")
GetMacroIcons = function(target) target[1]=901; target[2]=0 end
GetLooseMacroIcons = function(target) target[1]=902 end
ItemRackOpt.PopulateInitialIcons()
check(ItemRackOpt.Icons[23] == 901 and ItemRackOpt.Icons[24] == 902,
  "modern fill-table icon APIs returning nil must supply valid icons")
GetMacroIcons = function() return {"legacy"} end
GetSpellorMacroIconInfo = function() return "Spell_Legacy" end
GetLooseMacroIcons = nil
ItemRackOpt.PopulateInitialIcons()
check(ItemRackOpt.Icons[23] == "Interface\\Icons\\Spell_Legacy",
  "legacy indexed macro icons must remain available")
GetMacroIcons = function() error("icon list unavailable") end
check(pcall(ItemRackOpt.PopulateInitialIcons) and #ItemRackOpt.Icons == 22,
  "failing icon APIs must preserve a dense base list")
before = #ItemRackOpt.Icons
ItemRackOpt.AppendSetIcon(nil)
ItemRackOpt.AppendSetIcon(0)
ItemRackOpt.AppendSetIcon("")
check(#ItemRackOpt.Icons == before,"invalid spell or macro icons must be skipped")
ItemRackOpt.AppendSetIcon(456)
ItemRackOpt.AppendSetIcon("Spell_Test",true)
check(ItemRackOpt.Icons[before+1] == 456
  and ItemRackOpt.Icons[before+2] == "Interface\\Icons\\Spell_Test",
  "valid numeric and legacy macro icons must append safely")

local itemRefreshes = 0
ItemRackOpt.PopulateInvIcons = function() itemRefreshes = itemRefreshes + 1 end
ItemRackOpt.OnEvent(nil,"GET_ITEM_INFO_RECEIVED")
check(itemRefreshes == 1,"completed asynchronous item data must refresh picker icons")
ItemRackOptFrame.IsVisible = function() return false end
ItemRackOpt.OnEvent(nil,"GET_ITEM_INFO_RECEIVED")
check(itemRefreshes == 1,"hidden options must not do unnecessary item-cache work")

-- Header overlap screenshot: keep the visible label fixed while displaying
-- the complete installed version in an owned, top-anchored hover tooltip.
ItemRackOptFrameTitle={SetText=function(self,value) self.text=value end}
ItemRack.DisplayName="ItemRack Universal"
for _,version in ipairs({"Dev","4.53","4.99999.99999","4.53-beta1","4.53-beta12345"}) do
  ItemRack.Version=version; ItemRackOpt.UpdateTitle()
  local beta=version:find("beta",1,true)
  check(ItemRackOptFrameTitle.text==(beta and "IRU-B" or "IRU"),
    "compact-version-badge: release version length must not change the visible label")
end
local badge={}
GameTooltip={SetOwner=function(self,owner,anchor) self.owner=owner;self.anchor=anchor end,
  SetText=function(self,value) self.title=value end,AddLine=function(self,value) self.version=value end,
  Show=function(self) self.visible=true end,Hide=function(self) self.visible=false end}
ItemRackOpt.VersionBadgeOnEnter(badge)
check(GameTooltip.owner==badge and GameTooltip.anchor=="ANCHOR_TOP" and GameTooltip.visible
  and GameTooltip.title=="ItemRack Universal" and GameTooltip.version=="Version: 4.53-beta12345",
  "version badge tooltip must display full beta version above its owner")
ItemRack.Version=nil; ItemRackOpt.UpdateTitle(); ItemRackOpt.VersionBadgeOnEnter(badge)
check(ItemRackOptFrameTitle.text=="IRU" and GameTooltip.version=="Version: Dev",
  "missing metadata must retain compact development branding and a visible version")
check(ItemRackOpt.selectedIconIndex==nil and ItemRackOpt.Icons[before+1]==456,
  "branding must not change icon selection or private choices")
print(string.format("[SET ICON PICKER LUA] %d blank-icon, refresh and version-badge checks passed.",checks))
`, 'set-icon-picker');

// Queue item styling belongs to the existing picker suite. Run production
// owner resolution, picker callbacks, render paths, and SaveSet persistence.
const core = 'ItemRack/ItemRack.lua';
const itemFunctions = [
  extractFunction(core, 'QueueFieldProxy'),
  ...['SameID','GetRuneID','HasRuneID','IsBareItemID','NormalizeItemFields',
    'SameItemFields','SameExactID','MatchesStoredItemFields','GetQueueContext',
    'IsValidItemIcon','GetCustomItemIcon','GetTextureBySlot','CreateMenuButton',
    'GetQueues','GetQueuesEnabled'].map(n => extractFunction(core, 'ItemRack.'+n)),
  extractFunction('ItemRack/ItemRackButtons.lua','ItemRack.RefreshCustomItemIcons'),
  ...['NormalizeSetIcon','GetQualityColor','GetQueueItemLocation','IsQueueItemCarried','UpdateQueueIconButton','ApplyQueueItemIcon',
    'QueueIconPickerUpdate','OpenQueueIconPicker','SortListScrollFrameUpdate','SortListOnEnter','SaveSet']
    .map(n => extractFunction(options,'ItemRackOpt.'+n)),
].join('\n');
runLua(String.raw`
local wanted="33881:2648:24028:0:0:0:0:0:70:0"
local other="33881:2647:24028:0:0:0:0:0:70:0"
local missing="99999:0:0:0:0:0:0:0"
local equipment={[9]=wanted}
local bags={[0]={[1]=other}}
ItemRack={SlotInfo={}, iSPatternBaseIDFromIR="^(%-?%d+)",
  iSPatternItemFieldsFromIR="^(%-?%d+:%-?%d*:%-?%d*:%-?%d*:%-?%d*:%-?%d*:%-?%d*:%-?%d*)",
  iSPatternRuneIDFromIR=":runeid:(%d+)$"}
ItemRackOpt={Icons={},Inv={},FallbackSetIcon="fallback",selectedIcon=456,selectedIconIndex=8}
local global={id=wanted,customIcon=101,priority=true,delay="7"}
local stealth={id=wanted,customIcon=202,priority=true,keep=true,delay="9",swapIn=30,swapInEnabled=true}
ItemRackUser={EnablePerSetQueues="OFF",EnableQueueContextCheck="ON",CurrentSet="Stealth",
  Queues={[9]={global}},QueuesEnabled={[9]=false},Buttons={[9]={}},Events={Set={}},
  Sets={Stealth={Queues={[9]={stealth,{id=other},{id=missing},{id=0}}},QueuesEnabled={[9]=false},equip={[9]=wanted}},
    PvP={Queues={[9]={{id=wanted,customIcon=303}}},equip={[9]=wanted}}, Mount={equip={[8]="boots"}}}}
ItemRack.GetID=function(bag,slot) if slot then return bags[bag] and bags[bag][slot] or 0 end return equipment[bag] or 0 end
ItemRack.GetIRString=function(id,base) return base and tostring(id):match("^(%-?%d+)") or id end
ItemRack.GetInfoByID=function(id) return id~=missing and "Shared name" or nil, id~=missing and "original" or nil, nil,1 end
function GetContainerNumSlots(bag) return bags[bag] and 1 or 0 end
function GetInventoryItemTexture(unit,slot) return equipment[slot] and "original" end
function GetInventorySlotInfo(name) return 1,"empty-slot" end
function GetItemQualityColor() return 1,1,1 end
local created={}
local function region()
  return {SetText=function(self,v) self.text=v end,SetTexture=function(self,v) self.texture=v end,
    SetAllPoints=function(self,v) self.anchor=v end,SetTexCoord=function(self,...) self.uv={...} end,
    GetTexCoord=function() return 0,1,0,1 end,SetPoint=function() end,
    SetTextColor=function(self,...) self.color={...} end,
    SetVertexColor=function() end,Show=function(self) self.visible=true end,Hide=function(self) self.visible=false end}
end
function CreateFrame(kind,name,parent,template)
  assert(not template or not template:match("Secure") and not template:match("ActionButton"),"presentation must be unprotected")
  local frame={name=name,kind=kind,parent=parent,template=template,scripts={},visible=true,value=0}
  for _,method in ipairs({"SetSize","SetPoint","SetFrameStrata","SetBackdrop","SetBackdropColor",
    "SetHighlightTexture","SetOrientation","SetValueStep","SetThumbTexture","EnableMouseWheel","RegisterForClicks"}) do frame[method]=function() end end
  frame.SetScript=function(self,k,fn) self.scripts[k]=fn end
  frame.HookScript=frame.SetScript
  frame.GetName=function(self) return self.name end
  frame.GetID=function(self) return self.id end
  frame.SetID=function(self,v) self.id=v end
  frame.CreateFontString=region; frame.CreateTexture=region
  frame.SetText=function(self,v) self.text=v end
  frame.SetNormalTexture=function(self,v) self.texture=v end
  frame.SetAlpha=function(self,v) self.alpha=v end
  frame.Enable=function(self) self.enabled=true end; frame.Disable=function(self) self.enabled=false end
  frame.SetMinMaxValues=function(self,a,b) self.min=a; self.max=b end
  frame.GetMinMaxValues=function(self) return self.min,self.max end
  frame.SetValue=function(self,v) self.value=v; if self.scripts.OnValueChanged then self.scripts.OnValueChanged(self,v) end end
  frame.GetValue=function(self) return self.value end
  frame.IsVisible=function(self) return self.visible and (not self.parent or self.parent:IsVisible()) end
  frame.Show=function(self) self.visible=true end
  frame.Hide=function(self) self.visible=false; if self.scripts.OnHide then self.scripts.OnHide(self) end end
  frame.LockHighlight=function(self) self.highlight=true end; frame.UnlockHighlight=function(self) self.highlight=false end
  if name then _G[name]=frame; _G[name.."Icon"]=region() end
  table.insert(created,frame); return frame
end
for i=0,19 do ItemRack.SlotInfo[i]={name="Slot"..i}; ItemRackOpt.Inv[i]={} end
ItemRackOpt.Inv[9]={id=wanted,selected=true}
for i=1,80 do ItemRackOpt.Icons[i]=1000+i end
ItemRackOptSubFrame7=CreateFrame("Frame")
ItemRackOptSortMoveDelete=CreateFrame("Button")
ItemRackOptSortListScrollFrame={}
ItemRackMenuFrame=CreateFrame("Frame")
ItemRackMenuFrame.visible=false
for i=1,10 do
  local row=CreateFrame("Button","ItemRackOptSortList"..i); row:SetID(i)
  _G["ItemRackOptSortList"..i.."Name"]=region(); _G["ItemRackOptSortList"..i.."Highlight"]=region()
end
function FauxScrollFrame_GetOffset() return 0 end
function FauxScrollFrame_Update() end
ItemRack.SetRuneIconOverlay=function() end
ItemRack.SetFont=function() end
ItemRackOpt.LockHighlight=function() end; ItemRackOpt.UnlockHighlight=function() end
ItemRackOpt.ValidateSortButtons=function() end
ItemRackOpt.QueueEditingSet="Stealth"; ItemRackOpt.SelectedSlot=9; ItemRackOpt.SortSelected=1
ItemRackButton9ItemRackIcon=region()
CharacterSlot9=CreateFrame("Button","CharacterSlot9")
CharacterSlot9.icon=region(); CharacterSlot9.icon.texture="original"
${require('fs').readFileSync('ItemRack/ItemRackQueuePolicy.lua','utf8')}
${itemFunctions}
local checks=0
local function check(value,message) assert(value,message); checks=checks+1 end
check(ItemRack.GetTextureBySlot(9)==101,"global custom icon must work with auto queue disabled")
check(ItemRack.GetInfoByID(wanted)=="Shared name","item info must retain original presentation")
ItemRack.RefreshCustomItemIcons()
check(ItemRackButton9ItemRackIcon.texture==101 and not CharacterSlot9.ItemRackCustomIcon,
  "default must style quick access and retain native character icons")
ItemRackUser.EnablePerSetQueues="ON"
check(ItemRack.GetTextureBySlot(9)==202,"per-set icon must follow current queue owner")
ItemRackUser.CurrentSet="PvP"
check(ItemRack.GetTextureBySlot(9)==303 and ItemRack.GetCustomItemIcon(9,wanted,"Stealth")==202,
  "active set and explicit editing set must resolve independently")
ItemRackUser.CurrentSet="Mount"; ItemRackUser.EventStack={"Stealth event"}; ItemRackUser.Events.Set["Stealth event"]="Stealth"
check(ItemRack.GetTextureBySlot(9)==202,"partial event set must inherit styling from the owning queue")
ItemRackUser.Sets.Mount.equip[9]=wanted
check(ItemRack.GetTextureBySlot(9)=="original","explicit set boundary must suppress inherited icons")
ItemRackUser.CurrentSet="Stealth"
local list=ItemRackUser.Sets.Stealth.Queues[9]
table.insert(list,{id=wanted..":runeid:7",customIcon=707})
check(ItemRack.GetCustomItemIcon(9,wanted..":runeid:7")==707,
  "exact rune styling must win over a legacy physical match, including after the stop marker")
check(ItemRack.GetCustomItemIcon(9,other)==nil,"different enchant must not borrow an icon")
local bare={id="33881",customIcon=999}
table.insert(list,1,bare)
check(ItemRack.GetCustomItemIcon(9,wanted)==202,"bare seed must not shadow explicit item styling")
table.remove(list,1)
ItemRackOpt.UpdateQueueIconButton(stealth)
ItemRackOpt.OpenQueueIconPicker()
local picker=ItemRackOpt.QueueIconPicker
check(picker.context.entry==stealth and picker.buttons[1].iconValue==1001,"picker must capture selected entry and render private choices")
picker.scroll:SetValue(1)
check(picker.buttons[1].iconValue==1006,"picker scrolling must use independent row offset")
picker.buttons[1].scripts.OnClick(picker.buttons[1])
check(stealth.customIcon==1006 and global.customIcon==101 and not picker.context and not picker.visible,
  "click must persist only the edited set icon and clean picker context")
check(ItemRackOpt.selectedIcon==456 and ItemRackOpt.selectedIconIndex==8 and equipment[9]==wanted,
  "item picker must leave set icon selection and equipment unchanged")
ItemRackOpt.OpenQueueIconPicker()
local reset
for _,frame in ipairs(created) do if frame.text=="Reset to original" then reset=frame end end
check(reset and reset.parent==picker,"Reset must be inside item icon popup")
reset.scripts.OnClick(reset)
check(stealth.customIcon==nil and ItemRack.GetTextureBySlot(9)=="original" and stealth.priority and stealth.keep and stealth.delay=="9",
  "reset must restore native icon while preserving all queue policy fields")
ItemRackOpt.OpenQueueIconPicker(); ItemRackOpt.SortSelected=2
check(not ItemRackOpt.ApplyQueueItemIcon(900) and not list[2].customIcon,"stale selected-entry click must be rejected")
ItemRackOpt.UpdateQueueIconButton(list[2])
check(not picker.context,"changing selection must cancel the popup")
ItemRackOpt.SortSelected=1; ItemRackOpt.OpenQueueIconPicker(); ItemRackUser.EnablePerSetQueues="OFF"
check(not ItemRackOpt.ApplyQueueItemIcon(900) and global.customIcon==101,"scope toggle must reject stale write")
ItemRackUser.EnablePerSetQueues="ON"; ItemRackOpt.OpenQueueIconPicker(); ItemRackOpt.QueueEditingSet="PvP"
check(not ItemRackOpt.ApplyQueueItemIcon(900),"editing-set switch must reject stale write")
ItemRackOpt.QueueEditingSet="Stealth"; ItemRackOpt.OpenQueueIconPicker(); ItemRackOptSubFrame7:Hide()
check(not picker.context and not ItemRackOpt.ApplyQueueItemIcon(900),"closing queue page must cancel pending selection")
ItemRackOptSubFrame7:Show(); ItemRackOpt.SortSelected=4; ItemRackOpt.UpdateQueueIconButton(list[4]); ItemRackOpt.OpenQueueIconPicker()
check(not ItemRackOpt.QueueIconButton.enabled and not picker.context,"stop marker cannot be styled")
ItemRackOpt.SortSelected=1; ItemRackOpt.OpenQueueIconPicker()
check(not ItemRackOpt.ApplyQueueItemIcon(0) and not ItemRackOpt.ApplyQueueItemIcon(""),"invalid textures must be rejected")
ItemRackOpt.ApplyQueueItemIcon(808)
ItemRackUser.CustomCharacterIcons="ON"; ItemRack.RefreshCustomItemIcons()
check(CharacterSlot9.ItemRackCustomIcon.texture==808 and CharacterSlot9.icon.texture=="original",
  "character opt-in must use own overlay and preserve original texture")
ItemRackUser.CustomCharacterIcons="OFF"; ItemRack.RefreshCustomItemIcons()
check(not CharacterSlot9.ItemRackCustomIcon.visible,"disabling character styling must immediately remove overlay")
ItemRack.menuOpen=9
local menu=ItemRack.CreateMenuButton(1,wanted)
check(menu.icon.texture=="original","flyout default must retain original texture")
ItemRackUser.CustomMenuIcons="ON"; ItemRack.CreateMenuButton(1,wanted)
check(menu.icon.texture==808,"flyout opt-in must style item icon")
ItemRack.menuInclude=1; ItemRack.CreateMenuButton(1,wanted)
check(menu.icon.texture=="original","set editing item menu must retain original icons")
check(ItemRackOpt.IsQueueItemCarried(wanted) and ItemRackOpt.IsQueueItemCarried(other)
  and not ItemRackOpt.IsQueueItemCarried(missing),"availability must check equipped and carried exact identities")
ItemRackOpt.SortListScrollFrameUpdate()
check(ItemRackOptSortList1Icon.texture==808 and ItemRackOptSortList3Name.text=="Item 99999 (not carried)",
  "queue rows must show custom icons and label unavailable uncached items")
local tooltipShows=0
GameTooltip={AddLine=function(self,line) self.line=line end,Show=function() tooltipShows=tooltipShows+1 end}
ItemRackSettings={ShowTooltips="ON"}
ItemRack.IDTooltip=function(self,id,exact) check(id==missing and exact==true,"queue hover must request exact saved identity") end
ItemRackOpt.SortListOnEnter(ItemRackOptSortList3)
check(tooltipShows==1 and GameTooltip.line:match("Not carried"),"queue hover must explain unavailable saved entry")
ItemRackSettings.ShowTooltips="OFF"; ItemRackOpt.SortListOnEnter(ItemRackOptSortList3)
check(tooltipShows==1,"unavailable-entry tooltip must respect disabled tooltips")
bags[0][1]=nil
check(not ItemRackOpt.IsQueueItemCarried(other),"another enchant of the same item must not count as carried")
-- Report screenshot: Era 4.51 Head global queue with bank open. These use
-- synthetic identities until the reporter supplies full saved/live links.
ItemRack.BankOpen=true; ItemRack.BankSlots={-1}; bags[-1]={[1]=missing}
check(ItemRackOpt.GetQueueItemLocation(missing)=="bank" and not ItemRackOpt.IsQueueItemCarried(missing),
  "open-bank exact entry must be labeled bank without pretending it is carried")
ItemRackOpt.SortListScrollFrameUpdate()
check(ItemRackOptSortList3Name.text=="Item 99999 (in bank)","open-bank queue row must explain saved location")
ItemRack.BankOpen=false
check(ItemRackOpt.GetQueueItemLocation(missing)=="missing", "closed-bank cache must not prove current ownership")
ItemRackOptSetsName={ClearFocus=function() end,GetText=function() return "Stealth" end}
ItemRackOptSpec1={GetChecked=function() return false end}; ItemRackOptSpec2=ItemRackOptSpec1
ItemRack.RegisterEvents=function() end; ItemRackOpt.PopulateEventList=function() end
ItemRackOpt.ReconcileSetBindings=function() end; ItemRackOpt.ValidateSetButtons=function() end
ItemRack.UpdateCurrentSet=function() end; ItemRack.FireItemRackEvent=function() end
ItemRackOpt.SaveSet()
local saved=ItemRackUser.Sets.Stealth.Queues[9]
check(saved~=list and saved[1]~=stealth and saved[1].customIcon==808 and saved[1].priority and saved[1].delay=="9"
  and saved[1].swapInEnabled and saved[1].swapIn==30 and saved[3].id==missing,
  "saving set must snapshot styling and policy, retaining unavailable saved entries")
check(ItemRackUser.CurrentSet=="Stealth" and equipment[9]==wanted and global.customIcon==101,
  "terminal gear, logical context and unrelated scope must remain unchanged")

-- Validate editing a different set while PvP remains the active set. SaveSet
-- must use the editor's explicit owner rather than snapshotting CurrentSet.
ItemRackUser.CurrentSet="PvP"
ItemRackOpt.OpenQueueIconPicker()
check(ItemRackOpt.QueueIconPicker.context.entry==saved[1],"picker must target editor set while a different set is active")
ItemRackOpt.SaveSet()
local resaved=ItemRackUser.Sets.Stealth.Queues[9]
check(resaved[1].customIcon==808 and ItemRackUser.Sets.PvP.Queues[9][1].customIcon==303
  and ItemRack.GetTextureBySlot(9)==303 and ItemRackUser.CurrentSet=="PvP",
  "queue-icon-save-inactive-set: saving Stealth must preserve active PvP icon and owner")
check(not ItemRackOpt.ApplyQueueItemIcon(909) and resaved[1].customIcon==808,
  "a picker opened before a save must not write through a replaced queue snapshot")
picker:Hide()

-- Global writes and reset must not leak into either per-set queue, including
-- when QueueEditingSet is non-nil and a different CurrentSet is active.
ItemRackUser.EnablePerSetQueues="OFF"
ItemRackOpt.OpenQueueIconPicker()
local globalPath="Interface\\Icons\\Spell_Shadow_ShadowWard"
check(ItemRackOpt.ApplyQueueItemIcon(globalPath),"global picker must accept legacy texture-path icons")
check(global.customIcon==globalPath and resaved[1].customIcon==808
  and ItemRackUser.Sets.PvP.Queues[9][1].customIcon==303 and ItemRack.GetTextureBySlot(9)==globalPath,
  "queue-icon-global-edit: only global scope must change, regardless of editing/active set")
ItemRackOpt.OpenQueueIconPicker(); reset.scripts.OnClick(reset)
check(global.customIcon==nil and global.priority and global.delay=="7" and ItemRack.GetTextureBySlot(9)=="original",
  "global reset must restore native artwork without changing priority or delay")
ItemRackOpt.OpenQueueIconPicker(); ItemRackOpt.ApplyQueueItemIcon(101)

-- A final page whose count is not a multiple of five must hide stale cells,
-- and scrolling back must restore the entire grid without changing set icons.
ItemRackOpt.Icons[81]=1081; ItemRackOpt.Icons[82]=1082
ItemRackOpt.OpenQueueIconPicker(); picker.scroll:SetValue(12)
check(picker.buttons[1].iconValue==1061 and picker.buttons[22].iconValue==1082
  and picker.buttons[22].visible and not picker.buttons[23].visible
  and not picker.buttons[24].visible and not picker.buttons[25].visible,
  "queue-icon-partial-page: unused final-page cells must be hidden")
picker.scroll:SetValue(0)
check(picker.buttons[25].visible and picker.buttons[25].iconValue==1025
  and ItemRackOpt.selectedIcon==456 and ItemRackOpt.selectedIconIndex==8,
  "scrolling back must restore visible cells without altering the set-icon picker")
picker:Hide()
ItemRackUser.EnablePerSetQueues="ON"
ItemRackUser.CurrentSet="Stealth"
check(equipment[9]==wanted and ItemRack.GetTextureBySlot(9)==808 and global.customIcon==101
  and ItemRackUser.Sets.PvP.Queues[9][1].customIcon==303 and not picker.context and not picker.visible,
  "terminal icon-edit state must retain gear, scopes and cleaned popup state")

-- October 5 local report: SortListScrollFrameUpdate line 2023 in the earlier
-- loaded build calls a nil global GetItemQualityColor. Reported locals identify
-- Hunting Boots, texture 132592, quality 1, slot 8 and a two-entry queue.
-- The full boot ID/client build were not supplied; identity is synthetic here.
local reportBoots="900001:0:0:0:0:0:0:0"
local bootsEntry={id=reportBoots,priority=true,keep=false,delay=7,customIcon=132592}
local bootsQueue={bootsEntry,{id=0}}
ItemRackUser.Queues[8]=bootsQueue; ItemRackUser.QueuesEnabled[8]=true
ItemRackUser.EnablePerSetQueues="OFF"
ItemRackOpt.SelectedSlot=8; ItemRackOpt.SortSelected=1; ItemRackOpt.QueueEditingSet=nil
equipment[8]=reportBoots
local originalItemInfo=ItemRack.GetInfoByID
ItemRack.GetInfoByID=function(id)
  if id==reportBoots then return "Hunting Boots",132592,"INVTYPE_FEET",1 end
  return originalItemInfo(id)
end
GetItemQualityColor=nil
local qualityCalls=0
C_Item={GetItemQualityColor=function(quality) assert(quality==1); qualityCalls=qualityCalls+1; return 1,1,1 end}
local rendered,error=pcall(ItemRackOpt.SortListScrollFrameUpdate)
check(rendered,"reported-queue-quality-api-missing-global: boots queue must render with namespaced API: "..tostring(error))
check(ItemRackOptSortList1Name.text=="Hunting Boots" and ItemRackOptSortList1Icon.texture==132592
  and ItemRackOptSortList1.visible and ItemRackOptSortList2.visible and qualityCalls==2
  and ItemRackOptSortList1Name.color[1]==1 and ItemRackOptSortList1Name.color[4]==1,
  "reported boots row and stop marker must remain visible after quality fallback")
check(equipment[8]==reportBoots and ItemRackUser.CurrentSet=="Stealth" and ItemRackUser.Queues[8]==bootsQueue
  and bootsEntry.priority and bootsEntry.delay==7 and bootsEntry.customIcon==132592
  and ItemRackOpt.SortSelected==1 and not picker.context,
  "quality fallback must preserve final gear, queue scope, saved settings and popup cleanup")
GetItemQualityColor=function() return .1,.2,.3 end
C_Item.GetItemQualityColor=function() error("legacy API must take precedence when present") end
ItemRackOpt.SortListScrollFrameUpdate()
check(ItemRackOptSortList1Name.color[1]==.1 and ItemRackOptSortList1Name.color[3]==.3,
  "legacy-quality-api: existing clients must retain their native row colors")
GetItemQualityColor=nil; C_Item=nil
ITEM_QUALITY_COLORS={[1]={r=.2,g=.3,b=.4}}
ItemRackOpt.SortListScrollFrameUpdate()
check(ItemRackOptSortList1Name.color[1]==.2 and ItemRackOptSortList1Name.color[3]==.4,
  "quality-color-table-fallback: clients without either API must use native quality constants")
ITEM_QUALITY_COLORS=nil
ItemRackOpt.SortListScrollFrameUpdate()
check(ItemRackOptSortList1Name.color[1]==1 and ItemRackOptSortList1Name.color[3]==1
  and ItemRackOptSortList1.visible,"quality-color-white-fallback: no color provider must still render the queue")
C_Item={GetItemQualityColor=function() return nil end}
ItemRackOpt.SortListScrollFrameUpdate()
check(ItemRackOptSortList1Name.color[1]==1,"an incomplete namespaced provider must retain safe fallback colors")
check(bootsEntry.priority and bootsEntry.delay==7 and equipment[8]==reportBoots
  and ItemRackUser.Queues[8]==bootsQueue and ItemRackUser.CurrentSet=="Stealth" and not picker.context,
  "all provider variants must preserve final equipment, saved policies and cleanup")

-- Follow-up trace: Stonesplinter Axe, icon 132410, quality 2, main-hand slot
-- and six queue entries. Line 2204 matches pre-fix dev's same global call.
-- No full item identity/client build was supplied; identities are synthetic.
local reportAxe="900002:0:0:0:0:0:0:0"
local axeEntry={id=reportAxe,priority=true,delay=3,customIcon=132410}
local axeQueue={axeEntry,{id=other},{id=missing},{id=wanted},
  {id=wanted..":runeid:7"},{id=0}}
ItemRackUser.Queues[16]=axeQueue; ItemRackUser.QueuesEnabled[16]=true
ItemRackOpt.SelectedSlot=16; ItemRackOpt.SortSelected=nil; equipment[16]=reportAxe
ItemRack.GetInfoByID=function(id)
  if id==reportAxe then return "Stonesplinter Axe",132410,"INVTYPE_WEAPONMAINHAND",2 end
  return originalItemInfo(id)
end
GetItemQualityColor=nil
C_Item={GetItemQualityColor=function(quality)
  if quality==2 then return .12,1,0 end
  return 1,1,1
end}
rendered,error=pcall(ItemRackOpt.SortListScrollFrameUpdate)
check(rendered,"reported-axe-quality-api-missing-global: six-row main-hand queue must render: "..tostring(error))
check(ItemRackOptSortList1Name.text=="Stonesplinter Axe" and ItemRackOptSortList1Icon.texture==132410
  and ItemRackOptSortList1Name.color[1]==.12 and ItemRackOptSortList1Name.color[2]==1
  and ItemRackOptSortList6.visible and not ItemRackOptSortList7.visible,
  "reported axe row must retain uncommon color and correct six-entry visibility")
check(equipment[16]==reportAxe and ItemRackUser.CurrentSet=="Stealth" and ItemRackUser.Queues[16]==axeQueue
  and axeEntry.priority and axeEntry.delay==3 and ItemRackOpt.QueueEditingSet==nil and not picker.context,
  "axe renderer must preserve terminal gear, global queue context, settings and cleanup")

-- October 5 user trace at GetQueueItemLocation:1830: the supplied identity
-- reaches the first bag scan with the legacy global container API absent.
local reportedContainerID="6256::::::::16:1485::14:::::::"
local containerEntry={id=reportedContainerID,priority=true,delay=5}
local containerQueue={containerEntry,{id=0}}
ItemRackUser.Queues[16]=containerQueue
bags[0]={[1]=reportedContainerID}
local legacyContainerSlots=GetContainerNumSlots
GetContainerNumSlots=nil
C_Container={GetContainerNumSlots=legacyContainerSlots}
local located,location=pcall(ItemRackOpt.GetQueueItemLocation,reportedContainerID)
check(located and location=="carried",
  "reported-queue-container-api-missing-global: supplied identity must resolve through C_Container: "..tostring(location))
ItemRackOpt.SortListScrollFrameUpdate()
check(ItemRackOptSortList1.visible and ItemRackOptSortList2.visible
  and not ItemRackOptSortList1Name.text:match("not carried"),
  "queue renderer must retain carried status with both legacy container and quality globals absent")
bags[0][1]=nil; bags[-1]={[1]=reportedContainerID}; ItemRack.BankOpen=true
check(ItemRackOpt.GetQueueItemLocation(reportedContainerID)=="bank",
  "namespaced container API must also resolve exact open-bank contents")
ItemRackOpt.SortListScrollFrameUpdate()
check(ItemRackOptSortList1Name.text:match("in bank"),"namespaced bank result must reach the Queue row label")
ItemRack.BankOpen=false
check(ItemRackOpt.GetQueueItemLocation(reportedContainerID)=="missing",
  "closed bank must not manufacture carried ownership with modern container APIs")
check(equipment[16]==reportAxe and ItemRackUser.CurrentSet=="Stealth" and ItemRackUser.Queues[16]==containerQueue
  and containerEntry.id==reportedContainerID and containerEntry.priority and containerEntry.delay==5
  and not picker.context,"container compatibility must leave equipment, scope, entry policy and popup cleanup intact")
C_Container=nil; GetContainerNumSlots=legacyContainerSlots; bags[0][1]=reportedContainerID
check(ItemRackOpt.GetQueueItemLocation(reportedContainerID)=="carried",
  "legacy-only-container-api: older clients must retain carried item discovery")
GetContainerNumSlots=function() error("namespaced container API must take precedence when both exist") end
C_Container={GetContainerNumSlots=legacyContainerSlots}
check(ItemRackOpt.GetQueueItemLocation(reportedContainerID)=="carried",
  "namespaced-container-precedence: use the same API preference as core discovery")
GetContainerNumSlots=nil; C_Container=nil
check(ItemRackOpt.GetQueueItemLocation(reportedContainerID)=="unknown",
  "absent-container-api: unknown availability must not become a false missing-item assertion")
ItemRackOpt.SortListScrollFrameUpdate()
check(ItemRackOptSortList1Name.text:match("availability unknown") and ItemRackOptSortList1.visible,
  "no container provider must still render saved entries with an honest unknown status")
check(ItemRackOpt.GetQueueItemLocation(reportAxe)=="carried",
  "equipped identity must remain known even when no bag provider is available")
C_Container={GetContainerNumSlots=function() return nil end}
check(ItemRackOpt.GetQueueItemLocation(reportedContainerID)=="missing",
  "nil slot-count results must not cause a numeric loop error")
check(containerEntry.id==reportedContainerID and containerEntry.priority and containerEntry.delay==5
  and ItemRackUser.Queues[16]==containerQueue and equipment[16]==reportAxe and not picker.context,
  "all container provider variants must retain saved data, gear and popup cleanup")
print(string.format("[QUEUE ITEM ICON LUA] %d scope, picker, persistence and presentation checks passed.",checks))
`, 'queue-item-icons');
