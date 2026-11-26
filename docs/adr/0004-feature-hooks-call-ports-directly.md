# ADR 0004: Use cases in the application layer; hooks call `execute()`

## Status

Accepted (carried over from `mfe-admin` ADR 0004, 2026-11-26). The file name is kept so the ADR numbers match across the siblings.

## Context

The constitution has presentation call use cases, not repositories, and the application layer own them.

## Decision

- `src/application/use-cases/` has one class per repository-port operation (19: for example `UpdateUserProfileUseCase`, `CreateDelegationUseCase`, `ListMembersUseCase`), each built over a `Pick<Port, 'method'>`, plus `UploadSignatureUseCase`, which does real work (check the file, re-encode it, hash it, presign, put, confirm) and reports the stage it failed at. They have no React, SDK or browser imports (arch-lint and `layers.test.ts` enforce it).
- `createUseCases(repositories, tools)` builds them; `useMeUseCases()` builds them from the injected services once per services object.
- Feature hooks call `useCases.<name>.execute(...)`; they never touch a port. Business rules stay in `domain/rules/me-rules.ts` and run before a write, in the hook or the page that builds the request.
- `test/unit/application/use-cases.test.ts` fails if a port operation has no use case or one does not forward its arguments.

## Consequences

- Hooks do not know which port an operation lives on. Most use cases are pass-through; orchestration goes there (the signature upload is the first), not in hooks.
- A new port operation needs a use case file and a line in `createUseCases`.
