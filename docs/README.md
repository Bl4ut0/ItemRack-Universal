# ItemRack documentation

The repository root intentionally contains only the project overview, changelog,
and shared agent instructions. Maintained supporting references live here.

## User references

- [Controls](CONTROLS.md): mouse actions, keybindings, macros, and slash commands.
- [Complete packaged guide](../ItemRack/readme.txt): every setting, default, dependency, editor control, and current runtime behavior.
- [CurseForge description](CURSEFORGE_DESCRIPTION.md): maintained public addon description.

## Engineering and release validation

- [Testing](TESTING.md): required user-report regression workflow and standard test gate.
- [Beta test checklist](BETA_TEST_CHECKLIST.md): live-client acceptance checks.
- [Technical changes](TECHNICAL_CHANGES.md): implementation notes and compatibility decisions.
- [Baganator compatibility](BAGANATOR_COMPATIBILITY.md): integration behavior and validation.
- [Special-item framework](SPECIAL_ITEM_RULES.md): client catalogs, shared mechanics and current limits.
- [Special-item test-deployment plan](SPECIAL_ITEM_TEST_DEPLOY_PLAN.md): reload recovery, evidence capture, regression work and staged acceptance.

Release and local-install procedures are kept with the agent workflows:

- [Release workflow](../.agents/workflows/release.md)
- [Local build and install](../.agents/workflows/local_build.md)

## Archive

- [v4.24-v4.45 audit and remediation plan](archive/CODE_AUDIT_AND_REMEDIATION_PLAN.md): historical investigation record, not current release status.
