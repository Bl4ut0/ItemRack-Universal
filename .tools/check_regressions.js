const assert = require('assert');
const fs = require('fs');
const releaseTools = require('./create_release');

const read = (filePath) => fs.readFileSync(filePath, 'utf8');
const core = read('ItemRack/ItemRack.lua');
const equip = read('ItemRack/ItemRackEquip.lua');
const events = read('ItemRack/ItemRackEvents.lua');
const buttons = read('ItemRack/ItemRackButtons.lua');
const options = read('ItemRackOptions/ItemRackOptions.lua');
const queue = read('ItemRack/ItemRackQueue.lua');
const optionsXml = read('ItemRackOptions/ItemRackOptions.xml');
const mainToc = read('ItemRack/ItemRack.toc');
const optionsToc = read('ItemRackOptions/ItemRackOptions.toc');
const buildScript = read('.tools/build_release_dev.ps1');
const installScript = read('.tools/install_local.ps1');
const releaseWorkflow = read('.agents/workflows/release.md');
const technicalChanges = read('docs/TECHNICAL_CHANGES.md');
const readme = read('README.md');
const packagedReadme = read('ItemRack/readme.txt');
const agentsGuide = read('AGENTS.md');
const docsIndex = read('docs/README.md');
const curseForgeDescription = read('docs/CURSEFORGE_DESCRIPTION.md');
const betaChecklist = read('docs/BETA_TEST_CHECKLIST.md');

let checks = 0;
function check(condition, message) {
  assert.ok(condition, message);
  checks += 1;
}

function between(source, start, end) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notStrictEqual(startIndex, -1, `Missing start marker: ${start}`);
  assert.notStrictEqual(endIndex, -1, `Missing end marker: ${end}`);
  return source.slice(startIndex, endIndex);
}

// October 9, 2026 follow-up: the packaged guide needs a detailed catalog of
// every setting, including the editors outside the main scrolling Settings tab.
const optInfoSource = between(options, 'ItemRackOpt.OptInfo = {', 'ItemRackOpt.InitializeSliders');
const optInfoLabels = [...new Set(
  Array.from(optInfoSource.matchAll(/label="([^"]+)"/g), (match) => match[1].trim())
    .filter(Boolean)
)];
for (const label of optInfoLabels) {
  check(
    packagedReadme.includes(label),
    `packaged-readme-settings-catalog: missing main Options setting "${label}".`
  );
}
const optionValueLabels = [...new Set(
  Array.from(optInfoSource.matchAll(/variable="[^"]+"[^\n]*label="([^"]+)"/g), (match) => match[1].trim())
    .filter(Boolean)
)];
for (const label of optionValueLabels) {
  check(
    packagedReadme.includes(`* ${label} [`),
    `packaged-readme-settings-catalog: setting "${label}" needs an explicit scope/default entry.`
  );
}
const generatedCheckLabelSource = between(
  options,
  'ItemRack.CheckButtonLabels = {',
  'ItemRack.SetnameBlacklist'
);
const generatedCheckLabels = [...new Set(
  Array.from(generatedCheckLabelSource.matchAll(/= "([^"]+)"/g), (match) => match[1].trim())
    .filter(Boolean)
)];
for (const label of generatedCheckLabels) {
  check(
    packagedReadme.includes(label),
    `packaged-readme-settings-catalog: missing generated checkbox label "${label}".`
  );
}
for (const label of [
  'Show SoD rune icons',
  'Show Helm',
  'Show Cloak',
  'Primary Spec',
  'Secondary Spec',
  'Hide Set',
  'Auto Queue This Slot',
  'Item delay',
  'Priority',
  'Pause Queue',
  'Burn on Use',
  'Custom Swap In',
  'Add stop marker',
  'Name of event',
  'Type of event',
  'Any mount',
  'Unequip when buff fades',
  'On Movement',
  '0.5s Stop Delay',
  'Except in PVP instances',
  'Except in PVE instances',
  'Unequip on leaving stance',
  'Unequip on leaving zone',
  'Unequip when leaving spec',
  'Event Trigger',
  'Event Script',
  'Disable Swap Sounds',
  'Per-event sound',
]) {
  check(
    packagedReadme.includes(label),
    `packaged-readme-settings-catalog: missing editor setting "${label}".`
  );
}
check(
  packagedReadme.includes('COMPLETE SETTINGS REFERENCE') &&
    packagedReadme.includes('Fresh-profile default') &&
    packagedReadme.includes('Character-specific') &&
    packagedReadme.includes('Account-wide') &&
    packagedReadme.includes('Test immediately executes the') &&
    packagedReadme.includes("current character's ItemRack sets"),
  'packaged-readme-settings-catalog: missing scope/default guidance.'
);

// GitHub #30 follow-up: the reporter reasonably expected the old label to
// affect flyout clicks and /itemrack equip macros. Keep the secure-binding
// boundary explicit in both the live option and the packaged user guide.
check(
  options.includes('label="Full-set hotkeys swap weapons in combat"') &&
    options.includes('Only saved-set keys assigned with Sets > Bind Key use this option.') &&
    options.includes('It does not affect flyout-menu clicks, /itemrack equip macros, events, or queues; those wait until combat ends.') &&
    packagedReadme.includes('saved-set key assigned with Sets > Bind Key') &&
    packagedReadme.includes('A chat macro containing /itemrack equip is not the same action') &&
    !options.includes('label="Swap set weapons during combat"'),
  'issue-30-combat-hotkey-copy: the label and tooltip must distinguish secure Bind Key actions from deferred menu, slash, event, and queue requests.'
);

for (const [name, toc] of [['ItemRack', mainToc], ['ItemRackOptions', optionsToc]]) {
  check(
    toc.includes(`## Title: ${name === 'ItemRack' ? 'ItemRack Universal' : 'ItemRack Universal Options'}\n`) ||
      toc.includes(`## Title: ${name === 'ItemRack' ? 'ItemRack Universal' : 'ItemRack Universal Options'}\r\n`),
    `Universal naming complaint: ${name} must display its Universal product title in the addon list.`
  );
  check(
    toc.includes('## Interface: 11601, 16001, 11509, 11508, 20505, 20506') &&
      toc.includes('## AllowLoadGameType: camelot'),
    `${name} TOC must advertise the shared official Classic and Forever/Camelot client matrix.`
  );
}

for (const [name, document] of [
  ['README', readme],
  ['packaged README', packagedReadme],
  ['CurseForge description', curseForgeDescription],
  ['technical changes', technicalChanges],
  ['client checklist', betaChecklist],
]) {
  check(
    /universal/i.test(document) && /Forever|Camelot/.test(document) && /Burning Crusade|TBC/.test(document),
    `${name} must describe the universal Classic/TBC/Forever support path.`
  );
}
check(
  !curseForgeDescription.includes('dedicated update for the **TBC Anniversary Edition**') &&
    !technicalChanges.includes('port ItemRack Classic to the TBC Anniversary Edition'),
  'Public and technical documentation must not describe the unified addon as a dedicated TBC-only port.'
);
// October 9, 2026 user report: ItemRack/readme.txt still described the 2.2-era
// event model and future plans despite shipping in every Universal archive.
check(
  packagedReadme.includes('ItemRack Universal') &&
    packagedReadme.includes('Classic Era') &&
    /Burning Crusade|TBC/.test(packagedReadme) &&
    /Forever|Camelot/.test(packagedReadme) &&
    packagedReadme.includes('Full-set hotkeys swap weapons in combat') &&
    packagedReadme.includes('/itemrack debug') &&
    packagedReadme.includes('/itemrack dump') &&
    packagedReadme.includes('explicit approval') &&
    !packagedReadme.includes('2.2 (re)introduces events') &&
    !packagedReadme.includes('__ Future plans __') &&
    !packagedReadme.includes('__ More documentation to come __') &&
    !packagedReadme.includes("sets that don't overlap"),
  'packaged-readme-current-guide: the shipped README must describe the Universal behavior and omit retired 2.2 guidance.'
);

const tooltipHook = between(
  core,
  'function ItemRack.ListSetsHavingItem',
  'function ItemRack.InitCore'
);
check(!tooltipHook.includes('tooltip:Show()'), 'Tooltip post-hooks must not call Show().');
check(
  tooltipHook.includes('MatchesStoredItemFields') &&
    !tooltipHook.includes('MatchesStoredItemID'),
  'Tooltip set membership must preserve the stored item fields and rune identity.'
);

const setEquipped = between(
  equip,
  'function ItemRack.IsSetEquipped',
  'function ItemRack.UnequipSet'
);
check(!setEquipped.includes('ItemRack.SameID'), 'IsSetEquipped must not use base-only matching.');
check(setEquipped.includes('matchesStored(set[i],id)'), 'Set slots must use stored-item matching.');
check(
  setEquipped.includes('ItemRack.FindQueueEntryIndex(slotQueue,id)') &&
    !setEquipped.includes('matchesStored(slotQueue[q].id, id)'),
  'Queue membership must use exact-first, ambiguity-aware queue matching.'
);
check(
  setEquipped.includes('local _, active = ItemRack.AutoQueueItemToEquip'),
  'IsSetEquipped must compare the exact queued entry, not AutoQueueItemToEquip\'s base-ID return.'
);
check(
  equip.includes('ItemRack.MatchesStoredItemID(swap[k+1],ItemRack.GetID(i))'),
  'Inner-slot shuffles must distinguish rune-bearing copies.'
);
check(
  events.includes('ItemRack.MatchesStoredItemID(intendedOffhand, currentOffhand)') &&
    events.includes('ItemRack.MatchesStoredItemID(intendedMainhand, currentMainhand)'),
  'Dual-wield retries must compare the saved rune identity.'
);
const setBindings = between(core, 'ItemRack.SetBindingRequestSequence', '--[[ Slash Handler ]]');
check(
  setBindings.includes('ItemRack.GetWeaponBindingMacro(setname)') &&
    setBindings.includes('slot ~= 16 and slot ~= 17 and slot ~= 18') &&
    setBindings.includes('button:SetAttribute("macrotext",weaponMacro)'),
  'Only validated weapon-only sets may configure a secure combat macro.'
);
check(
  setBindings.includes('button:SetScript("PreClick"') &&
    setBindings.includes('ItemRack.PendingSetBindingRequest = request') &&
    setBindings.includes('function ItemRack.ProcessPendingSetBinding'),
  'Set bindings must capture one explicit pre-click intent and defer it through the set-level coordinator.'
);
const initCore = between(core, 'function ItemRack.InitCore', 'function ItemRack.MigrateQueues');
check(
  initCore.includes('ItemRack.MigrateQueues()') &&
    initCore.includes('ItemRack.SetSetBindings()') &&
    initCore.indexOf('ItemRack.MigrateQueues()') < initCore.indexOf('ItemRack.SetSetBindings()') &&
    !/C_Timer\.After\(15[\s\S]{0,100}SetSetBindings/.test(core),
  'Set binding targets must initialize during PLAYER_LOGIN without a dead startup window.'
);
const initEvents = between(events, 'function ItemRack.InitEvents', 'function ItemRack.RegisterEvents');
check(
  initEvents.includes('CaptureLegacyEventState()') &&
    initEvents.includes('ItemRack.LoadEvents()') &&
    initEvents.indexOf('CaptureLegacyEventState()') < initEvents.indexOf('ItemRack.LoadEvents()'),
  'Legacy event state must be captured before LoadEvents can refresh transient Active data.'
);
const equipSet = between(equip, 'function ItemRack.EquipSet', 'function ItemRack.StartSetSwapTimeout');
check(
  equipSet.includes('pendingSpecSet.latestManualSet = setname') &&
    equipSet.indexOf('pendingSpecSet.latestManualSet = setname') < equipSet.indexOf('ItemRack.QueueStateReady ~= true'),
  'A newer manual set choice must supersede a pending specialization set before readiness can defer it.'
);
check(
  equipSet.includes('not ItemRack.IsEventEquipment') &&
    equipSet.includes('not ItemRack.IsDeferredEquipment') &&
    equipSet.includes('string.sub(setname,1,1) ~= "~"'),
  'Automatic, deferred, and internal set requests must not masquerade as manual specialization intent.'
);
const unequipSet = between(equip, 'function ItemRack.UnequipSet', 'function ItemRack.ToggleSet');
check(
  unequipSet.includes('pendingSpecSet.cancelledByManualUnequip = true') &&
    unequipSet.indexOf('pendingSpecSet.cancelledByManualUnequip = true') < unequipSet.indexOf('ItemRack.SetSwapping or ItemRack.AnythingLocked()'),
  'Manual toggle-off must supersede a pending specialization set before lock deferral.'
);
const afterCombatInsertions = [...buttons.matchAll(/table\.insert\(ItemRack\.RunAfterCombat,([^\r\n)]+)/g)];
check(
  afterCombatInsertions.length === 1 && afterCombatInsertions[0][1].trim() === 'functionName',
  'Button layout/visibility work must use the deduplicating post-combat scheduler.'
);
check(
  ['ConstructLayout', 'ReflectMainScale', 'ReflectRightClickUse', 'RefreshButtonVisibility', 'UpdateDisableAltClick']
    .every((functionName) => buttons.includes(`queueAfterCombatOnce("${functionName}")`)),
  'Every protected button refresh must coalesce duplicate post-combat work.'
);
const bindSet = between(options, 'function ItemRackOpt.BindSet', 'function ItemRackOpt.BindFrameOnShow');
check(
  bindSet.indexOf('if InCombatLockdown() then') < bindSet.indexOf('CreateFrame('),
  'The binding dialog must reject combat before attempting protected frame creation.'
);
check(
  !/SetCVar\s*\(\s*["']Sound_EnableSFX["']/.test([core, equip, events, options].join('\n')),
  'ItemRack must never mutate the client-wide Sound_EnableSFX CVar.'
);
check(
  !core.includes('DisableActionBarSound') && !options.includes('DisableActionBarSound'),
  'The obsolete action-template sound workaround must not be exposed as a setting.'
);

check(
  events.includes('function ItemRack.ProcessSpecializationEvent(force)') &&
    events.includes('if not force and previousSpec == currentSpec then return end') &&
    events.includes('if expired or specChanged then ItemRack.PendingSpecSet = nil end'),
  'Specialization events must support a forced same-spec evaluation.'
);
check(
  events.includes('ItemRack.RunAllEvents("Global events enabled", true)'),
  'Globally re-enabled events must force specialization evaluation.'
);
check(
  core.includes('if ItemRack.QueueSchemaUnsupported then') &&
    core.includes('return { owner=false, list=nil, enabled=false, reason="unsupported_schema" }') &&
    core.includes('if ItemRack.EventStateSchemaUnsupported then'),
  'Future queue or event schemas must fail closed without mutating their unknown representation.'
);
const spinDownEvent = between(events, 'function ItemRack.SpinDownEvent', 'function ItemRack.SpinUpEvent');
check(
  spinDownEvent.includes('local wasActive = eventData and eventData.Active') &&
    spinDownEvent.includes('if state.byEvent[eventName] then') &&
    spinDownEvent.includes('elseif wasActive then') &&
    !spinDownEvent.includes('ItemRack.UnequipSet'),
  'Spin-down may restore only a canonically owned event frame, never a stale Active/physical match.'
);

check(
  /table\.remove\(ItemRack\.SetsWaiting,1\)[\s\S]{0,260}ItemRack\.SetsWaitingStartedAt = GetTime\(\)/.test(equip),
  'Every dequeued waiting request must reset the watchdog budget.'
);
check(
  equip.includes('retryRequest[7] = true') &&
    equip.includes('ItemRack.IsWatchdogRetry = true') &&
    equip.includes('ItemRack.IsWatchdogRetry and true or nil'),
  'The watchdog must preserve the newest manual request for one bounded retry.'
);
check(
  core.includes('ItemRack.BuildID = ItemRack.Version == "Dev"'),
  'BuildID must derive from packaged TOC metadata.'
);
check(
  !buildScript.includes('$version = "') &&
    buildScript.includes('[Parameter(Mandatory = $true)]') &&
    buildScript.includes('[string]$Ref') &&
    buildScript.includes("'archive', '--format=zip'") &&
    buildScript.includes('does not identify release version $Version'),
  'The packager must require an explicit version and committed ref.'
);
check(
  installScript.includes('[string]$SourceRoot') && installScript.includes('SupportsShouldProcess'),
  'Local installation must accept exact staged source and support a dry run.'
);
check(
  releaseWorkflow.includes('Track A: Beta') && releaseWorkflow.includes('Track B: Primary'),
  'The canonical workflow must retain both release tracks.'
);
check(
  !fs.existsSync('.agent/workflows/beta_release.md') &&
    !fs.existsSync('.agent/workflows/update_version.md') &&
    !fs.existsSync('.agents/workflows/beta_release.md') &&
    !fs.existsSync('.agents/workflows/update_version.md'),
  'Retired contradictory release workflows must not remain present.'
);
check(
  agentsGuide.includes('docs/TESTING.md') &&
    agentsGuide.includes('.agents/workflows/release.md') &&
    agentsGuide.includes('.agents/workflows/local_build.md'),
  'Shared Codex/Antigravity guidance must reference the canonical testing and workflow paths.'
);
check(
  docsIndex.includes('CONTROLS.md') &&
    docsIndex.includes('TESTING.md') &&
    readme.includes('docs/README.md'),
  'The root README and documentation index must expose the relocated references.'
);
for (const obsoletePath of [
  '.rules',
  '.gemini/rules.md',
  '.agent/workflows/release.md',
  '.agent/workflows/local_build.md',
  'TESTING.md',
  'BETA_TEST_CHECKLIST.md',
  'CONTROLS.md',
  'CURSEFORGE_DESCRIPTION.md',
  'TECHNICAL_CHANGES.md',
  'CODE_AUDIT_AND_REMEDIATION_PLAN.md',
]) {
  check(!fs.existsSync(obsoletePath), `Retired documentation path must stay absent: ${obsoletePath}`);
}
check(
  !technicalChanges.includes('Calling `Show()` on `GameTooltip` is safe and taint-free'),
  'Technical guidance must not claim insecure tooltip Show calls are safe.'
);
check(
  core.includes('MouseIsOver = function(frame, ...)') &&
    core.includes('_G.MouseIsOver = MouseIsOver'),
  'ItemRack.lua must provide a global MouseIsOver compatibility shim for modern/Camelot clients.'
);
check(
  core.includes('SafeMouseIsOver') &&
    core.includes('GetMouseFoci and GetMouseFoci()[1]'),
  'MenuMouseover must use SafeMouseIsOver and fall back to GetMouseFoci when GetMouseFocus is nil.'
);
check(
  core.includes('ItemRack.IsEquipmentManagerOpen') &&
    core.includes('PaperDollItemSlotButton_OnEnter'),
  'ItemRack must detect when Equipment Manager is open and suppress breakout menu.'
);
check(
  options.includes('ItemRackOpt.GetSpecName') &&
    options.includes('GetTalentTabInfo'),
  'ItemRackOptions must safely query talent/spec info without nil errors.'
);


const shouldHold = between(
  queue,
  'function ItemRack.ShouldHoldEquippedItem',
  'function ItemRack.ProcessAutoQueue'
);
check(
  shouldHold.includes('ItemRack.ResolveProxy(exactID or baseID)'),
  'ShouldHoldEquippedItem must call ItemRack.ResolveProxy rather than an unqualified global.'
);
check(
  queue.includes('local ResolveProxy = ItemRack.ResolveProxy'),
  'ItemRackQueue must define a local ResolveProxy alias.'
);
check(
  core.includes('GetItemFamily = function(item)') &&
    core.includes('_G.GetItemFamily = GetItemFamily'),
  'ItemRack.lua must provide a global GetItemFamily compatibility shim for modern/Camelot clients.'
);
check(
  core.includes('function ItemRack.ValidBag(bagid)') &&
    core.includes('GetContainerNumFreeSlots') &&
    core.includes('pcall(GetItemFamily'),
  'ValidBag must use safe GetItemFamily and GetContainerNumFreeSlots checks.'
);
check(
  core.includes('IsEquippableItem = function(item)') &&
    core.includes('_G.IsEquippableItem = IsEquippableItem'),
  'ItemRack.lua must provide a global IsEquippableItem compatibility shim for modern/Camelot clients.'
);
check(
  core.includes('function ItemRack.PopulateKnownItems()') &&
    core.includes('pcall(IsEquippableItem'),
  'PopulateKnownItems must use safe IsEquippableItem calls with pcall and fallback.'
);
check(
  core.includes('function ItemRack.IsPlayerMoving()') &&
    events.includes('ItemRack.IsPlayerMoving'),
  'ItemRack and ItemRackEvents must define ItemRack.IsPlayerMoving() to guard against secret value taint errors.'
);
check(
  !events.includes('GetUnitSpeed("player") > 0') &&
    !events.includes('local speed = GetUnitSpeed("player")') &&
    !core.includes('GetUnitSpeed("player") == 0'),
  'Movement evaluation must not perform direct comparison on GetUnitSpeed("player") without secret value guards.'
);




check(
  !optionsXml.includes('ItemRackOptItemStatsDelay" numeric="true" historyLines="0" enableMouse="true" autoFocus="false" letters="3" virtual="true"') &&
    optionsXml.includes('ItemRackOptItemStatsDelay" numeric="true" historyLines="0" enableMouse="true" autoFocus="false" letters="3"'),
  'ItemRackOptItemStatsDelay must be an instantiated concrete EditBox, not a virtual template.'
);

check(
  core.includes('GetItemFamily = function(item)') &&
    core.includes('_G.GetItemFamily = GetItemFamily') &&
    core.includes('IsEquippableItem = function(item)') &&
    core.includes('_G.IsEquippableItem = IsEquippableItem') &&
    core.includes('pcall(GetItemFamily') &&
    core.includes('pcall(IsEquippableItem'),
  'ItemRack core must provide C_Item fallbacks and nil guards for GetItemFamily and IsEquippableItem.'
);

check(
  equip.includes('local GetItemInfo = _G.GetItemInfo or (C_Item and C_Item.GetItemInfo)'),
  'ItemRackEquip must provide a C_Item fallback for GetItemInfo.'
);

check(
  options.includes('if GetTalentTabInfo then') &&
    options.includes('elseif C_SpecializationInfo and C_SpecializationInfo.GetSpecializationInfo then') &&
    options.includes('pcall(GetTalentTabInfo') &&
    options.includes('return group == 1 and "Primary Spec" or "Secondary Spec"'),
  'ItemRackOpt.GetSpecName must guard against nil GetTalentTabInfo.'
);

check(
  core.includes('function ItemRack.NormalizeItemFields(str)') &&
    core.includes('ItemRack.NormalizeItemFields(f1) == ItemRack.NormalizeItemFields(f2)'),
  'SameItemFields must normalize empty and zero fields for cross-client link stability.'
);

check(
  core.includes('if setname == _G.CUSTOM and not ItemRack.SetSwapping and ItemRackUser and ItemRackUser.Sets then') &&
    core.includes('if count > bestCount and ItemRack.IsSetEquipped(name) then'),
  'UpdateCurrentSet must scan saved sets to auto-detect worn sets when CurrentSet is unequipped.'
);

check(
  core.includes('if ItemRackSettings.CharacterSheetMenus ~= "ON" or ItemRack.IsEquipmentManagerOpen() then') &&
    core.includes('if ItemRackMenuFrame:IsVisible() and ItemRack.menuDockedTo then') &&
    core.includes('ItemRackMenuFrame:Hide()') &&
    core.includes('ItemRack.menuDockedTo = nil'),
  'PaperDollItemSlotButton_OnEnter must dismiss open menus and return early when CharacterSheetMenus is disabled.'
);

check(
  core.includes('if i ~= "PaperDollFrame" or ItemRackSettings.CharacterSheetMenus == "ON" then'),
  'MenuMouseover must not treat PaperDollFrame as keep-alive when CharacterSheetMenus is disabled.'
);

check(
  options.includes('elseif opt.variable=="CharacterSheetMenus" then') &&
    options.includes('if check=="OFF" and ItemRackMenuFrame and ItemRackMenuFrame:IsVisible() and ItemRack.menuDockedTo then'),
  'OptListCheckButtonOnClick must dismiss active character sheet menus immediately when toggled OFF.'
);

check(
  equip.includes('local check11_12 = (set[11] or set[12])') &&
    equip.includes('local check13_14 = (set[13] or set[14])') &&
    equip.includes('local hasActiveQueue = ItemRackUser.EnableQueues == "ON" and slotQueue and #slotQueue > 0 and queueContext.enabled') &&
    equip.includes('if hasActiveQueue'),
  'IsSetEquipped must allow single-slot ring/trinket cross checks and only gate queue readiness on slots with active queues.'
);

const betaMarkdown = `# Changelog\n\n## [Development]\n\n### Bug Fixes & Improvements\n- Beta change\n\n## [4.0] - 2025-01-01\n- Old\n`;
const promotedMarkdown = releaseTools.promoteBetaMarkdown(betaMarkdown, '4.1-beta1', '2026-08-14').text;
check(promotedMarkdown.includes('## [4.1-beta1] - 2026-08-14'), 'Beta Markdown promotion failed.');
check(releaseTools.parseMarkdownSections(promotedMarkdown).find((section) => section.version === 'Development').body === '', 'Beta promotion must clear Development.');

const betaAddon = `__ Development __\n\n- Beta change\n\n__ New in 4.0 - By Bl4ut0 __\n- Old\n`;
const promotedAddon = releaseTools.promoteBetaAddon(betaAddon, '4.1-beta1');
check(promotedAddon.includes('__ New in 4.1-beta1 - By Bl4ut0 __'), 'Beta in-addon promotion failed.');

const stableMarkdown = `# Changelog\n\n## [Development]\n\n- Final adjustment\n\n## [4.2-beta2] - 2026-08-12\n### Bug Fixes & Improvements\n- Beta two\n\n## [4.2-beta1] - 2026-08-01\n### Bug Fixes & Improvements\n- Beta one\n\n## [4.1] - 2026-07-01\n- Old\n`;
const consolidatedMarkdown = releaseTools.consolidateStableMarkdown(stableMarkdown, '4.2', '2026-08-14').text;
check(consolidatedMarkdown.includes('## [4.2] - 2026-08-14'), 'Stable Markdown section was not created.');
check(!consolidatedMarkdown.includes('4.2-beta'), 'Stable Markdown must remove consolidated beta headers.');
check(
  consolidatedMarkdown.indexOf('- Final adjustment') < consolidatedMarkdown.indexOf('- Beta two') &&
    consolidatedMarkdown.indexOf('- Beta two') < consolidatedMarkdown.indexOf('- Beta one'),
  'Stable Markdown must preserve final, newest-beta, oldest-beta order.'
);

const stableAddon = `__ Development __\n\n- Final adjustment\n\n__ New in 4.2-beta2 - By Bl4ut0 __\n- Beta two\n\n__ New in 4.2-beta1 - By Bl4ut0 __\n- Beta one\n\n__ New in 4.1 - By Bl4ut0 __\n- Old\n`;
const consolidatedAddon = releaseTools.consolidateStableAddon(stableAddon, '4.2');
check(consolidatedAddon.includes('__ New in 4.2 - By Bl4ut0 __'), 'Stable in-addon section was not created.');
check(!consolidatedAddon.includes('4.2-beta'), 'Stable in-addon changelog must remove beta headers.');

console.log(`[REGRESSION] ${checks} release and behavior guards passed.`);
