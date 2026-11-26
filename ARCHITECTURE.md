# Architecture

This document describes the internal structure, dependency rules and runtime flows of `mfe-me`. The design is in the [LLD](docs/lld/mfe-me-lld.md) (and where the build departs from it, [implementation-notes](docs/lld/implementation-notes.md)); the decisions are in the [ADRs](docs/adr) and the [Constitution assessment and refactoring plan](docs/architecture/constitution-assessment.md); the metrics are in [docs/observability/metrics.md](docs/observability/metrics.md).

`mfe-me` is the **Module Federation remote `me`** (`ownerDomain: iam`), the "My account" area. It exposes `./App` with no props, and web-shell mounts it at `/t/<slug>/me/*`. The same code also runs as a **standalone page** (`npm run dev` on port 5007, and the image's `/`). It is built with React 19, React Router 7, TanStack Query 5, Tailwind 4 with daisyUI 5, and Rsbuild 2 using the platform preset. The image is nginx (unprivileged) on port 8080.

One build makes two environments: the **remote** (`remoteEntry.js` and chunks, the platform SDK taken from the shell) and the **standalone** page (the SDK bundled).

**Status (2026-11-26):** not released. Screens G1–G6 are built and tested against the pinned IAM Swagger. Not in this release: delegations to me and admin views, tender-scoped delegations, a preview of the current signature, delegation history ([LLD §1](docs/lld/mfe-me-lld.md)). The signature upload needs deployment prerequisites ([ADR 0006](docs/adr/0006-signature-put-is-the-only-non-sdk-request.md)).

**Owns:** the member's own screens (profile and signature, availability, my delegations, AI and notification preferences, security links), the `me` message catalogue, the `iam_me_*` metrics and the nginx image.

**Does not own:** sign-in, tokens, session and workspace switching (the SDK in web-shell); who may do what (IAM and the gateway decide, every check here is a hint); the frame, the "My account" link, the user menu and Sign out (web-shell); admin edits of another user, the delegation policy, admin views of delegations (`mfe-admin`); MFA methods, passkeys and sessions (the Keycloak account console, which G6 links to).

---

## Layer model

`src/` follows the Frontend Architecture Constitution's layers. Dependencies point inward; `npm run arch-lint` (`.dependency-cruiser.cjs`) and `test/unit/architecture/layers.test.ts` enforce them.

| Layer | Holds | May import |
|---|---|---|
| `app` | Composition root: `App`, routes, `MeLayout` (section tabs), providers, the one place adapters are chosen | everything |
| `presentation` | Pages and their parts, shared components, `features/` (hooks that call use cases, with `app/` the only code that uses TanStack Query) | `application`, `domain`, `shared` |
| `application` | Use cases (one per port operation, plus `UploadSignatureUseCase`), ports (`telemetry`, `problems`, `navigation`, `options`, `media`, `hashing`, `ids`, `clock`), query keys, `userBatcher`; no React, SDK or browser | `domain`, `shared` |
| `domain` | Entities, value objects (`Instant`, `IanaTimeZone`, `LocaleTag`, `E164Phone`, …), the rules (`me-rules.ts`), the four ports; pure TypeScript | nothing |
| `infrastructure` | HTTP adapters on the SDK `ApiClient`, mappers, `problem.ts`, the one presigned-PUT adapter, browser tools (canvas, `crypto.subtle`), runtime options, telemetry, navigation, standalone start-up | `application`, `domain`, `shared` |
| `shared` | Constants and hooks | nothing |

Two consequences: presentation never imports infrastructure (what a screen needs arrives through the services provider), and `fetch` is called in exactly one file (ADR 0006).

## Data flow

```
page  →  feature hook (TanStack Query)  →  use case.execute()  →  port (domain/repositories)
 │                                                                      │
 └─ rules (domain/rules/me-rules.ts) plan the request first             ▼
                                                              HTTP adapter (infrastructure/api)
                                                                        │  mappers: JSON ⇄ domain
                                                                        ▼
                                                    SDK ApiClient  →  same-origin /api  →  IAM
```

- **Reads** are `useTrackedQuery`: one measured load, keyed by `meKeys(slug)`. Names for chips and the picker are joined from User Profile in one lookup per set of IDs, each profile cached for about 60 s.
- **Writes** are `useTrackedMutation`: one measured write (success, `failure` for a rejection, `error` for a fault), then the keys it made stale are invalidated. A rule decides first what the UI knows; the service re-checks everything. Only the fields the user changed are validated and sent.
- **Errors** are read through the `ProblemReader` port: the metric outcome, conflict, read-only, field errors, and a catalogue message per known `errorCode` (compared case-insensitively). A server's `detail` is never shown.
- **Identity** is never sent: my ID is in the path only (`/users/<me>`), the tenant ID comes from the session context.
- **Optimistic locking:** `expected_version` (User Profile) and `record_version` (Delegation) from the last read; a `409` opens a conflict dialog and is never retried.

## Runtime flows

- **Mounted by web-shell:** the shell loads `remoteEntry.js` (SRI), `init(shareScope)`, `get('./App')`, renders `App` at `/t/<slug>/me/*`. `App` runs its own router under the workspace basename, one `QueryClient` per mount, cleared on unmount. `MeLayout` draws six tabs (the shell's sidebar has one "My account" link and no sub-menu) and a boundary per page.
- **Between remotes:** SDK `navigate(appId, '/t/<slug>/…')`, never `<a href>`. The only cross-remote link is to `mfe-admin`'s settings; the account console (G6) is a top-level link in a new tab.
- **Signature upload:** pick → check MIME and magic bytes (≤ 1 MB) → decode, crop, **re-encode as PNG** → SHA-256 → presign (User Profile) → PUT to storage (no credentials) → confirm by key and hash. One attempt; a failure restarts from the presign and is reported by stage (`iam_me_signature_upload_failures_total`).
- **Delegations:** DLG-2 has an `Idempotency-Key` made at first submit and kept for every retry of that submission; "still saving" re-reads the list and never resends with a new key. A reassign that fails after the old delegation ended re-reads the list.
- **Standalone:** loads `/config/runtime.json`, sets the page identity, renders. With no shell there is no identity, so no screen has data.

## Things that look odd and are on purpose

- **The tabs link from `meBase(pathname)`, not relatively.** The layout sits under a splat route (`/me/*`); a relative link resolves against the part the splat matched and goes to `/me/delegations/availability`.
- **A form is keyed by a "generation", not by the record's version.** A save must not remount the form (it would lose "Saved"); only Reload after a conflict starts it again from the server's record.
- **A reassign sends an end date only if the user touched it.** The form shows the end without seconds; the service may hold `23:59:59`, and the untouched end would read as a change one second earlier.
- **Credentials are name → value text**, not lists: that is what the Swagger types ([implementation-notes](docs/lld/implementation-notes.md)).
- **Message colours are `text-status-*` and `notice`**, not daisyUI's `text-error`/`alert-soft`: the latter failed WCAG AA contrast in the browser suite.
- **`/users:batch` is sent as `users%3Abatch`** (the SDK's route templates read `:batch` as a parameter); unproven through the gateway.
- **A saved time zone the browser does not know** shows dates in the browser's zone instead of failing the page.

## Testing

| Suite | What it proves |
|---|---|
| `test/unit` | Rules both ways (`rule-paths.test.ts`), value objects, use cases (the signature upload stage by stage), mappers, the problem reader, metrics against the registry and the inventory page, every screen in every state, the layer and SDK rules, the catalogue |
| `test/contract` | Every adapter call against a vendored, SHA-256-pinned copy of the three IAM Swagger files; tripwires for the known gaps |
| `test/integration` | The built `remoteEntry.js` through a shell share scope: only the shell's modules, SRI on every chunk |
| `test/e2e` | The LLD §14 flows through the whole `App` against a fake IAM and fake storage **at the network**, held to the Swagger by the contract harness |
| `test/unit/a11y` | axe-core over every screen and dialog state (WCAG 2.1 A, AA, best practice; not colour contrast) |
| `test/browser` | Chromium: the production standalone page (no CSP violation, routes, narrow width) and, through the dev harness (`dev/harness.tsx`, mock session + fake IAM), every real screen with data, the dialogs, errors, the saved line, the read-only notice and the cropper: WCAG 2.1 A/AA with colour contrast in both themes, no sideways scroll at 360 px |
| `test/smoke` | GET-only (`npm run test:smoke`): the served image or a deployment: SPA rule, `remoteEntry.js` and its integrity, `runtime.json`, headers, exact 404s |

Gate: 95% of statements, branches, functions and lines, every `src/domain` file above 90%, `npm run arch-lint`, `contracts:check`, `npm run budget`.

## What is not proven

The adapters conform to the pinned Swagger but have never met a running IAM service. The remote has been loaded by a real web-shell build in Chromium under the production CSP (web-shell's `test/browser/me.spec.ts`, run with `ME_DIST=../mfe-me/dist`, 2026-11-26; Firefox and WebKit not run), with no IAM data behind it. Screens behind a session are tested in happy-dom (and axe) and, for contrast and layout, in Chromium through the dev harness; the harness has no CSP. The signature upload has not run against a real bucket: the CSP and CORS prerequisites (ADR 0006) are deployment work. Browser tests run in Chromium only.
