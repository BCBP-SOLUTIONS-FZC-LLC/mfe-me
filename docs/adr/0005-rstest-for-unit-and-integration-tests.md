# ADR 0005: Rstest instead of Vitest for unit, integration, contract and e2e tests

## Status

Accepted (carried over from `mfe-admin` ADR 0005, 2026-11-26). A deviation from the constitution, which names Vitest.

## Context

The remote builds with Rsbuild and Rspack. Vitest brings Vite back into the toolchain only to run tests, with a second transform pipeline that can differ from the one that ships.

## Decision

Run tests with Rstest (`@rstest/core`, Istanbul coverage) on happy-dom, with `@testing-library/*` and the same 95% gate (every `src/domain` file above 90%). `happy-dom` is 21.x through `overrides`.

## Consequences

- No Vite in `package-lock.json`. Rstest is 0.x: pin it and upgrade deliberately.
- Under Rstest `import.meta.env.DEV` is a string, a mocked module re-imported after `rs.resetModules()` loses its coverage (so those tests are in files of their own), and a DOM test that copies a `Request` loses its headers (the contract harness reads them from the `fetch` init).
- Other remotes still use Vitest. Revisit if the platform standardises on one runner.
