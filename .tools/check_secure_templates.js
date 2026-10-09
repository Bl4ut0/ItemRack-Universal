const fs = require('fs');

const buttonsXml = fs.readFileSync('ItemRack/ItemRackButtons.xml', 'utf8');
const optionsXml = fs.readFileSync('ItemRackOptions/ItemRackOptions.xml', 'utf8');
const buttonsLua = fs.readFileSync('ItemRack/ItemRackButtons.lua', 'utf8');
const coreLua = fs.readFileSync('ItemRack/ItemRack.lua', 'utf8');
let checks = 0;

function check(value, message) {
  if (!value) throw new Error(`[SECURE TEMPLATES] ${message}`);
  checks += 1;
}

function contains(text, fragment, message) {
  check(text.includes(fragment), message);
}

function excludes(text, pattern, message) {
  check(!pattern.test(text), message);
}

function templateBody(text, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`<CheckButton\\s+name=["']${escaped}["'][^>]*>([\\s\\S]*?)<\\/CheckButton>`).exec(text);
  check(match, `missing expanded template ${name}`);
  return match[1];
}

function hasNamedRegion(body, suffix) {
  return new RegExp(`name=["']\\$parent${suffix}["']`).test(body);
}

try {
  // Screenshot report: the full Universal/version title overlapped Queue.
  // Reserve a bounded badge region inside the original header's free space.
  const title = /<FontString\s+name="ItemRackOptFrameTitle"[^>]*>([\s\S]*?)<\/FontString>/.exec(optionsXml);
  const titleSize = title && /<AbsDimension\s+x="(\d+)"\s+y="(\d+)"\s*\/>/.exec(title[1]);
  check(titleSize && Number(titleSize[1]) <= 40 && Number(titleSize[2]) <= 16,
    'compact-version-badge: title must have bounded dimensions to prevent tab overlap');
  const badge = /<Frame\s+name="ItemRackOptVersionBadge"[^>]*>([\s\S]*?)<\/Frame>/.exec(optionsXml);
  const badgeSize = badge && /<AbsDimension\s+x="(\d+)"\s+y="(\d+)"\s*\/>/.exec(badge[1]);
  const badgeOffset = badge && /<Offset><AbsDimension\s+x="(\d+)"\s+y="(-?\d+)"\s*\/>/.exec(badge[1]);
  const windowWidth = Number(/<Frame\s+name="ItemRackOptFrame"[^>]*>\s*<Size>\s*<AbsDimension\s+x="(\d+)"/.exec(optionsXml)?.[1]);
  const tabWidth = Number(/<Button\s+name="ItemRackTabTemplate"[^>]*>\s*<Size>\s*<AbsDimension\s+x="(\d+)"/.exec(optionsXml)?.[1]);
  const tabOffset = Number(/<Button\s+name="ItemRackOptTab1"[^>]*>[\s\S]*?<AbsDimension\s+x="(-?\d+)"/.exec(optionsXml)?.[1]);
  check(badgeSize && badgeOffset && Number(badgeSize[1]) + Number(badgeOffset[1]) <= windowWidth + tabOffset - 4*tabWidth,
    'compact-version-badge: hover region must fit before the Queue tab at default size');
  contains(badge[1], 'ItemRackOpt.VersionBadgeOnEnter(self)', 'version badge must expose the version hover callback');
  contains(badge[1], '<OnLeave>GameTooltip:Hide()</OnLeave>', 'version hover must clean up on leave');
  excludes(buttonsXml, /inherits=["'][^"']*\b(?:ActionBarButtonTemplate|ActionButtonTemplate)\b/,
    'quick-access XML must not inherit Blizzard action-bar presentation templates');
  excludes(optionsXml, /inherits=["'][^"']*\b(?:ActionBarButtonTemplate|ActionButtonTemplate|SecureActionButtonTemplate)\b/,
    'options selectors must remain visual-only and unprotected');
  excludes(coreLua, /["'](?:ActionBarButtonTemplate|ActionButtonTemplate)["']/,
    'runtime-created popup buttons must not use Blizzard action templates');

  contains(buttonsXml,
    '<CheckButton name="ItemRackButtonsTemplate" inherits="ItemRackButtonVisualTemplate,SecureActionButtonTemplate" virtual="true"/>',
    'inventory slots must combine ItemRack visuals with SecureActionButtonTemplate');
  for (let slot = 0; slot < 20; slot += 1) {
    contains(buttonsXml,
      `<CheckButton name="ItemRackButton${slot}" inherits="ItemRackButtonsTemplate" id="${slot}"/>`,
      `inventory slot ${slot} must use the protected ItemRack template`);
  }
  contains(buttonsXml,
    '<CheckButton name="ItemRackButton20" inherits="ItemRackButtonVisualTemplate" id="20"/>',
    'set button must remain visual-only and unprotected');

  const quickBody = templateBody(buttonsXml, 'ItemRackButtonVisualTemplate');
  for (const suffix of ['ItemRackIcon', 'Border', 'Queue', 'Count', 'HotKey', 'Name', 'Cooldown']) {
    check(hasNamedRegion(quickBody, suffix), `quick-access template is missing $parent${suffix}`);
  }

  // Screenshot report: the default icon was 32x32 inside a 36x36 button.
  // Scaling that inset enlarged the visible gap. Measure the XML anchors,
  // including any offsets, rather than assuming that parent scaling fills it.
  const quickSize = /<Size\s+x="([\d.]+)"\s+y="([\d.]+)"\s*\/>/.exec(quickBody);
  check(quickSize, 'quick-access-full-icon-coverage: button dimensions must be defined');
  const regionBounds = (suffix, tag) => {
    const region = new RegExp(`<${tag}\\b[^>]*name="\\$parent${suffix}"[^>]*>([\\s\\S]*?)<\\/${tag}>`).exec(quickBody);
    check(region, `quick-access-full-icon-coverage: ${suffix} must have explicit geometry`);
    const offset = (point) => {
      const anchor = new RegExp(`<Anchor\\b[^>]*point="${point}"[^>]*(?:\\/>|>([\\s\\S]*?)<\\/Anchor>)`).exec(region[1]);
      check(anchor, `quick-access-full-icon-coverage: ${suffix} must anchor ${point}`);
      const inner = anchor[1] || '';
      const dimension = (axis) => Number(new RegExp(`${axis}="(-?[\\d.]+)"`).exec(inner)?.[1] || 0);
      return [dimension('x'), dimension('y')];
    };
    const topLeft = offset('TOPLEFT');
    const bottomRight = offset('BOTTOMRIGHT');
    return [topLeft[0], -topLeft[1], Number(quickSize[1]) + bottomRight[0], Number(quickSize[2]) - bottomRight[1]];
  };
  const iconBounds = regionBounds('ItemRackIcon', 'Texture');
  const cooldownBounds = regionBounds('Cooldown', 'Cooldown');
  // 4.53 user feedback: filling the inset while retaining a 7% crop zoomed
  // the artwork. Full coverage must preserve the original texture extent.
  for (const [body, suffix] of [[quickBody, 'ItemRackIcon'],
    [templateBody(buttonsXml, 'ItemRackMenuItemTemplate'), 'Icon'],
    [templateBody(optionsXml, 'ItemRackOptIconButtonTemplate'), 'Icon']]) {
    const texture = new RegExp(`<Texture name="\\$parent${suffix}"[^>]*>([\\s\\S]*?)<\\/Texture>`).exec(body);
    check(texture && texture[1].includes('<TexCoords left="0" right="1" top="0" bottom="1"/>'),
      'reported-icon-zoom: default artwork must preserve the full texture');
    check(!texture[1].includes('<Offset'),
      'reported-breakout-inset: artwork must fill the unchanged 36px button');
  }
  for (const scale of [0.5, 1, 1.5, 2]) {
    const expected = [0, 0, Number(quickSize[1]) * scale, Number(quickSize[2]) * scale];
    check(iconBounds.every((edge, index) => edge * scale === expected[index]),
      `quick-access-full-icon-coverage: icon must fill button bounds at scale ${scale}`);
    check(cooldownBounds.every((edge, index) => edge * scale === expected[index]),
      `quick-access-full-icon-coverage: cooldown must align with the full icon at scale ${scale}`);
  }

  const menuBody = templateBody(buttonsXml, 'ItemRackMenuItemTemplate');
  for (const suffix of ['Icon', 'Border', 'Count', 'HotKey', 'Name', 'Cooldown']) {
    check(hasNamedRegion(menuBody, suffix), `popup template is missing $parent${suffix}`);
  }
  excludes(menuBody, /SecureActionButtonTemplate|ActionBarButtonTemplate|ActionButtonTemplate/,
    'popup item template must remain visual-only');
  contains(coreLua,
    'CreateFrame("CheckButton","ItemRackMenu"..idx,ItemRackMenuFrame,"ItemRackMenuItemTemplate")',
    'runtime popup creation must use the ItemRack-owned visual template');
  contains(coreLua, 'Icon = _G[name.."Icon"]',
    'popup Masque registration must provide its owned icon explicitly');
  contains(coreLua, 'Cooldown = _G[name.."Cooldown"]',
    'popup Masque registration must provide its owned cooldown explicitly');

  const optionBody = templateBody(optionsXml, 'ItemRackOptIconButtonTemplate');
  for (const suffix of ['Icon', 'Border']) {
    check(hasNamedRegion(optionBody, suffix), `options icon template is missing $parent${suffix}`);
  }
  contains(optionsXml,
    '<CheckButton name="ItemRackOptInvTemplate" inherits="ItemRackOptIconButtonTemplate" virtual="true">',
    'inventory options must use the owned visual template');
  contains(optionsXml,
    '<CheckButton name="ItemRackOptSetsCurrentSet" inherits="ItemRackOptIconButtonTemplate">',
    'set selector must use the owned visual template');

  excludes(buttonsLua,
    /ActionBarButtonEventsFrame|ActionBarActionEventsFrame|ActionBarButtonUpdateFrame|ActionBarButtonRangeCheckFrame/,
    'ItemRack must not edit Blizzard action-bar dispatcher tables');
  excludes(buttonsLua, /\.Show\s*=\s*function|\.SetText\s*=\s*function/,
    'owned regions and protected methods must not be monkey-patched');
  contains(buttonsLua, 'if ItemRackUser.Locked=="ON" or InCombatLockdown() then return end',
    'dragging protected slot buttons must be rejected during combat');
  contains(buttonsLua, 'button:SetAttribute("shift-type1",ATTRIBUTE_NOOP)',
    'shift-left ItemRack handling must suppress the secure item action');
  contains(buttonsLua, 'button:SetAttribute("alt-type2",ATTRIBUTE_NOOP)',
    'alt-right configuration clicks must suppress the secure item action');
  contains(buttonsLua, 'and ItemRackSettings.MenuOnRight ~= "ON"',
    'right-click secure use must be disabled while menu-on-right is active');

  console.log(`[SECURE TEMPLATES] ${checks} ownership, protection, and region checks passed.`);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
