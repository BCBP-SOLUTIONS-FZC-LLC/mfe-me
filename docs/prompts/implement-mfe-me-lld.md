# Prompt: Implement the `mfe-me` LLD

Copy everything below the line into Claude Code, run from `/Users/balaji/BCBP/xpertpms/mfe-me`. Run it **one build step at a time** (see "How to run"): each step is a separate session or message.

---

## Role

You are a senior frontend engineer implementing the `mfe-me` micro-frontend (the "My account" remote, container `me`) for the Tender Management SaaS Platform. The design is already written. Your job is to build it faithfully, not to redesign it.

## Sources of truth (read before writing code)

Read these in full, in this order:

1. **LLD (the design baseline):** `/Users/balaji/BCBP/xpertpms/mfe-me/docs/lld/mfe-me-lld.md`. Sections 1–15. Where it says "inherited" the rule comes from `mfe-admin`. Where it says "proposed" it is a reviewed default; use it unless an open item (§15) says otherwise.
2. **IAM Swagger (the API contract):** `/Users/balaji/BCBP/xpertpms/docs/IAM_swagger/`
   - `iam-user-profile.yaml`: `/users/{id}` (GET, PATCH), `/users/{id}/availability`, `/users/{id}/llm-preferences`, `/users/{id}/notification-preferences`, `/users/{id}/signature` (POST presign, PUT confirm, DELETE), `/users:batch`
   - `iam-delegation.yaml`: `/api/v1/delegations` (GET, POST), `/delegations/{id}` (DELETE), `/{id}/extend`, `/{id}/reassign`, `/delegations/settings` (GET only; PUT is admin, not used here)
   - `iam-org-membership.yaml`: read-only subset: `/tenants/{id}/members` (GET), `/tenants/{id}/departments` (GET), `/tenants/{id}/roles` (GET), and `/me/session-context` (read through the SDK, not called directly)
   - Ignore `/internal/*` and `/operator/*` routes. The browser never calls them. Other swagger files in the folder are not used by this remote.
3. **Sibling remote `mfe-admin`:** `/Users/balaji/BCBP/xpertpms/mfe-admin` (and its `docs/lld/mfe-admin-lld.md`). It is the reference implementation for structure, tooling, layering, tests, CI, image and release. **Copy and adapt its scaffold; do not reinvent it.** Also read its handoffs (`app-chrome-handoff.md`, `shared-components-and-navigation-handoff.md`, `session-context-refresh-handoff.md`, `sdk-api-client-handoff.md`) and its `docs/adr`.
4. **Host:** `/Users/balaji/BCBP/xpertpms/web-shell` (mounts this remote at `/t/<slug>/me/*`; `ACCOUNT_REMOTE = 'me'`). Read-only for this task, except the optional integration edit in step 6.
5. The product screen spec `iam-product-screen-spec.md` v0.1 if it can be found under `/Users/balaji/BCBP/xpertpms/docs`. Screens G1–G6 and rules IAM-UX-1…14.

## Ground rules

- **The LLD is the spec; the Swagger is the contract.** If the two disagree, the Swagger wins for wire shapes (field names, status codes, error codes, limits). Record every such disagreement in `docs/lld/implementation-notes.md` and do not silently pick one.
- **Do not invent endpoints, fields or error codes.** Everything on the wire must exist in the three Swagger files. The LLD lists known Swagger gaps (§15 #3–#11, #21); handle them exactly as the LLD says (no signature preview, no ended delegations, no tender scope, config-sourced model and event-type lists, no avatar).
- **Delegation paths:** the Delegation Swagger paths already carry `/api/v1`. The SDK `ApiClient` adds `/api`, so the adapter uses `/v1/delegations…`. Never double the prefix.
- **Error codes** are compared case-insensitively (Delegation writes them lower case).
- **Identity is never sent** (no user/tenant headers or body fields). My user ID appears only in paths (`/users/<sub>`); the tenant ID comes from `useSessionContext().tenantId`.
- **Layering** is enforced: `app` → `presentation` → `application` → `domain`, with `infrastructure` and `shared` as in LLD §3. `domain/` and `application/` contain no React, SDK or browser APIs. SDK access only through public subpaths. Raw `fetch` only in `infrastructure/api/signatureStorage.ts` (ADR 0006). No browser storage. No `dangerouslySetInnerHTML`. Wire codes only in `domain/vocabulary.ts`.
- **Never log or show the presigned upload URL.**
- **Optimistic locking:** `expected_version` for User Profile writes, `record_version` for Delegation (body for extend/reassign, query for cancel). Never retry `409` or `422`. DLG-2 create uses an `Idempotency-Key` generated at first submit and reused for retries.
- **Scope of this release:** G1–G6 as listed in the LLD "Signoff conditions" §1. Out of scope: delegated-to-me views, admin views, tender-scoped delegations, signature preview, delegation history.
- Match `mfe-admin`'s dependency versions and SDK `1.0.0-alpha.10` exactly. Do not upgrade anything.
- Do not guess at things the LLD marks as an open item. Implement the documented interim behaviour and leave a `// OPEN ITEM §15 #n` comment where the behaviour depends on the answer.
- Do not modify `web-shell`, `mfe-admin` or the Swagger files unless a step below says so. Do not commit or push unless I ask.

## Build steps (LLD §1.1)

Complete one step fully, run its checks, and stop with a short report before starting the next.

### Step 1: Scaffold
Copy and adapt `mfe-admin`'s scaffold: `package.json` (private, name `mfe-me`), TypeScript, Rsbuild config with `pluginPlatform({ role: 'remote', name: 'me', exposes: { './App': './src/app/App.tsx' } })`, dev port **5007** (`strictPort`, CORS `*`), ESLint with the platform plugin, dependency-cruiser (`npm run arch-lint`), Rstest, `config/remote-manifest-entry.mjs`, bundle budget script, Dockerfile and nginx config, CI/release/changelog workflows, `.gitignore`, README. Create the full folder tree from LLD §3 with `APP_ID = 'me'`, a standalone entry, `./App` expose (default `App`, named `workspaceBasename`), an empty `MeLayout` and the six routes from LLD §4.4 (`profile` redirects to the index; unknown paths → `/me`).
**Done when:** `npm run build`, `lint`, `arch-lint`, `test` pass, the dev server serves `remoteEntry.js` on 5007, and the standalone page loads.

### Step 2: Plumbing
`meKeys(slug)` query keys (slug first), `ProblemReader` and `infrastructure/api/problem.ts` (errorCode → outcome, retry rule, message key; LLD §11), `MeTelemetry` and the `iam_me_*` metrics (LLD §12) with `docs/observability/metrics.md`, `useMeAccess`, `useSelf`, `useTrackedQuery/Mutation`, the `me` message catalogue (`locales/en.json` + `locales/en/<screen>.json`), `MeProviders` (one QueryClient per mount, retry rules), `composition.ts` as the only wiring point, shared presentation components (`Dialog`, `ConfirmDialog`, `ConflictDialog`, `LoadFailed`, `ProblemDetails`, `DateTimeField`, `ListEditor`).
**Done when:** unit tests for these pass and the layer tests still pass.

### Step 3: Domain
Entities, value objects (`RecordVersion`, `Cursor`, `Instant`, `IanaTimeZone`, `LocaleTag`, `E164Phone`), `vocabulary.ts`, `me-events.ts`, the four repository ports, and **every rule in LLD §6.3** in `rules/me-rules.ts` (`planProfileEdit`, `planRevertToDirectory`, `planSignatureFile`, `planAvailability`, `planDelegation`, `planExtend`, `planReassign`, `planCancel`, `planAiPreferences`, `planNotificationPreferences`, plus `delegationLabel`, `reviewState`, `daysBetween`, `isOoo`). Application ports and one use-case class per port operation, plus `UploadSignatureUseCase` (presign → put → confirm).
**Done when:** `test/unit/domain/rule-paths.test.ts` pins each rule both ways and every `src/domain/` file is above 90% coverage.

### Step 4: Adapters and contract tests
`userProfile.ts`, `delegation.ts`, `orgDirectory.ts` (SDK `ApiClient`, route templates, `/users:batch` as `users%3Abatch`), `mappers.ts` (snake ⇄ camel, `delete_credentials`, `*_overridden`), `signatureStorage.ts` (single cross-origin PUT: `credentials: 'omit'`, `redirect: 'error'`, `referrerPolicy: 'no-referrer'`, 60 s timeout, `isAllowedOrigin` first), `options.ts` (`MeOptions` from runtime flags `me.ai.models`, `me.notifications.eventTypes`, `me.signature.uploadOrigins`), browser adapters (image processor, SHA-256, idempotency, clock), `MeNavigation`, `userBatcher`. Vendor the three Swagger files with SHA-256 pins (`contracts:check`, `contracts:pin`, as `mfe-admin`) and write `test/contract`: every request exists in the Swagger with a valid body and no unknown field; every fixture is a valid answer; tripwires for the gaps in §15 #4, #5, #6.
**Done when:** contract tests pass and the dependency-rules test allows `fetch` only in `signatureStorage.ts`.

### Step 5: Screens (in this order)
G1 profile without signature → G3 delegations → G2 availability → G4 AI preferences → G5 notification preferences → G6 security → then G1 signature (cropper, `SignatureCard`) once the LLD's interim handling is in place. Implement flows exactly as LLD §7.2–§7.11, including: the "profile is being set up" fallback with one retry after 10 s; federated override and revert; My access card; the cache write to both the profile and `users:batch` keys after a save; G2 never sending `delegate_user_id`; create/extend/reassign/cancel dialogs with the idempotency rules; full-list replacement for notifications and confirm before reset; read-only workspace handling; in-page section tabs in `MeLayout` (§15 #1 proposed). Each page registers `useRouteTemplate`, sits in its own `MFEErrorBoundary`, and uses catalogue messages only (never the server's `detail`). i18n, dates in the profile timezone, accessibility (labels, focus trap, keyboard) as in LLD §9 and §14.
**Done when:** each screen has page tests and axe tests (loaded, empty, error, conflict, read-only) and all gates pass.

### Step 6: Hardening
Fake IAM (User Profile, Delegation, Org & Membership subset, Swagger-shaped, failures injectable) and fake storage endpoint; the e2e flows listed in LLD §14; browser suite (CSP, routes, WCAG A/AA in light and dark, no horizontal scroll at 360 px); smoke tests; `test/integration/remote-entry.test.tsx` (including `/security` in the expected shared keys); bundle budget; `ARCHITECTURE.md`; ADRs 0001–0006. Optional, only if I approve: the web-shell integration edit in LLD §15 #16 (`me` on port 5007 in `config/remotes.local.json` and `allowedOrigins`).
**Done when:** the full CI command set passes locally: tests with the 95% global and 90% domain coverage gates, build, lint, arch-lint, budget, contracts:check.

## Definition of done (every step)

- Run and report the actual output of: `npm run build`, `npm run lint`, `npm run arch-lint`, `npm test` (with coverage once Step 3+), and `npm run contracts:check` (Step 4+). If something fails or is skipped, say so. Do not claim a pass you did not see.
- No TODOs without an `OPEN ITEM §15 #n` reference.
- No unrelated files changed; no new dependencies unless `mfe-admin` already uses them.

## Reporting format after each step

1. What was built (files and folders, brief).
2. Check results (commands and pass/fail).
3. Any LLD-vs-Swagger or LLD-vs-`mfe-admin` conflicts found, and what you did (also appended to `docs/lld/implementation-notes.md`).
4. Open items hit and the interim behaviour used.
5. What the next step needs from me, if anything.

## How to run

- Step 1 message: "Execute Step 1 of `docs/prompts/implement-mfe-me-lld.md`."
- Then the same for Steps 2–6, reviewing each report before continuing.
- If a question blocks you and the LLD does not answer it, ask me; otherwise choose the documented default and note it.
