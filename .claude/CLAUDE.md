# CLAUDE.md

Guidance for Claude Code in **mfe-me**, the "My account" remote (`me`, `ownerDomain: iam`) of the Tender Management SaaS platform that web-shell loads. Reference lives in the files under [See Also](#see-also); this file is what must always be in context.

## What this repo is

A **private Module Federation remote** (`"private": true`) built with Rsbuild and `@bcbp-solutions-fzc-llc/webpack-preset`. Container `__platform_mfe_me`, exposing `./App` (`src/app/App.tsx`) with no props; web-shell mounts it at `/t/<slug>/me/*`. The same code also runs **standalone** (`npm run dev`, port 5007; the image's `/`), where the SDK is bundled and every SDK API answers its anonymous defaults. It ships as a static bundle in an nginx image (`ghcr.io/bcbp-solutions-fzc-llc/mfe-me`, port 8080, uid 101).

It holds the member's own screens: **G1** profile and signature, **G2** availability, **G3** my delegations (create, extend, reassign, cancel), **G4** AI preferences, **G5** notification preferences, **G6** security (links to the Keycloak account console). Every check in the UI is a **hint**: IAM and the gateway decide. Nothing here acts on another user (that is `mfe-admin`).

Node 26 (`.nvmrc`), TypeScript, React 19, React Router 7, TanStack Query 5, Tailwind 4 + daisyUI 5 (Aura tokens in `src/app/styles/aura.css`), **Rsbuild 2 (Rspack), no Vite**, **Rstest** (not Vitest; ADR 0005), Playwright + axe. Platform packages from **GitHub Packages** (`.npmrc`, `NODE_AUTH_TOKEN` with `read:packages`): `frontend-sdk`, `webpack-preset`, `eslint-plugin`, **`1.0.0-alpha.10`, pinned exactly and on one version**, never newer than web-shell's.

**Status:** not released; screens G1–G6 built and tested. Nothing is committed beyond the baseline. Read `docs/lld/implementation-notes.md` before trusting `docs/lld/mfe-me-lld.md` on a detail: the build departs from the LLD in places (the Swagger wins for wire shapes).

## Commands

```bash
export NODE_AUTH_TOKEN=$(gh auth token)   # once per shell
npm ci
npm run dev                # :5007 standalone + remote (HMR off on purpose: remoteEntry must stay a plain script)
npm run dev:harness        # ME_HARNESS=1: /t/acme/me with a mock session and the fake IAM (toolbar: read-only, trial realm, …)
npm run dev:mock-iam       # :5090 the same fake IAM over HTTP; run web-shell with DEV_API_URL=http://localhost:5090
npm run lint && npm run arch-lint && npx tsc --noEmit
npm test                   # Rstest: unit, integration, contract, e2e
npm run test:ci            # + the 95% coverage gate and every src/domain file above 90%
npm run contracts:check    # the vendored Swagger against its pin (contracts:pin after reading a diff)
npm run build && npm run budget
npm run test:browser       # Chromium: standalone page + the harness screens (contrast, 360 px)
npm run test:smoke         # GET-only, needs SMOKE_BASE_URL (test/smoke/README.md)
```

## Rules that are easy to break

- **Layers** (`app` → `presentation` → `application` → `domain`; `infrastructure` implements; `shared`): `domain/` and `application/` import no React, SDK or browser API (`layers.test.ts`, `arch-lint`). Presentation never imports infrastructure. A screen calls a feature hook, which calls a use case (ADR 0004).
- **TanStack Query** only in `app/` and `presentation/features/`. Retries are the SDK client's; TanStack retries nothing (ADR 0001).
- **`fetch` in one file only** (`infrastructure/api/signatureStorage.ts`, the presigned PUT, ADR 0006). Everything else goes through `useApiClient()` templates (`/v1/…`; Delegation's `/v1/delegations`, never `/api/v1`).
- **Do not reimplement the SDK** (`useApiClient`, `formatDate`, `problemMessage`, `isAllowedOrigin`, `newRequestId`, `useReadOnly`, …): see the audit in `docs/lld/implementation-notes.md`.
- **Identity is never sent**: my ID only in paths; no tenant, user or role in a body, query or header.
- **Role names and wire codes** live in `src/domain/vocabulary.ts` only. Access is a hint through SDK hooks, never a role comparison.
- **Messages**: every user-facing string is a catalogue key (`src/infrastructure/configuration/locales`), and `catalog.test.ts` fails on a missing or unused key. Never show a server's `detail`. Message colours are `text-status-*` and `notice` (AA contrast), not daisyUI's `text-error`/`alert-soft`.
- **Rules before writes**: `domain/rules/me-rules.ts` plans each request, validating only what the user changed; the service re-checks. A new rule gets both-path tests in `rule-paths.test.ts`.
- **Locking and idempotency**: `expected_version` / `record_version` from the last read; a `409` opens a conflict dialog, never a retry. DLG-2's `Idempotency-Key` is kept across retries of one submission and renewed after a change.
- **The signature upload URL** is a bearer credential: never logged, shown, stored, or put in an error or a metric label. The preview is a `data:` URL (the CSP allows no `blob:` images).
- **Metrics** are Tier 3 `iam_me_*` only; add a value to `domain/events/me-events.ts` and `docs/observability/metrics.md` together (`metrics.test.tsx` checks).
- **A new folder** must fit `docs/adr/0007-constitution-folder-mapping.md` (`structure.test.ts`).
- **CHANGELOG.md**: a change under `src/`, dependencies, `Dockerfile`, `nginx/`, `rsbuild.config.ts` or `index.html` adds a line under `[Unreleased]` (CI checks it).

## See also

- `ARCHITECTURE.md`: layers, data flow, runtime flows, the odd things on purpose, what is not proven.
- `docs/lld/mfe-me-lld.md` and `docs/lld/implementation-notes.md`: the design and where the build departs from it.
- `docs/adr/`, `docs/architecture/` (Constitution assessment and refactoring plan), `docs/observability/`, `docs/runbooks/`.
- `.claude/operations.md`: CI jobs, release, upgrading the platform packages. Skills: `gate` (the full local gate), `new-screen`, `iam-swagger-sync`, `sdk-upgrade`, `stack-sync`. Agents (`.claude/agents`): `invariant-reviewer`, `contract-reviewer`, `a11y-reviewer`; run them before a PR. Hooks: guard edits (siblings, generated output, the pinned Swagger), lint each edited file, check the repository rules (`invariants.sh`) and run the test that pins the file (`related-test.sh`), and check typecheck, arch-lint and the changelog when a turn ends. MCP (`.mcp.json`): `context7` (live docs for the new major versions) and `playwright` (drive `npm run dev:harness`).
