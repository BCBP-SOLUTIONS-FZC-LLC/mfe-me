# Frontend Architecture Constitution: assessment (mfe-me)

Assessment of `mfe-me` against the Frontend Architecture Constitution 1.0, as of 2026-11-26. It is built to the constitution from the first commit, so there is no migration: this records where it complies, the deviations (with their ADRs), and what is still open. It follows `mfe-admin`'s assessment, which it was scaffolded from.

## 1. Assessment

| Constitution section | State | Where |
|---|---|---|
| Domain ownership (bounded context) | Compliant: owns the member's own IAM screens; rules are re-checked by the services and the UI never grants more; it never acts on another user | LLD §2, §8 |
| Required project structure | **Compliant with recorded deviations**: the six layers and every required folder that holds code; eight folders are absent with their content's home (`widgets`, `commands`, `services`, `auth`, `storage`, `shared/ui`, `types`, `utilities`) and `tests/` is `test/` at the root. Checked by a test | ADR 0007, `structure.test.ts` |
| Layers and dependency rules | Compliant and enforced: `npm run arch-lint`, `layers.test.ts`; domain and application are free of React, the SDK and browser APIs | `.dependency-cruiser.cjs` |
| Presentation, application, domain, infrastructure | Compliant: pages call feature hooks, which call use cases (ADR 0004); rules in the domain; adapters in infrastructure; presentation imports no infrastructure | ARCHITECTURE.md |
| Server state: TanStack Query | Compliant (no deviation) | ADR 0001 |
| Client state: Zustand | **Approved deviation** (carried over): React state and the URL | ADR 0002 |
| Shared cross-MFE state from the shell | Compliant: user, permissions, session context, read-only and workspace come from SDK hooks and are not copied | LLD §5 |
| API access through repositories | Compliant: four domain ports, an HTTP adapter each on the SDK `ApiClient`, contract-tested against the pinned Swagger. One justified exception: the presigned PUT to storage | ADR 0006, `test/contract` |
| Runtime configuration | Compliant: nothing environment-specific is compiled in; the lists the environment decides are runtime flags | LLD §12 |
| Module Federation, runtime-configurable remote | Compliant: manifest entry with SRI, `ownerDomain: iam`, the SDK taken from the shell, ten SDK subpaths shared (auth, config, core, i18n, logging, metrics, nav, problem, react, security) | LLD §4, `test/integration` |
| Authentication centralised in the shell | Compliant: no token, cookie or identity header is seen or sent; the storage PUT carries none | LLD §13 |
| Shared libraries: no domain logic shared | Compliant today; the identity components are interim copies | ADR 0003 |
| Design system | **Interim deviation** (carried over): Tailwind and daisyUI with the Aura tokens | ADR 0003 |
| Testing standards | **Approved deviation** (carried over): Rstest instead of Vitest. Otherwise compliant: unit, contract, integration, e2e, axe, browser and smoke suites, a 95% gate, domain files above 90% | ADR 0005 |
| Accessibility (WCAG 2.1 AA) | Verified with axe for every screen and dialog state in happy-dom, and in Chromium for the standalone page and the message and control styles, colour contrast included in both themes; no real-session browser run | `test/unit/a11y`, `test/browser` |
| Observability standard | Compliant: five Tier 3 `iam_me_*` metrics through the SDK, validated against the registry and the inventory page in CI | docs/observability/metrics.md |
| Security | Compliant: strict origin check and no credentials on the one cross-origin request, image re-encoded in the browser, no HTML injection, CSP-clean | ADR 0006, LLD §13 |

The other required outputs (target diagram, folder restructuring plan, dependency cleanup plan, migration roadmap) are in [refactoring-plan.md](refactoring-plan.md).

## 2. Violations

None open. Accepted and recorded: Zustand (ADR 0002), the design system (ADR 0003), Vitest (ADR 0005) and the folder mapping (ADR 0007). Proposed: the one raw `fetch` (ADR 0006). The i18n framework is the SDK's (`useT`, `registerNamespace`), the platform's own localisation framework, rather than i18next; every user-facing string is a catalogue key.

## 3. Follow-ups

1. **Signature upload prerequisites** (LLD §15 #3): bucket origin in the platform CSP's `connect-src`, a CORS rule on the bucket, and the `me.signature.uploadOrigins` flag; or an SDK helper that replaces the raw `fetch`.
2. **The joint browser test** (LLD §15 #16): done in Chromium (web-shell `me.spec.ts`, `ME_DIST`, and `me` on port 5007 in its local config); Firefox and WebKit are not run, and the fake IAM there serves no profile data.
3. **IAM answers** the screens wait on: no read of my signature (#4), delegation history and ended reasons (#5), the delegation scope codes and limits (#6), a version on notification preferences (#10), what "revert to directory value" restores and when (#11), the lazy profile after sign-up (#12).
4. **Account console deep links** (LLD §15 #13): every G6 card opens the console root until the Keycloak version's paths are confirmed.
5. **The shared identity package** and a design system when published (ADR 0003).
6. **Read-only grace** (LLD §15 #15): whether a member may set out-of-office or delegate during the 30-day read-only period.
7. **Browser coverage:** Chromium only.
