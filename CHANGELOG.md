# Changelog

All notable changes to this remote are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html) as [VERSIONING.md](VERSIONING.md) applies it to the runtime contract.

- Each Git tag `vX.Y.Z` has a dated `## [X.Y.Z] - YYYY-MM-DD` section; `release.yml` refuses a tag without one.
- `package.json` `version` matches the latest section.
- A pull request that changes `src/`, dependencies, the `Dockerfile`, `nginx/`, `rsbuild.config.ts` or `index.html` adds a line under `[Unreleased]`.

## [Unreleased]

### Added (2026-11-26)

- Scaffold from `mfe-admin` (LLD §1.1 step 1): container `me` exposing `./App`, dev port 5007, the six routes (`/me`, `availability`, `delegations`, `ai`, `notifications`, `security`) as placeholders, standalone page, layer rules, image, CI.
- Plumbing (LLD §1.1 step 2): query keys, problem map, `iam_me_*` metrics, tracked queries and mutations, shared dialogs and editors, the message catalogue.
- Domain (step 3): entities, value objects (`Instant`, `IanaTimeZone`, `LocaleTag`, `E164Phone`), `me-rules.ts`, the four repository ports, the application ports and one use case per operation plus `UploadSignatureUseCase`. See `docs/lld/implementation-notes.md` for where the Swagger changed the design.
- Adapters (step 4): User Profile, Delegation and Org & Membership (read only) on the SDK client, the presigned-PUT storage adapter (the one `fetch`), `MeOptions` from runtime flags, the browser tools (canvas PNG re-encode, SHA-256, idempotency keys), the three Swagger files vendored and pinned (`contracts:check`, `contracts:pin`), and contract tests with tripwires for the known gaps.
- Screens (step 5): G1 profile (federated override and revert, credentials, My access, signature upload with a cropper and removal), G2 availability, G3 delegations (create, extend, reassign, cancel), G4 AI preferences, G5 notification preferences, G6 security links, and the section tabs in `MeLayout`.
- Hardening (step 6): a fake IAM and storage at the network held to the Swagger, the LLD §14 end-to-end flows, the built-remote integration test, the browser suite (Chromium: CSP, contrast in both themes, routes, 360 px), the image smoke suite, `ARCHITECTURE.md`, ADRs 0001–0006, the constitution assessment and the load-failure runbook. Fixes found on the way: the section tabs from a nested page, an untouched end date in a reassignment, and message and tab colours that failed WCAG AA.
- Dev tooling: `dev/harness.tsx` and the mock IAM (`dev:harness`, `dev:mock-iam`), the harness browser spec, `.claude/` guidance and hooks. Primary buttons darken on hover instead of fading (AA contrast).
