# ADR 0001: Server state uses TanStack Query

## Status

Accepted (carried over from `mfe-admin` ADR 0001, 2026-11-26).

## Context

The platform constitution makes TanStack Query mandatory for server state. This remote has a real backend from its first commit: my profile, availability, preferences and delegations, a batched profile lookup (`POST /users:batch`, up to 200 IDs, about 60 s cache) for the delegate picker and chips, and writes that must refresh those reads (a new delegation changes my availability and profile).

## Decision

Use TanStack Query for all server state.

- Reads are queries, writes are mutations, and a successful write invalidates the keys it names.
- Query keys come from one place, `src/application/queries/keys.ts` (`meKeys(slug)`), and start with the workspace slug, so a workspace switch cannot show another workspace's data. They live in `application/` (plain arrays) because the feature hooks that use them are presentation and may not import infrastructure.
- HTTP stays in the SDK `ApiClient`; TanStack Query owns caching, de-duplication, retries and invalidation and never calls `fetch`.
- HTTP retries belong to the SDK `ApiClient`, which already retries a safe call (GET, PUT, DELETE) twice on a network fault, a timeout, `429`, `502`, `503` and `504`, honouring `Retry-After`, and never a `409` or `422`. TanStack Query retries nothing (a second layer would multiply the attempts), and mutations are never retried.
- One `QueryClient` per mount of `./App`, made in `app/`, cleared on unmount.
- Only `app/` and `presentation/features/` import TanStack Query (a rule in `test/unit/sdk/dependency-rules.test.ts`; pages reach it through feature hooks, for example `useRefreshDelegations`).
- TanStack Query is bundled in this remote; the shell shares only React and the SDK subpaths.

## Consequences

- No deviation from the constitution to record. The Query cache is private to this remote, so each remote that shows people fetches its own profiles (ADR 0003).
- My profile is read by several parts of a page (the form, the zone, the chip), so its query has a 60 s stale time: one request serves them, and a write refreshes it.
