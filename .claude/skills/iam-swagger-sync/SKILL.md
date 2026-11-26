---
name: iam-swagger-sync
description: Follow a change to the IAM Swagger files (User Profile, Delegation, Org & Membership) - read the diff, update adapters, mappers, fixtures and tripwires, then re-pin. Use when contracts:check reports a difference or IAM publishes a new Swagger.
disable-model-invocation: true
argument-hint: [source-dir] (default ../docs/IAM_swagger)
---

The vendored files in `test/contract/swagger/` are pinned by SHA-256 (`PIN.json`) and the edit hook blocks hand edits. Re-pin only after the code follows the change.

1. `npm run contracts:check` (pass `$ARGUMENTS` as the source dir if given). If it says the files match, stop.
2. For each differing file, `diff` it against the vendored copy and list what changed: paths, parameters, request and response fields, enums, limits, error codes. Summarise before changing anything.
3. Decide per change, and say so:
   - a **new field or enum value** a screen can use: update `domain/entities`, `mappers.ts`, `fixtures.ts`, the contract case, and the screen;
   - a **removed or renamed** field: that is a breaking change, update the adapters and tests, and add a line to `CHANGELOG.md`;
   - a **gap closed** (the tripwires in `test/contract/pin.test.ts` for LLD §15 #4, #5, #6, #10, #21, credentials, P-4): the tripwire will fail on purpose. Update the screen to use the new capability, `docs/lld/implementation-notes.md`, and replace the tripwire;
   - a **new error code**: `MESSAGE_KEYS` in `problem.ts`, a catalogue key, and a case in `errors.contract.test.ts`. Delegation writes codes in lower case; compare case-insensitively.
4. Copy the new files in with `npm run contracts:pin` (it copies from the source dir and rewrites the hashes).
5. Run `npm run test:contract`, then `/gate`. Fix until green; report the real output.
6. Update `docs/lld/implementation-notes.md` with what changed and why.
