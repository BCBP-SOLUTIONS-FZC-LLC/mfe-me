---
name: new-screen
description: Scaffold a new My account screen as a full vertical slice (page, feature hook, rule, catalogue, tests, harness entry). Use when the user asks to add a screen or section to mfe-me.
disable-model-invocation: true
argument-hint: <screen-name> (e.g. "preferences-export")
---

Add a screen named `$ARGUMENTS` to mfe-me. Read `.claude/CLAUDE.md` and `ARCHITECTURE.md` first; follow an existing screen (G4 `AiPreferencesPage` is the smallest). Do every step, in order, and stop to ask if the IAM route it needs is not in the pinned Swagger (`test/contract/swagger`): **never invent an endpoint, field or error code**.

1. **Contract**: find the operations in the Swagger. Add the port method (`domain/repositories`), the adapter call and mapper (`infrastructure/api`), and a case in `test/contract/adapters.contract.test.ts`; add any error code to `MESSAGE_KEYS` in `problem.ts` and `errors.contract.test.ts`.
2. **Domain**: entities, and a `plan…` rule in `domain/rules/me-rules.ts` that validates only what the user changed. Add both-path tests to `test/unit/domain/rule-paths.test.ts`.
3. **Application**: a use case class per port operation, and its line in `createUseCases` (`use-cases.test.ts` fails otherwise).
4. **Presentation**: a query key in `application/queries/keys.ts`; a feature hook in `presentation/features/<name>/` using `useTrackedQuery`/`useTrackedMutation` (add the `resource` and `action` values to `domain/events/me-events.ts` **and** `docs/observability/metrics.md`); the page in `presentation/pages/`, using `ReadOnlyNotice`, `Field`, `ConflictDialog`, `LoadFailed`, `SavedNotice`. Key the form by a "generation", not the version.
5. **Route and nav**: a route with `useRouteTemplate` in `app/routes/index.tsx` and a tab in `app/layouts/MeLayout.tsx` (`TABS`, `nav.*` key).
6. **Catalogue**: `locales/en/<name>.json` keyed `<name>.*`, registered in `messages.ts`. No hard-coded text; never show a server `detail`.
7. **Tests**: page tests (loaded, empty, error, conflict, read-only) with `renderPage` and `createFakeIam`; an axe state in `test/unit/a11y/screens.test.tsx`; an e2e flow and the fake route in `dev/mock-iam/core.ts`; a harness query option if it needs seeded data.
8. **Docs**: `CHANGELOG.md` `[Unreleased]`, `docs/lld/implementation-notes.md` for anything that departs from the LLD.
9. Run `/gate full`. Report what ran and what failed; do not claim a pass you did not see.
