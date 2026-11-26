# ADR 0003: Interim UI: Tailwind and daisyUI, and local identity components until the shared package exists

## Status

Accepted (carried over from `mfe-admin` ADR 0003, 2026-11-26). Interim: superseded when `platform-design-system` and the shared identity package are published.

## Context

- There is no published design system, so the sibling remotes use Tailwind 4 with daisyUI 5 and the Aura tokens; so does this one.
- The user chip, department label and member picker are needed by this remote, `mfe-admin`, `mfe-tender` and `mfe-dashboard` (`mfe-admin` LLD §15 #5). The decision is that they move to a common package before they are built a fourth time. It does not exist, and its name, home and owner are not set.

## Decision

- Use Tailwind and daisyUI with the sibling's conventions, and the Aura tokens in `src/app/styles`.
- Keep the identity pieces (`UserChip`, `Avatar`, `AvailabilityDot`, `DepartmentLabel`, `MemberPicker` and the hooks `useUserProfiles`, `useDepartmentDirectory`, `useMemberList` behind them) in `presentation/components/identity/` and `presentation/features/identity/`, written against the data they need and nothing else. They are the only code that moves when the shared package arrives.
- Message text uses the Aura message inks (`text-status-error`, `-warning`, `-success`) and the `notice` classes, not daisyUI's `text-error` or `alert-soft`: daisyUI's own colours did not reach WCAG AA on the Aura surfaces (found by `test/browser`).

## Consequences

- Each remote that shows people still has its own copy and Query cache until the package is adopted.
- Replacing them is a change of imports in those folders, not a redesign. `MemberPicker` lists the loaded pages and filters them by name (P-4 has no server-side search, IAM-FE-Q5).
