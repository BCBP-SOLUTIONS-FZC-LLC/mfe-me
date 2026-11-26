# mfe-me

Micro-frontend remote (`me`) for the Tender Management platform's personal area ("My account"): profile and signature, availability, delegations, AI and notification preferences, and security. Built on the platform SDK, loaded by web-shell at `/t/<slug>/me/*`.

**Status:** not released. Screens G1–G6 are built and tested; see [ARCHITECTURE.md](ARCHITECTURE.md) for the structure and what is not proven, the [LLD](docs/lld/mfe-me-lld.md) for the design, and [implementation-notes](docs/lld/implementation-notes.md) for where the build departs from it.

## Develop

```sh
export NODE_AUTH_TOKEN=$(gh auth token)   # @bcbp-solutions-fzc-llc/* packages come from GitHub Packages
npm install
npm run dev            # http://localhost:5007 (remoteEntry.js and the standalone page)
```

| Command | What it runs |
|---|---|
| `npm test` / `npm run test:ci` | unit, contract, integration and e2e tests (`test:ci` adds the 95% coverage gate) |
| `npm run lint`, `npm run arch-lint` | ESLint (platform rules) and the layer rules |
| `npm run contracts:check` | the vendored IAM Swagger files against their pin (`contracts:pin` after reading a diff) |
| `npm run build`, `npm run budget` | the remote and standalone build; the bundle budget |
| `npm run dev:harness` / `dev:mock-iam` | the app with a mock session and a fake IAM in the browser; the same fake IAM over HTTP for web-shell (`DEV_API_URL=http://localhost:5090`) |
| `npm run test:browser` | the built standalone page and the harness screens in Chromium (contrast, routes, 360 px) |
| `npm run test:smoke` | GET-only checks against a running image or deployment (`test/smoke/README.md`) |

## Configuration

Nothing environment-specific is compiled in. Each environment's `/config/runtime.json` carries the platform settings and these flags (comma-separated):

- `me.ai.models`: the AI models a member may pick (G4);
- `me.notifications.eventTypes`: the notification event types (G5);
- `me.signature.uploadOrigins`: the exact https origins a signature upload may go to (G1); empty hides Upload.
