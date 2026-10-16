const { extractFunction, runLua } = require('./lib/lua_harness');
const assert = require('assert');
const fs = require('fs');
const scaleOptions = fs.readFileSync('ItemRackOptions/ItemRackOptions.lua', 'utf8');
assert.match(scaleOptions, /type="slider",button=ItemRackOptEquip20ScaleSlider[^\r\n]*min=\.5, max=4, step=\.05/, 'Set button scale must support 0.5x through 4x');
assert.match(scaleOptions, /type="slider",button=ItemRackOptMainScaleSlider[^\r\n]*max=2/, 'Equipment scale maximum must remain 2x');
assert.match(scaleOptions, /type="slider",button=ItemRackOptMenuScaleSlider[^\r\n]*max=2/, 'Menu scale maximum must remain 2x');

const buttonsFile = 'ItemRack/ItemRackButtons.lua';
// Settings clarity and dropdown wiring use the actual Options functions.
runLua(String.raw`
ItemRackOpt={MinimapMenuDirs={"Auto","Up","Down","Left","Right"}}
ItemRackSettings={MinimapMenuDir="Left"}; ItemRackUser={QuickAccessMenuDir="Saved"}
local function control() return {SetWidth=function(s,v) s.width=v end,GetWidth=function(s) return s.width end,
 SetScript=function(s,k,v) s[k]=v end,SetText=function(s,v) s.text=v end,
 GetStringWidth=function(s) return #s.text*6 end} end
ItemRackOptMinimapMenuDir=control(); ItemRackOptMinimapMenuDirText=control(); ItemRackOptMinimapMenuDirButton=control()
ItemRackOptQuickAccessMenuDir=control(); ItemRackOptQuickAccessMenuDirText=control(); ItemRackOptQuickAccessMenuDirButton=control()
local combat=false
function InCombatLockdown() return combat end
function CreateFrame(_,name)
 local f=control(); _G[name]=f
 function f:SetFrameStrata() end; function f:SetPoint() end; function f:SetSize() end
 function f:SetBackdrop() end; function f:SetBackdropColor() end
 function f:Hide() self.shown=false end; function f:Show() self.shown=true end
 function f:IsShown() return self.shown end
 return f
end
${extractFunction('ItemRackOptions/ItemRackOptions.lua','ItemRackOpt.UpdateMinimapMenuDir')}
${extractFunction('ItemRackOptions/ItemRackOptions.lua','ItemRackOpt.UpdateQuickAccessMenuDir')}
${extractFunction('ItemRackOptions/ItemRackOptions.lua','ItemRackOpt.ToggleQuickAccessMenuDirPick')}
${extractFunction('ItemRackOptions/ItemRackOptions.lua','ItemRackOpt.GetOptionTooltip')}
ItemRackOpt.UpdateMinimapMenuDir(); ItemRackOpt.UpdateQuickAccessMenuDir()
assert(ItemRackOptMinimapMenuDirText.text=="Minimap: Left" and ItemRackOptMinimapMenuDir.width==106,
 "minimap label must identify source and fit longest compact direction label")
assert(ItemRackOptQuickAccessMenuDirText.text=="Breakout: Saved" and ItemRackOptQuickAccessMenuDir.width==112,
 "breakout selector must fit all choices")
ItemRackOpt.ToggleQuickAccessMenuDirPick(); ItemRackOptQuickAccessMenuDirPick5.OnClick()
assert(ItemRackUser.QuickAccessMenuDir=="Right" and ItemRackSettings.MinimapMenuDir=="Left",
 "breakout selection must save independently and not change minimap")
combat=true; ItemRackOptQuickAccessMenuDirPick2.OnClick()
assert(ItemRackUser.QuickAccessMenuDir=="Right","an open picker must not change combat-locked setting")
assert(ItemRackOpt.GetOptionTooltip({optset=ItemRackUser,tooltip="Test"})=="This character. Test","character scope must be explicit")
assert(ItemRackOpt.GetOptionTooltip({optset=ItemRackSettings,tooltip="Test"})=="Account-wide. Test","account scope must be explicit")
`, 'settings-direction-and-clarity');
const setButtonScale = extractFunction(buttonsFile, 'ItemRack.SetButtonScale');
const reflectEquip20Scale = extractFunction(buttonsFile, 'ItemRack.ReflectEquip20Scale');
const reflectMainScale = extractFunction(buttonsFile, 'ItemRack.ReflectMainScale');

runLua(String.raw`
local inCombat = false
local queued = {}
local frames = {}

function InCombatLockdown() return inCombat end
function queueAfterCombatOnce(name) table.insert(queued,name) end
UIParent = {}
ItemRackUser = {
  MainScale = 0.80,
  Equip20Scale = 1.40,
  Buttons = {},
}
ItemRack = {}

for i=0,20 do
  local frame = { scale=1, left=100+i, top=200+i }
  function frame:SetScale(value) self.scale=value end
  function frame:GetScale() return self.scale end
  function frame:GetLeft() return self.left end
  function frame:GetTop() return self.top end
  function frame:ClearAllPoints() self.anchored=false; self.cleared=true end
  function frame:SetPoint(point,parent,relativePoint,x,y)
    assert(not self.anchored,"reported-set-scale-anchor-family: must clear old anchors before absolute repositioning")
    self.anchored=true
    self.point,self.parent,self.relativePoint,self.left,self.top=point,parent,relativePoint,x,y
  end
  frames[i]=frame
  _G["ItemRackButton"..i]=frame
end

${setButtonScale}
${reflectEquip20Scale}
${reflectMainScale}

local checks=0
local function check(value,message) assert(value,message); checks=checks+1 end

ItemRack.ReflectMainScale()
for i=0,19 do
  check(frames[i].scale==0.80,"equipment button "..i.." must use Button scale")
end
check(frames[20].scale==1.40,"Equip 20 must use its independent Set button scale")

ItemRackUser.MainScale=1.10
ItemRack.ReflectMainScale()
check(frames[0].scale==1.10 and frames[19].scale==1.10,
  "changing Button scale must update equipment slots")
check(frames[20].scale==1.40,
  "changing Button scale must not overwrite the configured Equip 20 scale")

ItemRackUser.Buttons[20]={ Left=frames[20].left, Top=frames[20].top }
frames[20].scale=1.25
frames[20].left=400
frames[20].top=500
ItemRackUser.Equip20Scale=1.50
ItemRack.ReflectEquip20Scale(1)
check(frames[20].scale==1.50,"Set button slider must update only Equip 20")
check(math.abs(frames[20].left-(500/1.50))<0.0001 and math.abs(frames[20].top-(625/1.50))<0.0001,
  "rescaling a positioned Equip 20 button must retain its physical screen position")
check(ItemRackUser.Buttons[20].Left==frames[20].left and ItemRackUser.Buttons[20].Top==frames[20].top,
  "rescaled Equip 20 coordinates must persist")
check(frames[19].scale==1.10,"Set button slider must leave equipment-slot scales unchanged")

ItemRackUser.Equip20Scale=4
local physicalLeft=frames[20].left*frames[20].scale
local physicalTop=frames[20].top*frames[20].scale
ItemRack.ReflectEquip20Scale(1)
check(frames[20].scale==4,"Set button must reach 4x without clamping")
check(math.abs(frames[20].left*4-physicalLeft)<0.0001 and math.abs(frames[20].top*4-physicalTop)<0.0001,
  "4x scaling must preserve physical screen position")
check(frames[19].scale==1.10,"4x set scale must not enlarge equipment slots")

-- Reported 25x SetPoint anchor-family failure: scale already 4, saved position
-- 223.500122/61.5; unlike the old mock, an existing anchor must be replaced.
frames[20].left=223.500122; frames[20].top=61.5; frames[20].anchored=true
ItemRack.ReflectEquip20Scale(1)
check(frames[20].scale==4 and math.abs(frames[20].left-223.500122)<0.0001,
  "reported-set-scale-anchor-family: repeated 4x updates must retain position")
check(frames[20].cleared,"reported anchor family must be cleared before repositioning")
ItemRackUser.Buttons[20].DockTo=19
ItemRackUser.Buttons[19]={}
local dockedLeft=frames[20].left
ItemRackUser.Equip20Scale=2
ItemRack.ReflectEquip20Scale(1)
check(frames[20].scale==2 and frames[20].left==dockedLeft,
  "docked set button must scale without replacing its docking anchor")
check(ItemRackUser.Buttons[20].DockTo==19,"scaling must preserve docking metadata")
ItemRackUser.Buttons[20].DockTo=nil
ItemRackUser.Equip20Scale=4; ItemRack.ReflectEquip20Scale(1)

inCombat=true
ItemRackUser.Equip20Scale=0.65
ItemRack.ReflectEquip20Scale(1)
ItemRack.ReflectMainScale(1)
check(frames[20].scale==4,"protected scale changes must not run during combat")
check(#queued==2 and queued[1]=="ReflectEquip20Scale" and queued[2]=="ReflectMainScale",
  "both scale controls must coalesce through their named post-combat work")

print(string.format("[BUTTON SCALES LUA] %d independent Equip 20 checks passed.",checks))
`, 'button-scales');
