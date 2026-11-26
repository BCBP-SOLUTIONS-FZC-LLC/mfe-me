# ADR 0007: How the Constitution's folder structure maps onto this remote

## Status

Accepted (2026-11-26). Records the deviations from "Required Project Structure"; checked by `test/unit/architecture/structure.test.ts`.

## Context

The Constitution lists a folder tree for `src/`. This remote has the six layers and most of the folders, and was built before that tree was checked against it folder by folder. Creating a folder with nothing in it satisfies the list and helps nobody; moving working code to match a name risks breaking changes the Constitution also asks us to minimise.

## Decision

Every required folder either exists with real code in it or is in the table below with where its content lives and why.

| Constitution folder | Here | Why |
|---|---|---|
| `app/{bootstrap,providers,routes}` | Same, plus `layouts/` and `styles/` | |
| `presentation/{pages,features,components}` | Same | |
| `presentation/widgets` | **Absent.** Page parts live in a folder per page (`pages/profile`, `pages/delegations`, …) | No part is reused across pages; a widget folder would hold nothing. Add one when a second page needs the same composed block |
| `application/use-cases` | Same | |
| `application/commands` | **Absent.** A write is a use case plus a rule in `domain/rules` that plans its request | A separate command object would only wrap the request the rule already returns |
| `application/queries` | `queries/` holds the query **keys** and `userBatcher` | Reads are use cases (`List…`, `Get…`) |
| `application/services` | **Absent.** Cross-cutting helpers are ports (`ports/`) with an implementation in infrastructure | No application service has more than one caller |
| `domain/{entities,value-objects,repositories,events,rules}` | Same | `vocabulary.ts` holds the wire codes as data |
| `infrastructure/{api,configuration,telemetry,federation}` | Same | |
| `infrastructure/auth` | **Absent.** Authentication is the shell's (SDK in web-shell); this remote sees no token | The Constitution makes login, tokens and refresh the shell's |
| `infrastructure/storage` | **Absent.** The remote stores nothing in the browser (LLD §10) | Raw storage is lint-banned; there is nothing to implement |
| `infrastructure/browser` | **Added**: canvas image re-encode, `crypto.subtle`, idempotency keys, the clock | Browser APIs are only allowed in infrastructure |
| `shared/{hooks,constants}` | Same | |
| `shared/ui` | **Absent.** Shared components live in `presentation/components` | They depend on the SDK's hooks, which `shared/` may not; UI primitives are meant to come from the design system (ADR 0003) |
| `shared/types`, `shared/utilities` (`types`, `utilities`) | **Absent** | No type or utility is shared across layers; the domain owns its types |
| `tests/` inside `src/` | `test/` at the repository root | The build, lint and coverage globs treat `src/` as shipped code; tests are not shipped |

## Consequences

- No code moves and nothing breaks. The folder test fails if a required folder is neither present nor listed here, or if a listed absent folder appears (then this ADR is updated in the same change).
- New folders follow the table: for example a first widget creates `presentation/widgets` and removes its row.
