---
name: gate
description: Run mfe-me's full gate - typecheck, ESLint, arch-lint, the pinned-Swagger check, the unit/integration/contract/e2e tests with the 95% coverage gate, and optionally the production build and the Playwright browser suite - and report every failure at once, with the known causes. Use before telling the user a change is done, or when asked to run the gate, the checks, or CI locally.
disable-model-invocation: true
argument-hint: "[quick|full] [--only typecheck,lint,arch-lint,contracts,test,build,browser]"
---

# Run the gate ($ARGUMENTS)

CLAUDE.md's rule: a change is not done until the gate is green. This runs the checks CI runs, in order of cost, **continuing past a failure** so one run shows everything that is wrong.

1. **Run it:** `bash .claude/skills/gate/scripts/run-gate.sh $ARGUMENTS` (default `quick`; `full` adds `build` and `browser`). Use `--only` to re-run just the steps that failed. The tests take a minute or two; the browser suite needs the build first (the script does it).
2. **Read the summary.** Each step is `✓` or `✗` with a log path; a failure prints the last lines of its log, and the coverage numbers are printed after the tests. Open the log when the tail is not enough.
3. **Fix what failed**, using the known causes below, then re-run only the failed steps with `--only`. Finish with one clean run of the same mode.
4. **Report** to the user: which steps ran, what failed and was fixed, the coverage (statements, branches, functions, lines), and anything you could not run (for example the browser suite when Chromium is missing, or the smoke suite, which needs a served image: `npm run test:smoke`, see `test/smoke/README.md`).

## Known causes

| Step | Symptom | Cause and fix |
|---|---|---|
| typecheck | `TS1294 … erasableSyntaxOnly` | A constructor parameter property (`constructor(private x)`) or an enum: use an explicit field and assignment |
| lint | `no-unused-vars` in a test | A leftover import after editing a test: delete it |
| arch-lint | a violation from `presentation/` | It imports `infrastructure/` or `app/`: take the dependency through the services provider (`presentation/features/services.tsx`), never widen `.dependency-cruiser.cjs` |
| contracts | "does not match the pin" | A Swagger file changed: read the diff, then `npm run contracts:pin` (never edit `PIN.json` by hand) |
| test | `Found multiple elements with the text …` | A redesign added a second element with the same text (a pill beside a table cell, a heading and a legend): scope the query with `within`, or give the new element a distinct name; keep existing accessible names |
| test | `Cannot read properties of null (reading 'useRef')` | A dynamic `import('react-router-dom')` loaded a second React under Rstest: import it statically |
| test | `expected 'local' to be 'prod'` | `import.meta.env.DEV` is stubbed with a string under Rstest: `stubEnv('DEV', '')` for false |
| test | `has no key the source never names` / `… is in X and Y` | The catalogue rules (`test/unit/i18n/catalog.test.ts`): a key must be used (as a literal) and live in one file, prefixed by its screen |
| test | metrics inventory mismatch | `docs/observability/metrics.md` must list every `iam_admin_*` metric with the same labels and help text as `src/infrastructure/telemetry/metrics.ts` |
| test | coverage below 95% (branches usually) | Find the file with `npx rstest run --coverage` and add cases for its uncovered branches; the gate is not lowered |
| build | `remoteEntry.js` does not define `__platform_mfe_me` | The remote build must stay a plain script: no dev client, `splitChunks: { preset: 'none', chunks: 'async' }` (`rsbuild.config.ts`) |
| browser | axe `label-content-name-mismatch` | A control's visible text is not in its accessible name: remove the `aria-label` or include the visible text |
| browser | axe `color-contrast` | Use the `--aura-*-on-soft` / `-ink` tokens for text on tints, never the brand fill colours |
| any | the page loads with an old SDK or old code | A dev server started before an upgrade keeps it in memory: restart it (the gate itself does not use one) |
