# ItemRack development rules

For every user-reported bug, follow the user-report regression workflow in
`docs/TESTING.md`. A resolved reproducible bug must have a named permanent regression
in the standard `npm test` gate. Extend an existing focused suite when appropriate;
create a new suite only when the existing suites do not fit the owning behavior.
Do not claim a report is verified from a guessed reproduction or a green test
that does not exercise the reported failure. Record missing evidence and
client-only acceptance checks explicitly.

For release work, follow `.agents/workflows/release.md`. For local client installs,
follow `.agents/workflows/local_build.md`. Never modify or retag an
accepted release candidate to add later policy, documentation, or code changes;
make those changes on `dev` for the next candidate.

This root `AGENTS.md` is the shared project guidance for Codex and Antigravity.
Do not recreate the retired root `.rules` file or `.gemini/rules.md`. Add a
scoped `.agents/rules/*.md` file with valid Antigravity frontmatter only when a
rule should not apply repository-wide.

After code, test, or release-tool changes, run `npm.cmd test`. Record user-facing
changes in both `CHANGELOG.md` and `ItemRack/Changelog.txt`.
