# Operations

## Commands

| Command | What |
|---|---|
| `npm ci` | Needs `NODE_AUTH_TOKEN` (`gh auth refresh -s read:packages`; `export NODE_AUTH_TOKEN=$(gh auth token)`) |
| `npm run dev` / `preview` | Rsbuild on :5007 (`/config/runtime.json` from `config/runtime.local.json`); HMR and live reload are off so `remoteEntry.js` stays a plain script |
| `npm run dev:harness` | `ME_HARNESS=1`: `/harness.html` (or `/t/acme/me/...`) with a mock session and the fake IAM; a toolbar sets role, read-only, seats, a covering member and large audits |
| `npm run dev:mock-iam` | `dev/mock-iam/server.ts` on :5090 (`MOCK_IAM_PORT`): the fake IAM (`dev/mock-iam/core.ts`, also used by the e2e tests and the harness) as web-shell's upstream. In web-shell: `DEV_API_URL=http://localhost:5090` |
| `npm run lint` / `npx tsc --noEmit` / `build` | ESLint (platform rules) / typecheck of `src/` / `tsc`, clean `dist/`, `rsbuild build`, `config/remote-manifest-entry.mjs` |
| `npm run arch-lint` | dependency-cruiser over `src/` with `.dependency-cruiser.cjs` (layers, vendors) |
| `npm test`, `test:unit`, `test:integration`, `test:contract`, `test:e2e` | Rstest (all, or one folder) |
| `npm run test:ci` | Coverage (Istanbul) + `.github/scripts/coverage-gate.mjs`: 95% on statements, branches, functions and lines, every `src/domain/` file above 90% |
| `npm run contracts:check` / `contracts:pin` | The pinned IAM Swagger files against `test/contract/swagger/PIN.json` / re-pin after reading the diff |
| `npm run budget` | `.github/scripts/bundle-budget.mjs` over `dist/` after a build: gzip budgets for `remoteEntry.js`, the remote's JS, the standalone entry, the largest file, CSS and images. Raise a limit only on purpose, with a CHANGELOG line |
| `npm run test:browser` | `npm run build`, then Playwright (Chromium) on `rsbuild preview` :5013: routes, CSP, axe in both themes, a narrow width |
| `npm run test:smoke` | `SMOKE_BASE_URL=http://127.0.0.1:<port>` after `docker run -p 127.0.0.1:<port>:8080 <image>`; `SMOKE_MODE=live` for a deployment, with `ENVIRONMENT=<target>` as the deploy check (`test/smoke/README.md`) |
| `npm run hooks:install` | `.githooks/pre-commit` (env files, workflow hygiene, digest pin, `tsc --noEmit`) |

Image locally: `docker build --secret id=npm_token,env=NODE_AUTH_TOKEN -t mfe-me:local .` Keycloak owns host :8080, so map the image elsewhere (`-p 18080:8080`).

## CI (`ci.yml`)

| Job | Gate |
|---|---|
| `Validate / Test / test` | `npm ci`, coverage, gate 95%, build, bundle budget |
| `Validate / Quality / quality` | ESLint, `arch-lint`, workflow LF and literal operators, digest pins, `.dockerignore`, `npm audit --omit=dev` |
| `Browser (Playwright, axe)` | `npm run test:browser` |
| `Build image (cache)` | Hadolint, Buildx build into the cache (secret `npm_token`; not loaded) |
| `Trivy CVE scan` | Unfixed CRITICAL/HIGH fail; `.trivyignore` with reason and expiry |
| `Smoke tests` | Loads the cached image as `mfe-me-ci-test`, Node 26 + `npm ci`, then `smoke-tests.sh`: size, `/healthz`, the container global, no source maps, a nested route, then `npm run test:smoke` (image mode) |
| `PR summary` / `Push image → GHCR` | Comment on PRs / `main`: GHCR tags, Cosign |
| `changelog` | `CHANGELOG.md` when `src/`, dependencies, the `Dockerfile`, `nginx/`, `rsbuild.config.ts` or `index.html` change |

Registry: every `npm ci` uses a token with `packages: read` (`NODE_AUTH_TOKEN`). A 403 `read_package` means the package's "Manage Actions access" lacks this repository.

## Release

`package.json` `version` matches the latest `## [X.Y.Z]` section of `CHANGELOG.md`; `release.yml` refuses a tag without one and uses its text as the release notes. The release is the image and the `dist` tarball; nothing is published to npm. Each environment's deploy copies `dist/remote-manifest-entry.json`'s object into its manifest and makes `entry` absolute (`https://<cdn>/remotes/admin/<version>/remoteEntry.js`); the origin goes into the shell's `remotes.allowedOrigins` when cross-origin.

## SDK upgrade checklist

Use `/sdk-upgrade <version>`. All three packages to one exact version, the SDK peer range `^<version>`; **never newer than web-shell's** (upgrade the shell first; web-shell's CHANGELOG says what it serves). Then lint, arch-lint, typecheck, `test:ci`, `build`, `test:browser`; load the build in the real shell (`dev:mock-iam` + web-shell's `npm run dev`) and open each section; docs and a CHANGELOG entry.

## Claude Code settings and hooks

`.claude/settings.json` registers three hooks:
- `hooks/guard.sh` (PreToolUse, before an edit): blocks `../web-shell`, `../mfe-dashboard`, `platform-reactcommon`, `node_modules/`, `dist/`, `coverage/`, `test-results/`, `.env` / `docker.local.env`, and the pinned `test/contract/swagger/*.yaml` and `PIN.json`. Paths are compared canonically (`..`, symlinks, case). Exit 2 shows the reason.
- `hooks/post-edit.sh` (PostToolUse, after an edit): ESLint on `*.ts|tsx|mjs|js`, and arch-lint on `src/**`; `check-sdk-pins.mjs` on `package.json` (exact pins, one version, peer at that version); `check-locales.mjs` on the locale files (valid JSON, no key in two files).

- `hooks/stop-gate.sh` (Stop, when Claude is about to end a turn): only if `src/` or `test/` changed in the last day, runs `tsc --noEmit` and arch-lint; and checks `CHANGELOG.md` is newer than every file under `src/`, `Dockerfile`, `nginx/`, `rsbuild.config.ts`, `index.html`, `package.json` (what `changelog-check.yml` watches). It is a timestamp check, so a file rewritten with the same content also asks for a line, or an explicit "none needed". A problem blocks the stop once with the reason; `stop_hook_active` stops it looping.

Runbook: [`docs/runbooks/remote-load-failure.md`](../docs/runbooks/remote-load-failure.md) (the My account area does not load in web-shell).

Subagents (`agents/`): `invariant-reviewer` (code invariants), `doc-sync-reviewer` (docs against code), `a11y-reviewer` (WCAG 2.1 AA, names, focus, contrast tokens), `contract-reviewer` (adapters, mappers and fakes against the pinned Swagger); pass each a diff file. Skills (`skills/`): `gate` (`scripts/run-gate.sh quick|full [--only …]`: typecheck, lint, arch-lint, contracts, tests with the coverage gate, and for `full` the build and Playwright; logs in a temp directory), `new-screen` (`scripts/scaffold.mjs`: page, feature hook, locale file and test, refusing to overwrite; the wiring is the checklist in its SKILL.md), `sdk-upgrade`, `stack-sync`. `settings.local.json` (untracked) holds a developer's own permissions.
