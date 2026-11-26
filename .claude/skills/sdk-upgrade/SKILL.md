---
name: sdk-upgrade
description: Upgrade mfe-me's platform packages (frontend-sdk, webpack-preset, eslint-plugin) together to one exact version, with the SDK peer range at that version, shell before remotes, verified in the real shell and with every doc that names the version. Use when a new platform-reactcommon release is out and web-shell already serves it.
disable-model-invocation: true
argument-hint: <version, e.g. 1.0.0-alpha.11>
---

# Upgrade the platform SDK to $ARGUMENTS

The rules are CLAUDE.md's: all three packages, exact pins, one version, the SDK peer range `^$ARGUMENTS`; a remote must **not** be built against a newer SDK than web-shell's (the SDK's share scope is the shell's, and the preset makes the remote require `^<its SDK>` of it), so **web-shell moves first**. `platform-reactcommon` and `web-shell` are read-only from here.

1. **Check the shell serves it.** In `../web-shell`: `package.json` pins `$ARGUMENTS` and its `CHANGELOG.md` says so (released or `[Unreleased]`). If the shell is older, stop and say what the shell must do first.
2. **Read the release.** In `../../shared-library/platform-reactcommon`: `CHANGELOG.md` for $ARGUMENTS and `git diff <current tag> v$ARGUMENTS -- packages/`. List for the user: breaking changes, new required `runtime.json` keys, changed exports this remote uses (`src/` imports: `/react`, `/http`, `/i18n`, `/metrics`, `/problem`, `/storage`, `/nav`, `/auth`, `/config`, `/logging`), anything that changes the shell–remote contract (container global, shared map, `PlatformProvider` shell value), and anything the SDK now exports that a local helper copies (LLD §5).
3. **Branch** `chore/sdk-$ARGUMENTS` from `main`.
4. **Install:** `bash .claude/skills/sdk-upgrade/scripts/bump.sh $ARGUMENTS`. It refuses a non-exact version before installing anything, then a version any of the three packages has not published; it installs all three, sets the SDK peer range, and checks the pins (`.claude/hooks/check-sdk-pins.mjs`).
5. **Adapt and verify**, fixing what each step reports:
   - `npm run lint`, `npm run arch-lint`, `npx tsc --noEmit`, `npm run test:ci` (95% gate), `npm run contracts:check`;
   - `test/unit/metrics`: the SDK's registry rules may have changed (a label, a suffix, a vocabulary);
   - `npm run build`, then `grep -o '1\.0\.0-alpha\.[0-9]*' dist/remoteEntry.js | sort | uniq -c` to confirm the entry requires the new version, and the smoke suite against the image;
   - `npm run test:browser`;
   - in the real shell: `npm run dev:mock-iam` and web-shell's `DEV_API_URL=http://localhost:5090 npm run dev`, sign in, open every section (Users, a member, Departments, Group mappings, Settings, Audit, Exports); the page must load with no console error. A dev server started before the upgrade keeps the old SDK in memory: restart it.
6. **Docs**, all in this PR: the version in README, ARCHITECTURE, VERSIONING, the LLD header (§1 table) and history, `.claude/CLAUDE.md`, `docs/architecture/refactoring-plan.md`; a CHANGELOG `[Unreleased]` entry that says which web-shell release it needs.
7. **Review:** write the diff to the scratchpad and run the `invariant-reviewer` and `doc-sync-reviewer` subagents on it; fix their findings.
8. **PR** into `main`. Tell the user the shell release this remote now requires.
