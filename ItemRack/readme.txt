ItemRack Universal
==================

ItemRack is an equipment-set, quick-access, event, and cooldown-queue addon for
World of Warcraft Classic clients. One release supports:

* Classic Era, Hardcore, and Season of Discovery
* Burning Crusade Classic Anniversary
* WoW Forever/Camelot

The release archive contains two folders that must remain side by side:

* ItemRack - the always-loaded runtime
* ItemRackOptions - the load-on-demand configuration interface

Both folders belong to the same addon distribution. Do not rename either folder.


QUICK START
-----------

1. Type /itemrack opt or right-click the minimap button.
2. Open Sets, choose the slots to include, enter a name, choose an icon,select your associated spec, and
   save the set.
3. Equip a set from the minimap menu, a set button, its assigned key, or
   /itemrack equip <set name>.
4. Open Events and explicitly enable only the automatic behaviors you want.
5. Open Queue to configure cooldown-item order and per-item policies.

ItemRack can save full or partial sets. It distinguishes copies of the same
base item when their enchants, gems, suffixes, or runes differ. When an exact
saved copy is unavailable, compatibility fallbacks are used only where the
saved identity permits them.


MINIMAP AND DATA-BROKER CONTROLS
-------------------------------

* Left-click: open the saved-set menu.
* Right-click: open ItemRack Options.
* Shift-click: unequip the current set.
* Alt-left-click: show hidden sets in the menu.
* Alt-right-click: toggle all ItemRack events on or off.

Global Settings can lock the minimap button and set its menu direction to Auto,
Up, Down, Left, or Right.


QUICK-ACCESS BUTTONS
--------------------

* Alt-click an equipment slot on the character sheet to create or remove its
  quick-access button.
* Alt-click the character model to create or remove the set button (slot 20).
* Left-click an equipment-slot button to use its equipped item.
* Alt-left-click an equipment-slot button to toggle its Auto Queue.
* Alt-right-click an equipment-slot button to open its Queue configuration.
* Shift-left-click an equipment-slot button while chat input is open to link
  the equipped item.
* Drag an unlocked button to move its docked group. Shift-drag moves only that
  button and breaks it away from the group.

Right-click behavior for equipment-slot buttons follows Global Settings:

* Menu on Right-Click opens the flyout.
* Otherwise, Use on Right-Click uses the equipped item.
* With both settings off, right-click advances to the next valid queue item.

Set button controls:

* Left-click equips the current set, or toggles it when Equip Toggle is enabled.
* Right-click opens the set flyout when Menu on Right-Click is enabled;
  otherwise it opens Options.
* Shift-left-click unequips the current set.
* Alt-left-click toggles ItemRack events.
* Alt-right-click opens the Sets tab.

Button size, scale, alpha, spacing, breakout spacing, docking, visibility, and
tooltip behavior are configurable in Options.


FLYOUT MENUS AND BANKS
----------------------

* Click an item or set to select/equip it.
* Shift-click an item while chat input is open to link it.
* Alt-click an item to hide or unhide it when Allow Hidden is enabled.
* Hold Alt while opening a menu to include hidden entries.
* Right-click the menu frame to switch between vertical and horizontal layouts.
* Drag the menu border to dock it to another side of its button.

While the bank is open, banked entries receive a distinct border. A normal
click transfers an item or set between bank and bags according to where it is
currently stored. Shift-click requests direct equipping instead. Transfers
stop with a message when the destination has no free space.


AUTO QUEUE
----------

Auto Queue replaces equipped items as cooldown availability changes.

1. Enable a slot with Alt-left-click or from the Queue tab.
2. Arrange items from highest to lowest preference.
3. Configure item policies such as Priority, Pause Queue, Burn on Use, and
   timing delays.
4. Use the stop marker when lower entries should remain outside automatic
   selection. If it was removed, use Add stop marker to restore it.

Queues may be global or saved per set. Owner, item order, enabled state,
policies, and custom icons are resolved together so a set or event transition
does not combine unrelated queue state. The icon picker can search item names,
texture names, spell names, and spell IDs, including supported cross-class
spell artwork for the running client family.

Queue matching is exact-item aware. Different enchants, gems, suffixes, and
runes do not incorrectly burn or replace one another. Saved unavailable items
remain editable and the open bank is recognized without treating bank-only
items as carried queue candidates.


COMBAT, CASTING, AND DEFERRED SWAPS
----------------------------------

Ordinary swaps that the client does not permit during combat, casting, loading,
or item locks remain queued and reconcile when the restriction ends. ItemRack
uses observed equipment transactions and rolls back incomplete multi-step set
changes instead of assuming submitted pickup calls succeeded.

Weapon-only saved-set keybindings can equip through secure actions during
combat. Enable Full-set hotkeys swap weapons in combat in Global Settings if
full-set keybindings should equip their weapon portion immediately; the
remaining gear finishes after combat. This works only for a saved-set key assigned with Sets > Bind Key.
Flyout-menu selections, /itemrack equip macros,
events, and queues are ordinary requests and wait until combat ends. Combat key
presses equip rather than toggle. Character-sheet slots and created quick-access
buttons show the requested item while any part of that bound set remains pending.
An icon clears when its exact item is observed equipped or the request ends.

Rune-specific weapons, empty weapon slots, ordinary menu requests, and ordinary
Queue requests wait for the normal deferred planner. Newer manual choices and
explicit toggle-off actions replace stale pending automatic work.


EVENTS
------

ItemRack supports Buff, Stance, Zone, Specialization, and Script events.
Packaged examples include mounting, movement, drinking, class forms/stances,
specializations, PvP/raid zones, and script demonstrations.

Assign a saved set to an event and explicitly enable that event in the Events
tab. Linking a set to a specialization does not silently enable automatic
specialization swaps. Buff/mount events can be limited to movement and can use
the stop-delay and PvP-instance options exposed by the editor.

Automatic events use ordered, per-slot ownership. Overlapping events and sets
can restore the correct lower-priority or manually selected gear without the
old requirement to design non-overlapping sets. Manual equipment choices
release conflicting automatic ownership.


SCRIPT-EVENT SAFETY
-------------------

Script events execute Lua with addon privileges. A valid script saved through
ItemRack's editor receives approval for its exact name, trigger, and source.
A script inserted or changed outside that interface remains disabled until the
player gives explicit approval in ItemRack. Changing approved source invalidates
the approval, and rejected or invalid additions are not persisted as enabled.

Inside a Script event, use:

  EquipEventSet("set name")
  UnequipEventSet()

The event-local EquipSet/UnequipSet compatibility functions are routed through
the same ownership system for ordinary use. Calling ItemRack.EquipSet or
ItemRack.UnequipSet directly is the low-level path and is not automatically
owned by the Script event.

WoW addons share a Lua environment, so no addon can completely sandbox a
hostile addon or WeakAura. Remove untrusted code that introduced a malicious
script.


SLASH COMMANDS
--------------

/itemrack
  Show the common commands.

/itemrack opt
/itemrack options
  Open ItemRack Options.

/itemrack equip <set name>
  Equip a saved set.

/itemrack toggle <set name>
  Equip or unequip a saved set.

/itemrack toggle <set one>, <set two>
  Switch between two saved sets.

/itemrack lock
/itemrack unlock
  Lock or unlock quick-access buttons.

/itemrack reset
  Reset quick-access buttons and positions.

/itemrack reset everything
  Erase ItemRack settings, sets, queues, and events, then reload the UI.

/itemrack debug
  Toggle all diagnostic categories in silent mode.

/itemrack debug chat
  Toggle live diagnostic output in chat.

/itemrack debug status
/itemrack debug clear
/itemrack debug audit
/itemrack debug help
  Inspect diagnostics, clear recorded data, audit SavedVariables, or list
  diagnostic commands.

/itemrack debug <tag>
  Toggle one of: events, equip, queue, combatqueue, api, ui, or combat.

/itemrack dump
  Open a copyable support report containing version/build information, client
  state, event ownership, equipment transactions, queue state, locks, and
  recent diagnostics. Review the report before sharing because it can include
  set names and item information.


MACRO FUNCTIONS
---------------

EquipSet("set name")
UnequipSet("set name")
ToggleSet("set name")
IsSetEquipped("set name")

The ItemRack.EquipSet, ItemRack.UnequipSet, ItemRack.ToggleSet, and
ItemRack.IsSetEquipped forms are also available. The short global names are
assigned at login for macro compatibility.


COMPLETE SETTINGS REFERENCE
---------------------------

Scope terms used below:

* Character-specific settings are stored separately for each character.
* Account-wide settings are shared by characters using the same WoW account.
* Fresh-profile default is the value used before an existing saved setting or
  Blizzard setting overrides it.

Character settings:

* Lock Buttons [Character-specific; Fresh-profile default: OFF] Prevents
  quick-access buttons, menus, and the minimap button from being moved.
* Enable events [Character-specific; Fresh-profile default: ON] Enables the
  character's configured automatic gear events. Individual events must also be
  enabled.
* Enable auto queues [Character-specific; Fresh-profile default: ON] Allows
  enabled cooldown queues to select replacement items.
* Enable per-set queues [Character-specific; Fresh-profile default: OFF;
  requires Enable auto queues] Stores queue order, policies, icons, and enabled
  state with each saved set instead of using only Global Queues.
* Enable queue context check [Character-specific; Fresh-profile default: ON]
  Lets partial sets inherit queue context for untouched slots from the prior
  active set.
* Custom icons on character sheet [Character-specific; Fresh-profile default:
  OFF] Replaces ItemRack-managed character-slot artwork with the active queue
  item's custom icon without changing item identity or tooltips.
* Custom icons in item flyouts [Character-specific; Fresh-profile default: OFF]
  Shows queue custom icons in quick-access and character-sheet flyouts; set
  editing continues to show the real item artwork.
* Button spacing [Character-specific; Fresh-profile default: 4; range: 0-24]
  Sets padding between docked quick-access buttons. It is combat locked.
* Breakout spacing [Character-specific; Fresh-profile default: 4; range: 0-24]
  Sets padding between flyout entries independently of Button spacing. It is
  combat locked.
* Transparency [Character-specific; Fresh-profile default: 1.00; range:
  0.10-1.00] Sets quick-access button and menu opacity.
* Button scale [Character-specific; Fresh-profile default: 1.00; range:
  0.50-2.00] Scales dockable buttons. It is combat locked.
* Menu scale [Character-specific; Fresh-profile default: 0.85; range:
  0.50-2.00] Scales flyouts relative to their owner button.
* Default size [Character-specific; Fresh-profile default: ON] Uses 100 percent
  Options-window scale. Default size, Bigger, and Biggest are mutually
  exclusive.
* Bigger [Character-specific; Fresh-profile default: OFF] Uses 130 percent
  Options-window scale.
* Biggest [Character-specific; Fresh-profile default: OFF] Uses 160 percent
  Options-window scale.
* Quick menu wrap [Character-specific; Fresh-profile default: OFF] Uses a fixed
  row or column length for quick-access and saved-set flyouts instead of the
  automatic screen-aware layout.
* When to wrap [Character-specific; Fresh-profile default: 3; range: 1-30]
  Supplies the fixed item count for the enabled Quick menu wrap or Char sheet
  wrap control beside it.
* Char sheet wrap [Character-specific; Fresh-profile default: OFF] Uses a fixed
  row or column length for character-sheet slot flyouts.

Global Settings (account-wide):

* Full-set hotkeys swap weapons in combat [Account-wide; Fresh-profile default:
  OFF] Applies only to saved-set keys assigned with Sets > Bind Key. Weapon-only
  bound sets already use a secure combat action. When enabled, a bound full set
  equips slots 16-18 immediately and queues its other gear. Flyout clicks,
  /itemrack equip macros, events, and queues still wait until combat ends.
  Rune-specific and empty-slot weapon requests also wait.
* Menu on Shift [Account-wide; Fresh-profile default: OFF] Opens flyouts only
  while Shift is held.
* Menu on right click [Account-wide; Fresh-profile default: OFF] Opens item and
  set flyouts with right-click rather than hover. Enabling it disables Menu on
  Shift; Alt-right-click remains the configuration action.
* Use on Right-Click [Account-wide; Fresh-profile default: OFF] Uses the equipped
  item when an equipment button is right-clicked instead of advancing its queue.
* Hide out of combat [Account-wide; Fresh-profile default: OFF] Hides docked
  quick-access buttons when the character is not in combat. It is combat locked.
* Hide during pet battles [Account-wide; Fresh-profile default: ON] Hides
  quick-access buttons during pet battles.
* Hide in arenas [Account-wide; Fresh-profile default: OFF] Hides docked buttons
  and closes their flyout in arena instances. It is combat locked.
* Allow empty slots [Account-wide; Fresh-profile default: ON] Adds an unequip
  choice to applicable item flyouts.
* Allow hidden items [Account-wide; Fresh-profile default: ON] Allows Alt-click
  to hide or reveal flyout entries; holding Alt while opening includes hidden
  entries.
* Hide tradables [Account-wide; Fresh-profile default: OFF] Omits currently
  tradable gear from equipment flyouts.
* Disable Alt+Click [Account-wide; Fresh-profile default: OFF] Stops Alt-click on
  quick-access equipment buttons from toggling their Auto Queue, allowing that
  key combination to be used for actions such as self-cast. It is combat locked.

Cooldown Settings:

* Notify when ready [Account-wide; Fresh-profile default: ON] Announces when an
  ItemRack-tracked used item becomes ready.
* Notify at 30 [Account-wide; Fresh-profile default: OFF] Announces when a
  tracked cooldown reaches 30 seconds.
* Notify chat also [Account-wide; Fresh-profile default: OFF] Copies enabled
  cooldown notices to chat in addition to floating combat text when available.
* Cooldown numbers [Account-wide; Fresh-profile default: OFF] Draws remaining
  cooldown time over ItemRack item buttons.
* Large numbers [Account-wide; Fresh-profile default: OFF; requires Cooldown
  numbers] Uses the larger countdown font.
* Countdown at 90 [Account-wide; Fresh-profile default: OFF; requires Cooldown
  numbers] Changes the display from minutes to seconds at 90 seconds rather than
  at 60 seconds.

Tooltip Settings:

* Show tooltips [Account-wide; Fresh-profile default: ON] Enables ItemRack-owned
  tooltips.
* Show set info in tooltips [Account-wide; Fresh-profile default: OFF; requires
  Show tooltips] Lists public saved sets containing the hovered exact item.
* Highlight unequipped in tooltip [Account-wide; Fresh-profile default: OFF;
  requires Show tooltips] Colors set members orange when they are carried but
  not equipped.
* Tiny Tooltips [Account-wide; Fresh-profile default: OFF; requires Show
  tooltips] Condenses all ItemRack item tooltips to key name, cooldown, and
  durability information.
* Tiny Tooltips on Quick Access Only [Account-wide; Fresh-profile default: OFF;
  requires Show tooltips] Limits condensed tooltips to quick-access controls and
  leaves character-sheet flyouts full size. It is mutually exclusive with Tiny
  Tooltips.
* Quick Access Sub Menus Only [Account-wide; Fresh-profile default: OFF;
  requires Tiny Tooltips on Quick Access Only] Limits condensation to flyout
  rows rather than the owning slot button.
* Disable tooltips in combat [Account-wide; Fresh-profile default: OFF; requires
  Show tooltips] Suppresses ItemRack button and flyout tooltips during combat.
* Tooltips at pointer [Account-wide; Fresh-profile default: OFF; requires Show
  tooltips] Anchors ItemRack tooltips near the cursor.

Interface & Misc:

* Show minimap button [Account-wide; Fresh-profile default: ON] Shows the
  LibDataBroker minimap launcher.
* Show minimap tooltip [Account-wide; Fresh-profile default: ON; requires Show
  minimap button] Displays launcher mouse-control help.
* Lock minimap button [Account-wide; Fresh-profile default: OFF; requires Show
  minimap button] Prevents the launcher from being dragged independently.
* Flyout Menu direction [Account-wide; Fresh-profile default: Auto] Chooses
  Auto, Up, Down, Left, or Right for the minimap saved-set flyout. Auto chooses
  a direction from the launcher's screen position.
* TrinketMenu mode [Account-wide; Fresh-profile default: OFF] Combines both
  trinket flyouts: left-click equips the upper slot and right-click the lower.
* Anchor other trinket [Account-wide; Fresh-profile default: OFF; requires
  TrinketMenu mode] Anchors that combined flyout to the lower trinket instead.
* Toggle sets on equip [Account-wide; Fresh-profile default: OFF] Makes an
  already-equipped set request restore its remembered prior gear. Secure combat
  hotkey presses always retain equip intent.
* Show key bindings [Account-wide; Fresh-profile default: OFF] Draws assigned
  keys on ItemRack quick-access buttons.
* Equip in options [Account-wide; Fresh-profile default: OFF] Equips items and
  sets when they are selected in the Sets editor.
* Character sheet menus [Account-wide; Fresh-profile default: ON] Opens ItemRack
  item flyouts while hovering character equipment slots.
* Left slots: menu on right [Account-wide; Fresh-profile default: ON; requires
  Character sheet menus] Opens left-column character-slot flyouts inward on the
  right side.
* Right slots: menu on left [Account-wide; Fresh-profile default: OFF; requires
  Character sheet menus] Opens right-column character-slot flyouts inward on the
  left side.
* Slot Key Bindings [Character-specific action] Opens the equipment-slot binding
  picker. Saved-set bindings instead use the Sets-tab Bind Key button.
* Reset Buttons [Character-specific destructive action] Removes quick-access
  buttons and restores their layout, opacity, and scale defaults; it does not
  delete saved sets.
* Reset Events [Account-wide destructive action] Offers restoration or reset of
  event definitions and character event assignments.
* Reset Everything [Character and account destructive action] Erases ItemRack
  settings, sets, queues, and events and reloads the UI.
* Sound Settings [Account-wide] Opens the event sound editor. Disable Swap Sounds
  silences automatic swap sounds globally; Per-event sound selects an
  optional LibSoundIndex sound for one event. LibSoundIndex is optional.

Set editor:

* Show SoD rune icons [Blizzard client setting; Fresh-profile ItemRack display:
  OFF] Controls Blizzard's always-show rune setting and ItemRack rune markers on
  supported Season of Discovery clients.
* Show Helm and Show Cloak [Character appearance controls] Save the current
  visibility choices with a set.
* Primary Spec and Secondary Spec [Character-specific set association] Link one
  saved set to a specialization event. Saving an association does not silently
  enable the global event system.
* Hide Set [Character-specific set property; Fresh-profile default: OFF] Omits
  the set from normal flyouts; hold Alt to include hidden sets.
* Bind Key [Character-specific binding] Assigns the secure saved-set action used
  by combat-capable weapon hotkeys. A chat macro containing /itemrack equip is not the same action
  and cannot perform protected equipment changes in combat.

Queue editor:

The compact row labels are Priority, Pause Queue, Burn, Swap in, and sec. The
slot and set controls use Auto Queue This Slot and Hide respectively.

* Auto Queue This Slot [Character-specific or per-set; Fresh-profile default:
  OFF per slot] Enables automatic selection for the displayed queue owner.
* Item delay [Queue-item policy; Fresh-profile default: 0 seconds] Delays when a
  candidate becomes eligible after its cooldown state permits it.
* Priority [Queue-item policy; Fresh-profile default: OFF] Prefers the entry when
  it is otherwise eligible.
* Pause Queue [Queue-item policy; Fresh-profile default: OFF] Keeps the entry
  equipped rather than immediately advancing below it.
* Burn on Use [Queue-item policy; Fresh-profile default: OFF; UI label: Burn]
  Advances after ItemRack observes use of that exact item copy.
* Custom Swap In [Queue-item policy; Fresh-profile default: OFF; UI label: Swap
  in] Uses the adjacent seconds field for a custom eligibility delay.
* Add stop marker [Queue structure action] Restores one deleted stop marker at
  the end of the current queue; move it with the arrows to exclude entries below
  it from automatic selection.

Event editor:

* Name of event and Type of event identify an account-wide event definition.
  Renaming or changing type can change which character assignment it owns.
* Any mount matches any recognized mount aura instead of a named buff.
* Unequip when buff fades, Unequip on leaving stance, Unequip on leaving zone,
  and Unequip when leaving spec restore the event stack when that condition
  stops.
* On Movement requires movement before a matching mount/buff event equips.
* 0.5s Stop Delay waits briefly after movement stops before restoring gear.
* Except in PVP instances and Except in PVE instances suppress eligible event
  types in those instance categories.
* Event Trigger names the WoW event delivered to an advanced Script event.
* Event Script contains privileged Lua. Test immediately executes the current
  editor source after confirmation; saving approves that exact name, trigger,
  and source. Later external changes invalidate approval.

Set, Queue, and event assignments refer to the current character's ItemRack sets
even when their reusable event definitions or global settings are account-wide.


SUPPORT
-------

When reporting a problem, include:

* Client family and client build
* ItemRack version
* Exact reproduction steps
* Expected and actual set names
* Relevant item links, enchants, gems, suffixes, or runes
* Full Lua error text
* Reviewed /itemrack dump output

Project and releases:
https://github.com/Bl4ut0/ItemRack-Universal

CurseForge:
https://www.curseforge.com/wow/addons/itemrack-universal

Original ItemRack author: Gello
Classic maintainers: Rottenbeer and Roadblock
Anniversary and Universal maintenance: Bl4ut0
