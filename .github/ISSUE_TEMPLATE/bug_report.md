---
name: Bug Report
about: Create a report to help us improve ItemRack
title: '[BUG] '
labels: bug
assignees: ''
---

**Describe the bug**
A clear and concise description of what the bug is.

**To Reproduce**
Steps to reproduce the behavior in-game:
1. Log into character...
2. Open ItemRack menu...
3. Click on '...'
4. See error

**Diagnostic Dump (Highly Recommended for Swaps & Queues)**
To help us diagnose exactly what is happening in the addon engine, please:
1. Type `/itemrack debug` to enable diagnostic logging.
2. Reproduce the bug in-game.
3. Type `/itemrack dump` to open the log window.
4. `CTRL+C` to copy the output and paste it into the code block below:

*(Note: The dump includes your gear set names and configurations. Feel free to review or anonymize specific names before pasting).*

```lua
-- Paste Diagnostic Dump here
```

**Expected behavior**
A clear and concise description of what you expected to happen.

**Lua Error Logs**
If you experienced a Lua error, please paste the full stack trace below. You can copy this from your error handler (BugSack, Swatter, or default WoW interface).

```lua
-- Paste error here
```

**Screenshots**
If applicable, add screenshots to help explain your problem.

**Environment (please complete the following information):**
 - WoW Client Version: [e.g. TBC Anniversary 2.5.6, Era / SoD / Hardcore 1.15.9, Forever 1.16/1.60]
 - ItemRack Version: [e.g. 4.59-beta2]
 - Locale: [e.g. enUS, deDE]
 - Other Key Addons: [e.g. RestedXP, Questie, ElvUI]

**Additional context**
Add any other context about the problem here (e.g. were you in combat? specific items involved?).
