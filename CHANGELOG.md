# Changelog

All notable changes to this remote are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html) as [VERSIONING.md](VERSIONING.md) applies it to the runtime contract.

- Each Git tag `vX.Y.Z` has a dated `## [X.Y.Z] - YYYY-MM-DD` section; `release.yml` refuses a tag without one.
- `package.json` `version` matches the latest section.
- A pull request that changes `src/`, dependencies, the `Dockerfile`, `nginx/`, `rsbuild.config.ts` or `index.html` adds a line under `[Unreleased]`.

## [Unreleased]

### Changed (2026-11-28 — input fields)

- Input, select and textarea fields have no background fill, and their placeholder text is lighter.

### Changed (2026-11-27 — cards as in the product reference)

- **Card headers as in mfe-admin's audit log:** `cardHeader` and `cardTitle` in `src/presentation/components/styles.ts` (a transparent header with a faint rule under it, `px-5 py-4`, the title bold at `text-base`); My account's cards (Profile, My access, Availability, Signature) use them, with the card's body in its own `p-5` block under the header. *(Previously: a `text-lg` title inside the card's padding, no rule.)*
- **Inter only:** `font-sans` in `tailwind.config.js` is `Inter Variable` then the system fonts, and `@fontsource-variable/geist` is removed (`package.json`, `package-lock.json`, the import in `main.tsx`), as in web-shell, so the remote draws in the same typeface standalone and inside the shell.
- **Cards have no border and the reference's soft shadow:** `card` in `src/presentation/components/styles.ts` is `rounded-[18px] border border-white/70 bg-aura-surface shadow-dash` (the reference's faint white edge) (it was `rounded-xl` with a `border-aura-border` border), and `shadow-dash` in `tailwind.config.js` is `0 10px 30px rgba(30,27,75,.06), 0 2px 6px rgba(30,27,75,.04)`. The same change as mfe-admin's, so the two remotes' cards match. The notices (`.notice`, e.g. "We couldn't load your availability") are cards too: the reference's shadow, 18px corners and white edge in place of the grey border, and they keep their coloured edge.

### Added (2026-11-26)

- Scaffold from `mfe-admin` (LLD §1.1 step 1): container `me` exposing `./App`, dev port 5007, the six routes (`/me`, `availability`, `delegations`, `ai`, `notifications`, `security`) as placeholders, standalone page, layer rules, image, CI.
- Plumbing (LLD §1.1 step 2): query keys, problem map, `iam_me_*` metrics, tracked queries and mutations, shared dialogs and editors, the message catalogue.
- Domain (step 3): entities, value objects (`Instant`, `IanaTimeZone`, `LocaleTag`, `E164Phone`), `me-rules.ts`, the four repository ports, the application ports and one use case per operation plus `UploadSignatureUseCase`. See `docs/lld/implementation-notes.md` for where the Swagger changed the design.
- Adapters (step 4): User Profile, Delegation and Org & Membership (read only) on the SDK client, the presigned-PUT storage adapter (the one `fetch`), `MeOptions` from runtime flags, the browser tools (canvas PNG re-encode, SHA-256, idempotency keys), the three Swagger files vendored and pinned (`contracts:check`, `contracts:pin`), and contract tests with tripwires for the known gaps.
- Screens (step 5): G1 profile (federated override and revert, credentials, My access, signature upload with a cropper and removal), G2 availability, G3 delegations (create, extend, reassign, cancel), G4 AI preferences, G5 notification preferences, G6 security links, and the section tabs in `MeLayout`.
- Hardening (step 6): a fake IAM and storage at the network held to the Swagger, the LLD §14 end-to-end flows, the built-remote integration test, the browser suite (Chromium: CSP, contrast in both themes, routes, 360 px), the image smoke suite, `ARCHITECTURE.md`, ADRs 0001–0006, the constitution assessment and the load-failure runbook. Fixes found on the way: the section tabs from a nested page, an untouched end date in a reassignment, and message and tab colours that failed WCAG AA.
- Dev tooling: `dev/harness.tsx` and the mock IAM (`dev:harness`, `dev:mock-iam`), the harness browser spec, `.claude/` guidance and hooks. Primary buttons darken on hover instead of fading (AA contrast).
